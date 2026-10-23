import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { remember } from '@/lib/cache/relatorio-cache'
import { listarAnotacoes, type Anotacao } from './anotacoes'

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

// ─────────── CONTROLE DE ACESSO (modelo Drive: liberar p/ todos + grupos/alunos + herança) ───────────
// Regra por NÍVEL (pasta ou documento):
//   • acesso_geral='todos'         → liberado a TODOS neste nível.
//   • acesso_geral='restrito'      → só os grupos/alunos atribuídos (sem linhas = ninguém).
//   • acesso_geral null (padrão)   → SEM linhas = liberado a todos (base); COM linhas = só os atribuídos.
// HERANÇA (herda_acesso): o nó precisa liberar E, se herda_acesso≠false, o PAI também (recursivo pela
// cadeia pai_id). herda_acesso=false "corta" a herança (não exige os ancestrais acima dele).
// Tolerante: tabelas/colunas ausentes → tratado como liberado.
type AcessoGeral = 'todos' | 'restrito' | null | undefined

function matchAluno(grupos: Set<string> | undefined, estudantes: Set<string> | undefined, meusGrupos: Set<string>, estId: string): boolean {
  if (grupos && [...grupos].some((x) => meusGrupos.has(x))) return true
  if (estudantes && estudantes.has(estId)) return true
  return false
}

/** Este NÍVEL (pasta/doc) libera o aluno? (só o nível, sem herança). */
function nivelLibera(geral: AcessoGeral, grupos: Set<string> | undefined, estudantes: Set<string> | undefined, meusGrupos: Set<string>, estId: string): boolean {
  if (geral === 'todos') return true
  const temRows = (grupos?.size ?? 0) > 0 || (estudantes?.size ?? 0) > 0
  if (geral === 'restrito') return matchAluno(grupos, estudantes, meusGrupos, estId) // restrito: só os atribuídos
  if (!temRows) return true // null + sem linhas = liberado a todos (padrão)
  return matchAluno(grupos, estudantes, meusGrupos, estId) // null + com linhas = só os atribuídos
}

/**
 * Contexto de acesso do aluno: grupos dele + função `pastaAcessivel(pastaId)` que aplica a HERANÇA
 * (a pasta e todos os ancestrais via pai_id precisam liberar). Tolerante: tabelas ausentes → tudo liberado.
 */
async function contextoAcessoAluno(svc: any, tenantId: string, estId: string) {
  const { data: gm } = await svc.from('simulado_grupo_membros').select('grupo_id').eq('estudante_id', estId)
  const meusGrupos = new Set<string>(((gm as any[]) ?? []).map((r) => r.grupo_id))

  const pastas = await fetchAll<any>(() => svc.from(T_PASTA).select('id, pai_id, herda_acesso, acesso_geral')
    .eq('tenant_id', tenantId).eq('folder_area', 'conteudo').order('id', { ascending: true }))
  const paiDe = new Map<string, string | null>((pastas ?? []).map((p: any) => [p.id, p.pai_id ?? null]))
  const infoPasta = new Map<string, { herda: boolean; geral: AcessoGeral }>((pastas ?? []).map((p: any) => [p.id, { herda: p.herda_acesso !== false, geral: p.acesso_geral ?? null }]))
  const pastaIds = [...paiDe.keys()]

  const gruposPasta = new Map<string, Set<string>>()
  const estudPasta = new Map<string, Set<string>>()
  if (pastaIds.length) {
    try {
      const [pg, pe] = await Promise.all([
        fetchAllByIn<any>(pastaIds, (c) => svc.from('simulado_pasta_grupos').select('pasta_id, grupo_id').eq('tenant_id', tenantId).in('pasta_id', c).order('pasta_id', { ascending: true })),
        fetchAllByIn<any>(pastaIds, (c) => svc.from('simulado_pasta_estudantes').select('pasta_id, estudante_id').eq('tenant_id', tenantId).in('pasta_id', c).order('pasta_id', { ascending: true })),
      ])
      for (const r of pg as any[]) (gruposPasta.get(r.pasta_id) ?? gruposPasta.set(r.pasta_id, new Set()).get(r.pasta_id)!).add(r.grupo_id)
      for (const r of pe as any[]) (estudPasta.get(r.pasta_id) ?? estudPasta.set(r.pasta_id, new Set()).get(r.pasta_id)!).add(r.estudante_id)
    } catch { /* tabelas de acesso de pasta ausentes → sem restrição de pasta */ }
  }

  const memo = new Map<string, boolean>()
  function pastaAcessivel(pastaId: string | null): boolean {
    if (!pastaId) return true // raiz = sempre acessível
    const cached = memo.get(pastaId); if (cached !== undefined) return cached
    memo.set(pastaId, true) // provisório (corta ciclos em dados corrompidos)
    const info = infoPasta.get(pastaId) ?? { herda: true, geral: null }
    const propria = nivelLibera(info.geral, gruposPasta.get(pastaId), estudPasta.get(pastaId), meusGrupos, estId)
    // herda_acesso=false corta a cadeia (não exige o pai); senão, o pai também precisa liberar.
    const ok = propria && (info.herda === false || pastaAcessivel(paiDe.get(pastaId) ?? null))
    memo.set(pastaId, ok)
    return ok
  }

  return { meusGrupos, pastaAcessivel }
}

/**
 * Gate de UM documento (caminho de abrir 1 doc) — ESCOPADO: resolve só a atribuição do doc + a cadeia de
 * ancestrais da pasta dele (não a árvore inteira nem todas as atribuições do tenant). Muito menos egress
 * que `contextoAcessoAluno` no caminho `carregarLeitura` (1 doc por acesso, via iframe, por aluno).
 */
async function docAcessivelAluno(svc: any, tenantId: string, estId: string, doc: { id: string; pasta_id: string | null; herda_acesso?: boolean; acesso_geral?: AcessoGeral }): Promise<boolean> {
  const { data: gm } = await svc.from('simulado_grupo_membros').select('grupo_id').eq('estudante_id', estId)
  const meusGrupos = new Set<string>(((gm as any[]) ?? []).map((r) => r.grupo_id))
  // nível do próprio documento
  const { grupos: dG, estud: dE } = await atribuicoesDocs(svc, tenantId, [doc.id])
  if (!nivelLibera(doc.acesso_geral ?? null, dG.get(doc.id), dE.get(doc.id), meusGrupos, estId)) return false
  if (doc.herda_acesso === false || !doc.pasta_id) return true // não herda ou sem pasta → não exige ancestrais
  // cadeia de ancestrais (pastas são poucas → carregar só id/pai_id/herança é barato)
  const pastas = await fetchAll<any>(() => svc.from(T_PASTA).select('id, pai_id, herda_acesso, acesso_geral').eq('tenant_id', tenantId).eq('folder_area', 'conteudo').order('id', { ascending: true }))
  const paiDe = new Map<string, string | null>((pastas ?? []).map((p: any) => [p.id, p.pai_id ?? null]))
  const infoPasta = new Map<string, { herda: boolean; geral: AcessoGeral }>((pastas ?? []).map((p: any) => [p.id, { herda: p.herda_acesso !== false, geral: p.acesso_geral ?? null }]))
  // só as pastas da cadeia precisam das atribuições
  const chain: string[] = []; const seen = new Set<string>(); let cur: string | null = doc.pasta_id
  while (cur && !seen.has(cur)) { seen.add(cur); chain.push(cur); cur = paiDe.get(cur) ?? null }
  if (!chain.length) return true
  const gruposPasta = new Map<string, Set<string>>(); const estudPasta = new Map<string, Set<string>>()
  try {
    const [pg, pe] = await Promise.all([
      fetchAllByIn<any>(chain, (c) => svc.from('simulado_pasta_grupos').select('pasta_id, grupo_id').eq('tenant_id', tenantId).in('pasta_id', c).order('pasta_id', { ascending: true })),
      fetchAllByIn<any>(chain, (c) => svc.from('simulado_pasta_estudantes').select('pasta_id, estudante_id').eq('tenant_id', tenantId).in('pasta_id', c).order('pasta_id', { ascending: true })),
    ])
    for (const r of pg as any[]) (gruposPasta.get(r.pasta_id) ?? gruposPasta.set(r.pasta_id, new Set()).get(r.pasta_id)!).add(r.grupo_id)
    for (const r of pe as any[]) (estudPasta.get(r.pasta_id) ?? estudPasta.set(r.pasta_id, new Set()).get(r.pasta_id)!).add(r.estudante_id)
  } catch { return true } // tabelas de acesso ausentes → liberado
  // Sobe pela cadeia respeitando herda_acesso de cada pasta.
  let pid: string | null = doc.pasta_id
  const visit = new Set<string>()
  while (pid && !visit.has(pid)) {
    visit.add(pid)
    const info = infoPasta.get(pid) ?? { herda: true, geral: null }
    if (!nivelLibera(info.geral, gruposPasta.get(pid), estudPasta.get(pid), meusGrupos, estId)) return false
    if (info.herda === false) return true
    pid = paiDe.get(pid) ?? null
  }
  return true
}

/** Atribuições (grupos/estudantes) por documento de conteúdo. Tolerante a tabelas ausentes. */
async function atribuicoesDocs(svc: any, tenantId: string, docIds: string[]) {
  const grupos = new Map<string, Set<string>>()
  const estud = new Map<string, Set<string>>()
  if (!docIds.length) return { grupos, estud }
  try {
    const [dg, de] = await Promise.all([
      fetchAllByIn<any>(docIds, (c) => svc.from('simulado_conteudo_documento_grupos').select('documento_id, grupo_id').eq('tenant_id', tenantId).in('documento_id', c).order('documento_id', { ascending: true })),
      fetchAllByIn<any>(docIds, (c) => svc.from('simulado_conteudo_documento_estudantes').select('documento_id, estudante_id').eq('tenant_id', tenantId).in('documento_id', c).order('documento_id', { ascending: true })),
    ])
    for (const r of dg as any[]) (grupos.get(r.documento_id) ?? grupos.set(r.documento_id, new Set()).get(r.documento_id)!).add(r.grupo_id)
    for (const r of de as any[]) (estud.get(r.documento_id) ?? estud.set(r.documento_id, new Set()).get(r.documento_id)!).add(r.estudante_id)
  } catch { /* tabelas de acesso de doc ausentes → sem restrição de doc */ }
  return { grupos, estud }
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
    fetchAll<any>(() => svc.from(T_DOC).select('id, titulo, tipo_origem, versao_atual_id, atualizado_em, pasta_id, herda_acesso, acesso_geral').eq('tenant_id', tenantId).eq('status', 'publicado').eq('deletado', false).eq('categoria', 'conteudo').not('versao_atual_id', 'is', null).order('atualizado_em', { ascending: false }).order('id', { ascending: true })),
  ])
  const pastas = (pastasRaw ?? []).filter((p: any) => !p.deletado)
  const docs = docsRaw ?? []
  const paiDe = new Map<string, string | null>(pastas.map((p: any) => [p.id, p.pai_id ?? null]))
  const nomeDe = new Map<string, string>(pastas.map((p: any) => [p.id, p.nome]))
  const corDe = new Map<string, string | null>(pastas.map((p: any) => [p.id, p.cor ?? null]))

  const { meusGrupos, pastaAcessivel } = await contextoAcessoAluno(svc, tenantId, alunoId)
  const { grupos: dGrupos, estud: dEstud } = await atribuicoesDocs(svc, tenantId, docs.map((d: any) => d.id))
  const visiveis = docs.filter((d: any) => nivelLibera(d.acesso_geral ?? null, dGrupos.get(d.id), dEstud.get(d.id), meusGrupos, alunoId)
    && (d.herda_acesso === false || pastaAcessivel(d.pasta_id ?? null)))

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
  const { data: doc } = await svc.from(T_DOC)
    .select('id, titulo, status, versao_atual_id, deletado, pasta_id, herda_acesso, acesso_geral, tipo_origem, categoria')
    .eq('tenant_id', tenantId).eq('id', documentoId).maybeSingle()
  if (!doc || doc.deletado || doc.status !== 'publicado' || !doc.versao_atual_id || (doc as any).categoria !== 'conteudo') return null

  // Gate de acesso ESCOPADO (nível do doc + cadeia de ancestrais, respeitando herança e "liberar p/ todos").
  if (!(await docAcessivelAluno(svc, tenantId, alunoId, { id: documentoId, pasta_id: (doc as any).pasta_id ?? null, herda_acesso: (doc as any).herda_acesso, acesso_geral: (doc as any).acesso_geral ?? null }))) return null

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
  const { data: doc } = await svc.from(T_DOC)
    .select('id, titulo, status, versao_atual_id, deletado, pasta_id, herda_acesso, acesso_geral, tipo_origem, categoria')
    .eq('tenant_id', tenantId).eq('id', documentoId).maybeSingle()
  if (!doc || doc.deletado || doc.status !== 'publicado' || !doc.versao_atual_id || (doc as any).categoria !== 'conteudo') return null
  if (!(await docAcessivelAluno(svc, tenantId, alunoId, { id: documentoId, pasta_id: (doc as any).pasta_id ?? null, herda_acesso: (doc as any).herda_acesso, acesso_geral: (doc as any).acesso_geral ?? null }))) return null

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
  const { data: doc } = await svc.from(T_DOC)
    .select('id, status, deletado, versao_atual_id, pasta_id, herda_acesso, acesso_geral, categoria')
    .eq('tenant_id', tenantId).eq('id', documentoId).maybeSingle()
  if (!doc || doc.deletado || doc.status !== 'publicado' || !doc.versao_atual_id || (doc as any).categoria !== 'conteudo') return null
  if (!(await docAcessivelAluno(svc, tenantId, alunoId, { id: documentoId, pasta_id: (doc as any).pasta_id ?? null, herda_acesso: (doc as any).herda_acesso, acesso_geral: (doc as any).acesso_geral ?? null }))) return null
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
