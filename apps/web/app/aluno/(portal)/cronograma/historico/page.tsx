import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, CalendarCheck } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getSessaoAluno } from '@/lib/aluno-session'
import { listarMinhasEmissoes } from '../emissoes-actions'
import { MinhasEmissoes } from '../minhas-emissoes'

export const dynamic = 'force-dynamic'

/**
 * Todos os cronogramas que o aluno já gerou.
 *
 * Existe porque a lista na tela do gerador mostra só os últimos: ali ela é um atalho, e uma
 * lista longa empurraria o formulário para fora da tela. Aqui a lista é o assunto — com busca
 * e a aba dos arquivados.
 *
 * O segmento é literal ('historico'), então ganha do [emissaoId] vizinho — o Next resolve rota
 * estática antes de dinâmica. Ainda assim `abrirEmissao` recusa id que não seja UUID, para a
 * ordem de resolução não ser a única coisa segurando isso.
 */
export default async function HistoricoCronogramasPage() {
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')

  const r = await listarMinhasEmissoes()
  const itens = r.itens ?? []

  return (
    <div className="animate-page space-y-6">
      <div>
        <Link href="/aluno/cronograma" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Voltar ao gerador
        </Link>
      </div>

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <CalendarCheck className="h-6 w-6 text-primary" />
          Meus cronogramas
        </h1>
        <p className="text-muted-foreground">
          Tudo o que você já gerou, com a data e a hora de cada emissão. Abra qualquer um para ver a
          grade, marcar as metas concluídas, renomear ou arquivar.
        </p>
      </div>

      {itens.length === 0 ? (
        <Card className="px-4 py-12 text-center">
          <CalendarCheck className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="font-medium">Você ainda não gerou nenhum cronograma</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Monte o seu no gerador — ele fica salvo aqui e você pode voltar quando quiser.
          </p>
          <Link href="/aluno/cronograma" className={`${buttonVariants({})} mt-4`}>
            Gerar meu cronograma
          </Link>
        </Card>
      ) : (
        <MinhasEmissoes itens={itens} />
      )}
    </div>
  )
}
