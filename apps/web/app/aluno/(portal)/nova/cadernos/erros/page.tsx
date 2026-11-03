// Caderno de ERROS (automático) — questões do Banco/Recomendados/cadernos cuja ÚLTIMA resposta do aluno
// foi errada. Refazer aqui e acertar tira a questão do caderno (na próxima visita).
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PageHeader, Card, Aviso, Btn, Muted } from '@/components/nova/ui'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { QuestaoCard } from '@/components/aluno/questao-card'
import { cadernoDeErros, questoesParaAluno } from '@/lib/aluno/cadernos-aluno'
import { R } from '@/lib/nova/rotas'

export const dynamic = 'force-dynamic'

const POR_PAGINA = 30

export default async function CadernoErrosPage({ searchParams }: { searchParams: Promise<{ n?: string }> }) {
  const sp = await searchParams
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const svc = createAdminClient()

  const { ids } = await cadernoDeErros(svc, sessao.tenantId, sessao.estudanteId)
  const limite = Math.min(ids.length, Math.max(POR_PAGINA, Math.trunc(Number(sp?.n)) || POR_PAGINA))
  const lista = await questoesParaAluno(svc, sessao.tenantId, sessao.estudanteId, ids.slice(0, limite))

  return (
    <>
      <Link href={R.cadernos} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--muted)' }}>← Meus Cadernos</Link>
      <PageHeader
        title="Caderno de erros"
        sub={ids.length
          ? `${ids.length} ${ids.length === 1 ? 'questão' : 'questões'} que você errou na última tentativa. Acerte para tirá-las daqui.`
          : 'Montado automaticamente com as questões que você errar no Banco de Questões.'}
      />

      {ids.length === 0 ? (
        <Card>
          <Aviso icon="check" action={<Btn kind="secondary" icon="qbook" href="/aluno/questoes">Ir ao banco de questões</Btn>}>
            Nenhuma questão pendente. Quando você errar uma questão no Banco de Questões, ela aparece aqui para você refazer.
          </Aviso>
        </Card>
      ) : (
        <div className="space-y-4">
          {lista.map((q, i) => <QuestaoCard key={q.id} questao={q} numero={i + 1} />)}
          {limite < ids.length && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingTop: 8 }}>
              <Muted size={12.5}>Mostrando {limite} de {ids.length}</Muted>
              <Btn kind="secondary" href={`${R.cadernos}/erros?n=${limite + POR_PAGINA}`}>Mostrar mais</Btn>
            </div>
          )}
        </div>
      )}
    </>
  )
}
