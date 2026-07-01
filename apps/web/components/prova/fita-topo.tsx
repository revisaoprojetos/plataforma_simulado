export const FITA_GRADIENT = 'linear-gradient(90deg, var(--prova-fita1, #2563eb), var(--prova-fita2, #f59e0b), var(--prova-fita3, #8b5cf6))'

/** Fita de gradiente no topo dos cards principais (editável via cores do HUD). */
export function FitaTopo() {
  return <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1.5" style={{ background: FITA_GRADIENT }} />
}
