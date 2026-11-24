import { Suspense } from 'react'
import Link from 'next/link'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { TituloTela } from '@/components/admin/cronograma/titulo-tela'
import { BarraBusca, Nota, ParamsInt, Pilula, ThFixo, ThOrd, type QS } from '@/app/admin/revisao/_comp/lista'
import { TabelaCron, type LinhaCron } from '@/app/admin/revisao/cronograma/tabela-cron'
import { lerIntegridade, dispararAuditoria } from '@/lib/cronograma/adaptativo/integridade-admin'
import { ROTULO_ANOMALIA, TIPOS_ANOMALIA, norm, type TipoAnomalia } from '@/lib/cronograma/adaptativo/auditar-plano'
import { dataBr } from '@/lib/admin/revisao/datas'
import { formatBrt } from '@/lib/brt'
import { cn } from '@/lib/utils'
import { DetalheIntegridade } from './integridade-client'
import { ReauditarBotao } from './reauditar-botao'
import { AutoAtualizar } from './auto-atualizar'
import { EsqueletoTela } from '@/components/admin/cronograma/esqueleto-tela'

export const dynamic = 'force-dynamic'

// Admin: Cronograma Adaptativo — INTEGRIDADE (somente leitura). Backend-first: a varredura pesada (planos + metas) roda em SEGUNDO PLANO
// (after) e grava o resultado no cache; esta página só LÊ o resultado pronto (instantâneo), agrupa por tipo e pagina. Nenhuma correção aqui.
const BASE = '/admin/cronogramas/adaptativo/integridade'
const nf = (n: number) => n.toLocaleString('pt-BR')
const fmtData = (v: string | null): string | null => (!v ? null : v.length <= 10 ? dataBr(v) : formatBrt(v))
const PILULA_TIPO: Record<TipoAnomalia, 'bad' | 'warn' | 'vio' | 'mut'> = {
  feito_em_aula_diferente: 'bad', revisao_antes_do_estudo: 'warn', id_fora_do_catalogo: 'bad', aula_sem_pdfull_na_grade: 'warn',
  materia_fora_da_selecao: 'warn', plano_sem_assinatura: 'vio', grade_vazia: 'bad', meta_orfa: 'mut',
}

export default async function IntegridadeAdaptativoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const acesso = await getCurrentAccess()
  const permitido = acesso.isAdmin || acesso.permissions.includes('*') || acesso.permissions.includes('cronogramas:view')
  if (!acesso.tenantId || !permitido) return <SemPermissao>Você não tem permissão para ver a integridade do cronograma adaptativo.</SemPermissao>

  const raw = await searchParams
  const qs: QS = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]))
  const podeAtualizar = acesso.isAdmin || acesso.permissions.includes('*') || acesso.permissions.includes('cronogramas:update')
  return (
    <div className="w-full space-y-4">
      <TituloTela titulo="Integridade" descricao="Somente as inconsistências dos planos ativos (progresso em aula diferente, revisão antes do estudo, meta fora do catálogo…). Indicadores gerais e a busca de alunos ficam na Análise de uso. Nada é corrigido aqui." />
      <Suspense fallback={<EsqueletoTela linhas={4} />}><CorpoIntegridade tenantId={acesso.tenantId} podeAtualizar={podeAtualizar} qs={qs} /></Suspense>
    </div>
  )
}

function minutosAtras(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000))
  return m < 1 ? 'agora há pouco' : m < 60 ? `há ${m} min` : `há ${Math.round(m / 60)} h`
}

async function CorpoIntegridade({ tenantId, podeAtualizar, qs }: { tenantId: string; podeAtualizar: boolean; qs: QS }) {
  let leitura: Awaited<ReturnType<typeof lerIntegridade>>
  try { leitura = await lerIntegridade(tenantId) } catch { leitura = { tipo: 'erro', msg: 'Não foi possível ler o resultado da auditoria agora.', em: Date.now() } }

  if (leitura.tipo === 'vazio' || (leitura.tipo === 'pronto' && leitura.velho)) after(() => dispararAuditoria(createAdminClient(), tenantId))
  if (leitura.tipo === 'vazio') return <AutoAtualizar desde={Date.now()} />
  if (leitura.tipo === 'calculando') return <AutoAtualizar desde={leitura.desde} />
  if (leitura.tipo === 'erro') {
    return (
      <div className="space-y-3">
        <Nota tipo="aviso">A auditoria falhou: {leitura.msg} Nenhum número foi estimado.</Nota>
        {podeAtualizar ? <ReauditarBotao rotulo="Tentar de novo" /> : <p className="text-sm text-muted-foreground">Peça a um administrador com permissão de edição para tentar de novo.</p>}
      </div>
    )
  }
  const r = leitura.r

  const pagina = ParamsInt(qs.pag, 1, 1, 100000)
  const porPagina = ParamsInt(qs.pps, 14, 5, 100)
  const comAnomalia = TIPOS_ANOMALIA.filter((t) => r.porTipo[t] > 0)
  const tipo: TipoAnomalia | null = (comAnomalia as readonly string[]).includes(qs.tipo ?? '') ? (qs.tipo as TipoAnomalia) : (comAnomalia[0] ?? null)
  const ordem = ['total', 'nome', 'email'].includes(qs.ord ?? '') ? (qs.ord as 'total' | 'nome' | 'email') : 'total'
  const dir = qs.dir === 'asc' || (qs.dir !== 'desc' && ordem !== 'total') ? 1 : -1
  const hrefTipo = (t: TipoAnomalia) => { const q = new URLSearchParams(Object.entries(qs).filter(([k, v]) => v && !['tipo', 'pag', 'plano'].includes(k)) as [string, string][]); q.set('tipo', t); return `${BASE}?${q}` }
  const baseQs: QS = { ...qs, tipo: tipo ?? undefined }

  const busca = norm(qs.q)
  let lista = tipo ? r.planos.filter((p) => (p.porTipo[tipo] ?? 0) > 0 && (!busca || norm(p.email).includes(busca) || norm(p.nome).includes(busca))) : []
  lista = [...lista].sort((a, b) => {
    const c = ordem === 'total' ? (tipo ? (a.porTipo[tipo] ?? 0) - (b.porTipo[tipo] ?? 0) : 0) : ordem === 'nome' ? a.nome.localeCompare(b.nome, 'pt-BR') : a.email.localeCompare(b.email, 'pt-BR')
    return (c || a.email.localeCompare(b.email, 'pt-BR')) * dir
  })
  const total = lista.length
  const pagina_ = lista.slice((pagina - 1) * porPagina, pagina * porPagina)

  const sel = qs.plano ? r.planos.find((p) => p.planoId === qs.plano) : null
  const hrefPlano = (id: string) => { const q = new URLSearchParams(Object.entries(baseQs).filter(([, v]) => v) as [string, string][]); q.set('plano', id); return `${BASE}?${q}` }

  const rows: LinhaCron[] = pagina_.map((p) => ({
    id: p.planoId,
    cells: [
      <Link key="a" href={`/admin/estudantes/${p.estudanteId}`} className="font-medium text-primary underline-offset-2 hover:underline">{p.nome || 'Aluno'}</Link>,
      <span key="e" className="text-muted-foreground">{p.email || '—'}</span>,
      <span key="t">{p.titulo || '—'}</span>,
      <span key="n" className="tabular-nums font-semibold">{nf(tipo ? (p.porTipo[tipo] ?? 0) : p.total)}</span>,
      <Link key="d" href={hrefPlano(p.planoId)} className="font-medium text-primary underline-offset-2 hover:underline">Ver detalhe</Link>,
      <Link key="u" href={`/admin/cronogramas/adaptativo/analise?q=${encodeURIComponent(p.email || p.nome)}`} className="font-medium text-primary underline-offset-2 hover:underline">Ver na Análise</Link>,
    ],
  }))
  const head = (
    <>
      <ThOrd rotulo="Aluno" col="nome" base={BASE} qs={baseQs} />
      <ThOrd rotulo="E-mail" col="email" base={BASE} qs={baseQs} />
      <ThFixo>Plano</ThFixo>
      <ThOrd rotulo="Ocorrências" col="total" base={BASE} qs={baseQs} align="right" />
      <ThFixo>Detalhe</ThFixo>
      <ThFixo>Análise de uso</ThFixo>
    </>
  )

  return (
    <div className="space-y-4">
      {r.catalogoVazio && <Nota tipo="aviso">O catálogo de aulas não foi carregado agora (vazio ou falha de leitura). Sem ele não há referência confiável para auditar — nada foi estimado.</Nota>}
      {!r.catalogoVazio && !r.temAulaKey && <Nota tipo="aviso">A migração <b>20261129000000_adaptativo_meta_aula_key.sql</b> ainda não foi aplicada: sem a coluna <b>aula_key</b> o auditor não detecta “Progresso em aula diferente”. As demais verificações já funcionam.</Nota>}

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-muted-foreground">{nf(r.planosAuditados)} planos auditados · atualizado {minutosAtras(r.geradoEm)} ({fmtData(r.geradoEm)}, Brasília){leitura.velho ? ' · recalculando em segundo plano' : ''}.</p>
        {podeAtualizar && <ReauditarBotao />}
      </div>

      {!r.catalogoVazio && comAnomalia.length === 0 ? (
        <div className="rounded-2xl border bg-card p-6 text-sm"><b className="text-base">Tudo íntegro.</b><p className="mt-1 text-muted-foreground">Nenhuma inconsistência encontrada nos {nf(r.planosAuditados)} planos auditados.</p></div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {comAnomalia.map((t) => (
              <Link key={t} href={hrefTipo(t)} scroll={false} className={cn('rounded-2xl border bg-card p-4 shadow-sm transition hover:bg-muted/40', t === tipo && 'border-primary ring-1 ring-primary')}>
                <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">{ROTULO_ANOMALIA[t]}</span>
                <b className="mt-1 block text-3xl font-bold tabular-nums">{nf(r.porTipo[t])}</b>
                <Pilula tipo={PILULA_TIPO[t]} className="mt-1">{r.porTipo[t] === 1 ? 'plano afetado' : 'planos afetados'}</Pilula>
              </Link>
            ))}
          </div>
          <BarraBusca base={BASE} qs={baseQs} preservar={['tipo']} placeholder="Buscar por e-mail ou nome do aluno" />
          <TabelaCron tipo="leitura" podeEditar={false} colunas={6} total={total} page={pagina} pp={porPagina}
            vazio="Nada encontrado com esses filtros." head={head} rows={rows} />
        </>
      )}

      {sel && (
        <DetalheIntegridade d={{
          planoId: sel.planoId, estudanteId: sel.estudanteId, nome: sel.nome, email: sel.email, titulo: sel.titulo, total: sel.total,
          anomalias: sel.anomalias.map((a) => ({ ...a, data: fmtData(a.data) })), rotulos: ROTULO_ANOMALIA,
        }} />
      )}
    </div>
  )
}
