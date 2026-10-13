import { notFound, redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { carregarDocumentoAluno } from '@/lib/leitura/acesso'
import { temAcessoDesafio } from '@/lib/jurisprudencia/conteudo'
import { JURISPRUDENCIA_ATIVA } from '@/lib/flags'
import { LeituraRapidaPlayer } from '@/components/aluno/leitura-rapida-player'

export const dynamic = 'force-dynamic'

/**
 * Leitura RÁPIDA do Desafio de Jurisprudência (versão enxuta da leitura do dia, por documento).
 * Abre num overlay DENTRO do arcade (embed=1): "Voltar" só sinaliza o fechamento via hash
 * (#fechar-leitura) — o arcade fica congelado atrás e o overlay fecha na hora, reaplicando o gate.
 * Ao concluir, grava `simulado_leitura_progresso` (mesmo motor da leitura do dia) → libera o desafio.
 */
export default async function JurisLeituraRapidaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ desafio?: string; embed?: string }> }) {
  if (!JURISPRUDENCIA_ATIVA) redirect('/aluno')
  const { id } = await params
  const { desafio, embed } = await searchParams
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  if (desafio && !(await temAcessoDesafio(sessao.estudanteId, sessao.tenantId, desafio))) notFound()
  const doc = await carregarDocumentoAluno(id, sessao.estudanteId, sessao.tenantId)
  if (!doc || !doc.leituraRapida) notFound()
  const ehEmbed = embed === '1'
  const voltar = ehEmbed
    ? '#fechar-leitura'
    : (desafio ? `/aluno/jurisprudencia?desafio=${encodeURIComponent(desafio)}` : '/aluno/jurisprudencia')
  const player = <LeituraRapidaPlayer documentoId={id} versao={doc.versao} html={doc.leituraRapida} titulo={doc.titulo} voltarHref={voltar} />
  // EMBED (overlay do arcade): a página está no grupo (portal) → o layout renderiza o shell. Um container
  // FIXO em tela cheia cobre o shell → o iframe mostra só a leitura rápida.
  if (ehEmbed) return <div style={{ position: 'fixed', inset: 0, zIndex: 200 }}>{player}</div>
  return player
}
