'use client'

// PAINEL LATERAL (Sheet) de EDIÇÃO das regras — para UMA célula (com "por quê") ou para um LOTE de células.
// Abas sublinhadas: Por quê · Disponibilidade · Visibilidade · Exceção · Remover · Colar.
// Fluxo à prova de erro: montar a regra -> "Ver prévia" (N itens × M públicos, quantas regras serão substituídas, o que será ignorado)
// -> "Confirmar e aplicar" -> relatório por público/operação (ok/erro). Tudo no servidor (regras-edicao-actions.ts).

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CircleCheck, CircleX, ClipboardPaste, Copy, ExternalLink, Info, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Pilula } from '@/app/admin/revisao/_comp/lista'
import { cn } from '@/lib/utils'
import {
  CRONOGRAMA_COM_PLANO, CRONOGRAMA_SEM_PLANO, DIAS_SEMANA, DISPONIBILIDADE_ANTES, DISPONIBILIDADE_OPCOES, resumoDisponibilidade,
  type CronogramaComPlano, type CronogramaSemPlano, type Disponibilidade, type DisponibilidadeTipo,
} from '@/lib/produtos/curriculo'
import { CAMADAS_INFO, EFEITO_ROTULO, hrefLiberacaoAulas, hrefProduto, type CelulaMatriz, type LinhaMatriz, type PublicoCol } from '@/lib/produtos/mapa-regras-tipos'
import { chaveCelula } from '@/lib/produtos/matriz-util'
import { aplicarRegrasLoteAction, lerEstadoCelulaAction, previaRegrasLoteAction } from './regras-edicao-actions'
import type { EstadoCelula, ModoVisibilidade, OperacaoRegra, ParPublico, ResultadoLote } from './regras-edicao-tipos'

export type AbaPainel = 'porque' | 'disponibilidade' | 'visibilidade' | 'visibilidade-liberar' | 'visibilidade-ocultar' | 'visibilidade-cadeado' | 'excecao' | 'remover' | 'colar'
export interface PedidoPainel { aba: AbaPainel; pares: ParPublico[]; unica: { linha: LinhaMatriz; pub: PublicoCol; c: CelulaMatriz } | null }
export interface RegraCopiada { operacoes: OperacaoRegra[]; rotulo: string }

const campo = 'h-9 w-full rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
const TIPO_EFEITO = { liberado: 'ok', cadeado: 'warn', oculto: 'mut', bloqueado: 'bad' } as const
const hoje = () => new Date().toISOString().slice(0, 10)

/** Lê o estado editável da célula e o transforma em operações "coláveis". */
export async function copiarRegraDaCelula(produtoId: string, alvoId: string, publico: string): Promise<RegraCopiada | null> {
  const r = await lerEstadoCelulaAction(produtoId, alvoId, publico).catch(() => null)
  if (!r || !('ok' in r)) { toast.error(r && 'error' in r ? r.error : 'Não foi possível ler a regra.'); return null }
  const e = r.estado
  const ops: OperacaoRegra[] = []; const partes: string[] = []
  if (e.disp) { ops.push({ tipo: 'disponibilidade', disponibilidade: e.disp }); partes.push(resumoDisponibilidade(e.disp)) }
  if (e.visibilidade !== 'liberar') { ops.push({ tipo: 'visibilidade', modo: e.visibilidade }); partes.push(e.visibilidade === 'mostrar' ? 'só este público vê' : e.visibilidade === 'ocultar' ? 'oculto' : 'cadeado') }
  if (e.excecao) { ops.push({ tipo: 'excecao', acao: e.excecao.acao, motivo: e.excecao.motivo, validade: e.excecao.validade && e.excecao.validade >= hoje() ? e.excecao.validade : '' }); partes.push(`exceção: ${e.excecao.acao}`) }
  if (!ops.length) { toast.message('Esta célula não tem regra própria para copiar (vale o padrão).'); return null }
  return { operacoes: ops, rotulo: partes.join(' · ') }
}

export function PainelEdicaoRegras({ produtoId, podeEditar, pedido, copiada, nomes, titulosAlvos, onFechar, onCopiar, onAplicado }: {
  produtoId: string; podeEditar: boolean; pedido: PedidoPainel; copiada: RegraCopiada | null
  nomes: Record<string, string>; titulosAlvos: Record<string, string>
  onFechar: () => void; onCopiar: (c: RegraCopiada) => void; onAplicado: (celulasAfetadas: string[]) => void
}) {
  const { unica } = pedido
  const lote = !unica
  type Tab = 'porque' | 'disponibilidade' | 'visibilidade' | 'excecao' | 'remover' | 'colar'
  const tabInicial: Tab = pedido.aba.startsWith('visibilidade') ? 'visibilidade' : (pedido.aba as Tab)
  const [tab, setTab] = useState<Tab>(tabInicial === 'porque' && !unica ? 'disponibilidade' : tabInicial)

  const nAlvos = useMemo(() => new Set(pedido.pares.flatMap((p) => p.alvos)).size, [pedido])
  const nPares = useMemo(() => pedido.pares.reduce((s, p) => s + p.alvos.length, 0), [pedido])
  const temGrupo = pedido.pares.some((p) => p.publico.startsWith('grupo:'))
  const soTodos = pedido.pares.every((p) => p.publico === 'todos')

  // ── estado atual (célula única) ──
  const [estado, setEstado] = useState<EstadoCelula | null>(null)
  const [lendo, setLendo] = useState(false)
  useEffect(() => {
    if (!unica) return
    setLendo(true)
    lerEstadoCelulaAction(produtoId, unica.linha.alvoId, unica.pub.chave)
      .then((r) => { if ('ok' in r) setEstado(r.estado) })
      .catch(() => undefined).finally(() => setLendo(false))
  }, [produtoId, unica])

  // ── formulários ──
  const [tipoDisp, setTipoDisp] = useState<DisponibilidadeTipo>('na_matricula')
  const [data, setData] = useState(''); const [dias, setDias] = useState<number | ''>(7); const [diaSemana, setDiaSemana] = useState(1)
  const [antes, setAntes] = useState<'bloqueado_cadeado' | 'oculto'>('bloqueado_cadeado')
  const [semPlano, setSemPlano] = useState<CronogramaSemPlano>('planilha'); const [comPlano, setComPlano] = useState<CronogramaComPlano>('concluir_meta'); const [diasAntes, setDiasAntes] = useState<number | ''>(0)
  const [prioridade, setPrioridade] = useState<number | ''>(0)
  const [modoVis, setModoVis] = useState<ModoVisibilidade>(pedido.aba === 'visibilidade-ocultar' ? 'ocultar' : pedido.aba === 'visibilidade-cadeado' ? 'cadeado' : 'liberar')
  const [outrosVeem, setOutrosVeem] = useState<'oculto' | 'bloqueado_cadeado'>('oculto')
  const [acaoExc, setAcaoExc] = useState<'liberar' | 'bloquear'>('liberar'); const [motivo, setMotivo] = useState(''); const [validade, setValidade] = useState('')
  const [camadas, setCamadas] = useState<Set<'disponibilidade' | 'visibilidade' | 'excecao'>>(new Set())

  // pré-preenche com o que vale hoje (célula única)
  useEffect(() => {
    if (!estado) return
    const d = estado.disp
    if (d) {
      setTipoDisp(d.tipo); setAntes(d.antes === 'oculto' ? 'oculto' : 'bloqueado_cadeado')
      if (d.data) setData(d.data.slice(0, 10))
      if (d.dias != null) setDias(d.dias)
      if (d.diaSemana != null) setDiaSemana(d.diaSemana)
      if (d.tipo === 'cronograma') { setSemPlano(d.sem_plano ?? 'planilha'); setComPlano(d.com_plano ?? 'concluir_meta'); setDiasAntes(d.dias_antes ?? 0) }
    }
    if (pedido.aba === 'visibilidade' || pedido.aba === 'porque') setModoVis(estado.visibilidade)
    if (estado.excecao) { setAcaoExc(estado.excecao.acao); setMotivo(estado.excecao.motivo); setValidade(estado.excecao.validade >= hoje() ? estado.excecao.validade : '') }
    const c = new Set<'disponibilidade' | 'visibilidade' | 'excecao'>()
    if (estado.disp && estado.dispOrigem) c.add('disponibilidade'); if (estado.visibilidade !== 'liberar') c.add('visibilidade'); if (estado.excecao) c.add('excecao')
    setCamadas(c)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado])

  const temData = tipoDisp === 'data' || tipoDisp === 'data_e_intervalo'
  const temDias = tipoDisp === 'intervalo' || tipoDisp === 'data_e_intervalo' || tipoDisp === 'dia_semana_e_intervalo'
  const dispMontada: Disponibilidade | string = useMemo(() => {
    if (tipoDisp === 'cronograma') return { tipo: 'cronograma', sem_plano: semPlano, com_plano: comPlano, dias_antes: Number(diasAntes) || 0, antes: 'bloqueado_cadeado' }
    if (temData && !data) return 'Informe a data.'
    return {
      tipo: tipoDisp, antes, data: temData && data ? new Date(`${data}T00:00:00-03:00`).toISOString() : null,
      dias: temDias ? Number(dias) || 0 : null, diaSemana: tipoDisp === 'dia_semana_e_intervalo' ? diaSemana : null,
    }
  }, [tipoDisp, semPlano, comPlano, diasAntes, temData, data, antes, temDias, dias, diaSemana])

  const { op, erroForm } = useMemo((): { op: OperacaoRegra[] | null; erroForm: string | null } => {
    if (tab === 'disponibilidade') return typeof dispMontada === 'string' ? { op: null, erroForm: dispMontada } : { op: [{ tipo: 'disponibilidade', disponibilidade: dispMontada, prioridade: Number(prioridade) || 0 }], erroForm: null }
    if (tab === 'visibilidade') return soTodos ? { op: null, erroForm: 'Visibilidade vale para grupo ou segmento — a coluna "Todos" não tem público.' } : { op: [{ tipo: 'visibilidade', modo: modoVis, semAcesso: outrosVeem }], erroForm: null }
    if (tab === 'excecao') return !temGrupo ? { op: null, erroForm: 'Exceção vale para colunas de GRUPO. Selecione células de um grupo.' } : { op: [{ tipo: 'excecao', acao: acaoExc, motivo: motivo.trim(), validade }], erroForm: null }
    if (tab === 'remover') return camadas.size ? { op: [{ tipo: 'remover', camadas: [...camadas] }], erroForm: null } : { op: null, erroForm: 'Marque o que remover.' }
    if (tab === 'colar') return copiada ? { op: copiada.operacoes, erroForm: null } : { op: null, erroForm: 'Nenhuma regra copiada.' }
    return { op: null, erroForm: null }
  }, [tab, dispMontada, prioridade, soTodos, modoVis, outrosVeem, temGrupo, acaoExc, motivo, validade, camadas, copiada])

  // ── prévia / aplicar ──
  const [busy, setBusy] = useState(false)
  const [previa, setPrevia] = useState<ResultadoLote | null>(null)
  const [relatorio, setRelatorio] = useState<ResultadoLote | null>(null)
  const assinatura = JSON.stringify([op, tab])
  useEffect(() => { setPrevia(null) }, [assinatura])

  async function verPrevia() {
    if (!op) return
    setBusy(true)
    const r = await previaRegrasLoteAction(produtoId, { pares: pedido.pares, operacoes: op }).catch(() => ({ error: 'Falha de rede.' }) as { error: string })
    setBusy(false)
    if (!('ok' in r)) { toast.error(r.error); return }
    setPrevia(r.resultado)
  }
  async function aplicar() {
    if (!op) return
    setBusy(true)
    const r = await aplicarRegrasLoteAction(produtoId, { pares: pedido.pares, operacoes: op }).catch(() => ({ error: 'Falha de rede.' }) as { error: string })
    setBusy(false)
    if (!('ok' in r)) { toast.error(r.error); return }
    setRelatorio(r.resultado)
    r.resultado.erros ? toast.warning(`Aplicado com ${r.resultado.erros} aviso(s)/erro(s). Veja o relatório.`) : toast.success(`Regra aplicada: ${r.resultado.pares} célula(s) em ${r.resultado.publicos} público(s).`)
    onAplicado(pedido.pares.flatMap((p) => p.alvos.map((a) => chaveCelula(a, p.publico))))
  }

  const abas: Array<[Tab, string]> = [
    ...(unica ? [['porque', 'Por quê'] as [Tab, string]] : []),
    ...(podeEditar ? ([['disponibilidade', 'Disponibilidade'], ['visibilidade', 'Visibilidade'], ['excecao', 'Exceção'], ['remover', 'Remover']] as Array<[Tab, string]>) : []),
    ...(podeEditar && copiada ? [['colar', 'Colar'] as [Tab, string]] : []),
  ]
  const hrefTela = tab === 'disponibilidade' ? hrefProduto(produtoId, 'conteudos') : tab === 'visibilidade' ? hrefProduto(produtoId, 'visibilidade') : tab === 'excecao' ? hrefLiberacaoAulas(produtoId, 'excecoes') : unica?.c.href ?? hrefProduto(produtoId, 'conteudos')

  const titulo = unica ? unica.linha.titulo : `Editar ${nPares.toLocaleString('pt-BR')} célula(s)`
  const desc = unica ? `${unica.pub.nome} · ${unica.linha.alvoTipo === 'modulo' ? 'Módulo' : 'Aula'}` : `${nAlvos} módulo(s)/aula(s) × ${pedido.pares.length} público(s)`

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onFechar() }}>
      <SheetContent className="w-full gap-0 p-0 data-[side=right]:sm:max-w-xl">
        <SheetHeader className="border-b pr-12">
          <SheetTitle className="truncate">{titulo}</SheetTitle>
          <SheetDescription className="truncate">{desc}</SheetDescription>
          {lote && <p className="truncate text-xs text-muted-foreground" title={pedido.pares.map((p) => nomes[p.publico] ?? p.publico).join(', ')}>Públicos: {pedido.pares.slice(0, 4).map((p) => nomes[p.publico] ?? p.publico).join(', ')}{pedido.pares.length > 4 ? ` +${pedido.pares.length - 4}` : ''}</p>}
        </SheetHeader>

        <div role="tablist" aria-label="Edição" className="flex gap-4 overflow-x-auto border-b px-4">
          {abas.map(([k, rot]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setRelatorio(null) }}
              className={cn('-mb-px shrink-0 border-b-2 px-1 pb-2.5 pt-2 text-sm font-medium transition-colors', tab === k ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>{rot}</button>
          ))}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {relatorio ? <Relatorio r={relatorio} /> : (
            <>
              {tab === 'porque' && unica && (
                <div className="space-y-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pilula tipo={TIPO_EFEITO[unica.c.efeito]}>{unica.c.rotulo || EFEITO_ROTULO[unica.c.efeito]}</Pilula>
                    <Pilula tipo="vio">{unica.c.camada === 'base' ? 'Sem regra (padrão)' : CAMADAS_INFO[unica.c.camada].rotulo}</Pilula>
                  </div>
                  <p>{unica.c.porque}</p>
                  <p className="text-xs text-muted-foreground">Origem: {unica.c.origem}. {unica.c.camada !== 'base' && CAMADAS_INFO[unica.c.camada].desc}</p>
                  {lendo ? <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Lendo a regra própria…</p> : estado && (
                    <dl className="grid gap-1.5 rounded-xl border bg-muted/30 p-3 text-xs">
                      <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Disponibilidade própria</dt><dd className="text-right font-medium">{estado.disp ? `${resumoDisponibilidade(estado.disp)}${estado.dispOrigem === 'base' ? ' (base)' : ''}` : 'nenhuma — vale o padrão'}</dd></div>
                      <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Visibilidade</dt><dd className="font-medium">{estado.visibilidade === 'liberar' ? 'sem restrição' : estado.visibilidade === 'mostrar' ? 'somente este público vê' : estado.visibilidade === 'ocultar' ? 'oculto' : 'cadeado'}</dd></div>
                      <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Exceção</dt><dd className="font-medium">{estado.excecao ? `${estado.excecao.acao}${estado.excecao.motivo ? ` — ${estado.excecao.motivo}` : ''}${estado.excecao.validade ? ` (até ${estado.excecao.validade.split('-').reverse().join('/')})` : ''}` : 'nenhuma'}</dd></div>
                    </dl>
                  )}
                  {podeEditar && <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setTab('disponibilidade')}>Editar disponibilidade</Button>
                    <Button size="sm" variant="outline" onClick={() => setTab('visibilidade')}>Editar visibilidade</Button>
                    <Button size="sm" variant="outline" onClick={async () => { const c = await copiarRegraDaCelula(produtoId, unica.linha.alvoId, unica.pub.chave); if (c) onCopiar(c) }}><Copy className="h-4 w-4" />Copiar regra</Button>
                  </div>}
                </div>
              )}

              {tab === 'disponibilidade' && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">{soTodos ? 'Quando fica disponível para TODOS os alunos (disponibilidade base do módulo/aula).' : 'Quando fica disponível para este público. Substitui a disponibilidade base e a regra anterior do mesmo público.'}</p>
                  <div className="space-y-2">
                    {[...DISPONIBILIDADE_OPCOES, { v: 'cronograma' as DisponibilidadeTipo, titulo: 'Pelo cronograma de referência', descricao: 'Abre pela planilha/cronograma e pelo plano do aluno.' }].map((o) => (
                      <label key={o.v} className={cn('flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2', tipoDisp === o.v && 'border-primary bg-primary/5')}>
                        <input type="radio" name="disp" checked={tipoDisp === o.v} onChange={() => setTipoDisp(o.v)} className="mt-0.5 h-4 w-4 accent-[var(--primary)]" />
                        <span><span className="block text-sm font-medium">{o.titulo}</span><span className="block text-xs text-muted-foreground">{o.descricao}</span></span>
                      </label>
                    ))}
                  </div>
                  {(temData || temDias) && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {temData && <label className="block text-sm"><span className="mb-1 block font-medium">Data</span><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></label>}
                      {tipoDisp === 'dia_semana_e_intervalo' && <label className="block text-sm"><span className="mb-1 block font-medium">Dia da semana</span><select value={diaSemana} onChange={(e) => setDiaSemana(Number(e.target.value))} className={campo}>{DIAS_SEMANA.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></label>}
                      {temDias && <label className="block text-sm"><span className="mb-1 block font-medium">Dias após a matrícula</span><Input type="number" min={0} value={dias} onChange={(e) => setDias(e.target.value === '' ? '' : Number(e.target.value))} /></label>}
                      <label className="block text-sm"><span className="mb-1 block font-medium">Antes de liberar, o aluno vê</span><select value={antes} onChange={(e) => setAntes(e.target.value as 'oculto' | 'bloqueado_cadeado')} className={campo}>{DISPONIBILIDADE_ANTES.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}</select></label>
                    </div>
                  )}
                  {tipoDisp === 'cronograma' && (
                    <div className="grid gap-3">
                      <label className="block text-sm"><span className="mb-1 block font-medium">Aluno SEM cronograma fixado</span><select value={semPlano} onChange={(e) => setSemPlano(e.target.value as CronogramaSemPlano)} className={campo}>{CRONOGRAMA_SEM_PLANO.map((o) => <option key={o.v} value={o.v}>{o.titulo}</option>)}</select></label>
                      <label className="block text-sm"><span className="mb-1 block font-medium">Aluno COM cronograma fixado</span><select value={comPlano} onChange={(e) => setComPlano(e.target.value as CronogramaComPlano)} className={campo}>{CRONOGRAMA_COM_PLANO.map((o) => <option key={o.v} value={o.v}>{o.titulo}</option>)}</select></label>
                      {comPlano !== 'concluir_meta' && <label className="block text-sm"><span className="mb-1 block font-medium">Dias de antecedência</span><Input type="number" min={0} max={365} value={diasAntes} onChange={(e) => setDiasAntes(e.target.value === '' ? '' : Number(e.target.value))} /></label>}
                    </div>
                  )}
                  {!soTodos && <label className="block text-sm"><span className="mb-1 block font-medium">Prioridade <span className="font-normal text-muted-foreground">(menor vence quando o aluno está em mais de um público)</span></span><Input type="number" min={0} max={999} value={prioridade} onChange={(e) => setPrioridade(e.target.value === '' ? '' : Number(e.target.value))} className="w-28" /></label>}
                  <div className="flex items-start gap-1.5 rounded-xl bg-primary/5 px-3 py-2 text-xs text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{typeof dispMontada === 'string' ? dispMontada : resumoDisponibilidade(dispMontada)}</div>
                </div>
              )}

              {tab === 'visibilidade' && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Como este público enxerga o módulo/aula. Vale para colunas de grupo e segmento.</p>
                  {([
                    ['liberar', 'Sem restrição', 'Remove a regra de visibilidade deste público (volta ao normal).'],
                    ['mostrar', 'Somente este público vê', 'Quem não está neste público deixa de ver (escolha abaixo o que os demais veem).'],
                    ['ocultar', 'Ocultar para este público', 'O módulo/aula some para quem está neste público.'],
                    ['cadeado', 'Mostrar com cadeado para este público', 'Aparece, mas bloqueado, para quem está neste público.'],
                  ] as Array<[ModoVisibilidade, string, string]>).map(([v, t, d]) => (
                    <label key={v} className={cn('flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2', modoVis === v && 'border-primary bg-primary/5')}>
                      <input type="radio" name="vis" checked={modoVis === v} onChange={() => setModoVis(v)} className="mt-0.5 h-4 w-4 accent-[var(--primary)]" />
                      <span><span className="block text-sm font-medium">{t}</span><span className="block text-xs text-muted-foreground">{d}</span></span>
                    </label>
                  ))}
                  {modoVis === 'mostrar' && <label className="block text-sm"><span className="mb-1 block font-medium">Os demais veem</span><select value={outrosVeem} onChange={(e) => setOutrosVeem(e.target.value as 'oculto' | 'bloqueado_cadeado')} className={campo}><option value="oculto">Nada (o item some)</option><option value="bloqueado_cadeado">O item com cadeado</option></select></label>}
                </div>
              )}

              {tab === 'excecao' && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Exceção MANUAL para o grupo: libera ou bloqueia o módulo/aula (vale também para as aulas dentro). Vence o cronograma, mas não derruba um bloqueio por segmento.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(['liberar', 'bloquear'] as const).map((a) => (
                      <label key={a} className={cn('flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium', acaoExc === a && 'border-primary bg-primary/5')}>
                        <input type="radio" name="exc" checked={acaoExc === a} onChange={() => setAcaoExc(a)} className="h-4 w-4 accent-[var(--primary)]" />{a === 'liberar' ? 'Liberar' : 'Bloquear'}
                      </label>
                    ))}
                  </div>
                  <label className="block text-sm"><span className="mb-1 block font-medium">Motivo <span className="font-normal text-muted-foreground">(opcional)</span></span><Input value={motivo} maxLength={500} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: turma piloto, reposição…" /></label>
                  <label className="block text-sm"><span className="mb-1 block font-medium">Expira em <span className="font-normal text-muted-foreground">(vazio = sem validade)</span></span><Input type="date" min={hoje()} value={validade} onChange={(e) => setValidade(e.target.value)} className="w-44" /></label>
                  {!temGrupo && <p className="flex items-start gap-1.5 text-xs text-destructive"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Nenhuma coluna de grupo na seleção. Para exceção de um aluno específico use “Abrir na tela completa”.</p>}
                </div>
              )}

              {tab === 'remover' && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Remove as regras PRÓPRIAS deste público (o padrão do módulo/aula e as regras de outros públicos não mudam).</p>
                  {([
                    ['disponibilidade', 'Disponibilidade', soTodos ? 'Volta a disponibilidade base ao padrão (liberado na matrícula).' : 'Remove a liberação própria do grupo/segmento.'],
                    ['visibilidade', 'Visibilidade', 'Remove mostrar/ocultar/cadeado do grupo/segmento.'],
                    ['excecao', 'Exceções do grupo', 'Exclui as exceções de liberar/bloquear do grupo.'],
                  ] as Array<['disponibilidade' | 'visibilidade' | 'excecao', string, string]>).map(([k, t, d]) => (
                    <label key={k} className={cn('flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2', camadas.has(k) && 'border-destructive/50 bg-destructive/5')}>
                      <input type="checkbox" checked={camadas.has(k)} onChange={(e) => setCamadas((s) => { const n = new Set(s); e.target.checked ? n.add(k) : n.delete(k); return n })} className="mt-0.5 h-4 w-4" />
                      <span><span className="block text-sm font-medium">{t}</span><span className="block text-xs text-muted-foreground">{d}</span></span>
                    </label>
                  ))}
                </div>
              )}

              {tab === 'colar' && copiada && (
                <div className="space-y-2 text-sm">
                  <p className="flex items-center gap-2 font-medium"><ClipboardPaste className="h-4 w-4" />Regra copiada</p>
                  <p className="rounded-xl border bg-muted/30 px-3 py-2">{copiada.rotulo}</p>
                  <p className="text-xs text-muted-foreground">Será aplicada a todas as células selecionadas (a visibilidade e a exceção só valem onde o público permite — o resto é ignorado e aparece na prévia).</p>
                </div>
              )}

              {erroForm && tab !== 'porque' && <p className="flex items-start gap-1.5 text-xs text-destructive"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{erroForm}</p>}
              {previa && <Relatorio r={previa} previa />}
              {tab !== 'porque' && <Link href={hrefTela} onClick={onFechar} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"><ExternalLink className="h-3.5 w-3.5" />Abrir na tela completa</Link>}
              {tab === 'porque' && unica?.c.href && <Link href={unica.c.href} onClick={onFechar} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"><ExternalLink className="h-3.5 w-3.5" />Abrir na tela completa</Link>}
              {lote && nAlvos > 0 && <p className="text-xs text-muted-foreground">{Object.keys(titulosAlvos).length ? `Ex.: ${[...new Set(pedido.pares.flatMap((p) => p.alvos))].slice(0, 3).map((a) => titulosAlvos[a] ?? '…').join(' · ')}${nAlvos > 3 ? ` +${nAlvos - 3}` : ''}` : ''}</p>}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t p-3">
          {relatorio ? <Button onClick={onFechar}>Fechar</Button> : (
            <>
              <Button variant="ghost" onClick={onFechar} disabled={busy}>Cancelar</Button>
              {tab !== 'porque' && podeEditar && (previa
                ? <Button onClick={() => void aplicar()} disabled={busy || !op || previa.ok === 0}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Confirmar e aplicar{previa.ok ? ` (${previa.pares})` : ''}</Button>
                : <Button onClick={() => void verPrevia()} disabled={busy || !op}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Ver prévia</Button>)}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Relatorio({ r, previa }: { r: ResultadoLote; previa?: boolean }) {
  const substitui = r.itens.reduce((s, i) => s + (i.ok ? i.substitui : 0), 0)
  return (
    <section className="rounded-xl border bg-muted/20 p-3" aria-label={previa ? 'Prévia do efeito' : 'Relatório'}>
      <h4 className="text-sm font-semibold">{previa ? 'Prévia do efeito' : 'Resultado'}</h4>
      <p className="mt-1 text-sm">
        <b>{r.alvos}</b> módulo(s)/aula(s) × <b>{r.publicos}</b> público(s) {previa ? 'serão afetados' : 'processados'} · {previa ? 'substitui/remove' : 'substituídas/removidas'} <b>{substitui}</b> regra(s) existente(s).
        {r.erros > 0 && <span className="text-destructive"> {r.erros} item(ns) {previa ? 'serão ignorados' : 'com aviso/erro'}.</span>}
      </p>
      {r.avisos.map((a) => <p key={a} className="mt-1 text-xs text-muted-foreground">{a}</p>)}
      <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto">
        {r.itens.map((i, k) => (
          <li key={k} className="flex items-start gap-2 rounded-lg bg-background px-2 py-1.5 text-xs">
            {i.ok ? <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" /> : <CircleX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />}
            <span className="min-w-0"><b>{i.publicoNome}</b> · {i.operacao}<span className="block text-muted-foreground">{i.mensagem}</span></span>
          </li>
        ))}
      </ul>
    </section>
  )
}
