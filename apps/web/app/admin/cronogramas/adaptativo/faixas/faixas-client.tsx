'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Loader2, RotateCcw, Save, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { confirmar } from '@/components/ui/confirm-dialog'
import { deltaDoPadrao } from '@/lib/cronograma/adaptativo/regras'
import { validarRegras } from '@/lib/cronograma/adaptativo/regras-validacao'
import { CHAVE_RASCUNHO, GRUPOS_CAMPOS, TODOS_CAMPOS, rotuloDoCaminho, diffRegras, formatarValor, gravarCaminho, lerCaminho, textoParaValor, valorParaTexto, type CampoRegra } from '@/lib/cronograma/adaptativo/regras-campos'
import { validarFaixas, type FaixaCarga } from '@/lib/cronograma/adaptativo/faixas-carga'
import { rotuloDiffFaixa } from '@/lib/cronograma/adaptativo/faixas-editor'
import { restaurarPadrao } from '../regras-actions'
import { salvarRegrasComTrava } from '../inteligencia-actions'
import { FaixasEditorVisual } from './faixas-editor-visual'
import { MatrizOverrides } from './matriz-overrides'
import type { RegistroRegras } from '../regras-actions-tipos'

export function FaixasClient({ registro, podeEditar }: { registro: RegistroRegras; podeEditar: boolean }) {
  const [vigente, setVigente] = useState(registro.regras)
  const [versao, setVersao] = useState(registro.versao)
  const [draft, setDraft] = useState(registro.regras)
  const [txt, setTxt] = useState<Record<string, string>>({})
  const [busca, setBusca] = useState('')
  const [apenasAlterados, setApenasAlterados] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [pend, start] = useTransition()
  const [conflito, setConflito] = useState(false)
  const padrao = registro.padrao

  const validacao = useMemo(() => validarRegras(draft), [draft])
  const errosFaixas = useMemo(() => validarFaixas(draft.faixas), [draft.faixas])
  const erros = useMemo(() => [...errosFaixas, ...(validacao.ok ? [] : validacao.erros.filter((e) => !errosFaixas.includes(e)))], [errosFaixas, validacao])
  const difs = useMemo(() => diffRegras(vigente, draft), [vigente, draft])
  const rotuloCampo = (p: string) => TODOS_CAMPOS.find((c) => c.path === p)?.rotulo
  const nomeFaixa = (k: number) => draft.faixas[k]?.nome || vigente.faixas[k]?.nome || `Faixa ${k + 1}`
  const sujo = difs.length > 0
  const nVsPadrao = useMemo(() => Object.keys(deltaDoPadrao(draft)).length, [draft])

  useEffect(() => {
    try { if (sujo) sessionStorage.setItem(CHAVE_RASCUNHO, JSON.stringify(draft)); else sessionStorage.removeItem(CHAVE_RASCUNHO) } catch { /* sem storage */ }
  }, [draft, sujo])
  useEffect(() => {
    if (!sujo) return
    const f = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', f)
    return () => window.removeEventListener('beforeunload', f)
  }, [sujo])

  const mudar = (c: CampoRegra, t: string) => {
    setTxt((o) => ({ ...o, [c.path]: t }))
    setDraft((d) => gravarCaminho(d, c.path, textoParaValor(c, t)))
  }
  const mudarFaixas = (f: FaixaCarga[]) => setDraft((d) => ({ ...d, faixas: f }))
  const sobrescrever = (r: typeof draft) => { setDraft(r); setTxt({}) }

  const salvar = () => start(async () => {
    if (!validacao.ok) { toast.error(erros[0] ?? 'Há campos inválidos.'); return }
    let r = await salvarRegrasComTrava(draft, versao, motivo, false)
    if (!r.ok && r.exigeConfirmacao) {
      const s = r.resumo
      const ok = await confirmar({
        titulo: 'Risco detectado na amostra de planos',
        mensagem: `Na amostra de ${s.planos} plano(s): ${s.totalDivergentes} meta(s) concluída(s) divergente(s) e ${s.novosErros} plano(s) que passam a falhar na geração. Salvar mesmo assim? Planos já gravados não mudam.`,
        confirmar: 'Salvar mesmo assim', destrutivo: true,
      })
      if (!ok) return
      r = await salvarRegrasComTrava(draft, versao, motivo, true)
    }
    if (!r.ok) { setConflito(!!r.conflito); toast.error(r.error ?? 'Falha ao salvar.'); return }
    setConflito(false); setVersao(r.versao); setVigente(draft); setMotivo(''); setTxt({})
    toast.success(`Regras salvas (versão ${r.versao}). Valem para planos gerados a partir de agora.`)
  })
  const restaurar = async () => {
    if (!(await confirmar({ titulo: 'Restaurar o padrão', mensagem: 'Todas as regras personalizadas voltam ao padrão (a versão atual fica no histórico). Planos já gravados não mudam. Continuar?', confirmar: 'Restaurar padrão', destrutivo: true }))) return
    start(async () => {
      const r = await restaurarPadrao(versao)
      if (!r.ok) { setConflito(!!r.conflito); toast.error(r.error ?? 'Falha ao restaurar.'); return }
      setConflito(false); setVersao(r.dados!.versao); setVigente(padrao); sobrescrever(padrao)
      toast.success('Padrão restaurado.')
    })
  }

  const b = busca.trim().toLowerCase()
  const visiveis = (c: CampoRegra) => (!b || c.rotulo.toLowerCase().includes(b) || c.path.toLowerCase().includes(b)) && (!apenasAlterados || JSON.stringify(lerCaminho(draft, c.path)) !== JSON.stringify(lerCaminho(padrao, c.path)))
  const todos = GRUPOS_CAMPOS.map((g) => ({ g, campos: g.campos.filter(visiveis) })).filter((x) => x.campos.length)
  const grupos = todos.filter((x) => x.g.id !== 'constantes')
  const constantes = todos.find((x) => x.g.id === 'constantes')

  const cartaoGrupo = ({ g, campos }: { g: (typeof GRUPOS_CAMPOS)[number]; campos: CampoRegra[] }) => (
          <section key={g.id} className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <div>
              <h2 className="font-semibold">{g.titulo}</h2>
              <p className="text-xs text-muted-foreground">{g.descricao}</p>
            </div>
            <div className="space-y-3">
              {campos.map((c) => {
                const v = lerCaminho(draft, c.path), p = lerCaminho(padrao, c.path)
                const dif = JSON.stringify(v) !== JSON.stringify(p)
                const emVigor = JSON.stringify(v) !== JSON.stringify(lerCaminho(vigente, c.path))
                return (
                  <div key={c.path} className={cn('rounded-xl border p-2.5', dif ? 'border-primary/40 bg-primary/5' : 'border-transparent bg-muted/20')}>
                    <label className="flex items-center justify-between gap-3 text-sm">
                      <span>{c.rotulo}{emVigor && <span className="ml-1 text-xs font-semibold text-primary">(não salvo)</span>}</span>
                      {c.tipo === 'bool' ? (
                        <input type="checkbox" disabled={!podeEditar} checked={v === true} onChange={(e) => mudar(c, String(e.target.checked))} className="h-4 w-4" />
                      ) : (
                        <span className="flex items-center gap-1">
                          <input disabled={!podeEditar} inputMode={c.tipo === 'lista' ? 'text' : 'decimal'} value={txt[c.path] ?? valorParaTexto(v)} onChange={(e) => mudar(c, e.target.value)}
                            className={cn('h-8 rounded-lg border bg-background px-2 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring disabled:opacity-60', c.tipo === 'lista' ? 'w-28' : 'w-20')} />
                          {c.sufixo && <span className="w-7 text-xs text-muted-foreground">{c.sufixo}</span>}
                        </span>
                      )}
                    </label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Padrão: <b>{formatarValor(p)}</b>{c.sufixo ? ` ${c.sufixo}` : ''}{c.min != null && c.max != null && c.tipo !== 'bool' ? ` · faixa ${c.min}–${c.max}` : ''}{c.dica ? ` · ${c.dica}` : ''}
                    </p>
                  </div>
                )
              })}
            </div>
          </section>
        )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar regra (ex.: teto, questões, juris)" className="h-9 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={apenasAlterados} onChange={(e) => setApenasAlterados(e.target.checked)} /> Só o que difere do padrão</label>
        <span className="text-xs text-muted-foreground">Versão {versao || 'padrão'} · {nVsPadrao ? `${nVsPadrao} grupo(s) diferem do padrão` : 'comportamento padrão'}</span>
      </div>

      {conflito && <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">Outra pessoa salvou regras depois que você abriu esta tela. Recarregue a página para ver a versão atual (seu rascunho local será perdido).</div>}
      {erros.length > errosFaixas.length && (
        <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <p className="font-semibold">Corrija antes de salvar:</p>
          <ul className="list-disc pl-5">{erros.slice(errosFaixas.length, errosFaixas.length + 6).map((e, k) => <li key={k}>{e}</li>)}</ul>
        </div>
      )}

      <FaixasEditorVisual regras={draft} podeEditar={podeEditar} onChange={mudarFaixas} />
      <MatrizOverrides regras={draft} podeEditar={podeEditar} onChange={mudarFaixas} />

      <h2 className="pt-2 text-sm font-semibold">Parâmetros globais</h2>

      {grupos.length === 0 && <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhuma regra encontrada com esses filtros.</div>}
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {grupos.map(cartaoGrupo)}
      </div>

      {constantes && (
        <div className="space-y-2">
          <h2 className="pt-2 text-sm font-semibold">Constantes</h2>
          <div className="flex items-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300"><AlertTriangle className="h-4 w-4 shrink-0" /> Altere com cautela; confira na aba Inteligência.</div>
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{cartaoGrupo(constantes)}</div>
        </div>
      )}

      {difs.length > 0 && (
        <details className="rounded-2xl border border-border bg-card p-3 text-sm">
          <summary className="cursor-pointer font-medium">{difs.length} alteração(ões) não salva(s)</summary>
          <ul className="mt-2 space-y-1 text-xs">
            {difs.slice(0, 80).map((d) => <li key={d.path}><b>{rotuloDiffFaixa(d.path, rotuloDoCaminho, rotuloCampo, nomeFaixa)}</b>: {d.de} → {d.para}</li>)}
            {difs.length > 80 && <li className="text-muted-foreground">… e mais {difs.length - 80}.</li>}
          </ul>
        </details>
      )}

      {podeEditar ? (
        <div className="sticky bottom-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} placeholder="Motivo da alteração (opcional, vai para o histórico)" className="h-9 min-w-56 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <button type="button" disabled={pend} onClick={restaurar} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium transition hover:bg-muted disabled:opacity-50">
            <RotateCcw className="h-4 w-4" /> Restaurar padrão
          </button>
          <button type="button" disabled={!sujo || pend} onClick={() => sobrescrever(vigente)} className="h-9 rounded-xl border border-border px-3 text-sm font-medium transition hover:bg-muted disabled:opacity-50">Descartar alterações</button>
          <button type="button" disabled={!sujo || pend || erros.length > 0} onClick={salvar} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
            {pend ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar regras
          </button>
        </div>
      ) : <p className="text-xs text-muted-foreground">Somente leitura: você não tem permissão para editar (cronogramas:update).</p>}
    </div>
  )
}
