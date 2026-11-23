import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { AdaptativoTabs } from '@/components/admin/adaptativo-tabs'
import { BarraBusca, KpiCard, KpiGrid, Nota, ParamsInt, Pilula, ThFixo, ThOrd, type QS } from '@/app/admin/revisao/_comp/lista'
import { TabelaCron, type LinhaCron } from '@/app/admin/revisao/cronograma/tabela-cron'
import { carregarIntegridade } from '@/lib/cronograma/adaptativo/integridade-admin'
import { ROTULO_ANOMALIA, TIPOS_ANOMALIA, norm, type TipoAnomalia } from '@/lib/cronograma/adaptativo/auditar-plano'
import { dataBr } from '@/lib/admin/revisao/datas'
import { formatBrt } from '@/lib/brt'
import { DetalheIntegridade } from './integridade-client'

export const dynamic = 'force-dynamic'

// Admin: Cronograma Adaptativo — INTEGRIDADE (somente leitura). Backend-first: o auditor roda no servidor (cache 60 s, leitura em lotes);
// esta página só lista, filtra, ordena e pagina o que ele devolveu. Nenhuma correção automática aqui.
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
  const pagina = ParamsInt(qs.pag, 1, 1, 100000)
  const porPagina = ParamsInt(qs.pps, 14, 5, 100)
  const tipo = (TIPOS_ANOMALIA as readonly string[]).includes(qs.tipo ?? '') ? (qs.tipo as TipoAnomalia) : null
  const ordem = ['total', 'nome', 'email'].includes(qs.ord ?? '') ? (qs.ord as 'total' | 'nome' | 'email') : 'total'
  const dir = qs.dir === 'asc' || (qs.dir !== 'desc' && ordem !== 'total') ? 1 : -1

  const r = await carregarIntegridade(createAdminClient(), acesso.tenantId)

  const busca = norm(qs.q)
  let lista = r.planos.filter((p) => (!tipo || (p.porTipo[tipo] ?? 0) > 0) && (!busca || norm(p.email).includes(busca) || norm(p.nome).includes(busca)))
  lista = [...lista].sort((a, b) => {
    const c = ordem === 'total' ? a.total - b.total : ordem === 'nome' ? a.nome.localeCompare(b.nome, 'pt-BR') : a.email.localeCompare(b.email, 'pt-BR')
    return (c || a.email.localeCompare(b.email, 'pt-BR')) * dir
  })
  const total = lista.length
  const pagina_ = lista.slice((pagina - 1) * porPagina, pagina * porPagina)

  const sel = qs.plano ? r.planos.find((p) => p.planoId === qs.plano) : null
  const hrefPlano = (id: string) => { const q = new URLSearchParams(Object.entries(qs).filter(([, v]) => v) as [string, string][]); q.set('plano', id); return `${BASE}?${q}` }

  const rows: LinhaCron[] = pagina_.map((p) => ({
    id: p.planoId,
    cells: [
      <Link key="a" href={`/admin/estudantes/${p.estudanteId}`} className="font-medium text-primary underline-offset-2 hover:underline">{p.nome || 'Aluno'}</Link>,
      <span key="e" className="text-muted-foreground">{p.email || '—'}</span>,
      <span key="t">{p.titulo || '—'}</span>,
      <span key="n" className="tabular-nums font-semibold">{nf(p.total)}</span>,
      <span key="p" className="flex flex-wrap gap-1">{(Object.entries(p.porTipo) as Array<[TipoAnomalia, number]>).map(([t, n]) => <Pilula key={t} tipo={PILULA_TIPO[t]}>{ROTULO_ANOMALIA[t]} · {n}</Pilula>)}</span>,
      <Link key="d" href={hrefPlano(p.planoId)} className="font-medium text-primary underline-offset-2 hover:underline">Ver detalhe</Link>,
    ],
  }))
  const head = (
    <>
      <ThOrd rotulo="Aluno" col="nome" base={BASE} qs={qs} />
      <ThOrd rotulo="E-mail" col="email" base={BASE} qs={qs} />
      <ThFixo>Plano</ThFixo>
      <ThOrd rotulo="Anomalias" col="total" base={BASE} qs={qs} align="right" />
      <ThFixo>Tipos</ThFixo>
      <ThFixo>Detalhe</ThFixo>
    </>
  )

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cronograma adaptativo · Integridade</h1>
        <p className="text-muted-foreground">Auditoria somente leitura dos planos ativos: progresso em aula diferente da gravada, revisões antes do estudo, metas fora do catálogo e outras inconsistências. Nada é corrigido aqui.</p>
      </div>
      <AdaptativoTabs />

      {r.catalogoVazio && <Nota tipo="aviso">O catálogo de aulas não foi carregado agora (vazio ou falha de leitura). Sem ele não há referência confiável para auditar — nada foi estimado.</Nota>}
      {!r.catalogoVazio && !r.temAulaKey && <Nota tipo="aviso">A migração <b>20261129000000_adaptativo_meta_aula_key.sql</b> ainda não foi aplicada: sem a coluna <b>aula_key</b> o auditor não detecta “Progresso em aula diferente”. As demais verificações já funcionam.</Nota>}

      <KpiGrid>
        <KpiCard rotulo="Planos auditados" valor={nf(r.planosAuditados)} />
        <KpiCard rotulo="Planos com anomalia" valor={nf(r.planosComAnomalia)} alerta={r.planosComAnomalia > 0} />
        {TIPOS_ANOMALIA.map((t) => <KpiCard key={t} rotulo={ROTULO_ANOMALIA[t]} valor={nf(r.porTipo[t])} alerta={r.porTipo[t] > 0 && PILULA_TIPO[t] === 'bad'} />)}
      </KpiGrid>
      <p className="-mt-2 text-xs text-muted-foreground">Contagem de planos por tipo (um plano pode aparecer em mais de um). Calculado em {fmtData(r.geradoEm)} (cache de 60 s).</p>

      <BarraBusca base={BASE} qs={qs} placeholder="Buscar por e-mail ou nome do aluno"
        filtros={[{ nome: 'tipo', rotulo: 'Todos os tipos de anomalia', opcoes: TIPOS_ANOMALIA.map((t) => ({ v: t, l: ROTULO_ANOMALIA[t] })) }]} />
      <TabelaCron tipo="leitura" podeEditar={false} colunas={6} total={total} page={pagina} pp={porPagina}
        vazio={r.planosComAnomalia === 0 && !r.catalogoVazio ? 'Nenhum plano com anomalia — tudo íntegro.' : 'Nada encontrado com esses filtros.'} head={head} rows={rows} />

      {sel && (
        <DetalheIntegridade d={{
          planoId: sel.planoId, estudanteId: sel.estudanteId, nome: sel.nome, email: sel.email, titulo: sel.titulo, total: sel.total,
          anomalias: sel.anomalias.map((a) => ({ ...a, data: fmtData(a.data) })), rotulos: ROTULO_ANOMALIA,
        }} />
      )}
    </div>
  )
}
