import 'server-only'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { registrarAudit } from '@/lib/audit'
import { invalidarRelatorios } from '@/lib/cache/relatorio-cache'
import { ehProdutoPassaporte } from '@/lib/integracoes/normalizar-mapa'
import { propagarGrupoAosBancos } from '@/lib/simulado/propagar-grupo'
import { configDoEnv, listarMembrosDoGrupo, detalheMembro, type CurseducaCfg, type MembroCurseduca, type DetalheMembro } from '@/lib/curseduca/client'
import type { DestinoImport, ResultadoImportCurseduca } from '@/lib/curseduca/tipos'
import { descriptografar } from '@/lib/crypto'

/**
 * Núcleo do import da Curseduca — server-only, NÃO 'use server' (não vira endpoint RPC).
 * Usado pela action interativa (com checagem de permissão) E pela rota do job em segundo plano.
 * Manter fora de 'use server' é essencial: `executarImport` recebe tenant/cfg por parâmetro e,
 * se exposto como server action, permitiria escrita cross-tenant / vazamento de credenciais.
 */

/** True se o .env global pode ser usado por ESTE tenant (só o tenant designado). */
export function envAplicaAoTenant(tenantId: string): boolean {
  const alvo = process.env.CURSEDUCA_ENV_TENANT_ID
  return !!alvo && alvo === tenantId && !!configDoEnv()
}

/**
 * Credenciais da Curseduca DO TENANT (tabela simulado_curseduca_config).
 * IMPORTANTE (multi-empresa): o fallback global (.env) NÃO é aplicado automaticamente —
 * senão uma empresa sem credenciais próprias usaria, por engano, a conta global de outra
 * (risco de corromper/errar). O .env só vale para o tenant explicitamente designado em
 * `CURSEDUCA_ENV_TENANT_ID`. Sem isso, cada empresa DEVE ter sua config no banco.
 */
export async function resolverCfg(tenantId: string): Promise<CurseducaCfg | null> {
  const svc = createAdminClient()
  // 1) NOVO sistema de Integrações (simulado_integracao_config) — todas as credenciais criptografadas.
  try {
    const { data } = await svc
      .from('simulado_integracao_config')
      .select('base_url, credenciais, ativo')
      .eq('tenant_id', tenantId).eq('provider', 'curseduca')
      .maybeSingle()
    const d = data as any
    const c = d?.credenciais
    if (d?.ativo && c?.api_key && c?.usuario && c?.senha) {
      return { base: d.base_url || 'https://prof.curseduca.pro', apiKey: descriptografar(c.api_key) ?? '', user: descriptografar(c.usuario) ?? '', pass: descriptografar(c.senha) ?? '' }
    }
  } catch { /* tabela pode não existir ainda → tenta legado/env */ }
  // 2) LEGADO (simulado_curseduca_config).
  try {
    const { data } = await svc
      .from('simulado_curseduca_config')
      .select('base_url, api_key, usuario, senha, ativo')
      .eq('tenant_id', tenantId)
      .maybeSingle()
    const d = data as any
    if (d && d.ativo && d.api_key && d.usuario && d.senha) {
      return { base: d.base_url || 'https://prof.curseduca.pro', apiKey: descriptografar(d.api_key) ?? '', user: d.usuario, pass: descriptografar(d.senha) ?? '' }
    }
  } catch { /* tabela pode não existir ainda → tenta o env designado */ }
  // 3) .env (só o tenant designado).
  return envAplicaAoTenant(tenantId) ? configDoEnv() : null
}

/**
 * Núcleo do import — reutilizado pela action interativa e pelo JOB em segundo plano.
 * `limiteDetalhe`: teto de buscas de detalhe por execução (interativo = 400 p/ não estourar
 * o timeout da request; job em segundo plano = Infinity, pois roda sem esse limite).
 */
export async function executarImport(
  g: { tenantId: string; cfg: CurseducaCfg },
  ids: number[], destino: DestinoImport, sincronizar: boolean, limiteDetalhe: number,
): Promise<ResultadoImportCurseduca> {
  const svc = createAdminClient()

  try {
    // 1) Coleta os membros de todos os grupos (dedupe entre grupos pelo id da Curseduca).
    const porId = new Map<number, MembroCurseduca>()
    for (const gid of ids) for (const m of await listarMembrosDoGrupo(g.cfg, gid)) if (!porId.has(m.id)) porId.set(m.id, m)
    // Ignora contas de SISTEMA da Curseduca (ex.: apps@/contato@curseduca.com) que são membros
    // de vários canais e apareciam em "todos os grupos". Real aluno nunca usa o domínio da Curseduca.
    const ehContaSistema = (m: MembroCurseduca) => /@curseduca\.com$/i.test((m.email ?? '').trim().toLowerCase())
    const membros = [...porId.values()].filter((m) => !ehContaSistema(m))
    const total = membros.length

    // 2) Quem já existe no sistema (por matrícula Curseduca, e-mail ou CPF).
    // PAGINA com fetchAll: com >1000 estudantes o PostgREST cortaria em ~1000 e alunos além
    // disso não seriam reconhecidos → o import criaria DUPLICATAS de quem já existe.
    const existentes = await fetchAll<any>(() =>
      svc.from('simulado_estudantes').select('id, email, cpf, telefone, classificacao, matricula_externa').eq('tenant_id', g.tenantId).eq('deletado', false).order('id', { ascending: true }))
    const porEmail = new Map<string, string>(), porCpf = new Map<string, string>(), porExt = new Map<string, string>()
    const recPorId = new Map<string, any>()
    for (const e of existentes ?? []) {
      recPorId.set((e as any).id, e)
      if ((e as any).email) porEmail.set(String((e as any).email).toLowerCase(), (e as any).id)
      if ((e as any).cpf) porCpf.set(String((e as any).cpf).replace(/\D/g, ''), (e as any).id)
      if ((e as any).matricula_externa) porExt.set(String((e as any).matricula_externa), (e as any).id)
    }
    const acharExistente = (m: MembroCurseduca) =>
      porExt.get(String(m.id)) || (m.email ? porEmail.get(m.email) : null) || (m.cpf ? porCpf.get(m.cpf) : null) || null

    // Classificação: se o aluno está em algum grupo de "Passaporte/Passe" → passaporte; senão normal (assinatura).
    // Passaporte se estiver em ALGUM grupo passaporte real (exclui amostra/grátis) — mesma regra da Guru.
    const classificar = (nomes: string[]): string => (nomes.some((n) => ehProdutoPassaporte(n)) ? 'passaporte' : 'normal')

    // 3) Separa novos × existentes. Já existentes SEM CPF/telefone entram no backfill.
    const idsResolvidos: string[] = []
    let novos = 0, jaExistiam = 0, semIdentificador = 0
    const novosMembros: MembroCurseduca[] = []
    const paraBackfill: { estudanteId: string; curseducaId: number }[] = []
    for (const m of membros) {
      const ex = acharExistente(m)
      if (ex) {
        idsResolvidos.push(ex); jaExistiam++
        const rec = recPorId.get(ex)
        if (rec && (!rec.cpf || !rec.telefone || !rec.classificacao)) paraBackfill.push({ estudanteId: ex, curseducaId: m.id })
        continue
      }
      if (!m.email) { semIdentificador++; continue } // sem e-mail → não dá pra cadastrar (a lista não traz CPF)
      novosMembros.push(m)
    }

    // Orçamento de buscas de DETALHE por execução — evita timeout da server action em grupos grandes.
    // O que passar do limite entra com dados básicos (contado em `restante`); reimportar completa via backfill.
    let usadosDetalhe = 0
    let restante = 0 // membros que ficaram sem detalhe por causa do limite (não é falha da API)

    // 3b) Enriquece os novos com o DETALHE de cada membro (CPF, telefone, grupos → classificação).
    let semDetalhe = 0 // detalhes que FALHARAM (ex.: rate limit) → CPF/telefone podem faltar
    const detalhePorId = new Map<number, DetalheMembro>()
    for (let i = 0; i < novosMembros.length && usadosDetalhe < limiteDetalhe; i += 8) {
      const bloco = novosMembros.slice(i, i + 8)
      usadosDetalhe += bloco.length
      const res = await Promise.all(bloco.map((m) => detalheMembro(g.cfg, m.id)))
      bloco.forEach((m, k) => { detalhePorId.set(m.id, res[k]); if (!res[k].ok) semDetalhe++ })
    }
    restante += Math.max(0, novosMembros.length - detalhePorId.size)

    // 3c) Backfill: preenche CPF/telefone/classificação de quem já existia mas estava vazio.
    let atualizados = 0
    for (let i = 0; i < paraBackfill.length && usadosDetalhe < limiteDetalhe; i += 8) {
      const bloco = paraBackfill.slice(i, i + 8)
      usadosDetalhe += bloco.length
      const res = await Promise.all(bloco.map((b) => detalheMembro(g.cfg, b.curseducaId)))
      for (let k = 0; k < bloco.length; k++) {
        const rec = recPorId.get(bloco[k].estudanteId); const d = res[k]; const patch: Record<string, unknown> = {}
        if (!d.ok) semDetalhe++
        if (!rec?.cpf && d.cpf) patch.cpf = d.cpf
        if (!rec?.telefone && d.telefone) patch.telefone = d.telefone
        if (!rec?.classificacao) patch.classificacao = classificar(d.gruposNomes)
        if (Object.keys(patch).length) {
          const { error } = await svc.from('simulado_estudantes').update(patch).eq('id', bloco[k].estudanteId).eq('tenant_id', g.tenantId)
          if (!error) atualizados++
        }
      }
    }

    const paraInserir: Record<string, unknown>[] = novosMembros.map((m) => {
      const d = detalhePorId.get(m.id)
      return {
        tenant_id: g.tenantId, user_id: null,
        nome: m.nome || m.email || 'Aluno', email: m.email,
        cpf: m.cpf ?? d?.cpf ?? null,
        telefone: m.telefone ?? d?.telefone ?? null,
        classificacao: classificar(d?.gruposNomes ?? []),
        matricula_externa: String(m.id),
      }
    })

    for (let i = 0; i < paraInserir.length; i += 200) {
      const lote = paraInserir.slice(i, i + 200)
      const { data, error } = await svc.from('simulado_estudantes').insert(lote).select('id')
      if (!error && data) { idsResolvidos.push(...data.map((r: any) => r.id)); novos += data.length; continue }
      // Lote falhou (ex.: conflito de e-mail/CPF) → insere um a um, pulando/vinculando conflitos.
      for (const row of lote) {
        const { data: d1, error: e1 } = await svc.from('simulado_estudantes').insert(row).select('id').single()
        if (!e1 && d1) { idsResolvidos.push((d1 as any).id); novos++; continue }
        let found: string | null = null
        if (row.email) { const { data: f } = await svc.from('simulado_estudantes').select('id').eq('tenant_id', g.tenantId).eq('email', row.email as string).eq('deletado', false).maybeSingle(); found = (f as any)?.id ?? null }
        if (!found && row.cpf) { const { data: f } = await svc.from('simulado_estudantes').select('id').eq('tenant_id', g.tenantId).eq('cpf', row.cpf as string).eq('deletado', false).maybeSingle(); found = (f as any)?.id ?? null }
        if (found) { idsResolvidos.push(found); jaExistiam++ }
      }
    }

    // 4) Vincula ao grupo do sistema (novo ou existente), se solicitado.
    let grupoNome: string | null = null, vinculados = 0, grupoDestinoId: string | null = null
    if (destino.tipo === 'existente' && destino.grupoId) {
      grupoDestinoId = destino.grupoId
      const { data: gr } = await svc.from('simulado_grupos').select('nome').eq('id', grupoDestinoId).maybeSingle()
      grupoNome = (gr as any)?.nome ?? null
    } else if (destino.tipo === 'novo' && destino.nomeNovo?.trim()) {
      const { data: gr } = await svc.from('simulado_grupos').insert({ tenant_id: g.tenantId, nome: destino.nomeNovo.trim() }).select('id, nome').single()
      grupoDestinoId = (gr as any)?.id ?? null; grupoNome = (gr as any)?.nome ?? null
    }
    if (grupoDestinoId && idsResolvidos.length) {
      const unicos = [...new Set(idsResolvidos)]
      // Membros já vinculados ao grupo (paginado): grupo pode ter >1000 e `.in(unicos)` com
      // centenas de ids estoura a URL / dá 400 → sem isto, um grupo grande falhava ao vincular.
      const jaTem = await fetchAll<{ estudante_id: string }>(() =>
        svc.from('simulado_grupo_membros').select('estudante_id').eq('grupo_id', grupoDestinoId).order('estudante_id', { ascending: true }))
      const set = new Set(jaTem.map((r) => r.estudante_id))
      const novosVinc = unicos.filter((id) => !set.has(id))
      if (novosVinc.length) {
        const { error } = await svc.from('simulado_grupo_membros').insert(novosVinc.map((estudante_id) => ({ tenant_id: g.tenantId, grupo_id: grupoDestinoId, estudante_id })))
        if (!error) { vinculados = novosVinc.length; await propagarGrupoAosBancos(svc, g.tenantId, grupoDestinoId, novosVinc) }
      }
    }

    // 5) Sincronização (opt-in, só p/ grupo existente): DESVINCULA do grupo quem veio da
    //    Curseduca (tem matricula_externa) mas NÃO está mais nos grupos selecionados.
    //    Nunca apaga o aluno; alunos sem matrícula Curseduca (add manual) são preservados.
    let removidos = 0
    if (sincronizar && destino.tipo === 'existente' && grupoDestinoId) {
      const curseducaIds = new Set(membros.map((m) => String(m.id)))
      // Paginado: grupo pode ter >1000 membros (senão a remoção só olharia os 1000 primeiros).
      const membrosGrupo = await fetchAll<{ estudante_id: string }>(() =>
        svc.from('simulado_grupo_membros').select('estudante_id').eq('grupo_id', grupoDestinoId).eq('tenant_id', g.tenantId).order('estudante_id', { ascending: true }))
      const idsGrupo = membrosGrupo.map((r) => r.estudante_id)
      if (idsGrupo.length) {
        const ests = await fetchAllByIn<{ id: string; matricula_externa: string | null }>(idsGrupo, (chunk) =>
          svc.from('simulado_estudantes').select('id, matricula_externa').in('id', chunk).eq('tenant_id', g.tenantId).order('id', { ascending: true }))
        const paraRemover = ests
          .filter((e) => e.matricula_externa && !curseducaIds.has(String(e.matricula_externa)))
          .map((e) => e.id)
        // Deleta em lotes (o `.in()` com muitos ids estoura a URL).
        for (let i = 0; i < paraRemover.length; i += 200) {
          const lote = paraRemover.slice(i, i + 200)
          const { error } = await svc.from('simulado_grupo_membros').delete().eq('grupo_id', grupoDestinoId).eq('tenant_id', g.tenantId).in('estudante_id', lote)
          if (!error) removidos += lote.length
        }
      }
    }

    // 6) Passaporte também entra no grupo "Passaporte" (consistência com a Guru).
    if (idsResolvidos.length) {
      const { data: gp } = await svc.from('simulado_grupos').select('id').eq('tenant_id', g.tenantId).eq('deletado', false).eq('is_mestre', false).ilike('nome', 'passaporte').limit(1).maybeSingle()
      const gpId = (gp as any)?.id
      if (gpId) {
        const unicos = [...new Set(idsResolvidos)]
        const passas = await fetchAllByIn<{ id: string }>(unicos, (chunk) =>
          svc.from('simulado_estudantes').select('id').in('id', chunk).eq('tenant_id', g.tenantId).eq('classificacao', 'passaporte').order('id', { ascending: true }))
        const passIds = passas.map((p) => p.id)
        if (passIds.length) {
          const jaGp = new Set((await fetchAll<{ estudante_id: string }>(() =>
            svc.from('simulado_grupo_membros').select('estudante_id').eq('grupo_id', gpId).order('estudante_id', { ascending: true }))).map((r) => r.estudante_id))
          const novosGp = passIds.filter((id) => !jaGp.has(id))
          for (let i = 0; i < novosGp.length; i += 200) {
            await svc.from('simulado_grupo_membros').insert(novosGp.slice(i, i + 200).map((estudante_id) => ({ tenant_id: g.tenantId, grupo_id: gpId, estudante_id })))
          }
          if (novosGp.length) await propagarGrupoAosBancos(svc, g.tenantId, gpId, novosGp)
        }
      }
    }

    await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_estudantes', entidadeId: grupoDestinoId ?? 'curseduca', tenantId: g.tenantId, depois: { curseduca_grupos: ids, total, novos, jaExistiam, atualizados, vinculados, removidos, semDetalhe, restante } })
    // 'layout' cobre também o detalhe /admin/grupos/[id] (senão os membros recém-vinculados
    // ficam invisíveis por cache até o TTL — foi o que pareceu "não foi pro grupo").
    revalidatePath('/admin/estudantes'); revalidatePath('/admin/grupos', 'layout')
    if (grupoDestinoId) revalidatePath(`/admin/grupos/${grupoDestinoId}`)
    await invalidarRelatorios(g.tenantId) // rosters/matrículas mudaram → recalcula contagens dos relatórios
    return { ok: true, total, novos, jaExistiam, atualizados, vinculados, removidos, semIdentificador, semDetalhe, restante, grupoNome }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Falha na importação.' }
  }
}
