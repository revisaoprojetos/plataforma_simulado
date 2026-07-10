// Tipos compartilhados da Curseduca — arquivo neutro (sem 'use server' nem 'server-only'),
// para poder ser importado tanto pelas server actions quanto pelos componentes client.
export type DestinoImport = { tipo: 'nenhum' | 'existente' | 'novo'; grupoId?: string; nomeNovo?: string }
export type ResultadoImportCurseduca = {
  ok: boolean; error?: string
  total?: number; novos?: number; jaExistiam?: number; atualizados?: number
  vinculados?: number; removidos?: number; semIdentificador?: number
  semDetalhe?: number; restante?: number; grupoNome?: string | null
}
