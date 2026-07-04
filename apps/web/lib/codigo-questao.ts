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
