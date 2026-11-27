'use client'

import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { SaidaTransferencia } from './transferir-metas-dialog'

/**
 * Abre o pop-up "Transferir metas" de forma IMPERATIVA (como `confirmar`/`pedirTexto`): monta o diálogo num container
 * próprio no <body> e resolve quando ele fecha. `null` = cancelado. Só uma origem por vez (lote → rejeitar antes de chamar).
 *  · `arquivar`: já abre com "Transferir e arquivar a origem" marcado.
 *  · `permitirArquivarAssim`: usado pelo fluxo de ARQUIVAR (mostra "Arquivar mesmo assim", que devolve { tipo: 'arquivar_assim' }).
 */
export async function abrirTransferirMetas(
  origem: { id: string; titulo: string },
  opts: { arquivar?: boolean; permitirArquivarAssim?: boolean } = {},
): Promise<SaidaTransferencia | null> {
  if (typeof document === 'undefined') return null
  const { TransferirMetasDialog } = await import('./transferir-metas-dialog')
  return new Promise((resolve) => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const root = createRoot(el)
    const fechar = (s: SaidaTransferencia | null) => {
      resolve(s)
      setTimeout(() => { root.unmount(); el.remove() }, 300) // deixa a animação de saída terminar
    }
    root.render(createElement(TransferirMetasDialog, { origem, arquivarInicial: !!opts.arquivar, permitirArquivarAssim: !!opts.permitirArquivarAssim, onFechar: fechar }))
  })
}

/** Atalho p/ ações avulsas ("Transferir metas…" no menu/barra): rejeita lote com mensagem. Devolve true se algo foi transferido. */
export async function transferirMetasAvulso(ids: string[], titulos?: Record<string, string>): Promise<boolean> {
  const { toast } = await import('sonner')
  const lista = [...new Set(ids)]
  if (lista.length !== 1) { toast.error('Transferir metas é feito um documento por vez. Selecione apenas um.'); return false }
  const id = lista[0]
  const s = await abrirTransferirMetas({ id, titulo: titulos?.[id] ?? 'Documento' })
  return s?.tipo === 'concluido'
}
