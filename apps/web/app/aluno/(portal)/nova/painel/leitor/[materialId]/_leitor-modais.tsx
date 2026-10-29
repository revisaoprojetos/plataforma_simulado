'use client'
// Modais do Leitor de PDF (Revisão): "Reportar problema" e "Avaliação 0 a 5".
// Porte fiel de LeitorReportarRevisao / LeitorAvaliacaoRevisao, agora LIGADOS ao backend de Demandas:
//   - Reportar → server action reportarMaterial (cria reporte na Central de Demandas do admin).
//   - Avaliar → server action avaliarMaterialAction (upsert da nota do aluno; estrelas pré-preenchidas).
// Degrade elegante: se a migração ainda não foi aplicada, a action retorna erro e mostramos aviso leve.
// Cores sempre via tokens. Sem window.alert. Primitivos uncontrolled → inputs/textarea crus por token.
import * as React from 'react'
import { Btn, Eyebrow, H2, Muted } from '@/components/nova/ui'
import { Icon } from '@/components/nova/icons'
import { reportarMaterial, avaliarMaterialAction } from '../actions'
import { TIPOS_REPORTE, type TipoReporte } from '@/lib/demandas/tipos'

/* ---------- overlay reutilizável ---------- */
function Overlay({ onClose, children, w = 540 }: { onClose: () => void; children: React.ReactNode; w?: number }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '120px 20px 20px', background: 'rgba(20,12,55,.45)', overflowY: 'auto' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: w, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 24, boxShadow: '0 40px 80px -30px rgba(20,12,55,.5)', display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        {children}
      </div>
    </div>
  )
}

/* ---------- chip selecionável local ---------- */
function PickChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ height: 38, padding: '0 16px', borderRadius: 11, border: `1px solid ${on ? 'var(--brand)' : 'var(--line)'}`, background: on ? 'var(--chip)' : 'var(--surface)', color: on ? 'var(--brand)' : 'var(--ink)', fontSize: 13.5, fontWeight: on ? 800 : 700, cursor: 'pointer' }}
    >
      {label}
    </button>
  )
}

/* ---------- avisos inline (sucesso/erro) ---------- */
function Nota({ kind, children }: { kind: 'ok' | 'erro'; children: React.ReactNode }) {
  const ok = kind === 'ok'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 13, background: ok ? 'var(--okBg)' : 'var(--dangerBg)', color: ok ? 'var(--ok)' : 'var(--danger)', fontSize: 13.5, fontWeight: 700 }}>
      <Icon n={ok ? 'check' : 'alert'} size={16} />
      <span>{children}</span>
    </div>
  )
}

/* ================= Reportar problema ================= */
export function ReportarButton({ documentoId, versaoId = null }: { documentoId: string; versaoId?: string | null }) {
  const [open, setOpen] = React.useState(false)
  const [tipo, setTipo] = React.useState<TipoReporte>('desatualizado')
  const [desc, setDesc] = React.useState('')
  const [pagina, setPagina] = React.useState('')
  const [enviado, setEnviado] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  function fechar() {
    setOpen(false)
    // reset leve ao fechar (mantém a última seleção de tipo, limpa o resto)
    setEnviado(false); setErro(null); setDesc(''); setPagina('')
  }

  function enviar() {
    setErro(null)
    const pg = pagina.trim() ? Number(pagina.trim()) : null
    startTransition(async () => {
      const r = await reportarMaterial({
        documentoId,
        tipo,
        descricao: desc,
        pagina: pg != null && Number.isFinite(pg) ? pg : null,
        versaoId,
      })
      if (r.ok) setEnviado(true)
      else setErro(r.erro || 'Não foi possível enviar o reporte. Tente novamente.')
    })
  }

  const podeEnviar = desc.trim().length > 0 && !pending

  return (
    <>
      <Btn kind="secondary" size="sm" icon="alert" onClick={() => setOpen(true)}>Reportar problema</Btn>
      {open ? (
        <Overlay onClose={fechar}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Eyebrow>Leitura do material</Eyebrow>
            <H2>Reportar problema</H2>
          </div>

          {enviado ? (
            <>
              <Nota kind="ok">Reporte enviado, obrigado! Nossa equipe vai analisar.</Nota>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Btn kind="primary" icon="check" onClick={fechar}>Fechar</Btn>
              </div>
            </>
          ) : (
            <>
              <Muted>Vai para a central de demandas, com o material já preenchido.</Muted>

              <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>Qual o problema?</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {TIPOS_REPORTE.map((t) => (
                  <PickChip key={t.value} label={t.label} on={tipo === t.value} onClick={() => setTipo(t.value)} />
                ))}
              </div>
              <Muted size={12}>Exemplos: gabarito/conteúdo errado, PDF não abre ou fica em branco, grifos não salvam, material defasado.</Muted>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>
                <span>Descrição <span style={{ color: 'var(--danger)' }}>*</span></span>
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="O que aconteceu? (obrigatório)"
                  style={{ width: '100%', height: 92, resize: 'vertical', padding: '12px 14px', borderRadius: 13, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', font: 'inherit', fontSize: 14, lineHeight: 1.5, boxSizing: 'border-box' }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>
                <span>Página <span style={{ fontWeight: 700, color: 'var(--muted)' }}>(opcional)</span></span>
                <input
                  value={pagina}
                  onChange={(e) => setPagina(e.target.value.replace(/[^\d]/g, ''))}
                  inputMode="numeric"
                  placeholder="Ex.: 7"
                  style={{ width: 160, maxWidth: '100%', height: 42, padding: '0 14px', borderRadius: 13, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', font: 'inherit', fontSize: 14, boxSizing: 'border-box' }}
                />
              </label>

              {erro ? <Nota kind="erro">{erro}</Nota> : null}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <Btn kind="secondary" onClick={fechar}>Cancelar</Btn>
                <Btn kind="primary" icon="arrow" onClick={enviar} style={podeEnviar ? undefined : { opacity: 0.5, pointerEvents: 'none' }}>
                  {pending ? 'Enviando…' : 'Enviar reporte'}
                </Btn>
              </div>
            </>
          )}
        </Overlay>
      ) : null}
    </>
  )
}

/* ================= Avaliação 0 a 5 (estrelas) ================= */
export function ConcluirLeituraButton({
  documentoId,
  notaAtual = null,
  comentarioAtual = null,
}: {
  documentoId: string
  notaAtual?: number | null
  comentarioAtual?: string | null
}) {
  const [open, setOpen] = React.useState(false)
  const [nota, setNota] = React.useState<number>(notaAtual ?? 0)
  const [hover, setHover] = React.useState<number>(0)
  const [coment, setComent] = React.useState<string>(comentarioAtual ?? '')
  const [enviado, setEnviado] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  function fechar() {
    setOpen(false)
    setEnviado(false); setErro(null)
    // volta para a última nota salva conhecida
    setNota(notaAtual ?? 0); setComent(comentarioAtual ?? '')
  }

  function enviar() {
    setErro(null)
    startTransition(async () => {
      const r = await avaliarMaterialAction({ documentoId, nota, comentario: coment.trim() || null })
      if (r.ok) setEnviado(true)
      else setErro(r.erro || 'Não foi possível enviar sua avaliação. Tente novamente.')
    })
  }

  const podeEnviar = nota >= 1 && !pending

  return (
    <>
      <Btn kind="gold" icon="check" onClick={() => setOpen(true)}>Concluir leitura</Btn>
      {open ? (
        <Overlay onClose={fechar} w={520}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <span style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--okBg)', color: 'var(--ok)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon n="check" size={22} />
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <H2>Avalie este material</H2>
              <Muted size={12.5}>Sua nota ajuda a melhorar o conteúdo{notaAtual ? ` · você já avaliou com ${notaAtual}` : ''}</Muted>
            </div>
          </div>

          {enviado ? (
            <>
              <Nota kind="ok">Avaliação enviada. Obrigado!</Nota>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Btn kind="primary" icon="check" onClick={fechar}>Fechar</Btn>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>
                Como foi este material? <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)' }}>(toque nas estrelas)</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }} onMouseLeave={() => setHover(0)}>
                {[1, 2, 3, 4, 5].map((n) => {
                  const on = n <= (hover || nota)
                  return (
                    <button
                      key={n}
                      type="button"
                      aria-label={`${n} ${n === 1 ? 'estrela' : 'estrelas'}`}
                      aria-pressed={n === nota}
                      onMouseEnter={() => setHover(n)}
                      onClick={() => setNota(n)}
                      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 52, height: 52, borderRadius: 13, border: `1px solid ${on ? 'var(--gold)' : 'var(--line)'}`, background: on ? 'var(--peachBg)' : 'var(--surface)', cursor: 'pointer' }}
                    >
                      <Icon n="star" size={26} style={{ color: on ? 'var(--gold)' : 'var(--line2)' }} />
                    </button>
                  )
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Muted size={12}>1 · não ajudou</Muted>
                <Muted size={12}>5 · excelente</Muted>
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>
                <span>O que podemos melhorar? <span style={{ fontWeight: 700, color: 'var(--muted)' }}>(opcional)</span></span>
                <textarea
                  value={coment}
                  onChange={(e) => setComent(e.target.value)}
                  placeholder="Conte em poucas palavras"
                  style={{ width: '100%', height: 90, resize: 'vertical', padding: '12px 14px', borderRadius: 13, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', font: 'inherit', fontSize: 14, lineHeight: 1.5, boxSizing: 'border-box' }}
                />
              </label>

              {erro ? <Nota kind="erro">{erro}</Nota> : null}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <Btn kind="secondary" onClick={fechar}>Pular</Btn>
                <Btn kind="primary" icon="arrow" onClick={enviar} style={podeEnviar ? undefined : { opacity: 0.5, pointerEvents: 'none' }}>
                  {pending ? 'Enviando…' : notaAtual ? 'Atualizar avaliação' : 'Enviar avaliação'}
                </Btn>
              </div>
            </>
          )}
        </Overlay>
      ) : null}
    </>
  )
}
