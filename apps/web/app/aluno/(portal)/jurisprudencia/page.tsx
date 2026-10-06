import { Gavel } from 'lucide-react'
import { getSessaoAluno } from '@/lib/aluno-session'
import { getCurrentTenant } from '@/lib/tenant'
import { resolverSidebarRotulos, rotuloDe, IconeMenu } from '@/lib/sidebar-rotulos'
import { desafiosDoAluno, temAcessoDesafio } from '@/lib/jurisprudencia/conteudo'
import { JurisprudenciaJogo } from '@/components/aluno/jurisprudencia-jogo'
import { JurisprudenciaTickets } from '@/components/aluno/jurisprudencia-ticket'
import { resolverInterno } from '@/lib/aluno/interno-gate'
import { InternaPageRoot } from '@/components/brand/interna/page-shell'
import { PlatformJuris } from '@/components/brand/interna/juris'
import { JurisprudenciaMeq } from '@/components/aluno/jurisprudencia-meq'

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

  const ticketsEl = desafios.length === 0
    ? <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">Nenhum desafio disponível para você no momento.</div>
    : <JurisprudenciaTickets desafios={desafios} />

  // ── NOVO VISUAL INTERNO: lista no design novo (PlatformJuris), fiel ao mockup, com dados reais. ──
  const _it = await resolverInterno()
  if (_it.ativo) {
    const desafiosData = desafios.map((d) => ({ id: d.id, nome: d.nome, imagemTicket: d.imagemTicket ?? null }))
    const stats = { desafios: desafiosData.length, disponiveis: desafiosData.length }
    // MEQ tem composição própria (spec 04 §2): o shell da marca (shell-meq) já traz rail + top bar,
    // então renderizamos só a região de conteúdo (sem o cabeçalho duplicado do InternaPageRoot).
    if (_it.brand === 'meq') {
      return <JurisprudenciaMeq theme={_it.theme} titulo={titulo} desafios={desafiosData} stats={stats} />
    }
    return (
      <InternaPageRoot brand={_it.brand} theme={_it.theme}>
        <PlatformJuris brand={_it.brand} theme={_it.theme} titulo={titulo} desafios={desafiosData} stats={stats} />
      </InternaPageRoot>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><span className="inline-flex shrink-0 text-primary"><IconeMenu override={iconeNav} fallback={Gavel} className="h-6 w-6" /></span> {titulo}</h1>
        <p className="text-muted-foreground">Escolha um desafio para começar.</p>
      </div>

      {ticketsEl}
    </div>
  )
}
