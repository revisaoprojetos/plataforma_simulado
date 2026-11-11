// Classes (tokens/paleta semântica) por tipo de evento — módulo SEM 'use client' para poder ser usado por server e client.
import type { EventoTipo } from './cs-tipos'
export const COR_EVENTO: Record<EventoTipo, string> = {
  live: 'bg-pink-500/15 text-pink-700 dark:text-pink-300',
  aula: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  sim: 'bg-amber-500/20 text-amber-800 dark:text-amber-300',
  mentoria: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  prazo: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
}
export const BARRA_EVENTO: Record<EventoTipo, string> = { live: 'bg-pink-500', aula: 'bg-blue-500', sim: 'bg-amber-500', mentoria: 'bg-teal-500', prazo: 'bg-rose-500' }
