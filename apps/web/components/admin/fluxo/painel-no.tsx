'use client'

// PAINEL LATERAL do nó selecionado: descrição, valor vigente, link e (se o adaptador declarar campos) o formulário de edição.
// Genérico: salva por `salvarFluxo` (registro de adaptadores), que delega à server action existente do domínio (versão otimista/auditoria/trava de risco).
import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ExternalLink, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { confirmar } from '@/components/ui/confirm-dialog'
import type { CampoSchema, DadosFluxo, NoFluxo } from '@/lib/admin/fluxo/adaptador'
import { errosDoRascunho, textoDoValor, valorDoTexto, valoresAlterados } from '@/lib/admin/fluxo/campos'
import { salvarFluxo } from '@/app/admin/fluxo/fluxo-actions'
import { ESTILO_NO, ROTULO_NO } from './estilo-no'

const inputCls = 'h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60'

function Campo({ c, valor, texto, erro, disabled, onTexto, onValor }: { c: CampoSchema; valor: unknown; texto: string; erro?: string; disabled: boolean; onTexto: (t: string) => void; onValor: (v: unknown) => void }) {
  const id = `fx-${c.chave}`
  return (
    <div className="space-y-1">
      {c.tipo === 'bool' ? (
        <label htmlFor={id} className="flex items-center gap-2 text-sm">
          <input id={id} type="checkbox" className="h-4 w-4 accent-primary" checked={valor === true} disabled={disabled} onChange={(e) => onValor(e.target.checked)} />
          <span>{c.rotulo}</span>
        </label>
      ) : (
        <label htmlFor={id} className="block space-y-1 text-xs text-muted-foreground">
          <span>{c.rotulo}{c.sufixo ? ` (${c.sufixo})` : ''}</span>
          {c.tipo === 'opcao' ? (
            <select id={id} className={inputCls} value={String(valor ?? '')} disabled={disabled} onChange={(e) => onValor(e.target.value)}>
              {c.opcoes?.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
            </select>
          ) : (
            <input id={id} className={cn(inputCls, 'text-foreground', erro && 'border-destructive')} value={texto} disabled={disabled} inputMode={c.tipo === 'int' || c.tipo === 'real' ? 'decimal' : undefined}
              onChange={(e) => onTexto(e.target.value)} aria-invalid={!!erro} />
          )}
        </label>
      )}
      {c.dica && <p className="text-[11px] text-muted-foreground">{c.dica}</p>}
      {erro && <p className="text-[11px] text-destructive">{erro}</p>}
    </div>
  )
}

export function PainelNo({ adaptadorId, no, dados, onFechar }: { adaptadorId: string; no: NoFluxo; dados: DadosFluxo; onFechar: () => void }) {
  const ed = dados.edicao[no.id]
  const campos = ed?.campos ?? []
  const router = useRouter()
  const [pend, start] = useTransition()
  const [rasc, setRasc] = useState<Record<string, unknown>>({})
  const [txt, setTxt] = useState<Record<string, string>>({})
  const [motivo, setMotivo] = useState('')
  const valorDe = (c: CampoSchema) => (c.chave in rasc ? rasc[c.chave] : c.valor)
  const textoDe = (c: CampoSchema) => txt[c.chave] ?? textoDoValor(valorDe(c))
  const alterados = useMemo(() => valoresAlterados(campos, rasc), [campos, rasc])
  const erros = useMemo(() => errosDoRascunho(campos, rasc), [campos, rasc])
  const nAlt = Object.keys(alterados).length
  const grupos = useMemo(() => { const m = new Map<string, CampoSchema[]>(); for (const c of campos) { const g = c.grupo ?? ''; m.set(g, [...(m.get(g) ?? []), c]) } return [...m.entries()] }, [campos])
  const editavel = dados.podeEditar && campos.length > 0

  const descartar = () => { setRasc({}); setTxt({}); setMotivo('') }
  const mudarTexto = (c: CampoSchema, t: string) => { setTxt((o) => ({ ...o, [c.chave]: t })); setRasc((o) => ({ ...o, [c.chave]: valorDoTexto(c, t) })) }
  const mudarValor = (c: CampoSchema, v: unknown) => setRasc((o) => ({ ...o, [c.chave]: v }))

  const salvar = () => start(async () => {
    if (!nAlt) return
    if (Object.keys(erros).length) { toast.error(Object.values(erros)[0]); return }
    const patch = { alvo: ed?.alvo, valores: alterados }
    let r = await salvarFluxo(adaptadorId, patch, dados.versao, motivo, false)
    if (!r.ok && r.confirmar) {
      const ok = await confirmar({ titulo: r.confirmar.titulo, mensagem: r.confirmar.mensagem, confirmar: 'Salvar mesmo assim', destrutivo: true })
      if (!ok) return
      r = await salvarFluxo(adaptadorId, patch, dados.versao, motivo, true)
    }
    if (!r.ok) {
      toast.error(r.conflito ? 'As regras mudaram desde que você abriu o fluxo. Recarregamos; refaça a alteração.' : r.error)
      if (r.conflito) router.refresh()
      return
    }
    toast.success(dados.versao || r.versao ? `Salvo (versão ${r.versao}). Vale para o que for gerado dali em diante.` : 'Salvo.')
    r.avisos?.forEach((a) => toast.message(a))
    descartar()
    router.refresh()
  })

  return (
    <aside className="flex w-full flex-col gap-3 p-1" aria-label="Detalhe do nó">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('rounded-md border-2 px-2 py-0.5 text-[11px] font-semibold', ESTILO_NO[no.tipo])}>{ROTULO_NO[no.tipo]}</span>
            {no.inferido && <span className="rounded-md border border-dashed border-amber-500 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-400" title="Não consta no motor nem no mapa: inferido">inferido</span>}
          </div>
          <h3 className="font-semibold leading-tight">{no.titulo}</h3>
        </div>
        <button type="button" onClick={onFechar} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Fechar painel"><X className="h-4 w-4" /></button>
      </div>
      <p className="whitespace-pre-line text-sm text-muted-foreground">{no.descricao}</p>
      {no.valor && <p className="text-sm"><span className="text-muted-foreground">Valor vigente: </span><b>{no.valor}</b></p>}
      {no.link && <Link href={no.link.href} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">{no.link.rotulo}<ExternalLink className="h-3.5 w-3.5" /></Link>}

      {campos.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">Esta etapa não tem valor editável aqui{no.link ? ` — use o link “${no.link.rotulo}”.` : '.'}</p>
      ) : (
        <div className="space-y-4 border-t pt-3">
          <h4 className="text-sm font-semibold">{editavel ? 'Editar valores' : 'Valores (somente leitura)'}</h4>
          {ed?.aviso && <p className="text-xs text-muted-foreground">{ed.aviso}</p>}
          {grupos.map(([g, cs]) => (
            <fieldset key={g} className="space-y-2.5">
              {g && <legend className="mb-1 text-xs font-semibold text-foreground">{g}</legend>}
              {cs.map((c) => <Campo key={c.chave} c={c} valor={valorDe(c)} texto={textoDe(c)} erro={erros[c.chave]} disabled={!editavel || pend} onTexto={(t) => mudarTexto(c, t)} onValor={(v) => mudarValor(c, v)} />)}
            </fieldset>
          ))}
          {editavel && (
            <div className="space-y-2 border-t pt-3">
              {dados.motivo !== 'nenhum' && (
                <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} placeholder={dados.motivo === 'obrigatorio' ? 'Motivo da alteração (obrigatório)' : 'Motivo da alteração (opcional, vai para o histórico)'} className={inputCls} />
              )}
              <div className="flex items-center gap-2">
                <button type="button" onClick={salvar} disabled={pend || !nAlt || Object.keys(erros).length > 0 || (dados.motivo === 'obrigatorio' && !motivo.trim())}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60">
                  {pend && <Loader2 className="h-4 w-4 animate-spin" />}Salvar{nAlt ? ` (${nAlt})` : ''}
                </button>
                <button type="button" onClick={descartar} disabled={pend || !nAlt} className="h-9 rounded-md border px-3 text-sm disabled:opacity-60">Descartar</button>
              </div>
              <p className="text-[11px] text-muted-foreground">{dados.rotuloVersao}. Salvar não altera planos já gravados.</p>
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
