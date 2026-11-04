export const FITA_GRADIENT = 'linear-gradient(90deg, var(--prova-fita1, var(--pn-2563eb,#2563eb)), var(--prova-fita2, var(--pn-f59e0b,#f59e0b)), var(--prova-fita3, var(--pn-8b5cf6,#8b5cf6)))'

/** Fita de gradiente no topo dos cards principais (editável via cores do HUD). */
export function FitaTopo() {
  return <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1.5" style={{ background: FITA_GRADIENT }} />
}
