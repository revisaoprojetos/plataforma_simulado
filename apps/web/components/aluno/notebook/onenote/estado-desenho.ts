'use client'
// Estado da aba DESENHAR do Caderno OneNote (ferramenta ativa, canetas, borracha, toque) + ponte com a folha livre montada.
// Store de módulo (useSyncExternalStore) porque a folha é montada dentro de um `next/dynamic` (editor-pagina -> corpo-folha) e
// não recebe props da casca. Só existe UMA casca OneNote por vez. Preferências (canetas/borracha/toque) persistem em localStorage.
import { useSyncExternalStore } from 'react'
import {
  PADRAO_PREFS, sanitizarPrefs, serializarPrefs, type FerramentaDesenho, type PrefsDesenho, type SlotCaneta,
} from '@/lib/aluno/notebook-desenho'

const CHAVE = 'onenote:desenho'

export interface EstadoDesenho extends PrefsDesenho {
  ferramenta: FerramentaDesenho
  /** Slot da caneta/marca-texto selecionada (só faz sentido com ferramenta caneta/marca-texto). */
  slot: SlotCaneta | null
  /** Há uma folha livre montada na casca OneNote (habilita desfazer/refazer de tinta). */
  folhaAtiva: boolean
  acoes: { desfazer: (() => void) | null; refazer: (() => void) | null }
  /** Pede ao app mais/menos zoom (passo discreto do Exibir); usado por Ctrl+roda e pinça dentro da folha. */
  pedirZoom: ((dir: 1 | -1) => void) | null
  /** Visual da página aberta, vindo do CanvasPagina (a folha aplica zoom/fundo por dentro, sem CSS `zoom`). */
  pagina: { zoom: number; fundoCor: string | null; fundoImg: string | null }
}

const INICIAL: EstadoDesenho = {
  ...PADRAO_PREFS, ferramenta: 'texto', slot: null, folhaAtiva: false, acoes: { desfazer: null, refazer: null }, pedirZoom: null,
  pagina: { zoom: 1, fundoCor: null, fundoImg: null },
}

let estado: EstadoDesenho = INICIAL
let carregado = false
const ouvintes = new Set<() => void>()

export const lerEstadoDesenho = (): EstadoDesenho => estado
export function atualizarDesenho(patch: Partial<EstadoDesenho>, persistir = false) {
  estado = { ...estado, ...patch }
  ouvintes.forEach((f) => f())
  if (persistir) salvarPrefs()
}
function salvarPrefs() {
  try { localStorage.setItem(CHAVE, serializarPrefs({ canetas: estado.canetas, borracha: estado.borracha, toque: estado.toque })) } catch { /* storage bloqueado (iframe/privado): segue sem persistir */ }
}
/** Carrega as preferências salvas (uma vez por sessão da página). Tolera storage bloqueado e JSON corrompido. */
export function carregarPrefsDesenho() {
  if (carregado) return
  carregado = true
  let bruto: string | null = null
  try { bruto = localStorage.getItem(CHAVE) } catch { /* sem storage */ }
  if (bruto == null) return
  const p = sanitizarPrefs(bruto)
  atualizarDesenho({ canetas: p.canetas, borracha: p.borracha, toque: p.toque })
}

function assinar(f: () => void) { ouvintes.add(f); return () => { ouvintes.delete(f) } }
export function useEstadoDesenho(): EstadoDesenho {
  return useSyncExternalStore(assinar, lerEstadoDesenho, () => INICIAL)
}
