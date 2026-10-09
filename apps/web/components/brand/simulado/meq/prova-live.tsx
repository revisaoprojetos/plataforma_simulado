'use client'

// SIMULADO MEQ — PROVA AO VIVO (spec 06 §2). Versão CONTROLADA do visual MEQ aplicada
// sobre o MOTOR REAL (ProvaClient): auto-save/timer/servidor continuam no ProvaClient,
// este componente é puramente apresentacional e recebe tudo por props.
//
// Composição MEQ (3 temas claro/azul/escuro + mobile): header sticky (barra 3px, segmentado
// Caderno/Folha, timer, fonte A/A+/A++, tema, Finalizar), cartão da questão (C/E = callout +
// 2 botões sólidos com ring; A–E = tesoura + quadrado raio 8), folha, navegador, modais rev/conf/ok.
// Prefixo de CSS: smpl-

import { useMemo, type ReactNode, type CSSProperties } from 'react'
import { MarkdownContent } from '@/components/markdown-content'
import { simTokensStyle } from '../sim-tokens'
import type { SimTheme } from '../types'
import {
  AMBER, baseKeyframes, BgfxMeq, btnGhost, btnPrimary, CERTO_GRAD, ERR_RED, ERRADO_GRAD,
  IconCheck, IconChevL, IconChevR, IconClock, IconFlag, IconGrid, IconInfo, IconList,
  IconMoon, MarcaMeq, MEQ_BRAND_GRAD, ModalHead, ModalShell, OK_GREEN,
} from './shared'

const P = 'smpl'
const FZ = [15, 16.5, 18]
const FZ_LAB = ['A', 'A+', 'A++']
const LETRA = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

export interface ProvaLiveAlt { id: string; texto: string; ordem: number }
export interface ProvaLiveQuestao {
  id: string
  tipo?: string
  enunciado: string
  disciplina?: string | null
  imagem_url?: string | null
  bloqueada?: boolean
  aviso?: { nome: string; cor: string | null; funcao: string } | null
  alternativas: ProvaLiveAlt[]
}

export type ModalProva = null | 'rev' | 'conf'

export interface ProvaMeqLiveProps {
  theme: SimTheme
  titulo: string
  banca?: string
  /** Logo do tenant (white-label) — quando presente substitui a marca genérica no header. */
  logoUrl?: string | null
  questoes: ProvaLiveQuestao[]
  qi: number // índice 1..N (questão atual)
  respostas: Record<string, string> // questao_id -> alternativa_id
  marcadas: Set<string> // questao_id marcadas p/ revisar
  eliminadas: Record<string, string[]> // questao_id -> alternativa_id[] (tesoura)
  discPaginas: Record<string, number>
  modo: 'cad' | 'folha'
  fz: number
  md: ModalProva
  ck: boolean
  ns: boolean // sheet do navegador (mobile)
  tempoLabel: string | null
  timerWarning: boolean
  tempoRegressivo: boolean // true = "restantes"; false = "decorridos"/sem limite
  isFinalizando: boolean
  dark: boolean
  // ações
  onSetModo: (m: 'cad' | 'folha') => void
  onCycleFz: () => void
  onToggleDark: () => void
  onGoto: (i: number) => void // i = índice 1..N
  onResponder: (questaoId: string, alternativaId: string) => void
  onToggleFlag: (questaoId: string) => void
  onToggleEliminar: (questaoId: string, alternativaId: string) => void
  onSetMd: (m: ModalProva) => void
  onSetCk: (v: boolean) => void
  onSetNs: (v: boolean) => void
  onFinalizar: () => void
  fontControl?: ReactNode // não usado no visual MEQ (botão A/A+/A++ embutido), mantido p/ compat
  slotDiscursiva?: ReactNode // envio de foto p/ questão discursiva atual
}

/** Respondida: objetiva = tem alternativa; discursiva = ≥1 foto; bloqueada = conta como resolvida. */
function respondida(q: ProvaLiveQuestao, respostas: Record<string, string>, disc: Record<string, number>) {
  if (q.bloqueada) return true
  if (q.tipo === 'discursiva') return (disc[q.id] ?? 0) > 0
  return !!respostas[q.id]
}
/** C/E = questão objetiva (não discursiva) com exatamente 2 alternativas. */
function ehCE(q: ProvaLiveQuestao) {
  return q.tipo !== 'discursiva' && !q.bloqueada && q.alternativas.length === 2
}

export function ProvaMeqLive(p: ProvaMeqLiveProps) {
  const { questoes, qi, respostas, marcadas, eliminadas, discPaginas } = p
  const N = questoes.length
  const q = questoes[qi - 1]

  const cAns = useMemo(() => questoes.filter((qq) => respondida(qq, respostas, discPaginas)).length, [questoes, respostas, discPaginas])
  const cBl = N - cAns
  const cFl = marcadas.size
  const cPct = N > 0 ? Math.round((cAns / N) * 100) : 0

  const timerColor = p.timerWarning ? ERR_RED : 'var(--brand2)'

  return (
    <div className={`${P}-app`} style={{ ...simTokensStyle('meq', p.theme), position: 'relative', minHeight: '100vh', overflowX: 'hidden' }}>
      <style>{css()}</style>
      <BgfxMeq p={P} />

      {/* Header sticky */}
      <div className={`${P}-head`} style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 14, height: 72, padding: '0 28px', background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
        {/* Logo REAL do tenant (white-label); sem logo cai na marca genérica MEQ. */}
        {p.logoUrl ? <img src={p.logoUrl} alt="" style={{ height: 32, maxWidth: 132, objectFit: 'contain', borderRadius: 6 }} /> : <MarcaMeq size={30} />}
        <div className={`${P}-htit`} style={{ lineHeight: 1.2, minWidth: 0 }}>
          <b style={{ display: 'block', fontSize: 15, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.titulo}</b>
          {p.banca ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>{p.banca}</span> : null}
        </div>
        <span style={{ flex: 1 }} />
        <b className={`${P}-hcenter`} style={{ fontSize: 14, color: 'var(--ink)' }}>Questão {qi} de {N}</b>
        <span style={{ flex: 1 }} />

        {/* Segmentado Caderno/Folha */}
        <div className={`${P}-seg`} style={{ display: 'inline-flex', gap: 3, padding: 3, borderRadius: 12, background: 'var(--tBg)' }}>
          <SegBtn active={p.modo === 'cad'} onClick={() => p.onSetModo('cad')} icon={<IconList size={14} />} label="Caderno" />
          <SegBtn active={p.modo === 'folha'} onClick={() => p.onSetModo('folha')} icon={<IconGrid size={14} />} label="Folha" />
        </div>

        {/* Timer (servidor) */}
        {p.tempoLabel !== null ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 12px', borderRadius: 11, background: p.timerWarning ? 'color-mix(in srgb,var(--flag) 14%,var(--surface2))' : 'var(--surface2)', color: timerColor }} className={p.timerWarning ? `${P}-pulse` : undefined}>
            <IconClock size={16} />
            <span style={{ lineHeight: 1.1 }}>
              <b style={{ display: 'block', fontSize: 14, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{p.tempoLabel}</b>
              <span className={`${P}-tlab`} style={{ fontSize: 10.5, color: 'var(--muted)' }}>{p.tempoRegressivo ? 'restantes' : 'decorridos'}</span>
            </span>
          </div>
        ) : null}

        <button type="button" onClick={p.onToggleDark} aria-label="Tema" className={`${P}-hicon`} style={headIcon}><IconMoon /></button>
        <button type="button" onClick={p.onCycleFz} aria-label="Tamanho da letra" className={`${P}-hicon`} style={{ ...headIcon, fontWeight: 800, fontSize: 13 }}>{FZ_LAB[p.fz]}</button>
        <button type="button" className={`${P}-sbtn ${P}-hfin`} onClick={() => p.onSetMd('rev')} style={{ ...btnPrimary(40), width: 'auto', fontSize: 13, padding: '0 18px' }}>
          <IconCheck size={14} sw={2.8} /> Finalizar
        </button>
      </div>
      <div style={{ position: 'sticky', top: 72, zIndex: 19, height: 3, background: 'var(--track)' }}>
        <div style={{ height: '100%', width: `${cPct}%`, background: MEQ_BRAND_GRAD, transition: 'width .4s cubic-bezier(.22,1,.36,1)' }} />
      </div>

      {/* Conteúdo */}
      <div className={`${P}-wrap`} style={{ position: 'relative', zIndex: 1, maxWidth: 1280, margin: '0 auto', padding: 22, display: 'grid', gap: 22, gridTemplateColumns: 'minmax(0,1fr) 300px' }}>
        <div style={{ minWidth: 0 }}>
          {p.modo === 'cad' ? (
            <CardQuestao
              q={q} qi={qi} N={N} resp={respostas[q.id] ?? null} fz={p.fz} flagged={marcadas.has(q.id)}
              elim={eliminadas[q.id] ?? []}
              slotDiscursiva={p.slotDiscursiva}
              onMark={(altId) => p.onResponder(q.id, altId)}
              onFlag={() => p.onToggleFlag(q.id)}
              onEliminar={(altId) => p.onToggleEliminar(q.id, altId)}
              onPrev={() => p.onGoto(Math.max(1, qi - 1))}
              onNext={() => (qi >= N ? p.onSetMd('rev') : p.onGoto(Math.min(N, qi + 1)))}
            />
          ) : (
            <Folha questoes={questoes} respostas={respostas} discPaginas={discPaginas} cAns={cAns} N={N} onMark={p.onResponder} />
          )}
        </div>

        {/* Navegador desktop */}
        <aside className={`${P}-nav`} style={{ alignSelf: 'start', position: 'sticky', top: 96 }}>
          <Navegador questoes={questoes} qi={qi} respostas={respostas} discPaginas={discPaginas} marcadas={marcadas} cAns={cAns} cBl={cBl} cFl={cFl} cPct={cPct} onGo={p.onGoto} />
        </aside>
      </div>

      {/* Barra inferior mobile */}
      <div className={`${P}-mbar`} style={{ position: 'sticky', bottom: 0, zIndex: 20, display: 'none', gridTemplateColumns: 'auto auto 1fr', gap: 8, alignItems: 'center', padding: 12, background: 'var(--surface)', borderTop: '1px solid var(--line)' }}>
        <button type="button" onClick={() => p.onGoto(Math.max(1, qi - 1))} style={{ ...btnGhost(44), width: 'auto', padding: '0 14px', opacity: qi === 1 ? 0.4 : 1 }}><IconChevL /></button>
        <button type="button" onClick={() => p.onSetNs(true)} style={{ ...btnGhost(44), width: 'auto', padding: '0 12px' }}><IconGrid /> {cAns}/{N}</button>
        <button type="button" className={`${P}-sbtn`} onClick={() => (qi >= N ? p.onSetMd('rev') : p.onGoto(Math.min(N, qi + 1)))} style={btnPrimary(44)}>Próximo <IconChevR /></button>
      </div>

      {/* Sheet navegador mobile */}
      {p.ns && (
        <>
          <div className={`${P}-mbg`} onClick={() => p.onSetNs(false)} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(10,10,25,.55)', backdropFilter: 'blur(6px)' }} />
          <div className={`${P}-msh`} style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 81, maxHeight: '76%', overflowY: 'auto', background: 'var(--surface)', borderRadius: '22px 22px 0 0', padding: 18 }}>
            <div style={{ width: 40, height: 4, borderRadius: 99, background: 'var(--line2)', margin: '0 auto 14px' }} />
            <b style={{ display: 'block', fontSize: 15, marginBottom: 12, color: 'var(--ink)' }}>Navegador · {cAns}/{N}</b>
            <NavGrid questoes={questoes} qi={qi} respostas={respostas} discPaginas={discPaginas} marcadas={marcadas} cols={6} onGo={(n) => { p.onGoto(n); p.onSetNs(false) }} />
          </div>
        </>
      )}

      {/* Modais */}
      {p.md === 'rev' && <ModalRev questoes={questoes} respostas={respostas} discPaginas={discPaginas} marcadas={marcadas} N={N} cAns={cAns} cBl={cBl} cFl={cFl} onClose={() => p.onSetMd(null)} onGo={(n) => { p.onGoto(n); p.onSetMd(null) }} onConf={() => { p.onSetCk(false); p.onSetMd('conf') }} />}
      {p.md === 'conf' && <ModalConf N={N} cAns={cAns} cBl={cBl} ck={p.ck} isFinalizando={p.isFinalizando} setCk={p.onSetCk} onClose={() => p.onSetMd('rev')} onOk={p.onFinalizar} />}
    </div>
  )
}

function SegBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} style={{ height: 32, padding: '0 12px', border: 0, borderRadius: 9, background: active ? 'var(--tOn)' : 'transparent', color: active ? 'var(--tOnInk)' : 'var(--muted)', font: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: active ? '0 1px 2px rgba(16,30,70,.12)' : undefined }}>
      {icon}<span className={`${P}-seglab`}>{label}</span>
    </button>
  )
}

// ── Card da questão ───────────────────────────────────────────────────────────
function CardQuestao({ q, qi, N, resp, fz, flagged, elim, slotDiscursiva, onMark, onFlag, onEliminar, onPrev, onNext }: {
  q: ProvaLiveQuestao; qi: number; N: number; resp: string | null; fz: number; flagged: boolean; elim: string[]
  slotDiscursiva?: ReactNode
  onMark: (altId: string) => void; onFlag: () => void; onEliminar: (altId: string) => void; onPrev: () => void; onNext: () => void
}) {
  const ce = ehCE(q)
  const alts = [...q.alternativas].sort((a, b) => a.ordem - b.ordem)
  return (
    <div key={qi} className={`${P}-qin`} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 24, boxShadow: '0 1px 2px rgba(16,30,70,.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ padding: '6px 11px', borderRadius: 8, background: 'var(--chip)', color: 'var(--brand)', fontSize: 12, fontWeight: 800 }}>{qi} / {N}</span>
        {q.disciplina ? <span style={{ padding: '6px 11px', borderRadius: 8, background: 'var(--surface2)', color: 'var(--muted)', fontSize: 12, fontWeight: 700 }}>{q.disciplina}</span> : null}
        {flagged ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--flag)' }}><IconFlag size={13} /> Para revisar</span> : null}
      </div>

      {q.aviso ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'color-mix(in srgb,var(--flag) 12%,var(--surface2))', color: q.aviso.cor ?? 'var(--flag)', fontSize: 12.5, fontWeight: 700, marginBottom: 14 }}>
          {q.aviso.nome}
        </div>
      ) : null}

      {ce ? (
        <div style={{ padding: '14px 16px', borderLeft: '3px solid var(--selDot)', background: 'var(--surface2)', borderRadius: '0 10px 10px 0', fontSize: 12.5, color: 'var(--muted)', marginBottom: 14 }}>
          Julgue o item a seguir.
        </div>
      ) : null}

      <div style={{ margin: '0 0 18px', fontSize: FZ[fz], lineHeight: 1.7, color: 'var(--ink)' }}>
        <MarkdownContent>{q.enunciado}</MarkdownContent>
        {q.imagem_url ? (
          <div style={{ marginTop: 14, overflow: 'hidden', borderRadius: 10, border: '1px solid var(--line)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={q.imagem_url} alt="" style={{ display: 'block', maxHeight: '50vh', width: 'auto', margin: '0 auto', objectFit: 'contain' }} />
          </div>
        ) : null}
      </div>

      {q.bloqueada ? (
        <div style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--surface2)', color: 'var(--muted)', fontSize: 13 }}>
          {q.aviso?.nome ?? 'Questão anulada'} — não é necessário responder.
        </div>
      ) : q.tipo === 'discursiva' ? (
        <div>{slotDiscursiva}</div>
      ) : ce ? (
        <>
          <div className={`${P}-ce`} style={{ display: 'flex', gap: 12 }}>
            {alts.map((a) => {
              const isCerto = /certo|verdad/i.test(a.texto)
              return (
                <CEBtn key={a.id} label={a.texto} grad={isCerto ? CERTO_GRAD : ERRADO_GRAD} color={isCerto ? OK_GREEN : ERR_RED} sel={resp === a.id} dim={!!resp && resp !== a.id} onClick={() => onMark(a.id)} />
              )
            })}
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--muted)', textAlign: 'center' }}>Toque de novo na opção marcada para deixar em branco.</p>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {alts.map((a, idx) => {
            const letra = LETRA[idx] ?? String(idx + 1)
            const eliminada = elim.includes(a.id)
            const sel = resp === a.id
            return (
              <AltLinha key={a.id} letra={letra} texto={a.texto} fz={fz} sel={sel} eliminada={eliminada}
                onMark={() => { if (!eliminada) onMark(a.id) }} onCut={() => onEliminar(a.id)} />
            )
          })}
        </div>
      )}

      {/* Ações */}
      <div className={`${P}-acts`} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, paddingTop: 18, borderTop: '1px solid var(--line)', marginTop: 18 }}>
        <div>
          <button type="button" onClick={onPrev} style={{ ...btnGhost(46), width: 'auto', opacity: qi === 1 ? 0.4 : 1, pointerEvents: qi === 1 ? 'none' : 'auto' }}><IconChevL /> Anterior</button>
        </div>
        <button type="button" onClick={onFlag} style={{ height: 46, padding: '0 16px', borderRadius: 12, cursor: 'pointer', font: 'inherit', fontSize: 13.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap', border: `1.5px solid ${flagged ? '#F2B63B' : 'rgba(242,182,59,.55)'}`, background: flagged ? '#F2B63B' : 'rgba(242,182,59,.14)', color: flagged ? '#3A2A00' : '#C98A0B' }}>
          <IconFlag size={15} /><span className={`${P}-flaglab`}>{flagged ? 'Marcada para revisar' : 'Revisar'}</span>
        </button>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className={`${P}-sbtn`} onClick={onNext} style={{ ...btnPrimary(46), width: 'auto' }}>Próximo <IconChevR /></button>
        </div>
      </div>
    </div>
  )
}

function CEBtn({ label, grad, color, sel, dim, onClick }: { label: string; grad: string; color: string; sel: boolean; dim: boolean; onClick: () => void }) {
  const shadow = sel
    ? `0 0 0 3px var(--surface),0 0 0 6px ${color},0 10px 24px -8px ${color}`
    : `0 4px 12px -6px ${color}`
  return (
    <button type="button" onClick={onClick} className={`${P}-cebtn`} style={{ flex: 1, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, border: 0, background: grad, boxShadow: shadow, opacity: dim ? 0.4 : 1, cursor: 'pointer', transition: 'opacity .2s,box-shadow .2s' }}>
      <b style={{ fontSize: 17, fontWeight: 800, letterSpacing: '.02em', color: '#fff' }}>{label}</b>
    </button>
  )
}

// Linha A–E com tesoura (quadrado raio 8) — spec §2.4.
function AltLinha({ letra, texto, fz, sel, eliminada, onMark, onCut }: {
  letra: string; texto: string; fz: number; sel: boolean; eliminada: boolean; onMark: () => void; onCut: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 10 }}>
      <button type="button" onClick={onCut} aria-label="Eliminar alternativa" className={`${P}-cut`} style={{ width: 38, flexShrink: 0, border: '1.5px dashed var(--line2)', borderRadius: 8, background: eliminada ? 'var(--flagBg)' : 'transparent', color: eliminada ? 'var(--flag)' : 'var(--muted)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
        <IconScissors />
      </button>
      <button type="button" onClick={onMark} className={`${P}-alt`} style={{ flex: 1, display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', textAlign: 'left', borderRadius: 8, border: `1.5px solid ${sel ? 'var(--selLine)' : 'var(--line2)'}`, background: sel ? 'var(--selBg)' : 'var(--surface)', boxShadow: sel ? '0 0 0 3px color-mix(in srgb,var(--selDot) 18%,transparent)' : undefined, cursor: eliminada ? 'default' : 'pointer', font: 'inherit', opacity: eliminada ? 0.42 : 1 }}>
        <span style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, border: `1.5px solid ${sel ? 'var(--selDot)' : 'var(--line2)'}`, background: sel ? 'var(--selDot)' : 'transparent', color: sel ? '#fff' : 'var(--muted)' }}>{letra}</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: FZ[fz], lineHeight: 1.6, color: 'var(--ink)', textDecoration: eliminada ? 'line-through' : undefined }}>
          <MarkdownContent inline>{texto}</MarkdownContent>
        </span>
      </button>
    </div>
  )
}

function IconScissors({ size = 16 }: { size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }}><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12" /></svg>
}

// ── Folha de respostas ──────────────────────────────────────────────────────
function Folha({ questoes, respostas, discPaginas, cAns, N, onMark }: {
  questoes: ProvaLiveQuestao[]; respostas: Record<string, string>; discPaginas: Record<string, number>; cAns: number; N: number; onMark: (qid: string, altId: string) => void
}) {
  // 6 colunas (spec). Cada célula: nº + bolhas (A–E / C·E / marca discursiva).
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 20, boxShadow: '0 1px 2px rgba(16,30,70,.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <b style={{ fontSize: 17, color: 'var(--ink)' }}>Folha de respostas</b>
          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>Marque direto aqui. Tudo fica sincronizado com o caderno.</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--brand)' }}>{cAns}/{N} marcadas</span>
      </div>
      <div className={`${P}-folha`} style={{ display: 'grid', gridTemplateColumns: 'repeat(6,minmax(0,1fr))', gap: '2px 12px' }}>
        {questoes.map((q, i) => {
          const zebra = Math.floor(i / 6) % 2 === 1
          const alts = [...q.alternativas].sort((a, b) => a.ordem - b.ordem)
          const discEnviada = q.tipo === 'discursiva' && (discPaginas[q.id] ?? 0) > 0
          return (
            <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 10, background: zebra ? 'var(--surface2)' : 'transparent' }}>
              <b style={{ width: 24, fontSize: 12.5, color: 'var(--ink)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{String(i + 1).padStart(2, '0')}</b>
              {q.bloqueada ? (
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>anulada</span>
              ) : q.tipo === 'discursiva' ? (
                <span style={{ fontSize: 11, color: discEnviada ? OK_GREEN : 'var(--muted)' }}>{discEnviada ? 'enviada' : 'discursiva'}</span>
              ) : (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {alts.map((a, idx) => {
                    const sel = respostas[q.id] === a.id
                    const lab = alts.length === 2 ? (/certo|verdad/i.test(a.texto) ? 'C' : 'E') : (LETRA[idx] ?? String(idx + 1))
                    return (
                      <button key={a.id} type="button" onClick={() => onMark(q.id, a.id)} className={`${P}-bub`} style={{ width: 26, height: 26, flexShrink: 0, padding: 0, borderRadius: '50%', border: `1.5px solid ${sel ? 'var(--selDot)' : 'var(--line2)'}`, background: sel ? 'var(--selDot)' : 'transparent', color: sel ? '#fff' : 'var(--muted)', font: 'inherit', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>{lab}</button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Navegador ───────────────────────────────────────────────────────────────
function Navegador({ questoes, qi, respostas, discPaginas, marcadas, cAns, cBl, cFl, cPct, onGo }: {
  questoes: ProvaLiveQuestao[]; qi: number; respostas: Record<string, string>; discPaginas: Record<string, number>; marcadas: Set<string>; cAns: number; cBl: number; cFl: number; cPct: number; onGo: (n: number) => void
}) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 18, boxShadow: '0 1px 2px rgba(16,30,70,.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <b style={{ fontSize: 15, color: 'var(--ink)' }}>Navegador</b>
        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--brand)' }}>{cPct}% feito</span>
      </div>
      {/* margin -6 + padding 6: expande a caixa de recorte do overflow (que corta o anel do "Atual" nas
          questões das bordas) sem deslocar a grade — o anel de seleção cabe nos 6px e não é mais cortado. */}
      <div className={`${P}-nscroll`} style={{ maxHeight: 432, overflowY: 'auto', margin: -6, padding: 6 }}>
        <NavGrid questoes={questoes} qi={qi} respostas={respostas} discPaginas={discPaginas} marcadas={marcadas} cols={5} onGo={onGo} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12, fontSize: 11, color: 'var(--muted)' }}>
        <Leg sw="var(--selDot)" label="Atual" />
        <Leg sw="var(--nAns)" label={`${cAns} Respondidas`} />
        <Leg sw="var(--surface2)" label={`${cBl} Em branco`} />
        <Leg ring label={`${cFl} Para revisar`} />
      </div>
      <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: 'var(--surface2)', fontSize: 12, lineHeight: 1.5, color: 'var(--muted)' }}>
        <b style={{ display: 'block', color: 'var(--ink)', marginBottom: 4 }}>Nota líquida estimada</b>
        Calculada após o envio: certas − erradas.
      </div>
    </div>
  )
}

function Leg({ sw, ring, label }: { sw?: string; ring?: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 20, height: 20, borderRadius: 5, background: ring ? 'transparent' : sw, boxShadow: ring ? 'inset 0 0 0 2px var(--flag)' : undefined }} />
      <span>{label}</span>
    </div>
  )
}

function NavGrid({ questoes, qi, respostas, discPaginas, marcadas, cols, onGo }: {
  questoes: ProvaLiveQuestao[]; qi: number; respostas: Record<string, string>; discPaginas: Record<string, number>; marcadas: Set<string>; cols: number; onGo: (n: number) => void
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},1fr)`, gap: 6 }}>
      {questoes.map((q, i) => {
        const n = i + 1
        const atual = n === qi
        const answered = respondida(q, respostas, discPaginas)
        const flagged = marcadas.has(q.id)
        let bg = 'var(--surface2)', color = 'var(--muted)'
        if (answered) { bg = 'var(--nAns)'; color = 'var(--nAnsInk)' }
        if (atual) { bg = 'var(--selDot)'; color = '#fff' }
        return (
          <button key={q.id} type="button" onClick={() => onGo(n)} style={{ position: 'relative', zIndex: atual ? 1 : undefined, height: 38, border: 0, borderRadius: 7, background: bg, color, font: 'inherit', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', boxShadow: atual ? '0 0 0 3px var(--surface),0 0 0 5px var(--selDot)' : flagged ? 'inset 0 0 0 2px var(--flag)' : undefined, transition: 'background .2s' }}>
            {n}
            {flagged && !atual ? <span style={{ position: 'absolute', right: 3, top: 3, width: 6, height: 6, borderRadius: '50%', background: 'var(--flag)' }} /> : null}
          </button>
        )
      })}
    </div>
  )
}

// ── Modais ──────────────────────────────────────────────────────────────────
function ModalRev({ questoes, respostas, discPaginas, marcadas, N, cAns, cBl, cFl, onClose, onGo, onConf }: {
  questoes: ProvaLiveQuestao[]; respostas: Record<string, string>; discPaginas: Record<string, number>; marcadas: Set<string>; N: number; cAns: number; cBl: number; cFl: number; onClose: () => void; onGo: (n: number) => void; onConf: () => void
}) {
  const hasBl = cBl > 0
  const brancoIdx = questoes.map((q, i) => (respondida(q, respostas, discPaginas) ? -1 : i + 1)).filter((n) => n > 0)
  const blTxt = brancoIdx.slice(0, 12).join(', ') + (brancoIdx.length > 12 ? ` e mais ${brancoIdx.length - 12}` : '')
  const firstBl = brancoIdx[0]
  return (
    <ModalShell p={P} width={640} onClose={onClose}>
      <ModalHead icon={<IconList size={24} />} iconColor="var(--selDot)" iconBg="color-mix(in srgb,var(--selDot) 14%,transparent)" titulo="Revisão do simulado" sub="Confira suas respostas antes de enviar" onClose={onClose} />
      <div style={{ padding: '16px 24px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Chip v={cAns} l="Respondidas" color="var(--selDot)" />
          <Chip v={cBl} l="Em branco" color="var(--muted)" />
          <Chip v={cFl} l="Para revisar" color="var(--flag)" />
        </div>
        {hasBl ? (
          <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(242,169,59,.14)', borderLeft: `3px solid ${AMBER}`, color: 'var(--ink)', fontSize: 12.5, lineHeight: 1.5 }}>
            Você ainda tem {cBl} itens em branco: {blTxt}. <b>No Cebraspe, deixar em branco não desconta.</b>
          </div>
        ) : (
          <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(31,168,104,.14)', borderLeft: `3px solid ${OK_GREEN}`, color: OK_GREEN, fontSize: 12.5, fontWeight: 700 }}>
            Todas as questões foram respondidas.
          </div>
        )}
        <div className={`${P}-revgrid ${P}-nscroll`} style={{ maxHeight: 250, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(10,1fr)', gap: 5 }}>
          {questoes.map((q, i) => {
            const n = i + 1
            const answered = respondida(q, respostas, discPaginas)
            const fl = marcadas.has(q.id)
            return (
              <button key={q.id} type="button" onClick={() => onGo(n)} style={{ height: 36, border: 0, borderRadius: 7, font: 'inherit', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', background: fl ? 'var(--flagBg)' : answered ? 'var(--selDot)' : 'var(--surface2)', color: fl ? 'var(--flag)' : answered ? '#fff' : 'var(--muted)' }}>{n}</button>
            )
          })}
        </div>
      </div>
      <div className={`${P}-revacts`} style={{ display: 'grid', gridTemplateColumns: hasBl ? '1fr 1fr' : '1fr', gap: 12, padding: '16px 24px 22px', marginTop: 14, borderTop: '1px solid var(--line)' }}>
        {hasBl ? <button type="button" className={`${P}-sbtn`} onClick={() => onGo(firstBl)} style={btnGhost(48)}>Primeira em branco</button> : null}
        <button type="button" className={`${P}-sbtn`} onClick={onClose} style={btnGhost(48)}>Continuar respondendo</button>
        <button type="button" className={`${P}-sbtn`} onClick={onConf} style={{ ...btnPrimary(48), gridColumn: '1 / -1' }}><IconCheck size={17} /> Finalizar e enviar</button>
      </div>
    </ModalShell>
  )
}

function Chip({ v, l, color }: { v: number; l: string; color: string }) {
  return (
    <div style={{ flex: 1, padding: 12, borderRadius: 12, background: 'var(--surface2)', textAlign: 'center' }}>
      <b style={{ display: 'block', fontSize: 22, color }}>{v}</b>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)' }}>{l}</span>
    </div>
  )
}

function ModalConf({ N, cAns, cBl, ck, isFinalizando, setCk, onClose, onOk }: { N: number; cAns: number; cBl: number; ck: boolean; isFinalizando: boolean; setCk: (v: boolean) => void; onClose: () => void; onOk: () => void }) {
  return (
    <ModalShell p={P} width={500} onClose={isFinalizando ? undefined : onClose} closeOnBackdrop={!isFinalizando}>
      <ModalHead icon={<IconInfo size={24} />} iconColor={AMBER} iconBg="rgba(242,169,59,.14)" titulo="Enviar o simulado?" sub="Esta ação não pode ser desfeita" onClose={isFinalizando ? undefined : onClose} />
      <div style={{ padding: '16px 24px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--muted)' }}>
          Você respondeu <b style={{ color: 'var(--ink)' }}>{cAns} de {N}</b> e deixou {cBl} em branco. A correção sai na hora, com nota líquida e posição no ranking.
        </p>
        <button type="button" onClick={() => setCk(!ck)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface2)', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
          <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 7, border: `2px solid ${ck ? 'var(--selDot)' : 'var(--line2)'}`, background: ck ? 'var(--selDot)' : 'transparent', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            {ck ? <IconCheck size={13} sw={3.2} /> : null}
          </span>
          <span style={{ flex: 1, color: 'var(--ink)', fontSize: 13, lineHeight: 1.6 }}>Entendo que, depois de enviar, <b>não poderei alterar</b> as respostas desta realização.</span>
        </button>
        <div className={`${P}-confacts`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <button type="button" className={`${P}-sbtn`} onClick={onClose} disabled={isFinalizando} style={{ ...btnGhost(48), opacity: isFinalizando ? 0.6 : 1 }}>Voltar à revisão</button>
          <button type="button" className={`${P}-sbtn`} onClick={ck && !isFinalizando ? onOk : undefined} style={{ ...btnPrimary(48), opacity: ck && !isFinalizando ? 1 : 0.45, pointerEvents: ck && !isFinalizando ? 'auto' : 'none' }}>{isFinalizando ? 'Enviando…' : 'Sim, enviar agora'}</button>
        </div>
      </div>
    </ModalShell>
  )
}

const headIcon: CSSProperties = { height: 40, minWidth: 40, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 11, background: 'var(--surface)', color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }

function css() {
  return `
.${P}-app{font-synthesis-weight:none}
${baseKeyframes(P)}
.${P}-pulse{animation:${P}pulsered 1.4s ease-in-out infinite}
@keyframes ${P}pulsered{0%,100%{opacity:1}50%{opacity:.55}}
.${P}-cut:hover{color:var(--flag);border-color:var(--flag)}
.${P}-alt:hover{border-color:var(--selLine)}
@media (prefers-reduced-motion:reduce){.${P}-pulse{animation:none!important}}
@media (max-width:640px){
  .${P}-head{height:62px;padding:0 12px;gap:8px}
  .${P}-htit,.${P}-hcenter,.${P}-tlab,.${P}-seglab{display:none}
  .${P}-hicon{height:36px;min-width:36px}
  .${P}-hfin span{display:none}
  .${P}-wrap{grid-template-columns:1fr!important;padding:14px 12px;gap:14px}
  .${P}-nav{display:none}
  .${P}-mbar{display:grid!important}
  .${P}-ce{flex-direction:column}
  .${P}-cebtn{height:58px}
  .${P}-acts{grid-template-columns:1fr 1fr;gap:8px}
  .${P}-acts>:last-child{grid-column:1 / -1}
  .${P}-flaglab{display:inline}
  .${P}-folha{grid-template-columns:repeat(2,minmax(0,1fr))}
  .${P}-bub{width:34px!important;height:34px!important}
  .${P}-revgrid{grid-template-columns:repeat(7,1fr)!important}
  .${P}-revacts,.${P}-confacts{grid-template-columns:1fr!important}
  .${P}-modal{left:12px!important;right:12px!important;bottom:12px!important;top:auto!important;width:auto!important;max-width:none!important;transform:none!important}
  .${P}-modal.${P}-mpop{animation-name:${P}msh}
}`
}
