import { createAdminClient } from '@/lib/supabase/server'
import { SemPermissao } from '@/components/ui/alert-box'
import { RevisaoAbas, RevisaoCard } from '@/components/admin/revisao/ui'
import { formatBrt } from '@/lib/brt'
import { carregarEstadoAtual } from '@/app/admin/cronogramas/importar/actions'
import { ImportarClient } from '@/app/admin/cronogramas/importar/importar-client'
import type { EstadoAtual } from '@/app/admin/cronogramas/importar/actions-tipos'
import { dirDe, inteiro, lerQs, porPaginaDe, type QSn, type SP } from '@/lib/revisao/gerador/comum-ger3'
import { listarHistoricoImportacao, paginarCatalogoImportacao } from '@/lib/revisao/gerador/importacao'
import { BarraBusca, KpiCard, KpiGrid, Nota, Pilula, ThFixo, ThOrd } from '../../../_comp/lista'
import { TabelaCron } from '../../tabela-cron'

// Sub-aba "Importação" (Gerador): reaproveita o fluxo de /admin/cronogramas/importar (planilha .xlsx/CSV, validação no
// navegador, prévia e gravação por cronograma) e acrescenta histórico (auditoria) e catálogo atual paginados no servidor.

type Vista = 'importar' | 'historico' | 'catalogo'
const VISTAS: Vista[] = ['importar', 'historico', 'catalogo']

export default async function ImportacaoGerador({ sp, tenantId, basePath }: { sp: SP; tenantId: string; basePath: string }) {
  const { base, qs } = lerQs(sp, basePath)
  const vis: Vista = VISTAS.includes(qs.vis as Vista) ? (qs.vis as Vista) : 'importar'
  const por = porPaginaDe(qs.pps)
  const pagina = inteiro(qs.pag, 1)
  const dir = dirDe(qs.dir)

  // O estado do catálogo alimenta a prévia do importador e a vista "Catálogo atual" (uma leitura só).
  const r = await carregarEstadoAtual()
  if (!r.ok || !r.estado) return <SemPermissao>{r.error ?? 'Não foi possível carregar o catálogo atual.'}</SemPermissao>
  const estado = r.estado

  return (
    <div className="w-full">
      <KpiGrid>
        <KpiCard rotulo="Cronogramas no catálogo" valor={estado.cronogramas.length.toLocaleString('pt-BR')} />
        <KpiCard rotulo="Metas gravadas" valor={estado.cronogramas.reduce((s, c) => s + c.metas, 0).toLocaleString('pt-BR')} />
        <KpiCard rotulo="Aulas com link" valor={estado.linksChaves.length.toLocaleString('pt-BR')} />
        <KpiCard rotulo="Plataformas de vídeo" valor={estado.plataformas.length.toLocaleString('pt-BR')} />
      </KpiGrid>
      <RevisaoAbas base={base} param="vis" atual={vis} extra={{ aba: qs.aba, sub: qs.sub }} abas={[
        { id: 'importar', titulo: 'Importar planilha' },
        { id: 'historico', titulo: 'Histórico de importações' },
        { id: 'catalogo', titulo: 'Catálogo atual', contagem: estado.cronogramas.length },
      ]} />

      {vis === 'importar' && (
        <div className="space-y-4">
          <Nota tipo="info">Substitui as metas dos cronogramas mencionados nos arquivos. Cronogramas que não aparecem ficam intocados, e reimportar o mesmo arquivo dá o mesmo resultado. A leitura e a validação rodam no navegador; só o que vai gravar trafega.</Nota>
          <ImportarClient estado={estado} />
        </div>
      )}

      {vis === 'historico' && <Historico tenantId={tenantId} base={base} qs={qs} por={por} pagina={pagina} dir={dir} />}

      {vis === 'catalogo' && <Catalogo estado={estado} base={base} qs={qs} por={por} pagina={pagina} dir={dir} />}
    </div>
  )
}

async function Historico({ tenantId, base, qs, por, pagina, dir }: { tenantId: string; base: string; qs: QSn; por: number; pagina: number; dir: 'asc' | 'desc' }) {
  let h
  try {
    h = await listarHistoricoImportacao(createAdminClient(), tenantId, { q: qs.q, op: qs.op, tipo: qs.tipo, ordem: qs.ord, dir, pagina, porPagina: por })
  } catch (e) {
    return <Nota tipo="aviso">Não foi possível ler o histórico: {(e as Error)?.message ?? 'erro desconhecido'}.</Nota>
  }
  const filtrado = !!(qs.q || qs.op || qs.tipo)
  return (
    <RevisaoCard>
      <p className="mb-3 text-sm text-muted-foreground">Cada importação grava um evento na auditoria (um por cronograma e um para os links de aula). Somente leitura.</p>
      <BarraBusca base={base} qs={qs} preservar={['aba', 'sub', 'vis']} placeholder="Buscar por nome do cronograma" filtros={[
        { nome: 'tipo', rotulo: 'Metas e links', opcoes: [{ v: 'metas', l: 'Metas de cronograma' }, { v: 'links', l: 'Links de aula' }] },
        { nome: 'op', rotulo: 'Criado e atualizado', opcoes: [{ v: 'INSERT', l: 'Cronograma criado' }, { v: 'UPDATE', l: 'Atualizado' }] },
      ]} />
      <TabelaCron tipo="leitura" podeEditar={false} colunas={5} total={h.total} page={h.pagina} pp={h.porPagina}
        vazio={filtrado ? 'Nada encontrado com esses filtros.' : 'Nenhuma importação registrada ainda.'}
        head={<><ThOrd rotulo="Quando" col="quando" base={base} qs={qs} /><ThOrd rotulo="Tipo" col="tipo" base={base} qs={qs} /><ThOrd rotulo="Operação" col="op" base={base} qs={qs} /><ThFixo>Resultado</ThFixo><ThFixo>Quem importou</ThFixo></>}
        rows={h.itens.map((x) => ({ id: x.id, cells: [
          <span key="q" className="whitespace-nowrap tabular-nums text-muted-foreground">{formatBrt(x.criadoEm) ?? '—'}</span>,
          <span key="t" className="font-medium">{x.entidade === 'simulado_cronograma_metas' ? 'Metas' : 'Links de aula'}</span>,
          <Pilula key="o" tipo={x.operacao === 'INSERT' ? 'ok' : 'vio'}>{x.operacao === 'INSERT' ? 'Criado' : 'Atualizado'}</Pilula>,
          <span key="r" className="block min-w-[18rem]">{x.resumo}</span>,
          <span key="a" className="text-muted-foreground">{x.ator}</span>,
        ] }))} />
    </RevisaoCard>
  )
}

function Catalogo({ estado, base, qs, por, pagina, dir }: { estado: EstadoAtual; base: string; qs: QSn; por: number; pagina: number; dir: 'asc' | 'desc' }) {
  const pg = paginarCatalogoImportacao(estado.cronogramas, { q: qs.q, status: qs.status, ordem: qs.ord, dir, pagina, porPagina: por })
  const status = [...new Set(estado.cronogramas.map((c) => c.status))].sort()
  return (
    <RevisaoCard>
      <p className="mb-3 text-sm text-muted-foreground">O que já existe no catálogo antes de importar. O editor de metas de cada cronograma continua em Cronogramas.</p>
      <BarraBusca base={base} qs={qs} preservar={['aba', 'sub', 'vis']} placeholder="Buscar por nome ou slug" filtros={[{ nome: 'status', rotulo: 'Todas as situações', opcoes: status.map((s) => ({ v: s, l: s })) }]} />
      <TabelaCron tipo="leitura" podeEditar={false} colunas={4} total={pg.total} page={pg.pagina} pp={por}
        vazio="Nenhum cronograma encontrado."
        head={<><ThOrd rotulo="Cronograma" col="nome" base={base} qs={qs} /><ThOrd rotulo="Slug" col="slug" base={base} qs={qs} /><ThOrd rotulo="Situação" col="status" base={base} qs={qs} /><ThOrd rotulo="Metas" col="metas" base={base} qs={qs} /></>}
        rows={pg.itens.map((c) => ({ id: c.slug, cells: [
          <span key="n" className="font-medium">{c.nome}</span>,
          <span key="s" className="font-mono text-xs text-muted-foreground">{c.slug}</span>,
          <Pilula key="st" tipo={c.status === 'ativo' || c.status === 'publicado' ? 'ok' : 'mut'}>{c.status}</Pilula>,
          <span key="m" className="tabular-nums">{c.metas.toLocaleString('pt-BR')}</span>,
        ] }))} />
    </RevisaoCard>
  )
}
