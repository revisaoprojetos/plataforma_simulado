// Regra de "área" das pastas (simulado_pastas.folder_area). Centraliza o filtro do BANCO DE SIMULADO.
// ALLOWLIST (não denylist): o banco mostra SÓ 'banco' + legado (null/''). Qualquer área nova
// (Aplicação 'simulado', Cadernos 'caderno', Modelos 'caderno_modelo', LegProc 'leitura', Cronograma,
// Catálogo…) fica FORA automaticamente — sem precisar lembrar de excluí-la (o denylist antigo vazava).
const AREAS_DO_BANCO = new Set(['', 'banco'])

/** A pasta pertence ao contexto "Banco de Simulado"? (folder_area null/legado conta como banco). */
export function ehPastaBanco(folderArea: unknown): boolean {
  return AREAS_DO_BANCO.has(String(folderArea ?? ''))
}
