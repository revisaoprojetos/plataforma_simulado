'use client'

// RESULTADO · VND (visual interno novo). Reusa a MESMA fonte de dados do RevisaoFinal/
// RevisaoFinalNova (fetch /api/sessoes/resultado?st=<sessionToken> → shape `Resultado`), e
// renderiza o design branded da marca VND (porte de brand/simulado/vnd/resultado.tsx),
// mapeando o que a tela precisa a partir dos dados reais. Blocos do mockup sem fonte real
// (conquistas/vizinhança/liga/XP/medalha) são OMITIDOS graciosamente — nada fabricado.
//
// Dois botões primários: Refazer → /simulado/{token} (re-exige login) · Início → inicioUrl.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Award,
  BookOpenCheck,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileDown,
  Home,
  Lightbulb,
  List,
  Loader2,
  Lock,
  Moon,
  RotateCcw,
  Star,
  X,
} from 'lucide-react'
import { MarkdownContent } from '@/components/markdown-content'
import { NpsAvaliacao } from '@/components/aluno/nps-avaliacao'
import { ReportarErroButton } from '@/components/aluno/reportar-erro-button'
import { PlatformLoader } from '@/components/brand/platform-loader'
import { simTokensStyle } from '@/components/brand/simulado/sim-tokens'
import type { SimTheme } from '@/components/brand/simulado/types'
import {
  Bgfx,
  card3d,
  ghostBtnStyle,
  MarcaVND,
  primaryBtnStyle,
  sharedKeyframes,
  C_ERR,
  C_OK,
  C_STAR,
  C_WARN,
} from '@/components/brand/simulado/vnd/shared'

const PFX = 'svfn'
const LETRA = ['A', 'B', 'C', 'D', 'E', 'F']

// ── Shape do resultado (idêntico ao do RevisaoFinal / RevisaoFinalNova) ──────────
interface AltRev { id: string; texto: string; correta?: boolean }
interface QuestaoRev {
  numero: number
  id: string
  tipo?: string
  enunciado: string
  resposta_aluno: string | null
  acertou: boolean | null
  anulada?: boolean
  alt_trocada?: boolean
  alt_correta_anterior?: string | null
  acertou_antes?: boolean | null
  justificativa?: string | null
  discursiva?: { texto: string; status: string; nota: number | null; feedback: string | null; paginas?: number; imagens?: string[] } | null
  alternativas: AltRev[]
}
interface StatDisciplina { disciplina: string; acertos: number; total: number; percentual: number }
interface Resultado {
  titulo: string
  nota: number | null
  acertos: number
  total: number
  tipo_correcao?: 'pontuacao' | 'cebraspe'
  marcadas: number
  em_branco: number
  tempo: string | null
  aluno_nome: string
  aluno_email: string
  iniciado_em: string | null
  finalizado_em: string | null
  estudante_id: string | null
  caderno_id: string | null
  modalidades?: { id: string; nome: string; semGab?: boolean; comGab?: boolean; pdfUrl?: string; cadernoTeste?: { cadernoId: string; itemId: string } }[]
  posicao: number | null
  total_participantes: number
  stats_por_disciplina: StatDisciplina[]
  gabarito_liberado: boolean
  nota_liberada?: boolean
  caderno_liberado?: boolean
  aviso_gabarito?: { total: number; anuladas: number; trocas: number; ultima: string | null } | null
  questoes: QuestaoRev[]
}

type Filtro = 'all' | 'c' | 'e' | 'b'

export function ResultadoVndNova({
  sessionToken,
  token,
  inicioUrl = '/aluno',
  theme = 'claro',
  dark,
  onToggleDark,
}: {
  sessionToken: string
  /** Token do simulado — "Refazer" aponta p/ /simulado/{token} (novo login). */
  token: string
  /** Destino do botão "Ir para o início". */
  inicioUrl?: string
  theme?: SimTheme
  dark?: boolean
  onToggleDark?: () => void
}) {
  const router = useRouter()
  const [data, setData] = useState<Resultado | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(false)

  // Downloads de PDF — mesma lógica "como você fez" do RevisaoFinal (geração no servidor).
  const [gerandoPdf, setGerandoPdf] = useState<Set<string>>(new Set())
  const marcarPdf = (id: string, on: boolean) => setGerandoPdf((prev) => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n })

  // Estado da UI (correção/filtros).
  const [rq, setRq] = useState(1)
  const [rf, setRf] = useState<Filtro>('all')
  const [jx, setJx] = useState(true)

  // ── MESMA busca do RevisaoFinal (fetch por sessionToken) ───────────────────
  useEffect(() => {
    if (!sessionToken) {
      setErro(true)
      setCarregando(false)
      return
    }
    fetch(`/api/sessoes/resultado?st=${sessionToken}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && Array.isArray(d.questoes)) setData(d)
        else setErro(true)
      })
      .catch(() => setErro(true))
      .finally(() => setCarregando(false))
  }, [sessionToken])

  const liberado = data?.gabarito_liberado ?? false
  const notaLiberada = data?.nota_liberada ?? false
  const cebraspe = data?.tipo_correcao === 'cebraspe'

  // Acerto efetivo por questão (alt. trocada mantém o ponto p/ quem marcou antes ou depois).
  const acertoEfetivo = (q: QuestaoRev): boolean | null => {
    if (q.alt_trocada && liberado) {
      if (q.resposta_aluno == null) return null
      const novaId = q.alternativas.find((a) => a.correta === true)?.id ?? null
      return q.resposta_aluno === q.alt_correta_anterior || q.resposta_aluno === novaId
    }
    return q.acertou
  }

  const qs = data?.questoes ?? []
  const acertos = qs.filter((q) => acertoEfetivo(q) === true).length
  const erros = qs.filter((q) => acertoEfetivo(q) === false).length
  const respondidas = qs.filter((q) => q.resposta_aluno !== null).length
  const branco = qs.length - respondidas
  const liquido = cebraspe ? Math.max(0, acertos - erros) : acertos
  const media = qs.length > 0 ? Math.round((liquido / qs.length) * 100) : 0

  // Status por questão (p/ navegador + filtros da correção).
  type QStatus = 'certa' | 'errada' | 'branco' | 'pendente' | 'anulada'
  const statusDe = (q: QuestaoRev): QStatus => {
    if (q.anulada) return 'anulada'
    if (q.resposta_aluno == null) return 'branco'
    if (!liberado) return 'pendente'
    const eff = acertoEfetivo(q)
    if (eff === null) return 'pendente'
    return eff ? 'certa' : 'errada'
  }
  const totalCertas = qs.filter((q) => statusDe(q) === 'certa').length
  const totalErradas = qs.filter((q) => statusDe(q) === 'errada').length
  const totalBranco = qs.filter((q) => statusDe(q) === 'branco').length

  // Datas/tempos (mesma formatação do RevisaoFinal).
  const fmtData = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—')
  const fmtHora = (s: string | null | undefined) => (s ? new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—')
  const fmtDur = (a: string | null | undefined, bb: string | null | undefined) => {
    if (!a || !bb) return data?.tempo ?? '—'
    const seg = Math.max(0, Math.floor((new Date(bb).getTime() - new Date(a).getTime()) / 1000))
    const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60)
    return h > 0 ? `${h}h ${String(m).padStart(2, '0')}min` : `${m}min`
  }

  const modalidades = data?.modalidades ?? []
  const urlGabarito = `/imprimir/resultado/${sessionToken}`
  const urlComoFezFallback = `${urlGabarito}?sem=1`

  // Download "como você fez" (copiado do RevisaoFinal — mesma lógica de servidor).
  async function baixarComoFez(mod: string, nome: string, gab = false) {
    const key = `pdf:${mod}:${gab ? 'g' : 's'}`
    if (gerandoPdf.has(key)) return
    const md = modalidades.find((m) => m.id === mod)
    if (md?.pdfUrl) { window.open(md.pdfUrl, '_blank', 'noopener,noreferrer'); return }
    const limpar = (s?: string) => (s ?? '').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_')
    const arquivo = [data?.aluno_nome, data?.titulo, nome].map(limpar).filter(Boolean).join('_') || 'caderno'
    let apiUrl: string
    if (md?.cadernoTeste) {
      const q = new URLSearchParams({ caderno: md.cadernoTeste.cadernoId, grupo: md.cadernoTeste.itemId, sessao: sessionToken, nome: arquivo })
      if (gab) q.set('gabarito', '1')
      apiUrl = `/api/aluno/caderno-teste-pdf?${q.toString()}`
    } else if (data?.caderno_id) {
      const q = new URLSearchParams({ caderno: data.caderno_id, sessao: sessionToken, mod, nome: arquivo })
      if (data.estudante_id) q.set('aluno', String(data.estudante_id))
      if (gab) q.set('gabarito', '1')
      apiUrl = `/api/aluno/caderno-pdf?${q.toString()}`
    } else { window.open(`${urlComoFezFallback}&print=1`, '_blank', 'noopener,noreferrer'); return }
    marcarPdf(key, true)
    toast.loading('Download iniciado — gerando PDF…', { id: key })
    try {
      let res: Response | null = null
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        res = await fetch(apiUrl)
        if (res.status !== 503) break
        toast.loading('Servidor ocupado gerando PDFs… tentando de novo', { id: key })
        await new Promise((r) => setTimeout(r, 2000 * (tentativa + 1)))
      }
      if (!res || !res.ok) {
        let msg = 'Não foi possível gerar o PDF agora. Tente novamente em instantes.'
        try { const j = await res?.json(); if (j?.message) msg = j.message } catch { /* corpo não-JSON */ }
        throw new Error(msg)
      }
      const blob = await res.blob()
      if (!blob.size || !/pdf/i.test(blob.type)) throw new Error('O PDF gerado veio vazio. Tente novamente em instantes.')
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = `${arquivo}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(objUrl), 10_000)
      toast.success('Download concluído', { id: key, description: nome })
    } catch (e) {
      if (md?.cadernoTeste) toast.error(e instanceof Error ? e.message : 'Não foi possível gerar o PDF agora. Tente novamente em instantes.', { id: key })
      else {
        toast.error('Não foi possível gerar o PDF. Abrindo para salvar…', { id: key })
        window.open(`/imprimir/caderno/${data?.caderno_id}?mod=${mod}&sessao=${sessionToken}${data?.estudante_id ? `&aluno=${data.estudante_id}` : ''}&${gab ? 'gabarito=1' : 'semgab=1'}&rawimg=1&print=1`, '_blank', 'noopener,noreferrer')
      }
    } finally {
      marcarPdf(key, false)
    }
  }

  // Correção filtrada + questão atual.
  const matchFiltro = (q: QuestaoRev): boolean => {
    if (rf === 'all') return true
    const s = statusDe(q)
    if (rf === 'c') return s === 'certa'
    if (rf === 'e') return s === 'errada'
    if (rf === 'b') return s === 'branco'
    return true
  }
  const cur = qs[rq - 1]
  const nextErr = () => {
    for (let i = rq + 1; i <= qs.length; i++) if (statusDe(qs[i - 1]) === 'errada') { setRq(i); setJx(false); return }
  }

  // Desempenho por matéria mapeado dos stats reais.
  const materias = useMemo(() => data?.stats_por_disciplina ?? [], [data])

  if (carregando) {
    return <PlatformLoader message="Carregando resultado do simulado..." theme={dark ? 'dark' : 'light'} />
  }

  if (erro || !data) {
    return (
      <div className={`${PFX}-app`} style={{ ...simTokensStyle('vnd', theme), minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <style>{css}</style>
        <div style={card3d({ padding: 32, maxWidth: 420, textAlign: 'center' })}>
          <span style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--surface2)', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}><Lock size={24} /></span>
          <b style={{ display: 'block', fontSize: 18, color: 'var(--ink)', marginBottom: 6 }}>Sessão não encontrada</b>
          <p style={{ margin: '0 0 16px', fontSize: 13.5, lineHeight: 1.5, color: 'var(--muted)' }}>Esta sessão do simulado não existe mais ou o link expirou. Acesse o simulado novamente para realizá-lo.</p>
          <button type="button" onClick={() => router.push(inicioUrl)} className={`${PFX}-sbtn`} style={primaryBtnStyle({ height: 46, padding: '0 20px', borderRadius: 16, fontSize: 14.5 })}><Home size={16} />Início da plataforma</button>
        </div>
      </div>
    )
  }

  const notaFinal = cebraspe ? liquido : (data.nota != null ? Math.round(data.nota) : media)

  return (
    <div className={`${PFX}-app`} style={{ ...simTokensStyle('vnd', theme), minHeight: '100vh', position: 'relative' }}>
      <style>{css}</style>
      <Bgfx prefix={PFX} variant="soft" />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* HEADER */}
        <header className={`${PFX}-header`}>
          <MarcaVND size={17} radius={11} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 800, color: C_OK }}>
            <Check size={16} strokeWidth={2.6} /> Simulado finalizado
          </span>
          <span style={{ flex: 1 }} />
          {onToggleDark && (
            <button type="button" onClick={onToggleDark} aria-label="Tema" className={`${PFX}-sbtn ${PFX}-hbtn`} style={ghostBtnStyle({ height: 40, minWidth: 44, padding: '0 10px', borderRadius: 11 })}><Moon size={16} /></button>
          )}
          <button type="button" onClick={() => router.push(`/simulado/${token}`)} className={`${PFX}-sbtn ${PFX}-hbtn`} style={ghostBtnStyle({ height: 40, padding: '0 16px', borderRadius: 11, fontSize: 13 })}>
            <RotateCcw size={15} /> <span className={`${PFX}-hlbl`}>Refazer</span>
          </button>
          <button type="button" onClick={() => router.push(inicioUrl)} className={`${PFX}-sbtn ${PFX}-hbtn`} style={primaryBtnStyle({ height: 40, padding: '0 16px', borderRadius: 11, fontSize: 13 })}>
            <Home size={15} /> <span className={`${PFX}-hlbl`}>Ir para o início</span>
          </button>
        </header>

        <div className={`${PFX}-wrap`}>
          {/* Aviso de mudança de gabarito */}
          {data.aviso_gabarito && (
            <div style={{ display: 'flex', gap: 10, padding: '14px 16px', borderRadius: 16, background: 'var(--peachBg)', border: '1px solid rgba(242,169,59,.45)', color: 'var(--ink)' }}>
              <span style={{ color: C_WARN, flexShrink: 0, marginTop: 1 }}><Lightbulb size={18} /></span>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                <b style={{ display: 'block' }}>Houve mudança de gabarito neste simulado</b>
                <span style={{ color: 'var(--muted)' }}>
                  {[
                    data.aviso_gabarito.anuladas ? `${data.aviso_gabarito.anuladas} quest${data.aviso_gabarito.anuladas > 1 ? 'ões' : 'ão'} anulada${data.aviso_gabarito.anuladas > 1 ? 's' : ''}` : '',
                    data.aviso_gabarito.trocas ? `${data.aviso_gabarito.trocas} alteração${data.aviso_gabarito.trocas > 1 ? 'ões' : ''} de gabarito` : '',
                  ].filter(Boolean).join(' · ')} — sua nota já foi recalculada.
                </span>
              </div>
            </div>
          )}

          {/* HERÓI — versão VND ligada ao dado real (sem medalha/liga/XP fabricados) */}
          <div className={`${PFX}-hero`}>
            <span aria-hidden="true" className={`${PFX}-herodots`} />
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.24em', color: '#F1D48A' }}>MISSÃO CUMPRIDA</span>
              <div className={`${PFX}-okpop`} style={{ width: 110, height: 110, borderRadius: '50%', background: 'rgba(63,213,138,.18)', border: '2px solid rgba(185,245,212,.3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#B9F5D4' }}>
                <Check size={54} strokeWidth={2.4} />
              </div>
              <h1 style={{ margin: '4px 0 0', fontSize: 34, fontWeight: 800, letterSpacing: '-0.045em' }} className={`${PFX}-heroh1`}>
                {data.titulo}
              </h1>
              <span style={{ fontSize: 14, color: '#CFE3D7' }}>
                {data.aluno_nome}{data.aluno_email ? ` · ${data.aluno_email}` : ''}
              </span>

              {/* Metadados (data/início/término/tempo) */}
              <div className={`${PFX}-herometa`}>
                <HeroMeta label="Data" valor={fmtData(data.iniciado_em)} />
                <HeroMeta label="Início" valor={fmtHora(data.iniciado_em)} />
                <HeroMeta label="Término" valor={fmtHora(data.finalizado_em)} />
                <HeroMeta label="Tempo" valor={fmtDur(data.iniciado_em, data.finalizado_em)} />
              </div>

              {/* Chips — só com fonte real (posição/tempo) */}
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
                {notaLiberada && data.posicao != null && (
                  <HeroChip icon={<Award size={14} />} text={`${data.posicao}º${data.total_participantes ? ` de ${data.total_participantes.toLocaleString('pt-BR')}` : ''}`} />
                )}
                <HeroChip icon={<Clock size={14} />} text={fmtDur(data.iniciado_em, data.finalizado_em)} />
              </div>
            </div>
          </div>

          {/* TILES 3D — ligados ao dado real */}
          {notaLiberada ? (
            <div className={`${PFX}-tiles`}>
              <Tile value={String(acertos)} label="acertos" color={C_OK} />
              <Tile value={String(erros)} label="erros" color={C_ERR} />
              <Tile value={String(branco)} label="em branco" color="var(--muted)" />
              <Tile value={cebraspe ? String(liquido) : `${media}%`} label={cebraspe ? 'nota líquida' : 'média'} color="var(--brand)" />
            </div>
          ) : (
            // Nota não liberada: marcadas / em branco (sem revelar acertos/erros).
            <div className={`${PFX}-tiles ${PFX}-tiles2`}>
              <Tile value={String(data.marcadas ?? respondidas)} label="marcadas" color="var(--brand)" />
              <Tile value={String(data.em_branco ?? branco)} label="em branco" color="var(--muted)" />
            </div>
          )}

          {notaLiberada && cebraspe && (
            <p style={{ margin: '-6px 0 0', fontSize: 11.5, color: 'var(--muted)', textAlign: 'center' }}>
              Estilo CEBRASPE: cada erro anula um acerto — {acertos} acerto(s) − {erros} erro(s). Questões em branco não descontam.
            </p>
          )}

          {/* NPS — componente real (mesmo do RevisaoFinal) */}
          <div style={card3d({ padding: 20 })}>
            <NpsAvaliacao sessaoId={sessionToken} />
          </div>

          {/* DESEMPENHO POR MATÉRIA — só com nota liberada e com dados reais (estrelas VND) */}
          {notaLiberada && materias.length > 0 && (
            <div style={card3d({ padding: 20, display: 'flex', flexDirection: 'column' })}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <b style={{ fontSize: 17, color: 'var(--ink)' }}>Desempenho por matéria</b>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>3 estrelas = 75%+</span>
              </div>
              <div className={`${PFX}-matscroll`}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                  {materias.map((m, i) => (
                    <MateriaRow key={i} nome={m.disciplina} total={m.total} certas={m.acertos} pct={m.percentual} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* DOWNLOADS — "Como você fez" (sempre) + "Com gabarito" (quando liberado) */}
          <div style={card3d({ padding: 20 })}>
            <b style={{ display: 'block', fontSize: 16, color: 'var(--ink)', marginBottom: 14 }}>Materiais e downloads</b>
            {(() => {
              const semg = modalidades.filter((m) => m.semGab)
              return (
                <>
                  <span style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)' }}>Como você fez</span>
                  <div className={`${PFX}-docgrid`} style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, Math.min(3, semg.length || 1))},1fr)`, gap: 10, margin: '8px 0 16px' }}>
                    {semg.length > 0 ? semg.map((m) => (
                      <DocBtn key={m.id} nome={m.nome} loading={gerandoPdf.has(`pdf:${m.id}:s`)} onClick={() => baixarComoFez(m.id, m.nome)} />
                    )) : (
                      <a href={urlComoFezFallback} target="_blank" rel="noopener noreferrer" className={`${PFX}-doc`} style={docStyle(false)}>
                        <DocIcon destaque={false} />
                        <span style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}><b style={{ display: 'block', fontSize: 13.5, color: 'var(--ink)' }}>Material para download (como você fez)</b><span style={{ fontSize: 11.5, color: 'var(--muted)' }}>PDF</span></span>
                        <span style={{ color: 'var(--muted)' }}><FileDown size={16} /></span>
                      </a>
                    )}
                  </div>
                </>
              )
            })()}
            {liberado && modalidades.some((m) => m.comGab) && (
              <>
                <span style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--goldInk)' }}>Com gabarito</span>
                <div className={`${PFX}-docgrid`} style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, Math.min(3, modalidades.filter((m) => m.comGab).length))},1fr)`, gap: 10, margin: '8px 0 0' }}>
                  {modalidades.filter((m) => m.comGab).map((m) => (
                    <DocBtn key={m.id} nome={m.nome} destaque loading={gerandoPdf.has(`pdf:${m.id}:g`)} onClick={() => baixarComoFez(m.id, m.nome, true)} />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* CORREÇÃO QUESTÃO A QUESTÃO — só com gabarito liberado */}
          {liberado && qs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <b style={{ fontSize: 18, color: 'var(--ink)' }}>Correção questão a questão</b>
                <div className={`${PFX}-hs`} style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
                  <FiltroPill active={rf === 'all'} onClick={() => setRf('all')} label={`Todas · ${qs.length}`} />
                  <FiltroPill active={rf === 'e'} onClick={() => setRf('e')} label={`Erradas · ${totalErradas}`} />
                  <FiltroPill active={rf === 'c'} onClick={() => setRf('c')} label={`Certas · ${totalCertas}`} />
                  <FiltroPill active={rf === 'b'} onClick={() => setRf('b')} label={`Em branco · ${totalBranco}`} />
                </div>
              </div>

              <div className={`${PFX}-corrgrid`}>
                {/* Cartão da questão atual */}
                <div style={card3d({ padding: 22 })}>
                  {cur && (
                    <div key={rq} className={`${PFX}-qin`} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ height: 28, padding: '0 11px', borderRadius: 8, background: 'var(--surface2)', fontSize: 13, fontWeight: 800, color: 'var(--ink)', display: 'inline-flex', alignItems: 'center' }}>Questão {cur.numero}</span>
                        <span style={{ flex: 1 }} />
                        {statusDe(cur) === 'certa' && <StatusPill color={C_OK} bg="rgba(31,168,104,.12)" label="Acertou" ok />}
                        {statusDe(cur) === 'errada' && <StatusPill color={C_ERR} bg="rgba(229,72,77,.12)" label="Errou" />}
                        {statusDe(cur) === 'anulada' && <span style={{ display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 10px', borderRadius: 99, background: 'var(--surface2)', color: 'var(--muted)', fontSize: 12, fontWeight: 800 }}>Anulada</span>}
                        {(statusDe(cur) === 'branco' || statusDe(cur) === 'pendente') && <span style={{ display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 10px', borderRadius: 99, background: 'var(--surface2)', color: 'var(--muted)', fontSize: 12, fontWeight: 800 }}>{statusDe(cur) === 'branco' ? 'Em branco' : 'Respondida'}</span>}
                      </div>
                      <div style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--ink)' }}><MarkdownContent>{cur.enunciado}</MarkdownContent></div>

                      {cur.tipo === 'discursiva' ? (
                        <DiscursivaView d={cur.discursiva} />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {cur.alternativas.map((a, i) => {
                            const marcada = cur.resposta_aluno === a.id
                            const correta = a.correta === true
                            const erradaMarcada = marcada && !correta
                            const bd = correta ? C_OK : erradaMarcada ? C_ERR : 'var(--line)'
                            const bg = correta ? 'rgba(31,168,104,.1)' : erradaMarcada ? 'rgba(229,72,77,.08)' : 'var(--surface)'
                            const dot = correta ? C_OK : erradaMarcada ? C_ERR : 'transparent'
                            const ink = correta || erradaMarcada ? '#fff' : 'var(--ink)'
                            return (
                              <div key={a.id} className={`${PFX}-alt`} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', borderRadius: 12, border: `1.5px solid ${bd}`, background: bg }}>
                                <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', border: '1.5px solid var(--line2)', background: dot, color: ink, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>{LETRA[i] ?? i + 1}</span>
                                <span style={{ flex: 1, fontSize: 14, lineHeight: 1.55, color: 'var(--ink)' }}><MarkdownContent inline>{a.texto}</MarkdownContent></span>
                                {correta && <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: C_OK }}>GABARITO</span>}
                                {erradaMarcada && <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: C_ERR }}>SUA RESPOSTA</span>}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Justificativa / comentário — acordeão */}
                      {cur.tipo !== 'discursiva' && cur.justificativa && (
                        <div style={{ borderRadius: 14, border: '1px solid var(--line)', overflow: 'hidden' }}>
                          <button type="button" onClick={() => setJx((v) => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', border: 0, background: 'var(--surface2)', font: 'inherit', cursor: 'pointer' }}>
                            <span style={{ color: 'var(--brand)' }}><Lightbulb size={17} /></span>
                            <b style={{ flex: 1, textAlign: 'left', fontSize: 14, color: 'var(--ink)' }}>Comentário do professor</b>
                            <span style={{ display: 'inline-flex', transform: `rotate(${jx ? 180 : 0}deg)`, transition: 'transform .25s' }}><ChevronDown size={16} /></span>
                          </button>
                          {jx && <div className={`${PFX}-qin`} style={{ padding: '14px 16px', fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink)' }}><MarkdownContent>{cur.justificativa}</MarkdownContent></div>}
                        </div>
                      )}

                      {/* Ações */}
                      <div className={`${PFX}-corractions`}>
                        <button type="button" onClick={() => { setRq((v) => Math.max(1, v - 1)); setJx(false) }} className={`${PFX}-sbtn`} style={ghostBtnStyle({ height: 44, padding: '0 20px', borderRadius: 16, fontSize: 14.5 })}><ChevronLeft size={17} />Anterior</button>
                        <span style={{ flex: 1 }} />
                        <ReportarErroButton sessaoId={sessionToken} questaoId={cur.id} />
                        <button type="button" onClick={nextErr} disabled={totalErradas === 0} className={`${PFX}-sbtn`} style={ghostBtnStyle({ height: 44, padding: '0 20px', borderRadius: 16, fontSize: 14.5, opacity: totalErradas === 0 ? 0.4 : 1 })}>Próxima errada</button>
                        <button type="button" onClick={() => { setRq((v) => Math.min(qs.length, v + 1)); setJx(false) }} className={`${PFX}-sbtn`} style={primaryBtnStyle({ height: 44, padding: '0 20px', borderRadius: 16, fontSize: 14.5 })}>Próxima<ChevronRight size={17} /></button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Navegador da correção */}
                <div className={`${PFX}-corrside`}>
                  <div style={card3d({ padding: 18 })}>
                    <b style={{ display: 'block', fontSize: 15, color: 'var(--ink)', marginBottom: 12 }}>Navegador</b>
                    <div className={`${PFX}-corrnavscroll`}>
                      <div className={`${PFX}-corrnav`}>
                        {qs.map((item) => {
                          const n = item.numero
                          const s = statusDe(item)
                          const inF = matchFiltro(item)
                          const bg = s === 'certa' ? C_OK : s === 'errada' ? C_ERR : 'var(--surface2)'
                          const col = s === 'certa' || s === 'errada' ? '#fff' : 'var(--muted)'
                          const ring = n === rq ? '0 0 0 2px var(--surface), 0 0 0 4px var(--ink)' : 'none'
                          return (
                            <button key={item.id} type="button" onClick={() => { setRq(n); setJx(false) }} style={{ height: 34, border: 0, borderRadius: 8, background: bg, color: col, boxShadow: ring, opacity: inF ? 1 : 0.18, font: 'inherit', fontSize: 12, fontWeight: 800, cursor: 'pointer', transition: 'opacity .2s' }}>{n}</button>
                          )
                        })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 12, fontSize: 12, color: 'var(--muted)', flexWrap: 'wrap' }}>
                      <LegendDot color={C_OK} label={`Certa (${totalCertas})`} />
                      <LegendDot color={C_ERR} label={`Errada (${totalErradas})`} />
                      <LegendDot color="var(--surface2)" border label={`Branco (${totalBranco})`} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Subcomponentes ───────────────────────────────────────────────────────────

function HeroMeta({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <span style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#8FBBA3' }}>{label}</span>
      <b style={{ fontSize: 14, color: '#fff' }}>{valor}</b>
    </div>
  )
}

function HeroChip({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 99, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(185,245,212,.25)', fontSize: 12.5, fontWeight: 700 }}>
      {icon}
      {text}
    </span>
  )
}

function Tile({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div style={{ padding: 16, borderRadius: 20, border: '2px solid var(--line)', borderBottomWidth: 5, background: 'var(--surface)', textAlign: 'center' }}>
      <b style={{ display: 'block', fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color }}>{value}</b>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)' }}>{label}</span>
    </div>
  )
}

function MateriaRow({ nome, total, certas, pct }: { nome: string; total: number; certas: number; pct: number }) {
  const stars = pct >= 75 ? 3 : pct >= 60 ? 2 : pct >= 40 ? 1 : 0
  const segs = Math.min(10, Math.max(1, total))
  const filled = total > 0 ? Math.round((certas / total) * segs) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 16, border: '2px solid var(--line)', background: 'var(--surface)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ display: 'block', fontSize: 13.5, color: 'var(--ink)' }}>{nome}</b>
        <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
          {Array.from({ length: segs }, (_, i) => (
            <span key={i} style={{ flex: 1, height: 8, borderRadius: 3, background: i < filled ? C_OK : 'var(--track)' }} />
          ))}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 1 }}>
          {Array.from({ length: 3 }, (_, i) => (
            <span key={i} style={{ color: i < stars ? C_STAR : 'var(--line2)' }}>
              <Star size={16} fill={i < stars ? C_STAR : 'none'} />
            </span>
          ))}
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)' }}>{certas}/{total} · {pct}%</span>
      </div>
    </div>
  )
}

function FiltroPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} style={{ flexShrink: 0, height: 32, padding: '0 12px', borderRadius: 99, border: '1px solid var(--line)', background: active ? 'var(--fOn)' : 'transparent', color: active ? 'var(--fOnInk)' : 'var(--muted)', font: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</button>
  )
}

function StatusPill({ color, bg, label, ok }: { color: string; bg: string; label: string; ok?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 10px', borderRadius: 99, background: bg, color, fontSize: 12, fontWeight: 800 }}>
      {ok ? <Check size={13} strokeWidth={3} /> : <X size={13} strokeWidth={3} />}{label}
    </span>
  )
}

function LegendDot({ color, border, label }: { color: string; border?: boolean; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color, border: border ? '1px solid var(--line2)' : undefined }} />{label}
    </span>
  )
}

function DocIcon({ destaque }: { destaque: boolean }) {
  return <span style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--chip)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{destaque ? <Lightbulb size={18} /> : <BookOpenCheck size={18} />}</span>
}

function docStyle(destaque: boolean): React.CSSProperties {
  return { display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, border: `1.5px solid ${destaque ? 'var(--selLine)' : 'var(--line)'}`, background: destaque ? 'var(--selBg)' : 'var(--surface)', textDecoration: 'none', font: 'inherit', cursor: 'pointer', textAlign: 'left' }
}

function DocBtn({ nome, destaque, loading, onClick }: { nome: string; destaque?: boolean; loading: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={loading} className={`${PFX}-doc`} style={docStyle(!!destaque)}>
      {loading ? <span style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--chip)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Loader2 className="animate-spin" size={18} /></span> : <span style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--chip)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{destaque ? <Lightbulb size={18} /> : <List size={18} />}</span>}
      <span style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}><b style={{ display: 'block', fontSize: 13.5, color: 'var(--ink)' }}>{nome}</b><span style={{ fontSize: 11.5, color: 'var(--muted)' }}>PDF</span></span>
      <span style={{ color: 'var(--muted)' }}><FileDown size={16} /></span>
    </button>
  )
}

function DiscursivaView({ d }: { d: QuestaoRev['discursiva'] }) {
  if (!d) return <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--surface2)', color: 'var(--muted)', fontSize: 13 }}>Questão não respondida.</div>
  const enviada = (d.imagens?.length ?? 0) > 0 || (d.paginas ?? 0) > 0 || !!d.texto?.trim()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {d.status === 'corrigida' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 12, background: 'rgba(31,168,104,.1)', color: C_OK, fontSize: 13.5, fontWeight: 700 }}><Check size={16} />Corrigida — nota {Number(d.nota ?? 0).toFixed(1)}</div>
      ) : enviada ? (
        <div style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(242,169,59,.12)', color: C_WARN, fontSize: 12.5, fontWeight: 700 }}>Resposta enviada — aguardando correção por um avaliador.</div>
      ) : (
        <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--surface2)', color: 'var(--muted)', fontSize: 13 }}>Questão não respondida.</div>
      )}
      {(d.imagens?.length ?? 0) > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          {d.imagens!.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noreferrer" style={{ position: 'relative', display: 'block', overflow: 'hidden', borderRadius: 10, border: '1px solid var(--line)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Página ${i + 1}`} style={{ height: 140, width: '100%', objectFit: 'cover', display: 'block' }} />
            </a>
          ))}
        </div>
      )}
      {d.texto && <div style={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface2)', padding: 12, fontSize: 13.5, whiteSpace: 'pre-wrap', color: 'var(--ink)' }}>{d.texto}</div>}
      {d.feedback && (
        <div style={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--chip)', padding: 12, fontSize: 13.5, color: 'var(--ink)' }}>
          <b style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>Feedback do corretor</b>{d.feedback}
        </div>
      )}
    </div>
  )
}

const css = `
${sharedKeyframes(PFX)}
.${PFX}-app{background:var(--bg);color:var(--ink);font-family:var(--ff,'Plus Jakarta Sans',sans-serif)}
.${PFX}-hs{scrollbar-width:none}.${PFX}-hs::-webkit-scrollbar{display:none}
.${PFX}-header{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:10px;height:70px;padding:0 32px;background:var(--surface);border-bottom:1px solid var(--line)}
.${PFX}-wrap{max-width:1000px;margin:0 auto;padding:28px 32px 60px;display:flex;flex-direction:column;gap:18px}
.${PFX}-hero{position:relative;overflow:hidden;border-radius:30px;padding:40px 36px;background:linear-gradient(140deg,#041A10,#0B4A2E 55%,#12643D);color:#fff;text-align:center}
.${PFX}-herodots{position:absolute;inset:0;background-image:radial-gradient(circle,rgba(185,245,212,.16) 1.2px,transparent 1.8px);background-size:22px 22px}
.${PFX}-herometa{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;width:100%;max-width:460px;margin-top:6px;padding-top:14px;border-top:1px solid rgba(185,245,212,.18)}
.${PFX}-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.${PFX}-tiles2{grid-template-columns:repeat(2,1fr)}
.${PFX}-matscroll{max-height:420px;overflow-y:auto;padding-right:4px;scrollbar-width:thin}
.${PFX}-corrgrid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:18px;align-items:start}
.${PFX}-corrside{position:sticky;top:90px}
.${PFX}-corractions{display:flex;gap:8px;padding-top:16px;margin-top:0;border-top:1px solid var(--line);flex-wrap:wrap;align-items:center}
.${PFX}-corrnavscroll{max-height:440px;overflow-y:auto;padding:4px;scrollbar-width:thin}
.${PFX}-corrnav{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}
@media (max-width:980px){
  .${PFX}-corrgrid{grid-template-columns:1fr}
  .${PFX}-corrside{position:static;order:-1}
  .${PFX}-corrnav{grid-template-columns:repeat(8,1fr)}
  .${PFX}-corrnavscroll{max-height:300px}
}
@media (max-width:640px){
  .${PFX}-header{padding:0 14px}
  .${PFX}-wrap{padding:14px;gap:14px}
  .${PFX}-hero{margin:0 -14px;border-radius:0;padding:28px 18px}
  .${PFX}-heroh1{font-size:26px}
  .${PFX}-herometa{grid-template-columns:repeat(2,1fr)}
  .${PFX}-tiles{grid-template-columns:repeat(2,1fr)}
  .${PFX}-docgrid{grid-template-columns:1fr!important}
  .${PFX}-hlbl{display:none}
  .${PFX}-hbtn{min-width:44px;padding:0 10px!important}
  .${PFX}-corractions{flex-wrap:wrap}
}
`
