'use client'

// "CRIAR PARTES A PARTIR DAS METAS" — painel reutilizável (documento, pasta ou tipo). Backend-first: toda a conta (faixas das metas,
// idempotência, conflitos) vem da rota /api/admin/biblioteca/partes/das-metas; aqui só se exibe a prévia PAGINADA (dry-run) e se dispara
// a aplicação por lote. Rota de API (não server action). Nada é apagado: partes existentes são mantidas (ou arquivadas se "substituir").
//
// Uso: <PartesDasMetasPainel documentoId={id} />  ·  <PartesDasMetasPainel pastaId={id} />  ·  <PartesDasMetasPainel tipo="legproc" podeEditar />

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, ChevronLeft, ChevronRight, ListChecks, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { confirmar } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'

const API = '/api/admin/biblioteca/partes/das-metas'
const LIMITE = 10

type TipoMeta = 'legproc' | 'pdflash' | 'pdfight'
type StatusParte = 'nova' | 'ja_existe' | 'divergente' | 'conflito' | 'criada' | 'falhou'
type ParteDoc = { nome: string; ordem: number; rotuloIni: string | null; rotuloFim: string | null; artigos: number; caracteres: number; status: StatusParte; detalhe?: string }
type DocRes = {
  documentoId: string; titulo: string; disciplina: string; tipo: TipoMeta; fonte: string
  propostas: number; novas: number; jaExistem: number; divergentes: number; conflitos: number; criadas: number; arquivadas: number
  avisos: { codigo: string; mensagem: string }[]; partes: ParteDoc[]
}
type Resumo = { docs: number; propostas: number; novas: number; jaExistem: number; divergentes: number; conflitos: number; criadas: number; arquivadas: number; semParte: number }
type Resposta = {
  ok: boolean; error?: string; dryRun: boolean; totalDocs: number; offset: number; limite: number; proximoOffset: number | null
  docs: DocRes[]; resumo: Resumo; semDivisao?: { mensagem: string }
}

const ROTULO_TIPO: Record<TipoMeta, string> = { legproc: 'LegProc', pdflash: 'PDFlash', pdfight: 'PDFight' }
const ROTULO_FONTE: Record<string, string> = { legproc_auto: 'Corte automático (~30 min)', legproc_modelo: 'Faixas do modelo 2.8', nenhuma: '—' }
const ROTULO_STATUS: Record<StatusParte, { t: string; cls: string }> = {
  nova: { t: 'Nova', cls: 'bg-primary/10 text-primary' },
  criada: { t: 'Criada', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  ja_existe: { t: 'Já existe', cls: 'bg-muted text-muted-foreground' },
  divergente: { t: 'Faixa diferente', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  conflito: { t: 'Conflito', cls: 'bg-destructive/10 text-destructive' },
  falhou: { t: 'Falhou', cls: 'bg-destructive/10 text-destructive' },
}
const fmt = (n: number) => n.toLocaleString('pt-BR')

async function chamar(body: Record<string, unknown>): Promise<Resposta> {
  try {
    const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return (await r.json().catch(() => ({ ok: false, error: 'Resposta inválida.' }))) as Resposta
  } catch {
    return { ok: false, error: 'Falha de rede.' } as Resposta
  }
}

export function PartesDasMetasPainel({ documentoId, pastaId, tipo: tipoInicial = 'legproc', podeEditar = true }: {
  documentoId?: string; pastaId?: string; tipo?: TipoMeta; podeEditar?: boolean
}) {
  const [tipo, setTipo] = useState<TipoMeta>(tipoInicial)
  const [offset, setOffset] = useState(0)
  const [dados, setDados] = useState<Resposta | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [aplicando, setAplicando] = useState<string | null>(null)
  const [substituir, setSubstituir] = useState(false)
  const [aberto, setAberto] = useState<string | null>(null)
  const seq = useRef(0)

  const escopo = useCallback(() => (documentoId ? { documentoId } : pastaId ? { pastaId, tipo } : { tipo }), [documentoId, pastaId, tipo])

  const previa = useCallback(async (off: number) => {
    const id = ++seq.current
    setCarregando(true)
    const r = await chamar({ ...escopo(), dryRun: true, offset: off, limite: LIMITE, substituir })
    if (id !== seq.current) return
    setCarregando(false)
    if (!r.ok) { toast.error(r.error || 'Não foi possível montar a prévia.'); setDados(null); return }
    setDados(r); setOffset(off)
  }, [escopo, substituir])

  useEffect(() => { void previa(0) }, [previa])

  async function aplicar(todos: boolean) {
    if (!dados) return
    const alvo = todos ? `os ${fmt(dados.totalDocs)} documentos` : `os ${dados.docs.length} documentos desta página`
    const ok = await confirmar({
      titulo: 'Criar partes a partir das metas',
      mensagem: `Criar as partes de ${alvo} replicando as faixas que as metas já usam? Partes com o mesmo nome não são duplicadas e nada é apagado${substituir ? '; partes ativas sobrepostas (sem metas usando) serão ARQUIVADAS' : ''}.`,
      confirmar: 'Criar partes',
    })
    if (!ok) return
    let off = todos ? 0 : offset
    let criadas = 0, arquivadas = 0, conflitos = 0, falhas = 0, docs = 0
    for (let guarda = 0; guarda < 2000; guarda++) {
      setAplicando(todos ? `Processando documentos ${fmt(off + 1)}…` : 'Criando partes…')
      const r = await chamar({ ...escopo(), dryRun: false, offset: off, limite: LIMITE, substituir })
      if (!r.ok) { falhas++; toast.error(r.error || 'Falha ao criar as partes.'); break }
      criadas += r.resumo.criadas; arquivadas += r.resumo.arquivadas; conflitos += r.resumo.conflitos; docs += r.resumo.docs
      if (!todos || r.proximoOffset == null) break
      off = r.proximoOffset
    }
    setAplicando(null)
    if (!falhas) toast.success(`${fmt(criadas)} partes criadas em ${fmt(docs)} documentos${arquivadas ? `, ${fmt(arquivadas)} arquivadas` : ''}${conflitos ? `, ${fmt(conflitos)} em conflito (não criadas)` : ''}.`)
    await previa(todos ? 0 : offset)
  }

  const r = dados?.resumo
  const semDivisao = dados?.semDivisao
  const fim = dados ? Math.min(dados.totalDocs, offset + (dados.docs.length || LIMITE)) : 0

  return (
    <section className="rounded-lg border bg-card p-4 space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <ListChecks className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Criar partes a partir das metas</h3>
        </div>
        {!documentoId && (
          <div className="flex gap-1" role="tablist" aria-label="Tipo de conteúdo">
            {(['legproc', 'pdflash', 'pdfight'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tipo === t} onClick={() => { setTipo(t); setOffset(0) }}
                className={cn('px-3 py-1 text-sm border-b-2 -mb-px', tipo === t ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                {ROTULO_TIPO[t]}
              </button>
            ))}
          </div>
        )}
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => previa(offset)} disabled={carregando || !!aplicando}>
          {carregando ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Atualizar prévia
        </Button>
      </header>

      <p className="text-xs text-muted-foreground">
        Prévia (nada é gravado até clicar em criar). As faixas são as <strong>mesmas que as metas usam hoje</strong>: LegProc = artigos por meta de ~30 min
        (ou as faixas do modelo 2.8). PDFlash e PDFight não têm divisão por meta.
      </p>

      {semDivisao && (
        <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm">
          <AlertTriangle className="size-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>{semDivisao.mensagem}</span>
        </div>
      )}

      {r && dados && !semDivisao && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <span><strong>{fmt(dados.totalDocs)}</strong> documentos</span>
          <span>nesta página: <strong>{fmt(r.novas)}</strong> novas · {fmt(r.jaExistem)} já existem · {fmt(r.divergentes)} faixa diferente · {fmt(r.conflitos)} conflitos · {fmt(r.semParte)} sem parte</span>
        </div>
      )}

      {carregando && !dados && <div className="py-6 flex justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>}

      {dados && dados.docs.length > 0 && (
        <ul className="divide-y rounded-md border">
          {dados.docs.map((d) => {
            const open = aberto === d.documentoId
            return (
              <li key={d.documentoId} className="p-3">
                <button className="w-full text-left flex flex-wrap items-center gap-x-3 gap-y-1" onClick={() => setAberto(open ? null : d.documentoId)} aria-expanded={open}>
                  <span className="font-medium text-sm truncate max-w-[40ch]">{d.titulo}</span>
                  <span className="text-xs text-muted-foreground">{d.disciplina} · {ROTULO_FONTE[d.fonte] ?? d.fonte}</span>
                  <span className="ml-auto text-xs tabular-nums">
                    {fmt(d.propostas)} partes · <span className="text-primary">{fmt(d.novas)} novas</span>
                    {d.jaExistem ? ` · ${fmt(d.jaExistem)} já existem` : ''}{d.conflitos ? ` · ${fmt(d.conflitos)} conflitos` : ''}
                  </span>
                </button>
                {d.avisos.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {d.avisos.slice(0, open ? 50 : 2).map((a, i) => (
                      <li key={i} className="text-xs text-amber-700 dark:text-amber-400 flex gap-1.5"><AlertTriangle className="size-3 mt-0.5 shrink-0" />{a.mensagem}</li>
                    ))}
                    {!open && d.avisos.length > 2 && <li className="text-xs text-muted-foreground">+{d.avisos.length - 2} avisos</li>}
                  </ul>
                )}
                {open && d.partes.length > 0 && (
                  <table className="mt-2 w-full text-xs">
                    <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-2 font-medium">Parte</th><th className="pr-2 font-medium">Faixa</th><th className="pr-2 text-right font-medium">Artigos</th><th className="pr-2 text-right font-medium">Caracteres</th><th className="font-medium">Situação</th></tr></thead>
                    <tbody>
                      {d.partes.map((p, i) => (
                        <tr key={i} className="border-t">
                          <td className="py-1 pr-2">{p.nome}</td>
                          <td className="pr-2 text-muted-foreground">{p.rotuloIni || '(início)'} → {p.rotuloFim || '(fim)'}</td>
                          <td className="pr-2 text-right tabular-nums">{fmt(p.artigos)}</td>
                          <td className="pr-2 text-right tabular-nums">{fmt(p.caracteres)}</td>
                          <td><span className={cn('rounded px-1.5 py-0.5', ROTULO_STATUS[p.status].cls)} title={p.detalhe}>{ROTULO_STATUS[p.status].t}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {open && d.propostas > d.partes.length && <p className="mt-1 text-xs text-muted-foreground">Mostrando as {d.partes.length} primeiras de {fmt(d.propostas)} partes.</p>}
              </li>
            )
          })}
        </ul>
      )}

      {dados && dados.totalDocs === 0 && <p className="text-sm text-muted-foreground">Nenhum documento deste tipo no escopo selecionado.</p>}

      <footer className="flex flex-wrap items-center gap-3">
        {dados && dados.totalDocs > LIMITE && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Button variant="outline" size="icon" className="size-7" disabled={offset === 0 || carregando || !!aplicando} onClick={() => previa(Math.max(0, offset - LIMITE))} aria-label="Página anterior"><ChevronLeft className="size-3.5" /></Button>
            <span className="tabular-nums">{fmt(offset + 1)}–{fmt(fim)} de {fmt(dados.totalDocs)}</span>
            <Button variant="outline" size="icon" className="size-7" disabled={dados.proximoOffset == null || carregando || !!aplicando} onClick={() => dados.proximoOffset != null && previa(dados.proximoOffset)} aria-label="Próxima página"><ChevronRight className="size-3.5" /></Button>
          </div>
        )}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} disabled={!!aplicando} />
          Arquivar partes sobrepostas (sem metas usando)
        </label>
        {podeEditar && !semDivisao && (
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" disabled={!dados || !r?.novas || !!aplicando || carregando} onClick={() => aplicar(false)}>
              {aplicando ? <Loader2 className="size-3.5 animate-spin" /> : null} Criar nesta página
            </Button>
            <Button size="sm" disabled={!dados || !dados.totalDocs || !!aplicando || carregando} onClick={() => aplicar(true)}>
              {aplicando ? <><Loader2 className="size-3.5 animate-spin" /> {aplicando}</> : 'Criar partes a partir das metas'}
            </Button>
          </div>
        )}
      </footer>
    </section>
  )
}
