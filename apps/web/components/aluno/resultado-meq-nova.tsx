'use client'

// RESULTADO · MEQ (visual interno novo). Reusa a MESMA fonte de dados do RevisaoFinal
// (fetch /api/sessoes/resultado?st=<sessionToken> → shape `Resultado`), e renderiza o design
// branded da marca MEQ (porte de brand/simulado/meq/resultado.tsx — boletim navy, acento ciano,
// blocos Certo/Errado do Cebraspe), mapeando o que a tela precisa a partir dos dados reais.
// Blocos do mockup sem fonte real (ranking/corte/percentil/ritmo/histograma) são OMITIDOS
// graciosamente — nada de números fabricados.
//
// Dois botões primários: Refazer → /simulado/{token} (re-exige login) · Início → inicioUrl.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MarkdownContent } from '@/components/markdown-content'
import { NpsAvaliacao } from '@/components/aluno/nps-avaliacao'
import { ReportarErroButton } from '@/components/aluno/reportar-erro-button'
import { PlatformLoader } from '@/components/brand/platform-loader'
import { simTokensStyle } from '@/components/brand/simulado/sim-tokens'
import type { SimTheme } from '@/components/brand/simulado/types'
import {
  baseKeyframes, BgfxMeq, btnGhost, btnPrimary, MarcaMeq, SoraLink,
  IconBulb, IconCheck, IconChevD, IconChevL, IconChevR, IconDownload, IconHome,
  IconInfo, IconRefresh, IconX,
  OK_GREEN, ERR_RED, AMBER, MEQ_CYAN, MEQ_NAVY_GRAD,
} from '@/components/brand/simulado/meq/shared'
import { Loader2 } from 'lucide-react'

const PFX = 'smfn'
const LETRA = ['A', 'B', 'C', 'D', 'E', 'F']
const OK = OK_GREEN
const ERR = ERR_RED
const WARN = AMBER

// ── Shape do resultado (idêntico ao do RevisaoFinal) ────────────────────────────
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

export function ResultadoMeqNova({
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
      <div className={`${PFX}-root`} style={{ ...simTokensStyle('meq', theme), minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <SoraLink />
        <div style={{ padding: 32, maxWidth: 420, textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', boxShadow: '0 1px 2px rgba(16,30,70,.04)' }}>
          <span style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--surface2)', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}><IconInfo size={24} /></span>
          <b style={{ display: 'block', fontSize: 18, color: 'var(--ink)', marginBottom: 6 }}>Sessão não encontrada</b>
          <p style={{ margin: '0 0 16px', fontSize: 13.5, lineHeight: 1.5, color: 'var(--muted)' }}>Esta sessão do simulado não existe mais ou o link expirou. Acesse o simulado novamente para realizá-lo.</p>
          <button type="button" onClick={() => router.push(inicioUrl)} className={`${PFX}-sbtn`} style={{ ...btnPrimary(46), width: 'auto', margin: '0 auto' }}><IconHome /> Início da plataforma</button>
        </div>
      </div>
    )
  }

  const notaFinal = cebraspe ? liquido : (data.nota != null ? Math.round(data.nota) : media)

  return (
    <div className={`${PFX}-app`} style={{ ...simTokensStyle('meq', theme), position: 'relative', minHeight: '100vh', overflowX: 'hidden' }}>
      <SoraLink />
      <style>{css()}</style>
      <BgfxMeq p={PFX} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* HEADER */}
        <div className={`${PFX}-top`} style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 20, height: 70, padding: '0 32px', background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
          <MarcaMeq size={26} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: OK }}><IconCheck size={15} sw={2.8} /> Simulado finalizado</span>
          <span style={{ flex: 1 }} />
          {onToggleDark && (
            <button type="button" onClick={onToggleDark} aria-label="Tema" className={`${PFX}-sbtn ${PFX}-tbtn`} style={{ ...btnGhost(40), width: 'auto', minWidth: 40, padding: '0 12px', borderRadius: 11 }}><IconMoonLocal /></button>
          )}
          <button type="button" onClick={() => router.push(`/simulado/${token}`)} className={`${PFX}-sbtn ${PFX}-tbtn`} style={{ ...btnGhost(40), width: 'auto', fontSize: 13, padding: '0 16px', borderRadius: 11 }}><IconRefresh /> <span className={`${PFX}-tlab`}>Refazer</span></button>
          <button type="button" onClick={() => router.push(inicioUrl)} className={`${PFX}-sbtn ${PFX}-tbtn`} style={{ ...btnPrimary(40), width: 'auto', fontSize: 13, padding: '0 16px', borderRadius: 11 }}><IconHome /> <span className={`${PFX}-tlab`}>Ir para o início</span></button>
        </div>

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1280, margin: '0 auto', padding: '28px 32px 60px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Aviso de mudança de gabarito */}
          {data.aviso_gabarito && (
            <div style={{ display: 'flex', gap: 10, padding: '14px 16px', borderRadius: 'var(--r)', background: 'var(--peachBg)', border: '1px solid rgba(242,169,59,.45)', color: 'var(--ink)' }}>
              <span style={{ color: WARN, flexShrink: 0 }}><IconInfo size={18} /></span>
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

          <div className={`${PFX}-grid`} style={{ display: 'grid', gridTemplateColumns: '330px minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
            {/* ── Coluna esquerda: boletim + NPS ── */}
            <div className={`${PFX}-left`} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* BOLETIM (navy header + gauge semicircular + stats) */}
              <div style={{ borderRadius: 'var(--r)', overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--line)', boxShadow: '0 1px 2px rgba(16,30,70,.04)' }}>
                <div style={{ position: 'relative', overflow: 'hidden', padding: '22px 24px', background: MEQ_NAVY_GRAD, color: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.2em', color: '#8BEAEA' }}>BOLETIM DE DESEMPENHO</span>
                    {liberado && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 10px', borderRadius: 6, background: MEQ_CYAN, color: '#0B1124', fontSize: 11.5, fontWeight: 700 }}>Corrigido</span>
                    )}
                  </div>
                  <h1 className={`${PFX}-h1`} style={{ margin: '10px 0 2px', fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em' }}>{data.titulo}</h1>
                  <span style={{ fontSize: 12.5, color: '#A9C6F0' }}>{data.aluno_nome}{data.aluno_email ? ` · ${data.aluno_email}` : ''}</span>
                </div>

                {/* Gauge — só com nota liberada (fonte real) */}
                {notaLiberada ? (
                  <Gauge liquida={liquido} max={Math.max(1, qs.length)} rotulo={cebraspe ? 'nota líquida' : 'acertos'} />
                ) : (
                  <div style={{ padding: '22px 18px', textAlign: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--muted)' }}><IconInfo size={15} /> Nota ainda não liberada</span>
                  </div>
                )}

                {/* Stats */}
                <div style={{ padding: '0 18px 18px' }}>
                  {notaLiberada ? (
                    <>
                      <Row label="Certos" value={String(acertos)} color={OK} top={false} />
                      <Row label="Errados" value={String(erros)} color={ERR} />
                      <Row label="Em branco" value={String(branco)} color="var(--ink)" />
                      {cebraspe && <Row label="Nota líquida" value={String(liquido)} color="var(--brand2)" />}
                      {data.posicao != null && <Row label="Posição" value={`${data.posicao}º${data.total_participantes ? ` / ${data.total_participantes.toLocaleString('pt-BR')}` : ''}`} color="var(--ink)" />}
                      <Row label="Tempo" value={fmtDur(data.iniciado_em, data.finalizado_em)} color="var(--ink)" />
                    </>
                  ) : (
                    <>
                      <Row label="Marcadas" value={String(data.marcadas ?? respondidas)} color="var(--brand2)" top={false} />
                      <Row label="Em branco" value={String(data.em_branco ?? branco)} color="var(--ink)" />
                      <Row label="Tempo" value={fmtDur(data.iniciado_em, data.finalizado_em)} color="var(--ink)" />
                    </>
                  )}
                  <Row label="Data" value={fmtData(data.iniciado_em)} color="var(--muted)" />
                  <Row label="Início · término" value={`${fmtHora(data.iniciado_em)} — ${fmtHora(data.finalizado_em)}`} color="var(--muted)" />
                </div>

                {notaLiberada && cebraspe && (
                  <p style={{ margin: 0, padding: '0 18px 18px', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
                    Estilo CEBRASPE: cada erro anula um acerto — {acertos} acerto(s) − {erros} erro(s). Questões em branco não descontam.
                  </p>
                )}
              </div>

              {/* NPS — componente real (mesmo do RevisaoFinal) */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 20, boxShadow: '0 1px 2px rgba(16,30,70,.04)' }}>
                <NpsAvaliacao sessaoId={sessionToken} />
              </div>
            </div>

            {/* ── Coluna direita: downloads + tabela por disciplina ── */}
            <div className={`${PFX}-right`} style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
              {/* DOWNLOADS — "Como você fez" (sempre) + "Com gabarito" (quando liberado) */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 20, boxShadow: '0 1px 2px rgba(16,30,70,.04)' }}>
                <b style={{ display: 'block', fontSize: 16, color: 'var(--ink)', marginBottom: 14 }}>Materiais e downloads</b>
                {(() => {
                  const semg = modalidades.filter((m) => m.semGab)
                  return (
                    <>
                      <span style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>Como você fez</span>
                      <div className={`${PFX}-dgrid`} style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, Math.min(3, semg.length || 1))},1fr)`, gap: 10, marginBottom: 16 }}>
                        {semg.length > 0 ? semg.map((m) => (
                          <DocBtn key={m.id} nome={m.nome} loading={gerandoPdf.has(`pdf:${m.id}:s`)} onClick={() => baixarComoFez(m.id, m.nome)} />
                        )) : (
                          <a href={urlComoFezFallback} target="_blank" rel="noopener noreferrer" className={`${PFX}-doc`} style={docStyle(false)}>
                            <DocIcon /><span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3 }}>Material para download (como você fez)</span><span style={{ color: 'var(--brand)', flexShrink: 0 }}><IconChevR size={16} /></span>
                          </a>
                        )}
                      </div>
                    </>
                  )
                })()}
                {liberado && modalidades.some((m) => m.comGab) && (
                  <>
                    <span style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--brand)', marginBottom: 8 }}>Com gabarito</span>
                    <div className={`${PFX}-dgrid`} style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, Math.min(3, modalidades.filter((m) => m.comGab).length))},1fr)`, gap: 10 }}>
                      {modalidades.filter((m) => m.comGab).map((m) => (
                        <DocBtn key={m.id} nome={m.nome} destaque loading={gerandoPdf.has(`pdf:${m.id}:g`)} onClick={() => baixarComoFez(m.id, m.nome, true)} />
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* DESEMPENHO POR DISCIPLINA — só com nota liberada e com dados reais */}
              {notaLiberada && materias.length > 0 && (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 18, boxShadow: '0 1px 2px rgba(16,30,70,.04)' }}>
                  <b style={{ display: 'block', fontSize: 16, color: 'var(--ink)', marginBottom: 6 }}>Desempenho por disciplina</b>
                  <div className={`${PFX}-nscroll`} style={{ position: 'relative', overflow: 'auto' }}>
                    <table style={{ width: '100%', minWidth: 460, borderCollapse: 'collapse' }}>
                      <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--surface)' }}>
                        <tr>
                          {['Matéria', 'Acertos', 'Total', 'Aprov.'].map((h, i) => (
                            <th key={h} style={{ padding: '10px 8px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', textAlign: i === 0 ? 'left' : 'center', borderBottom: '1px solid var(--line2)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {materias.map((m, i) => {
                          const pct = m.percentual
                          const barC = pct >= 70 ? OK : pct >= 50 ? WARN : ERR
                          return (
                            <tr key={i} className={`${PFX}-rowh`}>
                              <td style={{ padding: '10px 8px', fontSize: 13, fontWeight: 600, color: 'var(--ink)', borderBottom: '1px solid var(--line)' }}>{m.disciplina}</td>
                              <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: 13, color: OK, borderBottom: '1px solid var(--line)', fontVariantNumeric: 'tabular-nums' }}>{m.acertos}</td>
                              <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: 13, color: 'var(--muted)', borderBottom: '1px solid var(--line)', fontVariantNumeric: 'tabular-nums' }}>{m.total}</td>
                              <td style={{ padding: '10px 8px', borderBottom: '1px solid var(--line)', minWidth: 110 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <div style={{ flex: 1, height: 6, borderRadius: 2, background: 'var(--track)' }}>
                                    <span className={`${PFX}-bar`} style={{ display: 'block', width: `${pct}%`, height: '100%', borderRadius: 2, background: barC }} />
                                  </div>
                                  <b style={{ fontSize: 11.5, width: 36, textAlign: 'right', color: barC }}>{pct}%</b>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* CORREÇÃO QUESTÃO A QUESTÃO — largura total, só com gabarito liberado */}
          {liberado && qs.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 22, boxShadow: '0 1px 2px rgba(16,30,70,.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                <b style={{ fontSize: 18, color: 'var(--ink)' }}>Correção questão a questão</b>
                <div className={`${PFX}-hs`} style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
                  <Pill active={rf === 'all'} onClick={() => setRf('all')} label={`Todas · ${qs.length}`} />
                  <Pill active={rf === 'e'} onClick={() => setRf('e')} label={`Erradas · ${totalErradas}`} />
                  <Pill active={rf === 'c'} onClick={() => setRf('c')} label={`Certas · ${totalCertas}`} />
                  <Pill active={rf === 'b'} onClick={() => setRf('b')} label={`Em branco · ${totalBranco}`} />
                </div>
              </div>

              <div className={`${PFX}-corr`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 18, alignItems: 'start' }}>
                {/* Cartão da questão atual */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 22, boxShadow: '0 1px 2px rgba(16,30,70,.04)' }}>
                  {cur && (
                    <div key={rq} className={`${PFX}-qin`} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ height: 28, padding: '0 11px', borderRadius: 8, background: 'var(--surface2)', fontSize: 13, fontWeight: 800, color: 'var(--ink)', display: 'inline-flex', alignItems: 'center' }}>Questão {cur.numero}</span>
                        <span style={{ flex: 1 }} />
                        {statusDe(cur) === 'certa' && <StatusPill color={OK} bg="rgba(31,168,104,.12)" label="Acertou" />}
                        {statusDe(cur) === 'errada' && <StatusPill color={ERR} bg="rgba(229,72,77,.12)" label="Errou" />}
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
                            const bd = correta ? OK : erradaMarcada ? ERR : 'var(--line)'
                            const bg = correta ? 'rgba(31,168,104,.1)' : erradaMarcada ? 'rgba(229,72,77,.08)' : 'var(--surface)'
                            const dot = correta ? OK : erradaMarcada ? ERR : 'transparent'
                            const ink = correta || erradaMarcada ? '#fff' : 'var(--muted)'
                            return (
                              <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', borderRadius: 12, border: `1.5px solid ${bd}`, background: bg }}>
                                <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', border: '1.5px solid var(--line2)', background: dot, color: ink, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>{LETRA[i] ?? i + 1}</span>
                                <span style={{ flex: 1, fontSize: 14, lineHeight: 1.55, color: 'var(--ink)' }}><MarkdownContent inline>{a.texto}</MarkdownContent></span>
                                {correta && <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: OK }}>GABARITO</span>}
                                {erradaMarcada && <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: ERR }}>SUA RESPOSTA</span>}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Justificativa / comentário — acordeão */}
                      {cur.tipo !== 'discursiva' && cur.justificativa && (
                        <div style={{ borderRadius: 14, border: '1px solid var(--line)', overflow: 'hidden' }}>
                          <button type="button" onClick={() => setJx((v) => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', border: 0, background: 'var(--surface2)', font: 'inherit', cursor: 'pointer' }}>
                            <span style={{ color: 'var(--brand)' }}><IconBulb /></span>
                            <b style={{ flex: 1, textAlign: 'left', fontSize: 14, color: 'var(--ink)' }}>Comentário do professor</b>
                            <span style={{ display: 'inline-flex', transform: jx ? 'rotate(180deg)' : 'none', transition: 'transform .25s', color: 'var(--muted)' }}><IconChevD size={16} /></span>
                          </button>
                          {jx && <div className={`${PFX}-qin`} style={{ padding: '14px 16px', fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink)' }}><MarkdownContent>{cur.justificativa}</MarkdownContent></div>}
                        </div>
                      )}

                      {/* Ações */}
                      <div style={{ display: 'flex', gap: 8, paddingTop: 16, borderTop: '1px solid var(--line)', flexWrap: 'wrap', alignItems: 'center' }}>
                        <button type="button" onClick={() => { setRq((v) => Math.max(1, v - 1)); setJx(false) }} className={`${PFX}-sbtn`} style={{ ...btnGhost(44), width: 'auto', opacity: rq === 1 ? 0.4 : 1, pointerEvents: rq === 1 ? 'none' : 'auto' }}><IconChevL /> Anterior</button>
                        <span style={{ flex: 1 }} />
                        <ReportarErroButton sessaoId={sessionToken} questaoId={cur.id} />
                        <button type="button" onClick={nextErr} disabled={totalErradas === 0} className={`${PFX}-sbtn`} style={{ ...btnGhost(44), width: 'auto', opacity: totalErradas === 0 ? 0.4 : 1, pointerEvents: totalErradas === 0 ? 'none' : 'auto' }}><IconX size={14} /> Próxima errada</button>
                        <button type="button" onClick={() => { setRq((v) => Math.min(qs.length, v + 1)); setJx(false) }} className={`${PFX}-sbtn`} style={{ ...btnPrimary(44), width: 'auto' }}>Próxima <IconChevR /></button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Navegador da correção */}
                <aside className={`${PFX}-corrnav`} style={{ alignSelf: 'start', position: 'sticky', top: 90 }}>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 18, boxShadow: '0 1px 2px rgba(16,30,70,.04)' }}>
                    <b style={{ display: 'block', fontSize: 15, color: 'var(--ink)', marginBottom: 12 }}>Navegador</b>
                    <div className={`${PFX}-cnavgrid ${PFX}-nscroll`} style={{ maxHeight: 440, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6 }}>
                      {qs.map((item) => {
                        const n = item.numero
                        const s = statusDe(item)
                        const inF = matchFiltro(item)
                        const bg = s === 'certa' ? OK : s === 'errada' ? ERR : 'var(--surface2)'
                        const col = s === 'certa' || s === 'errada' ? '#fff' : 'var(--muted)'
                        const ring = n === rq ? '0 0 0 2px var(--surface), 0 0 0 4px var(--ink)' : undefined
                        return (
                          <button key={item.id} type="button" onClick={() => { setRq(n); setJx(false) }} style={{ height: 34, border: 0, borderRadius: 8, background: bg, color: col, boxShadow: ring, opacity: inF ? 1 : 0.18, font: 'inherit', fontSize: 12, fontWeight: 800, cursor: 'pointer', transition: 'opacity .2s' }}>{n}</button>
                        )
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 12, fontSize: 11, color: 'var(--muted)', flexWrap: 'wrap' }}>
                      <LegC sw={OK} label={`Certa (${totalCertas})`} />
                      <LegC sw={ERR} label={`Errada (${totalErradas})`} />
                      <LegC sw="var(--surface2)" label={`Branco (${totalBranco})`} />
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Subcomponentes ───────────────────────────────────────────────────────────

// Gauge semicircular (porte do Boletim do mockup MEQ) alimentado por dados reais.
function Gauge({ liquida, max, rotulo }: { liquida: number; max: number; rotulo: string }) {
  const R = 80, cx = 100, cy = 100
  const ang = (frac: number) => Math.PI - frac * Math.PI // 180°..0°
  const pt = (frac: number, rad = R) => [cx + rad * Math.cos(ang(frac)), cy - rad * Math.sin(ang(frac))]
  const fillFrac = Math.min(1, Math.max(0, liquida / max))
  const [ex, ey] = pt(fillFrac)
  const largeArc = fillFrac > 0.5 ? 1 : 0
  return (
    <div style={{ padding: 18, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg viewBox="0 0 200 124" style={{ width: '100%', maxWidth: 280 }}>
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="var(--track)" strokeWidth={16} strokeLinecap="round" />
        <path className={`${PFX}-gaugefill`} d={`M20 100 A80 80 0 ${largeArc} 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`} fill="none" stroke="#3E7FE0" strokeWidth={16} strokeLinecap="round" />
        <text x={cx} y={94} textAnchor="middle" fontSize={34} fontWeight={700} fill="var(--ink)">{liquida}</text>
        <text x={cx} y={112} textAnchor="middle" fontSize={9.5} fill="var(--muted)">{rotulo}</text>
      </svg>
    </div>
  )
}

function Row({ label, value, color, top = true }: { label: string; value: string; color: string; top?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderTop: top ? '1px solid var(--line)' : undefined, fontSize: 13 }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <b style={{ color, textAlign: 'right' }}>{value}</b>
    </div>
  )
}

function Pill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} style={{ flexShrink: 0, height: 32, padding: '0 12px', borderRadius: 99, border: `1px solid ${active ? 'var(--selLine)' : 'var(--line)'}`, background: active ? 'var(--selBg)' : 'var(--surface)', color: active ? 'var(--brand)' : 'var(--muted)', font: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</button>
  )
}

function StatusPill({ color, bg, label }: { color: string; bg: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 10px', borderRadius: 99, background: bg, color, fontSize: 12, fontWeight: 800 }}>
      {label === 'Acertou' ? <IconCheck size={13} sw={3} /> : <IconX size={13} />}{label}
    </span>
  )
}

function LegC({ sw, label }: { sw: string; label: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: sw }} />{label}</span>
}

function IconMoonLocal() {
  return <svg viewBox="0 0 24 24" width={16} height={16} style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
}

function DocIcon() {
  return <span style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--chip)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><IconDownload size={18} /></span>
}

function docStyle(destaque: boolean): React.CSSProperties {
  return { display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 10, border: `1.5px solid ${destaque ? 'var(--selLine)' : 'var(--line)'}`, background: destaque ? 'var(--selBg)' : 'var(--surface)', textDecoration: 'none', font: 'inherit', cursor: 'pointer', textAlign: 'left' }
}

function DocBtn({ nome, destaque, loading, onClick }: { nome: string; destaque?: boolean; loading: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={loading} className={`${PFX}-doc`} style={docStyle(!!destaque)}>
      {loading ? <span style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--chip)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Loader2 className="animate-spin" size={18} /></span> : <DocIcon />}
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.3 }}>{nome}</span>
      <span style={{ color: 'var(--brand)', flexShrink: 0 }}><IconDownload size={16} /></span>
    </button>
  )
}

function DiscursivaView({ d }: { d: QuestaoRev['discursiva'] }) {
  if (!d) return <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--surface2)', color: 'var(--muted)', fontSize: 13 }}>Questão não respondida.</div>
  const enviada = (d.imagens?.length ?? 0) > 0 || (d.paginas ?? 0) > 0 || !!d.texto?.trim()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {d.status === 'corrigida' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 12, background: 'rgba(31,168,104,.1)', color: OK, fontSize: 13.5, fontWeight: 700 }}><IconCheck size={16} />Corrigida — nota {Number(d.nota ?? 0).toFixed(1)}</div>
      ) : enviada ? (
        <div style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(242,169,59,.12)', color: WARN, fontSize: 12.5, fontWeight: 700 }}>Resposta enviada — aguardando correção por um avaliador.</div>
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

function css() {
  return `
.${PFX}-app{font-synthesis-weight:none}
${baseKeyframes(PFX)}
.${PFX}-gaugefill{animation:${PFX}dash 1s cubic-bezier(.22,1,.36,1) both}
@keyframes ${PFX}dash{from{opacity:0}}
@media (max-width:640px){
  .${PFX}-top{padding:0 14px;gap:12px}
  .${PFX}-h1{font-size:21px}
  .${PFX}-tlab{display:none}
  .${PFX}-tbtn{padding:0 12px!important}
  .${PFX}-grid{grid-template-columns:1fr!important}
  .${PFX}-dgrid{grid-template-columns:1fr!important}
  .${PFX}-corr{grid-template-columns:1fr!important}
  .${PFX}-corrnav{position:static!important;order:-1}
  .${PFX}-cnavgrid{grid-template-columns:repeat(8,1fr)!important;max-height:300px!important}
}`
}
