import { EditorExternoTelaCheia } from '@/components/admin/editor-externo-admin'

export const dynamic = 'force-dynamic'

// Editor AFFiNE em tela cheia (igual ao editor do OnlyOffice: sem o shell da plataforma). Só super-admin (layout do /admin/teste).
export default function Page() {
  const url = process.env.NEXT_PUBLIC_AFFINE_URL?.trim() || ''
  return <EditorExternoTelaCheia src={url} titulo="AFFiNE" envUrl="NEXT_PUBLIC_AFFINE_URL" />
}
