/**
 * Código estável e único de uma questão — o MESMO em qualquer lugar do sistema
 * (lista, banco, simulado, relatório). Não é uma posição/numeração de contexto,
 * então "Q-7F3A9C2B" identifica sempre a mesma questão, sem confusão.
 *
 * Deriva do UUID (determinístico) quando a coluna `codigo` ainda não existe;
 * caso exista no banco, usa o valor persistido.
 */
export function codigoQuestao(id: string, codigo?: string | null): string {
  if (codigo && codigo.trim()) return codigo
  return 'Q-' + id.replace(/-/g, '').slice(0, 8).toUpperCase()
}

/**
 * Interpreta um termo de busca como código DERIVADO (`Q-XXXXXXXX`) e devolve o
 * intervalo de UUID correspondente — o código deriva dos 8 primeiros hexadígitos
 * do id (o 1º segmento do UUID), então casa exatamente por faixa `id >= lo && id <= hi`.
 *
 * Usado na busca de questões: colar o código copiado encontra a questão mesmo sem
 * a coluna `codigo` preenchida. Retorna `null` quando o termo não é um código derivado
 * (aí a busca cai no texto/`codigo` normal). `ilike` em coluna uuid não existe no Postgres.
 */
export function faixaUuidDoCodigo(termo: string): { lo: string; hi: string } | null {
  const m = termo.trim().match(/^Q-?([0-9a-fA-F]{8})$/)
  if (!m) return null
  const hex = m[1].toLowerCase()
  return { lo: `${hex}-0000-0000-0000-000000000000`, hi: `${hex}-ffff-ffff-ffff-ffffffffffff` }
}
