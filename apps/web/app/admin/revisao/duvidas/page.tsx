import Link from 'next/link'
import { FileText, Upload } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { RevisaoAbas, RevisaoCard, RevisaoHead } from '@/components/admin/revisao/ui'
import { cn } from '@/lib/utils'
import {
  carregarThread, contagensDuvidas, listarAvaliacoesPagina, listarDuvidasPagina, listarProfessores, listarReportesPagina, resumoAvaliacoes,
  type ThreadDuvida,
} from '@/lib/revisao/duvidas'
import { BarraBusca, KpiCard, KpiGrid, Nota, PaginaNav, ParamsInt, Pilula, ThFixo, ThOrd, hrefCom, type QS } from '../_comp/lista'
import { CorrigidoBotao, ResponderDuvida } from './duvidas-client'

export const dynamic = 'force-dynamic'

// Central de Dúvidas — admin "Plataforma Revisão". Três abas (?aba=duv|rep|aval) sobre dados já existentes
// (simulado_duvidas, simulado_material_reportes, simulado_material_avaliacoes). Só LÊ dados prontos e paginados.

const BASE = '/admin/revisao/duvidas'
type Aba = 'duv' | 'rep' | 'aval'
const TIPO_REP: Record<string, { l: string; t: 'bad' | 'warn' | 'vio' }> = {
  erro_conteudo: { l: 'Erro', t: 'bad' }, desatualizado: { l: 'Desatualização', t: 'warn' }, erro_tecnico: { l: 'Problema técnico', t: 'vio' }, outro: { l: 'Outro', t: 'vio' },
}

export default async function DuvidasRevisaoPage({ searchParams }: { searchParams: Promise<QS> }) {
  const sp = await searchParams
  const aba: Aba = sp.aba === 'rep' || sp.aba === 'aval' ? sp.aba : 'duv'
  const access = await getCurrentAccess()
  const pode = access.isAdmin || access.permissions.includes('*') || access.permissions.includes('estudantes:view')
  if (!pode || !access.tenantId) {
    return <div className="w-full space-y-4"><h1 className="text-2xl font-bold tracking-tight">Central de Dúvidas</h1><SemPermissao>Você não tem permissão para acessar a central de dúvidas.</SemPermissao></div>
  }
  const podeEditar = access.isAdmin || access.permissions.includes('*') || access.permissions.includes('estudantes:update')
  const svc = createAdminClient()
  const tenantId = access.tenantId
  const qs: QS = { aba, f: sp.f, sel: sp.sel, q: sp.q, pag: sp.pag, situ: sp.situ, tipo: sp.tipo, nota: sp.nota, ord: sp.ord, dir: sp.dir }
  const cont = await contagensDuvidas(svc, tenantId)

  let corpo: React.ReactNode
  let erro: string | null = null
  try {
    corpo = aba === 'duv' ? await AbaDuvidas({ svc, tenantId, qs, cont, podeEditar })
      : aba === 'rep' ? await AbaProblemas({ svc, tenantId, qs, podeEditar })
      : await AbaAvaliacoes({ svc, tenantId, qs })
  } catch (e) {
    erro = /relation .* does not exist|could not find the table|schema cache|does not exist/i.test((e as Error)?.message ?? '')
      ? 'Dúvidas e demandas ficam disponíveis após aplicar as migrações 20261027010000 e 20261027020000.'
      : 'Não foi possível carregar agora. Tente novamente em instantes.'
  }

  return (
    <div className="w-full">
      <RevisaoHead secao="Pedagógico" titulo="Central de Dúvidas" subtitulo="Dúvidas dos alunos, problemas reportados nos materiais e as estrelas dadas ao concluir cada PDF ou videoaula." />
      <RevisaoAbas base={BASE} atual={aba} abas={[
        { id: 'duv', titulo: 'Dúvidas', contagem: cont.abertas },
        { id: 'rep', titulo: 'Problemas em materiais', contagem: cont.problemasAbertos },
        { id: 'aval', titulo: 'Avaliações dos materiais', contagem: cont.avaliacoes },
      ]} />
      {!cont.migrado && <Nota tipo="aviso">Parte desta central depende das migrações 20261027010000 (dúvidas) e 20261027020000 (demandas), ainda não aplicadas neste banco.</Nota>}
      {erro ? <Nota tipo="aviso">{erro}</Nota> : corpo}
    </div>
  )
}

type Ctx = { svc: ReturnType<typeof createAdminClient>; tenantId: string; qs: QS }

// ───────────────────────────── Dúvidas ─────────────────────────────

async function AbaDuvidas({ svc, tenantId, qs, cont, podeEditar }: Ctx & { cont: Awaited<ReturnType<typeof contagensDuvidas>>; podeEditar: boolean }) {
  const grupo = qs.f === 'respondida' ? 'respondida' : 'aberta'
  const por = 12, pagina = ParamsInt(qs.pag, 1)
  const { itens, total } = await listarDuvidasPagina(svc, tenantId, { grupo, q: qs.q, pagina, por })
  const selId = itens.find((i) => i.id === qs.sel)?.id ?? itens[0]?.id
  let thread: ThreadDuvida | null = null
  let professores: Array<{ id: string; nome: string }> = []
  if (selId) [thread, professores] = await Promise.all([carregarThread(svc, tenantId, selId), grupo === 'aberta' ? listarProfessores(svc, tenantId) : Promise.resolve([])])

  return (
    <>
      <div className="mb-4 inline-flex rounded-xl border bg-card p-1" role="group" aria-label="Filtrar dúvidas">
        {([['aberta', `Sem resposta · ${cont.abertas}`], ['respondida', `Respondidas · ${cont.respondidas}`]] as const).map(([id, l]) => (
          <Link key={id} href={hrefCom(BASE, { aba: 'duv', q: qs.q }, { f: id })}
            className={cn('rounded-lg px-3 py-1.5 text-sm font-medium transition-colors', grupo === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{l}</Link>
        ))}
      </div>
      <BarraBusca base={BASE} qs={qs} preservar={['aba', 'f']} placeholder="Buscar pelo tema da dúvida" />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <RevisaoCard className="p-2">
          <div className="flex flex-col gap-1">
            {itens.map((x) => (
              <Link key={x.id} href={hrefCom(BASE, qs, { sel: x.id })}
                className={cn('block rounded-xl border p-3 transition-colors', x.id === selId ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/50')}>
                <span className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                  {x.disciplina && <Pilula tipo="vio">{x.disciplina.replace('Direito ', '')}</Pilula>}{x.quando}
                </span>
                <b className="block text-sm">{x.titulo}</b>
                {x.preview && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{x.preview}</p>}
              </Link>
            ))}
            {!itens.length && <p className="px-3 py-8 text-center text-sm text-muted-foreground">{qs.q ? 'Nenhuma dúvida encontrada.' : grupo === 'aberta' ? 'Nenhuma dúvida aqui. Tudo respondido.' : 'Nenhuma dúvida respondida ainda.'}</p>}
          </div>
          <div className="px-2 pb-1"><PaginaNav base={BASE} qs={qs} pagina={pagina} porPagina={por} total={total} /></div>
        </RevisaoCard>

        {thread && (
          <RevisaoCard className="space-y-4">
            <div>
              <h2 className="text-base font-semibold">{thread.titulo}</h2>
              <p className="text-xs text-muted-foreground">{[thread.disciplina, thread.aluno, thread.quando].filter(Boolean).join(' · ')}</p>
            </div>
            <Pilula tipo="mut"><FileText className="h-3 w-3" />{thread.onde}</Pilula>
            <div className="space-y-2">
              {thread.mensagens.map((m) => (
                <div key={m.id} className={cn('rounded-xl px-4 py-3 text-sm', m.autor === 'aluno' ? 'bg-muted' : 'bg-primary/10')}>
                  <small className="mb-1 block text-xs font-semibold text-muted-foreground">{m.autor === 'aluno' ? `${m.nome} perguntou` : `Resposta enviada · ${m.nome}`} · {m.quando}</small>
                  <span className="whitespace-pre-wrap">{m.texto}</span>
                </div>
              ))}
            </div>
            {thread.encaminhamentos.length > 0 && (
              <p className="text-xs text-muted-foreground">Encaminhada para {thread.encaminhamentos.map((e) => `${e.professor} (${e.quando})`).join(', ')}.</p>
            )}
            {grupo === 'aberta' && <ResponderDuvida duvidaId={thread.id} professores={professores} podeEditar={podeEditar} />}
          </RevisaoCard>
        )}
      </div>
    </>
  )
}

// ───────────────────────────── Problemas em materiais ─────────────────────────────

async function AbaProblemas({ svc, tenantId, qs, podeEditar }: Ctx & { podeEditar: boolean }) {
  const por = 20, pagina = ParamsInt(qs.pag, 1)
  const { itens, total } = await listarReportesPagina(svc, tenantId, { situ: qs.situ, tipo: qs.tipo, q: qs.q, ord: qs.ord, dir: qs.dir, pagina, por })
  return (
    <>
      <BarraBusca base={BASE} qs={qs} preservar={['aba']} placeholder="Buscar no que o aluno disse" filtros={[
        { nome: 'situ', rotulo: 'Todas as situações', opcoes: [{ v: 'abertos', l: 'Abertos' }, { v: 'corrigidos', l: 'Corrigidos' }] },
        { nome: 'tipo', rotulo: 'Todos os tipos', opcoes: [{ v: 'erro_conteudo', l: 'Erro' }, { v: 'desatualizado', l: 'Desatualização' }, { v: 'erro_tecnico', l: 'Problema técnico' }, { v: 'outro', l: 'Outro' }] },
      ]} />
      <RevisaoCard className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b"><tr>
              <ThFixo>Material</ThFixo><ThOrd rotulo="Tipo" col="tipo" base={BASE} qs={qs} /><ThFixo>O que o aluno disse</ThFixo><ThOrd rotulo="Quando" col="quando" base={BASE} qs={qs} /><ThFixo />
            </tr></thead>
            <tbody className="divide-y">
              {itens.map((r) => {
                const t = TIPO_REP[r.tipo] ?? TIPO_REP.outro
                return (
                  <tr key={r.id} className="align-top hover:bg-muted/40">
                    <td className="px-3 py-2.5"><b className="block font-medium">{r.material}</b><span className="text-xs text-muted-foreground">{r.pagina} · {r.aluno}</span></td>
                    <td className="px-3 py-2.5"><Pilula tipo={t.t}>{t.l}</Pilula></td>
                    <td className="min-w-[14rem] px-3 py-2.5">{r.texto}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{r.quando}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {r.status !== 'resolvido' ? (
                          <>
                            <Link href={`/admin/biblioteca/conteudo/${r.documentoId}/gerenciar`} className="inline-flex h-7 items-center gap-1 rounded-lg border px-2.5 text-[0.8rem] font-medium hover:bg-accent"><Upload className="h-3.5 w-3.5" />Trocar arquivo</Link>
                            {podeEditar && <CorrigidoBotao id={r.id} />}
                          </>
                        ) : <Pilula tipo="ok">Corrigido · aluno avisado</Pilula>}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!itens.length && <tr><td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">Nenhum problema reportado.</td></tr>}
            </tbody>
          </table>
        </div>
      </RevisaoCard>
      <PaginaNav base={BASE} qs={qs} pagina={pagina} porPagina={por} total={total} />
    </>
  )
}

// ───────────────────────────── Avaliações ─────────────────────────────

function Estrelas({ n }: { n: number }) {
  return <span aria-label={`${n} de 5`} className="whitespace-nowrap tracking-tight"><span className="text-amber-500">{'★'.repeat(n)}</span><span className="text-muted-foreground/30">{'★'.repeat(5 - n)}</span></span>
}

async function AbaAvaliacoes({ svc, tenantId, qs }: Ctx) {
  const por = 20, pagina = ParamsInt(qs.pag, 1)
  const [res, { itens, total }] = await Promise.all([
    resumoAvaliacoes(svc, tenantId),
    listarAvaliacoesPagina(svc, tenantId, { nota: qs.nota, q: qs.q, ord: qs.ord, dir: qs.dir, pagina, por }),
  ])
  return (
    <>
      <KpiGrid cols={3}>
        <KpiCard rotulo="Média geral" valor={`${res.total ? res.media.toFixed(1).replace('.', ',') : '—'} ★`} />
        <KpiCard rotulo="Avaliações de 1 ou 2 estrelas" valor={res.baixas} alerta={res.baixas > 0} />
        <KpiCard rotulo="Com comentário" valor={res.comComentario} />
      </KpiGrid>
      <BarraBusca base={BASE} qs={qs} preservar={['aba']} placeholder="Buscar no comentário" filtros={[
        { nome: 'nota', rotulo: 'Todas as notas', opcoes: [{ v: 'baixas', l: '1 ou 2 estrelas' }, ...[5, 4, 3, 2, 1].map((n) => ({ v: String(n), l: `${n} ${n === 1 ? 'estrela' : 'estrelas'}` }))] },
      ]} />
      <RevisaoCard className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b"><tr>
              <ThFixo>Material</ThFixo><ThOrd rotulo="Nota" col="nota" base={BASE} qs={qs} /><ThFixo>Comentário</ThFixo><ThFixo>Aluno</ThFixo><ThOrd rotulo="Quando" col="quando" base={BASE} qs={qs} />
            </tr></thead>
            <tbody className="divide-y">
              {itens.map((a) => (
                <tr key={a.id} className="align-top hover:bg-muted/40">
                  <td className="px-3 py-2.5 font-medium">{a.material}</td>
                  <td className="px-3 py-2.5"><Estrelas n={a.nota} /></td>
                  <td className="min-w-[12rem] px-3 py-2.5">{a.comentario ? a.comentario : <span className="text-muted-foreground">sem comentário</span>}</td>
                  <td className="px-3 py-2.5">{a.aluno}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{a.quando}</td>
                </tr>
              ))}
              {!itens.length && <tr><td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">Nenhuma avaliação ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </RevisaoCard>
      <PaginaNav base={BASE} qs={qs} pagina={pagina} porPagina={por} total={total} />
    </>
  )
}
