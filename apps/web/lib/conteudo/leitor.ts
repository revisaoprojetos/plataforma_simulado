import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { remember } from '@/lib/cache/relatorio-cache'
import { listarAnotacoes, type Anotacao } from './anotacoes'
import { acessoEfetivo, type ItemAcesso, type Atribuicao, type Aluno, type AcessoGeral, type ModoAcesso, type ResultadoAcesso } from './acesso-efetivo'

// LEITOR do aluno (Fase 8) — monta a leitura a partir dos TRECHOS da versão atual (cada um com seu
// uid, a âncora estável do grifo) + as anotações do aluno. A ancoragem é por (uid + offset no trecho):
// simples e robusta — é exatamente o que a tabela de anotações guarda. Server-only (service role).

const T_DOC = 'simulado_conteudo_documentos'
const T_TR = 'simulado_conteudo_trechos'
const T_LP = 'simulado_conteudo_leitura_progresso'
const T_PASTA = 'simulado_pastas' // pastas de conteúdo vivem aqui (folder_area='conteudo'/'conteudo_modelo')

export interface TrechoLeitura { uid: string; ordem: number; tipo: string; rotulo: string | null; texto: string }
export interface Leitura {
  documentoId: string; titulo: string; versaoId: string
  trechos: TrechoLeitura[]
  /** HTML FIEL (formatação original) com data-uid por bloco — a área de leitura renderiza isto. */
  html: string
  anotacoes: Anotacao[]
}

// ─────────── CONTROLE DE ACESSO (motor ÚNICO: ./acesso-efetivo) ───────────
// O gate do aluno é RELIGADO ao módulo puro `acessoEfetivo`. Cada pasta/doc vira um `ItemAcesso`
// (modo principal/herdar/propria/bloquear + oculto + acesso_geral + atribuições com origem/permissões),
// com a cadeia de ancestrais montada por `pai_id`.
//
// NÃO-REGRESSÃO: enquanto o admin não configurar os campos novos (modo_acesso/oculto/origem/permissões),
// os DEFAULTS da migração 20261026000000 + o mapeamento `modoEfetivo` abaixo reproduzem o gate anterior:
//   • default (acesso_geral null, sem atribuições, herda_acesso!=false, modo herdar/principal) → LIBERADO,
//     exatamente como antes ("sem linhas = liberado a todos").
//   • restrição do modelo ANTIGO (acesso_geral='restrito' OU atribuições OU herda_acesso=false) torna o
//     nível AUTORITATIVO ('propria'), e como `acessoEfetivo` deixa o nível restritivo MAIS PRÓXIMO decidir,
//     o caso comum (uma única restrição na cadeia) fica idêntico ao AND de nível único de antes.
//   • modos novos (bloquear/propria/principal) e oculto só passam a valer quando o admin os define na UI.
// Tolerante: colunas/tabelas ausentes (migração pendente) degradam para LIBERADO, como antes.

interface NivelRaw { pai_id?: string | null; herda_acesso?: boolean | null; acesso_geral?: AcessoGeral; modo_acesso?: string | null; oculto?: boolean | null }

/** try com colunas novas; se a coluna/tabela não existe, cai no SELECT legado; se tudo falhar, []. */
async function fetchTol<T>(primario: () => any, legado: () => any): Promise<T[]> {
  try { return await fetchAll<T>(primario) } catch { try { return await fetchAll<T>(legado) } catch { return [] } }
}
async function fetchTolByIn<T>(ids: string[], primario: (c: string[]) => any, legado: (c: string[]) => any): Promise<T[]> {
  if (!ids.length) return []
  try { return await fetchAllByIn<T>(ids, primario) } catch { try { return await fetchAllByIn<T>(ids, legado) } catch { return [] } }
}

/** Mapeia o estado persistido → modo de 1ª classe, PRESERVANDO o comportamento atual (ver bloco acima). */
function modoEfetivo(raw: NivelRaw, isRoot: boolean, temAtrib: boolean): ModoAcesso {
  const m = raw.modo_acesso
  if (m === 'bloquear') return 'bloquear'
  if (m === 'propria') return 'propria'
  if (m === 'principal') return isRoot ? 'principal' : 'propria' // 'principal' em nó não-raiz = autoritativo no próprio nível
  // 'herdar' ou null/ausente (default / intocado pela UI nova):
  if (raw.herda_acesso === false) return 'propria' // herda_acesso=false corta a cadeia (decide no próprio nível)
  if (raw.acesso_geral === 'restrito' || temAtrib) return 'propria' // restrição do modelo antigo = autoritativa
  return isRoot ? 'principal' : 'herdar'
}

function itemDeNivel(id: string, raw: NivelRaw, atrib: Atribuicao[], ancestrais: ItemAcesso[], isRoot: boolean): ItemAcesso {
  return { id, modo: modoEfetivo(raw, isRoot, atrib.length > 0), oculto: raw.oculto === true, acessoGeral: raw.acesso_geral ?? null, atribuicoes: atrib, ancestrais }
}

function atribDe(tipo: 'grupo' | 'aluno', refId: string, r: any): Atribuicao {
  const origem = r?.origem === 'individual' ? 'individual' : r?.origem === 'via_pacote' ? 'via_pacote' : 'avulsa'
  return {
    tipo, grupoId: tipo === 'grupo' ? refId : null, estudanteId: tipo === 'aluno' ? refId : null, origem,
    liberadoDe: r?.liberado_de ?? null, liberadoAte: r?.liberado_ate ?? null,
    // ausentes (SELECT legado) = null → `permsDa` trata como liberado (igual ao gate antigo: atribuição = acesso cheio).
    podeLer: r?.pode_ler ?? null, podeBaixar: r?.pode_baixar ?? null, podeGrifar: r?.pode_grifar ?? null,
  }
}

/** Atribuições (grupos + estudantes) por nó, já como `Atribuicao[]`. Tolerante a colunas/tabelas ausentes. */
async function carregarAtribuicoes(svc: any, tenantId: string, tipo: 'pasta' | 'doc', ids: string[]): Promise<Map<string, Atribuicao[]>> {
  const out = new Map<string, Atribuicao[]>()
  if (!ids.length) return out
  const tg = tipo === 'pasta' ? 'simulado_pasta_grupos' : 'simulado_conteudo_documento_grupos'
  const te = tipo === 'pasta' ? 'simulado_pasta_estudantes' : 'simulado_conteudo_documento_estudantes'
  const key = tipo === 'pasta' ? 'pasta_id' : 'documento_id'
  const extra = 'origem, pode_ler, pode_baixar, pode_grifar, liberado_de, liberado_ate'
  const [grupos, estud] = await Promise.all([
    fetchTolByIn<any>(ids,
      (c) => svc.from(tg).select(`${key}, grupo_id, ${extra}`).eq('tenant_id', tenantId).in(key, c).order(key, { ascending: true }),
      (c) => svc.from(tg).select(`${key}, grupo_id`).eq('tenant_id', tenantId).in(key, c).order(key, { ascending: true })),
    fetchTolByIn<any>(ids,
      (c) => svc.from(te).select(`${key}, estudante_id, ${extra}`).eq('tenant_id', tenantId).in(key, c).order(key, { ascending: true }),
      (c) => svc.from(te).select(`${key}, estudante_id`).eq('tenant_id', tenantId).in(key, c).order(key, { ascending: true })),
  ])
  const push = (id: string, a: Atribuicao) => { (out.get(id) ?? out.set(id, []).get(id)!).push(a) }
  for (const r of grupos as any[]) push(r[key], atribDe('grupo', r.grupo_id, r))
  for (const r of estud as any[]) push(r[key], atribDe('aluno', r.estudante_id, r))
  return out
}

/**
 * Motor de acesso do aluno: carrega as pastas de conteúdo (+ atribuições) UMA vez e expõe
 * `pastaAcessivel(id)` e `avaliarDoc(docRaw, atrib)` — ambos delegam a `acessoEfetivo`. As pastas são
 * poucas (dezenas), então carregá-las inteiras é barato; atribuições de DOCUMENTO entram por lote fora.
 */
async function motorAcesso(svc: any, tenantId: string, estId: string) {
  const { data: gm } = await svc.from('simulado_grupo_membros').select('grupo_id').eq('estudante_id', estId)
  const meusGrupos = new Set<string>(((gm as any[]) ?? []).map((r) => r.grupo_id))
  const aluno: Aluno = { estudanteId: estId, grupos: [...meusGrupos] }

  const pastas = await fetchTol<any>(
    () => svc.from(T_PASTA).select('id, pai_id, herda_acesso, acesso_geral, modo_acesso, oculto').eq('tenant_id', tenantId).eq('folder_area', 'conteudo').order('id', { ascending: true }),
    () => svc.from(T_PASTA).select('id, pai_id, herda_acesso, acesso_geral').eq('tenant_id', tenantId).eq('folder_area', 'conteudo').order('id', { ascending: true }),
  )
  const infoPasta = new Map<string, NivelRaw>((pastas ?? []).map((p: any) => [p.id, { pai_id: p.pai_id ?? null, herda_acesso: p.herda_acesso, acesso_geral: p.acesso_geral ?? null, modo_acesso: p.modo_acesso ?? null, oculto: p.oculto ?? false }]))
  const atribPasta = await carregarAtribuicoes(svc, tenantId, 'pasta', [...infoPasta.keys()])

  function cadeia(paiId: string | null): ItemAcesso[] {
    const chain: ItemAcesso[] = []; const seen = new Set<string>(); let cur = paiId
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      const raw = infoPasta.get(cur) ?? { pai_id: null }
      chain.push(itemDeNivel(cur, raw, atribPasta.get(cur) ?? [], [], (raw.pai_id ?? null) == null))
      cur = raw.pai_id ?? null
    }
    return chain
  }

  const memoP = new Map<string, boolean>()
  function pastaAcessivel(pastaId: string | null): boolean {
    if (!pastaId) return true
    const c = memoP.get(pastaId); if (c !== undefined) return c
    const raw = infoPasta.get(pastaId) ?? { pai_id: null }
    const item = itemDeNivel(pastaId, raw, atribPasta.get(pastaId) ?? [], cadeia(raw.pai_id ?? null), (raw.pai_id ?? null) == null)
    const ok = acessoEfetivo(item, aluno).permitido
    memoP.set(pastaId, ok)
    return ok
  }

  function avaliarDoc(docRaw: { id: string; pasta_id?: string | null; herda_acesso?: boolean | null; acesso_geral?: AcessoGeral; modo_acesso?: string | null; oculto?: boolean | null }, atrib: Atribuicao[]): ResultadoAcesso {
    const raw: NivelRaw = { pai_id: docRaw.pasta_id ?? null, herda_acesso: docRaw.herda_acesso, acesso_geral: docRaw.acesso_geral ?? null, modo_acesso: docRaw.modo_acesso ?? null, oculto: docRaw.oculto ?? false }
    const item = itemDeNivel(docRaw.id, raw, atrib, cadeia(raw.pai_id ?? null), (raw.pai_id ?? null) == null)
    return acessoEfetivo(item, aluno)
  }

  return { aluno, meusGrupos, pastaAcessivel, avaliarDoc }
}

/** Busca o doc + (tolerante) as colunas novas modo_acesso/oculto. `cols` = colunas base sempre necessárias. */
async function fetchDocComAcesso(svc: any, tenantId: string, id: string, cols: string): Promise<any | null> {
  let r = await svc.from(T_DOC).select(`${cols}, modo_acesso, oculto`).eq('tenant_id', tenantId).eq('id', id).maybeSingle()
  if (r.error) r = await svc.from(T_DOC).select(cols).eq('tenant_id', tenantId).eq('id', id).maybeSingle()
  return r.data ?? null
}

/** Avalia 1 documento (carrega atribuições do próprio doc). Retorna o `ResultadoAcesso` completo. */
async function avaliarDocAluno(svc: any, tenantId: string, estId: string, docRaw: any): Promise<ResultadoAcesso> {
  const motor = await motorAcesso(svc, tenantId, estId)
  const atrib = (await carregarAtribuicoes(svc, tenantId, 'doc', [docRaw.id])).get(docRaw.id) ?? []
  return motor.avaliarDoc(docRaw, atrib)
}

export interface PastaAluno { id: string; nome: string; cor: string | null; totalDocs: number }
export interface DocAluno { id: string; titulo: string; tipo_origem: string; versaoAtualId: string }
export interface ArvoreAluno {
  pastas: PastaAluno[]; documentos: DocAluno[]; breadcrumb: { id: string; nome: string }[]
  thumbs: Record<string, string>; previas: Record<string, { tipo: string; texto: string }[]>; pastaAtual: string | null
}

/**
 * Árvore navegável da Biblioteca do aluno (MESMO visual do admin: pastas → documentos com capa), já
 * FILTRADA pelo acesso (grupos/todos + herança). Navega por `pastaId` (null = raiz). Pastas vazias (sem
 * doc visível na subárvore) são ocultadas. Capas/prévias cacheadas, como no admin. Server-only.
 */
export async function arvoreBibliotecaAluno(alunoId: string, pastaId?: string | null): Promise<ArvoreAluno> {
  const vazio: ArvoreAluno = { pastas: [], documentos: [], breadcrumb: [], thumbs: {}, previas: {}, pastaAtual: pastaId ?? null }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return vazio
  // Cache por (tenant, ALUNO, pasta) — TTL 90s. A chave DEVE incluir o alunoId: a árvore já vem FILTRADA
  // por acesso (grupos/alunos + herança da pasta); sem o escopo por aluno, um aluno veria docs de outro.
  // O aluno acessa via iframe Curseduca (muitos reloads) → sem cache cada visita re-puxa docs + atribuições
  // + prévias (vetor do estouro de egress). As URLs assinadas (thumbs) valem 1h, então 90s não as expira.
  return remember<ArvoreAluno>(`conteudo:arvore-aluno:${tenantId}:${alunoId}:${pastaId ?? 'root'}`, 90, async () => {
  const svc = createAdminClient()

  const [pastasRaw, docsRaw] = await Promise.all([
    fetchAll<any>(() => svc.from(T_PASTA).select('id, nome, pai_id, cor, deletado').eq('tenant_id', tenantId).eq('folder_area', 'conteudo').eq('is_folder', true).order('id', { ascending: true })),
    // modo_acesso/oculto são tolerantes (migração pendente) → cai no SELECT legado.
    fetchTol<any>(
      () => svc.from(T_DOC).select('id, titulo, tipo_origem, versao_atual_id, atualizado_em, pasta_id, herda_acesso, acesso_geral, modo_acesso, oculto').eq('tenant_id', tenantId).eq('status', 'publicado').eq('deletado', false).eq('categoria', 'conteudo').not('versao_atual_id', 'is', null).order('atualizado_em', { ascending: false }).order('id', { ascending: true }),
      () => svc.from(T_DOC).select('id, titulo, tipo_origem, versao_atual_id, atualizado_em, pasta_id, herda_acesso, acesso_geral').eq('tenant_id', tenantId).eq('status', 'publicado').eq('deletado', false).eq('categoria', 'conteudo').not('versao_atual_id', 'is', null).order('atualizado_em', { ascending: false }).order('id', { ascending: true }),
    ),
  ])
  const pastas = (pastasRaw ?? []).filter((p: any) => !p.deletado)
  const docs = docsRaw ?? []
  const paiDe = new Map<string, string | null>(pastas.map((p: any) => [p.id, p.pai_id ?? null]))
  const nomeDe = new Map<string, string>(pastas.map((p: any) => [p.id, p.nome]))
  const corDe = new Map<string, string | null>(pastas.map((p: any) => [p.id, p.cor ?? null]))

  // Motor de acesso ÚNICO (acessoEfetivo) — visibilidade da pasta e de cada doc (modo/oculto/origem/janela).
  const motor = await motorAcesso(svc, tenantId, alunoId)
  const pastaAcessivel = motor.pastaAcessivel
  const atribDocs = await carregarAtribuicoes(svc, tenantId, 'doc', docs.map((d: any) => d.id))
  const visiveis = docs.filter((d: any) => motor.avaliarDoc(d, atribDocs.get(d.id) ?? []).permitido)

  // conta docs visíveis na subárvore de cada pasta (para ocultar pastas vazias + mostrar total)
  const totalSub = new Map<string, number>()
  for (const d of visiveis) {
    let cur: string | null = d.pasta_id ?? null; const seen = new Set<string>()
    while (cur && !seen.has(cur)) { seen.add(cur); totalSub.set(cur, (totalSub.get(cur) ?? 0) + 1); cur = paiDe.get(cur) ?? null }
  }

  const alvo = pastaId ?? null
  const subpastas: PastaAluno[] = pastas
    .filter((p: any) => (p.pai_id ?? null) === alvo && pastaAcessivel(p.id) && (totalSub.get(p.id) ?? 0) > 0)
    .map((p: any) => ({ id: p.id, nome: p.nome, cor: p.cor ?? null, totalDocs: totalSub.get(p.id) ?? 0 }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const documentos: DocAluno[] = visiveis
    .filter((d: any) => (d.pasta_id ?? null) === alvo)
    .map((d: any) => ({ id: d.id, titulo: d.titulo, tipo_origem: d.tipo_origem, versaoAtualId: d.versao_atual_id }))

  const breadcrumb: { id: string; nome: string }[] = []
  let cur: string | null = alvo
  const seen = new Set<string>()
  while (cur && nomeDe.has(cur) && !seen.has(cur)) { seen.add(cur); breadcrumb.unshift({ id: cur, nome: nomeDe.get(cur)! }); cur = paiDe.get(cur) ?? null }

  // CAPA (thumb) + prévia (trechos) dos docs DESTE nível — mesma lógica do admin, mas só os visíveis.
  const thumbs: Record<string, string> = {}
  const previas: Record<string, { tipo: string; texto: string }[]> = {}
  try {
    const { urlAssinadaOriginal } = await import('./ingestao')
    const { gerarThumbDocumento } = await import('./thumb')
    const verIds = [...new Set(documentos.map((d) => d.versaoAtualId))]
    if (verIds.length) {
      const [trechos, vks] = await Promise.all([
        fetchAllByIn<any>(verIds, (c) => svc.from(T_TR).select('versao_id, ordem, texto, tipo').eq('tenant_id', tenantId).in('versao_id', c).lte('ordem', 24).order('versao_id', { ascending: true }).order('ordem', { ascending: true })),
        fetchAllByIn<any>(verIds, (c) => svc.from('simulado_conteudo_versoes').select('id, arquivo_key, hash_arquivo').eq('tenant_id', tenantId).in('id', c).order('id', { ascending: true })),
      ])
      const porVersao = new Map<string, { tipo: string; texto: string }[]>()
      for (const t of (trechos ?? [])) { const a = porVersao.get(t.versao_id) ?? []; if (a.length < 24) a.push({ tipo: String(t.tipo || 'paragrafo'), texto: String(t.texto || '').replace(/\s+/g, ' ').trim().slice(0, 320) }); porVersao.set(t.versao_id, a) }
      const hashPorVer = new Map<string, string>((vks ?? []).map((v: any) => [v.id, String(v.hash_arquivo || '')]))
      for (const d of documentos) { const arr = porVersao.get(d.versaoAtualId); if (arr?.length) previas[d.id] = arr }
      await Promise.all(documentos.map(async (d) => {
        if (d.tipo_origem !== 'docx') return
        const h8 = hashPorVer.get(d.versaoAtualId)?.slice(0, 8) || ''
        const turl = await urlAssinadaOriginal(`conteudo-thumbs/${tenantId}/${d.versaoAtualId}_${h8}_r1k.png`, 3600)
        if (turl) thumbs[d.id] = turl
        else void gerarThumbDocumento(tenantId, d.id).catch(() => {})
      }))
    }
  } catch { /* capa/prévia best-effort */ }

  return { pastas: subpastas, documentos, breadcrumb, thumbs, previas, pastaAtual: alvo }
  })
}

/** Carrega a leitura (trechos da versão atual + grifos do aluno). null se não publicado OU sem acesso. */
export async function carregarLeitura(documentoId: string, alunoId: string): Promise<Leitura | null> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId || !documentoId) return null
  const svc = createAdminClient()
  const doc = await fetchDocComAcesso(svc, tenantId, documentoId, 'id, titulo, status, versao_atual_id, deletado, pasta_id, herda_acesso, acesso_geral, tipo_origem, categoria')
  if (!doc || doc.deletado || doc.status !== 'publicado' || !doc.versao_atual_id || (doc as any).categoria !== 'conteudo') return null

  // Gate de acesso ESCOPADO via motor ÚNICO (acessoEfetivo): modo/oculto do doc + cadeia de ancestrais.
  if (!(await avaliarDocAluno(svc, tenantId, alunoId, doc)).permitido) return null

  const [trechos, anotacoes, ver] = await Promise.all([
    fetchAll<any>(() => svc.from(T_TR).select('uid, ordem, tipo, rotulo, texto').eq('tenant_id', tenantId).eq('versao_id', doc.versao_atual_id).order('ordem', { ascending: true })),
    listarAnotacoes(documentoId, alunoId),
    // tolerante à migração pendente: tenta html_rico+arquivo_key; se a coluna não existir, cai p/ arquivo_key.
    (async () => {
      const r = await svc.from('simulado_conteudo_versoes').select('html_rico, arquivo_key').eq('tenant_id', tenantId).eq('id', doc.versao_atual_id).maybeSingle()
      if (!r.error) return r.data
      const r2 = await svc.from('simulado_conteudo_versoes').select('arquivo_key').eq('tenant_id', tenantId).eq('id', doc.versao_atual_id).maybeSingle()
      return r2.data
    })(),
  ])
  const trechosL: TrechoLeitura[] = (trechos ?? []).map((t) => ({ uid: t.uid, ordem: t.ordem, tipo: t.tipo, rotulo: t.rotulo, texto: t.texto }))
  // HTML fiel: usa o `html_rico` da versão; se ainda não houver (docs importados antes deste recurso),
  // regenera a partir do original 1x e grava (cacheia na versão) sem tocar nos trechos/grifos.
  const html = (ver as any)?.html_rico
    || await regenerarHtmlRico(svc, tenantId, doc.versao_atual_id, (ver as any)?.arquivo_key ?? null, (doc as any).tipo_origem, trechosL)
  return { documentoId, titulo: doc.titulo, versaoId: doc.versao_atual_id, trechos: trechosL, html, anotacoes }
}

/**
 * Regenera o HTML rico de uma versão a partir do arquivo original + os uids dos trechos já existentes,
 * e grava em `html_rico` (cache). Não altera trechos nem anotações. Fallback estruturado se o original
 * não estiver disponível (ainda ancorável por uid, só sem a formatação inline).
 */
async function regenerarHtmlRico(svc: any, tenantId: string, versaoId: string, arquivoKey: string | null, tipoOrigem: string | undefined, trechos: TrechoLeitura[]): Promise<string> {
  const uids = trechos.map((t) => t.uid)
  let html = ''
  try {
    if (arquivoKey && (tipoOrigem === 'docx' || tipoOrigem === 'pdf' || tipoOrigem === 'html')) {
      const { baixarOriginal, converterParaHtml } = await import('./ingestao')
      const { injetarUidsNoHtml } = await import('./trechos')
      const bytes = await baixarOriginal(arquivoKey)
      if (bytes) {
        const conv = await converterParaHtml(bytes, tipoOrigem)
        if (conv.html) html = injetarUidsNoHtml(conv.html, uids)
      }
    }
  } catch { /* cai no fallback estruturado abaixo */ }
  if (!html) {
    // Fallback: HTML a partir dos trechos (ancorável por uid, sem formatação inline).
    const esc = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    html = trechos.map((t) => {
      const tag = t.tipo === 'titulo' ? 'h1' : t.tipo === 'capitulo' ? 'h2' : 'p'
      const rot = t.rotulo ? `<strong>${esc(t.rotulo)}</strong> ` : ''
      return `<${tag} data-uid="${t.uid}">${rot}${esc(t.texto)}</${tag}>`
    }).join('\n')
  }
  try { await svc.from('simulado_conteudo_versoes').update({ html_rico: html }).eq('tenant_id', tenantId).eq('id', versaoId) } catch { /* cache best-effort */ }
  return html
}

// Grifo GEOMÉTRICO sobre o PDF: página + retângulos normalizados (0..1). Alinha sobre o canvas sem bugar.
export interface GrifoPdf { id: string; pagina: number; rects: { x0: number; y0: number; x1: number; y1: number }[]; cor: string; tool: string; nota: string | null; texto: string | null }
export interface LeituraPdf { documentoId: string; titulo: string; versaoId: string; pdfUrl: string | null; grifos: GrifoPdf[] }

/**
 * Leitura FIEL (PDF do editor) do aluno: devolve o PDF pixel-perfeito (OnlyOffice, cacheado) + os grifos
 * do aluno (por página + retângulos normalizados). null se não publicado OU sem acesso. Server-only.
 */
export async function carregarLeituraPdf(documentoId: string, alunoId: string): Promise<LeituraPdf | null> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId || !documentoId) return null
  const svc = createAdminClient()
  const doc = await fetchDocComAcesso(svc, tenantId, documentoId, 'id, titulo, status, versao_atual_id, deletado, pasta_id, herda_acesso, acesso_geral, tipo_origem, categoria')
  if (!doc || doc.deletado || doc.status !== 'publicado' || !doc.versao_atual_id || (doc as any).categoria !== 'conteudo') return null
  if (!(await avaliarDocAluno(svc, tenantId, alunoId, doc)).permitido) return null

  const { gerarPdfDocumento } = await import('./thumb')
  const [pdfUrl, grifosRows] = await Promise.all([
    gerarPdfDocumento(tenantId, documentoId).catch(() => null),
    // tolerante à migração pendente: se a tabela não existir, trata como sem grifos.
    fetchAll<any>(() => svc.from('simulado_conteudo_grifos_pdf').select('id, pagina, rects, cor, tool, nota, texto').eq('tenant_id', tenantId).eq('documento_id', documentoId).eq('aluno_id', alunoId).order('id', { ascending: true })).catch(() => []),
  ])
  const grifos: GrifoPdf[] = (grifosRows ?? []).map((g) => ({
    id: g.id, pagina: g.pagina, rects: Array.isArray(g.rects) ? g.rects : [], cor: g.cor || 'y', tool: g.tool || 'hl', nota: g.nota ?? null, texto: g.texto ?? null,
  })).filter((g) => g.rects.length)
  return { documentoId, titulo: doc.titulo, versaoId: doc.versao_atual_id, pdfUrl, grifos }
}

/** URL assinada do arquivo ORIGINAL para o aluno BAIXAR — só se tiver acesso (gate). null se negado. */
export async function urlDownloadAluno(documentoId: string, alunoId: string): Promise<string | null> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId || !documentoId) return null
  const svc = createAdminClient()
  const doc = await fetchDocComAcesso(svc, tenantId, documentoId, 'id, status, deletado, versao_atual_id, pasta_id, herda_acesso, acesso_geral, categoria')
  if (!doc || doc.deletado || doc.status !== 'publicado' || !doc.versao_atual_id || (doc as any).categoria !== 'conteudo') return null
  // Gate + download exige permissão de BAIXAR (acessoEfetivo). Nega se não puder ler OU não puder baixar.
  const resDl = await avaliarDocAluno(svc, tenantId, alunoId, doc)
  if (!resDl.permitido || !resDl.permissoes.baixar) return null
  const { data: ver } = await svc.from('simulado_conteudo_versoes').select('arquivo_key').eq('tenant_id', tenantId).eq('id', doc.versao_atual_id).maybeSingle()
  if (!(ver as any)?.arquivo_key) return null
  const { urlAssinadaOriginal } = await import('./ingestao')
  return urlAssinadaOriginal((ver as any).arquivo_key, 600)
}

/** Registra/atualiza o progresso de leitura (histórico N15). */
export async function registrarLeituraAluno(documentoId: string, alunoId: string, versaoId: string, origem: 'biblioteca' | 'desafio' = 'biblioteca'): Promise<void> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return
  const svc = createAdminClient()
  await svc.from(T_LP).upsert({
    tenant_id: tenantId, aluno_id: alunoId, documento_id: documentoId, versao_id: versaoId, origem, ultima_leitura_em: new Date().toISOString(),
  }, { onConflict: 'tenant_id,aluno_id,documento_id' })
}
