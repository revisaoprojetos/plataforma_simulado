import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { ehTestadorGlobal } from '@/lib/sistema/testadores-globais'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { remember, esquecer } from '@/lib/cache/relatorio-cache'
import { docBloqueadoNoCronograma } from '@/lib/cronograma/adaptativo/liberacao'
import { listarAnotacoes, type Anotacao } from './anotacoes'
import { resolverAreas, produtoValidoDoAluno, filtrarHtmlPorAreas, type ResolucaoAreas } from './areas'
import { mapaPastas, resolverCapaDoc } from './capa-pagina'
import { converterTagsEmSelos } from '@/lib/leitura/tags-em-selos'
import { envolverSecoesPorTitulo } from '@/lib/leitura/titulos-expansivos'
import { lerCfgMetas } from '@/lib/cronograma/adaptativo/config-metas'
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

/**
 * Decisão de ACESSO de LEITURA (pode abrir este doc?), CACHEADA 60s por (tenant, aluno, doc).
 * = testador global (fura "não publicado" + gate) OU (publicado E `avaliarDocAluno`).
 * MOTIVO (backend-first): abrir uma meta/material re-roda o motor de acesso (`motorAcesso`: carrega
 * TODAS as pastas + atribuições ≈ 6 queries) a cada vez. O aluno abre materiais em sequência (metas do
 * cronograma, reabrir), então sem cache cada clique paga o motor inteiro. 60s = mesma classe de defasagem
 * do cache da árvore (90s) e do tenant (60s): mudança de acesso/publicação aparece em até 60s, sem
 * invalidação manual. Degrada sozinho se o Redis estiver fora (cai em memória/cálculo direto).
 */
async function podeLerDoc(svc: any, tenantId: string, alunoId: string, doc: any): Promise<boolean> {
  return remember<boolean>(`acesso-leitura:${tenantId}:${alunoId}:${doc.id}`, 60, async () => {
    if (await ehTestadorGlobal({ tenantId, estudanteId: alunoId })) return true
    if (doc.status !== 'publicado') return false
    if ((await avaliarDocAluno(svc, tenantId, alunoId, doc)).permitido) return true
    // O documento é AULA (ativa e já liberada) do currículo de um extensivo do aluno → libera a leitura,
    // mesmo fora das pastas liberadas (o configurador do produto pode apontar a qualquer material).
    try {
      const [{ docLiberadoPorProduto }, { acessoAoProduto }] = await Promise.all([
        import('@/lib/produtos/curriculo-aluno'), import('@/lib/produtos/aluno'),
      ])
      return await docLiberadoPorProduto(svc, tenantId, alunoId, doc.id,
        async (produtoId) => !!(await acessoAoProduto(svc, tenantId, alunoId, produtoId)))
    } catch { return false }
  })
}

/**
 * O aluno pode ABRIR este documento no leitor? Mesma decisão do leitor (doc publicado/visível + gate de pasta e documento
 * com herança pai_id, cache 60s) — usada para avisar ANTES de navegar (ex.: "Abrir material" do cronograma Revisão).
 * Não verifica a liberação por data do Adaptativo (isso o leitor faz ao abrir).
 */
export async function alunoPodeAbrirDocumento(tenantId: string, alunoId: string, documentoId: string): Promise<boolean> {
  if (!tenantId || !documentoId) return false
  const svc = createAdminClient()
  const doc = await fetchDocComAcesso(svc, tenantId, documentoId, 'id, titulo, status, versao_atual_id, deletado, pasta_id, herda_acesso, acesso_geral, tipo_origem, categoria')
  if (!doc || doc.deletado || !doc.versao_atual_id || !['conteudo', 'jurisclub'].includes((doc as any).categoria)) return false
  return podeLerDoc(svc, tenantId, alunoId, doc)
}

export interface PastaAluno { id: string; nome: string; cor: string | null; totalDocs: number; capaUrl?: string | null }
export interface DocAluno { id: string; titulo: string; tipo_origem: string; versaoAtualId: string }
export interface ArvoreAluno {
  pastas: PastaAluno[]; documentos: DocAluno[]; breadcrumb: { id: string; nome: string }[]
  thumbs: Record<string, string>; previas: Record<string, { tipo: string; texto: string }[]>; pastaAtual: string | null
}

/**
 * Catálogo-RAIZ do aluno (backend-first, SESSION-INDEPENDENT): só as pastas-raiz de conteúdo
 * acessíveis, já com a contagem de documentos visíveis na subárvore. Difere de `arvoreBibliotecaAluno`
 * em dois pontos cruciais p/ custo: (1) NÃO computa thumbs/prévias (as URLs assinadas + trechos são a
 * parte CARA/egress) e (2) recebe `svc/tenantId/estId` explícitos — não depende de `getCurrentTenantId()`
 * nem do cache de request — então roda do render, da escrita e do WORKER (cron). Reusa o motor de acesso.
 * Ideal para alimentar o snapshot de Cursos. Ver docs/ARQUITETURA-BACKEND-FIRST.md.
 */
export async function catalogoRaizAluno(svc: any, tenantId: string, estId: string): Promise<PastaAluno[]> {
  if (!tenantId || !estId) return []
  const pastasRaw = await fetchTol<any>(
    () => svc.from(T_PASTA).select('id, nome, pai_id, cor, deletado').eq('tenant_id', tenantId).eq('folder_area', 'conteudo').eq('is_folder', true).order('id', { ascending: true }),
    () => svc.from(T_PASTA).select('id, nome, pai_id, cor, deletado').eq('tenant_id', tenantId).eq('folder_area', 'conteudo').order('id', { ascending: true }),
  )
  const pastas = (pastasRaw ?? []).filter((p: any) => !p.deletado)
  if (!pastas.length) return []
  // projeção mínima: só colunas de acesso + pasta_id (nada de html/trechos/versão p/ capa).
  const docs = await fetchTol<any>(
    () => svc.from(T_DOC).select('id, pasta_id, herda_acesso, acesso_geral, modo_acesso, oculto').eq('tenant_id', tenantId).eq('status', 'publicado').eq('deletado', false).eq('categoria', 'conteudo').not('versao_atual_id', 'is', null).order('id', { ascending: true }),
    () => svc.from(T_DOC).select('id, pasta_id, herda_acesso, acesso_geral').eq('tenant_id', tenantId).eq('status', 'publicado').eq('deletado', false).eq('categoria', 'conteudo').not('versao_atual_id', 'is', null).order('id', { ascending: true }),
  )
  const paiDe = new Map<string, string | null>(pastas.map((p: any) => [p.id, p.pai_id ?? null]))
  const motor = await motorAcesso(svc, tenantId, estId)
  const atribDocs = await carregarAtribuicoes(svc, tenantId, 'doc', (docs ?? []).map((d: any) => d.id))
  const visiveis = (docs ?? []).filter((d: any) => motor.avaliarDoc(d, atribDocs.get(d.id) ?? []).permitido)
  // docs visíveis por subárvore: cada doc incrementa a pasta que o contém e TODAS as ancestrais.
  const totalSub = new Map<string, number>()
  for (const d of visiveis) {
    let cur: string | null = d.pasta_id ?? null; const seen = new Set<string>()
    while (cur && !seen.has(cur)) { seen.add(cur); totalSub.set(cur, (totalSub.get(cur) ?? 0) + 1); cur = paiDe.get(cur) ?? null }
  }
  return pastas
    .filter((p: any) => (p.pai_id ?? null) === null && motor.pastaAcessivel(p.id) && (totalSub.get(p.id) ?? 0) > 0)
    .map((p: any) => ({ id: p.id, nome: p.nome, cor: p.cor ?? null, totalDocs: totalSub.get(p.id) ?? 0 }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
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
    // capa/página (migração 20261105010000) são tolerantes: sem as colunas cai no SELECT legado.
    fetchTol<any>(
      () => svc.from(T_PASTA).select('id, nome, pai_id, cor, deletado, capa_url, capa_modo').eq('tenant_id', tenantId).eq('folder_area', 'conteudo').eq('is_folder', true).order('id', { ascending: true }),
      () => svc.from(T_PASTA).select('id, nome, pai_id, cor, deletado').eq('tenant_id', tenantId).eq('folder_area', 'conteudo').eq('is_folder', true).order('id', { ascending: true }),
    ),
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
    .map((p: any) => ({ id: p.id, nome: p.nome, cor: p.cor ?? null, totalDocs: totalSub.get(p.id) ?? 0, capaUrl: p.capa_url ?? null }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const documentos: DocAluno[] = visiveis
    .filter((d: any) => (d.pasta_id ?? null) === alvo)
    .map((d: any) => ({ id: d.id, titulo: d.titulo, tipo_origem: d.tipo_origem, versaoAtualId: d.versao_atual_id }))

  const breadcrumb: { id: string; nome: string }[] = []
  let cur: string | null = alvo
  const seen = new Set<string>()
  while (cur && nomeDe.has(cur) && !seen.has(cur)) { seen.add(cur); breadcrumb.unshift({ id: cur, nome: nomeDe.get(cur)! }); cur = paiDe.get(cur) ?? null }

  // CAPA REMOVIDA dos cards de material (decisão do usuário): NÃO geramos mais a thumb nem a URL
  // assinada, e NÃO disparamos regeneração — senão a capa "voltava" (o loader recriava a miniatura da
  // 1ª página mesmo nos materiais já reimportados "limpos"). Os cards caem no ícone do tipo (SeloTipo).
  // Mantemos só a PRÉVIA (trechos de texto). Bônus: corta a URL assinada por doc + a regeneração (egress).
  const thumbs: Record<string, string> = {}
  // ...EXCETO a CAPA CUSTOMIZADA que o admin define (própria do documento ou da pasta em lote): essa é uma imagem escolhida, não a
  // miniatura automática, então volta a aparecer. Sem capa customizada, o card continua no ícone do tipo.
  try {
    if (documentos.length) {
      const capaDoc = new Map<string, string | null>()
      for (const r of (await fetchAllByIn<any>(documentos.map((d) => d.id), (c) => svc.from(T_DOC).select('id, capa_url').eq('tenant_id', tenantId).in('id', c).order('id', { ascending: true }))) ?? []) capaDoc.set(r.id, r.capa_url ?? null)
      const porIdCP = mapaPastas(pastas.map((p: any) => ({ id: p.id, pai_id: p.pai_id ?? null, nome: p.nome, capa_url: p.capa_url ?? null, capa_modo: p.capa_modo ?? null })))
      const pastaDoDoc = new Map<string, string | null>(visiveis.map((d: any) => [d.id, d.pasta_id ?? null]))
      for (const d of documentos) { const r = resolverCapaDoc(capaDoc.get(d.id), pastaDoDoc.get(d.id) ?? null, porIdCP); if (r.valor) thumbs[d.id] = r.valor }
    }
  } catch { /* sem a coluna capa_url (migração pendente) */ }
  const previas: Record<string, { tipo: string; texto: string }[]> = {}
  try {
    const verIds = [...new Set(documentos.map((d) => d.versaoAtualId))]
    if (verIds.length) {
      const trechos = await fetchAllByIn<any>(verIds, (c) => svc.from(T_TR).select('versao_id, ordem, texto, tipo').eq('tenant_id', tenantId).in('versao_id', c).lte('ordem', 24).order('versao_id', { ascending: true }).order('ordem', { ascending: true }))
      const porVersao = new Map<string, { tipo: string; texto: string }[]>()
      for (const t of (trechos ?? [])) { const a = porVersao.get(t.versao_id) ?? []; if (a.length < 24) a.push({ tipo: String(t.tipo || 'paragrafo'), texto: String(t.texto || '').replace(/\s+/g, ' ').trim().slice(0, 320) }); porVersao.set(t.versao_id, a) }
      for (const d of documentos) { const arr = porVersao.get(d.versaoAtualId); if (arr?.length) previas[d.id] = arr }
    }
  } catch { /* prévia best-effort */ }

  return { pastas: subpastas, documentos, breadcrumb, thumbs, previas, pastaAtual: alvo }
  })
}

/** Carrega a leitura (trechos da versão atual + grifos do aluno). null se não publicado OU sem acesso. */
/** Áreas de visibilidade do documento p/ ESTE aluno (e produto pelo qual abriu, se válido). Testador vê tudo. */
async function areasDoAluno(svc: any, tenantId: string, alunoId: string, documentoId: string, produtoId?: string | null): Promise<ResolucaoAreas> {
  const [verTudo, prod] = await Promise.all([ehTestadorGlobal({ tenantId, estudanteId: alunoId }).catch(() => false), produtoValidoDoAluno(tenantId, alunoId, produtoId)])
  return resolverAreas(svc, tenantId, alunoId, documentoId, { produtoId: prod, verTudo: !!verTudo })
}

export async function carregarLeitura(documentoId: string, alunoId: string, opts: { produtoId?: string | null } = {}): Promise<Leitura | null> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId || !documentoId) return null
  const svc = createAdminClient()
  const doc = await fetchDocComAcesso(svc, tenantId, documentoId, 'id, titulo, status, versao_atual_id, deletado, pasta_id, herda_acesso, acesso_geral, tipo_origem, categoria')
  if (!doc || doc.deletado || !doc.versao_atual_id || !['conteudo', 'jurisclub'].includes((doc as any).categoria)) return null
  // TESTADOR GLOBAL: acesso total — fura "não publicado" e o gate de acesso. Fast-path sem query se o
  // tenant não tiver testadores. Demais guardas (deletado/categoria/versão) continuam valendo.
  const ehTest = await ehTestadorGlobal({ tenantId, estudanteId: alunoId })
  if (!ehTest) {
    if (doc.status !== 'publicado') return null
    // Gate de acesso ESCOPADO via motor ÚNICO (acessoEfetivo): modo/oculto do doc + cadeia de ancestrais.
    if (!(await avaliarDocAluno(svc, tenantId, alunoId, doc)).permitido) return null
    if (await docBloqueadoNoCronograma(svc, tenantId, alunoId, doc.id)) return null // liberação por data do Cronograma Adaptativo
  }

  // A parte CARA (trechos + HTML rico da versão) é IDÊNTICA p/ todos os alunos e depende SÓ de
  // (documento_id, versão). Cacheada 300s pela chave c/ versao_atual_id → nova versão (salvar/editar no
  // admin) muda a chave e invalida sozinho (sem invalidação manual). Os GRIFOS/anotações são POR-ALUNO →
  // lidos à parte, em paralelo, e NUNCA entram no cache compartilhado. Tolerante a Redis ausente (remember
  // cai no cálculo). Forma do retorno idêntica à anterior.
  const [docPart, anotacoes] = await Promise.all([
    remember<{ trechos: TrechoLeitura[]; html: string }>(`leitura-doc:${tenantId}:${documentoId}:${doc.versao_atual_id}`, 300, async () => {
      const [trechos, ver] = await Promise.all([
        fetchAll<any>(() => svc.from(T_TR).select('uid, ordem, tipo, rotulo, texto').eq('tenant_id', tenantId).eq('versao_id', doc.versao_atual_id).order('ordem', { ascending: true })),
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
      return { trechos: trechosL, html }
    }),
    listarAnotacoes(documentoId, alunoId),
  ])
  // ÁREAS DE VISIBILIDADE: o cache acima é igual p/ todos; o filtro por aluno roda DEPOIS (nada restrito entra no cache
  // por aluno e nada oculto sai do servidor). Trechos/anotações das áreas removidas saem junto.
  const areas = await areasDoAluno(svc, tenantId, alunoId, documentoId, opts.produtoId)
  if (areas.temAreas) {
    const f = filtrarHtmlPorAreas(docPart.html, areas.ocultas, areas.blocos, areas.estiloPadrao)
    return {
      documentoId, titulo: doc.titulo, versaoId: doc.versao_atual_id, html: f.html,
      trechos: docPart.trechos.filter((t) => !f.uidsRemovidos.has(t.uid)),
      anotacoes: anotacoes.filter((a) => !f.uidsRemovidos.has(a.trecho_uid)),
    }
  }
  return { documentoId, titulo: doc.titulo, versaoId: doc.versao_atual_id, trechos: docPart.trechos, html: docPart.html, anotacoes }
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
export interface LeituraPdf { documentoId: string; titulo: string; versaoId: string; pdfUrl: string | null; grifos: GrifoPdf[]; mostrarLegenda: boolean }

/**
 * Leitura FIEL (PDF do editor) do aluno: devolve o PDF pixel-perfeito (OnlyOffice, cacheado) + os grifos
 * do aluno (por página + retângulos normalizados). null se não publicado OU sem acesso. Server-only.
 */
export async function carregarLeituraPdf(documentoId: string, alunoId: string, opts: { produtoId?: string | null } = {}): Promise<LeituraPdf | null> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId || !documentoId) return null
  const svc = createAdminClient()
  const doc = await fetchDocComAcesso(svc, tenantId, documentoId, 'id, titulo, status, versao_atual_id, deletado, pasta_id, herda_acesso, acesso_geral, tipo_origem, categoria')
  if (!doc || doc.deletado || !doc.versao_atual_id || !['conteudo', 'jurisclub'].includes((doc as any).categoria)) return null
  // Acesso (testador OU publicado+gate) — decisão cacheada 60s (ver `podeLerDoc`).
  if (!(await podeLerDoc(svc, tenantId, alunoId, doc))) return null
  if (await docBloqueadoNoCronograma(svc, tenantId, alunoId, doc.id)) return null // liberação por data do Cronograma Adaptativo

  const { gerarPdfDocumento } = await import('./thumb')
  const areasPdf = await areasDoAluno(svc, tenantId, alunoId, documentoId, opts.produtoId)
  // O PDF (OnlyOffice→PDF, já cacheado em storage) + a URL assinada são IGUAIS p/ todos os alunos e
  // dependem só da versão → cacheados 300s pela chave c/ versao_atual_id (nova versão = chave nova, invalida
  // sozinho). A URL assinada vale 3600s, então 300s NÃO a expira (mesma lógica das thumbs). Os GRIFOS são
  // POR-ALUNO → lidos à parte, fora do cache compartilhado. Tolerante a Redis ausente (remember cai no cálculo).
  const [pdfUrl, grifosRows, cfgRow] = await Promise.all([
    // Falha (conversão DOCX→PDF fora/lenta) NÃO entra no cache: `undefined` não é guardado pelo remember —
    // antes o null ficava 5 min em cache e o "Tentar de novo" do leitor repetia o erro sem tentar converter.
    remember<string | undefined>(`leitura-pdf:${tenantId}:${documentoId}:${doc.versao_atual_id}${areasPdf.temAreas ? `:a${areasPdf.variante}` : ''}`, 300, async () => (await gerarPdfDocumento(tenantId, documentoId, areasPdf).catch(() => null)) ?? undefined).then((u) => u ?? null),
    // tolerante à migração pendente: se a tabela não existir, trata como sem grifos.
    fetchAll<any>(() => svc.from('simulado_conteudo_grifos_pdf').select('id, pagina, rects, cor, tool, nota, texto').eq('tenant_id', tenantId).eq('documento_id', documentoId).eq('aluno_id', alunoId).order('id', { ascending: true })).catch(() => []),
    // Toggle da legenda de categorias (LegProc) por documento. Tolerante à migração pendente: se a coluna
    // legenda_categorias ainda não existe (erro) → null → legenda OCULTA (padrão da Biblioteca).
    (async () => { try { const r = await svc.from('simulado_conteudo_documentos').select('legenda_categorias').eq('tenant_id', tenantId).eq('id', documentoId).maybeSingle(); return r.error ? null : r.data } catch { return null } })(),
  ])
  const grifos: GrifoPdf[] = (grifosRows ?? []).map((g) => ({
    id: g.id, pagina: g.pagina, rects: Array.isArray(g.rects) ? g.rects : [], cor: g.cor || 'y', tool: g.tool || 'hl', nota: g.nota ?? null, texto: g.texto ?? null,
  })).filter((g) => g.rects.length)
  return { documentoId, titulo: doc.titulo, versaoId: doc.versao_atual_id, pdfUrl, grifos, mostrarLegenda: !!(cfgRow as any)?.legenda_categorias }
}

// ─────────── MÍDIA (vídeo/áudio) do aluno ───────────
// Player NATIVO da Biblioteca. O gate é IDÊNTICO a `carregarLeituraPdf` (fetchDocComAcesso + testador
// global fast-path + status publicado + avaliarDocAluno). Retorna `null` quando o doc não é mídia
// (vídeo/áudio) — assim o chamador (page do aluno) cai no fluxo de PDF/leitura normal sem ramo extra.
export interface MidiaAluno {
  documentoId: string; titulo: string; versaoId: string
  tipoOrigem: string; kind: 'video' | 'audio'
  /** URL assinada do arquivo ORIGINAL (1h). null se o storage não gerar o link. */ url: string | null
  /** Extensão do arquivo_key (minúscula; '' se não houver). */ ext: string
}

export async function carregarMidiaAluno(documentoId: string, alunoId: string): Promise<MidiaAluno | null> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId || !documentoId) return null
  const svc = createAdminClient()
  const doc = await fetchDocComAcesso(svc, tenantId, documentoId, 'id, titulo, status, versao_atual_id, deletado, pasta_id, herda_acesso, acesso_geral, tipo_origem, categoria')
  if (!doc || doc.deletado || !doc.versao_atual_id || !['conteudo', 'jurisclub'].includes((doc as any).categoria)) return null
  // Só vídeo/áudio têm player aqui; qualquer outro tipo → null (o chamador abre o leitor de PDF normal).
  const tipoOrigem = String((doc as any).tipo_origem ?? '')
  if (tipoOrigem !== 'video' && tipoOrigem !== 'audio') return null
  const kind = tipoOrigem as 'video' | 'audio'
  // Acesso (testador OU publicado+gate) — decisão cacheada 60s (ver `podeLerDoc`).
  if (!(await podeLerDoc(svc, tenantId, alunoId, doc))) return null
  if (await docBloqueadoNoCronograma(svc, tenantId, alunoId, doc.id)) return null // liberação por data do Cronograma Adaptativo
  const { data: ver } = await svc.from('simulado_conteudo_versoes').select('arquivo_key').eq('tenant_id', tenantId).eq('id', doc.versao_atual_id).maybeSingle()
  const arquivoKey = (ver as any)?.arquivo_key as string | undefined
  if (!arquivoKey) return null
  const { urlAssinadaOriginal } = await import('./ingestao')
  const url = await urlAssinadaOriginal(arquivoKey, 3600)
  const ext = arquivoKey.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''
  return { documentoId, titulo: doc.titulo, versaoId: doc.versao_atual_id, tipoOrigem, kind, url, ext }
}

// ─────────── LOADER UNIFICADO (abrir material: mídia OU PDF) ───────────
// A página do aluno (biblioteca/[id]) chamava carregarMidiaAluno E carregarLeituraPdf em sequência:
// cada uma re-buscava o MESMO doc e re-rodava o gate. Este loader faz tudo UMA vez — 1 fetch do doc +
// 1 decisão de acesso (cacheada) — e ramifica por tipo. Corta ~metade dos round-trips por abertura.
/**
 * LegProc em TEXTO: garante que o `html_rico` da versão é a conversão que PRESERVA a formatação do professor
 * (realce/sombreamento/cor → span.ed n|c|p|x, fundo/alinhamento de parágrafo e célula). Idempotente (marcador
 * `<!--lp1-->`); gera 1x (~2s) a partir do .docx original, com os uids dos trechos (estrutura de blocos idêntica
 * à do mammoth → a ancoragem dos grifos não muda). Falhou → mantém o html_rico atual (nunca derruba a leitura).
 */
const MARCA_LP = '<!--lp4-->' // sobe a cada mudança do conversor (lp1 = versão com o bug do sombreamento de parágrafo) → regenera sozinho
// Preparos em andamento (1 por versão): vários alunos abrindo o mesmo doc grande NÃO disparam várias conversões/reconciliações.
const emPreparoLp = new Map<string, Promise<boolean>>()
/** Garante o texto convertido SEM travar o aluno: espera até `orcamentoMs`; passado isso o preparo continua em segundo plano
 *  (o próximo acesso já o encontra pronto) e devolve null → o chamador usa a reserva (PDF/texto simples). */
async function prepararHtmlLegprocComOrcamento(svc: any, tenantId: string, documentoId: string, versaoId: string, tipoOrigem: string | undefined, orcamentoMs = 20000): Promise<boolean | null> {
  const chave = `${tenantId}:${versaoId}`
  let p = emPreparoLp.get(chave)
  if (!p) {
    p = garantirHtmlLegproc(svc, tenantId, documentoId, versaoId, tipoOrigem).finally(() => { emPreparoLp.delete(chave) })
    emPreparoLp.set(chave, p)
  }
  return Promise.race([p, new Promise<null>((res) => setTimeout(() => res(null), orcamentoMs))])
}

export async function garantirHtmlLegproc(svc: any, tenantId: string, documentoId: string, versaoId: string, tipoOrigem: string | undefined): Promise<boolean> {
  try {
    if (tipoOrigem !== 'docx') return false
    // Checa o marcador SEM trazer o html (1+ MB) a cada abertura: só devolve a linha se já começar com a marca atual.
    const { data: marcado } = await svc.from('simulado_conteudo_versoes').select('id').eq('tenant_id', tenantId).eq('id', versaoId).like('html_rico', `${MARCA_LP}%`).maybeSingle()
    if (marcado) return true
    const { data: ver } = await svc.from('simulado_conteudo_versoes').select('arquivo_key').eq('tenant_id', tenantId).eq('id', versaoId).maybeSingle()
    if (!ver?.arquivo_key) return false
    const { baixarOriginal } = await import('./ingestao')
    const { injetarUidsNoHtml } = await import('./trechos')
    const { docxParaHtmlLegproc } = await import('./legproc-html')
    const bytes = await baixarOriginal(ver.arquivo_key)
    if (!bytes) return false
    const htmlBase = await docxParaHtmlLegproc(bytes)
    const lerTrechos = () => fetchAll<any>(() => svc.from(T_TR).select('uid, ordem').eq('tenant_id', tenantId).eq('versao_id', versaoId).order('ordem', { ascending: true }))
    let trechos = await lerTrechos()
    if (!trechos?.length) {
      // Versão ainda SEM trechos (nunca reconciliada, ex.: salva pelo editor): cria agora a partir do HTML novo
      // (mesma estrutura de blocos), carregando os uids da versão anterior mais próxima que tenha trechos — os
      // grifos dos alunos continuam ancorados.
      const { reconciliarVersao } = await import('./reconciliacao')
      const { data: atual } = await svc.from('simulado_conteudo_versoes').select('numero').eq('tenant_id', tenantId).eq('id', versaoId).maybeSingle()
      const { data: outras } = await svc.from('simulado_conteudo_versoes').select('id, numero').eq('tenant_id', tenantId).eq('documento_id', documentoId).lt('numero', (atual as any)?.numero ?? 0).order('numero', { ascending: false }).limit(6)
      let anterior: string | null = null
      for (const o of (outras ?? []) as any[]) {
        const { count } = await svc.from(T_TR).select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('versao_id', o.id)
        if ((count ?? 0) > 0) { anterior = o.id; break }
      }
      await reconciliarVersao({ documentoId, versaoNovaId: versaoId, versaoAnteriorId: anterior, html: htmlBase, tenantId })
      trechos = await lerTrechos()
    }
    if (!trechos?.length) return false
    const html = injetarUidsNoHtml(htmlBase, trechos.map((t: any) => t.uid))
    if (!html.trim()) return false
    const up = await svc.from('simulado_conteudo_versoes').update({ html_rico: MARCA_LP + html }).eq('tenant_id', tenantId).eq('id', versaoId)
    if (up.error) return false
    await esquecer(`leitura-doc:${tenantId}:${documentoId}:${versaoId}`)
    return true
  } catch (e) { console.error('[legproc] falha ao preparar o texto', documentoId, (e as any)?.message || e); return false /* mantém o html_rico atual */ }
}

/** Leitura em TEXTO (documento marcado como LegProc): HTML rico com data-uid + grifos por texto do aluno. */
export interface LeituraTexto { documentoId: string; titulo: string; versaoId: string; html: string; anotacoes: Anotacao[]; mostrarLegenda: boolean; ocultarLegendaTabela: boolean; /** documento do JurisClub (modelo de jurisprudência): ajustes de leitura só para ele */ modeloJuris: boolean }
export type DocParaLeitura = { kind: 'midia'; midia: MidiaAluno } | { kind: 'pdf'; pdf: LeituraPdf } | { kind: 'texto'; texto: LeituraTexto }

export async function carregarDocParaLeitura(documentoId: string, alunoId: string, opts: { produtoId?: string | null } = {}): Promise<DocParaLeitura | null> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId || !documentoId) return null
  const svc = createAdminClient()
  const doc = await fetchDocComAcesso(svc, tenantId, documentoId, 'id, titulo, status, versao_atual_id, deletado, pasta_id, herda_acesso, acesso_geral, tipo_origem, categoria')
  if (!doc || doc.deletado || !doc.versao_atual_id || !['conteudo', 'jurisclub'].includes((doc as any).categoria)) return null
  // Acesso (testador OU publicado+gate) — decisão cacheada 60s (ver `podeLerDoc`). UMA vez para mídia e PDF.
  if (!(await podeLerDoc(svc, tenantId, alunoId, doc))) return null
  if (await docBloqueadoNoCronograma(svc, tenantId, alunoId, doc.id)) return null // liberação por data do Cronograma Adaptativo

  const tipoOrigem = String((doc as any).tipo_origem ?? '')
  // ÁREAS DE VISIBILIDADE (plugin do editor): quais áreas ESTE aluno não vê (por produto/grupo/segmento/aluno).
  const areasAluno = await areasDoAluno(svc, tenantId, alunoId, documentoId, opts.produtoId)
  // MÍDIA (vídeo/áudio): player nativo. Só a URL assinada do original (gate já passou).
  if (tipoOrigem === 'video' || tipoOrigem === 'audio') {
    const { data: ver } = await svc.from('simulado_conteudo_versoes').select('arquivo_key').eq('tenant_id', tenantId).eq('id', doc.versao_atual_id).maybeSingle()
    const arquivoKey = (ver as any)?.arquivo_key as string | undefined
    if (!arquivoKey) return null
    const { urlAssinadaOriginal } = await import('./ingestao')
    const url = await urlAssinadaOriginal(arquivoKey, 3600)
    const ext = arquivoKey.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''
    return { kind: 'midia', midia: { documentoId, titulo: doc.titulo, versaoId: doc.versao_atual_id, tipoOrigem, kind: tipoOrigem as 'video' | 'audio', url, ext } }
  }

  // LEGPROC (marca por documento, coluna leitura_legproc): leitura em TEXTO com STF/STJ recolhíveis em vez do
  // PDF fiel. Tolerante à migração pendente (coluna ausente → false → segue no PDF). Se o HTML não estiver
  // disponível, cai no PDF (nunca deixa o aluno sem leitura).
  const marcadoLegproc = await (async () => { try { const r = await svc.from('simulado_conteudo_documentos').select('leitura_legproc, legenda_categorias').eq('tenant_id', tenantId).eq('id', documentoId).maybeSingle(); return r.error ? null : r.data } catch { return null } })()
  // "Marcado como LegProc" = interruptor do documento OU o doc está numa pasta de tipo LegProc
  // (cronograma_tipo_material='legproc'): nesses, a leitura em texto (STF/STJ recolhíveis) e a legenda de
  // categorias já vêm ligadas, sem precisar configurar documento a documento.
  const pastaLegproc = !!(doc as any).pasta_id && await (async () => { try { const r = await svc.from(T_PASTA).select('cronograma_tipo_material').eq('tenant_id', tenantId).eq('id', (doc as any).pasta_id).maybeSingle(); return !r.error && (r.data as any)?.cronograma_tipo_material === 'legproc' } catch { return false } })()
  const ehLegproc = !!(marcadoLegproc as any)?.leitura_legproc || pastaLegproc
  const legendaLegproc = !!(marcadoLegproc as any)?.legenda_categorias || ehLegproc
  // Texto convertido (formatação do professor preservada): usado no LegProc E como RESERVA quando o PDF não pôde ser gerado.
  const montarTextoConvertido = async (): Promise<DocParaLeitura | null> => {
    const convertido = await prepararHtmlLegprocComOrcamento(svc, tenantId, documentoId, doc.versao_atual_id, tipoOrigem)
    if (!convertido) return null
    // html convertido (cache com a MARCA na chave → nunca serve a conversão antiga) + anotações do aluno (gate já passou acima)
    const html = await remember<string | undefined>(`leitura-lp:${MARCA_LP}:${tenantId}:${documentoId}:${doc.versao_atual_id}`, 900, async () => {
      const r = await svc.from('simulado_conteudo_versoes').select('html_rico').eq('tenant_id', tenantId).eq('id', doc.versao_atual_id).maybeSingle()
      const h = (r.data as any)?.html_rico
      return typeof h === 'string' && h.startsWith(MARCA_LP) ? h : undefined
    })
    if (!html) return null
    const f = filtrarHtmlPorAreas(html, areasAluno.ocultas, areasAluno.blocos, areasAluno.estiloPadrao)
    f.html = await ajustesLeituraTexto(svc, tenantId, f.html, (doc as any).categoria === 'jurisclub')
    const anotacoes = (await listarAnotacoes(documentoId, alunoId)).filter((a) => !f.uidsRemovidos.has(a.trecho_uid))
    const { ocultarLegendaTabela } = await import('./legproc-legenda')
    const ocultarLeg = await ocultarLegendaTabela(svc, tenantId, documentoId, (doc as any).pasta_id ?? null)
    return { kind: 'texto', texto: { documentoId, titulo: doc.titulo, versaoId: doc.versao_atual_id, html: f.html, anotacoes, mostrarLegenda: legendaLegproc, ocultarLegendaTabela: ocultarLeg, modeloJuris: (doc as any).categoria === 'jurisclub' } }
  }
  // MODELO DE JURISPRUDÊNCIA (categoria 'jurisclub'): SEMPRE em texto — é o leitor que recebe as adaptações (seções
  // expansivas, selos, tabelas fiéis). O PDF não as comporta; só cai nele se o HTML não puder ser preparado.
  if (ehLegproc || (doc as any).categoria === 'jurisclub') {
    const t = await montarTextoConvertido()
    if (t) return t // senão (preparo demorado, em segundo plano): segue para o PDF e, se falhar, texto simples
  }

  // PDF (fiel): URL (cache 300s por versão) + grifos do aluno + toggle da legenda — tudo em PARALELO.
  const { gerarPdfDocumento } = await import('./thumb')
  const [pdfUrl, grifosRows, cfgRow] = await Promise.all([
    // Falha (conversão DOCX→PDF fora/lenta) NÃO entra no cache: `undefined` não é guardado pelo remember —
    // antes o null ficava 5 min em cache e o "Tentar de novo" do leitor repetia o erro sem tentar converter.
    remember<string | undefined>(`leitura-pdf:${tenantId}:${documentoId}:${doc.versao_atual_id}${areasAluno.temAreas ? `:a${areasAluno.variante}` : ''}`, 300, async () => (await gerarPdfDocumento(tenantId, documentoId, areasAluno).catch(() => null)) ?? undefined).then((u) => u ?? null),
    fetchAll<any>(() => svc.from('simulado_conteudo_grifos_pdf').select('id, pagina, rects, cor, tool, nota, texto').eq('tenant_id', tenantId).eq('documento_id', documentoId).eq('aluno_id', alunoId).order('id', { ascending: true })).catch(() => []),
    (async () => { try { const r = await svc.from('simulado_conteudo_documentos').select('legenda_categorias').eq('tenant_id', tenantId).eq('id', documentoId).maybeSingle(); return r.error ? null : r.data } catch { return null } })(),
  ])
  // RESERVA: PDF indisponível (OnlyOffice fora/cheio/lento ou documento sem PDF guardado) → lê em TEXTO em vez de
  // mostrar "Material indisponível". O acesso do aluno já foi validado acima; só muda o formato da leitura.
  if (!pdfUrl && tipoOrigem === 'docx') {
    const t = await montarTextoConvertido()
    if (t) return t
    // último recurso: texto simples (sem a formatação do professor) — melhor que "indisponível"
    const lt = await carregarLeitura(documentoId, alunoId, { produtoId: opts.produtoId }).catch(() => null)
    if (lt && lt.html && lt.html.trim()) {
      const { ocultarLegendaTabela } = await import('./legproc-legenda')
      const ocultarLeg = await ocultarLegendaTabela(svc, tenantId, documentoId, (doc as any).pasta_id ?? null)
      const htmlLt = await ajustesLeituraTexto(svc, tenantId, lt.html, (doc as any).categoria === 'jurisclub')
      return { kind: 'texto', texto: { documentoId, titulo: lt.titulo, versaoId: lt.versaoId, html: htmlLt, anotacoes: lt.anotacoes, mostrarLegenda: legendaLegproc, ocultarLegendaTabela: ocultarLeg, modeloJuris: (doc as any).categoria === 'jurisclub' } }
    }
  }
  const grifos: GrifoPdf[] = (grifosRows ?? []).map((g) => ({
    id: g.id, pagina: g.pagina, rects: Array.isArray(g.rects) ? g.rects : [], cor: g.cor || 'y', tool: g.tool || 'hl', nota: g.nota ?? null, texto: g.texto ?? null,
  })).filter((g) => g.rects.length)
  return { kind: 'pdf', pdf: { documentoId, titulo: doc.titulo, versaoId: doc.versao_atual_id, pdfUrl, grifos, mostrarLegenda: !!(cfgRow as any)?.legenda_categorias || legendaLegproc } }
}

/** Chaves do admin (Metas & inteligência › Jurisprudência) aplicadas à leitura em TEXTO: `<tags>` → imagens de selo e
 *  seções dos títulos expansivas. */
async function tagsEmImagemLigado(svc: any, tenantId: string): Promise<boolean> {
  try { return (await lerCfgMetas(svc, tenantId)).jurisTagsImagem === true } catch { return false }
}
async function ajustesLeituraTexto(svc: any, tenantId: string, html: string, ehJuris: boolean): Promise<string> {
  if (!ehJuris) return html // só os MODELOS DE JURISPRUDÊNCIA (categoria 'jurisclub') recebem esses ajustes
  try {
    const cfg = await lerCfgMetas(svc, tenantId)
    if (cfg.jurisTagsImagem === true) html = await converterTagsEmSelos(html, tenantId).catch(() => html)
    if (cfg.jurisTitulosExpansivos === true) html = envolverSecoesPorTitulo(html)
  } catch { /* sem config: html como está */ }
  return html
}

/** URL assinada do arquivo ORIGINAL para o aluno BAIXAR — só se tiver acesso (gate). null se negado. */
export async function urlDownloadAluno(documentoId: string, alunoId: string, opts: { produtoId?: string | null } = {}): Promise<string | null> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId || !documentoId) return null
  const svc = createAdminClient()
  const doc = await fetchDocComAcesso(svc, tenantId, documentoId, 'id, status, deletado, versao_atual_id, pasta_id, herda_acesso, acesso_geral, categoria')
  if (!doc || doc.deletado || !doc.versao_atual_id || !['conteudo', 'jurisclub'].includes((doc as any).categoria)) return null
  // TESTADOR GLOBAL: baixa qualquer material (fura "não publicado" + gate + permissão de baixar).
  if (!(await ehTestadorGlobal({ tenantId, estudanteId: alunoId }))) {
    if (doc.status !== 'publicado') return null
    // Gate + download exige permissão de BAIXAR (acessoEfetivo). Nega se não puder ler OU não puder baixar.
    const resDl = await avaliarDocAluno(svc, tenantId, alunoId, doc)
    if (!resDl.permitido || !resDl.permissoes.baixar) return null
    // Download só do material JÁ LIBERADO no cronograma do aluno (com o bloqueio ativo).
    if (await docBloqueadoNoCronograma(svc, tenantId, alunoId, doc.id)) return null // liberação por data do Cronograma Adaptativo
  }
  const { data: ver } = await svc.from('simulado_conteudo_versoes').select('arquivo_key').eq('tenant_id', tenantId).eq('id', doc.versao_atual_id).maybeSingle()
  if (!(ver as any)?.arquivo_key) return null
  const { urlAssinadaOriginal } = await import('./ingestao')
  // Documento com áreas: o aluno baixa o .docx FILTRADO (sem marcadores e sem as áreas que ele não vê).
  const areasDl = await areasDoAluno(svc, tenantId, alunoId, documentoId, opts.produtoId)
  if (areasDl.temAreas) {
    const { data: vv } = await svc.from('simulado_conteudo_versoes').select('hash_arquivo').eq('tenant_id', tenantId).eq('id', doc.versao_atual_id).maybeSingle()
    const { chaveDocxVariante } = await import('./thumb')
    const kv = await chaveDocxVariante(tenantId, doc.versao_atual_id, (ver as any).arquivo_key, (vv as any)?.hash_arquivo ?? '', areasDl)
    return kv ? urlAssinadaOriginal(kv, 600) : null // sem variante pronta NÃO entrega o original
  }
  return urlAssinadaOriginal((ver as any).arquivo_key, 600)
}

export type PreparoDownload =
  | { ok: true; titulo: string; tipoOrigem: 'pdf' | 'docx'; urlOriginal: string; urlPdf: () => Promise<string | null> }
  | { ok: false; erro: 'negado' | 'tipo' | 'indisponivel' | 'inexistente' }

/**
 * Fonte do download do aluno (rota /api/aluno/biblioteca/baixar). MESMO gate de `urlDownloadAluno` (publicado + pasta/doc com
 * herança + permissão BAIXAR + liberação do cronograma; testador global fura) e MESMAS áreas de visibilidade (docx filtrado).
 * Só PDF/DOCX; demais tipos → 'tipo'. `urlPdf()` converte o DOCX (variante por áreas) em PDF só quando a rota precisa (capa).
 */
export async function prepararDownloadAluno(documentoId: string, alunoId: string, opts: { produtoId?: string | null } = {}): Promise<PreparoDownload> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId || !documentoId) return { ok: false, erro: 'negado' }
  const svc = createAdminClient()
  const doc = await fetchDocComAcesso(svc, tenantId, documentoId, 'id, titulo, status, deletado, versao_atual_id, pasta_id, herda_acesso, acesso_geral, categoria, tipo_origem')
  if (!doc || doc.deletado || !doc.versao_atual_id || !['conteudo', 'jurisclub'].includes((doc as any).categoria)) return { ok: false, erro: 'inexistente' }
  if (!(await ehTestadorGlobal({ tenantId, estudanteId: alunoId }))) {
    if (doc.status !== 'publicado') return { ok: false, erro: 'negado' }
    const res = await avaliarDocAluno(svc, tenantId, alunoId, doc)
    if (!res.permitido || !res.permissoes.baixar) return { ok: false, erro: 'negado' }
    if (await docBloqueadoNoCronograma(svc, tenantId, alunoId, doc.id)) return { ok: false, erro: 'negado' }
  }
  const tipo = String((doc as any).tipo_origem ?? '')
  if (tipo !== 'pdf' && tipo !== 'docx') return { ok: false, erro: 'tipo' }
  const { data: ver } = await svc.from('simulado_conteudo_versoes').select('arquivo_key, hash_arquivo').eq('tenant_id', tenantId).eq('id', doc.versao_atual_id).maybeSingle()
  const arquivoKey = (ver as any)?.arquivo_key as string | undefined
  if (!arquivoKey) return { ok: false, erro: 'indisponivel' }
  const { urlAssinadaOriginal } = await import('./ingestao')
  const areas = tipo === 'docx' ? await areasDoAluno(svc, tenantId, alunoId, documentoId, opts.produtoId) : null
  let chaveFonte = arquivoKey
  if (areas?.temAreas) {
    const { chaveDocxVariante } = await import('./thumb')
    const kv = await chaveDocxVariante(tenantId, doc.versao_atual_id, arquivoKey, (ver as any)?.hash_arquivo ?? '', areas)
    if (!kv) return { ok: false, erro: 'indisponivel' } // sem variante pronta NÃO entrega o original (vazaria área oculta)
    chaveFonte = kv
  }
  const urlOriginal = await urlAssinadaOriginal(chaveFonte, 600)
  if (!urlOriginal) return { ok: false, erro: 'indisponivel' }
  return {
    ok: true, titulo: String((doc as any).titulo ?? ''), tipoOrigem: tipo, urlOriginal,
    urlPdf: async () => {
      if (tipo === 'pdf') return urlOriginal
      const { gerarPdfDocumento } = await import('./thumb')
      return gerarPdfDocumento(tenantId, documentoId, areas ?? undefined).catch(() => null)
    },
  }
}

export interface ProgressoLeituraEntrada {
  versaoId?: string | null; pagina?: number | null; totalPaginas?: number | null
  pct?: number | null; tempoIncSeg?: number; concluir?: boolean
}
export interface ProgressoLeituraSaida {
  ok: true; pct: number | null; pagina: number | null; concluidoEm: string | null
  degradado?: true; negado?: true; ignorado?: true
}

/**
 * Grava o progresso detalhado da leitura (folha/%/conclusão/tempo) de UMA aula da Biblioteca.
 * Gate: mesmo `podeLerDoc` (cache 60s) do leitor. pct = MÁXIMO alcançado; conclusão (pct>=90 OU última
 * folha OU concluir) só seta uma vez. Rate-limit: ignora (sem erro) se < 5s da última gravação do doc.
 * Coluna ausente (migração pendente) → degrada p/ só atualizar ultima_leitura_em.
 */
export async function registrarProgressoLeituraAluno(
  tenantId: string, alunoId: string, documentoId: string, e: ProgressoLeituraEntrada,
): Promise<ProgressoLeituraSaida | null> {
  const svc = createAdminClient()
  const doc = await fetchDocComAcesso(svc, tenantId, documentoId, 'id, status, deletado, versao_atual_id, pasta_id, herda_acesso, acesso_geral, categoria')
  if (!doc || doc.deletado) return null
  if (!(await podeLerDoc(svc, tenantId, alunoId, doc))) return null
  const agora = Date.now()
  const versaoId = e.versaoId || doc.versao_atual_id || null

  const sel = await svc.from(T_LP)
    .select('pct, pagina, total_paginas, concluido_em, tempo_seg, ultima_leitura_em, versao_id')
    .eq('tenant_id', tenantId).eq('aluno_id', alunoId).eq('documento_id', documentoId).maybeSingle()

  if (sel.error) { // migração não aplicada: só marca o acesso
    await svc.from(T_LP).upsert({
      tenant_id: tenantId, aluno_id: alunoId, documento_id: documentoId, versao_id: versaoId, origem: 'biblioteca',
      ultima_leitura_em: new Date(agora).toISOString(),
    }, { onConflict: 'tenant_id,aluno_id,documento_id' })
    return { ok: true, degradado: true, pct: null, pagina: null, concluidoEm: null }
  }
  const at: any = sel.data
  const concluidoAnt: string | null = at?.concluido_em ?? null
  // Rate-limit leve (não vale p/ pedido explícito de concluir).
  if (at?.ultima_leitura_em && !e.concluir && agora - new Date(at.ultima_leitura_em).getTime() < 5000) {
    return { ok: true, ignorado: true, pct: at.pct ?? null, pagina: at.pagina ?? null, concluidoEm: concluidoAnt }
  }

  const clamp = (n: unknown, lo: number, hi: number) => (n == null || !Number.isFinite(Number(n)) ? null : Math.min(hi, Math.max(lo, Math.round(Number(n)))))
  const total = clamp(e.totalPaginas, 1, 100000) ?? at?.total_paginas ?? null
  let pagina = clamp(e.pagina, 1, 100000)
  if (pagina != null && total != null && pagina > total) pagina = total
  let pctNovo = clamp(e.pct, 0, 100)
  if (pctNovo == null && pagina != null && total) pctNovo = Math.round((pagina / total) * 100)
  const pctAnt: number | null = at?.pct ?? null
  const paginaAnt: number | null = at?.pagina ?? null

  // Maior pct vence; a página acompanha a maior pct (empate/sem pct: a maior página).
  const pctFinal = pctNovo == null ? pctAnt : Math.max(pctAnt ?? 0, pctNovo)
  let paginaFinal = paginaAnt
  if (pagina != null) {
    const avancou = pctNovo != null && pctNovo > (pctAnt ?? -1)
    paginaFinal = avancou || paginaAnt == null ? pagina : Math.max(paginaAnt, pagina)
  }

  const ultimaFolha = paginaFinal != null && total != null && paginaFinal >= total
  const concluirAgora = !concluidoAnt && (e.concluir === true || (pctFinal ?? 0) >= 90 || ultimaFolha)
  const concluidoEm = concluidoAnt ?? (concluirAgora ? new Date(agora).toISOString() : null)
  const inc = Math.min(600, Math.max(0, Math.round(Number(e.tempoIncSeg ?? 0)) || 0))
  const tempoSeg = Math.min(100_000_000, Number(at?.tempo_seg ?? 0) + inc)

  const { error } = await svc.from(T_LP).upsert({
    tenant_id: tenantId, aluno_id: alunoId, documento_id: documentoId, versao_id: versaoId, origem: 'biblioteca',
    ultima_leitura_em: new Date(agora).toISOString(),
    pagina: paginaFinal, total_paginas: total, pct: pctFinal, concluido_em: concluidoEm, tempo_seg: tempoSeg,
    posicao: paginaFinal != null ? { pagina: paginaFinal } : undefined,
  }, { onConflict: 'tenant_id,aluno_id,documento_id' })
  if (error) throw new Error(error.message)

  if (concluirAgora) { // concluir muda "continuar de onde parou"/progresso dos cursos
    void import('@/lib/nova/cursos-snapshot').then((m) => m.atualizarCatalogoSnapshot(svc, tenantId, alunoId)).catch(() => {})
  }
  return { ok: true, pct: pctFinal, pagina: paginaFinal, concluidoEm }
}

/** Registra/atualiza o progresso de leitura (histórico N15). */
export async function registrarLeituraAluno(documentoId: string, alunoId: string, versaoId: string, origem: 'biblioteca' | 'desafio' = 'biblioteca'): Promise<void> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return
  const svc = createAdminClient()
  await svc.from(T_LP).upsert({
    tenant_id: tenantId, aluno_id: alunoId, documento_id: documentoId, versao_id: versaoId, origem, ultima_leitura_em: new Date().toISOString(),
  }, { onConflict: 'tenant_id,aluno_id,documento_id' })

  // Write-behind (backend-first §6): abrir/ler um material muda o "continuar de onde parou" e o progresso
  // dos cursos → recomputa o snapshot de Cursos para a próxima leitura já vir fresca. Import dinâmico para
  // evitar a dependência circular (cursos-snapshot importa este módulo). Best-effort, fora do caminho crítico.
  void import('@/lib/nova/cursos-snapshot')
    .then((m) => m.atualizarCatalogoSnapshot(svc, tenantId, alunoId))
    .catch(() => {})
}

/** Progresso salvo do aluno num documento (para RETOMAR de onde parou). Tolerante à migração ausente → null. */
export async function lerProgressoLeituraAluno(
  tenantId: string, alunoId: string, documentoId: string,
): Promise<{ pagina: number | null; pct: number | null; concluidoEm: string | null } | null> {
  const { data, error } = await createAdminClient().from(T_LP)
    .select('pagina, pct, concluido_em')
    .eq('tenant_id', tenantId).eq('aluno_id', alunoId).eq('documento_id', documentoId).maybeSingle()
  if (error || !data) return null
  const d: any = data
  return { pagina: d.pagina ?? null, pct: d.pct ?? null, concluidoEm: d.concluido_em ?? null }
}
