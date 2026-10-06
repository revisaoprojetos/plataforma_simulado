'use client'

// SIMULADO MEQ — ENTRADA (spec 06 §1). "Caderno de prova" oficial.
// Cabeçalho navy + circuito + tabela de 5 células + seção "01 · Identificação".
// 5 estados (aberto/agendado/semcad/retomar/encerrado) + modais ini/ret.
// Prefixo de CSS: sme-

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { simTokensStyle } from '../sim-tokens'
import type { AcaoEntrada, EstadoEntrada, SimEntradaReal, SimMock, SimTheme } from '../types'
import {
  AMBER, baseKeyframes, BgfxMeq, btnGhost, btnPrimary, ERR_RED,
  IconBook, IconBulb, IconChart, IconCheck, IconClock, IconFlag, IconInfo, IconList, IconMail, IconMoon,
  IconPlay, IconReturn, MarcaMeq, MEQ_CYAN, MEQ_NAVY_GRAD,
  ModalHead, ModalShell, SoraLink,
} from './shared'

const P = 'sme'

type ModalEntrada = null | 'ini' | 'ret'

/** Spinner inline (mesmo traço/arredondado dos ícones MEQ) — usado nos botões com ação em curso. */
function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ animation: `${P}spin .8s linear infinite` }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={2.4} />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
    </svg>
  )
}

export function Entrada({ theme, data, es = 'aberto', mo = 'cad', real }: { theme: SimTheme; data: SimMock; es?: EstadoEntrada; mo?: 'cad' | 'folha'; real?: SimEntradaReal }) {
  const { info, tentativa, aluno, countdown } = data
  const [md, setMd] = useState<ModalEntrada>(null)
  const [modo, setModo] = useState<'cad' | 'folha'>(mo)
  const [ag, setAg] = useState(false)
  const [nf, setNf] = useState(false)

  const badge: Record<EstadoEntrada, string> = {
    aberto: 'Em andamento',
    agendado: `Abre em ${countdown.dias} dias`,
    semcad: 'Em andamento',
    retomar: 'Você já começou',
    encerrado: 'Encerrado',
  }

  const fimLabel = fmtDate(info.fimISO)
  const iniLabel = fmtDate(info.inicioISO)
  const dur = info.duracaoMin == null ? 'Sem limite' : minToDur(info.duracaoMin)

  return (
    <div className={`${P}-app`} style={{ ...simTokensStyle('meq', theme), position: 'relative', minHeight: '100vh', overflowX: 'hidden' }}>
      <SoraLink />
      <style>{css()}</style>
      <BgfxMeq p={P} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 960, margin: '0 auto', padding: '22px 24px 60px' }}>
        {/* Top bar: voltar + tema */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          {real ? (
            <a href={real.voltarHref} style={linkBtn}>
              <span style={{ display: 'inline-flex', transform: 'translateY(1px)' }}>←</span> Voltar
            </a>
          ) : (
            <button type="button" style={linkBtn}>
              <span style={{ display: 'inline-flex', transform: 'translateY(1px)' }}>←</span> Voltar
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" aria-label="Tema" style={iconBtn} onClick={real?.onToggleTheme}>
            <IconMoon />
          </button>
        </div>

        {/* Lockup central */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 18 }}>
          <MarcaMeq size={46} />
        </div>

        {/* Cabeçalho navy (caderno de prova) */}
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--r)', background: MEQ_NAVY_GRAD, color: '#fff', padding: '24px 28px' }}>
          <div className={`${P}-headcirc`} aria-hidden style={{ position: 'absolute', right: -60, top: -80, width: 360, opacity: 0.5 }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.2em', color: '#8BEAEA' }}>{info.curto}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 10px', borderRadius: 6, background: MEQ_CYAN, color: '#0B1124', fontSize: 11.5, fontWeight: 700 }}>{badge[es]}</span>
          </div>
          <h1 style={{ position: 'relative', margin: '10px 0 2px', fontSize: 30, fontWeight: 700, letterSpacing: '-0.04em' }}>{info.titulo}</h1>
          <span style={{ position: 'relative', fontSize: 13, color: '#A9C6F0' }}>{info.subtitulo}</span>

          {/* Tabela de 5 células */}
          <div className={`${P}-tbl`} style={{ marginTop: 18, display: 'grid', borderTop: '1px solid rgba(255,255,255,.14)', borderLeft: '1px solid rgba(255,255,255,.14)', borderRadius: 8, overflow: 'hidden' }}>
            <Cell label="Data" value={`${iniLabel.data} · ${iniLabel.hora}`} />
            <Cell label="Encerra" value={`${fimLabel.data} · ${fimLabel.hora}`} />
            <Cell label="Duração" value={dur} />
            <Cell label="Itens" value={`${info.n} · Certo/Errado`} />
            <Cell label="Banca" value="Padrão Cebraspe" cls={`${P}-tbl-banca`} />
          </div>
        </div>

        {/* Seção 01 · Identificação */}
        <div style={{ marginTop: 20, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: '24px 28px', boxShadow: '0 1px 2px rgba(16,30,70,.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <b style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', color: 'var(--brand2)' }}>01</b>
            <b style={{ fontSize: 15, color: 'var(--ink)' }}>Identificação do candidato</b>
            <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          </div>

          {es === 'aberto' && (
            <CorpoAberto
              real={real}
              onIni={() => (real ? real.onIdentificar('iniciar') : setMd('ini'))}
              onFolha={() => (real ? real.onIdentificar('folha') : (setModo('folha'), setMd('ini')))}
              onResultado={() => real?.onIdentificar('resultado')}
            />
          )}
          {es === 'agendado' && <CorpoAgendado real={real} countdown={countdown} nf={nf} onNf={() => setNf((v) => !v)} />}
          {es === 'semcad' && <CorpoSemcad real={real} onTentar={() => real?.onIdentificar('iniciar')} />}
          {es === 'retomar' && <CorpoRetomar n={info.n} t={tentativa} onContinuar={() => setMd('ret')} onFolha={() => setMd('ret')} />}
          {es === 'encerrado' && (
            <CorpoEncerrado
              fim={fimLabel.data}
              permiteFolha={real ? real.permiteFolha : info.permiteFolha}
              real={real}
              onResultado={() => real?.onIdentificar('resultado')}
            />
          )}

          {/* Erro de bloqueio/identidade do backend (mensagem personalizada do tenant). */}
          {real?.erro && es !== 'semcad' && (
            <div style={{ display: 'flex', gap: 10, marginTop: 14, padding: '12px 14px', borderRadius: 12, background: 'rgba(229,72,77,.08)', color: 'var(--ink)', fontSize: 12.5, lineHeight: 1.45 }}>
              <span style={{ color: ERR_RED, flexShrink: 0 }}><IconInfo size={16} /></span>
              <span>{real.erro.titulo ? <b>{real.erro.titulo} </b> : null}{real.erro.mensagem}</span>
            </div>
          )}

          <p style={{ margin: '16px 0 0', fontSize: 11.5, lineHeight: 1.5, color: 'var(--muted)' }}>
            Ao iniciar você concorda com as regras do simulado. Para o ranking, outros participantes aparecem apenas pelas iniciais.
          </p>
        </div>
      </div>

      {md === 'ini' && (
        <ModalIni
          info={info}
          modo={modo}
          setModo={setModo}
          ag={ag}
          setAg={setAg}
          onClose={() => setMd(null)}
        />
      )}
      {md === 'ret' && <ModalRet nome={aluno.primeiroNome} n={info.n} t={tentativa} onClose={() => setMd(null)} />}
    </div>
  )
}

// ── Células da tabela ─────────────────────────────────────────────────────────
function Cell({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className={cn(`${P}-tbl-cell`, cls)} style={{ padding: '10px 12px', borderRight: '1px solid rgba(255,255,255,.14)', borderBottom: '1px solid rgba(255,255,255,.14)' }}>
      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#8DA6D6' }}>{label}</span>
      <div style={{ marginTop: 3, fontSize: 13.5, fontWeight: 700, color: '#fff' }}>{value}</div>
    </div>
  )
}

// ── Campos de identificação ─────────────────────────────────────────────────
// Quando `real` está presente: e-mail controlado + (CPF/telefone conforme método).
// Sem `real` (preview): campo decorativo com `valor` default.
function CampoEmail({ erro, valor, real }: { erro?: boolean; valor?: string; real?: SimEntradaReal }) {
  const plataforma = real?.plataforma
  return (
    <>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
          E-mail cadastrado {plataforma ? <>na plataforma do <b style={{ color: 'var(--brand)' }}>{plataforma}</b></> : 'na plataforma'} <b style={{ color: ERR_RED }}>*</b>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, height: 50, padding: '0 14px', borderRadius: 8, background: 'var(--surface)', color: erro ? ERR_RED : 'var(--muted)', border: `1.5px solid ${erro ? ERR_RED : 'var(--line2)'}`, boxShadow: erro ? `0 0 0 4px rgba(229,72,77,.12)` : undefined }}>
          <IconMail />
          {real ? (
            <input type="email" placeholder="seu@email.com" value={real.email} onChange={(e) => real.setEmail(e.target.value)} autoComplete="email" style={inputEl} />
          ) : (
            <input type="email" placeholder="seu@email.com" defaultValue={valor} style={inputEl} />
          )}
          {erro ? <IconInfo size={16} /> : null}
        </span>
      </label>
      {real?.metodo === 'email_cpf' && (
        <CampoSimples label="CPF" placeholder="000.000.000-00" valor={real.cpf} onChange={real.setCpf} inputMode="numeric" />
      )}
      {real?.metodo === 'email_telefone' && (
        <CampoSimples label="Telefone" placeholder="(00) 00000-0000" valor={real.telefone} onChange={real.setTelefone} inputMode="tel" />
      )}
    </>
  )
}

function CampoSimples({ label, placeholder, valor, onChange, inputMode }: { label: string; placeholder: string; valor: string; onChange: (v: string) => void; inputMode?: 'numeric' | 'tel' }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, height: 50, padding: '0 14px', borderRadius: 8, background: 'var(--surface)', color: 'var(--muted)', border: '1.5px solid var(--line2)' }}>
        <input inputMode={inputMode} placeholder={placeholder} value={valor} onChange={(e) => onChange(e.target.value)} style={inputEl} />
      </span>
    </label>
  )
}

const inputEl: React.CSSProperties = { flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', font: 'inherit', fontSize: 14.5, color: 'var(--ink)' }

// ── Corpos por estado ─────────────────────────────────────────────────────────
function CorpoAberto({ real, onIni, onFolha, onResultado }: { real?: SimEntradaReal; onIni: () => void; onFolha: () => void; onResultado: () => void }) {
  const busy = real?.carregando ?? null
  const temFolha = real ? real.permiteFolha : true
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <CampoEmail real={real} erro={!!real?.erro} />
      <button type="button" className={`${P}-sbtn`} onClick={onIni} disabled={!!busy} style={{ ...btnPrimary(52), opacity: busy && busy !== 'iniciar' ? 0.55 : 1 }}>
        {busy === 'iniciar' ? <><Spinner /> Verificando…</> : <><IconPlay /> Iniciar simulado</>}
      </button>
      {temFolha && (
        <button type="button" className={`${P}-sbtn`} onClick={onFolha} disabled={!!busy} style={{ ...btnGhost(48), opacity: busy && busy !== 'folha' ? 0.55 : 1 }}>
          {busy === 'folha' ? <><Spinner /> Verificando…</> : <><IconList /> Responder só a folha de respostas</>}
        </button>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11.5, fontWeight: 700, color: 'var(--muted)' }}>
        <span style={{ flex: 1, height: 1, background: 'var(--line)' }} /> OU <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
      </div>
      <button type="button" onClick={onResultado} disabled={!!busy} style={{ ...linkCenter, color: 'var(--brand)' }}>
        {busy === 'resultado' ? <><Spinner size={16} /> Buscando…</> : <><IconChart /> Já fiz — ver meus resultados</>}
      </button>
    </div>
  )
}

function CorpoAgendado({ real, countdown, nf, onNf }: { real?: SimEntradaReal; countdown: SimMock['countdown']; nf: boolean; onNf: () => void }) {
  const boxes: [number, string][] = [[countdown.dias, 'dias'], [countdown.horas, 'horas'], [countdown.min, 'min']]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'var(--chip)', color: 'var(--brand)', fontSize: 12.5, lineHeight: 1.45 }}>
        <IconClock size={16} />
        <span>Este simulado ainda não abriu. Disponível em {countdown.dataLabel}.</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        {boxes.map(([v, l]) => (
          <div key={l} style={{ padding: '14px 6px', borderRadius: 12, background: 'var(--surface2)', textAlign: 'center' }}>
            <b style={{ display: 'block', fontSize: 28, fontWeight: 800, color: 'var(--ink)' }}>{String(v).padStart(2, '0')}</b>
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>{l}</span>
          </div>
        ))}
      </div>
      <CampoEmail real={real} />
      <button type="button" disabled style={{ ...btnPrimary(52), opacity: 0.55, cursor: 'not-allowed', background: 'var(--surface2)', color: 'var(--muted)', boxShadow: 'none', border: '1.5px solid var(--line2)' }}>
        🔒 Disponível em {countdown.dataLabel}
      </button>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 13, color: 'var(--ink)' }}>
        <span>Avise-me quando abrir</span>
        <button type="button" role="switch" aria-checked={nf} onClick={onNf} style={{ position: 'relative', width: 42, height: 24, borderRadius: 99, border: 0, cursor: 'pointer', background: nf ? 'var(--selDot)' : 'var(--track)', transition: 'background .2s' }}>
          <span style={{ position: 'absolute', top: 3, left: 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transform: nf ? 'translateX(18px)' : 'none', transition: 'transform .2s', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} />
        </button>
      </div>
      <button type="button" style={{ ...linkCenter, color: 'var(--brand)' }}>Adicionar à minha agenda</button>
    </div>
  )
}

function CorpoSemcad({ real, onTentar }: { real?: SimEntradaReal; onTentar: () => void }) {
  const busy = real?.carregando ?? null
  const msg = real?.erro?.mensagem
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <CampoEmail erro valor="outro@tenant.com" real={real} />
      <div style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'rgba(229,72,77,.08)', color: 'var(--ink)', fontSize: 12.5, lineHeight: 1.45 }}>
        <span style={{ color: ERR_RED, flexShrink: 0 }}><IconInfo size={16} /></span>
        <span>{msg ? msg : <><b>Não encontramos este e-mail</b> na plataforma do simulado. Verifique a digitação ou crie sua conta.</>}</span>
      </div>
      <button type="button" className={`${P}-sbtn`} onClick={onTentar} disabled={!!busy} style={{ ...btnPrimary(52), opacity: busy ? 0.55 : 1 }}>
        {busy ? <><Spinner /> Verificando…</> : 'Tentar novamente'}
      </button>
      {!real && (
        <>
          <button type="button" className={`${P}-sbtn`} style={btnGhost(48)}>Criar minha conta grátis</button>
          <button type="button" style={{ ...linkCenter, color: 'var(--brand)' }}>Falar com o suporte</button>
        </>
      )}
    </div>
  )
}

function CorpoRetomar({ n, t, onContinuar, onFolha }: { n: number; t: SimMock['tentativa']; onContinuar: () => void; onFolha: () => void }) {
  const pct = Math.round((t.respondidas / n) * 100)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <CampoEmail valor="joao@exemplo.com" />
      <div style={{ padding: 16, borderRadius: 14, background: 'var(--surface2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <b style={{ fontSize: 14, color: 'var(--ink)' }}>Você já começou este simulado</b>
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--brand)' }}>{t.respondidas}/{n}</span>
        </div>
        <div style={{ height: 8, margin: '10px 0 8px', borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}>
          <span className={`${P}-bar`} style={{ display: 'block', width: `${pct}%`, height: '100%', borderRadius: 99, background: 'var(--selDot)' }} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          Última atividade hoje às {t.ultimaAtividade} · parou na questão {t.ultimaQuestao}{t.tempoRestante ? ` · tempo restante ${t.tempoRestante}` : ''}
        </span>
      </div>
      <button type="button" className={`${P}-sbtn`} onClick={onContinuar} style={btnPrimary(52)}>
        <IconPlay /> Continuar de onde parei
      </button>
      <button type="button" className={`${P}-sbtn`} onClick={onFolha} style={btnGhost(48)}>
        <IconList /> Abrir a folha de respostas
      </button>
    </div>
  )
}

function CorpoEncerrado({ fim, permiteFolha, real, onResultado }: { fim: string; permiteFolha: boolean; real?: SimEntradaReal; onResultado: () => void }) {
  const busy = real?.carregando ?? null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'var(--surface2)', color: 'var(--ink)', fontSize: 12.5, lineHeight: 1.45 }}>
        <span style={{ color: 'var(--muted)', flexShrink: 0 }}><IconFlag size={16} /></span>
        <span>O prazo terminou em {fim}. Você ainda pode treinar sem valer para o ranking.</span>
      </div>
      <CampoEmail real={real} erro={!!real?.erro} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <button type="button" className={`${P}-sbtn`} onClick={onResultado} disabled={!!busy} style={{ ...btnPrimary(50), opacity: busy && busy !== 'resultado' ? 0.55 : 1 }}>
          {busy === 'resultado' ? <><Spinner size={16} /> Buscando…</> : <><IconChart /> Ver meu resultado</>}
        </button>
        <button type="button" className={`${P}-sbtn`} style={btnGhost(50)}>
          <IconBulb size={16} /> Gabarito comentado
        </button>
      </div>
      <button type="button" className={`${P}-sbtn`} onClick={() => real?.onIdentificar('iniciar')} disabled={!!busy} style={{ ...btnGhost(48), background: MEQ_CYAN, color: '#0B1124', border: 0, opacity: busy && busy !== 'iniciar' ? 0.55 : 1 }}>
        {busy === 'iniciar' ? <><Spinner /> Verificando…</> : <><IconPlay /> Fazer como treino</>}
      </button>
      {permiteFolha ? (
        <button type="button" className={`${P}-sbtn`} onClick={() => real?.onIdentificar('folha')} disabled={!!busy} style={{ ...btnGhost(46), opacity: busy && busy !== 'folha' ? 0.55 : 1 }}>
          {busy === 'folha' ? <><Spinner size={16} /> Verificando…</> : <><IconList /> Folha de respostas</>}
        </button>
      ) : null}
    </div>
  )
}

// ── Modal ini ─────────────────────────────────────────────────────────────────
function ModalIni({ info, modo, setModo, ag, setAg, onClose }: {
  info: SimMock['info']; modo: 'cad' | 'folha'; setModo: (m: 'cad' | 'folha') => void; ag: boolean; setAg: (v: boolean) => void; onClose: () => void
}) {
  const dur = info.duracaoMin == null ? 'Sem limite' : minToDur(info.duracaoMin)
  return (
    <ModalShell p={P} width={500} onClose={onClose}>
      <ModalHead icon={<IconPlay size={24} />} iconColor="var(--selDot)" iconBg="color-mix(in srgb,var(--selDot) 14%,transparent)" titulo="Tudo pronto para começar" sub={info.titulo} onClose={onClose} />
      <div style={{ padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Kpi label="Tempo" value={dur} sub="não pausa" color="var(--brand)" />
          <Kpi label="Itens" value={String(info.n)} sub="Certo ou Errado" color="var(--ink)" />
        </div>

        <span style={kicker}>Como você quer responder?</span>
        <RadioCard icon={<IconBook />} titulo="Caderno completo" desc="Enunciados, itens e ferramentas de estudo" sel={modo === 'cad'} onClick={() => setModo('cad')} />
        <RadioCard icon={<IconList />} titulo="Só a folha de respostas" desc="Para quem fez no papel e quer apenas marcar" sel={modo === 'folha'} onClick={() => setModo('folha')} />

        <div style={{ display: 'flex', gap: 10, padding: 12, borderRadius: 12, background: 'rgba(242,169,59,.12)', color: 'var(--ink)', fontSize: 12.5, lineHeight: 1.45 }}>
          <span style={{ color: AMBER, flexShrink: 0 }}><IconInfo size={16} /></span>
          <span><b>Atenção:</b> no padrão Cebraspe uma errada anula uma certa. Na dúvida, deixe em branco.</span>
        </div>

        <Checkbox on={ag} onToggle={() => setAg(!ag)} label="Li as regras e estou pronto. Sei que o tempo não para depois de iniciar." />

        <button type="button" className={`${P}-sbtn`} style={{ ...btnPrimary(52), opacity: ag ? 1 : 0.45, pointerEvents: ag ? 'auto' : 'none', transition: 'opacity .2s' }}>
          <IconPlay /> Começar agora
        </button>
      </div>
    </ModalShell>
  )
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ padding: 14, borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface2)', textAlign: 'center' }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>{label}</span>
      <b style={{ display: 'block', margin: '4px 0 2px', fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', color }}>{value}</b>
      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{sub}</span>
    </div>
  )
}

function RadioCard({ icon, titulo, desc, sel, onClick }: { icon: React.ReactNode; titulo: string; desc: string; sel: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, border: `2px solid ${sel ? 'var(--selLine)' : 'var(--line)'}`, background: sel ? 'var(--selBg)' : 'var(--surface)', font: 'inherit', textAlign: 'left', cursor: 'pointer', width: '100%' }}>
      <span style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--surface2)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, lineHeight: 1.3 }}>
        <b style={{ display: 'block', fontSize: 14, color: 'var(--ink)' }}>{titulo}</b>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{desc}</span>
      </span>
      <span style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${sel ? 'var(--selLine)' : 'var(--line2)'}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {sel ? <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--selDot)' }} /> : null}
      </span>
    </button>
  )
}

function Checkbox({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" onClick={onToggle} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 0, border: 0, background: 'none', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
      <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 7, border: `2px solid ${on ? 'var(--selDot)' : 'var(--line2)'}`, background: on ? 'var(--selDot)' : 'transparent', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        {on ? <IconCheck size={13} sw={3.2} /> : null}
      </span>
      <span style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--ink)' }}>{label}</span>
    </button>
  )
}

// ── Modal ret ───────────────────────────────────────────────────────────────
function ModalRet({ nome, n, t, onClose }: { nome: string; n: number; t: SimMock['tentativa']; onClose: () => void }) {
  const R = 50
  const C = 2 * Math.PI * R // 314.16
  const frac = t.respondidas / n
  const off = C * (1 - frac)
  const marcadas = t.marcadas.length
  return (
    <ModalShell p={P} width={520} onClose={onClose}>
      <ModalHead icon={<IconReturn size={24} />} iconColor="var(--selDot)" iconBg="color-mix(in srgb,var(--selDot) 14%,transparent)" titulo={`Bem-vindo de volta, ${nome}`} sub="Seu progresso foi salvo automaticamente" onClose={onClose} />
      <div style={{ padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
            <svg viewBox="0 0 120 120" style={{ width: 120, height: 120, transform: 'rotate(-90deg)' }}>
              <circle cx="60" cy="60" r={R} fill="none" stroke="var(--track)" strokeWidth={12} />
              <circle cx="60" cy="60" r={R} fill="none" stroke="var(--selDot)" strokeWidth={12} strokeLinecap="round" strokeDasharray={C.toFixed(1)} strokeDashoffset={off.toFixed(1)} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.1 }}>
              <b style={{ fontSize: 24, color: 'var(--ink)' }}>{t.respondidas}</b>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>de {n}</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
            <span><b style={{ color: 'var(--ink)' }}>{t.respondidas} respondidas</b> · {n - t.respondidas} em branco</span>
            <span style={{ color: 'var(--flag)', fontWeight: 700 }}>{marcadas} para revisar</span>
            {t.tempoRestante ? <span>Tempo: <b style={{ color: 'var(--ink)' }}>{t.tempoRestante}</b> restantes · o tempo continuou correndo</span> : null}
            <span>Parou na questão <b style={{ color: 'var(--ink)' }}>{t.ultimaQuestao}</b></span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, padding: 12, borderRadius: 12, background: 'rgba(229,72,77,.08)', color: 'var(--ink)', fontSize: 12.5, lineHeight: 1.45 }}>
          <span style={{ color: ERR_RED, flexShrink: 0 }}><IconClock size={16} /></span>
          <span>O cronômetro não pausa. Se o tempo acabar, o simulado é enviado automaticamente com o que estiver marcado.</span>
        </div>

        <button type="button" className={`${P}-sbtn`} style={btnPrimary(52)}>
          <IconPlay /> Continuar na questão {t.ultimaQuestao}
        </button>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button type="button" className={`${P}-sbtn`} style={btnGhost(44)}><IconList /> Ver as que pulei</button>
          <button type="button" className={`${P}-sbtn`} style={btnGhost(44)}><IconList /> Folha de respostas</button>
        </div>
      </div>
    </ModalShell>
  )
}

// ── estilos inline util ───────────────────────────────────────────────────────
const linkBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 10px', border: 0, background: 'transparent', color: 'var(--ink)', font: 'inherit', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }
const iconBtn: React.CSSProperties = { width: 38, height: 38, borderRadius: 11, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }
const linkCenter: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: 0, background: 'transparent', font: 'inherit', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }
const kicker: React.CSSProperties = { display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)' }

// ── helpers de data ───────────────────────────────────────────────────────────
function fmtDate(iso: string): { data: string; hora: string } {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return { data: `${dd}/${mm}/${yy}`, hora: `${hh}:${mi}` }
}
function minToDur(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h00`
}

function css() {
  return `
.${P}-app{font-synthesis-weight:none}
${baseKeyframes(P)}
@keyframes ${P}spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){svg[style*="${P}spin"]{animation-duration:1.4s!important}}
.${P}-tbl{grid-template-columns:repeat(5,minmax(0,1fr))}
@media (max-width:640px){
  .${P}-tbl{grid-template-columns:repeat(2,minmax(0,1fr))}
  .${P}-tbl-banca{grid-column:1 / -1}
  .${P}-modal{left:12px!important;right:12px!important;bottom:12px!important;top:auto!important;width:auto!important;max-width:none!important;transform:none!important;border-radius:22px}
  .${P}-modal.${P}-mpop{animation-name:${P}msh}
}`
}
