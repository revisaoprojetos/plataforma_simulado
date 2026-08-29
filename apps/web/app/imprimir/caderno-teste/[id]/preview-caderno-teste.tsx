'use client'

import { useEffect } from 'react'
import { Printer } from 'lucide-react'
import { Previa, type DiscBanco } from '@/lib/caderno-teste/previa'
import { PreviaBlocos } from '@/lib/caderno-teste/previa-blocos'
import { presetDoItem, type ItemCaderno, type PreviewQuestao } from '@/lib/caderno-teste/tipos'

/** Renderiza um grupo do caderno de teste com os MESMOS componentes de prévia do editor (paginado em A4). */
export function PreviewCadernoTeste({ item, questoes, vars, discBanco, standalone, respostas, gabaritoLiberado, auto, baixarWord, nomeArq }: {
  item: ItemCaderno
  questoes: PreviewQuestao[]
  vars: Record<string, string>
  discBanco: DiscBanco[]
  standalone?: boolean
  /** Respostas do aluno (questaoId → letra) — folha "como fez"/correção. */
  respostas?: Record<string, string>
  /** Revela o gabarito oficial (false = só marcações do aluno). */
  gabaritoLiberado?: boolean
  /** Abre o diálogo de impressão automaticamente (fluxo "Baixar em PDF"). */
  auto?: boolean
  /** Serializa o render (mesmo do sistema) e baixa como .doc (fluxo "Baixar em Word"). */
  baixarWord?: boolean
  /** Nome do arquivo (sem extensão) para o download. */
  nomeArq?: string
}) {
  const preset = presetDoItem(item)

  // Export/impressão = SEMPRE tema claro (papel branco), independente do tema do admin — evita export escuro.
  useEffect(() => {
    if (!standalone) return
    const el = document.documentElement
    const tinhaDark = el.classList.contains('dark')
    el.classList.remove('dark'); el.classList.add('light'); el.style.colorScheme = 'light'
    return () => { if (tinhaDark) { el.classList.add('dark'); el.classList.remove('light') } el.style.colorScheme = '' }
  }, [standalone])

  // Auto-print: espera a paginação (efeitos do Previa/PreviaBlocos) + fontes assentarem.
  useEffect(() => {
    if (!auto) return
    let cancelado = false
    const t = setTimeout(() => { if (!cancelado) { try { window.focus() } catch { /* noop */ } window.print() } }, 600)
    return () => { cancelado = true; clearTimeout(t) }
  }, [auto])

  // Baixar Word: serializa o DOM JÁ RENDERIZADO (mesmo render do sistema) → .doc. Os blocos têm
  // margin-top inline (que o Word respeita em <div>), então o espaçamento é preservado no arquivo.
  useEffect(() => {
    if (!baixarWord) return
    let cancelado = false
    const t = setTimeout(() => {
      if (cancelado) return
      try {
        const root = document.querySelector('.caderno-print-root') as HTMLElement | null
        if (!root) return
        const clone = root.cloneNode(true) as HTMLElement
        clone.querySelectorAll('.no-print,[aria-hidden="true"],style,script').forEach((n) => n.remove())
        const doc = `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><meta name="color-scheme" content="light">`
          + `<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->`
          + `<style>@page{size:A4;margin:0}html,body{background:#fff!important;color:#1a202c;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}*{box-sizing:border-box}img{max-width:100%}.caderno-pronto{gap:0!important}</style></head>`
          + `<body style="background:#fff">${clone.innerHTML}</body></html>`
        const blob = new Blob(['﻿' + doc], { type: 'application/msword' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `${(nomeArq || 'caderno').replace(/[\\/:*?"<>|]+/g, '')}.doc`
        document.body.appendChild(a); a.click(); a.remove()
        setTimeout(() => { try { window.close() } catch { /* noop */ } }, 600)
      } catch { /* noop */ }
    }, 800)
    return () => { cancelado = true; clearTimeout(t) }
  }, [baixarWord, nomeArq])
  return (
    <div className="caderno-print-root flex min-h-screen justify-center bg-neutral-100 py-4 dark:bg-neutral-900">
      {/* Impressão: folha A4 sem margem do navegador; esconde a barra de ação. Zera o padding/gap/sombra
          da PRÉVIA de tela (senão a linha cinza do topo vaza e o gap de 22px entre folhas empurra o rodapé
          para uma página extra). break-after: 1 folha por página; a última NÃO quebra (evita página vazia). */}
      <style>{`@media print{
        @page{size:A4;margin:0}
        html,body{background:#fff!important}
        .no-print{display:none!important}
        .caderno-print-root{padding:0!important;margin:0!important;background:#fff!important;min-height:0!important}
        .caderno-pronto{gap:0!important}
        .caderno-pronto>[aria-hidden]{display:none!important}
        .caderno-pronto>div{box-shadow:none!important;break-after:page;page-break-after:always}
        /* a ÚLTIMA folha (contracapa) começa SEMPRE numa página nova e não deixa página em branco depois */
        .caderno-pronto>div:last-child{break-after:avoid;page-break-after:avoid;break-before:page;page-break-before:always;overflow:hidden}
      }`}</style>
      {standalone && (
        <div className="no-print fixed right-4 top-4 z-50">
          <button type="button" onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-lg transition-colors hover:bg-primary/90">
            <Printer className="h-4 w-4" /> Imprimir / Salvar como PDF
          </button>
        </div>
      )}
      {preset
        ? <PreviaBlocos presetId={preset} questoes={questoes} vars={vars} titulo={item.ajustes.titulo} capaUrl={item.ajustes.capaUrl} ultimaUrl={item.ajustes.ultimaUrl} folhaUrl={item.ajustes.folhaUrl} cabecalhoUrl={item.ajustes.cabecalhoUrl} rodapeUrl={item.ajustes.rodapeUrl} margemTopo={item.ajustes.margemTopo} margemBase={item.ajustes.margemBase} capa={item.capa} docOverride={item.docEdit} respostas={respostas} gabaritoLiberado={gabaritoLiberado} />
        : <Previa item={item} questoes={questoes} vars={vars} discBanco={discBanco} />}
    </div>
  )
}
