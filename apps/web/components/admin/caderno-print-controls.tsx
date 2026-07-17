'use client'

import { useEffect, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export function CadernoPrintControls() {
  const [baixando, setBaixando] = useState(false)

  // Baixa o PDF DIRETO (attachment) via servidor (Chromium headless), COM fundo e cards certos.
  // Sem fallback de impressão: se falhar, mostra erro (não abre o diálogo de imprimir).
  async function baixar() {
    if (baixando) return
    const params = new URLSearchParams(window.location.search)
    const m = window.location.pathname.match(/\/imprimir\/caderno\/([^/?#]+)/)
    const cadernoId = m?.[1]
    const sessao = params.get('sessao')
    if (!cadernoId || !sessao) { toast.error('Não foi possível identificar o caderno para gerar o PDF.'); return }

    const mod = params.get('mod') || 'caderno_completo'
    const aluno = params.get('aluno') || ''
    const comGabarito = params.get('gabarito') === '1'
    const nome = (params.get('nome') || 'caderno').replace(/[\\/:*?"<>|]+/g, '').slice(0, 120) || 'caderno'
    const qs = new URLSearchParams({ caderno: cadernoId, sessao, mod, nome })
    if (aluno) qs.set('aluno', aluno)
    if (comGabarito) qs.set('gabarito', '1')

    setBaixando(true)
    toast.loading('Gerando PDF…', { id: 'cadpdf' })
    try {
      const res = await fetch(`/api/aluno/caderno-pdf?${qs.toString()}`)
      if (!res.ok) throw new Error('falha')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${nome}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      toast.success('Download concluído', { id: 'cadpdf' })
    } catch {
      toast.error('Não foi possível gerar o PDF agora. Tente novamente em instantes.', { id: 'cadpdf' })
    } finally {
      setBaixando(false)
    }
  }

  // Legado: quando aberto com ?print=1, baixa o PDF automaticamente (sem imprimir).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('print') !== '1') return
    let disparado = false
    const go = () => { if (disparado) return; disparado = true; setTimeout(() => { baixar() }, 400) }
    if (document.readyState === 'complete') go()
    else window.addEventListener('load', go, { once: true })
    return () => window.removeEventListener('load', go)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="no-print sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-4 py-2">
      <button
        type="button"
        onClick={baixar}
        disabled={baixando}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {baixando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} {baixando ? 'Gerando PDF…' : 'Baixar PDF'}
      </button>
      <span className="ml-auto text-xs text-muted-foreground">O PDF é baixado direto (com o fundo e os cards), sem impressão.</span>
    </div>
  )
}
