'use client'

import { AbasLinhaControlada } from '@/components/ui/abas-linha'
import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, ArrowUpDown, Download, FlaskConical, Loader2, Play, Plus, Search, Square, Trash2, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { confirmar } from '@/components/ui/confirm-dialog'
import { CHAVE_RASCUNHO, GRUPOS_CAMPOS } from '@/lib/cronograma/adaptativo/regras-campos'
import { nomeArquivoRegras } from '@/lib/cronograma/adaptativo/regras-io'
import {
  exportarRegrasVigentes, impactoLote, laboratorioRastro, previewImportacao, salvarRegrasComTrava,
} from '../inteligencia-actions'
import {
  AMOSTRA_MAX, AMOSTRA_MIN, AMOSTRA_PADRAO,
  type AlteracaoCampo, type CriterioAmostra, type ImpactoPlano, type LinhaImpacto, type ResultadoImportacao, type ResultadoLab, type ResumoTrava,
} from '../inteligencia-actions-tipos'

export interface LinhaComparacao { path: string; rotulo: string; padrao: string; vigente: string }
export interface ResumoFaixa { id: string; nome: string; minMin: number; maxMin: number | null; tetoPdf: number; revisaoModo: string; overrides: string[] }

type Aba = 'impacto' | 'lab' | 'io' | 'comparacao'
const ABAS: Array<{ id: Aba; rotulo: string }> = [
  { id: 'impacto', rotulo: 'Painel de impacto' }, { id: 'lab', rotulo: 'Laboratório de bug' },
  { id: 'io', rotulo: 'Exportar / importar' }, { id: 'comparacao', rotulo: 'Tenant × padrão' },
]
const nf = (n: number) => n.toLocaleString('pt-BR')
const sinal = (n: number) => (n > 0 ? `+${nf(n)}` : nf(n))
const inputCls = 'h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring'
const Caixa = ({ children, tipo = 'info' }: { children: React.ReactNode; tipo?: 'info' | 'erro' | 'aviso' }) => (
  <div className={cn('rounded-2xl border p-3 text-sm', tipo === 'erro' ? 'border-destructive/30 bg-destructive/5 text-destructive' : tipo === 'aviso' ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-muted/30 text-muted-foreground')}>{children}</div>
)
const Kpi = ({ rotulo, valor, alerta }: { rotulo: string; valor: string; alerta?: boolean }) => (
  <div className={cn('rounded-2xl border bg-card p-3 shadow-sm', alerta && 'border-destructive/40 bg-destructive/5')}>
    <div className="text-xs text-muted-foreground">{rotulo}</div>
    <div className={cn('text-xl font-bold tabular-nums', alerta && 'text-destructive')}>{valor}</div>
  </div>
)

export function InteligenciaClient({ versao, hash, podeEditar, comparacao, faixasVigentes, faixasPadrao }: {
  versao: number; hash: string; podeEditar: boolean; comparacao: LinhaComparacao[]; faixasVigentes: ResumoFaixa[]; faixasPadrao: ResumoFaixa[]
}) {
  const [aba, setAba] = useState<Aba>('impacto')
  const [versaoAtual, setVersaoAtual] = useState(versao)
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Regras em vigor: versão {versaoAtual} · {hash.slice(0, 8)}</p>
      <AbasLinhaControlada valor={aba} onChange={setAba} itens={ABAS.map((a) => ({ valor: a.id, label: a.rotulo }))} />
      {!podeEditar && aba !== 'comparacao' && <Caixa tipo="aviso">Seu perfil só pode visualizar o cronograma: simulações, laboratório e importação exigem a permissão de edição.</Caixa>}
      {aba === 'impacto' && podeEditar && <PainelImpacto />}
      {aba === 'lab' && podeEditar && <Laboratorio />}
      {aba === 'io' && <ExportImport versao={versaoAtual} podeEditar={podeEditar} onSalvou={setVersaoAtual} />}
      {aba === 'comparacao' && <Comparacao linhas={comparacao} vigentes={faixasVigentes} padrao={faixasPadrao} />}
    </div>
  )
}

// ── (a) painel de impacto ────────────────────────────────────────────────────────────────────────────
type Cenario = 'padrao' | 'rascunho'
type Ord = 'delta' | 'viol' | 'div' | 'movidas'
const PAG = 11

function PainelImpacto() {
  const [tamanho, setTamanho] = useState(AMOSTRA_PADRAO)
  const [criterio, setCriterio] = useState<CriterioAmostra>('recentes')
  const [seed, setSeed] = useState('1')
  const [fonte, setFonte] = useState<'nenhum' | 'rascunho' | 'colado'>('nenhum')
  const [colado, setColado] = useState('')
  const [cenario, setCenario] = useState<Cenario>('padrao')
  const [rodando, setRodando] = useState(false)
  const parar = useRef(false)
  const [prog, setProg] = useState<{ lote: number; lotes: number } | null>(null)
  const [linhas, setLinhas] = useState<LinhaImpacto[]>([])
  const [ignorados, setIgnorados] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [fDiv, setFDiv] = useState(false)
  const [fErro, setFErro] = useState(false)
  const [fDelta, setFDelta] = useState(false)
  const [ord, setOrd] = useState<Ord>('delta')
  const [asc, setAsc] = useState(false)
  const [pag, setPag] = useState(1)

  const lerRascunho = (): { ok: true; v: unknown } | { ok: false; e: string } => {
    if (fonte === 'nenhum') return { ok: true, v: undefined }
    try {
      const txt = fonte === 'rascunho' ? sessionStorage.getItem(CHAVE_RASCUNHO) : colado
      if (!txt?.trim()) return { ok: false, e: fonte === 'rascunho' ? 'Não há rascunho salvo na aba Faixas e limites.' : 'Cole o JSON das regras.' }
      const o = JSON.parse(txt) as Record<string, unknown>
      return { ok: true, v: o && typeof o === 'object' && 'regras' in o && o.formato ? o.regras : o }
    } catch { return { ok: false, e: 'Rascunho/JSON inválido.' } }
  }

  const executar = async () => {
    const r = lerRascunho()
    if (!r.ok) { setErro(r.e); return }
    setErro(null); setLinhas([]); setIgnorados(0); setPag(1); parar.current = false; setRodando(true)
    if (cenario === 'rascunho' && fonte === 'nenhum') setCenario('padrao')
    let lote = 1, lotes = 1
    try {
      while (lote <= lotes && !parar.current) {
        setProg({ lote, lotes })
        const res = await impactoLote({ amostra: { tamanho, criterio, seed }, rascunho: r.v, lote })
        if (!res.ok || !res.dados) { setErro(res.error ?? 'Falha ao simular.'); break }
        lotes = res.dados.lotes
        setLinhas((a) => [...a, ...res.dados!.linhas]); setIgnorados((n) => n + res.dados!.ignorados)
        setProg({ lote, lotes }); lote++
      }
    } catch (e) { setErro((e as Error).message || 'Falha ao simular.') } finally { setRodando(false) }
  }

  const imp = (l: LinhaImpacto): ImpactoPlano | null => (cenario === 'rascunho' ? l.rascunho : l.padrao)
  const lista = useMemo(() => {
    const b = q.trim().toLowerCase()
    const f = linhas.filter((l) => {
      const i = imp(l)
      if (b && !`${l.aluno} ${l.titulo ?? ''}`.toLowerCase().includes(b)) return false
      if (fDiv && !(i && i.concluidasDivergentes > 0)) return false
      if (fErro && !(l.erroVigente || i?.erroAlt)) return false
      if (fDelta && !(i && (i.deltaFimDias !== 0 || i.deltaFimSemanas !== 0))) return false
      return true
    })
    const val = (l: LinhaImpacto) => { const i = imp(l); return !i ? 0 : ord === 'delta' ? i.deltaFimDias : ord === 'viol' ? i.violacoesAlt - i.violacoesBase : ord === 'div' ? i.concluidasDivergentes : i.movidas + i.removidas }
    return [...f].sort((a, c) => (val(a) - val(c)) * (asc ? 1 : -1) || a.planoId.localeCompare(c.planoId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, q, fDiv, fErro, fDelta, ord, asc, cenario])

  const tot = useMemo(() => {
    let analisados = 0, div = 0, comDiv = 0, erros = 0, mov = 0, rem = 0, dsum = 0
    for (const l of linhas) {
      const i = imp(l); if (!i) continue
      analisados++; div += i.concluidasDivergentes; if (i.concluidasDivergentes) comDiv++
      if (l.erroVigente || i.erroAlt) erros++
      mov += i.movidas; rem += i.removidas; dsum += i.deltaFimDias
    }
    return { analisados, div, comDiv, erros, mov, rem, dmed: analisados ? Math.round((dsum / analisados) * 10) / 10 : 0 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, cenario])

  const paginas = Math.max(1, Math.ceil(lista.length / PAG))
  const p = Math.min(pag, paginas)
  const visiveis = lista.slice((p - 1) * PAG, p * PAG)
  const Th = ({ c, children }: { c: Ord; children: string }) => (
    <th className="px-3 py-2 text-right font-medium">
      <button type="button" onClick={() => { if (ord === c) setAsc(!asc); else { setOrd(c); setAsc(false) } }} className="inline-flex items-center gap-1 hover:text-foreground">
        {children}{ord === c ? (asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  )

  return (
    <div className="space-y-3">
      <div className="grid gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-xs text-muted-foreground">Tamanho da amostra ({AMOSTRA_MIN}–{AMOSTRA_MAX})
          <input type="number" min={AMOSTRA_MIN} max={AMOSTRA_MAX} value={tamanho} onChange={(e) => setTamanho(Number(e.target.value))} className={cn(inputCls, 'w-full')} /></label>
        <label className="space-y-1 text-xs text-muted-foreground">Critério
          <select value={criterio} onChange={(e) => setCriterio(e.target.value as CriterioAmostra)} className={cn(inputCls, 'w-full')}>
            <option value="recentes">Mais recentes</option><option value="aleatoria">Aleatória (por seed)</option><option value="faixa">Estratificada por faixa de carga</option></select></label>
        <label className="space-y-1 text-xs text-muted-foreground">Seed (reprodutível)
          <input value={seed} onChange={(e) => setSeed(e.target.value)} disabled={criterio === 'recentes'} className={cn(inputCls, 'w-full disabled:opacity-50')} /></label>
        <label className="space-y-1 text-xs text-muted-foreground">Comparar vigentes com
          <select value={fonte} onChange={(e) => setFonte(e.target.value as typeof fonte)} className={cn(inputCls, 'w-full')}>
            <option value="nenhum">Somente o padrão</option><option value="rascunho">Padrão + rascunho (aba Faixas)</option><option value="colado">Padrão + JSON colado</option></select></label>
        {fonte === 'colado' && <textarea value={colado} onChange={(e) => setColado(e.target.value)} placeholder="Cole as regras (objeto ou arquivo exportado)" rows={4} className="rounded-lg border border-input bg-background p-2 font-mono text-xs sm:col-span-2 lg:col-span-4" />}
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
          <button type="button" onClick={executar} disabled={rodando} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {rodando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Executar amostra</button>
          {rodando && <button type="button" onClick={() => { parar.current = true }} className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm"><Square className="h-4 w-4" />Parar</button>}
          {prog && <span className="text-xs text-muted-foreground">{rodando ? 'Simulando' : 'Concluído'}: lote {Math.min(prog.lote, prog.lotes)} de {prog.lotes} (5 planos por chamada, em série). Somente leitura, só planos do motor 3.x.</span>}
        </div>
      </div>
      {erro && <Caixa tipo="erro">{erro}</Caixa>}

      {linhas.length > 0 && (
        <>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Cenário exibido:</span>
            <select value={cenario} onChange={(e) => { setCenario(e.target.value as Cenario); setPag(1) }} className={inputCls}>
              <option value="padrao">Vigente × padrão</option><option value="rascunho" disabled={fonte === 'nenhum'}>Vigente × rascunho</option></select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Kpi rotulo="Planos comparados" valor={`${nf(tot.analisados)} de ${nf(linhas.length)}`} />
            <Kpi rotulo="Δ médio do fim (dias)" valor={sinal(tot.dmed)} />
            <Kpi rotulo="Pendentes movidas" valor={nf(tot.mov)} />
            <Kpi rotulo="Pendentes removidas" valor={nf(tot.rem)} />
            <Kpi rotulo="Concluídas divergentes" valor={`${nf(tot.div)} (${nf(tot.comDiv)} planos)`} alerta={tot.div > 0} />
            <Kpi rotulo="Planos com erro" valor={nf(tot.erros)} alerta={tot.erros > 0} />
          </div>
          {ignorados > 0 && <Caixa tipo="aviso">{nf(ignorados)} plano(s) da amostra não puderam ser carregados (apagados, legado ou sem permissão).</Caixa>}
          {cenario === 'padrao' && linhas.every((l) => !l.padrao) && <Caixa>As regras vigentes são idênticas ao padrão: nada muda neste cenário.</Caixa>}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => { setQ(e.target.value); setPag(1) }} placeholder="Buscar por aluno ou plano" className={cn(inputCls, 'w-full pl-9')} />
            </div>
            {([['Só com divergência', fDiv, setFDiv], ['Só com erro', fErro, setFErro], ['Só com Δ ≠ 0', fDelta, setFDelta]] as const).map(([r, v, set]) => (
              <label key={r} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={v} onChange={(e) => { set(e.target.checked); setPag(1) }} />{r}</label>
            ))}
          </div>
          <div className="overflow-x-auto rounded-2xl border">
            <table className="w-full table-fixed text-sm">
              <colgroup><col className="w-[22%]" /><col className="w-[8%]" /><col className="w-[14%]" /><col className="w-[9%]" /><col className="w-[9%]" /><col className="w-[12%]" /><col className="w-[12%]" /><col className="w-[14%]" /></colgroup>
              <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
                <th className="px-3 py-2 text-left font-medium">Aluno / plano</th><th className="px-3 py-2 text-right font-medium">Faixa</th>
                <Th c="delta">Δ fim</Th><Th c="movidas">Movidas</Th><th className="px-3 py-2 text-right font-medium">Removidas</th>
                <Th c="viol">Violações</Th><Th c="div">Concl. diverg.</Th><th className="px-3 py-2 text-left font-medium">Erro</th>
              </tr></thead>
              <tbody>
                {visiveis.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Nenhum plano para os filtros atuais.</td></tr>}
                {visiveis.map((l) => {
                  const i = imp(l)
                  const msg = l.erroVigente ? `Vigentes: ${l.erroVigente}` : i?.erroAlt ? `Proposta: ${i.erroAlt}` : ''
                  return (
                    <tr key={l.planoId} className="border-t">
                      <td className="truncate px-3 py-2" title={`${l.aluno} · ${l.titulo ?? ''}`}>{l.aluno}<div className="truncate text-xs text-muted-foreground">{l.titulo ?? 'Plano'}</div></td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.faixa ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{i ? `${sinal(i.deltaFimSemanas)} sem (${sinal(i.deltaFimDias)} d)` : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{i ? nf(i.movidas) : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{i ? nf(i.removidas) : '—'}</td>
                      <td className={cn('px-3 py-2 text-right tabular-nums', i && i.violacoesAlt > i.violacoesBase && 'font-semibold text-destructive')}>{i ? `${nf(i.violacoesBase)} → ${nf(i.violacoesAlt)}` : nf(l.violacoesVigente)}</td>
                      <td className={cn('px-3 py-2 text-right tabular-nums', i && i.concluidasDivergentes > 0 ? 'font-bold text-destructive' : 'text-muted-foreground')} title={i?.exemplosDivergentes.join(', ')}>{i ? nf(i.concluidasDivergentes) : '—'}</td>
                      <td className="truncate px-3 py-2 text-xs text-destructive" title={msg}>{msg || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Paginacao pag={p} paginas={paginas} total={lista.length} set={setPag} />
        </>
      )}
    </div>
  )
}

function Paginacao({ pag, paginas, total, set }: { pag: number; paginas: number; total: number; set: (n: number) => void }) {
  const b = 'h-8 rounded-lg border px-3 text-xs disabled:opacity-40'
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>{nf(total)} resultado(s) · página {pag} de {paginas}</span>
      <div className="flex gap-1">
        <button className={b} disabled={pag <= 1} onClick={() => set(1)}>Início</button><button className={b} disabled={pag <= 1} onClick={() => set(pag - 1)}>Anterior</button>
        <button className={b} disabled={pag >= paginas} onClick={() => set(pag + 1)}>Próxima</button><button className={b} disabled={pag >= paginas} onClick={() => set(paginas)}>Final</button>
      </div>
    </div>
  )
}

// ── (b) laboratório de bug ───────────────────────────────────────────────────────────────────────────
function Laboratorio() {
  const [email, setEmail] = useState('')
  const [planoId, setPlanoId] = useState('')
  const [alts, setAlts] = useState<AlteracaoCampo[]>([])
  const [json, setJson] = useState('')
  const [res, setRes] = useState<ResultadoLab | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pend, start] = useTransition()
  const [qMud, setQMud] = useState('')

  const rodar = (pid?: string) => start(async () => {
    setErro(null)
    const r = await laboratorioRastro({ email, planoId: pid ?? (planoId || null), alteracoes: alts.filter((a) => a.path), jsonParcial: json })
    if (!r.ok || !r.dados) { setErro(r.error ?? 'Falha ao rodar.'); return }
    setRes(r.dados); setPlanoId(r.dados.planoId)
  })
  const mud = useMemo(() => { const b = qMud.trim().toLowerCase(); return (res?.mudancas ?? []).filter((m) => !b || `${m.id} ${m.rotulo}`.toLowerCase().includes(b)) }, [res, qMud])
  const ev = res?.eventos

  return (
    <div className="space-y-3">
      <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-64 flex-1 space-y-1 text-xs text-muted-foreground">E-mail completo do aluno
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="aluno@email.com" className={cn(inputCls, 'w-full')} /></label>
          {res && res.planos.length > 1 && (
            <label className="space-y-1 text-xs text-muted-foreground">Plano
              <select value={planoId} onChange={(e) => { setPlanoId(e.target.value); rodar(e.target.value) }} className={inputCls}>
                {res.planos.map((p) => <option key={p.id} value={p.id}>{(p.titulo || 'Plano') + (p.fixado ? ' (fixado)' : '')}</option>)}</select></label>
          )}
        </div>
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Campos alterados (só em memória)</div>
          {alts.map((a, k) => (
            <div key={k} className="flex flex-wrap items-center gap-2">
              <select value={a.path} onChange={(e) => setAlts(alts.map((x, j) => (j === k ? { ...x, path: e.target.value } : x)))} className={cn(inputCls, 'min-w-64 flex-1')}>
                <option value="">Escolha um campo…</option>
                {GRUPOS_CAMPOS.map((g) => <optgroup key={g.id} label={g.titulo}>{g.campos.map((c) => <option key={c.path} value={c.path}>{c.rotulo}</option>)}</optgroup>)}
              </select>
              <input value={a.texto} onChange={(e) => setAlts(alts.map((x, j) => (j === k ? { ...x, texto: e.target.value } : x)))} placeholder="Novo valor" className={cn(inputCls, 'w-40')} />
              <button type="button" aria-label="Remover campo" onClick={() => setAlts(alts.filter((_, j) => j !== k))} className="rounded-lg border p-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <button type="button" onClick={() => setAlts([...alts, { path: '', texto: '' }])} className="inline-flex h-8 items-center gap-1 rounded-lg border px-3 text-xs"><Plus className="h-3 w-3" />Adicionar campo</button>
        </div>
        <label className="block space-y-1 text-xs text-muted-foreground">Ou JSON parcial de regras (mesclado sobre as vigentes)
          <textarea value={json} onChange={(e) => setJson(e.target.value)} rows={3} placeholder='{"legproc":{"metasDiaMax":3}}' className="w-full rounded-lg border border-input bg-background p-2 font-mono text-xs" /></label>
        <button type="button" onClick={() => rodar()} disabled={pend || !email.trim()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {pend ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}Rodar rastro vigente × alterado</button>
      </div>
      {erro && <Caixa tipo="erro">{erro}</Caixa>}
      {res && (
        <>
          <p className="text-sm text-muted-foreground"><b>{res.aluno.nome || 'Aluno'}</b> · {res.aluno.email} · plano {res.titulo ? `“${res.titulo}”` : ''} · hoje {res.hoje.split('-').reverse().join('/')}</p>
          {(res.vigente.erro || res.alterada.erro) && <Caixa tipo="erro">{res.vigente.erro ? `Vigentes: ${res.vigente.erro}. ` : ''}{res.alterada.erro ? `Alteradas: ${res.alterada.erro}` : ''}</Caixa>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi rotulo="Δ fim" valor={`${sinal(res.impacto.deltaFimSemanas)} sem (${sinal(res.impacto.deltaFimDias)} d)`} />
            <Kpi rotulo="Metas movidas / removidas" valor={`${nf(res.impacto.movidas)} / ${nf(res.impacto.removidas)}`} />
            <Kpi rotulo="Violações" valor={`${nf(res.vigente.violacoes)} → ${nf(res.alterada.violacoes)}`} alerta={res.alterada.violacoes > res.vigente.violacoes} />
            <Kpi rotulo="Decisões do motor" valor={`${nf(res.vigente.eventos)} → ${nf(res.alterada.eventos)}`} />
            <Kpi rotulo="Concluídas divergentes" valor={nf(res.impacto.concluidasDivergentes)} alerta={res.impacto.concluidasDivergentes > 0} />
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold">Campos que diferem das regras vigentes</h3>
            {res.campos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum: as regras alteradas são iguais às vigentes.</p> : (
              <ul className="space-y-1 text-sm">{res.campos.map((c) => <li key={c.path}><b>{c.rotulo}</b>: {c.de} → {c.para}</li>)}</ul>
            )}
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <ListaEventos titulo="Decisões que só existem nas vigentes" eventos={ev?.soBase ?? []} />
            <ListaEventos titulo="Decisões que só existem nas alteradas" eventos={ev?.soAlt ?? []} />
            <div className="rounded-2xl border bg-card p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold">Decisões que mudaram de motivo ou data ({nf(ev?.mudaram.length ?? 0)})</h3>
              <ul className="max-h-72 space-y-2 overflow-y-auto text-xs">
                {(ev?.mudaram ?? []).slice(0, 100).map((m, k) => (
                  <li key={k} className="rounded-lg bg-muted/40 p-2"><div className="font-medium">{m.base.id}</div><div className="text-muted-foreground">{m.base.texto} ({m.base.de} → {m.base.ate})</div><div>{m.alt.texto} ({m.alt.de} → {m.alt.ate})</div></li>
                ))}
                {!ev?.mudaram.length && <li className="text-muted-foreground">Nenhuma.</li>}
              </ul>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">Metas pendentes que mudaram de data ({nf(res.mudancasTotal)}{res.mudancasTotal > res.mudancas.length ? `, mostrando ${res.mudancas.length}` : ''})</h3>
              <div className="relative ml-auto min-w-48">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input value={qMud} onChange={(e) => setQMud(e.target.value)} placeholder="Filtrar metas" className={cn(inputCls, 'w-full pl-9')} /></div>
            </div>
            <div className="max-h-96 overflow-auto rounded-2xl border">
              <table className="w-full text-sm"><thead className="sticky top-0 bg-muted text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-left font-medium">Meta</th><th className="px-3 py-2 text-left font-medium">Vigentes</th><th className="px-3 py-2 text-left font-medium">Alteradas</th></tr></thead>
                <tbody>{mud.map((m) => <tr key={m.id} className="border-t"><td className="px-3 py-1.5">{m.rotulo} <span className="text-xs text-muted-foreground">{m.id}</span></td><td className="px-3 py-1.5 tabular-nums">{m.de.split('-').reverse().join('/')}</td><td className={cn('px-3 py-1.5 tabular-nums', !m.para && 'text-destructive')}>{m.para ? m.para.split('-').reverse().join('/') : 'removida'}</td></tr>)}
                  {!mud.length && <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">Nenhuma meta mudou.</td></tr>}</tbody></table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
function ListaEventos({ titulo, eventos }: { titulo: string; eventos: Array<{ id: string; texto: string; de: string; ate: string }> }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold">{titulo} ({nf(eventos.length)})</h3>
      <ul className="max-h-72 space-y-2 overflow-y-auto text-xs">
        {eventos.slice(0, 100).map((e, k) => <li key={k} className="rounded-lg bg-muted/40 p-2"><div className="font-medium">{e.id}</div><div className="text-muted-foreground">{e.texto} ({e.de} → {e.ate})</div></li>)}
        {!eventos.length && <li className="text-muted-foreground">Nenhuma.</li>}
      </ul>
    </div>
  )
}

// ── (c)+(e) exportar / importar com trava ────────────────────────────────────────────────────────────
function ExportImport({ versao, podeEditar, onSalvou }: { versao: number; podeEditar: boolean; onSalvou: (v: number) => void }) {
  const router = useRouter()
  const [pend, start] = useTransition()
  const [texto, setTexto] = useState('')
  const [prev, setPrev] = useState<ResultadoImportacao | null>(null)
  const [motivo, setMotivo] = useState('Importado de JSON')

  const exportar = () => start(async () => {
    const r = await exportarRegrasVigentes()
    if (!r.ok || !r.dados) { toast.error(r.error ?? 'Falha ao exportar.'); return }
    const blob = new Blob([JSON.stringify(r.dados, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = nomeArquivoRegras(r.dados.hash, r.dados.exportadoEm.slice(0, 10)); a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  })
  const arquivo = async (f: File | undefined) => {
    if (!f) return
    if (f.size > 200 * 1024) { toast.error('Arquivo grande demais (máximo de 200 KB).'); return }
    setTexto(await f.text()); setPrev(null)
  }
  const previsualizar = () => start(async () => {
    const r = await previewImportacao(texto)
    if (!r.ok || !r.dados) { toast.error(r.error ?? 'Falha ao validar.'); return }
    setPrev(r.dados)
  })
  const aplicar = () => start(async () => {
    if (!prev?.ok || !prev.regras) return
    if (!(await confirmar({ titulo: 'Aplicar regras importadas', mensagem: `${prev.diff.length} campo(s) mudam nas regras em vigor, como nova versão. Planos já gravados não mudam. Antes, o sistema simula uma amostra de planos reais.`, confirmar: 'Simular e aplicar' }))) return
    let r = await salvarRegrasComTrava(prev.regras, versao, motivo.trim() || 'Importado de JSON', false)
    if (!r.ok && r.exigeConfirmacao) {
      const s: ResumoTrava = r.resumo
      const ok = await confirmar({
        titulo: 'Risco detectado na amostra', destrutivo: true, confirmar: 'Aplicar mesmo assim',
        mensagem: `Em ${s.planos} planos simulados${r.parcial ? ' (amostra parcial)' : ''}: ${s.totalDivergentes} meta(s) concluída(s) mudaria(m) de data em ${s.comDivergencia} plano(s); ${s.novosErros} plano(s) passariam a falhar na geração.`,
      })
      if (!ok) return
      r = await salvarRegrasComTrava(prev.regras, versao, motivo.trim() || 'Importado de JSON', true)
    }
    if (!r.ok) { toast.error(r.conflito ? 'Outra pessoa salvou regras nesse meio tempo. Recarregue a página.' : (r.error ?? 'Falha ao aplicar.')); return }
    toast.success(`Regras aplicadas na versão ${r.versao}.`)
    onSalvou(r.versao); setPrev(null); setTexto(''); router.refresh()
  })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm">
        <button type="button" onClick={exportar} disabled={pend} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"><Download className="h-4 w-4" />Exportar regras vigentes (.json)</button>
        <span className="text-xs text-muted-foreground">Arquivo com formato, versão, hash, delta contra o padrão e as regras completas. Faixas personalizadas e overrides vão junto.</span>
      </div>
      {podeEditar ? (
        <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
          <h3 className="text-sm font-semibold">Importar regras</h3>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm"><Upload className="h-4 w-4" />Enviar arquivo<input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => arquivo(e.target.files?.[0])} /></label>
            <span className="text-xs text-muted-foreground">ou cole o JSON abaixo (até 200 KB)</span>
          </div>
          <textarea value={texto} onChange={(e) => { setTexto(e.target.value); setPrev(null) }} rows={6} className="w-full rounded-lg border border-input bg-background p-2 font-mono text-xs" placeholder='{"formato":"adaptativo-regras", ...}' />
          <button type="button" onClick={previsualizar} disabled={pend || !texto.trim()} className="inline-flex h-9 items-center gap-2 rounded-lg border px-4 text-sm font-medium disabled:opacity-50">{pend && <Loader2 className="h-4 w-4 animate-spin" />}Pré-visualizar diff</button>
          {prev && !prev.ok && <Caixa tipo="erro"><ul className="list-disc pl-4">{prev.erros.map((e, k) => <li key={k}>{e}</li>)}</ul></Caixa>}
          {prev?.ok && (
            <div className="space-y-2">
              {prev.avisos.length > 0 && <Caixa tipo="aviso"><ul className="list-disc pl-4">{prev.avisos.map((e, k) => <li key={k}>{e}</li>)}</ul></Caixa>}
              {prev.diff.length === 0 ? <Caixa>O arquivo é idêntico às regras em vigor: nada a aplicar.</Caixa> : (
                <div className="max-h-80 overflow-auto rounded-2xl border">
                  <table className="w-full text-sm"><thead className="sticky top-0 bg-muted text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-left font-medium">Campo</th><th className="px-3 py-2 text-left font-medium">Em vigor</th><th className="px-3 py-2 text-left font-medium">Importado</th></tr></thead>
                    <tbody>{prev.diff.map((d) => <tr key={d.path} className="border-t"><td className="px-3 py-1.5">{d.rotulo}</td><td className="px-3 py-1.5 text-muted-foreground">{d.de}</td><td className="px-3 py-1.5 font-medium">{d.para}</td></tr>)}</tbody></table>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} aria-label="Motivo" className={cn(inputCls, 'min-w-64 flex-1')} />
                <button type="button" onClick={aplicar} disabled={pend || prev.diff.length === 0} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{pend && <Loader2 className="h-4 w-4 animate-spin" />}Aplicar com trava de segurança</button>
              </div>
              <p className="text-xs text-muted-foreground">A trava simula 20 planos reais; se alguma meta concluída mudasse de data ou algum plano passasse a falhar, pede confirmação explícita. A tela <Link href="/admin/cronogramas/adaptativo/faixas" className="text-primary underline-offset-2 hover:underline">Faixas e limites</Link> ainda salva sem a trava: use a pré-visualização de impacto aqui antes de salvar por lá.</p>
            </div>
          )}
        </div>
      ) : <Caixa tipo="aviso">Importar regras exige a permissão de edição do cronograma.</Caixa>}
    </div>
  )
}

// ── (d) tenant × padrão ──────────────────────────────────────────────────────────────────────────────
function Comparacao({ linhas, vigentes, padrao }: { linhas: LinhaComparacao[]; vigentes: ResumoFaixa[]; padrao: ResumoFaixa[] }) {
  const [q, setQ] = useState('')
  const [grupo, setGrupo] = useState('')
  const [asc, setAsc] = useState(true)
  const raiz = (p: string) => p.split('.')[0]
  const grupos = useMemo(() => [...new Set(linhas.map((l) => raiz(l.path)))].sort(), [linhas])
  const lista = useMemo(() => {
    const b = q.trim().toLowerCase()
    const f = linhas.filter((l) => (!grupo || raiz(l.path) === grupo) && (!b || `${l.rotulo} ${l.padrao} ${l.vigente}`.toLowerCase().includes(b)))
    return [...f].sort((a, c) => a.rotulo.localeCompare(c.rotulo, 'pt-BR') * (asc ? 1 : -1))
  }, [linhas, q, grupo, asc])
  const Faixas = ({ titulo, f }: { titulo: string; f: ResumoFaixa[] }) => (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold">{titulo}</h3>
      <ul className="space-y-1 text-sm">{f.map((x) => <li key={x.id}><b>{x.nome}</b>: {nf(x.minMin)}–{x.maxMin == null ? '∞' : nf(x.maxMin)} min/sem · teto {x.tetoPdf} PDFull · revisão {x.revisaoModo}{x.overrides.length ? ` · overrides: ${x.overrides.join(', ')}` : ''}</li>)}</ul>
    </div>
  )
  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2"><Faixas titulo="Faixas do padrão" f={padrao} /><Faixas titulo="Faixas desta plataforma" f={vigentes} /></div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar campo ou valor" className={cn(inputCls, 'w-full pl-9')} /></div>
        <select value={grupo} onChange={(e) => setGrupo(e.target.value)} className={inputCls}><option value="">Todos os grupos</option>{grupos.map((g) => <option key={g} value={g}>{g}</option>)}</select>
        <span className="text-xs text-muted-foreground">{nf(lista.length)} de {nf(linhas.length)} campo(s) diferem do padrão</span>
      </div>
      <div className="overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
          <th className="px-3 py-2 text-left font-medium"><button type="button" onClick={() => setAsc(!asc)} className="inline-flex items-center gap-1">Campo{asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}</button></th>
          <th className="px-3 py-2 text-left font-medium">Padrão</th><th className="px-3 py-2 text-left font-medium">Esta plataforma</th></tr></thead>
          <tbody>{lista.map((l) => <tr key={l.path} className="border-t"><td className="px-3 py-1.5">{l.rotulo}<div className="font-mono text-[11px] text-muted-foreground">{l.path}</div></td><td className="px-3 py-1.5 text-muted-foreground">{l.padrao}</td><td className="px-3 py-1.5 font-medium">{l.vigente}</td></tr>)}
            {!lista.length && <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">{linhas.length ? 'Nenhum campo para o filtro.' : 'Esta plataforma usa exatamente o padrão.'}</td></tr>}</tbody></table>
      </div>
    </div>
  )
}
