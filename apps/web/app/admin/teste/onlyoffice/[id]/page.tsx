import { OnlyOfficeEditor } from './onlyoffice-editor'

export const dynamic = 'force-dynamic'

export default async function OnlyOfficeEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // URL do editor (navegador) + host que o Document Server usa p/ baixar/salvar o .docx (Docker → app).
  const onlyofficeUrl = process.env.NEXT_PUBLIC_ONLYOFFICE_URL || 'http://localhost:8082'
  const wopiHost = process.env.TESTE_WOPI_HOST || 'http://host.docker.internal:3000'
  return <OnlyOfficeEditor id={id} onlyofficeUrl={onlyofficeUrl} wopiHost={wopiHost} />
}
