import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowLeft, ListChecks } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { lerFiltro } from '@/lib/cronograma/adaptativo/qf-db'
import { consultarQuestoesFiltro, montarQuestoesAluno } from '@/lib/cronograma/adaptativo/qf-questoes'
import { QuestoesMetaClient } from './questoes-meta-client'

export const metadata: Metadata = { title: 'Questões da meta' }
export const dynamic = 'force-dynamic'

// QUESTÕES DA PLATAFORMA de uma meta do Cronograma Adaptativo. A URL (montada pelo iframe do cronograma) traz:
//   k      chave ESTÁVEL da aula → o filtro (configurado no admin › Catálogo de metas) é lido AQUI, no servidor;
//   meta   id da meta (ausente = meta já concluída → modo revisar, sem tempo/concluir);
//   voltar rota de retorno (só /aluno/…, igual ao leitor); t título; tseg tempo já acumulado; page página (10/pág).
// Backend-first: a consulta pagina NO BANCO (.range + count) — nada de carregar o filtro inteiro.
const POR_PAGINA = 10

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

export default async function QuestoesDaMetaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')

  const chave = um(sp.k).slice(0, 240)
  const metaId = um(sp.meta).slice(0, 80) || null
  const titulo = um(sp.t).slice(0, 120)
  const voltarRaw = um(sp.voltar)
  const voltar = voltarRaw.startsWith('/aluno/') ? voltarRaw : '/aluno/cronograma' // nunca open-redirect
  const tseg = Math.max(0, Math.min(10 * 24 * 3600, parseInt(um(sp.tseg), 10) || 0))
  const page = Math.max(1, parseInt(um(sp.page), 10) || 1)

  const svc = createAdminClient()
  const filtro = chave ? await lerFiltro(svc, sessao.tenantId, chave) : null
  if (!filtro) return <Aviso voltar={voltar} texto="Esta meta não tem questões da plataforma configuradas." />

  const { rows, count } = await consultarQuestoesFiltro(svc, sessao.tenantId, filtro, (page - 1) * POR_PAGINA, POR_PAGINA)
  if (count === 0) return <Aviso voltar={voltar} texto="Ainda não há questões disponíveis para esta meta." />
  if (!rows.length) redirect(`/aluno/cronograma/questoes?${new URLSearchParams({ k: chave, ...(metaId ? { meta: metaId } : {}), voltar, t: titulo, ...(tseg ? { tseg: String(tseg) } : {}) })}`) // página além do fim → volta à 1ª

  const questoes = await montarQuestoesAluno(svc, sessao.tenantId, sessao.estudanteId, rows)
  return (
    <QuestoesMetaClient
      questoes={questoes} total={count} page={page} porPagina={POR_PAGINA}
      chave={chave} metaId={metaId} titulo={titulo} voltar={voltar} tsegInicial={tseg}
    />
  )
}

function Aviso({ voltar, texto }: { voltar: string; texto: string }) {
  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div className="flex w-full flex-col items-center gap-3 rounded-2xl border bg-card p-10 text-center shadow-sm">
        <ListChecks className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{texto}</p>
        <Link href={voltar} className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-medium hover:bg-muted"><ArrowLeft className="h-4 w-4" />Voltar ao cronograma</Link>
      </div>
    </div>
  )
}
