'use client'
// Seções automáticas do Caderno (erros/favoritos): somente leitura, paginadas no servidor. SEM TipTap (módulo leve do chunk da casca).
import { useCallback, useEffect, useState } from 'react'
import type { QuestaoAluno } from '@/components/aluno/questao-resolvivel'
import { htmlParaTexto } from '@/lib/aluno/notebook-texto-html'
import { carregarAuto } from './cliente-caderno'

const btn: React.CSSProperties = { minHeight: 44, padding: '0 16px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }

export function ListaAuto({ tipo }: { tipo: 'erros' | 'favoritos' }) {
  const [itens, setItens] = useState<QuestaoAluno[]>([])
  const [total, setTotal] = useState(0)
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro'>('carregando')
  const carregarMais = useCallback(async (offset: number) => {
    setEstado('carregando')
    const r = await carregarAuto(tipo, offset)
    if (!r.ok || !r.dados) { setEstado('erro'); return }
    const novos = (r.dados.itens ?? []) as QuestaoAluno[]
    setItens((a) => (offset === 0 ? novos : [...a, ...novos])); setTotal(r.dados.total ?? 0); setEstado('ok')
  }, [tipo])
  useEffect(() => { void carregarMais(0) }, [carregarMais])
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', margin: '0 0 12px' }}>{tipo === 'erros' ? 'Questões que errei' : 'Questões salvas'}</h2>
      {estado === 'erro' ? <p style={{ color: 'var(--danger)', fontSize: 14 }}>Não foi possível carregar. <button type="button" style={btn} onClick={() => carregarMais(0)}>Tentar de novo</button></p> : null}
      {estado === 'ok' && itens.length === 0 ? <p style={{ color: 'var(--muted)', fontSize: 14 }}>Nada por aqui ainda.</p> : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {itens.map((q, i) => (
          <div key={q.id || i} style={{ border: '1px solid var(--line)', background: 'var(--surface2)', borderRadius: 14, padding: '12px 14px', fontSize: 14, lineHeight: 1.55, color: 'var(--ink)', overflowWrap: 'anywhere' }}>
            {[q.disciplina, q.banca, q.ano].filter(Boolean).length ? <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)', marginBottom: 4 }}>{[q.disciplina, q.banca, q.ano].filter(Boolean).join(' · ')}</div> : null}
            {(() => { const t = htmlParaTexto(typeof q.enunciado === 'string' ? q.enunciado : ''); return t.length > 400 ? t.slice(0, 400) + '…' : t || 'Questão' })()}
          </div>
        ))}
      </div>
      {estado === 'carregando' ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>Carregando…</p> : null}
      {estado === 'ok' && itens.length < total ? <button type="button" style={{ ...btn, marginTop: 12 }} onClick={() => carregarMais(itens.length)}>Carregar mais</button> : null}
    </div>
  )
}
