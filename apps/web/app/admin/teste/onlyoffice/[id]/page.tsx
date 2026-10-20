import { OnlyOfficeEditor } from './onlyoffice-editor'
import { PreviaLab } from './previa-lab'
import { versaoDoc } from '@/lib/teste/store'

export const dynamic = 'force-dynamic'

export default async function OnlyOfficeEditorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { id } = await params
  const { preview } = await searchParams
  // URL do editor (navegador) + host que o Document Server usa p/ baixar/salvar o .docx (Docker → app).
  const onlyofficeUrl = process.env.NEXT_PUBLIC_ONLYOFFICE_URL || 'http://localhost:8082'
  const wopiHost = process.env.TESTE_WOPI_HOST || 'http://host.docker.internal:3000'
  // Prévia = LABORATÓRIO (barra lateral com seleção de simulado + reguladores de acertos por disciplina,
  // recalculando a prévia ao vivo). Editor normal = template editável com o plugin "Blocos & Variáveis".
  // Chave ESTÁVEL por versão (muda só quando o conteúdo é salvo) — evita sessões concorrentes/salvar vazio
  // E, na prévia, invalida o cache do OnlyOffice quando o template é editado (senão carrega render antigo).
  const versao = await versaoDoc(id)
  if (preview === '1') {
    return <PreviaLab id={id} onlyofficeUrl={onlyofficeUrl} wopiHost={wopiHost} docVersao={versao} />
  }
  return <OnlyOfficeEditor id={id} onlyofficeUrl={onlyofficeUrl} wopiHost={wopiHost} preview={false} docVersao={versao} />
}
