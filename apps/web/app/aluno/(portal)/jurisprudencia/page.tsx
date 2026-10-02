import { Gavel } from 'lucide-react'
import { getSessaoAluno } from '@/lib/aluno-session'
import { getCurrentTenant } from '@/lib/tenant'
import { resolverSidebarRotulos, rotuloDe, IconeMenu } from '@/lib/sidebar-rotulos'
import { desafiosDoAluno, temAcessoDesafio } from '@/lib/jurisprudencia/conteudo'
import { JurisprudenciaJogo } from '@/components/aluno/jurisprudencia-jogo'
import { JurisprudenciaTickets } from '@/components/aluno/jurisprudencia-ticket'

export const dynamic = 'force-dynamic'

/** Entrada do aluno no Desafio de Jurisprudência.
 *  - SEM ?desafio: lista como TICKETS só os desafios a que o aluno tem acesso.
 *  - COM ?desafio=ID: confere o acesso e abre o jogo (imersivo). A animação de carregamento é a
 *    abertura do próprio jogo (não criamos outra). */
export default async function JurisprudenciaAlunoPage({
  searchParams,
}: {
  searchParams: Promise<{ desafio?: string }>
}) {
  const sessao = await getSessaoAluno()
  if (!sessao) return null // o layout do portal já redireciona para o login

  const { desafio } = await searchParams

  if (desafio) {
    const ok = await temAcessoDesafio(sessao.estudanteId, sessao.tenantId, desafio)
    if (!ok) {
      return (
        <div className="mx-auto max-w-md px-4 py-16 text-center">
          <h1 className="text-lg font-semibold text-foreground">Desafio indisponível</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Você não tem acesso a este desafio ou ele não existe mais.
          </p>
        </div>
      )
    }
    return <JurisprudenciaJogo desafioId={desafio} />
  }

  const desafios = await desafiosDoAluno(sessao.estudanteId, sessao.tenantId)

  // Ícone + título seguem a BARRA LATERAL (rótulos/ícone personalizados do tenant p/ este item).
  const tema = ((await getCurrentTenant())?.tema as any) ?? {}
  const rotAluno = resolverSidebarRotulos(tema.sidebar_rotulos).aluno
  const chaveNav = '/aluno/jurisprudencia'
  const titulo = rotuloDe(rotAluno?.itens, chaveNav, 'Desafio de Jurisprudência')
  const iconeNav = rotAluno?.itens?.[chaveNav]?.icone

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><span className="inline-flex shrink-0 text-primary"><IconeMenu override={iconeNav} fallback={Gavel} className="h-6 w-6" /></span> {titulo}</h1>
        <p className="text-muted-foreground">Escolha um desafio para começar.</p>
      </div>

      {desafios.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">Nenhum desafio disponível para você no momento.</div>
      ) : (
        <JurisprudenciaTickets desafios={desafios} />
      )}
    </div>
  )
}
