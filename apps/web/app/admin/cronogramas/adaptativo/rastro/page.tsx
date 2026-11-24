import { Suspense } from 'react'
import Link from 'next/link'
import { AbasLinha } from '@/components/ui/abas-linha'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { TituloTela } from '@/components/admin/cronograma/titulo-tela'
import { BarraBusca, KpiCard, KpiGrid, Nota, ParamsInt, Pilula, ThFixo, hrefCom, type QS } from '@/app/admin/revisao/_comp/lista'
import { TabelaCron, type LinhaCron } from '@/app/admin/revisao/cronograma/tabela-cron'
import { rastroDoAluno } from '@/lib/cronograma/adaptativo/rastro-plano-server'
import { cn } from '@/lib/utils'
import { TIPOS_META } from '@/lib/cronograma/adaptativo/tipos-meta'
import { dataBr } from '@/lib/admin/revisao/datas'
import { EsqueletoTela } from '@/components/admin/cronograma/esqueleto-tela'

export const dynamic = 'force-dynamic'

// Admin: Cronograma Adaptativo — RASTRO de decisão por plano de aluno (somente leitura, cronogramas:view). Backend-first: o motor roda
// no servidor sob demanda (cache 60 s); a página só filtra/pagina o resultado. Nada é gravado e o plano do aluno não muda.
const BASE = '/admin/cronogramas/adaptativo/rastro'
const nf = (n: number) => n.toLocaleString('pt-BR')
const ROTULO_COD: Record<string, string> = {
  restricao: 'Restrição ativa', limite_dia: 'Limite por dia', teto_semana: 'Teto semanal de PDFull', limite_novos_dia: 'PDFulls novos por dia',
  revisao_obrigatoria: 'Revisão obrigatória', adaptacao_off: 'Adaptação desligada', adiada_sem_domino: 'Adiada sem dominó',
}
const rotuloTipo = (t: string) => (TIPOS_META as Record<string, { rotulo: string }>)[t]?.rotulo ?? t

export default async function RastroPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const acesso = await getCurrentAccess()
  const permitido = acesso.isAdmin || acesso.permissions.includes('*') || acesso.permissions.includes('cronogramas:view')
  if (!acesso.tenantId || !permitido) return <SemPermissao>Você não tem permissão para ver o rastro do cronograma adaptativo.</SemPermissao>

  const raw = await searchParams
  const qs: QS = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]))
  // Título + busca primeiro; a re-simulação do plano (motor) chega por streaming.
  return (
    <div className="w-full space-y-4">
      <TituloTela titulo="Rastro" descricao="Por que o motor posicionou as metas de um aluno como posicionou: faixa e ocupação por semana (plano gravado) e as decisões que adiaram/barraram metas (re-simulação com o estado atual do aluno). Somente leitura." />
      <Suspense fallback={<><BarraBusca base={BASE} qs={qs} placeholder="E-mail completo do aluno" filtros={[]} preservar={['vis']} /><EsqueletoTela /></>}>
        <CorpoRastro tenantId={acesso.tenantId} qs={qs} />
      </Suspense>
    </div>
  )
}

async function CorpoRastro({ tenantId, qs }: { tenantId: string; qs: QS }) {
  const vis = qs.vis === 'eventos' ? 'eventos' : 'semanas'
  const pagina = ParamsInt(qs.pag, 1, 1, 100000)
  const porPagina = ParamsInt(qs.pps, 14, 5, 100)
  const r = qs.q?.trim() ? await rastroDoAluno(createAdminClient(), tenantId, qs.q, qs.plano) : null
  const d = r?.ok ? r.dados : null

  const filtros = d ? [{ nome: 'plano', rotulo: 'Plano', valor: d.planoId ?? '', opcoes: d.planos.map((p) => ({ v: p.id, l: (p.titulo || 'Plano') + (p.fixado ? ' (fixado)' : '') })) },
    ...(vis === 'eventos' ? [{ nome: 'cod', rotulo: 'Todos os motivos', opcoes: Object.entries(ROTULO_COD).map(([v, l]) => ({ v, l })) }] : [])] : []

  let tabela: React.ReactNode = null
  if (d && vis === 'semanas') {
    const total = d.porSemana.length
    const rows: LinhaCron[] = d.porSemana.slice((pagina - 1) * porPagina, pagina * porPagina).map((l) => ({
      id: String(l.sem),
      cells: [
        <span key="s" className="tabular-nums font-medium">{l.sem} <span className="text-xs font-normal text-muted-foreground">{dataBr(l.inicio)}</span></span>,
        <span key="f" className="flex items-center gap-1"><Pilula tipo={l.faixa === 3 ? 'vio' : l.faixa === 2 ? 'warn' : 'mut'}>Faixa {l.faixa}</Pilula>{l.revisao && <Pilula tipo="warn">Revisão</Pilula>}</span>,
        <span key="t" className="tabular-nums">{l.pdfNovos}/{l.tetoPdf}</span>,
        <span key="m" className="flex flex-wrap gap-1">{Object.entries(l.metasPorTipo).map(([t, n]) => <Pilula key={t}>{rotuloTipo(t)} · {n}</Pilula>)}</span>,
        <span key="o" className="tabular-nums">{Math.round(l.minUsados / 6) / 10}h / {Math.round(l.minDisponiveis / 6) / 10}h <span className={cn('text-xs', l.ocupacaoPct > 100 ? 'font-semibold text-destructive' : 'text-muted-foreground')}>({l.ocupacaoPct}%)</span></span>,
        <span key="v" className={cn('tabular-nums', l.violacoes > 0 && 'font-semibold text-destructive')}>{l.violacoes}</span>,
      ],
    }))
    const head = <><ThFixo>Semana</ThFixo><ThFixo>Faixa / rotina</ThFixo><ThFixo>PDFull novos / teto</ThFixo><ThFixo>Metas por tipo</ThFixo><ThFixo>Ocupação</ThFixo><ThFixo align="right">Violações</ThFixo></>
    tabela = <TabelaCron tipo="leitura" podeEditar={false} colunas={6} total={total} page={pagina} pp={porPagina} vazio="Plano sem metas." head={head} rows={rows} />
  } else if (d) {
    const cod = ROTULO_COD[qs.cod ?? ''] ? qs.cod : null
    const lista = d.eventos.filter((e) => !cod || e.cod === cod)
    const rows: LinhaCron[] = lista.slice((pagina - 1) * porPagina, pagina * porPagina).map((e, k) => ({
      id: `${e.id}|${e.cod}|${k}`,
      cells: [
        <Pilula key="c" tipo={e.cod === 'restricao' ? 'bad' : e.cod === 'adaptacao_off' || e.cod === 'adiada_sem_domino' ? 'vio' : 'warn'}>{ROTULO_COD[e.cod] ?? e.cod}</Pilula>,
        <span key="t">{e.texto}</span>,
        <span key="d" className="tabular-nums text-muted-foreground">{e.de === e.ate ? dataBr(e.de) : `${dataBr(e.de)} → ${dataBr(e.ate)}`}</span>,
        <span key="n" className="tabular-nums">{nf(e.n)}</span>,
      ],
    }))
    const head = <><ThFixo>Motivo</ThFixo><ThFixo>Decisão</ThFixo><ThFixo>Quando</ThFixo><ThFixo align="right">Vezes</ThFixo></>
    tabela = <TabelaCron tipo="leitura" podeEditar={false} colunas={4} total={lista.length} page={pagina} pp={porPagina} vazio={d.legado ? 'Plano legado (motor 2.8.1): o rastro só existe para o motor atual.' : 'Nenhuma decisão registrada: nenhuma meta foi adiada por restrição, teto ou limite.'} head={head} rows={rows} />
  }
  const abasVis = (
    <AbasLinha ativo={vis} itens={[['semanas', 'Faixa por semana'], ['eventos', 'Decisões do motor']].map(([v, l]) => ({ key: v, label: l, href: hrefCom(BASE, qs, { vis: v === 'semanas' ? undefined : v, pag: undefined }) }))} />
  )

  return (
    <div className="space-y-4">
      <BarraBusca base={BASE} qs={qs} placeholder="E-mail completo do aluno" filtros={filtros} preservar={['vis']} />
      {!qs.q?.trim() && <Nota>Informe o e-mail do aluno para ver o rastro do plano dele.</Nota>}
      {r && !r.ok && <Nota tipo="aviso">{r.error}</Nota>}
      {d && (
        <>
          <p className="text-sm text-muted-foreground"><b>{d.aluno.nome || 'Aluno'}</b> · {d.aluno.email} · plano {d.titulo ? `“${d.titulo}”` : ''} · hoje {dataBr(d.hoje)} · <Link href={`/admin/estudantes/${d.aluno.id}`} className="text-primary underline-offset-2 hover:underline">abrir aluno</Link></p>
          {d.erro && <Nota tipo="aviso">{d.erro}</Nota>}
          {d.legado && <Nota tipo="aviso">Plano gravado com o motor legado (2.8.1): sem rastro de decisão; a visão por semana usa as regras vigentes.</Nota>}
          <KpiGrid>
            <KpiCard rotulo="Semanas com metas" valor={nf(d.porSemana.length)} />
            <KpiCard rotulo="Decisões registradas" valor={nf(d.eventos.length)} />
            <KpiCard rotulo="Violações no plano gravado" valor={nf(d.totalViolacoes)} alerta={d.totalViolacoes > 0} />
            <KpiCard rotulo="Decisões não registradas (limite)" valor={nf(d.descartados)} alerta={d.descartados > 0} />
          </KpiGrid>
          {abasVis}
          {tabela}
        </>
      )}
    </div>
  )
}
