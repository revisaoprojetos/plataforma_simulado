import { notFound, redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { carregarLeituraPdf, registrarLeituraAluno } from '@/lib/conteudo/leitor'
import { LeitorBiblioteca } from '@/components/aluno/leitor-biblioteca'

export const dynamic = 'force-dynamic'

export default async function LeituraConteudoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pagina?: string; partes?: string; meta?: string; voltar?: string; tseg?: string }> }) {
  const { id } = await params
  const sp = await searchParams
  // ?pagina=N — abre o leitor direto na página inicial da meta/parte do Cronograma Adaptativo.
  const paginaInicial = Math.max(1, Math.trunc(Number(sp?.pagina)) || 1)
  // ?partes=<base64 json> — divisórias de cada parte no leitor (começa a Parte N) + botão Concluir por parte.
  // ?meta=<id> — a meta aberta (destaque). Só do Cronograma; leitura normal da Biblioteca não passa isso.
  let partesCrono: { id: string; i: number; f: number; r: string }[] = []
  try {
    if (sp?.partes) {
      const j = JSON.parse(Buffer.from(String(sp.partes), 'base64').toString('utf8'))
      if (Array.isArray(j)) partesCrono = j.slice(0, 60).map((x: Record<string, unknown>) => ({ id: String(x.id ?? ''), i: Math.max(1, Math.trunc(Number(x.i)) || 1), f: Math.max(0, Math.trunc(Number(x.f)) || 0), r: String(x.r ?? '').slice(0, 60) })).filter((x) => x.id)
    }
  } catch { /* query malformada: ignora, abre o doc normalmente */ }
  const metaAtual = typeof sp?.meta === 'string' ? sp.meta.slice(0, 40) : ''
  // ?voltar=/aluno/... — para onde o "Voltar" do leitor retorna (do cronograma volta ao cronograma,
  // não à Biblioteca). Só aceita rota interna /aluno/ (segurança). Padrão: Biblioteca.
  const voltarHref = typeof sp?.voltar === 'string' && sp.voltar.startsWith('/aluno/') ? sp.voltar.slice(0, 200) : '/aluno/biblioteca'
  // ?tseg=N — tempo (segundos) já acumulado nesta meta; o cronômetro do leitor conta a partir dele.
  const tempoBase = Math.max(0, Math.min(999999, Math.trunc(Number(sp?.tseg)) || 0))
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const leitura = await carregarLeituraPdf(id, sessao.estudanteId)
  if (!leitura) notFound()
  await registrarLeituraAluno(id, sessao.estudanteId, leitura.versaoId).catch(() => {})

  // Leitor do Juris (real) + conteúdo = PDF fiel; grifos salvos no perfil do aluno.
  return (
    <LeitorBiblioteca
      documentoId={leitura.documentoId}
      versaoId={leitura.versaoId}
      titulo={leitura.titulo}
      pdfUrl={leitura.pdfUrl}
      grifos={leitura.grifos}
      voltarHref={voltarHref}
      paginaInicial={paginaInicial}
      partesCrono={partesCrono}
      metaCrono={metaAtual}
      tempoBase={tempoBase}
    />
  )
}
