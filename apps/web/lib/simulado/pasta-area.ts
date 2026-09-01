// Regra de "área" das pastas (simulado_pastas.folder_area). Centraliza o filtro do BANCO DE SIMULADO
// para que pastas de OUTRAS áreas não vazem para o banco: Aplicação de Simulado ('simulado'),
// Cadernos de Prova ('caderno') e Modelos de Caderno ('caderno_modelo'). Este último foi adicionado
// depois — sem um ponto único, cada tela repetia o filtro e esquecia de excluí-lo.
const AREAS_FORA_DO_BANCO = new Set(['simulado', 'caderno', 'caderno_modelo'])

/** A pasta pertence ao contexto "Banco de Simulado"? (folder_area null/legado conta como banco). */
export function ehPastaBanco(folderArea: unknown): boolean {
  return !AREAS_FORA_DO_BANCO.has(String(folderArea ?? ''))
}
