import { notFound, redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { carregarDocumentoAluno } from '@/lib/leitura/acesso'
import { temAcessoDesafio } from '@/lib/jurisprudencia/conteudo'
import { JURISPRUDENCIA_ATIVA } from '@/lib/flags'
import { LeitorDocumento } from '@/components/aluno/leitor-documento'
import { resolverInterno } from '@/lib/aluno/interno-gate'

export const dynamic = 'force-dynamic'

/**
 * Leitor do Desafio de Jurisprudência (leitura POR DIA que complementa o quiz do arcade).
 * Reaproveita o leitor da Lei Seca (LeitorDocumento) carregando o documento vinculado ao dia.
 * Ao concluir a leitura, grava `simulado_leitura_progresso` (via /api/leitura/progresso) — que é o
 * GATE que libera o quiz daquele dia no arcade. "Voltar"/"Ir para o quiz" retornam ao jogo.
 */
export default async function JurisLeitorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ busca?: string; desafio?: string; embed?: string }> }) {
  if (!JURISPRUDENCIA_ATIVA) redirect('/aluno')
  const { id } = await params
  const { busca, desafio, embed } = await searchParams
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  // Acesso ao DESAFIO (pasta) além do documento — fecha o link direto do leitor p/ quem não tem o desafio.
  if (desafio && !(await temAcessoDesafio(sessao.estudanteId, sessao.tenantId, desafio))) notFound()
  const doc = await carregarDocumentoAluno(id, sessao.estudanteId, sessao.tenantId)
  if (!doc) notFound()
  // EMBED (overlay dentro do desafio): "voltar"/"ir para as questões" só sinalizam o fechamento via hash
  // (#fechar-leitura) — o arcade fica congelado por trás e o overlay fecha na hora. Fora do embed (link
  // direto), voltam navegando normalmente para o desafio.
  const voltar = embed === '1'
    ? '#fechar-leitura'
    : (desafio ? `/aluno/jurisprudencia?desafio=${encodeURIComponent(desafio)}` : '/aluno/jurisprudencia')
  const _it = await resolverInterno()
  return <LeitorDocumento doc={doc} buscaInicial={busca ?? undefined} grifoCores={doc.grifoCores} interno={_it.ativo} trilha={{ modo: 'leitura', questoesHref: voltar, voltarHref: voltar }} />
}
