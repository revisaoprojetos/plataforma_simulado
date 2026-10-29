'use client'
// "Todos os meus cursos" — filtros (Em andamento / Concluídos / Todos) + troca Grade/Lista.
// DADO REAL: recebe os cursos do aluno (pastas-raiz da Biblioteca) via prop e os agrupa por progresso.
// Só este bloco é interativo; o Meu foco fica no server component e não muda com os filtros.
import * as React from 'react'
import { Card, Col, Row, Muted, Tag, Btn, Bar, Media, Cover, GR } from '@/components/nova/ui'
import { Icon, type IconName } from '@/components/nova/icons'
import { R } from '@/lib/nova/rotas'
import type { CursoResumo } from '@/lib/nova/cursos'

type Filtro = 'andamento' | 'concluido' | 'todos'
type Vista = 'grade' | 'lista'

const PALETA = Object.values(GR)
function gradDe(cor: string | null | undefined, i: number): string {
  if (cor) return `linear-gradient(135deg, ${cor}, color-mix(in oklab, ${cor} 55%, #0b0a1a))`
  return PALETA[i % PALETA.length]
}
function abreviar(txt: string, max = 16): string {
  const t = (txt || 'Curso').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}
function statusDe(c: CursoResumo): Exclude<Filtro, 'todos'> { return c.concluido ? 'concluido' : 'andamento' }
function seloDe(c: CursoResumo): { t: string; k: 'brand' | 'gold' | 'green' | 'gray'; icon?: 'check' } {
  if (c.concluido) return { t: 'Concluído', k: 'green', icon: 'check' }
  if (c.pct > 0) return { t: 'Em andamento', k: 'brand' }
  return { t: 'Não iniciado', k: 'gray' }
}
function passa(c: CursoResumo, f: Filtro) { return f === 'todos' || statusDe(c) === f }

function Meta({ c }: { c: CursoResumo }) {
  return <Muted size={12.5}>{c.pdfs.toLocaleString('pt-BR')} materiais · {c.lidos.toLocaleString('pt-BR')} lidos</Muted>
}

function CardGrade({ c, i }: { c: CursoResumo; i: number }) {
  const selo = seloDe(c)
  return (
    <Card pad={0} style={{ overflow: 'hidden', gap: 0 }}>
      <Media ratio="16:9" fallback={<Cover line="CURSO" sigla={abreviar(c.titulo)} grad={gradDe(c.cor, i)} />} />
      <Col gap={10} style={{ padding: 18, flex: 1 }}>
        <Tag kind={selo.k} icon={selo.icon}>{selo.t}</Tag>
        <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{c.titulo}</div>
        <Meta c={c} />
        <Row gap={10} style={{ flexWrap: 'nowrap' }}><Bar pct={c.pct} style={{ flex: 1 }} /><b style={{ fontSize: 12.5, color: 'var(--ink)' }}>{c.pct}%</b></Row>
        <Row gap={8} style={{ marginTop: 'auto' }}><Btn kind={c.pct > 0 ? 'primary' : 'secondary'} icon={c.pct > 0 ? 'play' : undefined} size="sm" href={R.curso(c.id)}>{c.pct > 0 ? 'Continuar' : 'Abrir curso'}</Btn></Row>
      </Col>
    </Card>
  )
}

function RowLista({ c, i }: { c: CursoResumo; i: number }) {
  return (
    <Card pad={14}>
      <Row style={{ flexWrap: 'nowrap', gap: 16 }}>
        <div style={{ width: 150, flexShrink: 0, borderRadius: 12, overflow: 'hidden' }}>
          <Media ratio="16:9" fallback={<Cover line="CURSO" sigla={abreviar(c.titulo)} grad={gradDe(c.cor, i)} big={16} />} />
        </div>
        <Col gap={4} style={{ minWidth: 0, flex: '1 1 200px' }}>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{c.titulo}</div>
          <Meta c={c} />
        </Col>
        <Row gap={10} style={{ flexWrap: 'nowrap', flex: '0 1 220px' }}><Bar pct={c.pct} style={{ flex: 1 }} /><b style={{ fontSize: 12.5, color: 'var(--ink)' }}>{c.pct}%</b></Row>
        <Btn kind={c.pct > 0 ? 'primary' : 'secondary'} icon={c.pct > 0 ? 'play' : undefined} size="sm" href={R.curso(c.id)}>{c.pct > 0 ? 'Continuar' : 'Abrir'}</Btn>
      </Row>
    </Card>
  )
}

function MiniSeg<T extends string>({ items, active, onPick }: { items: [T, string, IconName?][]; active: T; onPick: (v: T) => void }) {
  return (
    <div style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: 13, background: 'var(--track)' }}>
      {items.map(([v, label, icon]) => {
        const on = v === active
        return (
          <button key={v} type="button" onClick={() => onPick(v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', borderRadius: 10, fontSize: 13, whiteSpace: 'nowrap', fontWeight: on ? 800 : 700, color: on ? 'var(--ink)' : 'var(--muted)', background: on ? 'var(--surface)' : 'transparent', boxShadow: on ? '0 2px 8px rgba(30,15,80,.1)' : 'none', border: 0, cursor: 'pointer' }}>{icon ? <Icon n={icon} size={14} /> : null}{label}</button>
        )
      })}
    </div>
  )
}

function Grupo({ titulo, cursos, vista }: { titulo: string; cursos: CursoResumo[]; vista: Vista }) {
  if (cursos.length === 0) return null
  return (
    <Col gap={14}>
      <Row gap={8}>
        <b style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{titulo}</b>
        <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 7px', borderRadius: 99, background: 'var(--chip)', color: 'var(--brand)' }}>{cursos.length}</span>
      </Row>
      {vista === 'grade'
        ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: 16, alignItems: 'stretch' }}>{cursos.map((c, i) => <CardGrade key={c.id} c={c} i={i} />)}</div>
        : <Col gap={12}>{cursos.map((c, i) => <RowLista key={c.id} c={c} i={i} />)}</Col>}
    </Col>
  )
}

export function VistaTodos({ cursos = [] }: { cursos?: CursoResumo[] }) {
  const [filtro, setFiltro] = React.useState<Filtro>('todos')
  const [vista, setVista] = React.useState<Vista>('grade')
  const visiveis = cursos.filter((c) => passa(c, filtro))
  const andamento = visiveis.filter((c) => statusDe(c) === 'andamento')
  const concluidos = visiveis.filter((c) => statusDe(c) === 'concluido')

  if (cursos.length === 0) return null

  return (
    <Col gap={18}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <Col gap={4}>
          <b style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)' }}>Todos os meus cursos</b>
          <Muted size={12.5}>Os filtros mudam só esta parte.</Muted>
        </Col>
        <Row gap={10}>
          <MiniSeg items={[['andamento', 'Em andamento'], ['concluido', 'Concluídos'], ['todos', 'Todos']]} active={filtro} onPick={setFiltro} />
          <MiniSeg items={[['grade', 'Grade', 'grid'], ['lista', 'Lista', 'list']]} active={vista} onPick={setVista} />
        </Row>
      </div>
      {andamento.length === 0 && concluidos.length === 0
        ? <Card><Muted>Nenhum curso neste filtro.</Muted></Card>
        : <><Grupo titulo="Em andamento" cursos={andamento} vista={vista} /><Grupo titulo="Concluídos" cursos={concluidos} vista={vista} /></>}
    </Col>
  )
}
