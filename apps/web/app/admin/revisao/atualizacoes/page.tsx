import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { SemPermissao } from '@/components/ui/alert-box'
import { buttonVariants } from '@/components/ui/button'
import { RevisaoHead, RevisaoAbas, RevisaoCard } from '@/components/admin/revisao/ui'
import { BuscaGet, KpiGrade, Nota, Paginacao, lerPaginacao } from '@/components/admin/revisao/pedagogico-ui'
import { TIPOS_ATUALIZACAO, NOME_TIPO_ATUALIZACAO, type TipoAtualizacao } from '@/lib/admin-revisao/biblioteca-tipos'
import { AVISO_MIGRACAO_ATUALIZACOES, listarFila, listarHistorico, opcoesMateriais, resumoAtualizacoes } from '@/lib/admin-revisao/atualizacoes'
import { formatBrt } from '@/lib/brt'
import { cn } from '@/lib/utils'
import { FilaLista, FormPedido, FormRegistrar } from './atualizacoes-client'

export const metadata: Metadata = { title: 'Central de Atualizações' }
export const dynamic = 'force-dynamic'

const BASE = '/admin/revisao/atualizacoes'
type SP = Record<string, string | string[] | undefined>
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PILL: Record<TipoAtualizacao, string> = {
  legislacao: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  jurisprudencia: 'bg-primary/10 text-primary',
  correcao: 'bg-muted text-muted-foreground',
  conteudo_novo: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
}

// CENTRAL DE ATUALIZAÇÕES (Plataforma Revisão · Pedagógico). Abas por ?aba= (fila | nova | hist). A página só LÊ.
export default async function AtualizacoesRevisaoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const access = await getCurrentAccess()
  if (!accessCan(access, 'configuracoes:view') || !access.tenantId) return <SemPermissao />
  const podeEditar = accessCan(access, 'configuracoes:update')
  const tenantId = access.tenantId
  const sp = await searchParams
  const a = um(sp.aba)
  const aba = a === 'nova' || a === 'hist' ? a : 'fila'
  const svc = createAdminClient()
  const { pagina, porPagina } = lerPaginacao(sp)
  const resumo = await resumoAtualizacoes(svc, tenantId)

  return (
    <div className="w-full">
      <RevisaoHead
        secao="Pedagógico"
        titulo="Central de Atualizações"
        subtitulo="Tudo o que muda nos materiais por lei nova, julgado novo ou correção. Cada atualização registrada vira o selo “Atualizado em” e as “Novidades da versão” que o aluno vê no PDF."
        acoes={podeEditar ? <Link href={`${BASE}?aba=nova`} className={buttonVariants()}><Plus />Registrar atualização</Link> : undefined}
      />
      <KpiGrade colunas={3} itens={[
        { valor: resumo.fila, rotulo: 'materiais para atualizar', alerta: true },
        { valor: resumo.noMes, rotulo: `atualizações em ${resumo.mes}` },
        { valor: resumo.avisadas, rotulo: 'atualizações avisadas aos alunos' },
      ]} />
      {resumo.semTabela && <Nota destaque>{AVISO_MIGRACAO_ATUALIZACOES}</Nota>}
      <RevisaoAbas
        abas={[{ id: 'fila', titulo: 'Para atualizar', contagem: resumo.fila }, { id: 'nova', titulo: 'Registrar atualização' }, { id: 'hist', titulo: 'Histórico' }]}
        atual={aba} base={BASE}
      />
      {aba === 'fila' && <AbaFila svc={svc} tenantId={tenantId} pagina={pagina} porPagina={porPagina} podeEditar={podeEditar} sp={sp} />}
      {aba === 'nova' && <AbaNova svc={svc} tenantId={tenantId} sp={sp} podeEditar={podeEditar} />}
      {aba === 'hist' && <AbaHistorico svc={svc} tenantId={tenantId} sp={sp} />}
    </div>
  )
}

type Svc = ReturnType<typeof createAdminClient>

async function AbaFila({ svc, tenantId, pagina, porPagina, podeEditar, sp }: { svc: Svc; tenantId: string; pagina: number; porPagina: number; podeEditar: boolean; sp: SP }) {
  const mq = (um(sp.mq) ?? '').trim().slice(0, 80)
  const [fila, opcoes] = await Promise.all([
    listarFila(svc, tenantId, pagina, porPagina),
    podeEditar && (um(sp.pedir) === '1' || mq) ? opcoesMateriais(svc, tenantId, mq, null) : Promise.resolve([]),
  ])
  return (
    <>
      <FilaLista itens={fila.rows} podeEditar={podeEditar} />
      <Paginacao total={fila.total} pagina={pagina} porPagina={porPagina} base={BASE} params={{ aba: 'fila' }} />
      {podeEditar && (
        <details className="mt-4 rounded-2xl border bg-card p-4 shadow-sm" open={um(sp.pedir) === '1' || !!mq}>
          <summary className="cursor-pointer select-none text-sm font-semibold text-primary">Pedir a atualização de um material</summary>
          <div className="mt-3 space-y-3">
            <BuscaGet placeholder="Buscar o material pelo título" q={mq} ocultos={{ aba: 'fila', pedir: '1' }} />
            {mq ? <FormPedido key={opcoes.map((o) => o.id).join(',')} opcoes={opcoes} docInicial={null} /> : <p className="text-xs text-muted-foreground">Busque o material pelo título para escolher e descrever o pedido.</p>}
          </div>
        </details>
      )}
    </>
  )
}

async function AbaNova({ svc, tenantId, sp, podeEditar }: { svc: Svc; tenantId: string; sp: SP; podeEditar: boolean }) {
  if (!podeEditar) return <SemPermissao>Você não tem permissão para registrar atualizações.</SemPermissao>
  const docRaw = um(sp.doc)
  const doc = docRaw && UUID.test(docRaw) ? docRaw : null
  const src = um(sp.src) ?? ''
  const [t, id] = src.split(':')
  const origem = (t === 'reporte' || t === 'pedido') && id && UUID.test(id) ? { tipo: t as 'reporte' | 'pedido', id } : null
  const mq = (um(sp.mq) ?? '').trim().slice(0, 80)
  const opcoes = await opcoesMateriais(svc, tenantId, mq, doc)
  return (
    <div className="space-y-3">
      <BuscaGet placeholder="Buscar o material pelo título (aula, lei, edição…)" q={mq} ocultos={{ aba: 'nova', doc: doc ?? undefined, src: src || undefined }} />
      <FormRegistrar key={`${doc}-${opcoes.map((o) => o.id).join(',')}`} opcoes={opcoes} docInicial={doc} origem={origem} />
    </div>
  )
}

async function AbaHistorico({ svc, tenantId, sp }: { svc: Svc; tenantId: string; sp: SP }) {
  const q = (um(sp.q) ?? '').trim().slice(0, 80)
  const tp = um(sp.tipo)
  const tipo = TIPOS_ATUALIZACAO.find((t) => t.id === tp)?.id ?? null
  const { pagina, porPagina } = lerPaginacao(sp)
  const h = await listarHistorico(svc, tenantId, { q, tipo, pagina, porPagina })
  const pars = { aba: 'hist', q: q || undefined, tipo: tipo ?? undefined }
  return (
    <>
      <BuscaGet placeholder="Buscar no texto da atualização" q={q} ocultos={{ aba: 'hist', tipo: tipo ?? undefined, pp: porPagina !== 25 ? String(porPagina) : undefined }} />
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">Tipo</span>
        {[{ id: null, nome: 'Todos' }, ...TIPOS_ATUALIZACAO].map((t) => (
          <Link key={t.id ?? 'todos'} href={`${BASE}?${new URLSearchParams({ aba: 'hist', ...(q ? { q } : {}), ...(t.id ? { tipo: t.id } : {}) })}`}
            className={cn('rounded-lg border px-2.5 py-1 font-medium', tipo === t.id ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted')}>{t.nome}</Link>
        ))}
      </div>
      <RevisaoCard className="p-2">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">Material</th><th className="px-3 py-2.5 font-medium">Tipo</th>
                <th className="px-3 py-2.5 font-medium">O que mudou</th><th className="px-3 py-2.5 font-medium">Quando</th><th className="px-3 py-2.5 font-medium">Alunos</th>
              </tr>
            </thead>
            <tbody>
              {h.rows.length === 0 && <tr><td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">{h.semTabela ? AVISO_MIGRACAO_ATUALIZACOES : 'Nenhuma atualização registrada ainda.'}</td></tr>}
              {h.rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-3 py-2.5"><b className="font-medium">{r.material}</b></td>
                  <td className="px-3 py-2.5"><span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', PILL[r.tipo])}>{NOME_TIPO_ATUALIZACAO[r.tipo]}</span></td>
                  <td className="min-w-[220px] px-3 py-2.5">{r.texto}</td>
                  <td className="px-3 py-2.5 tabular-nums">{formatBrt(r.quando)}</td>
                  <td className="px-3 py-2.5"><span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', r.avisou ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>{r.avisou ? 'Avisados' : 'Sem aviso'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </RevisaoCard>
      <Paginacao total={h.total} pagina={pagina} porPagina={porPagina} base={BASE} params={pars} />
    </>
  )
}
