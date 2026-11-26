// Lógica PURA do catálogo de tipos de conteúdo (sem I/O): mescla sistema + banco, validação e compat com o vocabulário antigo.
import { PAPEIS_TIPO, SLUG_RE, SLUGS_SISTEMA, TIPOS_SISTEMA, type PapelTipo, type TipoConteudo } from './tipos-conteudo-tipos'

/** Linha de `simulado_conteudo_tipos` (campos usados). */
export interface LinhaTipoConteudo {
  slug: string
  nome?: string | null
  nome_aluno?: string | null
  cor?: string | null
  papel?: string | null
  duracao_padrao_min?: number | null
  prioridade?: number | null
  ordem?: number | null
  ativo?: boolean | null
  sistema?: boolean | null
  descricao?: string | null
  versao?: number | null
  gera_meta?: boolean | null
}

export type TipoMaterialAntigo = 'pdfull' | 'pdfight' | 'pdflash' | 'legproc' | 'jurisclub' | 'questoes'

const PAPEIS = new Set<string>(PAPEIS_TIPO.map((p) => p.v))
const SISTEMA = new Map(TIPOS_SISTEMA.map((t) => [t.slug, t]))

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** Catálogo efetivo: 6 de sistema (com override) + personalizados, ordenado por ordem e nome. */
export function mesclarCatalogo(linhas: LinhaTipoConteudo[] | null | undefined): TipoConteudo[] {
  const porSlug = new Map<string, LinhaTipoConteudo>()
  for (const l of linhas ?? []) if (l && typeof l.slug === 'string') porSlug.set(l.slug, l)
  const out: TipoConteudo[] = []
  for (const base of TIPOS_SISTEMA) {
    const o = porSlug.get(base.slug)
    if (!o) { out.push({ ...base }); continue }
    const nome = txt(o.nome) ?? base.nome
    out.push({
      ...base, // slug, papel e sistema nunca mudam
      nome,
      nomeAluno: txt(o.nome_aluno) ?? nome,
      cor: o.cor === undefined ? base.cor : txt(o.cor),
      duracaoPadraoMin: o.duracao_padrao_min === undefined ? base.duracaoPadraoMin : (o.duracao_padrao_min ?? null),
      prioridade: num(o.prioridade, base.prioridade),
      ordem: num(o.ordem, base.ordem),
      ativo: o.ativo == null ? base.ativo : !!o.ativo,
      descricao: o.descricao === undefined ? base.descricao : txt(o.descricao),
      ...(typeof o.versao === 'number' ? { versao: o.versao } : {}),
    })
  }
  for (const [slug, o] of porSlug) {
    if (SISTEMA.has(slug) || o.sistema) continue // override órfão de sistema desconhecido: ignora
    if (!SLUG_RE.test(slug)) continue
    const nome = txt(o.nome) ?? slug
    out.push({
      slug, nome, nomeAluno: txt(o.nome_aluno) ?? nome, cor: txt(o.cor),
      papel: (o.papel && PAPEIS.has(o.papel) ? o.papel : 'generico') as PapelTipo,
      duracaoPadraoMin: o.duracao_padrao_min ?? null,
      prioridade: num(o.prioridade, 20), ordem: num(o.ordem, 100), ativo: o.ativo == null ? true : !!o.ativo,
      sistema: false, descricao: txt(o.descricao),
      ...(o.gera_meta === true && (!o.papel || o.papel === 'generico' || !PAPEIS.has(o.papel)) ? { geraMeta: true } : {}),
      ...(typeof o.versao === 'number' ? { versao: o.versao } : {}),
    })
  }
  return out.sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR') || a.slug.localeCompare(b.slug))
}

export interface EntradaTipo {
  slug?: unknown; nome?: unknown; nomeAluno?: unknown; cor?: unknown; papel?: unknown
  duracaoPadraoMin?: unknown; prioridade?: unknown; ordem?: unknown; descricao?: unknown; geraMeta?: unknown
}

/** Valida entrada de criação (`criando=true`: slug obrigatório e não colide com sistema) ou edição (slug ignorado). */
export function validarTipo(input: EntradaTipo, opts: { criando?: boolean } = {}): { ok: true } | { ok: false; error: string } {
  const criando = opts.criando ?? true
  if (criando) {
    const slug = input.slug
    if (typeof slug !== 'string' || !SLUG_RE.test(slug)) return { ok: false, error: 'Identificador inválido (use a-z, 0-9, _ ou -, de 2 a 40 caracteres).' }
    if (SLUGS_SISTEMA.includes(slug)) return { ok: false, error: 'Esse identificador é de um tipo do sistema.' }
  }
  if (input.nome !== undefined || criando) {
    const n = typeof input.nome === 'string' ? input.nome.trim() : ''
    if (n.length < 1 || n.length > 60) return { ok: false, error: 'O nome deve ter de 1 a 60 caracteres.' }
  }
  if (typeof input.nomeAluno === 'string' && input.nomeAluno.trim().length > 60) return { ok: false, error: 'O nome para o aluno deve ter até 60 caracteres.' }
  if (input.papel !== undefined || criando) {
    if (typeof input.papel !== 'string' || !PAPEIS.has(input.papel)) return { ok: false, error: 'Papel inválido.' }
  }
  if (input.duracaoPadraoMin !== undefined && input.duracaoPadraoMin !== null) {
    const d = input.duracaoPadraoMin
    if (typeof d !== 'number' || !Number.isInteger(d) || d < 1 || d > 600) return { ok: false, error: 'Duração deve ser de 1 a 600 minutos (ou vazia).' }
  }
  for (const k of ['prioridade', 'ordem'] as const) {
    const v = input[k]
    if (v !== undefined && (typeof v !== 'number' || !Number.isInteger(v) || v < -1000 || v > 100000)) return { ok: false, error: `Valor inválido para ${k}.` }
  }
  if (input.geraMeta !== undefined && typeof input.geraMeta !== 'boolean') return { ok: false, error: 'Valor inválido para "gera meta".' }
  if (input.geraMeta === true && input.papel !== undefined && input.papel !== 'generico') return { ok: false, error: 'Só tipos de papel "Genérico" podem gerar meta própria.' }
  if (typeof input.descricao === 'string' && input.descricao.length > 300) return { ok: false, error: 'Descrição muito longa (máx. 300).' }
  return { ok: true }
}

/** Slugs de tipos PERSONALIZADOS (papel 'generico') com geraMeta ligado e ativos: os que viram metas gx. */
export function slugsGeraMeta(catalogo: TipoConteudo[]): Set<string> {
  return new Set(catalogo.filter((t) => !t.sistema && t.papel === 'generico' && t.geraMeta === true && t.ativo).map((t) => t.slug))
}

export function papelDoSlug(slug: string | null | undefined, catalogo: TipoConteudo[]): PapelTipo | null {
  if (!slug) return null
  return catalogo.find((t) => t.slug === slug)?.papel ?? SISTEMA.get(slug)?.papel ?? null
}

const COMPAT: Record<PapelTipo, TipoMaterialAntigo> = {
  leitura: 'pdfull', lei_seca: 'legproc', jurisprudencia: 'jurisclub', questoes: 'questoes', apoio: 'pdfight', generico: 'pdfight',
}

/** Slug do vocabulário antigo equivalente ao PAPEL do tipo (sistema devolve o próprio slug). null se o slug é desconhecido. */
export function tipoMaterialCompat(slug: string | null | undefined, catalogo: TipoConteudo[]): TipoMaterialAntigo | null {
  if (!slug) return null
  if (SISTEMA.has(slug)) return slug as TipoMaterialAntigo
  const papel = papelDoSlug(slug, catalogo)
  return papel ? COMPAT[papel] : null
}
