'use client'
// Lixeira do caderno ("Notas excluídas"): páginas/seções excluídas com restauração (~60 dias).
import { useCallback, useEffect, useState } from 'react'
import { FileText, FolderOpen, RotateCcw, X } from 'lucide-react'
import { listarLixeira, restaurarPagina, restaurarSecao } from './cliente-caderno'
import type { ItemLixeiraPagina, ItemLixeiraSecao } from '@/lib/aluno/notebook-tipos'
import { FONTE_UI } from './tipos'

const fmt = (iso?: string | null) => {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' }) } catch { return '' }
}

export function PainelLixeira({ onFechar, onRestaurado }: { onFechar: () => void; onRestaurado: () => void }) {
  type Linha = ({ tipo: 'secao' } & ItemLixeiraSecao & { titulo: string }) | ({ tipo: 'pagina' } & ItemLixeiraPagina)
  const [itens, setItens] = useState<Linha[]>([])
  const [totais, setTotais] = useState({ paginas: 0, secoes: 0 })
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro' | 'indisponivel'>('carregando')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const carregar = useCallback(async (anexar = false) => {
    setEstado('carregando')
    const off = anexar ? itens.length : 0 // listas paginadas no servidor (offset por lista; aprox. pelo total já carregado)
    const r = await listarLixeira(anexar ? itens.filter((i) => i.tipo === 'pagina').length : 0, 30)
    if (!r.ok || !r.dados) { setEstado(r.status === 404 || r.status === 503 ? 'indisponivel' : 'erro'); return }
    const sec: Linha[] = anexar ? [] : (r.dados.secoes ?? []).map((x) => ({ ...x, tipo: 'secao' as const, titulo: x.nome }))
    const pag: Linha[] = (r.dados.paginas ?? []).map((x) => ({ ...x, tipo: 'pagina' as const }))
    setItens((l) => (anexar ? [...l, ...pag] : [...sec, ...pag]))
    setTotais({ paginas: r.dados.total_paginas ?? 0, secoes: r.dados.total_secoes ?? 0 }); setEstado('ok')
    void off
  }, [itens])
  useEffect(() => { void carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f)
  }, [onFechar])

  const restaurar = async (it: Linha) => {
    setOcupado(it.id); setAviso(null)
    const r = it.tipo === 'secao' ? await restaurarSecao(it.id) : await restaurarPagina(it.id)
    setOcupado(null)
    if (!r.ok) { setAviso('Não foi possível restaurar (a seção da página pode ter sido excluída).'); return }
    setItens((l) => l.filter((x) => !(x.id === it.id && x.tipo === it.tipo)))
    onRestaurado()
  }

  return (
    <aside role="dialog" aria-label="Notas excluídas" style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(360px, 100%)', zIndex: 60, display: 'flex', flexDirection: 'column',
      background: 'var(--surface)', color: 'var(--ink)', borderLeft: '1px solid var(--line2)', fontFamily: FONTE_UI, boxShadow: '-8px 0 24px -12px color-mix(in srgb, var(--ink) 40%, transparent)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', height: 40, padding: '0 6px 0 14px', borderBottom: '1px solid var(--line)' }}>
        <strong style={{ flex: 1, fontSize: 14 }}>Notas excluídas</strong>
        <button type="button" onClick={onFechar} aria-label="Fechar lixeira" style={{ width: 32, height: 32, border: 0, background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}><X size={16} aria-hidden /></button>
      </div>
      <p style={{ margin: 0, padding: '8px 14px', fontSize: 12, color: 'var(--muted)' }}>Itens excluídos ficam aqui por cerca de 60 dias e podem ser restaurados.</p>
      {aviso ? <p role="alert" style={{ margin: 0, padding: '8px 14px', fontSize: 12.5, color: 'var(--danger)' }}>{aviso}</p> : null}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {estado === 'carregando' ? <p style={{ padding: 14, fontSize: 13, color: 'var(--muted)' }}>Carregando…</p> : null}
        {estado === 'indisponivel' ? <p style={{ padding: 14, fontSize: 13, color: 'var(--muted)' }}>A lixeira estará disponível em breve.</p> : null}
        {estado === 'erro' ? <p style={{ padding: 14, fontSize: 13, color: 'var(--danger)' }}>Não foi possível carregar. <button type="button" onClick={() => carregar()} style={{ border: 0, background: 'transparent', color: 'var(--brand)', fontWeight: 700, cursor: 'pointer' }}>Tentar de novo</button></p> : null}
        {estado === 'ok' && itens.length === 0 ? <p style={{ padding: 14, fontSize: 13, color: 'var(--muted)' }}>A lixeira está vazia.</p> : null}
        {itens.map((it) => (
          <div key={`${it.tipo}-${it.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--line)' }}>
            {it.tipo === 'secao' ? <FolderOpen size={16} aria-hidden style={{ color: 'var(--brand)', flexShrink: 0 }} /> : <FileText size={16} aria-hidden style={{ color: 'var(--muted)', flexShrink: 0 }} />}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.titulo || 'Página sem título'}</span>
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{it.tipo === 'secao' ? `Seção · ${it.qtd_paginas} página(s)` : `Página${it.secao_nome ? ` · ${it.secao_nome}` : ''}`}{it.deletado_em ? ` · excluída em ${fmt(it.deletado_em)}` : ''}{it.tipo === 'pagina' && it.secao_deletada ? ' · restaure a seção primeiro' : ''}</span>
            </span>
            <button type="button" disabled={ocupado === it.id || (it.tipo === 'pagina' && it.secao_deletada)} onClick={() => restaurar(it)} title="Restaurar"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 28, padding: '0 10px', border: '1px solid var(--line2)', borderRadius: 4, background: 'transparent', color: 'var(--brand)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              <RotateCcw size={13} aria-hidden />Restaurar
            </button>
          </div>
        ))}
        {estado === 'ok' && itens.filter((i) => i.tipo === 'pagina').length < totais.paginas ? (
          <button type="button" onClick={() => carregar(true)} style={{ width: '100%', height: 36, border: 0, background: 'transparent', color: 'var(--brand)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Carregar mais</button>
        ) : null}
      </div>
    </aside>
  )
}
