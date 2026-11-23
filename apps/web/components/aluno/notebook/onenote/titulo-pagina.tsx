'use client'
// Título grande (peso leve) com linha fina e data/hora da página embaixo — canvas do Caderno OneNote.
import { dataHoraPagina } from './tipos'

export function TituloOneNote({ id, valor, onChange, criadoEm }: { id: string; valor: string; onChange: (v: string) => void; criadoEm?: string | null }) {
  return (
    <div style={{ padding: '10px 2px 8px' }}>
      <input id={id} value={valor} onChange={(e) => onChange(e.target.value)} placeholder="Título da página" aria-label="Título da página" maxLength={200}
        style={{ display: 'block', width: '100%', background: 'transparent', border: 0, borderBottom: '1px solid var(--line2)', outline: 'none', fontSize: 30, fontWeight: 300, lineHeight: 1.25, color: 'var(--ink)', padding: '4px 0 6px', fontFamily: "'Segoe UI', system-ui, sans-serif" }} />
      <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--muted)' }}>{dataHoraPagina(criadoEm)}</div>
    </div>
  )
}
