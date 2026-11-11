'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Aviso, Btn, Card, Col, Eyebrow, Row } from '@/components/nova/ui'
import { Icon } from '@/components/nova/icons'
import { NovaModal } from '@/components/nova/modal'
import { GradeCronograma, ResumoGrade } from '@/components/cronograma/grade-cronograma'
import { VisaoCronograma } from '@/components/cronograma/visao-cronograma'
import { fmtBr, hojeISO, proximaSegunda } from '@/lib/cronograma/datas'
import { faixaSemanal } from '@/lib/cronograma/faixa'
import { CHAVE_PALETA_LOCAL, PALETAS } from '@/lib/cronograma/paletas'
import type { Grade, ModoRecesso, OpcoesGeracao, PeriodicidadeRevisao } from '@/lib/cronograma/tipos'
import type { CronogramaDoAluno } from '@/lib/cronograma/acesso'
import type { ResultadoGeracao } from './actions-tipos'

/** Fluxo curto: escolha o modelo → responda o formulário → prévia → gerar. */
const PASSOS = ['Modelo', 'Preferências', 'Prévia'] as const
const ULTIMA = PASSOS.length - 1

/** Pré-preenchimento opcional do formulário (todos os campos são opcionais). */
export type FormularioInicialPadrao = {
  nome?: string
  inicio?: string
  semDatas?: boolean
  revisaoAtiva?: boolean
  revisaoCada?: PeriodicidadeRevisao
  recessoAtivo?: boolean
  recessoModo?: Exclude<ModoRecesso, 'nenhum'>
  recessoDe?: string
  recessoAte?: string
  paleta?: string
}

export type CronogramaClientProps = {
  /** Modelos liberados ao aluno (cronogramasDoAluno). */
  modelos?: CronogramaDoAluno[]
  /** Alias antigo de `modelos` (mantido enquanto o page.tsx atual ainda o usa). */
  catalogo?: CronogramaDoAluno[]
  modeloInicialId?: string | null
  formularioInicial?: FormularioInicialPadrao
  onVoltar?: () => void
}

/**
 * POST em rota de API (server actions são rejeitadas em domínio custom / iframe Curseduca).
 * O estado vive SÓ no cliente: nada é gravado ao escolher modelo ou preencher; a prévia nunca grava;
 * /padrao/gerar ("Gerar meu cronograma") é o ÚNICO ponto de gravação.
 */
async function postar(url: string, corpo: unknown): Promise<ResultadoGeracao> {
  try {
    const res = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
    const j = await res.json().catch(() => null)
    if (j && typeof j.ok === 'boolean') return j as ResultadoGeracao
    return { ok: false, error: res.status === 401 ? 'Sua sessão expirou. Entre novamente.' : 'Não foi possível concluir. Tente de novo.' }
  } catch {
    return { ok: false, error: 'Sem conexão. Tente de novo.' }
  }
}

export function CronogramaClient({ modelos, catalogo: catalogoLegado, modeloInicialId, formularioInicial: fi, onVoltar }: CronogramaClientProps) {
  const catalogo = useMemo(() => modelos ?? catalogoLegado ?? [], [modelos, catalogoLegado])
  const router = useRouter()
  const inicial = useMemo(() => catalogo.find((c) => c.id === modeloInicialId) ?? null, [catalogo, modeloInicialId])

  // ── Passo a passo (com modelo pré-escolhido, começa direto nas preferências)
  const [etapa, setEtapa] = useState(inicial ? 1 : 0)

  // ── Nome (vira o título da emissão salva). O nome do documento é o do aluno, lido no servidor.
  const [titulo, setTitulo] = useState(fi?.nome ?? '')

  // ── Carga horária
  const cargas = useMemo(() => [...new Set(catalogo.map((c) => c.carga_horaria))].sort((a, b) => a - b), [catalogo])
  const [carga, setCarga] = useState<number | null>(inicial?.carga_horaria ?? cargas[0] ?? null)

  // ── Modelo (filtrado pela carga)
  const daCarga = useMemo(() => catalogo.filter((c) => c.carga_horaria === carga), [catalogo, carga])
  const [cronogramaId, setCronogramaId] = useState<string>(inicial?.id ?? daCarga[0]?.id ?? '')
  const escolhido = useMemo(() => catalogo.find((c) => c.id === cronogramaId) ?? null, [catalogo, cronogramaId])

  // ── Data de início (R1 — sempre uma segunda)
  const [inicio, setInicio] = useState(() => proximaSegunda(fi?.inicio || hojeISO()))
  const segunda = useMemo(() => proximaSegunda(inicio), [inicio])
  const dataAjustada = segunda !== inicio

  // ── Revisão e recesso
  const [revisaoAtiva, setRevisaoAtiva] = useState(fi?.revisaoAtiva ?? true)
  const [revisaoCada, setRevisaoCada] = useState<PeriodicidadeRevisao>(fi?.revisaoCada ?? 12)
  const [recessoAtivo, setRecessoAtivo] = useState(fi?.recessoAtivo ?? false)
  const [recessoModo, setRecessoModo] = useState<Exclude<ModoRecesso, 'nenhum'>>(fi?.recessoModo ?? 'natal')
  const [recessoDe, setRecessoDe] = useState(fi?.recessoDe ?? '')
  const [recessoAte, setRecessoAte] = useState(fi?.recessoAte ?? '')
  // Plano "só semanas": ignora datas de calendário (Semana 1, 2, 3…).
  const [semDatas, setSemDatas] = useState(fi?.semDatas ?? false)

  // ── Paleta (lembrada no navegador)
  const [paletaSlug, setPaletaSlug] = useState(fi?.paleta ?? PALETAS[0].slug)
  useEffect(() => {
    if (fi?.paleta) return
    try {
      const salva = localStorage.getItem(CHAVE_PALETA_LOCAL)
      if (salva) setPaletaSlug(salva)
    } catch { /* armazenamento bloqueado em iframe de terceiros: segue com o padrão */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Só usado se a gravação falhar (sem emissão para abrir): mostra a grade na própria tela.
  const [grade, setGrade] = useState<Grade | null>(null)
  const [naoSalvou, setNaoSalvou] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [previaGrade, setPreviaGrade] = useState<Grade | null>(null)
  const [previaAberta, setPreviaAberta] = useState(false)
  const [gerandoPrevia, setGerandoPrevia] = useState(false)

  useEffect(() => {
    if (!daCarga.some((c) => c.id === cronogramaId)) setCronogramaId(daCarga[0]?.id ?? '')
  }, [daCarga, cronogramaId])

  function montarOpcoes(): OpcoesGeracao {
    return {
      inicio: segunda,
      revisao: { ativo: revisaoAtiva, cada: revisaoCada },
      recesso: recessoAtivo && !semDatas
        ? { modo: recessoModo, de: recessoDe || undefined, ate: recessoAte || undefined }
        : { modo: 'nenhum' },
    }
  }

  const corpo = () => ({ cronogramaId, nome: titulo, paleta: paletaSlug, semDatas, opcoes: montarOpcoes() })

  // Prévia = monta a grade SEM gravar e abre no pop-up.
  async function verPrevia() {
    if (gerandoPrevia || gerando) return
    if (!cronogramaId) { toast.error('Escolha um modelo.'); return }
    setGerandoPrevia(true)
    const r = await postar('/api/aluno/cronograma/padrao/previa', corpo())
    setGerandoPrevia(false)
    if (!r.ok) { toast.error(r.error); return }
    setPreviaGrade(r.grade)
    setPreviaAberta(true)
  }

  // ÚNICO ponto de gravação. Sucesso ⇒ abre /aluno/cronograma/[emissaoId].
  async function gerar() {
    if (gerando) return
    if (!cronogramaId) { toast.error('Escolha um modelo.'); return }
    setGerando(true)
    const r = await postar('/api/aluno/cronograma/padrao/gerar', corpo())
    if (!r.ok) { setGerando(false); toast.error(r.error); return }
    try { localStorage.setItem(CHAVE_PALETA_LOCAL, paletaSlug) } catch { /* ignora */ }
    if (r.emissaoId) {
      router.push(`/aluno/cronograma/${r.emissaoId}`)
      return // mantém o botão em "gerando" até a navegação
    }
    setGerando(false)
    setGrade(r.grade)
    setNaoSalvou(true)
    setPreviaAberta(false)
    toast.error('A grade foi montada, mas não conseguimos salvá-la na sua conta.')
  }

  if (!catalogo.length) return null

  const previa: [string, string][] = [
    ['Nome', titulo.trim() || escolhido?.nome || '—'],
    ['Tempo por dia', carga ? `${carga}h` : '—'],
    ['Modelo', escolhido ? `${escolhido.nome} (${faixaSemanal(escolhido.dias_curso)})` : '—'],
    ['Começa em', semDatas ? 'Sem data — só semanas' : `${fmtBr(segunda)} (segunda)`],
    ['Semanas de revisão', revisaoAtiva ? `Sim — a cada ${revisaoCada} semanas` : 'Não'],
    ['Recesso', recessoAtivo && !semDatas ? (recessoModo === 'outras' ? `${recessoDe || '?'} a ${recessoAte || '?'}` : ROTULO_RECESSO[recessoModo]) : 'Não'],
    ['Cores', PALETAS.find((p) => p.slug === paletaSlug)?.nome ?? '—'],
  ]

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card pad={22}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Eyebrow>Novo cronograma</Eyebrow>
        </Row>

        {/* Stepper — clicável para voltar/avançar entre passos */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto', paddingBottom: 12, borderBottom: '1px solid var(--line)' }}>
          {PASSOS.map((t, i) => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setEtapa(i)}
                aria-current={i === etapa ? 'step' : undefined}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px 4px 4px', borderRadius: 99, border: 0, cursor: 'pointer', background: i === etapa ? 'var(--chip)' : 'transparent', color: 'var(--ink)' }}
              >
                <span
                  style={{
                    width: 26, height: 26, borderRadius: 99, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800,
                    background: i === etapa ? 'var(--brand)' : 'var(--surface2)',
                    color: i === etapa ? '#FFFFFF' : i < etapa ? 'var(--brand)' : 'var(--muted)',
                  }}
                >
                  {i < etapa ? <Icon n="check" size={14} /> : i + 1}
                </span>
                <span style={{ fontSize: 13.5, fontWeight: i === etapa ? 800 : 600, color: i === etapa ? 'var(--brand)' : i < etapa ? 'var(--ink)' : 'var(--muted)' }}>{t}</span>
              </button>
              {i < PASSOS.length - 1 && <span aria-hidden style={{ width: 20, height: 1, background: 'var(--line)' }} />}
            </div>
          ))}
        </div>

        {/* Corpo do passo atual — grid adaptativo ao container */}
        <div style={{ minHeight: 110 }}>
          {etapa === 0 && (
            <div style={GRID_PASSO}>
              <Passo titulo="Quanto tempo por dia?">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {cargas.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setCarga(h)}
                      aria-pressed={carga === h}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 12px', borderRadius: 11, cursor: 'pointer', fontSize: 13,
                        border: `1px solid ${carga === h ? 'var(--brand)' : 'var(--line)'}`,
                        background: carga === h ? 'var(--brand)' : 'var(--surface)',
                        color: carga === h ? '#FFFFFF' : 'var(--ink)',
                      }}
                    >
                      <b>{h}h</b>
                      <span style={{ fontSize: 11, opacity: 0.75 }}>{catalogo.filter((c) => c.carga_horaria === h).length} opções</span>
                    </button>
                  ))}
                </div>
              </Passo>
              <Passo titulo="Escolha o modelo">
                <select value={cronogramaId} onChange={(e) => setCronogramaId(e.target.value)} aria-label="Modelo" style={CAMPO}>
                  {daCarga.map((c) => <option key={c.id} value={c.id}>{c.nome} ({faixaSemanal(c.dias_curso)})</option>)}
                </select>
                {escolhido && (
                  <Dica>
                    {escolhido.total_semanas} semanas cadastradas{escolhido.semanas_revisao.length > 0 && `, ${escolhido.semanas_revisao.length} de revisão`} · {escolhido.dias_nome.length} dias por semana
                  </Dica>
                )}
              </Passo>
            </div>
          )}

          {etapa === 1 && (
            <div style={GRID_PASSO}>
              <Passo titulo="Nome do cronograma">
                <input value={titulo} maxLength={80} onChange={(e) => setTitulo(e.target.value)} placeholder={escolhido ? escolhido.nome : 'Como quer chamar este plano?'} aria-label="Nome do cronograma" style={CAMPO} />
                <Dica>Só para você distinguir os seus cronogramas salvos.</Dica>
              </Passo>
              <Passo titulo="Quando você começa?">
                <input type="date" value={inicio} min={hojeISO()} disabled={semDatas} onChange={(e) => setInicio(e.target.value)} aria-label="Data de início" style={{ ...CAMPO, opacity: semDatas ? 0.5 : 1 }} />
                <Dica>
                  {semDatas ? 'Ignorado neste modo — o plano é numerado só por semanas.' : dataAjustada ? (<>Todo cronograma começa numa segunda — ajustamos para <strong>{fmtBr(segunda)}</strong>.</>) : (<>Começa na segunda {fmtBr(segunda)}.</>)}
                </Dica>
                <label style={{ display: 'flex', cursor: 'pointer', alignItems: 'flex-start', gap: 8, marginTop: 4, fontSize: 12, color: 'var(--muted)' }}>
                  <input type="checkbox" checked={semDatas} onChange={(e) => setSemDatas(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--brand)' }} />
                  <span>Sem data — só numerar as semanas (desativa o recesso).</span>
                </label>
              </Passo>
              <Passo titulo="Cores das tabelas">
                <select value={paletaSlug} onChange={(e) => setPaletaSlug(e.target.value)} aria-label="Cores das tabelas" style={CAMPO}>
                  {PALETAS.map((p) => <option key={p.slug} value={p.slug}>{p.nome}</option>)}
                </select>
              </Passo>
              <Passo titulo="Incluir semanas de revisão?">
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  <SimNao valor={revisaoAtiva} aoTrocar={setRevisaoAtiva} />
                  {revisaoAtiva && (
                    <select value={String(revisaoCada)} onChange={(e) => setRevisaoCada(Number(e.target.value) as PeriodicidadeRevisao)} aria-label="Periodicidade da revisão" style={{ ...CAMPO, width: 180 }}>
                      {[4, 6, 8, 10, 12].map((k) => <option key={k} value={String(k)}>A cada {k} semanas</option>)}
                    </select>
                  )}
                </div>
                {revisaoAtiva && <Dica>Uma semana exclusiva de revisão é inserida após cada bloco.</Dica>}
              </Passo>
              <Passo titulo="Incluir recesso?">
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, opacity: semDatas ? 0.5 : 1, pointerEvents: semDatas ? 'none' : 'auto' }}>
                  <SimNao valor={recessoAtivo && !semDatas} aoTrocar={setRecessoAtivo} />
                  {recessoAtivo && !semDatas && (
                    <select value={recessoModo} onChange={(e) => setRecessoModo(e.target.value as Exclude<ModoRecesso, 'nenhum'>)} aria-label="Tipo de recesso" style={{ ...CAMPO, width: 210 }}>
                      {(Object.keys(ROTULO_RECESSO) as (keyof typeof ROTULO_RECESSO)[]).map((k) => <option key={k} value={k}>{ROTULO_RECESSO[k]}</option>)}
                    </select>
                  )}
                </div>
                {recessoAtivo && !semDatas && recessoModo === 'outras' && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <input type="date" value={recessoDe} onChange={(e) => setRecessoDe(e.target.value)} aria-label="Recesso de" style={{ ...CAMPO, width: 160 }} />
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>até</span>
                    <input type="date" value={recessoAte} onChange={(e) => setRecessoAte(e.target.value)} aria-label="Recesso até" style={{ ...CAMPO, width: 160 }} />
                    <Dica>O intervalo é esticado para semanas inteiras. Sem as duas datas, nenhuma semana é bloqueada.</Dica>
                  </div>
                )}
                {recessoAtivo && !semDatas && recessoModo !== 'outras' && <Dica>As semanas de recesso empurram o conteúdo para a frente.</Dica>}
              </Passo>
            </div>
          )}

          {etapa === ULTIMA && (
            <Col gap={14}>
              <div>
                <b style={{ fontSize: 15, color: 'var(--ink)' }}>Confira seu plano antes de gerar</b>
                <Dica>Veja a prévia à vontade — nada é salvo até você clicar em “Gerar meu cronograma”.</Dica>
              </div>
              <div style={{ border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
                {previa.map(([k, v], i) => (
                  <div key={k} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', borderTop: i ? '1px solid var(--line)' : 0 }}>
                    <span style={{ fontSize: 13.5, color: 'var(--muted)' }}>{k}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)', textAlign: 'right' }}>{v}</span>
                  </div>
                ))}
              </div>
              {escolhido && (
                <Dica>
                  Resultado estimado: ~{escolhido.total_semanas} semanas de conteúdo{revisaoAtiva ? ' + revisões' : ''}{recessoAtivo && !semDatas ? ' + recesso' : ''}.
                </Dica>
              )}
              <Aviso icon="info">
                <b>Ao gerar, o cronograma fica salvo na sua conta.</b> Se sair antes de gerar, as escolhas acima são descartadas.
              </Aviso>
            </Col>
          )}
        </div>

        {/* Navegação — quebra em linhas em telas pequenas */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
          {/* Voltar único: nos passos seguintes volta um passo; no primeiro sai do fluxo (onVoltar), se houver. */}
          <Btn kind="secondary" icon="back" onClick={() => (etapa === 0 ? onVoltar?.() : setEtapa((e) => Math.max(0, e - 1)))} style={etapa === 0 && !onVoltar ? { opacity: 0.4, pointerEvents: 'none' } : undefined}>
            Voltar
          </Btn>
          {etapa < ULTIMA ? (
            <Btn kind="primary" onClick={() => cronogramaId && setEtapa((e) => Math.min(ULTIMA, e + 1))} style={!cronogramaId ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
              Avançar
            </Btn>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
              <Btn kind="secondary" icon="eye" onClick={verPrevia} style={gerandoPrevia || gerando || !cronogramaId ? { opacity: 0.6, pointerEvents: 'none' } : undefined}>
                {gerandoPrevia ? 'Montando prévia…' : 'Ver prévia'}
              </Btn>
              <Btn kind="gold" icon="cal" onClick={gerar} style={gerando || !cronogramaId ? { opacity: 0.6, pointerEvents: 'none' } : undefined}>
                {gerando ? 'Gerando…' : 'Gerar meu cronograma'}
              </Btn>
            </div>
          )}
        </div>
      </Card>

      {/* Só aparece se a gravação falhar: a grade segue utilizável na tela. */}
      {grade && naoSalvou && (
        <>
          <Aviso icon="alert">
            <b>Este cronograma não ficou salvo na sua conta.</b> A grade abaixo está correta e você pode usá-la agora, mas ela não vai aparecer em &quot;Meus cronogramas&quot;. Avise o suporte.
          </Aviso>
          <div className="space-y-4">
            <ResumoGrade grade={grade} ocultarDatas={semDatas} />
            <p className="text-sm" style={{ color: 'var(--sub)' }}>{grade.resumo.subtitulo}</p>
            <VisaoCronograma grade={grade} paletaSlug={paletaSlug} emissaoId={null} ocultarDatas={semDatas} />
          </div>
        </>
      )}

      {/* Prévia: a grade pronta, sem gravar — o aluno confirma e gera de vez aqui. */}
      {previaAberta && previaGrade && (
        <NovaModal
          w={1040}
          titulo={titulo.trim() || escolhido?.nome || 'Prévia'}
          sub="Prévia — como o plano vai ficar (ainda não salvo)"
          onClose={() => setPreviaAberta(false)}
        >
          <div style={{ maxHeight: '58vh', overflow: 'auto' }}>
            <div className="space-y-4">
              <ResumoGrade grade={previaGrade} ocultarDatas={semDatas} />
              <p className="text-sm" style={{ color: 'var(--sub)' }}>{previaGrade.resumo.subtitulo}</p>
              <GradeCronograma grade={previaGrade} paletaSlug={paletaSlug} titulo="Seu plano semana a semana" ocultarDatas={semDatas} />
            </div>
          </div>
          <Row gap={8} style={{ justifyContent: 'flex-end' }}>
            <Btn kind="secondary" size="sm" onClick={() => setPreviaAberta(false)}>Fechar</Btn>
            <Btn kind="gold" size="sm" icon="cal" onClick={gerar} style={gerando ? { opacity: 0.6, pointerEvents: 'none' } : undefined}>
              {gerando ? 'Gerando…' : 'Gerar meu cronograma'}
            </Btn>
          </Row>
        </NovaModal>
      )}
    </div>
  )
}

const ROTULO_RECESSO = {
  natal: 'Natal',
  ano_novo: 'Ano Novo',
  natal_ano_novo: 'Natal + Ano Novo',
  outras: 'Outras semanas',
} as const

/** Campos nativos com tokens (o Select do shadcn abre popup fora do escopo de tokens da casca). */
const CAMPO: React.CSSProperties = { height: 42, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', padding: '0 12px', fontSize: 13.5, minWidth: 0, width: '100%' }
/** Grid adaptativo ao container (não à viewport). */
const GRID_PASSO: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '20px 24px', alignItems: 'start' }

function Passo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <label style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>{titulo}</label>
      {children}
    </div>
  )
}

function Dica({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--muted)' }}>{children}</p>
}

function SimNao({ valor, aoTrocar }: { valor: boolean; aoTrocar: (v: boolean) => void }) {
  return (
    <div role="group" style={{ display: 'inline-flex', height: 36, overflow: 'hidden', borderRadius: 11, border: '1px solid var(--line)' }}>
      {[
        [true, 'Sim'],
        [false, 'Não'],
      ].map(([v, rotulo]) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => aoTrocar(v as boolean)}
          aria-pressed={valor === v}
          style={{ padding: '0 16px', fontSize: 13, fontWeight: 700, border: 0, cursor: 'pointer', background: valor === v ? 'var(--brand)' : 'var(--surface)', color: valor === v ? '#FFFFFF' : 'var(--ink)' }}
        >
          {rotulo as string}
        </button>
      ))}
    </div>
  )
}
