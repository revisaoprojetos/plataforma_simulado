import { isoParaBrtLocal } from '@/lib/brt'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const ehUuid = (s: unknown): s is string => typeof s === 'string' && UUID_RE.test(s)

/** Campos de ruído — não interessam para auditoria (metadados/técnicos). */
export const CAMPOS_OCULTOS = new Set([
  'id', 'tenant_id', 'created_at', 'updated_at', 'deletado', 'deletado_em', 'deletado_por',
  'criado_por', 'user_id', 'actor_user_id', 'embed_token', 'atualizado_em', 'criado_em',
])

/** Rótulos amigáveis para os campos mais comuns. */
export const LABELS: Record<string, string> = {
  titulo: 'Título', descricao: 'Descrição', status: 'Status', modo_aplicacao: 'Modo de aplicação',
  data_inicio: 'Início', data_fim: 'Fim', tempo_limite_min: 'Tempo limite', metodo_identificacao: 'Identificação',
  embed_ativo: 'Área embedável', nome: 'Nome', email: 'E-mail', cpf: 'CPF', telefone: 'Telefone',
  classificacao: 'Classificação', data_nascimento: 'Nascimento', matricula_externa: 'Matrícula externa',
  nome_site: 'Nome do site', titulo_pagina: 'Título da página', subtitulo_site: 'Subtítulo',
  cor_primaria: 'Cor primária', cor_secundaria: 'Cor secundária', cor_accent: 'Cor de destaque',
  provider: 'Provedor', caderno_id: 'Caderno vinculado', gabarito_liberado: 'Gabarito',
  nota_liberada: 'Nota', caderno_liberado: 'Caderno (PDF)', reaberto: 'Reaberto', tipo: 'Tipo',
  regras: 'Regras', tema: 'Tema', mapa_json: 'Mapa (JSON)', produto: 'Produto', acao: 'Ação',
  questoes: 'Questões', estudantes_matriculados: 'Matriculados', importadas: 'Importadas',
  jaExistiam: 'Já existiam', vinculadas: 'Vinculadas', vinculados: 'Vinculados', grupo: 'Grupo',
  liberado: 'Liberado', plano: 'Plano', validade: 'Validade', expira_em: 'Expira em',
}

const CAMPO_DATA = new Set(['data_inicio', 'data_fim', 'iniciado_em', 'finalizado_em', 'validade', 'expira_em', 'liberado_em'])

export function rotulo(campo: string): string { return LABELS[campo] ?? campo }

function fmtDataHora(v: string): string {
  const s = isoParaBrtLocal(v)
  if (!s) return v
  const [d, t] = s.split('T'); const [y, mo, da] = d.split('-')
  return `${da}/${mo}/${y} ${t}`
}

/** Valor humanizado: datas→Brasília, bool→Sim/Não, base64→(imagem), tempo→h/min, objeto→resumo. */
export function humanizarValor(campo: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não'
  if (typeof v === 'number') {
    if (campo === 'tempo_limite_min') { const h = Math.floor(v / 60), m = v % 60; return h > 0 ? `${h}h${m ? ' ' + m + 'min' : ''}` : `${m}min` }
    return String(v)
  }
  if (typeof v === 'string') {
    if (v.startsWith('data:')) return '(imagem)'
    if (CAMPO_DATA.has(campo) || /^\d{4}-\d{2}-\d{2}T[\d:.]+/.test(v)) return fmtDataHora(v)
    return v.length > 90 ? v.slice(0, 90) + '…' : v
  }
  if (Array.isArray(v)) return `${v.length} item(ns)`
  if (typeof v === 'object') return '(alterado)'
  return String(v)
}

/** Duas strings de data representam o mesmo instante? (evita diff por diferença de formato). */
function mesmoInstante(a: unknown, b: unknown): boolean {
  if (typeof a === 'string' && typeof b === 'string') {
    const ta = Date.parse(a), tb = Date.parse(b)
    if (!isNaN(ta) && !isNaN(tb)) return ta === tb
  }
  return false
}

export type MudancaCampo = { campo: string; rotulo: string; de: string; para: string; novo?: boolean }

/** Campos que realmente mudaram (sem ruído; ignora diferença só de formato de data). */
export function camposMudados(antes: any, depois: any): MudancaCampo[] {
  const a = antes ?? {}, d = depois ?? {}
  const so = antes == null // INSERT: só há "depois"
  const keys = new Set([...Object.keys(a), ...Object.keys(d)])
  const out: MudancaCampo[] = []
  for (const k of keys) {
    if (CAMPOS_OCULTOS.has(k)) continue
    const va = a[k], vd = d[k]
    if (!so && JSON.stringify(va) === JSON.stringify(vd)) continue
    if (mesmoInstante(va, vd)) continue
    out.push({ campo: k, rotulo: rotulo(k), de: humanizarValor(k, va), para: humanizarValor(k, vd), novo: so })
  }
  return out
}

const SUBSTANTIVO: Record<string, string> = {
  simulado_simulados: 'simulado', simulado_pastas: 'banco', simulado_questoes: 'questão',
  simulado_estudantes: 'estudante', simulado_cadernos_designer: 'caderno', simulado_tenants: 'plataforma',
  simulado_grupos: 'grupo', simulado_pasta_estudantes: 'vínculo de estudantes',
  simulado_integracao_config: 'integração', simulado_curseduca_config: 'integração Curseduca',
  simulado_assinaturas: 'acesso', simulado_webhook_saida: 'webhook', simulado_matriculas: 'matrícula',
  auth: 'painel',
}

/**
 * Frase humana do que o ator fez: "Criou o simulado X", "Editou o estudante Y · Classificação",
 * "Liberou gabarito — Simulado Z", "Importou 10 questão(ões)", "Concedeu acesso · Guru".
 * `nomes` resolve entidade_id → nome (quando aplicável).
 */
export function resumoRegistro(log: any, nomes: Map<string, string>): string {
  const ent = log.entidade as string
  const op = log.operacao as string
  const d = (log.dados_novos ?? {}) as any
  const a = (log.dados_anteriores ?? {}) as any
  const noun = SUBSTANTIVO[ent] ?? ent
  const alvo = (ehUuid(log.entidade_id) ? nomes.get(log.entidade_id) : null) ?? d.titulo ?? d.nome ?? a.titulo ?? a.nome ?? null
  const comAlvo = alvo ? `${noun} "${alvo}"` : `um ${noun}`

  if (ent === 'auth') return op === 'LOGIN' ? 'Entrou no painel' : op === 'LOGOUT' ? 'Saiu do painel' : op

  if (ent === 'simulado_assinaturas') {
    const acao = op === 'LIBERAR' ? 'Concedeu acesso' : 'Cancelou acesso'
    return `${acao}${d.provider ? ` · ${String(d.provider)}` : ''}${d.produto ? ` · produto ${d.produto}` : ''}${alvo ? ` · ${alvo}` : ''}`
  }
  if (ent === 'simulado_questoes' && op === 'INSERT' && (d.importadas != null || d.vinculadas != null)) {
    return `Importou ${d.importadas ?? d.vinculadas ?? 0} questão(ões)${d.jaExistiam ? ` · ${d.jaExistiam} já existia(m)` : ''}`
  }
  if (ent === 'simulado_pasta_estudantes' && op === 'INSERT') {
    return `Vinculou ${d.vinculados ?? ''} estudante(s) ao banco`.replace(/\s+/g, ' ').trim()
  }
  if (ent === 'simulado_estudantes' && op === 'INSERT') return `Cadastrou o estudante ${d.nome ?? alvo ?? ''}`.trim()

  if (ent === 'simulado_simulados' && (op === 'LIBERAR' || op === 'BLOQUEAR')) {
    if (d.reaberto) return `Reabriu o ${comAlvo}`
    if (d.status === 'encerrado') return `Encerrou o ${comAlvo}`
    const libs: string[] = []
    if ('gabarito_liberado' in d) libs.push(`gabarito ${d.gabarito_liberado ? 'liberado' : 'bloqueado'}`)
    if ('nota_liberada' in d) libs.push(`nota ${d.nota_liberada ? 'liberada' : 'bloqueada'}`)
    if ('caderno_liberado' in d) libs.push(`caderno ${d.caderno_liberado ? 'liberado' : 'bloqueado'}`)
    if (libs.length) return `${op === 'LIBERAR' ? 'Liberou' : 'Bloqueou'} ${libs.join(', ')}${alvo ? ` — ${alvo}` : ''}`
    return `${op === 'LIBERAR' ? 'Liberou' : 'Bloqueou'} o ${comAlvo}`
  }

  const verbo = op === 'INSERT' ? 'Criou' : op === 'UPDATE' ? 'Editou' : op === 'DELETE' ? 'Excluiu'
    : op === 'ANULAR' ? 'Anulou' : op === 'RECORRIGIR' ? 'Re-corrigiu' : op === 'LIBERAR' ? 'Liberou' : op === 'BLOQUEAR' ? 'Bloqueou' : op
  let txt = `${verbo} ${comAlvo}`
  if (op === 'UPDATE') {
    const m = camposMudados(a, d)
    if (m.length && m.length <= 3) txt += ` · ${m.map((x) => x.rotulo).join(', ')}`
    else if (m.length) txt += ` · ${m.length} campos alterados`
  }
  return txt
}
