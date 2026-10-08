'use client'

// SIMULADO — VND · Entrada (spec 06 §1, coluna VND). Ingresso/ticket com picote.
// 5 estados `es` (aberto/agendado/semcad/retomar/encerrado) + modais ini/ret.

import { useState } from 'react'
import {
  BookOpenCheck,
  Calendar,
  ChevronLeft,
  CircleAlert,
  Clock,
  Flag,
  Info,
  List,
  Mail,
  Lock,
  MessageCircle,
  Play,
  RotateCcw,
  Target,
  TrendingUp,
  User,
  Check,
  ClipboardCheck,
} from 'lucide-react'
import { simTokensStyle } from '../sim-tokens'
import type { EstadoEntrada, SimScreenProps } from '../types'
import {
  Bgfx,
  ghostBtnStyle,
  MarcaVND,
  ModalShell,
  modalSheetCss,
  primaryBtnStyle,
  sharedKeyframes,
  VND_GOLD,
  VND_GOLD_INK,
  VND_GOLD_SHADOW,
  VND_GREEN,
  VND_HERO_BG,
} from './shared'

const P = 'sve'

type Modal = null | 'ini' | 'ret'

export function EntradaVND({ theme, data, es = 'aberto', preview }: SimScreenProps) {
  const [estado, setEstado] = useState<EstadoEntrada>(es)
  const [md, setMd] = useState<Modal>(null)
  const [mo, setMo] = useState<'cad' | 'folha'>('cad')
  const [ag, setAg] = useState(false)
  const [nf, setNf] = useState(false)

  const { info, aluno, countdown } = data
  const fimLabel = fmtDate(info.fimISO)
  const iniLabel = fmtDate(info.inicioISO)

  const badge =
    estado === 'agendado'
      ? `Abre em ${countdown.dias} dias`
      : estado === 'retomar'
        ? 'Você já começou'
        : estado === 'encerrado'
          ? 'Encerrado'
          : 'Em andamento'

  function openIni(modo: 'cad' | 'folha') {
    setMo(modo)
    setMd('ini')
  }

  return (
    <div
      className={`${P}-app`}
      style={{ ...simTokensStyle('vnd', theme), minHeight: '100vh', position: 'relative' }}
    >
      <style>{css}</style>

      {/* chips de PRÉ-VISUALIZAR ESTADO — ferramenta de MOCK/preview; só aparece no preview, NUNCA no
          acesso real do aluno (antes vazava em produção porque não estava gated). */}
      {preview && (
        <div className={`${P}-demobar`}>
          <span className={`${P}-demolabel`}>
            <Info size={14} /> PRÉ-VISUALIZAR ESTADO
          </span>
          <div className={`${P}-hs`} style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
            {(
              [
                ['aberto', 'Aberto'],
                ['agendado', 'Ainda não abriu'],
                ['semcad', 'Sem cadastro'],
                ['retomar', 'Já iniciado'],
                ['encerrado', 'Encerrado'],
              ] as [EstadoEntrada, string][]
            ).map(([k, label]) => {
              const on = estado === k
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setEstado(k)
                    setMd(null)
                  }}
                  className={`${P}-demochip`}
                  style={{ background: on ? 'var(--brand)' : 'transparent', color: on ? '#fff' : 'var(--muted)' }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ position: 'relative', minHeight: 820 }}>
        <Bgfx prefix={P} variant="entrada" />

        {/* Voltar — FIXO no canto superior ESQUERDO da tela (fora do wrap centralizado), responsivo
            via clamp() p/ adaptar a qualquer viewport e à Curseduca (iframe). */}
        <a href="#" className={`${P}-back`}>
          <ChevronLeft size={15} /> Voltar
        </a>

        <div className={`${P}-wrap`}>
          {/* topo: lockup centralizado */}
          <div className={`${P}-lockup`}>
            <MarcaVND size={22} radius={13} />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
              <span style={{ fontWeight: 800, fontSize: 14, color: '#FFFFFF' }}>Você na Defensoria</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.18em', color: '#F1D48A' }}>
                SIMULA VND
              </span>
            </div>
          </div>

          {/* ticket */}
          <div className={`${P}-ticket`}>
            {/* topo verde escuro */}
            <div className={`${P}-top`}>
              <span aria-hidden="true" className={`${P}-topdots`} />
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <span className={`${P}-okpop ${P}-tile`}>
                  <ClipboardCheck size={34} />
                </span>
                <span className={`${P}-statusbadge`}>
                  <span className={`${P}-statusdot`} />
                  {badge}
                </span>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.24em', color: '#F1D48A' }}>
                  {info.subtitulo}
                </span>
                <h1 className={`${P}-h1`}>{info.curto.replace('SIMULADO NACIONAL', 'Simulado Nacional')}</h1>
                <div className={`${P}-chips`}>
                  <span className={`${P}-chip`}>
                    <Clock size={14} />
                    {info.duracaoMin ? `${Math.round(info.duracaoMin / 60)} horas` : 'Sem limite'}
                  </span>
                  <span className={`${P}-chip`}>
                    <List size={14} />
                    {info.n} questões
                  </span>
                  <span className={`${P}-chip`}>
                    <Target size={14} />
                    {info.banca}
                  </span>
                </div>
              </div>
            </div>

            {/* picote */}
            <div className={`${P}-picote`}>
              <span className={`${P}-notch ${P}-notch-l`} />
              <span className={`${P}-notch ${P}-notch-r`} />
            </div>

            {/* corpo */}
            <div style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div className={`${P}-dates`}>
                <div className={`${P}-datetile`}>
                  <span className={`${P}-datelbl`}>ABRE</span>
                  <b className={`${P}-dateval`}>{iniLabel}</b>
                </div>
                <div className={`${P}-datetile`}>
                  <span className={`${P}-datelbl`}>ENCERRA</span>
                  <b className={`${P}-dateval`}>{fimLabel}</b>
                </div>
              </div>
              <div style={{ height: 1, background: 'var(--line)' }} />
              <b style={{ fontSize: 18, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Pronto para a missão?</b>

              {estado === 'aberto' && <FormAberto onIni={() => openIni('cad')} onFolha={() => openIni('folha')} />}
              {estado === 'agendado' && (
                <FormAgendado countdown={countdown} nf={nf} onNf={() => setNf((v) => !v)} />
              )}
              {estado === 'semcad' && <FormSemcad />}
              {estado === 'retomar' && (
                <FormRetomar
                  respondidas={data.tentativa.respondidas}
                  total={info.n}
                  tempo={data.tentativa.tempoRestante}
                  onRet={() => setMd('ret')}
                />
              )}
              {estado === 'encerrado' && <FormEncerrado fim={fimLabel} />}

              <span className={`${P}-foot`}>
                Ao iniciar você concorda com as regras do simulado. Seus dados não são exibidos no ranking — apenas as
                iniciais.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL ini */}
      {md === 'ini' && (
        <ModalShell
          prefix={P}
          width={500}
          onClose={() => setMd(null)}
          icon={<Play size={24} />}
          title="Tudo pronto para começar"
          subtitle={info.titulo}
        >
          <div style={{ padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Kpi label="Tempo" value="4h00" sub="começa ao iniciar" valueColor="var(--brand)" />
              <Kpi label="Questões" value={String(info.n)} sub="objetiva A–E" />
            </div>
            <span className={`${P}-section`}>Como você quer responder?</span>
            <RadioCard
              active={mo === 'cad'}
              onClick={() => setMo('cad')}
              icon={<BookOpenCheck size={18} />}
              title="Caderno completo"
              sub="Enunciados, alternativas e ferramentas de estudo"
            />
            <RadioCard
              active={mo === 'folha'}
              onClick={() => setMo('folha')}
              icon={<List size={18} />}
              title="Só a folha de respostas"
              sub="Para quem fez no papel e quer apenas marcar"
            />
            <CheckRow
              on={ag}
              onToggle={() => setAg((v) => !v)}
              text="Li as regras e estou pronto. Sei que o tempo não para depois de iniciar."
            />
            <a
              href="#"
              className={`${P}-sbtn`}
              style={{
                ...primaryBtnStyle({ height: 52, borderRadius: 16, fontSize: 15 }),
                opacity: ag ? 1 : 0.45,
                pointerEvents: ag ? 'auto' : 'none',
                transition: 'opacity .2s',
                textDecoration: 'none',
              }}
            >
              <Play size={16} />
              Começar agora
            </a>
          </div>
        </ModalShell>
      )}

      {/* MODAL ret */}
      {md === 'ret' && (
        <ModalShell
          prefix={P}
          width={520}
          onClose={() => setMd(null)}
          icon={<RotateCcw size={24} />}
          title={`Bem-vindo de volta, ${aluno.primeiroNome}`}
          subtitle="Seu progresso foi salvo automaticamente"
        >
          <div style={{ padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <ProgressRing done={data.tentativa.respondidas} total={info.n} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
                <span>
                  <b style={{ color: 'var(--ink)' }}>{data.tentativa.respondidas} respondidas</b> ·{' '}
                  {info.n - data.tentativa.respondidas} em branco
                </span>
                <span>
                  <b style={{ color: 'var(--flag)' }}>{data.tentativa.marcadas.length} para revisar</b>
                </span>
                <span>
                  Tempo: <b style={{ color: 'var(--ink)' }}>{data.tentativa.tempoRestante ?? '—'}</b> restantes · o tempo
                  continuou correndo
                </span>
                <span>
                  Parou na questão <b style={{ color: 'var(--ink)' }}>{data.tentativa.ultimaQuestao}</b>
                </span>
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                gap: 10,
                padding: 12,
                borderRadius: 12,
                background: 'rgba(229,72,77,.08)',
                color: 'var(--ink)',
                fontSize: 12.5,
                lineHeight: 1.45,
              }}
            >
              <Clock size={16} style={{ color: '#E5484D', flexShrink: 0 }} />
              <span>
                O cronômetro não pausa. Se o tempo acabar, o simulado é enviado automaticamente com o que estiver
                marcado.
              </span>
            </div>
            <a
              href="#"
              className={`${P}-sbtn`}
              style={{ ...primaryBtnStyle({ height: 52, borderRadius: 16, fontSize: 15 }), textDecoration: 'none' }}
            >
              <Play size={16} />
              Continuar na questão {data.tentativa.ultimaQuestao}
            </a>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button type="button" className={`${P}-sbtn`} style={ghostBtnStyle({ height: 44, borderRadius: 16, fontSize: 14 })}>
                <List size={17} /> Ver as que pulei
              </button>
              <button type="button" className={`${P}-sbtn`} style={ghostBtnStyle({ height: 44, borderRadius: 16, fontSize: 14 })}>
                <ClipboardCheck size={17} /> Folha de respostas
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  )
}

/* ─── formulários por estado ─── */

function EmailField({ value = '', error = false }: { value?: string; error?: boolean }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
        E-mail cadastrado na plataforma <b style={{ color: '#E5484D' }}>*</b>
      </span>
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          height: 50,
          padding: '0 14px',
          borderRadius: 14,
          border: `1.5px solid ${error ? '#E5484D' : 'var(--line2)'}`,
          background: 'var(--surface)',
          color: 'var(--muted)',
          boxShadow: error ? '0 0 0 4px rgba(229,72,77,.12)' : undefined,
        }}
      >
        <Mail size={17} />
        <input
          type="email"
          defaultValue={value}
          placeholder="seu@email.com"
          style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', font: 'inherit', fontSize: 14.5, color: 'var(--ink)' }}
        />
        {error && <CircleAlert size={17} style={{ color: '#E5484D' }} />}
      </span>
    </label>
  )
}

function FormAberto({ onIni, onFolha }: { onIni: () => void; onFolha: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <EmailField />
      <button type="button" onClick={onIni} className={`${P}-sbtn`} style={primaryBtnStyle({ width: '100%', height: 52, borderRadius: 16, fontSize: 14.5 })}>
        <Play size={17} /> Iniciar simulado
      </button>
      <button type="button" onClick={onFolha} className={`${P}-sbtn`} style={ghostBtnStyle({ width: '100%', height: 48, borderRadius: 16, fontSize: 14.5 })}>
        <List size={17} /> Responder só a folha de respostas
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11.5, fontWeight: 700, color: 'var(--muted)' }}>
        <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
        OU
        <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
      </div>
      <a href="#" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, color: 'var(--brand)' }}>
        <TrendingUp size={15} /> Já fiz — ver meus resultados
      </a>
    </div>
  )
}

function FormAgendado({
  countdown,
  nf,
  onNf,
}: {
  countdown: { dias: number; horas: number; min: number; dataLabel: string }
  nf: boolean
  onNf: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'var(--chip)', color: 'var(--brand)', fontSize: 13, fontWeight: 700 }}>
        <Clock size={17} /> Este simulado ainda não abriu. Ele fica disponível em {countdown.dataLabel}.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {[
          [countdown.dias, 'dias'],
          [countdown.horas, 'horas'],
          [countdown.min, 'min'],
        ].map(([v, l], i) => (
          <div key={i} style={{ flex: 1, padding: '14px 6px', borderRadius: 14, background: 'var(--surface2)', textAlign: 'center' }}>
            <b style={{ display: 'block', fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)' }}>
              {String(v).padStart(2, '0')}
            </b>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              {l}
            </span>
          </div>
        ))}
      </div>
      <EmailField />
      <button type="button" disabled style={{ width: '100%', height: 52, border: 0, borderRadius: 16, background: 'var(--surface2)', color: 'var(--muted)', font: 'inherit', fontSize: 14.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Lock size={16} /> Disponível em {countdown.dataLabel}
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: '1px solid var(--line)' }}>
        <div style={{ flex: 1 }}>
          <b style={{ display: 'block', fontSize: 13.5, color: 'var(--ink)' }}>Avise-me quando abrir</b>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Notificação no app e por e-mail</span>
        </div>
        <button
          type="button"
          onClick={onNf}
          aria-pressed={nf}
          style={{ position: 'relative', width: 42, height: 24, padding: 0, border: 0, borderRadius: 99, background: nf ? 'var(--selDot)' : 'var(--line2)', cursor: 'pointer' }}
        >
          <span style={{ position: 'absolute', left: 3, top: 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transform: `translateX(${nf ? 18 : 0}px)`, transition: 'transform .2s' }} />
        </button>
      </div>
      <a href="#" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, color: 'var(--brand)' }}>
        <Calendar size={15} /> Adicionar à minha agenda
      </a>
    </div>
  )
}

function FormSemcad() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <EmailField value="aluno.novo@email.com" error />
      <div style={{ padding: 14, borderRadius: 12, background: 'rgba(229,72,77,.08)', border: '1px solid rgba(229,72,77,.3)' }}>
        <b style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#E5484D' }}>
          <CircleAlert size={16} /> Não encontramos este e-mail
        </b>
        <span style={{ display: 'block', marginTop: 6, fontSize: 12.5, lineHeight: 1.5, color: 'var(--muted)' }}>
          Confira se é o mesmo e-mail usado na compra ou no cadastro. Se você ainda não tem acesso, crie sua conta grátis
          para fazer este simulado.
        </span>
      </div>
      <button type="button" className={`${P}-sbtn`} style={primaryBtnStyle({ width: '100%', height: 50, borderRadius: 16, fontSize: 14.5 })}>
        <RotateCcw size={17} /> Tentar novamente
      </button>
      <button type="button" className={`${P}-sbtn`} style={ghostBtnStyle({ width: '100%', height: 48, borderRadius: 16, fontSize: 14.5 })}>
        <User size={17} /> Criar minha conta grátis
      </button>
      <a href="#" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, color: 'var(--brand)' }}>
        <MessageCircle size={15} /> Falar com o suporte
      </a>
    </div>
  )
}

function FormRetomar({
  respondidas,
  total,
  tempo,
  onRet,
}: {
  respondidas: number
  total: number
  tempo?: string
  onRet: () => void
}) {
  const pct = Math.round((respondidas / total) * 100)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <EmailField value="joao@exemplo.com" />
      <div style={{ padding: 16, borderRadius: 14, background: 'var(--surface2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <b style={{ fontSize: 14, color: 'var(--ink)' }}>Você já começou este simulado</b>
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--brand)' }}>
            {respondidas}/{total}
          </span>
        </div>
        <div style={{ height: 8, margin: '10px 0 8px', borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}>
          <span style={{ display: 'block', width: `${pct}%`, height: '100%', borderRadius: 99, background: 'var(--selDot)' }} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          Última atividade hoje às 09:42 · parou na questão {respondidas + 1}
          {tempo ? ` · tempo restante ${tempo}` : ''}
        </span>
      </div>
      <button type="button" onClick={onRet} className={`${P}-sbtn`} style={primaryBtnStyle({ width: '100%', height: 52, borderRadius: 16, fontSize: 14.5 })}>
        <Play size={17} /> Continuar de onde parei
      </button>
      <button type="button" onClick={onRet} className={`${P}-sbtn`} style={ghostBtnStyle({ width: '100%', height: 48, borderRadius: 16, fontSize: 14.5 })}>
        <List size={17} /> Abrir a folha de respostas
      </button>
    </div>
  )
}

function FormEncerrado({ fim }: { fim: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'var(--surface2)', color: 'var(--ink)', fontSize: 13, fontWeight: 600 }}>
        <Flag size={17} /> O prazo terminou em {fim}. Você ainda pode treinar sem valer para o ranking.
      </div>
      <EmailField />
      <button type="button" className={`${P}-sbtn`} style={primaryBtnStyle({ width: '100%', height: 52, borderRadius: 16, fontSize: 14.5 })}>
        <TrendingUp size={17} /> Ver meu resultado
      </button>
      <button type="button" className={`${P}-sbtn`} style={ghostBtnStyle({ width: '100%', height: 48, borderRadius: 16, fontSize: 14.5 })}>
        <BookOpenCheck size={17} /> Gabarito comentado
      </button>
      <button
        type="button"
        className={`${P}-sbtn`}
        style={{ width: '100%', height: 48, border: 0, borderRadius: 16, background: VND_GOLD, color: VND_GOLD_INK, boxShadow: VND_GOLD_SHADOW, font: 'inherit', fontSize: 14.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, cursor: 'pointer' }}
      >
        <RotateCcw size={17} /> Fazer como treino
      </button>
    </div>
  )
}

/* ─── peças do modal ─── */

function Kpi({ label, value, sub, valueColor = 'var(--ink)' }: { label: string; value: string; sub: string; valueColor?: string }) {
  return (
    <div style={{ padding: 14, borderRadius: 14, border: '1px solid var(--line)', background: 'var(--surface2)', textAlign: 'center' }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>{label}</span>
      <b style={{ display: 'block', margin: '4px 0 2px', fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', color: valueColor }}>{value}</b>
      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{sub}</span>
    </div>
  )
}

function RadioCard({ active, onClick, icon, title, sub }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 14,
        border: `2px solid ${active ? 'var(--selLine)' : 'var(--line)'}`,
        background: active ? 'var(--selBg)' : 'var(--surface)',
        font: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
        width: '100%',
      }}
    >
      <span style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--surface2)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ flex: 1, lineHeight: 1.3 }}>
        <b style={{ display: 'block', fontSize: 14, color: 'var(--ink)' }}>{title}</b>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{sub}</span>
      </span>
      <span style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${active ? 'var(--selLine)' : 'var(--line)'}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        {active && <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--selDot)' }} />}
      </span>
    </button>
  )
}

function CheckRow({ on, onToggle, text }: { on: boolean; onToggle: () => void; text: string }) {
  return (
    <button type="button" onClick={onToggle} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 0, border: 0, background: 'none', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
      <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 7, border: `2px solid ${on ? 'var(--selDot)' : 'var(--line2)'}`, background: on ? 'var(--selDot)' : 'transparent', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        {on && <Check size={13} strokeWidth={3.2} />}
      </span>
      <span style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--ink)' }}>{text}</span>
    </button>
  )
}

function ProgressRing({ done, total }: { done: number; total: number }) {
  const C = 314.2
  const off = C - (done / total) * C
  return (
    <div style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
      <svg viewBox="0 0 120 120" style={{ width: 120, height: 120, transform: 'rotate(-90deg)' }}>
        <circle cx="60" cy="60" r="50" fill="none" stroke="var(--track)" strokeWidth="12" />
        <circle cx="60" cy="60" r="50" fill="none" stroke="var(--selDot)" strokeWidth="12" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.1 }}>
        <b style={{ fontSize: 24, color: 'var(--ink)' }}>{done}</b>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>de {total}</span>
      </div>
    </div>
  )
}

/* ─── util ─── */
function fmtDate(iso: string) {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()} · ${hh}:${mi}`
}

const css = `
${sharedKeyframes(P)}
${modalSheetCss(P)}
.${P}-app{background:var(--bg);color:var(--ink);font-family:var(--ff, 'Plus Jakarta Sans',sans-serif)}
.${P}-hs{scrollbar-width:none}.${P}-hs::-webkit-scrollbar{display:none}
.${P}-demobar{display:flex;align-items:center;gap:10px;padding:8px 24px;background:var(--surface);border-bottom:1px dashed var(--line2)}
.${P}-demolabel{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:800;letter-spacing:.1em;color:var(--muted);white-space:nowrap}
.${P}-demochip{flex-shrink:0;height:30px;padding:0 12px;border:1px solid var(--line);border-radius:99px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}
.${P}-wrap{position:relative;max-width:760px;margin:0 auto;padding:40px 24px 64px;display:flex;flex-direction:column;gap:26px}
/* Voltar no canto superior ESQUERDO da tela; clamp() adapta a posição ao viewport/iframe. */
.${P}-back{position:absolute;z-index:6;left:clamp(12px,3vw,32px);top:clamp(14px,2.4vw,26px);display:inline-flex;align-items:center;gap:6px;font-size:13.5px;font-weight:700;color:#CFE3D7;text-decoration:none}
.${P}-back:hover{color:#fff}
.${P}-lockup{display:flex;align-items:center;justify-content:center;gap:11px;flex-shrink:0;white-space:nowrap}
.${P}-ticket{border-radius:28px;overflow:hidden;background:var(--surface);border:2px solid var(--line);box-shadow:0 8px 0 var(--line),0 40px 70px -40px rgba(4,26,16,.6)}
.${P}-top{position:relative;overflow:hidden;padding:34px 36px 38px;background:${VND_HERO_BG};color:#fff;text-align:center}
.${P}-topdots{position:absolute;inset:0;background-image:radial-gradient(circle,rgba(185,245,212,.16) 1.2px,transparent 1.8px);background-size:22px 22px}
.${P}-tile{width:72px;height:72px;border-radius:22px;background:${VND_GOLD};color:#2A1F02;display:inline-flex;align-items:center;justify-content:center;box-shadow:${VND_GOLD_SHADOW.replace('4px', '5px')}}
.${P}-statusbadge{display:inline-flex;height:26px;padding:0 12px;border-radius:99px;background:rgba(63,213,138,.18);color:#7BF0B4;font-size:12px;font-weight:800;align-items:center;gap:6px}
.${P}-statusdot{width:7px;height:7px;border-radius:50%;background:${VND_GREEN}}
.${P}-h1{margin:0;font-size:36px;font-weight:800;letter-spacing:-.045em;line-height:1.08}
.${P}-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:4px}
.${P}-chip{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:99px;background:rgba(255,255,255,.1);border:1px solid rgba(185,245,212,.25);font-size:12.5px;font-weight:700;color:#fff}
/* picote (linha tracejada) + FUROS laterais: círculos da cor do fundo centrados na borda do ticket
   (metade fica por fora e é cortada pelo overflow:hidden → dá o recorte do ingresso). Sombra interna
   sutil p/ o furo "afundar" e ler como buraco em qualquer fundo. */
.${P}-picote{position:relative;height:0;border-top:2px dashed var(--line2);margin:0 22px}
.${P}-notch{position:absolute;top:-19px;width:38px;height:38px;border-radius:50%;background:var(--bg);box-shadow:inset -2px 0 4px -2px rgba(4,26,16,.25),inset 2px 0 4px -2px rgba(4,26,16,.25)}
.${P}-notch-l{left:-41px}.${P}-notch-r{right:-41px}
.${P}-dates{display:flex;gap:10px}
.${P}-datetile{flex:1;padding:12px;border-radius:16px;border:2px solid var(--line);border-bottom-width:4px;background:var(--surface)}
.${P}-datelbl{font-size:10.5px;font-weight:800;letter-spacing:.1em;color:var(--muted)}
.${P}-dateval{display:block;margin-top:2px;font-size:14px;color:var(--ink)}
.${P}-foot{display:block;font-size:11.5px;line-height:1.5;color:var(--muted);text-align:center}
.${P}-section{display:block;font-size:10.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
@media (max-width:640px){
  .${P}-wrap{padding:18px 14px 44px;gap:18px}
  .${P}-top{padding:26px 18px 28px}
  .${P}-h1{font-size:26px}
  .${P}-ticket{border-radius:22px}
  .${P}-dates{flex-wrap:wrap}
  .${P}-demolabel span{display:none}
}
`

export { EntradaVND as default }
