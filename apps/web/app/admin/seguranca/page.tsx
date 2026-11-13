import Link from 'next/link'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { EstudioHeader } from '@/components/admin/estudio/estudio-header'
import { SemPermissao } from '@/components/ui/alert-box'
import { CartoesResumo } from '@/components/admin/acessos/blocos'
import { AcessosFiltros } from '@/components/admin/acessos/acessos-filtros'
import {
  SegurancaTabs, BotaoExecutar, AchadosTable, VarreduraTable, AtualizacoesTable, AcoesRelatorio, DiffVarredura,
} from '@/components/admin/seguranca/seguranca-ui'
import {
  resumoGeral, listarAchados, listarVarreduras, detalheVarredura, listarAtualizacoes, contagemAtualizacoes,
} from '@/lib/seguranca/leitura'
import { CATEGORIAS, SEVERIDADES, ROTULO_CATEGORIA, ROTULO_SEVERIDADE } from '@/lib/seguranca/tipos'
import { formatBrt } from '@/lib/brt'

export const dynamic = 'force-dynamic'

type SP = { aba?: string; page?: string; pp?: string; sort?: string; dir?: string; q?: string; categoria?: string; severidade?: string; status?: string; v?: string; tipo?: string; cve?: string }

/** Admin › Segurança: visão geral, achados, relatórios e atualizações. A page só LÊ (cálculo no servidor). */
export default async function SegurancaPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const access = await getCurrentAccess()
  if (!access.userId || !accessCan(access, 'seguranca:view')) return <SemPermissao>Sem permissão para ver a área de Segurança.</SemPermissao>
  const podeGerenciar = accessCan(access, 'seguranca:manage')

  const aba = ['geral', 'achados', 'relatorios', 'atualizacoes'].includes(sp.aba ?? '') ? (sp.aba as string) : 'geral'
  const page = Math.max(1, Number(sp.page ?? 1) || 1)
  const pp = [10, 25, 50].includes(Number(sp.pp)) ? Number(sp.pp) : aba === 'relatorios' ? 10 : 25
  const dir = sp.dir === 'asc' ? 'asc' : 'desc'
  const q = (sp.q ?? '').trim().slice(0, 80)

  return (
    <div className="space-y-6">
      <EstudioHeader eyebrow="Segurança" titulo="Varredura de segurança" semAbas acoes={<BotaoExecutar podeExecutar={podeGerenciar} />} />
      <SegurancaTabs ativa={aba} />
      {aba === 'geral' && <Geral />}
      {aba === 'achados' && <Achados sp={sp} page={page} pp={pp} dir={dir} q={q} podeGerenciar={podeGerenciar} />}
      {aba === 'relatorios' && <Relatorios v={sp.v} page={page} pp={pp} />}
      {aba === 'atualizacoes' && <Atualizacoes sp={sp} page={page} pp={pp} dir={dir} q={q} />}
    </div>
  )
}

async function Geral() {
  const r = await resumoGeral()
  const max = Math.max(1, ...r.varreduras.map((v) => v.total_achados as number))
  const serie = [...r.varreduras].reverse()
  return (
    <div className="space-y-6">
      <CartoesResumo itens={[
        { label: 'Críticos abertos', valor: r.criticos }, { label: 'Altos abertos', valor: r.altos },
        { label: 'Médios abertos', valor: r.medios }, { label: 'Baixos abertos', valor: r.baixos },
        { label: 'Alertas não lidos', valor: r.naoLidas }, { label: 'Atualizações pendentes', valor: r.atualizacoesPendentes },
      ]} />
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <h2 className="text-sm font-semibold">Tendência (últimas {serie.length} varreduras)</h2>
        {serie.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nenhuma varredura executada ainda. Use “Executar varredura agora”.</p>
        ) : (
          <div className="mt-4 flex h-40 items-end gap-2">
            {serie.map((v) => (
              <Link key={v.id} href={`/admin/seguranca?aba=relatorios&v=${v.id}`} title={`${formatBrt(v.iniciado_em) ?? ''} · ${v.total_achados} achados (${v.criticos} crít., ${v.altos} altos)`}
                className="flex h-full min-w-6 flex-1 flex-col justify-end gap-px">
                <div className="bg-muted" style={{ height: `${Math.max(2, ((v.medios + v.baixos) / max) * 100)}%` }} />
                <div className="bg-destructive/50" style={{ height: `${(v.altos / max) * 100}%` }} />
                <div className="bg-destructive" style={{ height: `${(v.criticos / max) * 100}%` }} />
              </Link>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Barras: crítico (escuro), alto, médio+baixo (cinza). Clique para abrir o relatório.</p>
      </section>
    </div>
  )
}

async function Achados({ sp, page, pp, dir, q, podeGerenciar }: { sp: SP; page: number; pp: number; dir: 'asc' | 'desc'; q: string; podeGerenciar: boolean }) {
  const { rows, total } = await listarAchados({ page, pp, dir, q, sort: sp.sort ?? 'severidade_peso', categoria: sp.categoria, severidade: sp.severidade, status: sp.status })
  return (
    <AchadosTable rows={rows} total={total} podeGerenciar={podeGerenciar} filtros={
      <AcessosFiltros selects={[
        { param: 'categoria', label: 'Categoria', opcoes: [{ value: '', label: 'Todas' }, ...CATEGORIAS.map((c) => ({ value: c, label: ROTULO_CATEGORIA[c] }))] },
        { param: 'severidade', label: 'Severidade', opcoes: [{ value: '', label: 'Todas' }, ...SEVERIDADES.map((s) => ({ value: s, label: ROTULO_SEVERIDADE[s] }))] },
        { param: 'status', label: 'Status', padrao: 'aberto', opcoes: [{ value: 'aberto', label: 'Abertos' }, { value: 'resolvido', label: 'Resolvidos' }, { value: 'ignorado', label: 'Ignorados' }, { value: 'aceito', label: 'Aceitos' }, { value: 'todos', label: 'Todos' }] },
      ]} />
    } />
  )
}

async function Relatorios({ v, page, pp }: { v?: string; page: number; pp: number }) {
  const det = v && /^[0-9a-f-]{36}$/i.test(v) ? await detalheVarredura(v) : null
  const { rows, total } = await listarVarreduras(page, pp)
  const linhas = rows.map((r) => ({
    id: r.id, origem: r.origem, iniciado: formatBrt(r.iniciado_em) ?? '—', total: r.total_achados, criticos: r.criticos, altos: r.altos,
    novos: r.novos, resolvidos: r.resolvidos, erros: r.erros,
  }))
  return (
    <div className="space-y-6">
      {det && (
        <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Varredura de {formatBrt(det.varredura.iniciado_em) ?? '—'} ({det.varredura.origem})</h2>
            <AcoesRelatorio id={det.varredura.id} />
          </div>
          <DiffVarredura det={det} />
        </section>
      )}
      <VarreduraTable rows={linhas} total={total} />
    </div>
  )
}

async function Atualizacoes({ sp, page, pp, dir, q }: { sp: SP; page: number; pp: number; dir: 'asc' | 'desc'; q: string }) {
  const [c, { rows, total }] = await Promise.all([
    contagemAtualizacoes(),
    listarAtualizacoes({ page, pp, dir, q, sort: sp.sort ?? 'detectado_em', tipo: sp.tipo, cve: sp.cve === '1' }),
  ])
  return (
    <div className="space-y-6">
      <CartoesResumo itens={[
        { label: 'Com vulnerabilidade (CVE)', valor: c.comCve }, { label: 'Patch', valor: c.patch, dica: 'Correções sem quebra: atualizar primeiro' },
        { label: 'Minor', valor: c.minor }, { label: 'Major', valor: c.major, dica: 'Podem quebrar: planejar à parte' },
      ]} />
      <section className="rounded-2xl border bg-card p-4 text-sm shadow-sm">
        <h2 className="font-semibold">Ordem recomendada</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>Pacotes com CVE crítico/alto (qualquer salto) — filtre por “Com CVE”.</li>
          <li>Patch: baixo risco, atualizar em lote e rodar o tsc/testes.</li>
          <li>Minor: um PR por grupo de pacotes relacionados, com revisão do changelog.</li>
          <li>Major: um PR por pacote, com plano de migração e teste manual.</li>
        </ol>
        <p className="mt-2 text-xs text-muted-foreground">Fonte: OSV.dev (diário) e `pnpm audit/outdated` (script seguranca:deps no CI/dev).</p>
      </section>
      <AtualizacoesTable rows={rows} total={total} filtros={
        <AcessosFiltros
          selects={[{ param: 'tipo', label: 'Salto', opcoes: [{ value: '', label: 'Todos' }, { value: 'patch', label: 'Patch' }, { value: 'minor', label: 'Minor' }, { value: 'major', label: 'Major' }] }]}
          toggles={[{ param: 'cve', label: 'Com CVE' }]}
        />
      } />
    </div>
  )
}
