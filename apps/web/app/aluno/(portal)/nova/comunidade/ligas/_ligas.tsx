'use client'
// Parte interativa das Ligas: alternância Minha liga / Ranking geral + classificação clicável
// com painel de detalhes do aluno. Porte fiel de LigasRevisao.dc.html.
// DADO REAL quando a página passa props (ranking da liga/geral); fallback de EXEMPLO sem props.
// REGRA FORTE: terceiros só por INICIAIS (iniciaisDe no servidor); a própria linha = "Você".
import * as React from 'react'
import { Card, Row, Col, H3, Muted } from '@/components/nova/ui'
import { Icon, type IconName } from '@/components/nova/icons'
import { AvatarEstudante } from '@/components/aluno/avatar-estudante'
import { corAvatarPadrao } from '@/lib/aluno/avatar-padrao'

export interface LigaLinha { pos: number; code: string; nivel: number; xp: number; sim: number | null; q: number | null; ac: number | null; seq: number; conquistas: number | null; avatar?: string | null; avatarCor?: string | null; estudanteId?: string | null; eu?: boolean }
export interface GeralLinha { pos: number; code: string; ligaNome: string; ligaCor: string; xp: number; avatar?: string | null; avatarCor?: string | null; estudanteId?: string | null; eu?: boolean }
interface Props {
  ligaNome?: string
  liga?: LigaLinha[]
  geral?: GeralLinha[]
  totalAtivos?: number | null
}

// TODO(dados): classificação de EXEMPLO (usada só quando a página não passa props reais).
const LIGA_EXEMPLO: LigaLinha[] = [
  { pos: 1, code: 'Aluno O.F.', nivel: 37, xp: 2995, sim: 60, q: 1528, ac: 66, seq: 18, conquistas: 15 },
  { pos: 2, code: 'Aluno O.A.', nivel: 32, xp: 2593, sim: 48, q: 1168, ac: 39, seq: 17, conquistas: 14 },
  { pos: 3, code: 'Aluno I.T.', nivel: 31, xp: 2505, sim: 37, q: 1322, ac: 38, seq: 1, conquistas: 13 },
  { pos: 4, code: 'Aluno J.P.', nivel: 29, xp: 2355, sim: 40, q: 1242, ac: 48, seq: 20, conquistas: 12 },
  { pos: 5, code: 'Aluno H.E.', nivel: 28, xp: 2285, sim: 35, q: 1304, ac: 50, seq: 10, conquistas: 11 },
  { pos: 6, code: 'Aluno T.T.', nivel: 26, xp: 2108, sim: 33, q: 1002, ac: 58, seq: 2, conquistas: 10 },
  { pos: 7, code: 'Você', nivel: 26, xp: 2101, sim: 51, q: 1240, ac: 36, seq: 0, conquistas: 9, eu: true },
  { pos: 8, code: 'Aluno F.A.', nivel: 25, xp: 2058, sim: 39, q: 873, ac: 53, seq: 10, conquistas: 8 },
  { pos: 9, code: 'Aluno B.F.', nivel: 23, xp: 1880, sim: 27, q: 978, ac: 65, seq: 5, conquistas: 8 },
  { pos: 10, code: 'Aluno C.R.', nivel: 23, xp: 1865, sim: 37, q: 791, ac: 59, seq: 13, conquistas: 7 },
  { pos: 11, code: 'Aluno M.N.', nivel: 21, xp: 1712, sim: 26, q: 677, ac: 43, seq: 6, conquistas: 7 },
  { pos: 12, code: 'Aluno T.B.', nivel: 20, xp: 1640, sim: 23, q: 666, ac: 47, seq: 18, conquistas: 6 },
  { pos: 13, code: 'Aluno P.O.', nivel: 18, xp: 1502, sim: 23, q: 748, ac: 45, seq: 20, conquistas: 6 },
  { pos: 14, code: 'Aluno C.O.', nivel: 17, xp: 1388, sim: 29, q: 741, ac: 72, seq: 2, conquistas: 5 },
  { pos: 15, code: 'Aluno G.L.', nivel: 15, xp: 1245, sim: 22, q: 637, ac: 72, seq: 15, conquistas: 5 },
  { pos: 16, code: 'Aluno L.C.', nivel: 13, xp: 1102, sim: 20, q: 459, ac: 47, seq: 0, conquistas: 4 },
  { pos: 17, code: 'Aluno P.L.', nivel: 12, xp: 980, sim: 20, q: 561, ac: 70, seq: 4, conquistas: 4 },
  { pos: 18, code: 'Aluno O.I.', nivel: 10, xp: 865, sim: 11, q: 534, ac: 36, seq: 0, conquistas: 3 },
]
// TODO(dados): ranking geral de EXEMPLO (usado só sem props reais).
const GERAL_EXEMPLO: GeralLinha[] = [
  { pos: 1, code: 'Aluno D.C.', ligaNome: 'Ametista', ligaCor: '#9B5DE5', xp: 9870 }, { pos: 2, code: 'Aluno H.C.', ligaNome: 'Ametista', ligaCor: '#9B5DE5', xp: 9412 },
  { pos: 3, code: 'Aluno L.L.', ligaNome: 'Ametista', ligaCor: '#9B5DE5', xp: 8960 }, { pos: 4, code: 'Aluno I.H.', ligaNome: 'Ametista', ligaCor: '#9B5DE5', xp: 8122 },
  { pos: 5, code: 'Aluno C.F.', ligaNome: 'Ametista', ligaCor: '#9B5DE5', xp: 7805 }, { pos: 6, code: 'Aluno D.S.', ligaNome: 'Diamante', ligaCor: '#3FB6E0', xp: 6930 },
  { pos: 7, code: 'Aluno I.J.', ligaNome: 'Diamante', ligaCor: '#3FB6E0', xp: 6511 }, { pos: 8, code: 'Aluno C.V.', ligaNome: 'Diamante', ligaCor: '#3FB6E0', xp: 6302 },
  { pos: 412, code: 'Você', ligaNome: 'Ouro', ligaCor: '#C98A12', xp: 2101, eu: true },
]
const GRID = '44px minmax(0,1.6fr) 1fr 0.8fr 0.9fr 0.8fr 0.8fr'
const n = (v: number) => v.toLocaleString('pt-BR')
const nn = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR'))
const acCor = (ac: number) => (ac >= 60 ? 'var(--ok)' : 'var(--accentInk)')
// XP da semana — TODO(dados): série de EXEMPLO (XP/dia por aluno não exposto). Determinística por posição.
const semana = (pos: number) => Array.from({ length: 7 }, (_, i) => Math.max(8, ((pos * 7 + i * 13) % 50) + 10))
const POR_PAGINA = 12

// Avatar do aluno — REUSA o componente canônico `AvatarEstudante`: foto real do perfil (com a cor
// atrás) e, na falta de foto, a CAPIVARA padrão determinística (mesmo render do resto do app, ex.
// sidebar). Sem foto própria → nunca ícone genérico. `seed` (id do aluno) varia a capivara por aluno.
function Avatar({ url, cor, seed, nome, size = 30 }: { url?: string | null; cor?: string | null; seed?: string | null; nome?: string | null; size?: number }) {
  // Cor de fundo PADRONIZADA (igual perfil/ranking): a própria (perfil_avatar_cor) ou uma
  // determinística pelo id/nome — NUNCA o cinza `bg-muted`. Ver corAvatarPadrao.
  const bg = cor || corAvatarPadrao(seed ?? nome)
  return (
    <span style={{ width: size, height: size, display: 'inline-flex', flexShrink: 0 }}>
      <AvatarEstudante nome={nome ?? ''} avatar={url} cor={bg} seed={seed ?? nome} className="h-full w-full" />
    </span>
  )
}

// Paginação padrão (Início · Anterior · Próxima · Final) + contador.
function Pager({ pag, total, onPag }: { pag: number; total: number; onPag: (p: number) => void }) {
  const totalPags = Math.max(1, Math.ceil(total / POR_PAGINA))
  if (totalPags <= 1) return null
  const ini = (pag - 1) * POR_PAGINA + 1
  const fim = Math.min(total, pag * POR_PAGINA)
  const Bt = ({ children, disabled, go }: { children: React.ReactNode; disabled: boolean; go: number }) => (
    <button type="button" disabled={disabled} onClick={() => onPag(go)}
      style={{ height: 32, padding: '0 11px', borderRadius: 9, border: '1px solid var(--line2)', background: 'var(--surface)', color: disabled ? 'var(--muted)' : 'var(--ink)', fontSize: 12.5, fontWeight: 700, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      {children}
    </button>
  )
  return (
    <Row style={{ justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, flexWrap: 'wrap', gap: 8 }}>
      <Muted size={12}>Mostrando {n(ini)}–{n(fim)} de {n(total)} · pág. {pag}/{totalPags}</Muted>
      <Row gap={6}>
        <Bt disabled={pag <= 1} go={1}>Início</Bt>
        <Bt disabled={pag <= 1} go={pag - 1}>Anterior</Bt>
        <Bt disabled={pag >= totalPags} go={pag + 1}>Próxima</Bt>
        <Bt disabled={pag >= totalPags} go={totalPags}>Final</Bt>
      </Row>
    </Row>
  )
}

export default function LigasInterativo({ ligaNome, liga, geral, totalAtivos }: Props) {
  const rows = liga && liga.length ? liga : LIGA_EXEMPLO
  const geralRows = geral && geral.length ? geral : GERAL_EXEMPLO
  const nomeLiga = ligaNome ?? 'Liga Ouro'
  const euIdx = Math.max(0, rows.findIndex((r) => r.eu))

  const [aba, setAba] = React.useState<'liga' | 'geral'>('liga')
  const [sel, setSel] = React.useState(euIdx)
  const [pagLiga, setPagLiga] = React.useState(1)
  const [pagGeral, setPagGeral] = React.useState(1)
  const d = rows[sel] ?? rows[0]
  const total = rows.length
  const ligaSlice = rows.slice((pagLiga - 1) * POR_PAGINA, pagLiga * POR_PAGINA)
  const geralSlice = geralRows.slice((pagGeral - 1) * POR_PAGINA, pagGeral * POR_PAGINA)
  // Zona ilustrativa do pódio/fim da liga (decorativa — promoção/rebaixamento ainda não é mecânica real).
  const zona = d.pos <= 3 ? ['Topo da liga', 'var(--ok)'] : d.pos >= total - 2 ? ['Fim da liga', 'var(--danger)'] : ['Zona neutra', 'var(--muted)']
  const sem = semana(d.pos); const max = Math.max(...sem)
  const dias = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

  return (
    <Col gap={16}>
      {/* Alternância */}
      <div style={{ display: 'inline-flex', width: 'fit-content', gap: 4, padding: 4, borderRadius: 15, background: 'var(--track)' }}>
        {([['liga', 'trophy', 'Minha liga'], ['geral', 'users', 'Ranking geral']] as const).map(([k, ic, lab]) => {
          const on = aba === k
          return (
            <button key={k} type="button" onClick={() => setAba(k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 16px', border: 0, borderRadius: 11, cursor: 'pointer', fontSize: 13.5, fontWeight: on ? 800 : 700, background: on ? 'var(--surface)' : 'transparent', color: on ? 'var(--ink)' : 'var(--muted)', boxShadow: on ? '0 2px 8px rgba(30,15,80,.1)' : 'none' }}>
              <Icon n={ic} size={15} />{lab}
            </button>
          )
        })}
      </div>

      {aba === 'liga' ? (
        <div className="np-split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 18, alignItems: 'start' }}>
          {/* Classificação */}
          <Card pad={18}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row gap={10}><Icon n="trophy" size={18} style={{ color: 'var(--brand)' }} /><H3>Classificação da {nomeLiga}</H3></Row>
              <Muted size={12}>Clique num aluno para ver os números</Muted>
            </Row>
            <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '0 12px 8px', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
              <span>#</span><span>Aluno</span><span>XP</span><span>Simulados</span><span>Questões</span><span>Acerto</span><span>Sequência</span>
            </div>
            <Col gap={2}>
              {ligaSlice.map((r, iLocal) => {
                const i = (pagLiga - 1) * POR_PAGINA + iLocal
                return (
                <button key={`${r.pos}-${i}`} type="button" onClick={() => setSel(i)} style={{ width: '100%', display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', gap: 12, padding: '9px 12px', border: 0, borderRadius: 12, cursor: 'pointer', textAlign: 'left', font: 'inherit', background: sel === i ? 'var(--chip)' : 'transparent', outline: r.eu ? '1.5px solid var(--brandLine)' : 'none', outlineOffset: -1.5 }}>
                  <b style={{ fontSize: 13.5, textAlign: 'center', color: r.pos <= 3 ? 'var(--ok)' : r.pos >= total - 2 ? 'var(--danger)' : 'var(--muted)' }}>{r.pos}</b>
                  <Row gap={10} style={{ flexWrap: 'nowrap', minWidth: 0 }}>
                    <Avatar url={r.avatar} cor={r.avatarCor} seed={r.estudanteId} nome={r.code} size={30} />
                    <Col gap={0} style={{ minWidth: 0 }}><b style={{ fontSize: 13.5, color: r.eu ? 'var(--brand)' : 'var(--ink)', whiteSpace: 'nowrap' }}>{r.code}</b><span style={{ fontSize: 11, color: 'var(--muted)' }}>Nível {r.nivel}</span></Col>
                  </Row>
                  <b style={{ fontSize: 13.5, color: 'var(--ink)' }}>{n(r.xp)} <span style={{ fontWeight: 600, fontSize: 11, color: 'var(--muted)' }}>XP</span></b>
                  <span style={{ fontSize: 13, color: 'var(--ink)' }}>{nn(r.sim)}</span>
                  <span style={{ fontSize: 13, color: 'var(--ink)' }}>{nn(r.q)}</span>
                  <b style={{ fontSize: 13, color: r.ac == null ? 'var(--muted)' : acCor(r.ac) }}>{r.ac == null ? '—' : `${r.ac}%`}</b>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: r.seq ? 'var(--accentInk)' : 'var(--muted)' }}><Icon n="flame" size={13} />{r.seq}</span>
                </button>
                )
              })}
            </Col>
            <Pager pag={pagLiga} total={rows.length} onPag={setPagLiga} />
          </Card>

          {/* Pódio + Detalhes */}
          <Col gap={16} style={{ position: 'sticky', top: 90 }}>
            <Card pad={18}>
              <Row gap={10}><Icon n="trophy" size={18} style={{ color: 'var(--brand)' }} /><H3>Pódio da liga</H3></Row>
              {rows.length >= 3 ? (
                <Row gap={8} style={{ alignItems: 'flex-end', flexWrap: 'nowrap' }}>
                  {[{ c: rows[1], h: 86, cor: '#C0C7CF', n: 2, idx: 1 }, { c: rows[0], h: 112, cor: '#E8C877', n: 1, idx: 0 }, { c: rows[2], h: 66, cor: '#D3955E', n: 3, idx: 2 }].map((p) => (
                    <Col key={p.n} gap={5} style={{ flex: 1, alignItems: 'center' }}>
                      <Avatar url={p.c.avatar} cor={p.c.avatarCor} seed={p.c.estudanteId} nome={p.c.code} size={p.n === 1 ? 44 : 36} />
                      <b style={{ fontSize: 12, color: 'var(--ink)' }}>{p.c.code}</b>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{n(p.c.xp)} XP</span>
                      <div style={{ width: '100%', height: p.h, borderRadius: '14px 14px 4px 4px', background: `linear-gradient(180deg, ${p.cor}, ${p.cor}44)`, display: 'flex', justifyContent: 'center', paddingTop: 8, color: '#2A1F02', fontSize: 20, fontWeight: 800 }}>{p.n}</div>
                    </Col>
                  ))}
                </Row>
              ) : (
                <Muted size={12.5}>Ainda não há alunos suficientes nesta liga para montar o pódio.</Muted>
              )}
            </Card>

            <Card pad={18}>
              <Row gap={10}><Icon n="user" size={18} style={{ color: 'var(--brand)' }} /><H3>Detalhes do aluno</H3></Row>
              <Row gap={12} style={{ flexWrap: 'nowrap' }}>
                <Avatar url={d.avatar} cor={d.avatarCor} seed={d.estudanteId} nome={d.code} size={52} />
                <Col gap={2}><b style={{ fontSize: 17, color: 'var(--ink)' }}>{d.code}</b><Muted size={12}>{d.pos}º · Nível {d.nivel} · {nomeLiga}</Muted></Col>
              </Row>
              <Row style={{ justifyContent: 'space-between' }}><b style={{ fontSize: 12, color: zona[1] }}>{zona[0]}</b><Muted size={12}>{d.eu ? 'Esta é a sua posição' : `Nível ${d.nivel}`}</Muted></Row>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                {([['clip', 'Simulados', nn(d.sim)], ['book', 'Questões', nn(d.q)], ['target', 'Acerto', d.ac == null ? '—' : d.ac + '%'], ['flame', 'Sequência', n(d.seq)], ['star', 'Conquistas', nn(d.conquistas)], ['bolt', 'XP', n(d.xp)]] as const).map(([ic, lab, val]) => (
                  <div key={lab} style={{ padding: '10px 12px', borderRadius: 14, background: 'var(--surface2)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)' }}><Icon n={ic} size={12} />{lab}</span>
                    <b style={{ display: 'block', marginTop: 2, fontSize: 17, color: 'var(--ink)' }}>{val}</b>
                  </div>
                ))}
              </div>
              <div>
                {/* TODO(dados): XP/dia por aluno não é exposto — série ilustrativa. */}
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>XP na semana</span>
                <Row gap={6} style={{ marginTop: 8, flexWrap: 'nowrap', alignItems: 'flex-end' }}>
                  {sem.map((v, i) => (
                    <Col key={i} gap={4} style={{ flex: 1, alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)' }}>{v}</span>
                      <div style={{ height: 80, width: '100%', display: 'flex', alignItems: 'flex-end' }}><span style={{ width: '100%', height: `${(v / max) * 100}%`, borderRadius: 6, background: 'var(--brand)' }} /></div>
                      <span style={{ fontSize: 10, color: 'var(--muted)' }}>{dias[i]}</span>
                    </Col>
                  ))}
                </Row>
              </div>
              {d.eu ? (
                <Muted size={12}>Este é você. Clique em outro aluno do ranking para comparar os números.</Muted>
              ) : (
                <Row gap={8} style={{ alignItems: 'flex-start', padding: '10px 12px', borderRadius: 12, border: '1px dashed var(--line2)', flexWrap: 'nowrap' }}>
                  <Icon n="lock" size={14} style={{ color: 'var(--muted)' }} />
                  <Muted size={11.5}>Por privacidade, de outros alunos mostramos só a foto e as iniciais do nome — os números de estudo ficam ocultos.</Muted>
                </Row>
              )}
            </Card>
          </Col>
        </div>
      ) : (
        <Card pad={18}>
          {totalAtivos != null ? (
            <Muted size={12.5}>{n(totalAtivos)} alunos na plataforma</Muted>
          ) : (
            <Muted size={12.5}>Ranking geral por XP total acumulado</Muted>
          )}
          <Col gap={2}>
            {geralSlice.map((r, iLocal) => {
              const i = (pagGeral - 1) * POR_PAGINA + iLocal
              const prev = i > 0 ? geralRows[i - 1] : null
              return (
              <React.Fragment key={`${r.pos}-${i}`}>
                {iLocal > 0 && prev && r.pos > prev.pos + 1 ? <div style={{ textAlign: 'center', color: 'var(--muted)', letterSpacing: '.3em', padding: 4 }}>···</div> : null}
                <GeralRow pos={String(r.pos)} code={r.code} ligaNome={r.ligaNome} ligaCor={r.ligaCor} xp={r.xp} avatar={r.avatar} avatarCor={r.avatarCor} estudanteId={r.estudanteId} eu={r.eu} />
              </React.Fragment>
              )
            })}
          </Col>
          <Pager pag={pagGeral} total={geralRows.length} onPag={setPagGeral} />
        </Card>
      )}
    </Col>
  )
}

function GeralRow({ pos, code, ligaNome, ligaCor, xp, avatar, avatarCor, estudanteId, eu }: { pos: string; code: string; ligaNome: string; ligaCor: string; xp: number; avatar?: string | null; avatarCor?: string | null; estudanteId?: string | null; eu?: boolean }) {
  const ic: IconName = /ametista/i.test(ligaNome) ? 'star' : /diamante/i.test(ligaNome) ? 'layers' : 'trophy'
  const bg = `color-mix(in srgb, ${ligaCor} 16%, transparent)`
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, background: eu ? 'var(--chip)' : 'transparent', boxShadow: eu ? 'inset 3px 0 0 var(--brand)' : 'none' }}>
      <b style={{ width: 30, textAlign: 'center', fontSize: 13, color: eu ? 'var(--brand)' : 'var(--muted)' }}>{pos}</b>
      <Avatar url={avatar} cor={avatarCor} seed={estudanteId} nome={code} size={30} />
      <b style={{ flex: 1, fontSize: 13.5, color: eu ? 'var(--brand)' : 'var(--ink)' }}>{code}</b>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 24, padding: '0 9px', borderRadius: 99, background: bg, color: ligaCor, fontSize: 11.5, fontWeight: 800 }}><Icon n={ic} size={12} />{ligaNome}</span>
      <b style={{ width: 80, textAlign: 'right', fontSize: 13.5, color: 'var(--ink)' }}>{n(xp)}</b>
    </div>
  )
}
