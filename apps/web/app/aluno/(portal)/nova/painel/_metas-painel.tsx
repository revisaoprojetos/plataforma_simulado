'use client'
// Metas de hoje do Meu painel de estudos — dado REAL do CRONOGRAMA ADAPTATIVO FIXADO. "Concluir"
// marca a meta de verdade via POST /api/aluno/cronograma/adaptativo (acao:'meta', estado 'done'|null),
// igual ao wrapper do iframe. Usamos ROTA DE API (não server action) por causa do landmine conhecido:
// server actions do Next são rejeitadas em domínio custom atrás do Traefik.
// A marcação é OTIMISTA (overrides locais que sobrevivem ao router.refresh), pois o snapshot do Painel
// só recomputa quando o dia vira — ver ressalva no relato.
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Tag, Muted, Btn, H3, Row } from '@/components/nova/ui'
import { Icon } from '@/components/nova/icons'

const CRONOGRAMA = '/aluno/cronograma'

export type MetaPainel = {
  id: string
  sel: string; selKind: 'brand' | 'gold' | 'green'
  dur: string; titulo: string; sub: string
  concluida: boolean; data?: string | null
}

export function MetasPainel({ metas }: { metas: MetaPainel[] }) {
  const router = useRouter()
  // Overrides otimistas por meta (id -> concluida). Persistem entre re-renders/refresh (o snapshot
  // do Painel pode servir estado antigo até recomputar), então NÃO são sobrescritos pelas props.
  const [over, setOver] = React.useState<Record<string, boolean>>({})
  const [busy, setBusy] = React.useState<string | null>(null)
  const concluidaDe = (m: MetaPainel) => (m.id in over ? over[m.id] : m.concluida)

  const toggle = (m: MetaPainel) => {
    const next = !concluidaDe(m)
    setOver((o) => ({ ...o, [m.id]: next })) // otimista
    setBusy(m.id)
    fetch('/api/aluno/cronograma/adaptativo', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'meta', metaId: m.id, patch: { estado: next ? 'done' : null } }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (!j?.ok) { setOver((o) => ({ ...o, [m.id]: !next })); return } // reverte
        router.refresh() // atualiza stats do servidor quando o snapshot recomputar
      })
      .catch(() => setOver((o) => ({ ...o, [m.id]: !next })))
      .finally(() => setBusy((b) => (b === m.id ? null : b)))
  }

  const btnRaw: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', borderRadius: 11, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
  if (metas.length === 0) {
    return <div style={{ padding: '18px 14px', borderRadius: 12, background: 'var(--surface2)', textAlign: 'center' }}><Muted size={13}>Nenhuma meta programada para hoje.</Muted></div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {metas.map((m) => {
        const concluida = concluidaDe(m)
        const pending = busy === m.id
        return (
        <div key={m.id} style={{ border: '1px solid var(--line)', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Row style={{ justifyContent: 'space-between', gap: 10 }}>
            <Row gap={10}><Tag kind={m.selKind}>{m.sel}</Tag>{m.dur ? <Muted size={12.5}>{m.dur}</Muted> : null}</Row>
          </Row>
          <H3><span style={{ textDecoration: concluida ? 'line-through' : 'none', color: concluida ? 'var(--muted)' : 'var(--ink)' }}>{m.titulo}</span></H3>
          {m.sub ? <Muted size={12.5}>{m.sub}</Muted> : null}
          {concluida ? (
            <Row gap={10} style={{ alignItems: 'center' }}>
              <Tag kind="green" icon="check">Concluída</Tag>
              <button type="button" onClick={() => toggle(m)} disabled={pending} style={{ background: 'transparent', border: 0, color: 'var(--muted)', fontSize: 12.5, fontWeight: 700, cursor: pending ? 'default' : 'pointer', textDecoration: 'underline' }}>Desfazer</button>
            </Row>
          ) : (
            <Row gap={8}>
              <Btn kind="primary" size="sm" icon="play" href={CRONOGRAMA}>Continuar meta</Btn>
              <button type="button" onClick={() => toggle(m)} disabled={pending} style={{ ...btnRaw, opacity: pending ? 0.6 : 1 }}><Icon n="check" size={15} />Concluir</button>
            </Row>
          )}
        </div>
        )
      })}
    </div>
  )
}
