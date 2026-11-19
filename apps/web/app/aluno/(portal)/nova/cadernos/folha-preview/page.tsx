// PREVIEW ISOLADO da Folha Livre + Caneta (teste manual em tablet/S-Pen). Sem persistência.
// Protegida pelo mesmo acesso da aba "Caderno (beta)".
import { notFound, redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { cadernoBetaLiberado } from '@/lib/aluno/caderno-beta-acesso'
import { PreviewClient } from './preview-client'

export const dynamic = 'force-dynamic'

export default async function FolhaPreviewPage() {
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const ok = await cadernoBetaLiberado({ tenantId: sessao.tenantId, estudanteId: sessao.estudanteId, email: sessao.email ?? null })
  if (!ok) notFound()
  return (
    <div style={{ width: '100%', padding: 12 }}>
      <h1 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>Folha livre (preview, nada é salvo)</h1>
      <PreviewClient />
    </div>
  )
}
