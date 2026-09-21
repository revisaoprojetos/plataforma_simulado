import 'server-only'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { registrarAudit } from '@/lib/audit'
import { invalidarRelatorios } from '@/lib/cache/relatorio-cache'
import { ehProdutoPassaporte, ehProdutoVitalicio } from '@/lib/integracoes/normalizar-mapa'
import { propagarGrupoAosBancos } from '@/lib/simulado/propagar-grupo'
import { configDoEnv, listarMembrosDoGrupo, mapaMatriculasGrupo, detalheMembro, type CurseducaCfg, type MembroCurseduca, type DetalheMembro } from '@/lib/curseduca/client'
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

  // Vínculos concedidos PELA INTEGRAÇÃO carregam `origem='integracao'` (migração 20260926000000) para que
  // a sincronização/revogação só apague o que a integração inseriu — NUNCA um acesso dado à mão pelo admin.
  // Tolerante à coluna ausente: sem `origem`, cai no insert antigo (mantém compat).
  const inserirMembros = async (rows: Record<string, unknown>[]) => {
    if (!rows.length) return { error: null as any }
    const r = await svc.from('simulado_grupo_membros').insert(rows.map((x) => ({ ...x, origem: 'integracao' })))
    return (r.error && /origem|column/i.test(r.error.message)) ? svc.from('simulado_grupo_membros').insert(rows) : r
  }

  try {
    // 1) Coleta os membros de todos os grupos (dedupe entre grupos pelo id da Curseduca).
    // TOLERÂNCIA POR-GRUPO: se UM grupo falhar (ex.: 502 do gateway da Curseduca), pula esse grupo
    // e segue os demais — antes, o erro de um único grupo abortava a sincronização inteira dos 228.
    const porId = new Map<number, MembroCurseduca>()
    const gruposFalhos: { gid: number; erro: string }[] = []
    // Acesso vigente por membro (hasAccess de /groups/{id}/members). A LISTA /members NÃO filtra por
    // acesso (traz expirados), então buscamos as matrículas em paralelo. Regra: acesso = true se o
    // membro tem hasAccess=true em QUALQUER grupo sincronizado; só fica false se conhecido e nunca true;
    // null (sem dado / grupo de matrícula falhou) = desconhecido → NÃO filtra (conservador).
    const temAcessoPorId = new Map<number, boolean | null>()
    for (const gid of ids) {
      try {
        const [lista, mat] = await Promise.all([
          listarMembrosDoGrupo(g.cfg, gid),
          mapaMatriculasGrupo(g.cfg, gid).catch(() => new Map<number, { temAcesso: boolean | null }>()),
        ])
        for (const m of lista) if (!porId.has(m.id)) porId.set(m.id, m)
        for (const [mid, info] of mat) {
          if (info.temAcesso === true) temAcessoPorId.set(mid, true)
          else if (!temAcessoPorId.has(mid)) temAcessoPorId.set(mid, info.temAcesso ?? null)
        }
      } catch (e: any) {
        gruposFalhos.push({ gid, erro: String(e?.message ?? e).slice(0, 160) })
      }
    }
    // Só aborta se NENHUM grupo pôde ser lido (falha geral de credencial/rede) — aí não há o que importar.
    if (gruposFalhos.length === ids.length && ids.length > 0) {
      return { ok: false, error: `Nenhum grupo pôde ser lido na Curseduca (${gruposFalhos.length} falharam). Ex.: ${gruposFalhos[0].erro}` } as ResultadoImportCurseduca
    }
    // Ignora contas de SISTEMA da Curseduca (ex.: apps@/contato@curseduca.com) que são membros
    // de vários canais e apareciam em "todos os grupos". Real aluno nunca usa o domínio da Curseduca.
    const ehContaSistema = (m: MembroCurseduca) => /@curseduca\.com$/i.test((m.email ?? '').trim().toLowerCase())
    const membros = [...porId.values()].filter((m) => !ehContaSistema(m))
    const total = membros.length

    // 2) Quem já existe no sistema (por matrícula Curseduca, e-mail ou CPF).
    // PAGINA com fetchAll: com >1000 estudantes o PostgREST cortaria em ~1000 e alunos além
    // disso não seriam reconhecidos → o import criaria DUPLICATAS de quem já existe.
    const existentes = await fetchAll<any>(() =>
      svc.from('simulado_estudantes').select('id, email, emails_secundarios, cpf, telefone, classificacao, matricula_externa').eq('tenant_id', g.tenantId).eq('deletado', false).order('id', { ascending: true }))
    const porEmail = new Map<string, string>(), porCpf = new Map<string, string>(), porExt = new Map<string, string>()
    const recPorId = new Map<string, any>()
    for (const e of existentes ?? []) {
      recPorId.set((e as any).id, e)
      if ((e as any).email) porEmail.set(String((e as any).email).toLowerCase(), (e as any).id)
      // e-mails secundários também apontam para o mesmo estudante (dedup os reconhece).
      for (const se of ((e as any).emails_secundarios ?? [])) if (se) porEmail.set(String(se).toLowerCase(), (e as any).id)
      if ((e as any).cpf) porCpf.set(String((e as any).cpf).replace(/\D/g, ''), (e as any).id)
      if ((e as any).matricula_externa) porExt.set(String((e as any).matricula_externa), (e as any).id)
    }
    const acharExistente = (m: MembroCurseduca) =>
      porExt.get(String(m.id)) || (m.email ? porEmail.get(m.email) : null) || (m.cpf ? porCpf.get(m.cpf) : null) || null

    // Classificação pelos grupos (exclui amostra/grátis) — mesma regra da Guru, com PRIORIDADE:
    // grupo "Passaporte Vitalício"/"Mais que Vitalício" → vitalicio; senão "Passaporte/Passe" → passaporte; senão normal.
    const classificar = (nomes: string[]): string =>
      nomes.some((n) => ehProdutoVitalicio(n)) ? 'vitalicio'
        : nomes.some((n) => ehProdutoPassaporte(n)) ? 'passaporte'
          : 'normal'

    // Política de acesso (escolha do tenant): NÃO conceder acesso a quem já está EXPIRADO na Curseduca
    // (hasAccess=false), mas NUNCA remover quem já está no sistema. `expirado` só é true quando a API
    // AFIRMA hasAccess=false; desconhecido (null) não filtra. Expirados: não são criados nem vinculados
    // (não entram em `idsResolvidos`), porém continuam em `membros` — logo a etapa de sincronização (5)
    // os vê como "presentes no canal" e não os remove.
    const expirado = (m: MembroCurseduca) => temAcessoPorId.get(m.id) === false

    // 3) Separa novos × existentes. Já existentes SEM CPF/telefone entram no backfill.
    const idsResolvidos: string[] = []
    let novos = 0, jaExistiam = 0, semIdentificador = 0, semAcesso = 0
    const novosMembros: MembroCurseduca[] = []
    const paraBackfill: { estudanteId: string; curseducaId: number }[] = []
    for (const m of membros) {
      const ex = acharExistente(m)
      if (ex) {
        jaExistiam++
        // Não vincula/promove a NOVOS grupos quem está expirado (mas não remove: só não entra em idsResolvidos).
        if (!expirado(m)) idsResolvidos.push(ex)
        const rec = recPorId.get(ex)
        // Promoção de e-mail: o e-mail que veio da Curseduca vira o PRINCIPAL e o anterior vai para
        // secundários (mesmo perfil/nota). Preserva secundários já existentes (não perde nenhum).
        if (rec && m.email) {
          const novo = String(m.email).toLowerCase().trim()
          const atual = String(rec.email ?? '').toLowerCase().trim()
          if (novo && novo !== atual) {
            const sec = new Set<string>(((rec.emails_secundarios as string[]) ?? []).map((s) => String(s).toLowerCase()))
            if (atual) sec.add(atual)
            sec.delete(novo)
            const { error: ePromo } = await svc.from('simulado_estudantes')
              .update({ email: novo, emails_secundarios: [...sec] }).eq('id', ex).eq('tenant_id', g.tenantId)
            if (!ePromo) { rec.email = novo; rec.emails_secundarios = [...sec]; porEmail.set(novo, ex); if (atual) porEmail.set(atual, ex) }
          }
        }
        if (rec && (!rec.cpf || !rec.telefone || !rec.classificacao)) paraBackfill.push({ estudanteId: ex, curseducaId: m.id })
        continue
      }
      if (!m.email) { semIdentificador++; continue } // sem e-mail → não dá pra cadastrar
      if (expirado(m)) { semAcesso++; continue }      // acesso expirado na Curseduca → não cria (política do tenant)
      novosMembros.push(m)
    }

    // CORREÇÃO DE CAUSA-RAIZ: a LISTA /members?groupId= JÁ retorna, por membro, `document` (CPF),
    // `phone` e `groups` (todos os produtos do aluno). Logo, CPF/telefone/classificação saem da lista
    // — NÃO precisamos mais chamar /members/{id} por membro (o antigo fan-out de ~1 request por aluno
    // era o que gerava 502/rate-limit/timeout e importações incompletas). O detalhe fica só como
    // FALLBACK para o caso raro de a lista vir sem grupos ou sem CPF para algum membro.
    let usadosDetalhe = 0
    let restante = 0 // membros que ficaram sem detalhe (fallback) por causa do limite — não é falha da API
    let semDetalhe = 0 // detalhes de fallback que FALHARAM (ex.: rate limit)
    const detalhePorId = new Map<number, DetalheMembro>()

    const precisaDetalhe = (m: MembroCurseduca) => m.grupos.length === 0 || !m.cpf // lista incompleta p/ este membro
    const alvosFallback = new Map<number, MembroCurseduca>()
    for (const m of novosMembros) if (precisaDetalhe(m)) alvosFallback.set(m.id, m)
    for (const b of paraBackfill) { const m = porId.get(b.curseducaId); if (m && precisaDetalhe(m)) alvosFallback.set(m.id, m) }
    const alvos = [...alvosFallback.values()]
    for (let i = 0; i < alvos.length && usadosDetalhe < limiteDetalhe; i += 8) {
      const bloco = alvos.slice(i, i + 8)
      usadosDetalhe += bloco.length
      const res = await Promise.all(bloco.map((m) => detalheMembro(g.cfg, m.id)))
      bloco.forEach((m, k) => { detalhePorId.set(m.id, res[k]); if (!res[k].ok) semDetalhe++ })
    }
    restante += Math.max(0, alvos.length - detalhePorId.size)

    // Fontes efetivas por membro: LISTA primeiro, detalhe (fallback) depois.
    const cpfDe = (m: MembroCurseduca) => m.cpf ?? detalhePorId.get(m.id)?.cpf ?? null
    const telDe = (m: MembroCurseduca) => m.telefone ?? detalhePorId.get(m.id)?.telefone ?? null
    const gruposDe = (m: MembroCurseduca) => (m.grupos.length ? m.grupos : (detalhePorId.get(m.id)?.gruposNomes ?? []))

    // 3c) Backfill: preenche CPF/telefone/classificação de quem já existia mas estava vazio (da LISTA).
    let atualizados = 0
    for (const b of paraBackfill) {
      const m = porId.get(b.curseducaId); if (!m) continue
      const rec = recPorId.get(b.estudanteId); const patch: Record<string, unknown> = {}
      const cpf = cpfDe(m), tel = telDe(m)
      if (!rec?.cpf && cpf) patch.cpf = cpf
      if (!rec?.telefone && tel) patch.telefone = tel
      if (!rec?.classificacao) patch.classificacao = classificar(gruposDe(m))
      if (Object.keys(patch).length) {
        const { error } = await svc.from('simulado_estudantes').update(patch).eq('id', b.estudanteId).eq('tenant_id', g.tenantId)
        if (!error) atualizados++
      }
    }

    const paraInserir: Record<string, unknown>[] = novosMembros.map((m) => ({
      tenant_id: g.tenantId, user_id: null,
      nome: m.nome || m.email || 'Aluno', email: m.email,
      cpf: cpfDe(m),
      telefone: telDe(m),
      classificacao: classificar(gruposDe(m)),
      matricula_externa: String(m.id),
    }))

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
        const { error } = await inserirMembros(novosVinc.map((estudante_id) => ({ tenant_id: g.tenantId, grupo_id: grupoDestinoId, estudante_id })))
        if (!error) { vinculados = novosVinc.length; await propagarGrupoAosBancos(svc, g.tenantId, grupoDestinoId, novosVinc, 'integracao') }
      }
    }

    // 5) Sincronização (opt-in, só p/ grupo existente): DESVINCULA do grupo quem veio da
    //    Curseduca (tem matricula_externa) mas NÃO está mais nos grupos selecionados.
    //    Nunca apaga o aluno; alunos sem matrícula Curseduca (add manual) são preservados.
    //    E só remove vínculos com origem='integracao' — um aluno Curseduca que o admin adicionou
    //    à MÃO a este grupo (origem='manual') é preservado (tolerante à coluna ausente).
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
          const del = () => svc.from('simulado_grupo_membros').delete().eq('grupo_id', grupoDestinoId).eq('tenant_id', g.tenantId).in('estudante_id', lote)
          let r = await del().eq('origem', 'integracao')
          if (r.error && /origem|column/i.test(r.error.message)) r = await del() // coluna ausente → comportamento antigo
          if (!r.error) removidos += lote.length
        }
      }
    }

    // 6) Passaporte E vitalício entram no grupo "Passaporte"; vitalício entra TAMBÉM no "Passaporte Vitalício".
    if (idsResolvidos.length) {
      const unicos = [...new Set(idsResolvidos)]
      const classDe = await fetchAllByIn<{ id: string; classificacao: string | null }>(unicos, (chunk) =>
        svc.from('simulado_estudantes').select('id, classificacao').in('id', chunk).eq('tenant_id', g.tenantId).order('id', { ascending: true }))
      const passIds = classDe.filter((p) => p.classificacao === 'passaporte' || p.classificacao === 'vitalicio').map((p) => p.id)
      const vitIds = classDe.filter((p) => p.classificacao === 'vitalicio').map((p) => p.id)

      const entrarNoGrupo = async (nome: string, ids: string[]) => {
        if (!ids.length) return
        const { data: gr } = await svc.from('simulado_grupos').select('id').eq('tenant_id', g.tenantId).eq('deletado', false).eq('is_mestre', false).ilike('nome', nome).limit(1).maybeSingle()
        const grId = (gr as any)?.id
        if (!grId) return
        const jaNo = new Set((await fetchAll<{ estudante_id: string }>(() =>
          svc.from('simulado_grupo_membros').select('estudante_id').eq('grupo_id', grId).order('estudante_id', { ascending: true }))).map((r) => r.estudante_id))
        const novos = ids.filter((id) => !jaNo.has(id))
        for (let i = 0; i < novos.length; i += 200) {
          await inserirMembros(novos.slice(i, i + 200).map((estudante_id) => ({ tenant_id: g.tenantId, grupo_id: grId, estudante_id })))
        }
        if (novos.length) await propagarGrupoAosBancos(svc, g.tenantId, grId, novos, 'integracao')
      }
      await entrarNoGrupo('passaporte', passIds)             // Passaporte (comum a passaporte+vitalício)
      await entrarNoGrupo('Passaporte Vitalício', vitIds)    // grupo Vitalício (só os vitalícios)
    }

    await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_estudantes', entidadeId: grupoDestinoId ?? 'curseduca', tenantId: g.tenantId, depois: { curseduca_grupos: ids, total, novos, jaExistiam, atualizados, vinculados, removidos, semDetalhe, semAcesso, restante } })
    // 'layout' cobre também o detalhe /admin/grupos/[id] (senão os membros recém-vinculados
    // ficam invisíveis por cache até o TTL — foi o que pareceu "não foi pro grupo").
    revalidatePath('/admin/estudantes'); revalidatePath('/admin/grupos', 'layout')
    if (grupoDestinoId) revalidatePath(`/admin/grupos/${grupoDestinoId}`)
    await invalidarRelatorios(g.tenantId) // rosters/matrículas mudaram → recalcula contagens dos relatórios
    return { ok: true, total, novos, jaExistiam, atualizados, vinculados, removidos, semIdentificador, semDetalhe, semAcesso, restante, grupoNome,
      ...(gruposFalhos.length ? { gruposFalhos: gruposFalhos.length, gruposFalhosDetalhe: gruposFalhos.slice(0, 10) } : {}) }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Falha na importação.' }
  }
}
