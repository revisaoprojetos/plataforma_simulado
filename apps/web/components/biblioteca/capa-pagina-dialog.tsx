'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Image as ImageIcon, X, Loader2, Save, Layers, FileText, BookOpenCheck, Info, Trash2 } from 'lucide-react'
import { CampoImagem } from '@/components/admin/campo-imagem'
import { obterCapaPagina, salvarCapaPagina, type AlvoCP, type EstadoCP } from '@/app/admin/biblioteca/capa-actions'
import type { ModoCP } from '@/lib/conteudo/capa-pagina'

// Módulo-level: definido DENTRO do diálogo remontaria a cada tecla (input perderia o foco).
function Modo({ valor, onChange, rotuloLote, rotuloIndiv, desabilitado }: { valor: ModoCP; onChange: (m: ModoCP) => void; rotuloLote: string; rotuloIndiv: string; desabilitado?: boolean }) {
  const op = (m: ModoCP, titulo: string, texto: string, Icon: typeof Layers) => (
    <button type="button" disabled={desabilitado} onClick={() => onChange(m)} aria-pressed={valor === m}
      className={`flex flex-1 items-start gap-2 rounded-xl border p-2.5 text-left transition-colors disabled:opacity-50 ${valor === m ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50'}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${valor === m ? 'text-primary' : 'text-muted-foreground'}`} />
      <span className="min-w-0"><span className="block text-xs font-semibold">{titulo}</span><span className="block text-[11px] leading-snug text-muted-foreground">{texto}</span></span>
    </button>
  )
  return <div className="flex flex-col gap-2 sm:flex-row">{op('lote', 'Em lote', rotuloLote, Layers)}{op('individual', 'Individual', rotuloIndiv, FileText)}</div>
}

/**
 * Capa + página inicial de uma PASTA (vale p/ os documentos dentro, em lote) ou de um DOCUMENTO (individual).
 * Documento: o valor próprio vence o da pasta. Pasta "Individual": só o card da pasta mostra a capa; nada é herdado.
 */
export function CapaPaginaDialog({ alvo, onFechar, onSalvo }: { alvo: AlvoCP; onFechar: () => void; onSalvo?: () => void }) {
  const ehPasta = alvo.tipo === 'pasta'
  const [estado, setEstado] = useState<EstadoCP | null>(null)
  const [capa, setCapa] = useState<string>('')
  const [capaModo, setCapaModo] = useState<ModoCP>('lote')
  const [pagina, setPagina] = useState<string>('')
  const [paginaModo, setPaginaModo] = useState<ModoCP>('lote')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    let vivo = true
    obterCapaPagina(alvo).then((r) => {
      if (!vivo) return
      setEstado(r)
      if (r.ok) { setCapa(r.atual.capaUrl ?? ''); setCapaModo(r.atual.capaModo); setPagina(r.atual.paginaInicial ? String(r.atual.paginaInicial) : ''); setPaginaModo(r.atual.paginaInicialModo) }
    }).catch(() => { if (vivo) setEstado({ ok: false, error: 'Falha ao carregar.', migrado: true, titulo: '', atual: { capaUrl: null, capaModo: 'lote', paginaInicial: null, paginaInicialModo: 'lote' }, herdado: { capa: { valor: null, origem: null }, pagina: { valor: null, origem: null } } }) })
    return () => { vivo = false }
  }, [alvo.tipo, alvo.id])
  useEffect(() => { const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar(); document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc) }, [onFechar])

  const paginaNum = pagina.trim() === '' ? null : Number(pagina)
  const paginaInvalida = pagina.trim() !== '' && !(Number.isInteger(paginaNum) && (paginaNum as number) >= 1)
  const bloqueado = estado ? !estado.migrado : false

  async function salvar() {
    if (paginaInvalida) { toast.error('Informe a página como um número inteiro a partir de 1.'); return }
    setSalvando(true)
    try {
      const r = await salvarCapaPagina(alvo, {
        capaUrl: capa.trim() || null,
        paginaInicial: paginaNum,
        ...(ehPasta ? { capaModo, paginaInicialModo: paginaModo } : {}),
      })
      if (!r.ok) { toast.error(r.error || 'Não foi possível salvar.'); return }
      toast.success('Capa e página inicial salvas.')
      onSalvo?.(); onFechar()
    } finally { setSalvando(false) }
  }

  const h = estado?.herdado
  const origemTxt = (o: { origem: string | null; pastaNome?: string }) => (o.origem === 'pasta' ? `herdada da pasta “${o.pastaNome ?? ''}”` : null)

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onFechar} />
      <div role="dialog" aria-modal="true" aria-label="Capa e página inicial" className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b px-5 py-3.5">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><ImageIcon className="h-5 w-5" /></span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Capa e página inicial</h3>
              <p className="truncate text-xs text-muted-foreground" title={estado?.titulo}>{ehPasta ? 'Pasta' : 'Documento'}{estado?.titulo ? ` · ${estado.titulo}` : ''}</p>
            </div>
          </div>
          <button onClick={onFechar} aria-label="Fechar" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        {!estado ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
        ) : !estado.ok ? (
          <div className="m-5 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{estado.error || 'Não foi possível carregar.'}</div>
        ) : (
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
            {bloqueado && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Os campos de capa e página inicial ainda não existem no banco. Aplique a migração <span className="font-mono">20261105010000_biblioteca_capa_pagina_inicial.sql</span> para salvar.</span>
              </div>
            )}

            {/* CAPA */}
            <section className="space-y-3">
              <div>
                <h4 className="flex items-center gap-1.5 text-sm font-semibold"><ImageIcon className="h-4 w-4" /> Capa</h4>
                <p className="text-xs text-muted-foreground">
                  {ehPasta ? 'Imagem do card da pasta. Em lote, todos os documentos dentro dela usam esta capa — a menos que tenham a sua.' : 'Capa só deste documento. Tem prioridade sobre a capa da pasta.'}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-[11rem_1fr]">
                <div className="space-y-2">
                  <CampoImagem value={capa} onChange={setCapa} aspecto="1 / 1.3" rotulo="Vertical · 1:1,3" textoVazio="Enviar capa" disabled={bloqueado} />
                  {capa && <button type="button" onClick={() => setCapa('')} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /> Remover capa</button>}
                </div>
                <div className="space-y-2">
                  {ehPasta ? (
                    <>
                      <p className="text-xs font-medium">Como esta capa é aplicada</p>
                      <Modo valor={capaModo} onChange={setCapaModo} desabilitado={bloqueado}
                        rotuloLote={`Todos os documentos da pasta e das subpastas usam esta capa${estado.alcance ? ` (${estado.alcance} hoje)` : ''}.`}
                        rotuloIndiv="Só o card da pasta mostra a capa. Cada documento define a sua." />
                    </>
                  ) : (
                    <div className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
                      {capa ? 'Este documento usa a capa própria.' : h?.capa.origem === 'pasta' ? <>Sem capa própria: usa a capa {origemTxt(h.capa)}.</> : 'Sem capa própria nem da pasta: aparece a miniatura automática (admin) ou o ícone do tipo (aluno).'}
                    </div>
                  )}
                  {ehPasta && h?.capa.origem === 'pasta' && !capa && <p className="text-[11px] text-muted-foreground">Esta pasta, sem capa própria, hoje herda a capa {origemTxt(h.capa)}.</p>}
                </div>
              </div>
            </section>

            {/* PÁGINA INICIAL */}
            <section className="space-y-3 border-t pt-5">
              <div>
                <h4 className="flex items-center gap-1.5 text-sm font-semibold"><BookOpenCheck className="h-4 w-4" /> Página inicial da leitura</h4>
                <p className="text-xs text-muted-foreground">
                  O leitor <span className="font-medium text-foreground">abre direto nesta página</span>, pulando a capa e a parte inicial (capa em imagem, aviso de direitos, índice). As páginas anteriores <span className="font-medium text-foreground">continuam no documento</span>: o aluno só rola para cima se quiser vê-las. Em branco = documento inteiro, a partir da página 1.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-4">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium">Começar na página</span>
                  <input inputMode="numeric" value={pagina} onChange={(e) => setPagina(e.target.value.replace(/[^\d]/g, '').slice(0, 5))} placeholder="1" disabled={bloqueado}
                    aria-invalid={paginaInvalida}
                    className={`h-9 w-28 rounded-lg border bg-background px-3 text-sm tabular-nums ${paginaInvalida ? 'border-destructive' : ''}`} />
                </label>
                {pagina && <button type="button" onClick={() => setPagina('')} className="mb-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /> Remover</button>}
              </div>
              {ehPasta ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium">Como esta página é aplicada</p>
                  <Modo valor={paginaModo} onChange={setPaginaModo} desabilitado={bloqueado}
                    rotuloLote="Todos os documentos da pasta e das subpastas são lidos a partir desta página, sem a parte anterior (cada documento pode ter a sua)."
                    rotuloIndiv="Só vale para esta pasta, sem passar para os documentos. Cada documento define a sua." />
                  {h?.pagina.origem === 'pasta' && !pagina && <p className="text-[11px] text-muted-foreground">Sem página própria, esta pasta herda a página {h.pagina.valor} {origemTxt(h.pagina)}.</p>}
                </div>
              ) : (
                <div className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
                  {pagina ? `Este documento abre direto na página ${pagina} (as ${Math.max(0, Number(pagina) - 1)} anteriores continuam acima).` : h?.pagina.origem === 'pasta' ? <>Sem página própria: abre direto na página {h.pagina.valor}, {origemTxt(h.pagina)} (as anteriores continuam acima).</> : 'Sem página própria nem da pasta: documento inteiro, a partir da página 1.'}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">A página é a do PDF do documento. Se você substituir o arquivo por uma versão com outra paginação, revise este número.</p>
            </section>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
          <button type="button" onClick={onFechar} className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted">Cancelar</button>
          <button type="button" onClick={salvar} disabled={!estado?.ok || salvando || bloqueado || paginaInvalida}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
