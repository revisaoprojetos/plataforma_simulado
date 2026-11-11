'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, ArrowUpDown, BarChart3, Eye, FolderInput, GraduationCap, ListChecks, Loader2, Merge, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { confirmar } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { ESTADO_Q_PADRAO, VISOES_Q, type EstadoQ } from '@/lib/admin-revisao/biblioteca-questoes-tipos'
import { TIPOS_TAX_G, type ItemTaxG, type RespostaTaxG, type ResumoClassif, type TipoTaxG } from '@/lib/admin-revisao/biblioteca-questoes-gestao-tipos'
import { PaginacaoBib } from './paginacao-bib'
import { QuestoesBanco } from './questoes-banco'
import { Carregando, ErroTentar, ItemTrilho, PainelCard, Trilho, Vazio, campoBusca, selectBarra, thCls } from './gestao-ui'
import { aoMutar, cacheG, lerG, postG, prefetchG, semearG } from './questoes-api'
import { PARAMS_TAX_PADRAO, type InicialClassificacao } from '@/lib/admin-revisao/questoes-classificacao-tipos'

const PP = [10, 14, 25, 50, 100]
const CLASSES = [{ id: '', nome: 'Sem classificação' }, { id: 'essencial', nome: 'Essencial' }, { id: 'complementar', nome: 'Complementar' }, { id: 'especifica', nome: 'Específica' }]
const ROT_DIST: Record<string, Record<string, string>> = {
  dificuldade: { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil', '': 'Sem dificuldade' },
  tipo: { objetiva: 'Objetiva', discursiva: 'Discursiva', '': 'Sem tipo' },
  status: { publicada: 'Publicada', rascunho: 'Rascunho', arquivada: 'Arquivada', '': 'Sem status' },
}
type RespDist = { total: number; dificuldade: { k: string; n: number }[]; tipo: { k: string; n: number }[]; status: { k: string; n: number }[] }
let semeadoEm = 0
/** Semeia o cache cliente com o que o servidor já entregou no HTML (uma vez por carga): a tela e as trocas de lista não fazem chamada. */
function semear(i: InicialClassificacao) {
  if (semeadoEm === i.geradoEm) return
  semeadoEm = i.geradoEm
  semearG({ s: 'resumo' }, i.resumo)
  if (i.distribuicao) semearG({ s: 'distribuicao' }, i.distribuicao)
  for (const [t, r] of Object.entries(i.taxonomia)) if (r) semearG(PARAMS_TAX_PADRAO(t as TipoTaxG), r)
}
type Modo = { k: 'fila'; visao: string } | { k: 'tax'; tipo: TipoTaxG } | { k: 'dist' }

/** Sub-aba CLASSIFICAÇÃO: (1) indicadores de qualidade com contagens reais; (2) FILA de pendências (a tabela do Banco em modo "fila", com
 *  coluna de sugestão e classificação em massa); (3) gestão do cadastro da taxonomia (criar, renomear, mover assunto, excluir sem uso);
 *  (4) distribuição por dificuldade/tipo/status. As permissões finas são opcionais: o servidor sempre valida (questoes:update,
 *  classificacao:manage); `podeEditar` é o único gate obrigatório. Os atalhos para outras sub-abas só aparecem se o shell os fornecer. */
export function QuestoesClassificacao({ inicial, podeEditar, podeExcluir, podeCriar, podeImportarPlataforma, podeTaxonomia, visaoInicial, onAbrirBanco, onUnificarTermos, onUnificarSelecionadas, onIrDuplicadas }: {
  podeEditar: boolean; podeExcluir?: boolean; podeCriar?: boolean; podeImportarPlataforma?: boolean; podeTaxonomia?: boolean
  visaoInicial?: string
  /** Dados prontos do servidor (SSR): painel, pendências, distribuição e 1ª página de cada lista — renderiza sem chamada de API. */
  inicial?: InicialClassificacao
  onAbrirBanco?: (e: Partial<EstadoQ>) => void
  onUnificarTermos?: (tipo: TipoTaxG, q: string) => void
  onUnificarSelecionadas?: (ids: string[]) => void
  onIrDuplicadas?: (ids: string[]) => void
}) {
  const [modo, setModo] = useState<Modo>({ k: 'fila', visao: visaoInicial || 'sem_classificacao' })
  if (inicial) semear(inicial)
  const [resumo, setResumo] = useState<ResumoClassif | null>(() => inicial?.resumo ?? cacheG<ResumoClassif>({ s: 'resumo' }) ?? null)
  const [erro, setErro] = useState<string | null>(null)
  const carregarResumo = useCallback(async (fresh = false) => {
    const j = await lerG<ResumoClassif>({ s: 'resumo' }, { fresh })
    if (j.ok) { setResumo(j); setErro(null) } else setErro(j.error ?? 'Falha ao carregar.')
  }, [])
  useEffect(() => { if (!resumo) void carregarResumo() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => aoMutar(() => { void carregarResumo(true) }), [carregarResumo])

  const pct = resumo && resumo.total ? Math.round((resumo.completas / resumo.total) * 1000) / 10 : 0
  const contagemTipo = (t: TipoTaxG) => resumo ? ({ disciplina: resumo.cadastro.disciplinas, assunto: resumo.cadastro.assuntos, banca: resumo.cadastro.bancas, orgao: resumo.cadastro.orgaos, cargo: resumo.cadastro.cargos, assunto_detalhe: resumo.cadastro.assuntosDetalhe, ano: resumo.cadastro.anos } as const)[t] : undefined
  const visaoAtiva = modo.k === 'fila' ? modo.visao : ''

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[17rem_minmax(0,1fr)]">
      <Trilho titulo="Classificação" rotulo="Qualidade e cadastro da classificação"
        rodape={<>Cada barra mostra o % de questões com o campo preenchido. Clique para abrir a fila do que falta.</>}>
        {erro && !resumo && <ErroTentar msg={erro} onTentar={() => void carregarResumo(true)} />}
        {!resumo && !erro && <Carregando linhas={10} />}
        {resumo && (
          <>
            <div className="mx-1 mb-2 rounded-xl border p-2.5">
              <div className="flex items-baseline justify-between"><span className="text-xs font-semibold text-foreground">Questões 100% classificadas</span><span className="text-lg font-semibold tabular-nums">{pct.toLocaleString('pt-BR')}%</span></div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Questões com disciplina, assunto, banca e ano"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
              <p className="mt-1 text-[11px] text-muted-foreground">{resumo.completas.toLocaleString('pt-BR')} de {resumo.total.toLocaleString('pt-BR')} têm disciplina, assunto, banca e ano.</p>
            </div>
            <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Fila de pendências</p>
            <ul className="space-y-0.5">
              <li><ItemTrilho ativo={visaoAtiva === 'sem_classificacao'} onClick={() => setModo({ k: 'fila', visao: 'sem_classificacao' })} n={resumo.visoes.sem_classificacao} destaque={resumo.visoes.sem_classificacao > 0}><ListChecks className="h-4 w-4 shrink-0" />Falta algo (qualquer campo)</ItemTrilho></li>
              {resumo.campos.map((c) => (
                <li key={c.k}>
                  <ItemTrilho ativo={visaoAtiva === c.visao} onClick={() => (c.k === 'etiqueta' && onAbrirBanco ? onAbrirBanco({ vis: c.visao, page: 1 }) : setModo({ k: 'fila', visao: c.visao }))} n={c.sem} destaque={c.sem > 0 && c.k !== 'etiqueta' && c.k !== 'cargo' && c.k !== 'orgao' && c.k !== 'dificuldade'}>
                    <span className="truncate">Sem {c.rot.toLowerCase()}</span>
                  </ItemTrilho>
                  <div className="mx-2 mb-1.5 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary/70" style={{ width: `${c.pct}%` }} /></div><span className="w-11 text-right text-[10.5px] tabular-nums text-muted-foreground">{c.pct.toLocaleString('pt-BR')}%</span></div>
                </li>
              ))}
              <li><ItemTrilho ativo={visaoAtiva === 'assunto_divergente'} onClick={() => setModo({ k: 'fila', visao: 'assunto_divergente' })} n={resumo.divergentes} destaque={resumo.divergentes > 0}><AlertTriangle className="h-4 w-4 shrink-0" /><span className="truncate">Assunto de outra disciplina</span></ItemTrilho></li>
            </ul>
            <p className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cadastro da taxonomia</p>
            <ul className="space-y-0.5">
              {TIPOS_TAX_G.map((t) => (
                <li key={t.id}><ItemTrilho ativo={modo.k === 'tax' && modo.tipo === t.id} onClick={() => setModo({ k: 'tax', tipo: t.id })} onPointerEnter={() => prefetchG({ s: 'taxonomia', tipo: t.id, page: 1, pp: 14, sort: t.id === 'ano' ? 'nome' : 'questoes', dir: t.id === 'ano' ? 'asc' : 'desc' })} n={contagemTipo(t.id)}>
                  <GraduationCap className="h-4 w-4 shrink-0" />{t.nome}</ItemTrilho></li>
              ))}
              <li><ItemTrilho ativo={modo.k === 'dist'} onClick={() => setModo({ k: 'dist' })} onPointerEnter={() => prefetchG({ s: 'distribuicao' })}><BarChart3 className="h-4 w-4 shrink-0" />Dificuldade, tipo e status</ItemTrilho></li>
            </ul>
          </>
        )}
      </Trilho>

      <div className="min-w-0">
        {modo.k === 'fila' ? (
          <QuestoesBanco key={modo.visao} modo="fila" inicial={null} estadoInicial={{ ...ESTADO_Q_PADRAO, vis: modo.visao }} podeEditar={podeEditar} podeExcluir={podeExcluir ?? podeEditar} podeCriar={podeCriar ?? podeEditar}
            podeImportarPlataforma={podeImportarPlataforma ?? false} onUnificarSelecionadas={onUnificarSelecionadas} onIrDuplicadas={onIrDuplicadas} onMudou={() => void carregarResumo(true)} />
        ) : modo.k === 'dist' ? (
          <Distribuicao onAbrirBanco={onAbrirBanco} />
        ) : (
          <TaxonomiaGestor key={modo.tipo} tipo={modo.tipo} podeEditar={podeTaxonomia ?? podeEditar} onAbrirBanco={onAbrirBanco} onUnificarTermos={onUnificarTermos} onMudou={() => void carregarResumo(true)} />
        )}
        {modo.k === 'fila' && (resumo?.visoes[modo.visao] ?? 1) === 0 && <p className="mt-2 text-xs text-muted-foreground">Nada pendente em “{VISOES_Q.find((v) => v.id === modo.visao)?.nome}”.</p>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────── distribuição (dificuldade · tipo · status) ───────────────────────────────────────
function Distribuicao({ onAbrirBanco }: { onAbrirBanco?: (e: Partial<EstadoQ>) => void }) {
  const [d, setD] = useState<RespDist | null>(() => cacheG<RespDist>({ s: 'distribuicao' }) ?? null); const [erro, setErro] = useState<string | null>(null)
  const carregar = useCallback(async (fresh = false) => { setErro(null); const j = await lerG<RespDist>({ s: 'distribuicao' }, { fresh }); if (j.ok) setD(j); else setErro(j.error ?? 'Falha ao carregar.') }, [])
  useEffect(() => { if (!d) void carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => aoMutar(() => { void carregar(true) }), [carregar])
  const abrir = (campo: 'dificuldade' | 'tipo' | 'status', k: string) => {
    if (!onAbrirBanco) return
    if (!k) return onAbrirBanco(campo === 'dificuldade' ? { vis: 'sem_dificuldade', page: 1 } : { page: 1 })
    onAbrirBanco({ [campo === 'dificuldade' ? 'dif' : campo]: k, page: 1 } as Partial<EstadoQ>)
  }
  return (
    <PainelCard titulo="Dificuldade, tipo e status" acao={d ? <span className="text-xs text-muted-foreground">{d.total.toLocaleString('pt-BR')} questões</span> : undefined}>
      {erro && !d ? <ErroTentar msg={erro} onTentar={() => void carregar(true)} /> : !d ? <Carregando /> : d.total === 0 ? <Vazio>Nenhuma questão cadastrada.</Vazio> : (
        <div className="min-h-0 flex-1 space-y-5 overflow-auto px-2 pb-3 pt-2">
          {(['dificuldade', 'tipo', 'status'] as const).map((c) => (
            <div key={c}>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{c === 'dificuldade' ? 'Dificuldade' : c === 'tipo' ? 'Tipo' : 'Status'}</h3>
              <ul className="space-y-2">
                {d[c].map((x) => {
                  const p = d.total ? Math.round((x.n / d.total) * 1000) / 10 : 0
                  const txt = `${x.n.toLocaleString('pt-BR')} · ${p.toLocaleString('pt-BR')}%`
                  return (
                    <li key={x.k || 'vazio'} className="flex items-center gap-3 text-sm">
                      <span className="w-36 shrink-0 truncate">{ROT_DIST[c][x.k] ?? x.k}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', x.k ? 'bg-primary' : 'bg-primary/40')} style={{ width: `${p}%` }} /></div>
                      {onAbrirBanco ? <button type="button" onClick={() => abrir(c, x.k)} className="w-28 shrink-0 text-right tabular-nums text-primary hover:underline" title="Abrir estas questões no Banco">{txt}</button>
                        : <span className="w-28 shrink-0 text-right tabular-nums text-muted-foreground">{txt}</span>}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </PainelCard>
  )
}

// ─────────────────────────────────────── gestor da taxonomia ───────────────────────────────────────
function TaxonomiaGestor({ tipo, podeEditar, onAbrirBanco, onUnificarTermos, onMudou }: {
  tipo: TipoTaxG; podeEditar: boolean; onAbrirBanco?: (e: Partial<EstadoQ>) => void; onUnificarTermos?: (tipo: TipoTaxG, q: string) => void; onMudou: () => void
}) {
  const meta = TIPOS_TAX_G.find((t) => t.id === tipo)!
  const [busca, setBusca] = useState(''); const [q, setQ] = useState('')
  const [sort, setSort] = useState(tipo === 'ano' ? 'nome' : 'questoes'); const [dir, setDir] = useState<'asc' | 'desc'>(tipo === 'ano' ? 'asc' : 'desc')
  const [disc, setDisc] = useState(''); const [semUso, setSemUso] = useState(false)
  const [page, setPage] = useState(1); const [pp, setPp] = useState(14)
  const [dados, setDados] = useState<RespostaTaxG | null>(() => cacheG<RespostaTaxG>(PARAMS_TAX_PADRAO(tipo)) ?? null)
  const [erro, setErro] = useState<string | null>(null); const [carregando, setCarregando] = useState(() => !cacheG(PARAMS_TAX_PADRAO(tipo)))
  const [dlg, setDlg] = useState<null | { k: 'novo' } | { k: 'renomear'; i: ItemTaxG } | { k: 'mover'; i: ItemTaxG }>(null)
  const [agindo, setAgindo] = useState<string | null>(null)
  const seq = useRef(0)
  const params = useMemo(() => ({ s: 'taxonomia', tipo, q, sort, dir, disciplina: disc, semuso: semUso, page, pp }), [tipo, q, sort, dir, disc, semUso, page, pp])
  const carregar = useCallback(async (fresh = false) => {
    const mine = ++seq.current; setErro(null)
    const hit = fresh ? undefined : cacheG<RespostaTaxG>(params)
    if (hit) { setDados(hit); setCarregando(false); return } // cache cliente 60 s: troca de lista/página sem rede
    setCarregando(true)
    const j = await lerG<RespostaTaxG>(params, { fresh })
    if (mine !== seq.current) return
    if (j.ok) setDados(j); else setErro(j.error ?? 'Falha ao carregar.')
    setCarregando(false)
  }, [params])
  useEffect(() => { void carregar() }, [carregar])
  useEffect(() => { const t = setTimeout(() => { if (busca.trim() !== q) { setQ(busca.trim()); setPage(1) } }, 300); return () => clearTimeout(t) }, [busca, q])
  useEffect(() => aoMutar(() => { void carregar(true) }), [carregar])

  const ordenar = (k: string) => { setPage(1); if (sort === k) setDir((d) => (d === 'asc' ? 'desc' : 'asc')); else { setSort(k); setDir(k === 'nome' || k === 'pai' ? 'asc' : 'desc') } }
  const Th = ({ k, children, className }: { k: string; children: React.ReactNode; className?: string }) => (
    <th className={cn(thCls, className)}><button type="button" onClick={() => ordenar(k)} className="inline-flex items-center gap-1 uppercase hover:text-foreground">{children}<ArrowUpDown className={cn('h-3 w-3', sort === k ? 'text-primary' : 'text-muted-foreground/50')} /></button></th>
  )
  const entidade = meta.entidade
  const verNoBanco = (i: ItemTaxG) => {
    if (!onAbrirBanco) return
    if (tipo === 'disciplina') onAbrirBanco({ agrupar: 'disciplina', no: `d:${i.id}`, page: 1 })
    else if (tipo === 'assunto') onAbrirBanco({ agrupar: 'disciplina', no: `a:${i.paiId ?? '_'}:${i.id}`, page: 1 })
    else if (tipo === 'banca') onAbrirBanco({ agrupar: 'banca', no: `b:${i.id}`, page: 1 })
    else if (tipo === 'orgao') onAbrirBanco({ agrupar: 'orgao', no: `o:${i.id}`, page: 1 })
    else if (tipo === 'cargo') onAbrirBanco({ agrupar: 'cargo', no: `c:${i.id}`, page: 1 })
    else if (tipo === 'ano') onAbrirBanco({ agrupar: 'ano', no: `y:${i.id}`, page: 1 })
    else onAbrirBanco({ q: i.nome.slice(0, 80), page: 1 })
  }
  async function excluir(i: ItemTaxG) {
    if (!(await confirmar({ titulo: `Excluir ${meta.singular} “${i.nome}”?`, mensagem: 'Nenhuma questão usa este item, então nada é perdido. A exclusão não pode ser desfeita.', confirmar: 'Excluir', destrutivo: true }))) return
    setAgindo(i.id + 'del'); const r = await postG('tax_excluir', { tipo, id: i.id }); setAgindo(null)
    if (!r.ok) { toast.error(r.error || 'Não foi possível excluir.'); return }
    toast.success('Item excluído.'); onMudou()
  }
  const total = dados?.total ?? 0

  return (
    <>
      <PainelCard titulo={meta.nome}
        acao={<>{carregando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Carregando" />}
          {onUnificarTermos && <Button size="sm" variant="outline" onClick={() => onUnificarTermos(tipo, '')} disabled={tipo === 'ano'} title="Detectar e mesclar nomes repetidos ou parecidos"><Merge />Unificar repetidos</Button>}
          {podeEditar && entidade && <Button size="sm" onClick={() => setDlg({ k: 'novo' })}><Plus />Novo(a) {meta.singular}</Button>}</>}
        barra={<>
          <div className="relative min-w-48 flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={`Buscar ${meta.singular}`} aria-label={`Buscar ${meta.singular}`} className={campoBusca} autoComplete="off" /></div>
          {tipo === 'assunto' && <select className={cn(selectBarra, 'max-w-56')} value={disc} onChange={(e) => { setDisc(e.target.value); setPage(1) }} aria-label="Filtrar por disciplina"><option value="">Disciplina: todas</option>{(dados?.disciplinas ?? []).map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}</select>}
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" checked={semUso} onChange={(e) => { setSemUso(e.target.checked); setPage(1) }} className="h-3.5 w-3.5 accent-[var(--primary)]" />Só sem questões</label>
          {(q || disc || semUso) && <button type="button" onClick={() => { setBusca(''); setQ(''); setDisc(''); setSemUso(false); setPage(1) }} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" />Limpar</button>}
        </>}>
        {!entidade && <p className="mx-2 mb-1 mt-2 rounded-lg border bg-muted/30 p-2 text-xs text-muted-foreground">{tipo === 'ano' ? 'O ano é um número em cada questão: para corrigir, use a fila ou a classificação em massa.' : `${meta.nome} são textos livres nas questões, sem cadastro próprio. Renomear troca o valor em todas as questões que o usam (se o novo nome já existir, os dois são unificados).`}</p>}
        {erro && !dados ? <ErroTentar msg={erro} onTentar={() => void carregar(true)} /> : !dados ? <Carregando /> : (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="sticky top-0 z-10 bg-card"><tr className="border-b">
                <Th k="nome">{meta.nome.replace(/s$/, '')}</Th>
                {tipo === 'assunto' && <Th k="pai">Disciplina</Th>}
                {tipo === 'disciplina' && <><th className={thCls}>Classificação</th><Th k="extra" className="text-right">Assuntos</Th></>}
                <Th k="questoes" className="text-right">Questões</Th><th className={cn(thCls, 'text-right')}>Ações</th>
              </tr></thead>
              <tbody>
                {dados.itens.length === 0 && <tr><td colSpan={6}><Vazio>{q || disc || semUso ? 'Nada encontrado com esta busca/filtro.' : 'Nada cadastrado ainda.'}</Vazio></td></tr>}
                {dados.itens.map((i) => (
                  <tr key={i.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="max-w-[28rem] px-3 py-2.5"><span className="block truncate font-medium" title={i.nome}>{i.nome}</span></td>
                    {tipo === 'assunto' && <td className="px-3 py-2.5 text-xs text-muted-foreground">{i.paiNome ?? <span className="text-amber-700 dark:text-amber-400">sem disciplina</span>}</td>}
                    {tipo === 'disciplina' && <><td className="px-3 py-2.5 text-xs text-muted-foreground">{CLASSES.find((c) => c.id === (i.classificacao ?? ''))?.nome ?? i.classificacao ?? '—'}</td><td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{(i.extra ?? 0).toLocaleString('pt-BR')}</td></>}
                    <td className="px-3 py-2.5 text-right tabular-nums">{i.questoes > 0 && onAbrirBanco ? <button type="button" onClick={() => verNoBanco(i)} className="font-medium text-primary hover:underline" title="Abrir estas questões no Banco">{i.questoes.toLocaleString('pt-BR')}</button> : <span className={i.questoes > 0 ? 'font-medium' : 'text-muted-foreground'}>{i.questoes.toLocaleString('pt-BR')}</span>}</td>
                    <td className="px-3 py-2.5"><div className="flex justify-end gap-1">
                      {onAbrirBanco && <Button size="icon-sm" variant="outline" title="Ver no Banco" aria-label={`Ver ${i.nome} no Banco`} disabled={i.questoes === 0} onClick={() => verNoBanco(i)}><Eye /></Button>}
                      {podeEditar && <>
                        <Button size="icon-sm" variant="outline" title="Renomear" aria-label={`Renomear ${i.nome}`} disabled={tipo === 'ano'} onClick={() => setDlg({ k: 'renomear', i })}><Pencil /></Button>
                        {tipo === 'assunto' && <Button size="icon-sm" variant="outline" title="Mover para outra disciplina" aria-label={`Mover ${i.nome}`} onClick={() => setDlg({ k: 'mover', i })}><FolderInput /></Button>}
                        {onUnificarTermos && <Button size="icon-sm" variant="outline" title="Unificar com nomes parecidos" aria-label={`Unificar ${i.nome}`} disabled={tipo === 'ano'} onClick={() => onUnificarTermos(tipo, i.nome)}><Merge /></Button>}
                        <Button size="icon-sm" variant="outline" title={!entidade ? 'Este valor não tem cadastro — renomeie ou unifique' : i.questoes > 0 || (i.extra ?? 0) > 0 ? 'Em uso: unifique em vez de excluir' : 'Excluir'} aria-label={`Excluir ${i.nome}`}
                          disabled={!entidade || i.questoes > 0 || (i.extra ?? 0) > 0 || !!agindo} onClick={() => void excluir(i)}>{agindo === i.id + 'del' ? <Loader2 className="animate-spin" /> : <Trash2 />}</Button>
                      </>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PainelCard>
      <PaginacaoBib total={total} page={page} pp={pp} opcoesPP={PP} selecionados={0} carregando={carregando} rotuloVazio="Nenhum item" onPage={setPage} onPP={(n) => { setPp(n); setPage(1) }} />

      {dlg && <DialogoTax tipo={tipo} dlg={dlg} disciplinas={dados?.disciplinas ?? []} onClose={() => setDlg(null)} onFeito={() => { setDlg(null); onMudou() }} />}
    </>
  )
}

function DialogoTax({ tipo, dlg, disciplinas, onClose, onFeito }: {
  tipo: TipoTaxG; dlg: { k: 'novo' } | { k: 'renomear'; i: ItemTaxG } | { k: 'mover'; i: ItemTaxG }; disciplinas: { id: string; nome: string }[]; onClose: () => void; onFeito: () => void
}) {
  const meta = TIPOS_TAX_G.find((t) => t.id === tipo)!
  const item = dlg.k === 'novo' ? null : dlg.i
  const [nome, setNome] = useState(item?.nome ?? '')
  const [disc, setDisc] = useState(item?.paiId ?? '')
  const [classe, setClasse] = useState(item?.classificacao ?? '')
  const [lista, setLista] = useState(disciplinas)
  const [enviando, setEnviando] = useState(false)
  useEffect(() => { if (tipo === 'assunto' && !lista.length) void lerG<RespostaTaxG>({ s: 'taxonomia', tipo: 'assunto', page: 1, pp: 5 }).then((j) => { if (j.ok) setLista(j.disciplinas ?? []) }) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const titulo = dlg.k === 'novo' ? `Novo(a) ${meta.singular}` : dlg.k === 'mover' ? `Mover assunto “${item!.nome}”` : `Renomear ${meta.singular}`
  async function enviar() {
    setEnviando(true)
    let r: { ok: boolean; error?: string }
    if (dlg.k === 'novo') r = await postG('tax_criar', { tipo, nome: nome.trim(), disciplinaId: disc || null })
    else if (dlg.k === 'mover') r = await postG('tax_mover_assunto', { id: item!.id, disciplinaId: disc })
    else {
      r = nome.trim() === item!.nome ? { ok: true } : await postG('tax_renomear', { tipo, id: item!.id, nome: nome.trim() })
      if (r.ok && tipo === 'disciplina' && (classe || '') !== (item!.classificacao ?? '')) r = await postG('disc_atributos', { id: item!.id, patch: { classificacao: classe || null } })
    }
    setEnviando(false)
    if (!r.ok) { toast.error(r.error || 'Não foi possível salvar.'); return }
    toast.success(dlg.k === 'novo' ? 'Criado.' : dlg.k === 'mover' ? 'Assunto movido.' : 'Salvo.'); onFeito()
  }
  const valor = dlg.k === 'mover' ? !!disc && disc !== item!.paiId : !!nome.trim() && (dlg.k === 'novo' ? (tipo !== 'assunto' || !!disc) : true)
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !enviando) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{dlg.k === 'mover' ? 'As questões que usam este assunto continuam com ele; só muda a disciplina a que o assunto pertence no cadastro.' : dlg.k === 'renomear' && !meta.entidade ? 'Troca o valor em todas as questões que o usam.' : 'Evite criar nomes repetidos: o sistema avisa quando já existir.'}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {dlg.k !== 'mover' && (
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">Nome
              <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && valor) void enviar() }} maxLength={200} aria-label="Nome"
                className="h-9 rounded-lg border bg-background px-2 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
            </label>
          )}
          {tipo === 'assunto' && dlg.k !== 'renomear' && (
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">Disciplina
              <select className="h-9 rounded-lg border bg-background px-2 text-sm font-normal text-foreground" value={disc} onChange={(e) => setDisc(e.target.value)} aria-label="Disciplina">
                <option value="">Escolha a disciplina</option>{lista.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
            </label>
          )}
          {tipo === 'disciplina' && dlg.k === 'renomear' && (
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">Classificação (usada no Cronograma Adaptativo)
              <select className="h-9 rounded-lg border bg-background px-2 text-sm font-normal text-foreground" value={classe} onChange={(e) => setClasse(e.target.value)} aria-label="Classificação da disciplina">
                {CLASSES.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="-mx-4 -mb-4 mt-2 flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button onClick={() => void enviar()} disabled={!valor || enviando}>{enviando && <Loader2 className="animate-spin" />}{dlg.k === 'novo' ? 'Criar' : dlg.k === 'mover' ? 'Mover' : 'Salvar'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
