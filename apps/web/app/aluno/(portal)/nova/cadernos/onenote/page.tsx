// Caderno (beta) em TELA CHEIA — interface estilo OneNote (docs/caderno-onenote-spec-interface.md).
// Servidor: sessão + gate do beta (fail-closed). O app client (OneNoteApp) cobre o shell do portal (fixed inset-0 z-50).
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { cadernoBetaLiberado } from '@/lib/aluno/caderno-beta-acesso'
import { getTenantTheme } from '@/lib/tenant-theme'
import { R } from '@/lib/nova/rotas'
import { OneNoteApp } from '@/components/aluno/notebook/onenote/onenote-app'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function CadernoOneNotePage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const sp = await searchParams
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const liberado = await cadernoBetaLiberado({ tenantId: sessao.tenantId, estudanteId: sessao.estudanteId, email: sessao.email })
  if (!liberado) {
    return (
      <div role="status" style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start', color: 'var(--ink)' }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Caderno (beta)</h1>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>Este recurso ainda não está liberado para a sua conta.</p>
        <Link href={R.cadernos} style={{ color: 'var(--brand)', fontWeight: 700 }}>Voltar para Meus Cadernos</Link>
      </div>
    )
  }
  const pagina = typeof sp?.pagina === 'string' && UUID.test(sp.pagina) ? sp.pagina : null
  // Identidade da empresa na barra (mesma fonte do leitor: app/aluno/(portal)/biblioteca/[id]/page.tsx): logo + nome do tenant.
  const tt = await getTenantTheme().catch(() => null)
  const marca = { logo: ((tt?.tema as any)?.logo_url ?? (tt?.tema as any)?.logo_dark_url ?? null) as string | null, nome: tt?.tenantNome ?? '' }
  return <OneNoteApp voltarHref={R.cadernos} paginaInicialId={pagina} estudanteId={sessao.estudanteId} marca={marca} />
}
