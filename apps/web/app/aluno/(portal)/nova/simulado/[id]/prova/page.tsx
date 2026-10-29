// A prova (nova) — SimProvaRevisao. Tela cheia de foco: topo com a seta ‹ + caderno/folha/navegador.
// Interação em componente cliente irmão. CONTEÚDO DE EXEMPLO (marcado no runner).
import { ProvaRunner } from './_prova-runner'

export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // margens negativas "comem" o padding do <main> da shell → tela cheia de foco.
  return (
    <div style={{ margin: '-28px -28px -48px', minHeight: 'calc(100vh - 66px)', background: 'var(--bg)' }}>
      <ProvaRunner voltarHref={`/nova/simulado/${id}`} />
    </div>
  )
}
