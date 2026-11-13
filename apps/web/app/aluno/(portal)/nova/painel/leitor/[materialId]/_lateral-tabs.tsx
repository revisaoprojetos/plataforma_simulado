'use client'

// Lateral esquerda do leitor (Sumário | Atualizações). A aba "Atualizações" lista o registro de versões PUBLICADO e visível
// do documento, carregado SOB DEMANDA (GET /api/aluno/atualizacoes?documentoId=…, paginado no servidor, mais recente primeiro).
// Abas com sublinhado (border-b-2), cores só por tokens da área nova. Sem cálculo no render: tag (data/hora) e rótulo vêm prontos do servidor, já com os interruptores do admin.

import { useCallback, useRef, useState, type ReactNode } from 'react'

interface Item { id: string; rotulo: string | null; texto: string; itens: { texto: string; local?: string | null }[]; tag: string | null }

export function LateralTabs({ documentoId, recente, children }: { documentoId: string; recente: boolean; children: ReactNode }) {
  const [aba, setAba] = useState<'sumario' | 'atualizacoes'>('sumario')
  const [rows, setRows] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState(false)
  const [iniciou, setIniciou] = useState(false)
  const [ponto, setPonto] = useState(recente)
  const pagina = useRef(0)

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(false)
    try {
      const r = await fetch(`/api/aluno/atualizacoes?documentoId=${encodeURIComponent(documentoId)}&page=${pagina.current + 1}&pp=10`, { credentials: 'same-origin' })
      if (!r.ok) throw new Error(String(r.status))
      const j = await r.json()
      pagina.current += 1
      setTotal(Number(j.total) || 0)
      setRows((cur) => [...cur, ...((j.rows ?? []) as any[]).map((x) => ({ id: x.id, rotulo: x.rotuloExibido ?? null, texto: x.texto ?? '', itens: x.itens ?? [], tag: x.tag ?? null }))])
    } catch { setErro(true) } finally { setCarregando(false); setIniciou(true) }
  }, [documentoId])

  function abrir(a: 'sumario' | 'atualizacoes') {
    setAba(a)
    if (a === 'atualizacoes') { setPonto(false); if (!iniciou && !carregando) void carregar() }
  }

  const tab = (id: 'sumario' | 'atualizacoes', rotulo: string, indicador?: boolean) => (
    <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => abrir(id)}
      style={{ flex: 1, height: 38, background: 'transparent', border: 0, borderBottom: `2px solid ${aba === id ? 'var(--brand)' : 'var(--line)'}`, color: aba === id ? 'var(--brand)' : 'var(--muted)', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
      {rotulo}{indicador && <i aria-label="Novidade" style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 99, background: 'var(--brand)', marginLeft: 6, verticalAlign: 'middle' }} />}
    </button>
  )

  return (
    <>
      <div role="tablist" style={{ display: 'flex' }}>{tab('sumario', 'Sumário')}{tab('atualizacoes', 'Atualizações', ponto)}</div>
      <div style={{ display: aba === 'sumario' ? 'contents' : 'none' }}>{children}</div>
      {aba === 'atualizacoes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((n) => (
            <div key={n.id} style={{ padding: 12, borderRadius: 12, background: 'var(--surface2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {n.rotulo && <b style={{ fontSize: 13, color: 'var(--ink)' }}>{n.rotulo}</b>}
              {(n.tag || n.texto) && <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{n.tag && <b style={{ color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{n.tag}{n.texto ? ': ' : ''}</b>}{n.texto}</span>}
              {n.itens.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {n.itens.map((it, k) => <li key={k} style={{ fontSize: 12.5, color: 'var(--muted)' }}>{it.texto}{it.local ? ` — ${it.local}` : ''}</li>)}
                </ul>
              )}
            </div>
          ))}
          {carregando && <span style={{ fontSize: 12.5, color: 'var(--muted)', textAlign: 'center' }}>Carregando…</span>}
          {!carregando && erro && (
            <div style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--muted)' }}>
              Não foi possível carregar as atualizações agora.{' '}
              <button type="button" onClick={() => void carregar()} style={{ background: 'transparent', border: 0, color: 'var(--brand)', fontWeight: 800, cursor: 'pointer' }}>Tentar de novo</button>
            </div>
          )}
          {!carregando && !erro && iniciou && rows.length === 0 && (
            <span style={{ fontSize: 12.5, color: 'var(--muted)', textAlign: 'center', padding: '14px 6px' }}>Este material ainda não teve atualizações publicadas. Quando houver, elas aparecem aqui.</span>
          )}
          {!carregando && !erro && rows.length > 0 && rows.length < total && (
            <button type="button" onClick={() => void carregar()} style={{ alignSelf: 'center', height: 34, padding: '0 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Carregar mais</button>
          )}
        </div>
      )}
    </>
  )
}
