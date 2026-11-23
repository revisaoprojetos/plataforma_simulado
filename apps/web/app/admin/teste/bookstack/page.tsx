import { EditorExternoTelaCheia } from '@/components/admin/editor-externo-admin'

export const dynamic = 'force-dynamic'

// Editor BookStack em tela cheia (igual ao editor do OnlyOffice: sem o shell da plataforma). Só super-admin (layout do /admin/teste).
export default function Page() {
  const url = process.env.NEXT_PUBLIC_BOOKSTACK_URL?.trim() || ''
  return (
    <EditorExternoTelaCheia
      src={url}
      titulo="BookStack"
      envUrl="NEXT_PUBLIC_BOOKSTACK_URL"
      loginAlternativo={url ? `${url.replace(/\/$/, '')}/login?prevent_auto_init=true` : undefined}
    />
  )
}
