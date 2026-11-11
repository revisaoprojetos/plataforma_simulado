import { redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { resolverInterno } from '@/lib/aluno/interno-gate'
import { InternaPageRoot } from '@/components/brand/interna/page-shell'
import { Btn, Card, Col, Muted, PageHeader, IconBox } from '@/components/nova/ui'
import { listarMinhasEmissoes } from '../emissoes-actions'
import { MinhasEmissoes } from '../minhas-emissoes'

export const dynamic = 'force-dynamic'

/**
 * Todos os cronogramas Revisão que o aluno já gerou (busca/ordenação/abas no cliente via rota de API).
 * O segmento é literal ('meus'), então ganha do [emissaoId] vizinho; `abrirEmissao` ainda recusa id que não seja UUID.
 */
export default async function HistoricoCronogramasPage() {
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')

  const it = await resolverInterno()
  // A primeira página vem do servidor; a busca e as seguintes ficam por conta do cliente.
  const r = await listarMinhasEmissoes({ pagina: 0, porPagina: 20 })
  const dados = r.dados

  return (
    <InternaPageRoot brand={it.brand} theme={it.theme}>
      <Col gap={18} style={{ width: '100%' }}>
        <div>
          <Btn kind="secondary" size="sm" icon="back" href="/aluno/cronograma">Voltar</Btn>
        </div>

        <PageHeader
          eyebrow="Cronograma"
          title="Meus cronogramas"
          sub="Tudo o que você já gerou, com a data e a hora de cada emissão. Abra qualquer um para ver a grade, marcar as metas concluídas, renomear ou apagar."
        />

        {!dados || dados.ativas + dados.arquivadas === 0 ? (
          <Card pad={28} style={{ alignItems: 'center', textAlign: 'center' }}>
            <IconBox icon="cal" s={52} />
            <b style={{ fontSize: 16, color: 'var(--ink)' }}>Você ainda não gerou nenhum cronograma</b>
            <Muted>Monte o seu no gerador — ele fica salvo aqui e você pode voltar quando quiser.</Muted>
            <Btn kind="gold" icon="plus" href="/aluno/cronograma?criar">Gerar meu cronograma</Btn>
          </Card>
        ) : (
          <MinhasEmissoes inicial={dados} />
        )}
      </Col>
    </InternaPageRoot>
  )
}
