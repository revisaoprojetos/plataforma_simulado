'use client'

// Interação do Banco de questões (filtros). Dados iniciais vêm do server (page.tsx);
// aqui só o rascunho de filtro + navegação por URL (searchParams). Visual = porte fiel do canvas.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, H3, Btn, Row, Col } from '@/components/nova/ui'
import { Icon } from '@/components/nova/icons'
import { R } from '@/lib/nova/rotas'

export type Opt = { id: string; nome: string }
export type AssuntoOpt = { id: string; nome: string; disciplina_id: string | null }
export type BancoParams = {
  disciplina?: string; assunto?: string; banca?: string; ano?: string
  dificuldade?: string; busca?: string; comentadas?: string; minhas?: string
}

const DIFICULDADES = [{ v: 'facil', r: 'Fácil' }, { v: 'medio', r: 'Médio' }, { v: 'dificil', r: 'Difícil' }]

function urlDe(p: BancoParams): string {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(p)) if (v) usp.set(k, String(v))
  const qs = usp.toString()
  return qs ? `${R.banco}?${qs}` : R.banco
}

const SELECT_WRAP: React.CSSProperties = { position: 'relative', display: 'flex', alignItems: 'center', height: 44, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)' }
const SELECT_EL: React.CSSProperties = { appearance: 'none', WebkitAppearance: 'none', width: '100%', height: '100%', padding: '0 36px 0 14px', border: 0, background: 'transparent', color: 'var(--ink)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', outline: 0 }

function Lbl({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', color: 'var(--muted)' }}>{children}</span>
}

function Sel({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <Col gap={7}>
      <Lbl>{label}</Lbl>
      <span style={SELECT_WRAP}>
        <select value={value} onChange={(e) => onChange(e.target.value)} style={SELECT_EL}>{children}</select>
        <Icon n="chevd" size={16} style={{ position: 'absolute', right: 12, color: 'var(--muted2)', pointerEvents: 'none' }} />
      </span>
    </Col>
  )
}

// Select só-exibição (filtro sem fonte de dados no banco ainda). Mantém o layout do canvas.
function SelExemplo({ label, value }: { label: string; value: string }) {
  return (
    <Col gap={7}>
      <Lbl>{label}</Lbl>
      <span style={{ ...SELECT_WRAP, opacity: 0.6 }} title="Em breve">
        <span style={{ flex: 1, padding: '0 14px', color: 'var(--ink)', fontSize: 13.5, fontWeight: 700 }}>{value}</span>
        <Icon n="chevd" size={16} style={{ marginRight: 12, color: 'var(--muted2)' }} />
      </span>
    </Col>
  )
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span style={{ position: 'relative', width: 40, height: 23, borderRadius: 99, flexShrink: 0, background: on ? 'var(--brand)' : 'var(--track)' }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 20 : 3, width: 17, height: 17, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
    </span>
  )
}

function ToggleRow({ label, on, onClick, disabled }: { label: string; on: boolean; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'nowrap', width: '100%', border: 0, background: 'transparent', padding: 0, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1 }}>
      <span style={{ fontSize: 13, color: 'var(--ink)', textAlign: 'left' }}>{label}</span>
      <Toggle on={on} />
    </button>
  )
}

export function BancoFiltros({ disciplinas, assuntos, bancas, anos, total, params }: {
  disciplinas: Opt[]; assuntos: AssuntoOpt[]; bancas: Opt[]; anos: number[]; total: number; params: BancoParams
}) {
  const router = useRouter()
  const [f, setF] = useState<BancoParams>({ ...params })
  const set = (k: keyof BancoParams, v: string) => setF((p) => ({ ...p, [k]: v || undefined }))
  const assuntosDaDisc = f.disciplina ? assuntos.filter((a) => a.disciplina_id === f.disciplina) : assuntos
  const aplicar = () => router.push(urlDe({ ...f, minhas: params.minhas }))
  const limpar = () => { setF({}); router.push(R.banco) }

  return (
    <Card>
      <Row gap={8} style={{ justifyContent: 'space-between' }}>
        <H3><Icon n="sliders" size={15} /> Filtros</H3>
        <Btn kind="link" onClick={limpar}>Limpar</Btn>
      </Row>

      <span style={{ display: 'flex', alignItems: 'center', gap: 10, height: 46, padding: '0 14px', borderRadius: 13, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--muted)' }}>
        <Icon n="search" size={16} />
        <input value={f.busca ?? ''} onChange={(e) => set('busca', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') aplicar() }}
          placeholder="Palavra-chave ou nº da questão"
          style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', font: 'inherit', fontSize: 14, color: 'var(--ink)' }} />
      </span>

      <Sel label="DISCIPLINA" value={f.disciplina ?? ''} onChange={(v) => setF((p) => ({ ...p, disciplina: v || undefined, assunto: undefined }))}>
        <option value="">Todas</option>
        {disciplinas.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
      </Sel>
      <Sel label="ASSUNTO" value={f.assunto ?? ''} onChange={(v) => set('assunto', v)}>
        <option value="">Todos</option>
        {assuntosDaDisc.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
      </Sel>
      <Sel label="BANCA" value={f.banca ?? ''} onChange={(v) => set('banca', v)}>
        <option value="">Todas</option>
        {bancas.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
      </Sel>
      {/* TODO(dados): não há coluna/tabela de ÓRGÃO nas questões (simulado_questoes) — select de exemplo. */}
      <SelExemplo label="ÓRGÃO" value="Todos" />
      <Sel label="ANO" value={f.ano ?? ''} onChange={(v) => set('ano', v)}>
        <option value="">Todos</option>
        {anos.map((a) => <option key={a} value={String(a)}>{a}</option>)}
      </Sel>
      {/* TODO(dados): não há coluna/tabela de CARGO nas questões — select de exemplo. */}
      <SelExemplo label="CARGO" value="Todos" />
      <Sel label="DIFICULDADE" value={f.dificuldade ?? ''} onChange={(v) => set('dificuldade', v)}>
        <option value="">Todas</option>
        {DIFICULDADES.map((d) => <option key={d.v} value={d.v}>{d.r}</option>)}
      </Sel>
      {/* TODO(dados): não há coluna de ESCOLARIDADE nas questões — select de exemplo. */}
      <SelExemplo label="ESCOLARIDADE" value="Superior" />

      <Col gap={10} style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
        {/* Anuladas/desconsideradas já são sempre removidas do banco (questoesForaDeJogoTenant). */}
        <ToggleRow label="Excluir anuladas e desatualizadas" on disabled />
        <ToggleRow label="Somente com comentário" on={f.comentadas === '1'} onClick={() => setF((p) => ({ ...p, comentadas: p.comentadas ? undefined : '1' }))} />
        {/* TODO(dados): não há marcador de "2ª fase" nas questões — toggle de exemplo. */}
        <ToggleRow label="Somente de provas de 2ª fase" on={false} disabled />
      </Col>

      <Btn kind="primary" icon="search" onClick={aplicar}>Filtrar {total.toLocaleString('pt-BR')} questões</Btn>
    </Card>
  )
}
