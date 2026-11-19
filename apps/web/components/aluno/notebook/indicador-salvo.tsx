'use client'
import { rotuloIndicador, type Estado } from '@/lib/aluno/notebook-autosave'

export function IndicadorSalvo({ fase, online, semPersistencia, onRetry }: { fase: Estado['fase']; online: boolean; semPersistencia: boolean; onRetry: () => void }) {
  const txt = rotuloIndicador(fase, online, semPersistencia)
  const ruim = fase === 'erro' || fase === 'conflito'
  const cor = ruim ? 'var(--danger)' : fase === 'offline' || !online ? 'var(--accentInk)' : 'var(--muted)'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: cor }}>
      <span role="status" aria-live="polite">{txt}</span>
      {fase === 'erro' ? (
        <button type="button" onClick={onRetry} style={{ minHeight: 32, padding: '0 10px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}>Tentar de novo</button>
      ) : null}
    </span>
  )
}
