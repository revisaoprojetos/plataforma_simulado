'use client'

// qcore — BLOCO DE QUESTÃO do design novo (spec 04 "qcore" / spec 03 §5), FUNCIONAL e data-driven.
// Recebe uma `QuestaoAluno` (dados reais do banco) + `brand` (forma da letra/raio) e resolve de verdade:
// registra a tentativa em /api/aluno/questao-resposta e favorita em /api/aluno/favoritos. O GABARITO já vem
// em questao.alternativas[].correta — ao revelar, marca a correta (verde) e a escolhida errada (vermelha).
// Tokens da área são HERDADOS do root do pai (var(--surface)/--line/--ink/--muted/--brand/…); este
// componente NÃO chama internaTokensStyle. Prefixo CSS qc-. Letra redonda (Rev/VND) × quadrada (MEQ).

import { useMemo, useState, type CSSProperties } from 'react'
import { Scissors, Bookmark, Check, X, ArrowRight, Lock, MessageSquare, BarChart3, GraduationCap } from 'lucide-react'
import type { Brand } from './interna-tokens'
import type { QuestaoAluno } from '@/components/aluno/questao-resolvivel'

const LETRA = ['A', 'B', 'C', 'D', 'E', 'F']
const OK = '#1FA868'
const ERR = '#E5484D'

/** Cor/raio da letra selecionada por marca (herda do mock: Rev/VND redondo, MEQ quadrado).
 *  Raios de linha/tag e estilo de tag vêm dos mockups: alt Rev 14 · VND 16 · MEQ 10;
 *  tag Rev/VND pílula (99) sem borda · MEQ retângulo (6) com borda, fonte normal. */
function brandBits(brand: Brand) {
  const meq = brand === 'meq'
  const vnd = brand === 'vnd'
  return {
    meq,
    letterRadius: (meq ? 8 : '50%') as number | string,
    ctaRadius: meq ? 10 : 12,
    altRadius: meq ? 10 : vnd ? 16 : 14,
    tagRadius: meq ? 6 : 99,
    tagBorder: meq, // MEQ: tags com borda
    tagMono: !meq, // MEQ: código em fonte normal (não mono)
    // selDot/selBg caem nos tokens da marca já setados no root (sim-tokens).
    selDot: 'var(--selDot,var(--brand))',
    selBg: 'var(--selBg,var(--chip))',
    ctaBg: 'var(--brand)',
    ctaInk: '#FFF',
  }
}

export function QCore({ brand, questao, numero }: { brand: Brand; questao: QuestaoAluno; numero?: number }) {
  const bits = brandBits(brand)

  // Alternativas ordenadas (A..E seguem `ordem`). CE = tipo 'ce' OU sem alternativas.
  const alts = useMemo(() => [...(questao.alternativas ?? [])].sort((a, b) => a.ordem - b.ordem), [questao.alternativas])
  const ehCE = questao.tipo === 'ce' || alts.length === 0
  const letraDoId = (id: string) => LETRA[alts.findIndex((a) => a.id === id)] ?? '?'
  const idCorreta = alts.find((a) => a.correta)?.id ?? null

  const [escolhida, setEscolhida] = useState<string | null>(null)
  const [eliminadas, setEliminadas] = useState<Set<string>>(new Set())
  const [revelado, setRevelado] = useState(false)
  const [favorito, setFavorito] = useState(questao.favorito)
  const [favPending, setFavPending] = useState(false)
  const [aba, setAba] = useState<'com' | 'est'>('com')

  const acertou = revelado && escolhida != null && escolhida === idCorreta

  function pick(id: string) {
    if (revelado || eliminadas.has(id)) return
    setEscolhida(id)
  }
  function toggleCut(id: string) {
    if (revelado) return
    setEliminadas((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else { n.add(id); if (escolhida === id) setEscolhida(null) } // eliminar a selecionada limpa a escolha
      return n
    })
  }
  function resolver() {
    if (!escolhida || revelado) return
    setRevelado(true)
    // Registra a tentativa (histórico de prática) — fire-and-forget, não bloqueia a UI.
    fetch('/api/aluno/questao-resposta', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questao_id: questao.id, alternativa_id: escolhida }),
    }).catch(() => {})
  }
  async function toggleFavorito() {
    if (favPending) return
    setFavPending(true)
    setFavorito((v) => !v) // otimista
    try {
      const res = await fetch('/api/aluno/favoritos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questao_id: questao.id }),
      })
      if (res.ok) { const j = await res.json().catch(() => null); if (j && typeof j.favorito === 'boolean') setFavorito(j.favorito) }
    } finally {
      setFavPending(false)
    }
  }

  // Tags do cabeçalho (código/número + taxonomia + etiquetas).
  const codigoTag = questao.codigo ?? (numero != null ? `#${numero}` : null)

  return (
    <div
      className="qc-card"
      style={{
        display: 'flex', flexDirection: 'column', gap: 16,
        padding: 20, borderRadius: 18, background: 'var(--surface)', border: '1px solid var(--line)',
        ['--qSelBg' as string]: bits.selBg,
      } as CSSProperties}
    >
      <style>{QC_CSS}</style>

      {/* topo: tags à esquerda + Salvar à direita */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
          {codigoTag && <span style={tagStyle('var(--chip)', bits.meq ? 'var(--brand2)' : 'var(--brand)', bits, !bits.meq)}>{codigoTag}</span>}
          {questao.disciplina && <span style={tagStyle('var(--surface2)', 'var(--ink)', bits)}>{questao.disciplina}</span>}
          {questao.assunto && <span style={tagStyle('var(--surface2)', 'var(--muted)', bits)}>{questao.assunto}</span>}
          {questao.banca && <span style={tagStyle('var(--surface2)', 'var(--muted)', bits)}>{questao.banca}</span>}
          {questao.ano != null && <span style={tagStyle('var(--surface2)', 'var(--muted)', bits)}>{questao.ano}</span>}
          {(questao.etiquetas ?? []).map((e) => (
            <span key={e.nome} style={tagStyle(`color-mix(in srgb, ${e.cor ?? '#64748b'} 14%, transparent)`, e.cor ?? '#64748b', bits)}>{e.nome}</span>
          ))}
        </div>
        <button
          type="button" onClick={toggleFavorito} disabled={favPending}
          aria-label={favorito ? 'Remover dos salvos' : 'Salvar questão'} title={favorito ? 'Remover dos salvos' : 'Salvar questão'}
          className="qc-ibtn"
          style={{ ...iconBtn, color: favorito ? 'var(--brand)' : 'var(--muted)', borderColor: favorito ? 'var(--brand)' : 'var(--line)' }}
        >
          <Bookmark size={16} fill={favorito ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* enunciado */}
      <p style={{ margin: 0, fontSize: 17, lineHeight: 1.55, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>{questao.enunciado}</p>

      {questao.imagem_url && (
        <div style={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface2)', padding: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={questao.imagem_url} alt="Imagem da questão" style={{ maxWidth: '100%', maxHeight: '60vh', margin: '0 auto', display: 'block', objectFit: 'contain' }} />
        </div>
      )}

      {/* alternativas */}
      {ehCE ? (
        <CertoErrado escolhida={escolhida} revelado={revelado} idCorreta={idCorreta} alts={alts} onPick={pick} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {alts.map((alt, i) => {
            const eliminada = eliminadas.has(alt.id)
            const escolha = escolhida === alt.id
            const mostrarCerta = revelado && alt.id === idCorreta
            const mostrarErrada = revelado && escolha && alt.id !== idCorreta
            let bd = 'var(--line)', bg = 'transparent', dot = 'var(--surface2)', ink = 'var(--ink)'
            if (mostrarCerta) { bd = OK; bg = 'rgba(31,168,104,.09)'; dot = OK; ink = '#FFF' }
            else if (mostrarErrada) { bd = ERR; bg = 'rgba(229,72,77,.08)'; dot = ERR; ink = '#FFF' }
            else if (escolha) { bd = bits.selDot; bg = bits.selBg; dot = bits.selDot; ink = '#FFF' }
            return (
              <div
                key={alt.id} className="qc-alt"
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 12px 12px 14px', borderRadius: bits.altRadius, border: `1.5px solid ${bd}`, background: bg, opacity: eliminada && !revelado ? 0.42 : 1, transition: 'border-color .2s,background .2s,opacity .2s,box-shadow .2s', boxShadow: escolha && !revelado ? `0 0 0 3px ${bits.selBg}` : 'none' }}
              >
                {/* tesoura — coluna à ESQUERDA (sem efeito depois de revelar) */}
                <button
                  type="button" onClick={() => toggleCut(alt.id)} disabled={revelado}
                  aria-label={eliminada ? `Restaurar alternativa ${LETRA[i]}` : `Eliminar alternativa ${LETRA[i]}`} title="Eliminar alternativa"
                  className="qc-cut"
                  style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 10, border: 0, background: eliminada ? 'var(--flagBg,rgba(229,72,77,.12))' : 'transparent', color: eliminada ? 'var(--flag,#E5484D)' : 'var(--muted2,var(--muted))', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: revelado ? 'default' : 'pointer', alignSelf: 'center' }}
                >
                  <Scissors size={16} style={{ transform: eliminada ? 'rotate(-12deg)' : 'none' }} />
                </button>
                <button
                  type="button" onClick={() => pick(alt.id)} disabled={revelado || eliminada}
                  style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: 12, padding: 0, border: 0, background: 'none', font: 'inherit', textAlign: 'left', cursor: revelado || eliminada ? 'default' : 'pointer' }}
                >
                  <span style={{ width: 30, height: 30, borderRadius: bits.letterRadius, background: dot, color: ink, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 800, transition: 'background .2s,color .2s' }}>{LETRA[i]}</span>
                  <span style={{ paddingTop: 5, fontSize: 14.5, lineHeight: 1.5, color: 'var(--ink)', textDecoration: eliminada && !revelado ? 'line-through' : 'none', whiteSpace: 'pre-wrap' }}>{alt.texto}</span>
                  {mostrarCerta && <span style={{ marginLeft: 'auto', height: 20, padding: '0 8px', borderRadius: 99, background: OK, color: '#FFF', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}>GABARITO</span>}
                  {mostrarErrada && <span style={{ marginLeft: 'auto', height: 20, padding: '0 8px', borderRadius: 99, background: ERR, color: '#FFF', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}>SUA RESPOSTA</span>}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* resultado */}
      {revelado && (
        <div className="qc-pv" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: acertou ? 'rgba(31,168,104,.1)' : 'rgba(229,72,77,.09)', border: `1px solid ${acertou ? OK : ERR}` }}>
          <span style={{ width: 30, height: 30, borderRadius: '50%', background: acertou ? OK : ERR, color: '#FFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{acertou ? <Check size={16} strokeWidth={3} /> : <X size={16} strokeWidth={3} />}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            {acertou
              ? <b style={{ display: 'block', fontSize: 13.5, color: OK }}>Resposta correta! · +10 XP</b>
              : <b style={{ display: 'block', fontSize: 13.5, color: ERR }}>Resposta incorreta — o gabarito é {idCorreta ? letraDoId(idCorreta) : '—'}.</b>}
          </div>
        </div>
      )}

      {/* ação Resolver (opaco até escolher). No modo lista não há "próxima". */}
      {!revelado && (
        <div>
          <button
            type="button" onClick={resolver} disabled={!escolhida}
            className="qc-cta"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, padding: '0 22px', border: 0, borderRadius: bits.ctaRadius, color: bits.ctaInk, background: bits.ctaBg, font: 'inherit', fontSize: 14, fontWeight: 800, opacity: escolhida ? 1 : 0.45, cursor: escolhida ? 'pointer' : 'not-allowed', transition: 'opacity .2s,filter .15s' }}
          >
            <Check size={15} /> Resolver
          </button>
        </div>
      )}

      {/* abas Comentário / Estatísticas (bloqueadas até resolver) */}
      <div style={{ paddingTop: 16, borderTop: '1px solid var(--line)' }}>
        <div style={{ display: 'inline-flex', gap: 3, padding: 3, borderRadius: 11, background: 'var(--surface2)', border: '1px solid var(--line)' }}>
          {([['com', 'Comentário', MessageSquare], ['est', 'Estatísticas', BarChart3]] as const).map(([k, label, Icon]) => {
            const on = aba === k && revelado
            return (
              <button
                key={k} type="button" onClick={() => revelado && setAba(k)} disabled={!revelado}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', border: 0, borderRadius: 8, background: on ? 'var(--surface)' : 'transparent', color: on ? 'var(--ink)' : 'var(--muted)', font: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: revelado ? 'pointer' : 'not-allowed', boxShadow: on ? '0 2px 8px rgba(0,0,0,.08)' : 'none' }}
              >
                <Icon size={13} />{label}
              </button>
            )
          })}
        </div>

        {!revelado && (
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'var(--surface2)', fontSize: 12.5, color: 'var(--muted)' }}>
            <Lock size={15} /> Resolva a questão para ver o comentário e as estatísticas.
          </div>
        )}
        {revelado && aba === 'com' && (
          <div className="qc-pv" style={{ display: 'flex', gap: 12, marginTop: 14 }}>
            <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--chip)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><GraduationCap size={17} /></span>
            <div>
              <b style={{ fontSize: 13, color: 'var(--ink)' }}>Comentário do professor</b>
              <p style={{ margin: '4px 0 0', fontSize: 13.5, lineHeight: 1.6, color: 'var(--muted)', whiteSpace: 'pre-wrap' }}>{questao.comentario_professor?.trim() || 'Sem comentário.'}</p>
            </div>
          </div>
        )}
        {revelado && aba === 'est' && (
          // Estado NEUTRO e honesto — não há distribuição real para questão avulsa aqui (§6: nunca inventar).
          <div className="qc-pv" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, background: 'var(--surface2)', fontSize: 12.5, color: 'var(--muted)' }}>
            <BarChart3 size={15} /> Distribuição indisponível para esta questão.
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Certo/Errado (CE)
// Dois botões sólidos (verde/vermelho). A alternativa correta define o "lado" correto ao revelar.
function CertoErrado({ escolhida, revelado, idCorreta, alts, onPick }: {
  escolhida: string | null; revelado: boolean; idCorreta: string | null
  alts: QuestaoAluno['alternativas']; onPick: (id: string) => void
}) {
  // Casa os 2 primeiros ids a Certo/Errado quando existem; senão usa ids sintéticos.
  const certoId = alts[0]?.id ?? '__certo'
  const erradoId = alts[1]?.id ?? '__errado'
  const botoes: { id: string; label: string; cor: string }[] = [
    { id: certoId, label: 'Certo', cor: OK },
    { id: erradoId, label: 'Errado', cor: ERR },
  ]
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      {botoes.map((b) => {
        const escolha = escolhida === b.id
        const mostrarCerta = revelado && b.id === idCorreta
        const mostrarErrada = revelado && escolha && b.id !== idCorreta
        const ativo = escolha || mostrarCerta
        return (
          <button
            key={b.id} type="button" onClick={() => onPick(b.id)} disabled={revelado}
            style={{
              flex: 1, height: 52, borderRadius: 14, border: `1.5px solid ${ativo || mostrarErrada ? b.cor : 'var(--line)'}`,
              background: ativo ? b.cor : mostrarErrada ? 'rgba(229,72,77,.08)' : 'transparent',
              color: ativo ? '#FFF' : mostrarErrada ? ERR : 'var(--ink)',
              font: 'inherit', fontSize: 15, fontWeight: 800, cursor: revelado ? 'default' : 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all .2s',
            }}
          >
            {b.label === 'Certo' ? <Check size={18} /> : <X size={18} />}{b.label}
            {mostrarCerta && <span style={{ marginLeft: 6, height: 20, padding: '0 8px', borderRadius: 99, background: 'rgba(255,255,255,.22)', color: '#FFF', fontSize: 10, fontWeight: 800 }}>GABARITO</span>}
          </button>
        )
      })}
    </div>
  )
}

function tagStyle(bg: string, color: string, bits: ReturnType<typeof brandBits>, mono = false): CSSProperties {
  // MEQ: 24px/0 9px/raio 6/borda/peso 600; Rev·VND: 26px/0 10px/pílula/peso 700 (código em mono).
  return {
    height: bits.meq ? 24 : 26, padding: bits.meq ? '0 9px' : '0 10px', borderRadius: bits.tagRadius,
    background: bg, color, fontSize: bits.meq ? 11.5 : 12, fontWeight: bits.meq ? 600 : 700,
    display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap',
    border: bits.tagBorder ? '1px solid var(--line)' : undefined,
    fontFamily: mono && bits.tagMono ? 'ui-monospace,SFMono-Regular,Menlo,monospace' : undefined,
  }
}

const iconBtn: CSSProperties = { width: 40, height: 40, flexShrink: 0, borderRadius: 10, border: '1px solid var(--line)', background: 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }

const QC_CSS = `
.qc-pv{animation:qcpv .45s cubic-bezier(.22,1,.36,1) both}
@keyframes qcpv{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.qc-alt:hover{box-shadow:0 0 0 3px var(--qSelBg)}
.qc-cut:hover{background:var(--surface2)}
.qc-ibtn{transition:background .15s,color .15s,border-color .15s}
.qc-ibtn:hover{background:var(--chip);color:var(--brand)}
.qc-cta{transition:filter .15s,transform .15s}.qc-cta:not(:disabled):hover{filter:brightness(1.08);transform:translateY(-1px)}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`

export default QCore
