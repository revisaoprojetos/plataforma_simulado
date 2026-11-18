'use client'
// Aviso "N grifos de uma versão anterior deste material": grifos do PDF gravados numa versão com layout diferente NÃO são
// pintados (cairiam em posição errada). Nada é apagado: o aluno vê o texto/nota de cada um e decide reaplicar (busca o
// MESMO texto no PDF atual; só aceita se idêntico e único) ou descartar. Reaplicar cria um grifo NOVO e mantém o original.
import { useState } from 'react'
import { toast } from 'sonner'
import type { GrifoDesatualizado, PaginaTexto } from '@/lib/conteudo/grifos-versao'
import { reancorarPorTexto } from '@/lib/conteudo/grifos-versao'
import { extrairPaginasPdf } from '@/lib/conteudo/pdf-texto-extrair'
import { espinhaDoPdf, ancoraDeTexto } from '@/lib/conteudo/pdf-texto-ancora'

const PDFJS_WORKER = '/pdf/pdf.worker.min.mjs?v=6.2.108-legacy'

async function textoDasPaginas(pdfUrl: string): Promise<PaginaTexto[]> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER
  const pdf = await pdfjs.getDocument({ url: pdfUrl }).promise
  return extrairPaginasPdf(pdf)
}

export function GrifosAntigosAviso({ documentoId, pdfUrl, antigos }: { documentoId: string; pdfUrl: string | null; antigos: GrifoDesatualizado[] }) {
  const [aberto, setAberto] = useState(false)
  const [lista, setLista] = useState(antigos)
  const [ocupado, setOcupado] = useState(false)
  if (!lista.length) return null

  const descartar = async (g: GrifoDesatualizado) => {
    setOcupado(true)
    try {
      const r = await fetch('/api/conteudo/grifo-pdf?id=' + encodeURIComponent(g.id), { method: 'DELETE', credentials: 'same-origin' })
      if (!r.ok) throw new Error()
      setLista((l) => l.filter((x) => x.id !== g.id))
    } catch { toast.error('Não foi possível descartar agora.') } finally { setOcupado(false) }
  }

  const reaplicar = async (alvo: GrifoDesatualizado[]) => {
    if (!pdfUrl) { toast.error('O PDF atual não está disponível.'); return }
    setOcupado(true)
    try {
      const paginas = await textoDasPaginas(pdfUrl)
      let ok = 0; const feitos = new Set<string>(); const esp = espinhaDoPdf(paginas)
      for (const g of alvo) {
        if (!g.texto) continue
        const a = reancorarPorTexto(g.texto, paginas, g.pagina)
        if (!a) continue
        const anc = ancoraDeTexto(esp, g.texto, g.pagina)?.ancora // vínculo de TEXTO do grifo novo
        const r = await fetch('/api/conteudo/grifo-pdf', {
          method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ documento_id: documentoId, pagina: a.pagina, rects: a.rects, cor: g.cor, tool: g.tool, nota: g.nota, texto: g.texto, ancora: anc ?? undefined }),
        })
        if (r.ok) { ok++; feitos.add(g.id) }
      }
      if (ok) { toast.success(ok === 1 ? '1 grifo reaplicado.' : `${ok} grifos reaplicados.`); setTimeout(() => window.location.reload(), 600) }
      else toast.message('Não encontrei esse trecho idêntico no material atual. Ele continua salvo na lista.')
      setLista((l) => l.filter((x) => !feitos.has(x.id)))
    } catch { toast.error('Não foi possível ler o PDF para reaplicar.') } finally { setOcupado(false) }
  }

  const btn = { border: '1px solid color-mix(in srgb, currentColor 18%, transparent)', borderRadius: 10, padding: '6px 10px', fontSize: 12.5, fontWeight: 600, background: 'transparent', color: 'inherit', cursor: 'pointer' } as const
  const btnPri = { ...btn, background: 'var(--primary, #6d28d9)', color: 'var(--primary-foreground, #fff)', border: 0 } as const

  return (
    <>
      <button onClick={() => setAberto(true)} title="Grifos feitos numa versão anterior deste material"
        style={{ position: 'fixed', right: 14, bottom: 14, zIndex: 55, ...btnPri, borderRadius: 999, padding: '8px 14px', boxShadow: '0 8px 24px -8px rgba(0,0,0,.4)' }}>
        {lista.length === 1 ? '1 grifo de uma versão anterior' : `${lista.length} grifos de uma versão anterior`}
      </button>
      {aberto && (
        <div role="dialog" aria-modal="true" onClick={() => setAberto(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'grid', placeItems: 'center', padding: 16, background: 'rgba(0,0,0,.45)' }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(640px, 100%)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', borderRadius: 18, background: 'var(--card, #fff)', color: 'var(--foreground, #1f1f1f)', boxShadow: '0 24px 60px -18px rgba(0,0,0,.4)' }}>
            <div style={{ padding: '18px 20px 10px' }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Grifos de uma versão anterior</h2>
              <p style={{ fontSize: 13.5, lineHeight: 1.5, opacity: .75, margin: '6px 0 0' }}>
                Este material foi atualizado depois que você grifou. Para não aparecerem no lugar errado, esses grifos não são exibidos sobre a página, mas continuam salvos. Você pode reaplicá-los (procuramos o mesmo trecho no material atual) ou descartá-los.
              </p>
            </div>
            <div style={{ overflowY: 'auto', padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {lista.map((g) => (
                <div key={g.id} style={{ border: '1px solid color-mix(in srgb, currentColor 12%, transparent)', borderRadius: 12, padding: '10px 12px' }}>
                  <div style={{ fontSize: 12, opacity: .6, marginBottom: 4 }}>{g.ancora?.rotulo ? `${g.ancora.rotulo} · ` : ''}versão anterior (pág. {g.pagina})</div>
                  <div style={{ fontSize: 14, lineHeight: 1.45 }}>{g.texto || '(sem texto salvo)'}</div>
                  {g.nota ? <div style={{ fontSize: 13, opacity: .8, marginTop: 4 }}>Nota: {g.nota}</div> : null}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button disabled={ocupado || !g.texto} style={btn} onClick={() => void reaplicar([g])}>Reaplicar</button>
                    <button disabled={ocupado} style={btn} onClick={() => void descartar(g)}>Descartar</button>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '12px 20px 16px' }}>
              <button disabled={ocupado} style={btn} onClick={() => setAberto(false)}>Fechar</button>
              <button disabled={ocupado} style={btnPri} onClick={() => void reaplicar(lista)}>{ocupado ? 'Procurando...' : 'Reaplicar todos que couberem'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
