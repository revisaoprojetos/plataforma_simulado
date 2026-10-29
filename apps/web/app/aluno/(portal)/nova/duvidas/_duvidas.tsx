'use client'
// Partes interativas da Central de Dúvidas (client). Chamam as server actions e dão router.refresh().
// O server component (page.tsx) renderiza lista/conversa reais; aqui ficam: compor nova dúvida,
// responder na conversa e marcar resolvida. Inputs são controlados → uso <textarea>/<input>/<select>
// crus (os primitivos Field/Textarea são uncontrolled), mas com o mesmo visual por tokens.
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, H2, H3, P, Muted, Row, Col, Btn, IBtn } from '@/components/nova/ui'
import { R } from '@/lib/nova/rotas'
import { criarDuvida, responderDuvida, marcarDuvidaResolvida } from './actions'

const INPUT: React.CSSProperties = { height: 44, padding: '0 14px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', fontSize: 14, fontWeight: 600, color: 'var(--ink)', outline: 'none', width: '100%' }
const TA: React.CSSProperties = { minHeight: 110, padding: '12px 14px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', fontSize: 14, fontWeight: 500, color: 'var(--ink)', outline: 'none', width: '100%', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }

// ——— Nova dúvida (botão no header → painel de composição) ———
export function NovaDuvida({ categorias }: { categorias: string[] }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [categoria, setCategoria] = useState('')
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function enviar() {
    if (pending) return
    setErro(null)
    const t = titulo.trim()
    if (!t) { setErro('Escreva a sua dúvida.'); return }
    start(async () => {
      const r = await criarDuvida({ titulo: t, categoria: categoria || null, texto: texto.trim() || null })
      if (!r.ok) { setErro(r.erro ?? 'Não foi possível abrir a dúvida.'); return }
      setAberto(false); setTitulo(''); setCategoria(''); setTexto('')
      if (r.id) router.push(`${R.duvidas}?d=${r.id}`)
      router.refresh()
    })
  }

  if (!aberto) {
    return <Btn kind="primary" icon="pen" onClick={() => setAberto(true)}>Nova dúvida</Btn>
  }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'grid', placeItems: 'center', background: 'rgba(17,17,27,.45)', padding: 24 }}
      onClick={(e) => { if (e.target === e.currentTarget && !pending) setAberto(false) }}>
      <Card pad={24} style={{ width: 'min(560px, 100%)', maxHeight: '90vh', overflow: 'auto' }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <H2>Nova dúvida</H2>
          <IBtn icon="x" label="Fechar" size={36} onClick={() => !pending && setAberto(false)} />
        </Row>
        <P>Descreva a sua dúvida. Ela chega direto ao professor da matéria.</P>
        <Col gap={12} style={{ marginTop: 4 }}>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus
            placeholder="Sua pergunta (ex.: Lei 14.230/21 retroage?)" style={INPUT} />
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)}
            style={{ ...INPUT, color: categoria ? 'var(--ink)' : 'var(--muted)' }}>
            <option value="">Categoria (opcional)</option>
            {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)}
            placeholder="Detalhe a sua dúvida (opcional)" style={TA} />
          {erro && <Muted size={12.5}><span style={{ color: 'var(--danger)' }}>{erro}</span></Muted>}
          <Row style={{ justifyContent: 'flex-end', gap: 8 }}>
            <Btn kind="secondary" size="sm" onClick={() => !pending && setAberto(false)}>Cancelar</Btn>
            <Btn kind="primary" icon="arrow" onClick={enviar}>{pending ? 'Enviando…' : 'Enviar dúvida'}</Btn>
          </Row>
        </Col>
      </Card>
    </div>
  )
}

// ——— Ações da conversa: resolver / reabrir ———
export function ResolverAcoes({ duvidaId, resolvida }: { duvidaId: string; resolvida: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  function alternar(valor: boolean) {
    if (pending) return
    start(async () => { await marcarDuvidaResolvida(duvidaId, valor); router.refresh() })
  }
  return (
    <Row gap={8} style={{ marginTop: 4 }}>
      {resolvida ? (
        <Btn kind="secondary" size="sm" icon="check" onClick={() => alternar(false)}>{pending ? '…' : 'Marcada como resolvida — reabrir'}</Btn>
      ) : (
        <>
          <Btn kind="secondary" size="sm" icon="check" onClick={() => alternar(true)}>{pending ? '…' : 'Resolveu minha dúvida'}</Btn>
          <Btn kind="secondary" size="sm" onClick={() => alternar(false)}>Ainda tenho dúvida</Btn>
        </>
      )}
    </Row>
  )
}

// ——— Responder nesta conversa ———
export function ResponderBox({ duvidaId }: { duvidaId: string }) {
  const router = useRouter()
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pending, start] = useTransition()
  function enviar() {
    if (pending) return
    setErro(null)
    const t = texto.trim()
    if (!t) { setErro('Escreva uma mensagem.'); return }
    start(async () => {
      const r = await responderDuvida(duvidaId, t)
      if (!r.ok) { setErro(r.erro ?? 'Não foi possível enviar.'); return }
      setTexto(''); router.refresh()
    })
  }
  return (
    <Col gap={10}>
      <H3>Responder nesta conversa</H3>
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)}
        placeholder="Escreva um complemento ou uma nova pergunta sobre o mesmo tema" style={TA} />
      {erro && <Muted size={12.5}><span style={{ color: 'var(--danger)' }}>{erro}</span></Muted>}
      <Row style={{ justifyContent: 'flex-end' }}>
        <Btn kind="primary" icon="arrow" onClick={enviar}>{pending ? 'Enviando…' : 'Enviar'}</Btn>
      </Row>
    </Col>
  )
}
