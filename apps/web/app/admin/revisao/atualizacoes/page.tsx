import type { Metadata } from 'next'
import Link from 'next/link'
import { Download, Plus } from 'lucide-react'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { SemPermissao } from '@/components/ui/alert-box'
import { buttonVariants } from '@/components/ui/button'
import { RevisaoHead, RevisaoAbas, RevisaoCard } from '@/components/admin/revisao/ui'
import { BuscaGet, KpiGrade, Nota, Paginacao, lerPaginacao } from '@/components/admin/revisao/pedagogico-ui'
import { TIPOS_ATUALIZACAO } from '@/lib/admin-revisao/biblioteca-tipos'
import { AVISO_MIGRACAO_ATUALIZACOES, AVISO_MIGRACAO_ESPEC, listarFila, listarHistorico, opcoesFiltrosHistorico, opcoesMateriais, resumoAtualizacoes } from '@/lib/admin-revisao/atualizacoes'
import { filtrosParaParams, lerFiltrosHistorico } from '@/lib/admin-revisao/atualizacoes-filtros'
import { cn } from '@/lib/utils'
import { FilaLista, FormPedido, FormRegistrar, RegistrarModal } from './atualizacoes-client'
import { LinhaHist } from './linha-hist'

export const metadata: Metadata = { title: 'Central de Atualizações' }
export const dynamic = 'force-dynamic'

const BASE = '/admin/revisao/atualizacoes'
type SP = Record<string, string | string[] | undefined>
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// CENTRAL DE ATUALIZAÇÕES (Plataforma Revisão · Pedagógico). Abas por ?aba= (fila | nova | hist). A página só LÊ.
export default async function AtualizacoesRevisaoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const access = await getCurrentAccess()
  if (!accessCan(access, 'configuracoes:view') || !access.tenantId) return <SemPermissao />
  const podeEditar = accessCan(access, 'configuracoes:update')
  const tenantId = access.tenantId
  const sp = await searchParams
  const a = um(sp.aba)
  const aba = a === 'hist' ? a : 'fila'
  // "Registrar atualização" é um pop-up (não uma aba): ?registrar=1; o antigo ?aba=nova continua abrindo o pop-up
  const registrar = podeEditar && (um(sp.registrar) === '1' || a === 'nova')
  const svc = createAdminClient()
  const { pagina, porPagina } = lerPaginacao(sp)
  const resumo = await resumoAtualizacoes(svc, tenantId)

  return (
    <div className="w-full">
      <RevisaoHead
        secao="Pedagógico"
        titulo="Central de Atualizações"
        subtitulo="Tudo o que muda nos materiais por lei nova, julgado novo ou correção. Cada atualização registrada vira o selo “Atualizado em” e as “Novidades da versão” que o aluno vê no PDF."
        acoes={podeEditar ? <Link href={`${BASE}?aba=${aba}&registrar=1`} className={buttonVariants()}><Plus />Registrar atualização</Link> : undefined}
      />
      <KpiGrade colunas={3} itens={[
        { valor: resumo.fila, rotulo: 'materiais para atualizar', alerta: true },
        { valor: resumo.noMes, rotulo: `atualizações em ${resumo.mes}` },
        { valor: resumo.avisadas, rotulo: 'atualizações avisadas aos alunos' },
      ]} />
      {resumo.semTabela && <Nota destaque>{AVISO_MIGRACAO_ATUALIZACOES}</Nota>}
      <RevisaoAbas
        abas={[{ id: 'fila', titulo: 'Para atualizar', contagem: resumo.fila }, { id: 'hist', titulo: 'Histórico' }]}
        atual={aba} base={BASE}
      />
      {aba === 'fila' && <AbaFila svc={svc} tenantId={tenantId} pagina={pagina} porPagina={porPagina} podeEditar={podeEditar} sp={sp} />}
      {registrar && <RegistrarModal aberto hrefFechar={`${BASE}?aba=${aba}`}><AbaNova svc={svc} tenantId={tenantId} sp={sp} aba={aba} /></RegistrarModal>}
      {aba === 'hist' && <AbaHistorico svc={svc} tenantId={tenantId} sp={sp} podeEditar={podeEditar} />}
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

async function AbaNova({ svc, tenantId, sp, aba }: { svc: Svc; tenantId: string; sp: SP; aba: string }) {
  const docRaw = um(sp.doc)
  const doc = docRaw && UUID.test(docRaw) ? docRaw : null
  const src = um(sp.src) ?? ''
  const [t, id] = src.split(':')
  const origem = (t === 'reporte' || t === 'pedido') && id && UUID.test(id) ? { tipo: t as 'reporte' | 'pedido', id } : null
  const mq = (um(sp.mq) ?? '').trim().slice(0, 80)
  const opcoes = await opcoesMateriais(svc, tenantId, mq, doc)
  return (
    <div className="space-y-3">
      <BuscaGet nome="mq" placeholder="Buscar o material pelo título (aula, lei, edição…)" q={mq} ocultos={{ aba, registrar: '1', doc: doc ?? undefined, src: src || undefined }} />
      <FormRegistrar key={`${doc}-${opcoes.map((o) => o.id).join(',')}`} opcoes={opcoes} docInicial={doc} origem={origem} />
    </div>
  )
}

const CAMPO_FILTRO = 'h-9 w-full rounded-lg border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

async function AbaHistorico({ svc, tenantId, sp, podeEditar }: { svc: Svc; tenantId: string; sp: SP; podeEditar: boolean }) {
  const f = lerFiltrosHistorico(sp)
  const { pagina, porPagina } = lerPaginacao(sp)
  const [h, opts] = await Promise.all([
    listarHistorico(svc, tenantId, { ...f, pagina, porPagina }),
    opcoesFiltrosHistorico(svc, tenantId),
  ])
  const pp = porPagina !== 25 ? String(porPagina) : undefined
  const pars = filtrosParaParams(f, { aba: 'hist' })
  const qs = (extra: Record<string, string | undefined>) => {
    const u = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...pars, pp, ...extra })) if (v) u.set(k, v)
    return `${BASE}?${u}`
  }
  const proxDir = (col: 'quando' | 'tipo') => (f.sort === col && f.dir === 'desc' ? 'asc' : 'desc')
  const seta = (col: 'quando' | 'tipo') => (f.sort === col ? (f.dir === 'desc' ? ' ↓' : ' ↑') : '')
  const algumFiltro = !!(f.q || f.tipo || f.disciplina || f.de || f.ate || f.registrador)
  const exportar = new URLSearchParams(Object.entries(filtrosParaParams(f)).filter(([, v]) => !!v) as [string, string][])
  return (
    <>
      {h.semEspec && !h.semTabela && <Nota destaque>{AVISO_MIGRACAO_ESPEC}{h.registradorIgnorado && ' O filtro “quem registrou” foi ignorado até lá.'}</Nota>}
      <BuscaGet placeholder="Buscar no texto, na fonte ou no trecho afetado" q={f.q} ocultos={{ ...filtrosParaParams({ ...f, q: '' }), aba: 'hist', pp }} />
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">Tipo</span>
        {[{ id: null, nome: 'Todos' }, ...TIPOS_ATUALIZACAO].map((t) => (
          <Link key={t.id ?? 'todos'} href={qs({ tipo: t.id ?? undefined, p: undefined })}
            className={cn('rounded-lg border px-2.5 py-1 font-medium', f.tipo === t.id ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted')}>{t.nome}</Link>
        ))}
      </div>
      <form method="get" className="mb-3 grid gap-2 rounded-2xl border bg-card p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-6">
        <input type="hidden" name="aba" value="hist" />
        {f.q && <input type="hidden" name="q" value={f.q} />}
        {f.tipo && <input type="hidden" name="tipo" value={f.tipo} />}
        {pp && <input type="hidden" name="pp" value={pp} />}
        {f.sort !== 'quando' && <input type="hidden" name="sort" value={f.sort} />}
        {f.dir !== 'desc' && <input type="hidden" name="dir" value={f.dir} />}
        <label className="space-y-1 text-xs text-muted-foreground lg:col-span-2">Disciplina
          <select name="disc" defaultValue={f.disciplina ?? ''} className={CAMPO_FILTRO}>
            <option value="">Todas</option>
            {opts.disciplinas.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">Quem registrou
          <select name="reg" defaultValue={f.registrador ?? ''} className={CAMPO_FILTRO}>
            <option value="">Todos</option>
            {opts.registradores.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">De
          <input type="date" name="de" defaultValue={f.de ?? ''} className={CAMPO_FILTRO} />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">Até
          <input type="date" name="ate" defaultValue={f.ate ?? ''} className={CAMPO_FILTRO} />
        </label>
        <div className="flex items-end gap-1.5">
          <button type="submit" className={buttonVariants({ size: 'sm' })}>Filtrar</button>
          {algumFiltro && <Link href={`${BASE}?aba=hist`} className={buttonVariants({ size: 'sm', variant: 'outline' })}>Limpar</Link>}
          <a href={`/api/admin/revisao/atualizacoes/exportar${exportar.size ? `?${exportar}` : ''}`} className={buttonVariants({ size: 'sm', variant: 'outline' })}><Download />CSV</a>
        </div>
      </form>
      <RevisaoCard className="p-2">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">Material</th>
                <th className="px-3 py-2.5 font-medium"><Link href={qs({ sort: 'tipo', dir: proxDir('tipo'), p: undefined })} className="hover:text-foreground">Tipo{seta('tipo')}</Link></th>
                <th className="px-3 py-2.5 font-medium">O que mudou</th>
                <th className="px-3 py-2.5 font-medium"><Link href={qs({ sort: 'quando', dir: proxDir('quando'), p: undefined })} className="hover:text-foreground">Quando{seta('quando')}</Link></th>
                <th className="px-3 py-2.5 font-medium">Registrado por</th><th className="px-3 py-2.5 font-medium">Alunos</th>
              </tr>
            </thead>
            <tbody>
              {h.rows.length === 0 && <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">{h.semTabela ? AVISO_MIGRACAO_ATUALIZACOES : algumFiltro ? 'Nenhuma atualização com esses filtros.' : 'Nenhuma atualização registrada ainda.'}</td></tr>}
              {h.rows.map((r) => <LinhaHist key={r.id} r={r} podeEditar={podeEditar} />)}
            </tbody>
          </table>
        </div>
      </RevisaoCard>
      <Paginacao total={h.total} pagina={pagina} porPagina={porPagina} base={BASE} params={pars} />
    </>
  )
}
