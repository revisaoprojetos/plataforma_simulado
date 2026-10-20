'use server'

import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { baixarDocxLeitura } from '@/lib/leitura/office'
import { importarDocx } from '../../upload-actions'

// Importa de volta para a Leitura o docx editado no OnlyOffice — via o MESMO caminho auditado de importar
// Word (mammoth → salvarConteudo no RASCUNHO). Lossy: só o texto/estrutura básica volta.
export async function importarLeituraDoOffice(documentoId: string): Promise<{ ok: boolean; error?: string; artigos?: number }> {
  if (!(await checkPermission('leitura:update'))) return { ok: false, error: 'Sem permissão.' }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const bytes = await baixarDocxLeitura(access.tenantId, documentoId)
  if (!bytes) return { ok: false, error: 'Nenhuma edição encontrada no OnlyOffice. Edite e salve (Ctrl+S) antes de importar.' }
  return await importarDocx(documentoId, bytes.toString('base64'))
}
