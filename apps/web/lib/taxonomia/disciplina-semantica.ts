/**
 * "Inteligência" de cruzamento de DISCIPLINAS — chave SEMÂNTICA do nome (pura, client-safe).
 *
 * O nome exato não basta: as planilhas/importações escrevem a mesma disciplina de formas diferentes
 * ("Processo Civil" × "Direito Processual Civil", "Eleitoral" × "Direito Eleitoral", "Direito Tributário - verificar" ×
 * "Direito Tributário"). A chave semântica reduz o nome ao que IDENTIFICA a disciplina:
 *   - sem acento/caixa/pontuação; sem preposições/artigos (de, do, da, e…);
 *   - sem o prefixo genérico "direito(s)" no começo (Direito Digital = Digital; "Filosofia do Direito" ≠ "Filosofia") e sem notas de revisão ("- verificar", "(novo)");
 *   - sinônimos canônicos: processo/processos → processual; dir → direito; abreviações comuns;
 *   - ordem das palavras irrelevante (tokens ordenados).
 * Duas disciplinas com a MESMA chave semântica são a mesma matéria → o importador usa a existente em vez de criar outra.
 * Conjuntos DIFERENTES (ex.: "Internacional Público" × "Internacional Público e Privado") NÃO casam — viram só sugestão.
 */

const STOP = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'em', 'no', 'na', 'nos', 'nas', 'ao', 'aos', 'a', 'o', 'as', 'os', 'para', 'com'])
// palavras de "ruído" de curadoria que não identificam a matéria
const RUIDO = new Set(['verificar', 'revisar', 'revisao', 'conferir', 'novo', 'nova', 'antigo', 'antiga', 'duplicado', 'duplicada', 'teste', 'copia', 'obsoleto', 'obsoleta'])
const SINONIMO: Record<string, string> = {
  processo: 'processual', processos: 'processual', proc: 'processual',
  direitos: 'direito', dir: 'direito',
  adm: 'administrativo', const: 'constitucional', constit: 'constitucional',
  trib: 'tributario', prev: 'previdenciario', previd: 'previdenciario',
  internacionais: 'internacional', legislacoes: 'legislacao', leg: 'legislacao',
  ciencias: 'ciencia', sociais: 'social',
}
const GENERICAS = new Set(['direito']) // "Direito X" ≡ "X"

function tokens(nome: string): string[] {
  const base = (nome ?? '')
    .replace(/[([].*?[)\]]/g, ' ')              // notas entre parênteses/colchetes
    .replace(/\s[-–—]\s.*$/, (m) => (RUIDO_NO_FIM.test(m) ? ' ' : m)) // "- verificar" no fim
    .normalize('NFD').replace(/[\u0300-\u036f\u200b-\u200d\ufeff]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim()
  const mapeados = base.split(' ').filter(Boolean).map((t) => SINONIMO[t] ?? t)
  // só o "Direito" do COMEÇO é genérico ("Direito Digital" ≡ "Digital"); no meio ele identifica ("Filosofia do Direito" ≠ "Filosofia")
  while (mapeados.length > 1 && GENERICAS.has(mapeados[0])) mapeados.shift()
  return mapeados.filter((t) => !STOP.has(t) && !RUIDO.has(t))
}
const RUIDO_NO_FIM = /^\s[-–—]\s*(verificar|revisar|revis[aã]o|conferir|novo|nova|antigo|antiga|duplicad[oa]|teste|c[oó]pia)\b.*$/i

/** Chave semântica (tokens ordenados). '' quando o nome não tem conteúdo (só "Direito", etc.) — aí vale a chave exata. */
export function chaveSemantica(nome: string): string {
  const t = tokens(nome)
  return [...new Set(t)].sort().join(' ')
}

/** Duas disciplinas são a mesma matéria (mesma chave semântica não vazia)? */
export function mesmaDisciplina(a: string, b: string): boolean {
  const ka = chaveSemantica(a)
  return ka !== '' && ka === chaveSemantica(b)
}
