'use client'

// SIMULADO · Entrada — marca REVISÃO (spec 06 §1). Porte fiel de
// design/SimEntradaRevisao*.dc.html. 5 estados (es) + modais ini/ret.

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { SimScreenProps, EstadoEntrada, SimEntradaReal } from '../types'
import { simTokensStyle } from '../sim-tokens'
import {
  Bgfx, MarcaR, Ic, P, cardStyle, primaryBtnStyle, ghostBtnStyle, baseKeyframes,
  REV_GOLD, RAINBOW, ERR,
} from './shared'

const PFX = 'sre'

const BADGE: Record<EstadoEntrada, string> = {
  aberto: 'Em andamento',
  agendado: 'Abre em 6 dias',
  semcad: 'Em andamento',
  retomar: 'Você já começou',
  encerrado: 'Encerrado',
}

export function EntradaRevisao({ theme, data, es: esInit = 'aberto', real }: SimScreenProps) {
  // Estado real: `es` vem do servidor (EntradaReal). Sem `real` (preview) usa o inicial.
  const es: EstadoEntrada = esInit
  const [md, setMd] = useState<null | 'ini' | 'ret'>(null)
  const [mo, setMo] = useState<'cad' | 'folha'>('cad')
  const [ag, setAg] = useState(false)
  const [nf, setNf] = useState(false)

  const { info, tentativa, countdown, aluno } = data
  const closeMd = () => setMd(null)
  const busy = real?.carregando ?? null
  // Data formatada (dd/MM/yyyy · HH:mm) a partir do ISO real do simulado.
  const fmtData = (iso?: string | null) => {
    if (!iso) return '—'
    const d = new Date(iso)
    if (isNaN(d.getTime())) return '—'
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} · ${p(d.getHours())}:${p(d.getMinutes())}`
  }
  // Sem janela definida (EntradaReal usa agoraISO em ambos quando não há datas) → "Sempre disponível".
  const temJanela = !!(info.inicioISO && info.fimISO && info.inicioISO !== info.fimISO)
  // E-mail errado/sem acesso: fecha o modal "Começar agora" para o erro (ou estado sem-cadastro) aparecer.
  useEffect(() => { if (real?.erro) setMd(null) }, [real?.erro])
  // Abre o modal "Tudo pronto" SOMENTE após validar o e-mail no servidor. E-mail errado → não abre o
  // modal; o estado de erro/sem-cadastro aparece direto (onValidar já setou o erro). Preview: abre direto.
  const abrirModal = async (modo: 'cad' | 'folha') => {
    setMo(modo)
    if (!real?.onValidar) { setMd('ini'); return }
    const ok = await real.onValidar()
    if (ok) setMd('ini')
  }
  // Badge do topo: no agendado mostra a contagem real; nos demais, o rótulo do estado.
  const badgeLabel = es === 'agendado'
    ? (countdown.dias > 0 ? `Abre em ${countdown.dias} ${countdown.dias === 1 ? 'dia' : 'dias'}` : `Abre ${countdown.dataLabel}`)
    : BADGE[es]
  // Data de encerramento real (dd/MM) para a mensagem do estado "encerrado".
  const fimCurto = (() => {
    if (!info.fimISO) return null
    const d = new Date(info.fimISO)
    if (isNaN(d.getTime())) return null
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}`
  })()

  return (
    <div className={`${PFX}-root`} style={{ ...simTokensStyle('revisao', theme), minHeight: '100vh' }}>
      <style>{css()}</style>
      <Bgfx prefix={PFX} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 880, margin: '0 auto', padding: '40px 24px 60px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        {/* Topo: Voltar + tema */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href={real?.voltarHref ?? '/aluno'} prefetch style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, color: 'var(--muted)', textDecoration: 'none' }}>
            <Ic d={P.back} size={15} />Voltar
          </Link>
          <button type="button" aria-label="Alternar tema" onClick={real?.onToggleTheme} style={{ width: 38, height: 38, borderRadius: 11, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Ic d={P.moon} size={16} />
          </button>
        </div>

        {/* Logo + badge + H1 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: 'var(--brand)', flexShrink: 0 }}><MarcaR size={52} /></span>
          <div style={{ minWidth: 0 }}>
            <span className={`${PFX}-badge`} style={{ display: 'inline-flex', height: 26, padding: '0 12px', borderRadius: 99, background: REV_GOLD, color: '#2A1A55', fontSize: 12, fontWeight: 800, alignItems: 'center' }}>{badgeLabel}</span>
            <h1 className={`${PFX}-h1`} style={{ margin: '8px 0 0', fontSize: 42, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05, color: 'var(--brand)', textTransform: 'uppercase' }}>{info.titulo}</h1>
          </div>
        </div>

        {/* Cartão Informações */}
        <RBox titulo="Informações do simulado" icon={P.book}>
          <div className={`${PFX}-infogrid`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Tile full label="Duração" iconNode={<Ic size={14}><circle cx="12" cy="12" r="9" /><path d={P.clock} /></Ic>} valor={info.duracaoMin == null ? 'Sem limite · pause quando quiser' : `${info.duracaoMin} min`} />
            {temJanela ? (
              <>
                <Tile label="Início" iconNode={<Ic size={14}><rect x="3" y="4" width="18" height="18" rx="2" /><path d={P.calendar} /></Ic>} valor={fmtData(info.inicioISO)} />
                <Tile label="Encerra" iconNode={<Ic size={14}><rect x="3" y="4" width="18" height="18" rx="2" /><path d={P.calendar} /></Ic>} valor={fmtData(info.fimISO)} />
              </>
            ) : (
              <Tile label="Disponibilidade" iconNode={<Ic size={14}><rect x="3" y="4" width="18" height="18" rx="2" /><path d={P.calendar} /></Ic>} valor="Sempre disponível" />
            )}
            <Tile label="Questões" iconNode={<Ic d={P.list} size={14} />} valor={`${info.n} · objetiva A–E`} />
          </div>
        </RBox>

        {/* Cartão Identificação */}
        <RBox titulo="Identifique-se para iniciar" icon={P.chart} iconPath2>
          <span style={{ display: 'block', margin: '-6px 0 16px', fontSize: 13, color: 'var(--muted)' }}>
            Use o e-mail cadastrado na <b style={{ color: 'var(--brand)' }}>plataforma do Simulado Revisão</b>.
          </span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {es === 'aberto' && (
              <>
                <EmailField real={real} />
                {real?.erro && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '12px 14px', borderRadius: 12, background: 'rgba(229,72,77,.08)', border: '1px solid rgba(229,72,77,.3)', color: ERR, fontSize: 12.5, lineHeight: 1.5 }}>
                    <Ic size={16} style={{ marginTop: 1, flexShrink: 0 }}><circle cx="12" cy="12" r="9" /><path d={P.info} /></Ic>
                    <span>{real.erro.titulo ? <b>{real.erro.titulo} </b> : null}{real.erro.mensagem}</span>
                  </div>
                )}
                <button type="button" onClick={() => abrirModal('cad')} disabled={!!busy} className={`${PFX}-sbtn`} style={{ ...primaryBtnStyle(52), width: '100%', opacity: busy ? 0.6 : 1 }}>
                  <Ic d={P.play} size={17} />{busy ? 'Verificando…' : 'Iniciar simulado'}
                </button>
                {(real ? real.permiteFolha : true) && (
                  <button type="button" onClick={() => abrirModal('folha')} disabled={!!busy} className={`${PFX}-sbtn`} style={{ ...ghostBtnStyle(48), width: '100%', opacity: busy ? 0.6 : 1 }}>
                    <Ic d={P.list} size={17} />Responder só a folha de respostas
                  </button>
                )}
                <Divisor />
                <button type="button" onClick={() => real?.onIdentificar('resultado')} disabled={!!busy} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, color: 'var(--brand)', background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }}>
                  <Ic size={15}><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" /></Ic>Já fiz — ver meus resultados
                </button>
              </>
            )}

            {es === 'agendado' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'var(--chip)', color: 'var(--brand)', fontSize: 13, fontWeight: 700 }}>
                  <Ic size={17}><circle cx="12" cy="12" r="9" /><path d={P.clock} /></Ic>
                  Este simulado ainda não abriu. Ele fica disponível em {countdown.dataLabel}.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <CountBox n={countdown.dias} lab="dias" />
                  <CountBox n={countdown.horas} lab="horas" />
                  <CountBox n={countdown.min} lab="min" />
                </div>
                <EmailField real={real} />
                <button type="button" disabled style={{ width: '100%', height: 52, border: 0, borderRadius: 14, background: 'var(--surface2)', color: 'var(--muted)', font: 'inherit', fontSize: 14.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Ic size={16}><rect x="4" y="11" width="16" height="10" rx="2" /><path d={P.lock} /></Ic>
                  Disponível em {countdown.dataLabel}
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: '1px solid var(--line)' }}>
                  <div style={{ flex: 1 }}>
                    <b style={{ display: 'block', fontSize: 13.5, color: 'var(--ink)' }}>Avise-me quando abrir</b>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Notificação no app e por e-mail</span>
                  </div>
                  <button type="button" onClick={() => setNf((v) => !v)} aria-pressed={nf} style={{ position: 'relative', width: 42, height: 24, padding: 0, border: 0, borderRadius: 99, background: nf ? 'var(--selDot)' : 'var(--line2)', cursor: 'pointer' }}>
                    <span style={{ position: 'absolute', left: 3, top: 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transform: `translateX(${nf ? 18 : 0}px)`, transition: 'transform .2s' }} />
                  </button>
                </div>
                <a href="#" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, color: 'var(--brand)' }}>
                  <Ic size={15}><rect x="3" y="4" width="18" height="18" rx="2" /><path d={P.calendar} /></Ic>Adicionar à minha agenda
                </a>
              </>
            )}

            {es === 'semcad' && (
              <>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>E-mail cadastrado na plataforma <b style={{ color: ERR }}>*</b></span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, height: 50, padding: '0 14px', borderRadius: 12, border: `1.5px solid ${ERR}`, background: 'var(--surface)', color: 'var(--muted)', boxShadow: `0 0 0 4px rgba(229,72,77,.12)` }}>
                    <Ic size={17}><rect x="2" y="4" width="20" height="16" rx="2" /><path d={P.mail} /></Ic>
                    {real
                      ? <input type="email" value={real.email} onChange={(e) => real.setEmail(e.target.value)} placeholder="seu@email.com" autoComplete="email" style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', font: 'inherit', fontSize: 14.5, color: 'var(--ink)' }} />
                      : <input type="email" defaultValue="aluno.novo@email.com" placeholder="seu@email.com" style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', font: 'inherit', fontSize: 14.5, color: 'var(--ink)' }} />}
                    <span style={{ color: ERR }}><Ic size={17}><circle cx="12" cy="12" r="9" /><path d={P.info} /></Ic></span>
                  </span>
                </label>
                <div style={{ padding: 14, borderRadius: 12, background: 'rgba(229,72,77,.08)', border: '1px solid rgba(229,72,77,.3)' }}>
                  <b style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: ERR }}>
                    <Ic size={16}><circle cx="12" cy="12" r="9" /><path d={P.info} /></Ic>{real?.erro?.titulo ?? 'Não encontramos este e-mail'}
                  </b>
                  <span style={{ display: 'block', marginTop: 6, fontSize: 12.5, lineHeight: 1.5, color: 'var(--muted)' }}>
                    {real?.erro?.mensagem ?? 'Confira se é o mesmo e-mail usado na compra ou no cadastro. Se você ainda não tem acesso, crie sua conta grátis para fazer este simulado.'}
                  </span>
                </div>
                <button type="button" onClick={() => abrirModal('cad')} disabled={!!busy} className={`${PFX}-sbtn`} style={{ ...primaryBtnStyle(50), width: '100%', opacity: busy ? 0.6 : 1 }}>
                  <Ic d={P.refresh} size={17}><path d={P.refresh} /><path d="M21 3v5h-5" /></Ic>Tentar novamente
                </button>
                <button type="button" className={`${PFX}-sbtn`} style={{ ...ghostBtnStyle(48), width: '100%' }}>
                  <Ic size={17}><circle cx="12" cy="8" r="4" /><path d={P.user} /></Ic>Criar minha conta grátis
                </button>
                <a href="#" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, color: 'var(--brand)' }}>
                  <Ic d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" size={15} />Falar com o suporte
                </a>
              </>
            )}

            {es === 'retomar' && (
              <>
                <EmailField value="joao@exemplo.com" real={real} />
                <div style={{ padding: 16, borderRadius: 14, background: 'var(--surface2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <b style={{ fontSize: 14, color: 'var(--ink)' }}>Você já começou este simulado</b>
                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--brand)' }}>{tentativa.respondidas}/{info.n}</span>
                  </div>
                  <div style={{ height: 8, margin: '10px 0 8px', borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}>
                    <span style={{ display: 'block', width: `${Math.round((tentativa.respondidas / info.n) * 100)}%`, height: '100%', borderRadius: 99, background: 'var(--selDot)' }} />
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Última atividade hoje às {tentativa.ultimaAtividade} · parou na questão {tentativa.ultimaQuestao}</span>
                </div>
                <button type="button" onClick={() => setMd('ret')} className={`${PFX}-sbtn`} style={{ ...primaryBtnStyle(52), width: '100%' }}>
                  <Ic d={P.play} size={17} />Continuar de onde parei
                </button>
                <button type="button" onClick={() => setMd('ret')} className={`${PFX}-sbtn`} style={{ ...ghostBtnStyle(48), width: '100%' }}>
                  <Ic d={P.list} size={17} />Abrir a folha de respostas
                </button>
              </>
            )}

            {es === 'encerrado' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'var(--surface2)', color: 'var(--ink)', fontSize: 13, fontWeight: 600 }}>
                  <Ic d={P.flag} size={17} />{fimCurto ? `O prazo terminou em ${fimCurto}.` : 'O prazo deste simulado terminou.'} Você ainda pode treinar sem valer para o ranking.
                </div>
                <EmailField real={real} />
                <button type="button" onClick={() => real?.onIdentificar('resultado')} disabled={!!busy} className={`${PFX}-sbtn`} style={{ ...primaryBtnStyle(52), width: '100%', opacity: busy ? 0.6 : 1 }}>
                  <Ic size={17}><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" /></Ic>Ver meu resultado
                </button>
                <button type="button" className={`${PFX}-sbtn`} style={{ ...ghostBtnStyle(48), width: '100%' }}>
                  <Ic d={P.book} size={17} />Gabarito comentado
                </button>
                <button type="button" className={`${PFX}-sbtn`} style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, height: 48, border: 0, borderRadius: 14, background: REV_GOLD, color: '#2A1A55', font: 'inherit', fontSize: 14.5, fontWeight: 800, cursor: 'pointer' }}>
                  <Ic d={P.refresh} size={17}><path d={P.refresh} /><path d="M21 3v5h-5" /></Ic>Fazer como treino
                </button>
              </>
            )}

            <span style={{ display: 'block', fontSize: 11.5, lineHeight: 1.5, color: 'var(--muted)', textAlign: 'center' }}>
              Ao iniciar você concorda com as regras do simulado. Seus dados não são exibidos no ranking — apenas as iniciais.
            </span>
          </div>
        </RBox>
      </div>

      {/* Modal INI */}
      {md === 'ini' && (
        <Modal onClose={closeMd} width={500} prefix={PFX}
          icon={P.play} titulo={real?.emAndamento ? 'Continuar de onde você parou' : 'Tudo pronto para começar'} sub={info.titulo}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <KpiBox label="Tempo" valor="Sem limite" nota="pause quando quiser" brand />
            <KpiBox label="Questões" valor={String(info.n)} nota="objetiva A–E" />
          </div>
          {real?.emAndamento ? (
            <span style={{ display: 'block', fontSize: 12.5, lineHeight: 1.5, color: 'var(--muted)', textAlign: 'center' }}>
              Você já começou este simulado — vamos continuar da <b style={{ color: 'var(--ink)' }}>questão {real.emAndamento.questaoAtual} de {real.emAndamento.total}</b>. Suas respostas foram salvas.
            </span>
          ) : null}
          <span style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)' }}>Como você quer responder?</span>
          <RadioMode selected={mo === 'cad'} onClick={() => setMo('cad')} icon={P.book} titulo="Caderno completo" sub="Enunciados, alternativas e ferramentas de estudo" />
          <RadioMode selected={mo === 'folha'} onClick={() => setMo('folha')} icon={P.list} titulo="Só a folha de respostas" sub="Para quem fez no papel e quer apenas marcar" />
          <button type="button" onClick={() => setAg((v) => !v)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 0, border: 0, background: 'none', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
            <Checkbox on={ag} />
            <span style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--ink)' }}>Li as regras e estou pronto. Sei que posso pausar e voltar depois.</span>
          </button>
          <button
            type="button"
            onClick={() => { if (ag && !busy) real?.onIdentificar(mo === 'folha' ? 'folha' : 'iniciar') }}
            className={`${PFX}-sbtn`}
            style={{ ...primaryBtnStyle(52), opacity: ag && !busy ? 1 : 0.45, pointerEvents: ag && !busy ? 'auto' : 'none', transition: 'opacity .2s' }}
          >
            <Ic d={P.play} size={16} />{busy ? 'Entrando…' : real?.emAndamento ? 'Continuar de onde parei' : 'Começar agora'}
          </button>
        </Modal>
      )}

      {/* Modal RET */}
      {md === 'ret' && (
        <Modal onClose={closeMd} width={520} prefix={PFX}
          icon={P.refresh} titulo={`Bem-vindo de volta, ${aluno.primeiroNome}`} sub="Seu progresso foi salvo automaticamente">
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <ProgressRing valor={tentativa.respondidas} total={info.n} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
              <span><b style={{ color: 'var(--ink)' }}>{tentativa.respondidas} respondidas</b> · {info.n - tentativa.respondidas} em branco</span>
              <span><b style={{ color: 'var(--flag)' }}>{tentativa.marcadas.length} para revisar</b></span>
              <span>Tempo: <b style={{ color: 'var(--ink)' }}>Sem limite</b> pausado há 2 h</span>
              <span>Parou na questão <b style={{ color: 'var(--ink)' }}>{tentativa.ultimaQuestao}</b></span>
            </div>
          </div>
          <button type="button" className={`${PFX}-sbtn`} style={primaryBtnStyle(52)}>
            <Ic d={P.play} size={16} />Continuar na questão {tentativa.ultimaQuestao}
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button type="button" className={`${PFX}-sbtn`} style={ghostBtnStyle(44)}><Ic d={P.list} size={17} />Ver as que pulei</button>
            <button type="button" className={`${PFX}-sbtn`} style={ghostBtnStyle(44)}>
              <Ic size={17}><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="m9 14 2 2 4-4" /></Ic>Folha de respostas
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Subcomponentes ───────────────────────────────────────────────────────────

function RBox({ titulo, icon, iconPath2, children }: { titulo: string; icon: string; iconPath2?: boolean; children: React.ReactNode }) {
  return (
    <div style={cardStyle({ borderRadius: 22, overflow: 'hidden' })}>
      <span style={{ display: 'block', height: 5, background: RAINBOW }} />
      <div style={{ padding: '26px 28px' }}>
        <b style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, letterSpacing: '-0.02em', color: 'var(--ink)', marginBottom: 16 }}>
          <span style={{ color: 'var(--brand)' }}>
            {iconPath2 ? <Ic size={20}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Ic> : <Ic d={icon} size={20} />}
          </span>
          {titulo}
        </b>
        {children}
      </div>
    </div>
  )
}

function Tile({ label, iconNode, valor, full }: { label: string; iconNode: React.ReactNode; valor: string; full?: boolean }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined, display: 'flex', flexDirection: 'column', gap: 4, padding: '14px 16px', borderRadius: 14, background: 'var(--surface2)' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
        {iconNode}{label}
      </span>
      <b style={{ fontSize: 15, color: 'var(--ink)' }}>{valor}</b>
    </div>
  )
}

const inputEl: React.CSSProperties = { flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', font: 'inherit', fontSize: 14.5, color: 'var(--ink)' }

// Com `real`: e-mail CONTROLADO (+ CPF/telefone conforme o método). Sem `real` (preview): decorativo.
function EmailField({ value, real }: { value?: string; real?: SimEntradaReal }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>E-mail cadastrado na plataforma <b style={{ color: ERR }}>*</b></span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, height: 50, padding: '0 14px', borderRadius: 12, border: '1.5px solid var(--line2)', background: 'var(--surface)', color: 'var(--muted)' }}>
          <Ic size={17}><rect x="2" y="4" width="20" height="16" rx="2" /><path d={P.mail} /></Ic>
          {real
            ? <input type="email" value={real.email} onChange={(e) => real.setEmail(e.target.value)} placeholder="seu@email.com" autoComplete="email" style={inputEl} />
            : <input type="email" defaultValue={value} placeholder="seu@email.com" style={inputEl} />}
        </span>
      </label>
      {real?.metodo === 'email_cpf' && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>CPF <b style={{ color: ERR }}>*</b></span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, height: 50, padding: '0 14px', borderRadius: 12, border: '1.5px solid var(--line2)', background: 'var(--surface)' }}>
            <input inputMode="numeric" value={real.cpf} onChange={(e) => real.setCpf(e.target.value)} placeholder="000.000.000-00" style={inputEl} />
          </span>
        </label>
      )}
      {real?.metodo === 'email_telefone' && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Telefone <b style={{ color: ERR }}>*</b></span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, height: 50, padding: '0 14px', borderRadius: 12, border: '1.5px solid var(--line2)', background: 'var(--surface)' }}>
            <input inputMode="tel" value={real.telefone} onChange={(e) => real.setTelefone(e.target.value)} placeholder="(00) 00000-0000" style={inputEl} />
          </span>
        </label>
      )}
    </div>
  )
}

function Divisor() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11.5, fontWeight: 700, color: 'var(--muted)' }}>
      <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />OU<span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
    </div>
  )
}

function CountBox({ n, lab }: { n: number; lab: string }) {
  return (
    <div style={{ flex: 1, padding: '14px 6px', borderRadius: 12, background: 'var(--surface2)', textAlign: 'center' }}>
      <b style={{ display: 'block', fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)' }}>{String(n).padStart(2, '0')}</b>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{lab}</span>
    </div>
  )
}

function KpiBox({ label, valor, nota, brand }: { label: string; valor: string; nota: string; brand?: boolean }) {
  return (
    <div style={{ padding: 14, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface2)', textAlign: 'center' }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>{label}</span>
      <b style={{ display: 'block', margin: '4px 0 2px', fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', color: brand ? 'var(--brand)' : 'var(--ink)' }}>{valor}</b>
      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{nota}</span>
    </div>
  )
}

function RadioMode({ selected, onClick, icon, titulo, sub }: { selected: boolean; onClick: () => void; icon: string; titulo: string; sub: string }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, border: `2px solid ${selected ? 'var(--selLine)' : 'var(--line)'}`, background: selected ? 'var(--selBg)' : 'var(--surface)', font: 'inherit', textAlign: 'left', cursor: 'pointer', width: '100%' }}>
      <span style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--surface2)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic d={icon} size={18} /></span>
      <span style={{ flex: 1, lineHeight: 1.3 }}>
        <b style={{ display: 'block', fontSize: 14, color: 'var(--ink)' }}>{titulo}</b>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{sub}</span>
      </span>
      <span style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${selected ? 'var(--selLine)' : 'var(--line)'}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        {selected && <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--selDot)' }} />}
      </span>
    </button>
  )
}

function Checkbox({ on }: { on: boolean }) {
  return (
    <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 7, border: `2px solid ${on ? 'var(--selDot)' : 'var(--line2)'}`, background: on ? 'var(--selDot)' : 'transparent', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      {on && <Ic d={P.check} size={13} strokeWidth={3.2} />}
    </span>
  )
}

function ProgressRing({ valor, total }: { valor: number; total: number }) {
  const dash = 314.2
  const off = dash * (1 - valor / total)
  return (
    <div style={{ position: 'relative', width: 120, height: 120, flexShrink: 0 }}>
      <svg viewBox="0 0 120 120" style={{ width: 120, height: 120, transform: 'rotate(-90deg)' }}>
        <circle cx="60" cy="60" r="50" fill="none" stroke="var(--track)" strokeWidth="12" />
        <circle cx="60" cy="60" r="50" fill="none" stroke="var(--selDot)" strokeWidth="12" strokeLinecap="round" strokeDasharray={dash} strokeDashoffset={off} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.1 }}>
        <b style={{ fontSize: 24, color: 'var(--ink)' }}>{valor}</b>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>de {total}</span>
      </div>
    </div>
  )
}

export function Modal({ onClose, width, prefix, icon, titulo, sub, children }: { onClose: () => void; width: number; prefix: string; icon: string; titulo: string; sub: string; children: React.ReactNode }) {
  return (
    <>
      <div onClick={onClose} className={`${prefix}-mbg`} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(10,10,25,.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} />
      <div role="dialog" className={`${prefix}-mpop ${prefix}-sheet`} style={{ position: 'fixed', left: '50%', top: '50%', width, transform: 'translate(-50%,-50%)', zIndex: 81, maxHeight: 'calc(100% - 24px)', overflowY: 'auto', borderRadius: 22, background: 'var(--surface)', boxShadow: '0 40px 80px -30px rgba(0,0,0,.6)' }}>
        <span style={{ display: 'block', height: 5, background: `linear-gradient(90deg,#5B3FD0,#8F75FF 60%,${REV_GOLD})` }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '22px 24px 4px' }}>
          <span style={{ width: 50, height: 50, borderRadius: 16, background: 'color-mix(in srgb,var(--selDot) 14%,transparent)', color: 'var(--selDot)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {icon === P.refresh ? <Ic size={24}><path d={P.refresh} /><path d="M21 3v5h-5" /></Ic> : <Ic d={icon} size={24} />}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ display: 'block', fontSize: 19, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{titulo}</b>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{sub}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" style={{ alignSelf: 'flex-start', width: 34, height: 34, border: 0, borderRadius: 10, background: 'var(--surface2)', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Ic d={P.close} size={16} />
          </button>
        </div>
        <div style={{ padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
      </div>
    </>
  )
}

function css() {
  return baseKeyframes(PFX) + `
@media (max-width:640px){
  .${PFX}-h1{font-size:28px}
  .${PFX}-infogrid{grid-template-columns:1fr 1fr!important}
  .${PFX}-sheet{left:12px!important;right:12px!important;top:auto!important;bottom:12px!important;width:auto!important;transform:none!important;max-height:calc(100% - 24px)}
  .${PFX}-sheet.${PFX}-mpop{animation:${PFX}msh .35s cubic-bezier(.22,1,.36,1) both}
}
`
}
