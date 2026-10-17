'use client'

// Pop-up "Baixar" do card do simulado (home/pasta): lista os cadernos baixáveis (Caderno de Questões,
// Gabarito Comentado, Diagnóstico) com visual do design novo por marca. Carrega a lista SOB DEMANDA
// (/api/aluno/simulado-downloads) ao abrir. Portal + overlay; no mobile vira bottom-sheet (responsivo).

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { BookOpen, MessageSquare, BarChart3, Download, Loader2, X, ArrowRight } from 'lucide-react'
import { internaTokensStyle, type Brand, type InternaTheme } from './interna-tokens'
import type { DownloadSimulado } from '@/lib/aluno/downloads-simulado'

const ICONE = { caderno: BookOpen, gabarito: MessageSquare, diagnostico: BarChart3, folha: Download } as const

/** Baixa o PDF com feedback (toast + spinner): rotas /api/ geram no servidor (pode demorar); arquivos
 *  importados abrem direto. Mesma lógica usada no resultado — replicada aqui p/ não acoplar o bundle. */
function useBaixar() {
  const [baixandoId, setBaixandoId] = useState<string | null>(null)
  async function baixar(d: DownloadSimulado) {
    if (baixandoId) return
    if (!/\/api\//.test(d.href)) { window.open(d.href, '_blank', 'noopener,noreferrer'); return }
    setBaixandoId(d.modalidade)
    toast.loading('Gerando PDF…', { id: 'cadpdf' })
    try {
      let res: Response | null = null
      for (let i = 0; i < 3; i++) { res = await fetch(d.href); if (res.status !== 503) break; await new Promise((r) => setTimeout(r, 2000 * (i + 1))) }
      if (!res || !res.ok) throw new Error('Não foi possível gerar o PDF agora. Tente novamente em instantes.')
      const blob = await res.blob()
      if (!blob.size || !/pdf/i.test(blob.type)) throw new Error('O PDF gerado veio vazio. Tente novamente em instantes.')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${(d.nome || 'caderno').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_')}.pdf`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      toast.success('Download concluído', { id: 'cadpdf', description: d.nome })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível gerar o PDF agora.', { id: 'cadpdf' })
    } finally { setBaixandoId(null) }
  }
  return { baixandoId, baixar }
}

// Card de opção no estilo do pop-up "Novo simulado": badge de ícone em gradiente, título + descrição,
// marca d'água do ícone no canto, wash da marca no hover e CTA "Baixar →" no rodapé.
function Tile({ d, baixando, onBaixar }: { d: DownloadSimulado; baixando: boolean; onBaixar: () => void }) {
  const Icon = ICONE[d.tipo] ?? Download
  return (
    <button type="button" className="cdd-op" onClick={onBaixar} disabled={baixando}>
      <span aria-hidden className="cdd-wash" />
      <Icon aria-hidden className="cdd-water" size={76} />
      <span className="cdd-badge">{baixando ? <Loader2 size={20} className="cdd-spin" /> : <Icon size={20} />}</span>
      <span className="cdd-optx">
        <b>{d.nome}</b>
        <small>{d.comGab ? 'Com gabarito / correção' : 'Sem gabarito'}</small>
      </span>
      <span className="cdd-cta">{baixando ? 'Gerando…' : 'Baixar'} <ArrowRight size={14} className="cdd-arrow" /></span>
    </button>
  )
}

export function CadernosDownloadDialog({ simuladoId, titulo, brand, theme, onClose }: {
  simuladoId: string; titulo?: string; brand: Brand; theme: InternaTheme; onClose: () => void
}) {
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro'>('carregando')
  const [downloads, setDownloads] = useState<DownloadSimulado[]>([])
  const [nome, setNome] = useState(titulo ?? '')
  const { baixandoId, baixar } = useBaixar()
  const vivo = useRef(true)

  useEffect(() => {
    vivo.current = true
    ;(async () => {
      try {
        const res = await fetch(`/api/aluno/simulado-downloads?simulado=${encodeURIComponent(simuladoId)}`)
        const j = await res.json()
        if (!vivo.current) return
        if (!res.ok) { setEstado('erro'); return }
        setDownloads(Array.isArray(j.downloads) ? j.downloads : [])
        if (j.titulo) setNome(j.titulo)
        setEstado('ok')
      } catch { if (vivo.current) setEstado('erro') }
    })()
    return () => { vivo.current = false }
  }, [simuladoId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (typeof document === 'undefined') return null

  const semGab = downloads.filter((d) => !d.comGab)
  const comGab = downloads.filter((d) => d.comGab)

  return createPortal(
    <div className="cdd-ov" role="dialog" aria-modal="true" aria-label="Baixar cadernos" onClick={onClose}
      style={{ ...internaTokensStyle(brand, theme), background: 'color-mix(in srgb, #0A0523 55%, transparent)', color: 'var(--ink)' }}>
      <style>{CSS}</style>
      <div className="cdd-card" onClick={(e) => e.stopPropagation()}>
        <div className="cdd-head">
          <div className="cdd-htx">
            <span className="cdd-eyebrow"><Download size={13} /> Baixar</span>
            <b>Cadernos do simulado</b>
            {nome ? <small>{nome}</small> : null}
          </div>
          <button type="button" className="cdd-x" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className="cdd-body">
          {estado === 'carregando' ? (
            <div className="cdd-estado"><Loader2 size={22} className="cdd-spin" /><span>Carregando cadernos…</span></div>
          ) : estado === 'erro' ? (
            <div className="cdd-estado"><span>Não foi possível carregar os cadernos agora.</span></div>
          ) : downloads.length === 0 ? (
            <div className="cdd-estado"><span>Nenhum caderno disponível para baixar ainda.</span></div>
          ) : (
            <div className="cdd-ops">
              {[...semGab, ...comGab].map((d) => <Tile key={d.modalidade} d={d} baixando={baixandoId === d.modalidade} onBaixar={() => baixar(d)} />)}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

const CSS = `
.cdd-ov{position:fixed;inset:0;z-index:140;display:flex;align-items:center;justify-content:center;padding:18px;background:color-mix(in srgb,#0A0523 55%,transparent);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);animation:cddFade .18s ease}
.cdd-card{width:100%;max-width:540px;max-height:86vh;display:flex;flex-direction:column;overflow:hidden;background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:calc(var(--r) * .9);box-shadow:0 24px 60px -20px rgba(10,5,35,.55);animation:cddPop .2s cubic-bezier(.2,.8,.2,1)}
.cdd-head{display:flex;align-items:flex-start;gap:12px;padding:18px 18px 14px;border-bottom:1px solid var(--line)}
.cdd-htx{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
.cdd-eyebrow{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--brand)}
.cdd-htx>b{font-size:17px;font-weight:800;line-height:1.15;color:var(--ink)}
.cdd-htx>small{font-size:12.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cdd-x{flex-shrink:0;width:34px;height:34px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--muted);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s,color .15s}
.cdd-x:hover{background:var(--chip);color:var(--ink)}
.cdd-body{padding:16px;overflow-y:auto}
.cdd-estado{display:flex;flex-direction:column;align-items:center;gap:10px;padding:26px 10px;color:var(--muted);font-size:13.5px;text-align:center}
.cdd-ops{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.cdd-op{position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:flex-start;gap:12px;min-height:150px;padding:16px;border-radius:18px;border:1px solid var(--line);background:var(--surface);color:var(--ink);text-align:left;font:inherit;cursor:pointer;transition:transform .28s ease,box-shadow .28s ease,border-color .28s ease}
.cdd-op:hover:not(:disabled){transform:translateY(-3px);border-color:color-mix(in srgb,var(--brand) 55%,var(--line));box-shadow:0 16px 30px -18px var(--brand)}
.cdd-op:disabled{opacity:.75;cursor:default}
.cdd-wash{position:absolute;inset:0;background:linear-gradient(135deg,color-mix(in srgb,var(--brand) 9%,transparent),transparent);opacity:0;transition:opacity .3s}
.cdd-op:hover:not(:disabled) .cdd-wash{opacity:1}
.cdd-water{position:absolute;right:-14px;top:-14px;color:color-mix(in srgb,var(--brand) 6%,transparent);transition:transform .5s ease,color .3s ease;pointer-events:none}
.cdd-op:hover:not(:disabled) .cdd-water{transform:scale(1.12);color:color-mix(in srgb,var(--brand) 11%,transparent)}
.cdd-badge{position:relative;flex-shrink:0;width:44px;height:44px;border-radius:13px;display:inline-flex;align-items:center;justify-content:center;color:#fff;background:linear-gradient(135deg,var(--brand),color-mix(in srgb,var(--brand) 68%,#000));box-shadow:0 10px 18px -8px var(--brand);transition:transform .28s ease}
.cdd-op:hover:not(:disabled) .cdd-badge{transform:rotate(-4deg) scale(1.05)}
.cdd-optx{position:relative;display:flex;flex-direction:column;gap:3px;min-width:0}
.cdd-optx>b{font-size:14.5px;font-weight:800;line-height:1.2;color:var(--ink)}
.cdd-optx>small{font-size:12px;line-height:1.4;color:var(--muted)}
.cdd-cta{position:relative;margin-top:auto;display:inline-flex;align-items:center;gap:5px;font-size:12.5px;font-weight:800;color:var(--brand)}
.cdd-arrow{transition:transform .28s ease}
.cdd-op:hover:not(:disabled) .cdd-arrow{transform:translateX(3px)}
.cdd-spin{animation:cddSpin .8s linear infinite}
@keyframes cddSpin{to{transform:rotate(360deg)}}
@keyframes cddFade{from{opacity:0}to{opacity:1}}
@keyframes cddPop{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
@media (max-width:560px){
  .cdd-ov{padding:0;align-items:flex-end}
  .cdd-card{max-width:none;max-height:88vh;border-radius:22px 22px 0 0;border-bottom:0;animation:cddSheet .24s cubic-bezier(.2,.8,.2,1)}
  .cdd-head{padding:16px 16px 12px}
  .cdd-ops{grid-template-columns:1fr}
  .cdd-op{min-height:0}
}
@keyframes cddSheet{from{transform:translateY(100%)}to{transform:none}}
`
