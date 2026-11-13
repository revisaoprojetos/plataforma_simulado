'use server'

// EDIÇÃO dentro da aba "Regras" do Produto (Estúdio): aplicar/remover regras em UMA célula ou em LOTE (módulos/aulas × públicos),
// gerir os públicos (grupos vinculados, liberar para todos) e ler o estado editável de uma célula.
// NÃO duplica regra de negócio: cada operação DELEGA às actions donas —
//   · disponibilidade de segmento/grupo -> aplicarLiberacaoSegmentoAction / removerLiberacaoSegmentoAction (segmento-regras-actions)
//   · visibilidade (mostrar/ocultar/cadeado) -> aplicarVisibilidadeEmLoteAction (visibilidade-actions)
//   · exceção de grupo -> criarExcecoes / acaoMassaExcecoes (liberacao-aulas/alunos/actions-alunos)
//   · vínculo de grupos -> salvarGruposAction; "liberar para todos" -> definirAcessoGratuitoProdutoAction (admin/produtos/actions)
// Só o que não existia: a disponibilidade BASE de vários módulos de uma vez (coluna "Todos") e remover a visibilidade de UM segmento.
// Guard: produtos:manage (admin). Tenant em toda query; consultas .in() em chunks de 80; teto 500 alvos / 60 públicos / 5.000 pares.
// Prévia (dryRun) lê e conta, nunca grava. Ao gravar: invalida o mapa (cache 20 s), revalida a rota e audita UM resumo (+ regras-log).

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { registrarRegraLog } from '@/lib/produtos/regras-log'
import { invalidarMapaRegras } from '@/lib/produtos/mapa-regras-cache'
import { normalizarDisponibilidade } from '@/lib/produtos/disp-normalizar'
import { gruposDoProduto } from '@/lib/produtos/estudio'
import { grupoUnicoDaRegra, regraDoGrupo } from '@/lib/segmentos/grupo-unico'
import { normalizarRegra } from '@/lib/segmentos/tipos'
import { LIMITE_ALVOS, LIMITE_PARES, LIMITE_PUBLICOS } from '@/lib/produtos/matriz-util'
import type { Disponibilidade } from '@/lib/produtos/curriculo'
import { salvarSegmentoAction, aplicarVisibilidadeEmLoteAction } from './visibilidade-actions'
import { aplicarLiberacaoSegmentoAction, removerLiberacaoSegmentoAction } from './segmento-regras-actions'
import { criarExcecoes, acaoMassaExcecoes } from '@/app/admin/revisao/cronograma/liberacao-aulas/alunos/actions-alunos'
import { salvarGruposAction, lerAcessoGratuitoProdutoAction, definirAcessoGratuitoProdutoAction } from '@/app/admin/produtos/actions'
import type { EstadoCelula, ItemLote, ModoVisibilidade, OperacaoRegra, PedidoLote, PublicosProduto, ResultadoLote } from './regras-edicao-tipos'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const chunks = <T,>(a: T[], n = 80): T[][] => { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }
type Svc = ReturnType<typeof createAdminClient>

async function guard() {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || access.permissions.includes('produtos:manage'))) return { error: 'Sem permissão para editar regras.' as const }
  if (!access.tenantId) return { error: 'Tenant não resolvido — recarregue a página.' as const }
  return { tenantId: access.tenantId, userId: access.userId ?? null }
}
type G = { tenantId: string; userId: string | null }

function parsePub(chave: string): { tipo: 'todos' | 'grupo' | 'segmento'; id: string | null } | null {
  if (chave === 'todos') return { tipo: 'todos', id: null }
  const m = /^(grupo|segmento):(.+)$/.exec(chave)
  return m && UUID.test(m[2]) ? { tipo: m[1] as 'grupo' | 'segmento', id: m[2] } : null
}

async function pool<T, R>(itens: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(itens.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, async () => {
    while (i < itens.length) { const k = i++; out[k] = await fn(itens[k]) }
  }))
  return out
}

interface ModInfo { id: string; pai_id: string | null; titulo: string; disponibilidade: any }
interface Ctx {
  g: G; svc: Svc; produtoId: string; dry: boolean
  mods: Map<string, ModInfo>
  /** segmento de um grupo só: grupoId -> segmentos */
  segPorGrupo: Map<string, string[]>
  segNomes: Map<string, string>
  gruposVinc: Map<string, string>
}

// ───────────────────────── leituras auxiliares (chunks de 80) ─────────────────────────

async function carregarMods(ctx: Pick<Ctx, 'svc' | 'g' | 'produtoId'>, ids: string[]): Promise<Map<string, ModInfo>> {
  const m = new Map<string, ModInfo>()
  for (const c of chunks(ids)) {
    const { data } = await ctx.svc.from('simulado_produto_modulos').select('id, pai_id, titulo, disponibilidade').eq('tenant_id', ctx.g.tenantId).eq('produto_id', ctx.produtoId).eq('deletado', false).in('id', c)
    for (const r of (data ?? []) as any[]) m.set(r.id, r)
  }
  return m
}
async function idsDispSeg(ctx: Ctx, segIds: string[], alvos: string[]): Promise<string[]> {
  if (!segIds.length) return []
  const out: string[] = []
  for (const c of chunks(alvos)) {
    const { data } = await ctx.svc.from('simulado_produto_disponibilidade_seg').select('id').eq('tenant_id', ctx.g.tenantId).eq('produto_id', ctx.produtoId).in('segmento_id', segIds).in('alvo_id', c)
    for (const r of (data ?? []) as any[]) out.push(r.id)
  }
  return out
}
async function idsVis(ctx: Ctx, segIds: string[], alvos: string[]): Promise<string[]> {
  if (!segIds.length) return []
  const out: string[] = []
  for (const c of chunks(alvos)) {
    const { data } = await ctx.svc.from('simulado_produto_visibilidade').select('id').eq('tenant_id', ctx.g.tenantId).eq('produto_id', ctx.produtoId).in('alvo_tipo', ['modulo', 'aula']).in('segmento_id', segIds).in('alvo_id', c)
    for (const r of (data ?? []) as any[]) out.push(r.id)
  }
  return out
}
async function excGrupo(ctx: Ctx, grupoId: string, alvos: string[], f: { acao?: string; soAtivas?: boolean } = {}): Promise<Array<{ id: string; alvo_id: string }>> {
  const out: Array<{ id: string; alvo_id: string }> = []
  for (const c of chunks(alvos)) {
    let q = ctx.svc.from('simulado_liberacao_excecoes').select('id, alvo_id').eq('tenant_id', ctx.g.tenantId).eq('produto_id', ctx.produtoId).eq('grupo_id', grupoId).in('alvo_id', c)
    if (f.acao) q = q.eq('acao', f.acao)
    if (f.soAtivas) q = q.eq('ativo', true)
    const { data } = await q
    for (const r of (data ?? []) as any[]) out.push(r)
  }
  return out
}

/** Segmento que carrega a regra do público. Grupo: reaproveita o "de um grupo só" ou (se !dry) cria. */
async function segmentoDoPublico(ctx: Ctx, tipo: 'grupo' | 'segmento', id: string, nome: string): Promise<{ id: string | null; criar: boolean; erro?: string }> {
  if (tipo === 'segmento') return { id, criar: false }
  const ex = ctx.segPorGrupo.get(id)?.[0]
  if (ex) return { id: ex, criar: false }
  if (ctx.dry) return { id: null, criar: true }
  const r = await salvarSegmentoAction({ nome: `Grupo: ${nome}`.slice(0, 250), descricao: 'Criado pela aba Regras do produto (regra por grupo).', regra: regraDoGrupo(id) })
  if ('error' in r) return { id: null, criar: false, erro: r.error }
  ctx.segPorGrupo.set(id, [r.segmento.id]); ctx.segNomes.set(r.segmento.id, r.segmento.nome)
  return { id: r.segmento.id, criar: false }
}
const segIdsDoPublico = (ctx: Ctx, tipo: 'grupo' | 'segmento', id: string) => (tipo === 'segmento' ? [id] : ctx.segPorGrupo.get(id) ?? [])

// ───────────────────────── execução de UMA operação em UM público ─────────────────────────

const ROT_OP: Record<OperacaoRegra['tipo'], string> = { disponibilidade: 'Disponibilidade', visibilidade: 'Visibilidade', excecao: 'Exceção', remover: 'Remover regras' }
const ROT_VIS: Record<ModoVisibilidade, string> = { liberar: 'sem restrição', mostrar: 'somente este público vê', ocultar: 'oculto para o público', cadeado: 'cadeado para o público' }

async function executar(ctx: Ctx, chave: string, nome: string, alvos: string[], op: OperacaoRegra): Promise<ItemLote[]> {
  const p = parsePub(chave)!
  const item = (operacao: string, ok: boolean, n: number, substitui: number, mensagem: string): ItemLote => ({ publico: chave, publicoNome: nome, operacao, ok, alvos: n, substitui, mensagem })
  const dry = ctx.dry
  const agora = new Date().toISOString()
  try {
    // ── DISPONIBILIDADE ──
    if (op.tipo === 'disponibilidade') {
      const disp = normalizarDisponibilidade(op.disponibilidade)
      if (!disp) return [item('Disponibilidade', false, 0, 0, 'Disponibilidade inválida (confira a data, os dias e o cronograma).')]
      if (p.tipo === 'todos') {
        const subst = alvos.filter((a) => { const t = ctx.mods.get(a)?.disponibilidade?.tipo; return t && t !== 'na_matricula' }).length
        if (dry) return [item('Disponibilidade', true, alvos.length, subst, `Define a disponibilidade BASE (todos os alunos) em ${alvos.length} item(ns).`)]
        for (const c of chunks(alvos)) {
          const { error } = await ctx.svc.from('simulado_produto_modulos').update({ disponibilidade: disp, atualizado_em: agora }).eq('tenant_id', ctx.g.tenantId).eq('produto_id', ctx.produtoId).in('id', c)
          if (error) return [item('Disponibilidade', false, 0, 0, error.message)]
        }
        await registrarRegraLog({ tenantId: ctx.g.tenantId, produtoId: ctx.produtoId, camada: 'disponibilidade', acao: 'aplicada em lote (base)', alvoRotulo: `${alvos.length} módulo(s)/aula(s)`, antes: { substituidas: subst }, depois: { disponibilidade: disp }, atorId: ctx.g.userId })
        return [item('Disponibilidade', true, alvos.length, subst, `Disponibilidade base aplicada em ${alvos.length} item(ns).`)]
      }
      const seg = await segmentoDoPublico(ctx, p.tipo, p.id!, nome)
      if (seg.erro) return [item('Disponibilidade', false, 0, 0, seg.erro)]
      const subst = (await idsDispSeg(ctx, segIdsDoPublico(ctx, p.tipo, p.id!), alvos)).length
      if (dry) return [item('Disponibilidade', true, alvos.length, subst, `${seg.criar ? 'Cria o segmento do grupo e d' : 'D'}efine a liberação própria deste público em ${alvos.length} item(ns).`)]
      const r = await aplicarLiberacaoSegmentoAction(ctx.produtoId, alvos.map((id) => ({ tipo: 'modulo' as const, id })), { segmento_id: seg.id!, disponibilidade: disp as Disponibilidade, prioridade: op.prioridade ?? 0 })
      if ('error' in r) return [item('Disponibilidade', false, 0, 0, r.error)]
      return [item('Disponibilidade', true, r.alvos, r.substituidas, `Liberação própria aplicada em ${r.alvos} item(ns).`)]
    }

    // ── VISIBILIDADE ──
    if (op.tipo === 'visibilidade') {
      if (p.tipo === 'todos') return [item('Visibilidade', false, 0, 0, 'Visibilidade vale para grupo ou segmento (a coluna "Todos" não tem público).')]
      const segIds = segIdsDoPublico(ctx, p.tipo, p.id!)
      if (op.modo === 'liberar') {
        const ids = await idsVis(ctx, segIds, alvos)
        if (dry) return [item('Visibilidade', true, alvos.length, ids.length, ids.length ? `Remove ${ids.length} restrição(ões) de visibilidade deste público.` : 'Nada a remover: já está sem restrição.')]
        for (const c of chunks(ids)) {
          const { error } = await ctx.svc.from('simulado_produto_visibilidade').delete().eq('tenant_id', ctx.g.tenantId).eq('produto_id', ctx.produtoId).in('id', c)
          if (error) return [item('Visibilidade', false, 0, 0, error.message)]
        }
        await registrarRegraLog({ tenantId: ctx.g.tenantId, produtoId: ctx.produtoId, camada: 'visibilidade', acao: 'removida em lote', alvoRotulo: `${ids.length} regra(s) · ${nome}`, antes: { ids: ids.slice(0, 100) }, atorId: ctx.g.userId })
        return [item('Visibilidade', true, alvos.length, ids.length, `${ids.length} restrição(ões) removida(s).`)]
      }
      const seg = await segmentoDoPublico(ctx, p.tipo, p.id!, nome)
      if (seg.erro) return [item('Visibilidade', false, 0, 0, seg.erro)]
      const subst = (await idsVis(ctx, segIds, alvos)).length
      if (dry) return [item('Visibilidade', true, alvos.length, subst, `${seg.criar ? 'Cria o segmento do grupo e a' : 'A'}plica "${ROT_VIS[op.modo]}" em ${alvos.length} item(ns).`)]
      const efeito = op.modo === 'mostrar' ? 'mostrar' : 'ocultar'
      const semAcesso = op.modo === 'cadeado' ? 'bloqueado_cadeado' : op.modo === 'mostrar' && op.semAcesso === 'bloqueado_cadeado' ? 'bloqueado_cadeado' : 'oculto'
      const r = await aplicarVisibilidadeEmLoteAction(ctx.produtoId, alvos.map((id) => ({ tipo: 'modulo' as const, id })), { tipo: 'aplicar', segmento_id: seg.id!, efeito, sem_acesso: semAcesso, substituir: false })
      if ('error' in r) return [item('Visibilidade', false, 0, 0, r.error)]
      return [item('Visibilidade', true, r.alvos, r.removidas, `"${ROT_VIS[op.modo]}" aplicado em ${r.alvos} item(ns).`)]
    }

    // ── EXCEÇÃO (grupo) ──
    if (op.tipo === 'excecao') {
      if (p.tipo !== 'grupo') return [item('Exceção', false, 0, 0, 'Exceção vale para um grupo (ou aluno, na tela de Exceções). Escolha uma coluna de grupo.')]
      if (!['liberar', 'bloquear'].includes(op.acao)) return [item('Exceção', false, 0, 0, 'Ação inválida.')]
      const iguais = (await excGrupo(ctx, p.id!, alvos, { acao: op.acao, soAtivas: true })).length
      if (dry) return [item('Exceção', true, alvos.length - iguais, 0, `${op.acao === 'liberar' ? 'Libera' : 'Bloqueia'} ${alvos.length - iguais} item(ns) para o grupo${iguais ? ` (${iguais} já tem a mesma exceção e será ignorado)` : ''}.`)]
      const r = await criarExcecoes(ctx.produtoId, {
        alvos: alvos.map((id) => ({ tipo: (ctx.mods.get(id)?.pai_id ? 'aula' : 'modulo') as 'aula' | 'modulo', id })),
        alunoIds: [], grupoIds: [p.id!], acao: op.acao, motivo: op.motivo ?? '', validade: op.validade ?? '',
      })
      if (!r.ok) return [item('Exceção', false, 0, 0, r.error)]
      return [item('Exceção', true, r.criadas, 0, `${r.criadas} exceção(ões) criada(s)${r.ignoradas ? `, ${r.ignoradas} já existia(m)` : ''}.`)]
    }

    // ── REMOVER ──
    const itens: ItemLote[] = []
    for (const camada of [...new Set(op.camadas)]) {
      if (camada === 'disponibilidade') {
        if (p.tipo === 'todos') {
          const com = alvos.filter((a) => { const t = ctx.mods.get(a)?.disponibilidade?.tipo; return t && t !== 'na_matricula' })
          if (dry) { itens.push(item('Remover disponibilidade', true, alvos.length, com.length, `Volta ${com.length} item(ns) ao padrão (liberado na matrícula).`)); continue }
          let falhaBase: string | null = null
          for (const c of chunks(com)) {
            const { error } = await ctx.svc.from('simulado_produto_modulos').update({ disponibilidade: { tipo: 'na_matricula', antes: 'bloqueado_cadeado' }, atualizado_em: agora }).eq('tenant_id', ctx.g.tenantId).eq('produto_id', ctx.produtoId).in('id', c)
            if (error) { falhaBase = error.message; break }
          }
          if (falhaBase) { itens.push(item('Remover disponibilidade', false, 0, 0, falhaBase)); continue }
          await registrarRegraLog({ tenantId: ctx.g.tenantId, produtoId: ctx.produtoId, camada: 'disponibilidade', acao: 'removida em lote (base)', alvoRotulo: `${com.length} módulo(s)/aula(s)`, atorId: ctx.g.userId })
          itens.push(item('Remover disponibilidade', true, alvos.length, com.length, `${com.length} item(ns) voltaram ao padrão.`))
        } else {
          const ids = await idsDispSeg(ctx, segIdsDoPublico(ctx, p.tipo, p.id!), alvos)
          if (dry || !ids.length) { itens.push(item('Remover disponibilidade', true, alvos.length, ids.length, ids.length ? `Remove ${ids.length} liberação(ões) própria(s) deste público.` : 'Nenhuma liberação própria para remover.')); continue }
          const r = await removerLiberacaoSegmentoAction(ctx.produtoId, ids)
          itens.push('error' in r ? item('Remover disponibilidade', false, 0, 0, r.error) : item('Remover disponibilidade', true, alvos.length, r.removidas, `${r.removidas} liberação(ões) removida(s).`))
        }
      } else if (camada === 'visibilidade') {
        if (p.tipo === 'todos') { itens.push(item('Remover visibilidade', true, 0, 0, 'A coluna "Todos" não tem visibilidade por público.')); continue }
        const ids = await idsVis(ctx, segIdsDoPublico(ctx, p.tipo, p.id!), alvos)
        if (dry || !ids.length) { itens.push(item('Remover visibilidade', true, alvos.length, ids.length, ids.length ? `Remove ${ids.length} restrição(ões) de visibilidade.` : 'Nenhuma restrição para remover.')); continue }
        let falha: string | null = null
        for (const c of chunks(ids)) {
          const { error } = await ctx.svc.from('simulado_produto_visibilidade').delete().eq('tenant_id', ctx.g.tenantId).eq('produto_id', ctx.produtoId).in('id', c)
          if (error) { falha = error.message; break }
        }
        if (!falha) await registrarRegraLog({ tenantId: ctx.g.tenantId, produtoId: ctx.produtoId, camada: 'visibilidade', acao: 'removida em lote', alvoRotulo: `${ids.length} regra(s) · ${nome}`, antes: { ids: ids.slice(0, 100) }, atorId: ctx.g.userId })
        itens.push(falha ? item('Remover visibilidade', false, 0, 0, falha) : item('Remover visibilidade', true, alvos.length, ids.length, `${ids.length} restrição(ões) removida(s).`))
      } else if (camada === 'excecao') {
        if (p.tipo !== 'grupo') { itens.push(item('Remover exceções', true, 0, 0, 'Exceções por grupo: só nas colunas de grupo.')); continue }
        const ex = await excGrupo(ctx, p.id!, alvos)
        if (dry || !ex.length) { itens.push(item('Remover exceções', true, alvos.length, ex.length, ex.length ? `Exclui ${ex.length} exceção(ões) do grupo.` : 'Nenhuma exceção para remover.')); continue }
        const r = await acaoMassaExcecoes(ctx.produtoId, ex.map((x) => x.id), 'excluir')
        itens.push(r.ok ? item('Remover exceções', true, alvos.length, r.afetadas, `${r.afetadas} exceção(ões) excluída(s).`) : item('Remover exceções', false, 0, 0, r.error))
      }
    }
    return itens
  } catch (e) {
    return [item(ROT_OP[op.tipo], false, 0, 0, e instanceof Error ? e.message : 'Falha inesperada.')]
  }
}

// ───────────────────────── lote (prévia / aplicar) ─────────────────────────

async function lote(produtoId: string, pedido: PedidoLote, dry: boolean): Promise<{ ok: true; resultado: ResultadoLote } | { error: string }> {
  const g = await guard(); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  if (!UUID.test(produtoId)) return { error: 'Produto inválido.' }
  const pares = (pedido?.pares ?? []).filter((p) => p && Array.isArray(p.alvos))
  const ops = (pedido?.operacoes ?? []).slice(0, 4)
  if (!pares.length || !ops.length) return { error: 'Selecione células e defina a regra.' }
  if (pares.length > LIMITE_PUBLICOS) return { error: `Públicos demais (máx. ${LIMITE_PUBLICOS} por vez).` }
  const todosAlvos = [...new Set(pares.flatMap((p) => p.alvos).filter((a) => UUID.test(a)))]
  if (todosAlvos.length > LIMITE_ALVOS) return { error: `Módulos/aulas demais (máx. ${LIMITE_ALVOS} por vez). Reduza a seleção ou aplique em etapas.` }
  if (pares.reduce((s, p) => s + p.alvos.length, 0) > LIMITE_PARES) return { error: `Células demais (máx. ${LIMITE_PARES} por vez).` }
  for (const o of ops) {
    if (o.tipo === 'excecao' && o.validade && !/^\d{4}-\d{2}-\d{2}$/.test(o.validade)) return { error: 'Validade da exceção inválida.' }
  }

  const svc = createAdminClient()
  const avisos: string[] = []
  const mods = await carregarMods({ svc, g, produtoId }, todosAlvos)
  const invalidos = todosAlvos.filter((a) => !mods.has(a))
  if (invalidos.length) avisos.push(`${invalidos.length} módulo(s)/aula(s) não pertencem a este produto e foram ignorados.`)
  if (!mods.size) return { error: 'Nenhum módulo/aula válido neste produto.' }

  // segmentos do tenant (nome + "de um grupo só") e grupos vinculados
  const { data: segs } = await svc.from('simulado_segmentos').select('id, nome, regra').eq('tenant_id', g.tenantId).eq('deletado', false).limit(1000)
  const segPorGrupo = new Map<string, string[]>(); const segNomes = new Map<string, string>()
  for (const s of (segs ?? []) as any[]) {
    segNomes.set(s.id, s.nome)
    const gid = grupoUnicoDaRegra(normalizarRegra(s.regra))
    if (gid) { const l = segPorGrupo.get(gid) ?? []; l.push(s.id); segPorGrupo.set(gid, l) }
  }
  const gv = await gruposDoProduto(g.tenantId, produtoId).catch(() => [] as Array<{ id: string; nome: string }>)
  const gruposVinc = new Map(gv.map((x) => [x.id, x.nome]))
  const ctx: Ctx = { g, svc, produtoId, dry, mods, segPorGrupo, segNomes, gruposVinc }

  const trabalho: Array<{ chave: string; nome: string; alvos: string[] }> = []
  const itens: ItemLote[] = []
  for (const par of pares) {
    const p = parsePub(par.publico)
    const alvos = [...new Set(par.alvos.filter((a) => mods.has(a)))]
    if (!p) { itens.push({ publico: par.publico, publicoNome: par.publico, operacao: '—', ok: false, alvos: 0, substitui: 0, mensagem: 'Público inválido.' }); continue }
    const nome = p.tipo === 'todos' ? 'Todos (regra base)' : p.tipo === 'grupo' ? gruposVinc.get(p.id!) ?? '(grupo)' : segNomes.get(p.id!) ?? '(segmento)'
    if (p.tipo === 'grupo' && !gruposVinc.has(p.id!)) { itens.push({ publico: par.publico, publicoNome: nome, operacao: '—', ok: false, alvos: 0, substitui: 0, mensagem: 'O grupo não está vinculado a este produto.' }); continue }
    if (p.tipo === 'segmento' && !segNomes.has(p.id!)) { itens.push({ publico: par.publico, publicoNome: nome, operacao: '—', ok: false, alvos: 0, substitui: 0, mensagem: 'Segmento não encontrado.' }); continue }
    if (alvos.length) trabalho.push({ chave: par.publico, nome, alvos })
  }
  // mesmo público em vários pares: junta os alvos (sem repetir)
  const juntos = new Map<string, { chave: string; nome: string; alvos: Set<string> }>()
  for (const t of trabalho) { const j = juntos.get(t.chave) ?? { chave: t.chave, nome: t.nome, alvos: new Set<string>() }; t.alvos.forEach((a) => j.alvos.add(a)); juntos.set(t.chave, j) }
  // por público, as operações são SEQUENCIAIS (ex.: criar o segmento do grupo uma vez); públicos distintos rodam em paralelo limitado.
  const blocos = await pool([...juntos.values()], 4, async (j) => {
    const lista: ItemLote[] = []
    for (const op of ops) lista.push(...await executar(ctx, j.chave, j.nome, [...j.alvos], op))
    return lista
  })
  for (const b of blocos) itens.push(...b)

  const ok = itens.filter((i) => i.ok).length, erros = itens.length - ok
  if (!dry) {
    await invalidarMapaRegras(produtoId, g.tenantId)
    revalidatePath(`/admin/conteudos/produtos/${produtoId}`)
    await registrarAudit({
      operacao: 'UPDATE', entidade: 'simulado_regras_produto', entidadeId: produtoId, tenantId: g.tenantId,
      depois: { origem: 'aba_regras', lote: true, alvos: mods.size, publicos: juntos.size, operacoes: ops.map((o) => o.tipo), itens_ok: ok, itens_erro: erros, erros: itens.filter((i) => !i.ok).slice(0, 20).map((i) => `${i.publicoNome}: ${i.mensagem}`) },
    })
  }
  return { ok: true, resultado: { itens, alvos: mods.size, publicos: juntos.size, pares: [...juntos.values()].reduce((s, j) => s + j.alvos.size, 0), ok, erros, avisos } }
}

export async function previaRegrasLoteAction(produtoId: string, pedido: PedidoLote): Promise<{ ok: true; resultado: ResultadoLote } | { error: string }> {
  return lote(produtoId, pedido, true)
}
export async function aplicarRegrasLoteAction(produtoId: string, pedido: PedidoLote): Promise<{ ok: true; resultado: ResultadoLote } | { error: string }> {
  return lote(produtoId, pedido, false)
}

// ───────────────────────── estado editável de uma célula ─────────────────────────

export async function lerEstadoCelulaAction(produtoId: string, alvoId: string, chave: string): Promise<{ ok: true; estado: EstadoCelula } | { error: string }> {
  const g = await guard(); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  const p = parsePub(chave)
  if (!UUID.test(produtoId) || !UUID.test(alvoId) || !p) return { error: 'Parâmetros inválidos.' }
  const svc = createAdminClient()
  const mods = await carregarMods({ svc, g, produtoId }, [alvoId])
  const mod = mods.get(alvoId)
  if (!mod) return { error: 'Módulo/aula não encontrado neste produto.' }
  const estado: EstadoCelula = { disp: null, dispOrigem: null, visibilidade: 'liberar', excecao: null, segmentoId: null, tipoAlvo: mod.pai_id ? 'aula' : 'modulo' }
  if (p.tipo === 'todos') {
    const d = mod.disponibilidade
    estado.disp = d?.tipo ? (d as Disponibilidade) : null; estado.dispOrigem = d?.tipo ? 'base' : null
    return { ok: true, estado }
  }
  let segIds: string[] = []
  if (p.tipo === 'segmento') segIds = [p.id!]
  else {
    const { data } = await svc.from('simulado_segmentos').select('id, regra').eq('tenant_id', g.tenantId).eq('deletado', false).limit(1000)
    segIds = ((data ?? []) as any[]).filter((s) => grupoUnicoDaRegra(normalizarRegra(s.regra)) === p.id).map((s) => s.id)
    const { data: ex } = await svc.from('simulado_liberacao_excecoes').select('acao, motivo, expira_em').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('grupo_id', p.id!).eq('alvo_id', alvoId).eq('ativo', true).order('criado_em', { ascending: false }).limit(1)
    const e = (ex ?? [])[0] as any
    if (e) estado.excecao = { acao: e.acao, motivo: e.motivo ?? '', validade: e.expira_em ? String(e.expira_em).slice(0, 10) : '' }
  }
  estado.segmentoId = segIds[0] ?? null
  if (segIds.length) {
    const [d, v] = await Promise.all([
      svc.from('simulado_produto_disponibilidade_seg').select('disponibilidade, prioridade, criado_em').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('alvo_id', alvoId).in('segmento_id', segIds).eq('ativo', true).order('prioridade', { ascending: true }).limit(1),
      svc.from('simulado_produto_visibilidade').select('efeito, sem_acesso').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('alvo_id', alvoId).in('segmento_id', segIds).eq('ativo', true).limit(1),
    ])
    const dr = ((d.data ?? [])[0] as any)?.disponibilidade
    if (dr?.tipo) { estado.disp = dr as Disponibilidade; estado.dispOrigem = 'segmento' }
    const vr = (v.data ?? [])[0] as any
    if (vr) estado.visibilidade = vr.efeito === 'mostrar' ? 'mostrar' : vr.sem_acesso === 'bloqueado_cadeado' ? 'cadeado' : 'ocultar'
  }
  return { ok: true, estado }
}

// ───────────────────────── públicos do produto ─────────────────────────

export async function carregarPublicosProdutoAction(produtoId: string): Promise<{ ok: true; publicos: PublicosProduto } | { error: string }> {
  const g = await guard(); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  if (!UUID.test(produtoId)) return { error: 'Produto inválido.' }
  const svc = createAdminClient()
  const [grupos, grat, segR, visR, dispR] = await Promise.all([
    gruposDoProduto(g.tenantId, produtoId).catch(() => []),
    lerAcessoGratuitoProdutoAction(produtoId).catch(() => null),
    svc.from('simulado_segmentos').select('id, nome, regra').eq('tenant_id', g.tenantId).eq('deletado', false).order('nome', { ascending: true }).limit(500),
    svc.from('simulado_produto_visibilidade').select('segmento_id').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).limit(5000),
    svc.from('simulado_produto_disponibilidade_seg').select('segmento_id').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).limit(5000),
  ])
  const uso = new Map<string, number>()
  for (const r of [...((visR.data ?? []) as any[]), ...((dispR.data ?? []) as any[])]) uso.set(r.segmento_id, (uso.get(r.segmento_id) ?? 0) + 1)
  return {
    ok: true,
    publicos: {
      grupos, acessoGratuito: !!(grat && 'ok' in grat && grat.valor),
      segmentos: ((segR.data ?? []) as any[]).map((s) => ({ id: s.id, nome: s.nome, regras: uso.get(s.id) ?? 0, grupoId: grupoUnicoDaRegra(normalizarRegra(s.regra)) })),
    },
  }
}

/** Vincula/desvincula grupos do produto (compõe a lista ATUAL no servidor e delega a salvarGruposAction — evita sobrescrever por lista velha). */
export async function vincularGruposProdutoAction(produtoId: string, mudanca: { adicionar?: string[]; remover?: string[] }): Promise<{ ok: true; adicionados: number; removidos: number } | { error: string }> {
  const g = await guard(); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  if (!UUID.test(produtoId)) return { error: 'Produto inválido.' }
  const svc = createAdminClient()
  const add = [...new Set((mudanca.adicionar ?? []).filter((i) => UUID.test(i)))].slice(0, 500)
  const rem = new Set((mudanca.remover ?? []).filter((i) => UUID.test(i)))
  if (!add.length && !rem.size) return { error: 'Nada a alterar.' }
  const validos: string[] = []
  for (const c of chunks(add)) { const { data } = await svc.from('simulado_grupos').select('id').eq('tenant_id', g.tenantId).eq('deletado', false).in('id', c); for (const r of (data ?? []) as any[]) validos.push(r.id) }
  const { data: atuais } = await svc.from('simulado_produto_itens').select('item_id').eq('tenant_id', g.tenantId).eq('produto_id', produtoId).eq('tipo_item', 'grupo').limit(5000)
  const atual = ((atuais ?? []) as any[]).map((r) => r.item_id as string)
  const final = [...new Set([...atual.filter((i) => !rem.has(i)), ...validos])]
  const r = await salvarGruposAction(produtoId, final)
  if ('error' in r && r.error) return { error: r.error }
  await invalidarMapaRegras(produtoId, g.tenantId)
  revalidatePath(`/admin/conteudos/produtos/${produtoId}`)
  return { ok: true, adicionados: validos.filter((i) => !atual.includes(i)).length, removidos: atual.filter((i) => rem.has(i)).length }
}

export async function definirLiberarParaTodosAction(produtoId: string, valor: boolean): Promise<{ ok: true } | { error: string }> {
  const g = await guard(); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  if (!UUID.test(produtoId)) return { error: 'Produto inválido.' }
  const r = await definirAcessoGratuitoProdutoAction(produtoId, !!valor)
  if (r.error) return { error: r.error }
  await invalidarMapaRegras(produtoId, g.tenantId)
  return { ok: true }
}

/** Invalida o instantâneo do mapa (ex.: logo após criar um segmento, para ele aparecer como coluna). */
export async function invalidarMapaRegrasAction(produtoId: string): Promise<{ ok: true } | { error: string }> {
  const g = await guard(); if ('error' in g) return { error: g.error ?? 'Sem permissão.' }
  if (!UUID.test(produtoId)) return { error: 'Produto inválido.' }
  await invalidarMapaRegras(produtoId, g.tenantId)
  return { ok: true }
}
