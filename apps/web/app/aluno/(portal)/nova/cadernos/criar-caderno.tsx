'use client'

// Cartão "Criar caderno" de Meus Cadernos (novo): abre um campo de nome e cria via POST
// /api/aluno/cadernos (mesma API do gerenciador antigo); ao criar, abre o caderno novo.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/nova/icons'
import { Muted } from '@/components/nova/ui'

export function CriarCadernoCard() {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    const n = nome.trim()
    if (!n || salvando) return
    setSalvando(true); setErro(null)
    try {
      const r = await fetch('/api/aluno/cadernos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nome: n }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j?.caderno?.id) throw new Error(j?.message || 'Não foi possível criar o caderno.')
      router.push(`/aluno/cadernos/${j.caderno.id}`)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível criar o caderno.')
      setSalvando(false)
    }
  }

  const caixa: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center', minHeight: 220, padding: 24, borderRadius: 20, border: '2px dashed var(--line2)', background: 'var(--surface)', width: '100%', font: 'inherit', cursor: 'pointer' }
  const bolinha = <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: 'var(--gold)', color: 'var(--goldInk)' }}><Icon n="plus" size={24} /></span>

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} style={caixa}>
        {bolinha}
        <b style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Criar caderno</b>
        <Muted size={12.5}>organize questões para revisar depois</Muted>
      </button>
    )
  }
  return (
    <form onSubmit={criar} style={{ ...caixa, cursor: 'default' }}>
      {bolinha}
      <b style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Nome do caderno</b>
      <input
        autoFocus value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} placeholder="Ex.: Revisão de Direito Tributário"
        style={{ width: '100%', maxWidth: 320, height: 42, padding: '0 12px', borderRadius: 12, border: '1px solid var(--line2)', background: 'var(--surface)', color: 'var(--ink)', font: 'inherit', fontSize: 14 }}
      />
      {erro && <span style={{ fontSize: 12.5, color: 'var(--pn-c0392b,#c0392b)' }}>{erro}</span>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => { setAberto(false); setNome(''); setErro(null) }} disabled={salvando}
          style={{ height: 38, padding: '0 14px', borderRadius: 12, border: '1px solid var(--line2)', background: 'transparent', color: 'var(--ink)', font: 'inherit', fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
        <button type="submit" disabled={salvando || !nome.trim()}
          style={{ height: 38, padding: '0 16px', borderRadius: 12, border: 0, background: 'var(--gold)', color: 'var(--goldInk)', font: 'inherit', fontWeight: 800, cursor: 'pointer', opacity: salvando || !nome.trim() ? 0.6 : 1 }}>{salvando ? 'Criando…' : 'Criar'}</button>
      </div>
    </form>
  )
}
