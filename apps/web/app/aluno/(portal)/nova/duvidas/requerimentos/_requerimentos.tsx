'use client'
// Formulário de NOVO requerimento (client). Liga à server action criarRequerimento.
// Tipos reais em TIPOS_REQUERIMENTO. Inputs controlados replicando o visual dos primitivos
// Textarea/Field (não editamos os compartilhados). Sem libs novas, sem window.alert.
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, H2, P, Row, Btn, Aviso } from '@/components/nova/ui'
import { TIPOS_REQUERIMENTO } from '@/lib/requerimentos/tipos'
import { criarRequerimento } from '../actions'

export function NovoRequerimento() {
  const router = useRouter()
  const [tipo, setTipo] = useState<string>(TIPOS_REQUERIMENTO[0])
  const [descricao, setDescricao] = useState('')
  const [contexto, setContexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [protocolo, setProtocolo] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function enviar() {
    setErro(null)
    setProtocolo(null)
    if (!descricao.trim()) {
      setErro('Descreva o pedido antes de enviar.')
      return
    }
    start(async () => {
      const r = await criarRequerimento({
        tipo,
        descricao: descricao.trim(),
        contexto: contexto.trim() || null,
      })
      if (r.ok) {
        setProtocolo(r.protocolo ?? null)
        setDescricao('')
        setContexto('')
        router.refresh()
      } else {
        setErro(r.erro ?? 'Não foi possível abrir o requerimento. Tente novamente.')
      }
    })
  }

  return (
    <Card pad={24}>
      <H2>Novo requerimento</H2>
      <P>Escolha o tipo e conte o que você precisa. Você recebe um protocolo e acompanha a resposta por aqui.</P>

      {protocolo ? (
        <Aviso icon="check" action={<Btn kind="link" onClick={() => setProtocolo(null)}>Abrir outro</Btn>}>
          Requerimento aberto! Seu protocolo é <b>{protocolo}</b>. Acompanhe a resposta em “Meus requerimentos”.
        </Aviso>
      ) : null}

      {/* seleção de tipo (radios reais, selecionável) */}
      <div role="radiogroup" aria-label="Tipo de requerimento" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
        {TIPOS_REQUERIMENTO.map((t, i) => {
          const on = t === tipo
          const ultimo = i === TIPOS_REQUERIMENTO.length - 1
          return (
            <label
              key={t}
              style={{ gridColumn: ultimo ? '1 / -1' : 'auto', display: 'flex', alignItems: 'center', gap: 10, height: 52, padding: '0 16px', borderRadius: 13, border: `1px solid ${on ? 'var(--brand)' : 'var(--line)'}`, background: on ? 'var(--chip)' : 'var(--surface)', cursor: 'pointer' }}
            >
              <input
                type="radio"
                name="tipo-requerimento"
                checked={on}
                onChange={() => setTipo(t)}
                style={{ accentColor: 'var(--brand)', width: 16, height: 16 }}
              />
              <span style={{ fontSize: 14, fontWeight: on ? 800 : 700, color: 'var(--ink)' }}>{t}</span>
            </label>
          )
        })}
      </div>

      {/* contexto opcional (curso / turma / período) — estilo do primitivo Field */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
        Curso, turma ou período <span style={{ fontWeight: 600, color: 'var(--muted)' }}>(opcional)</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, height: 46, padding: '0 14px', borderRadius: 13, border: '1px solid var(--line)', background: 'var(--surface)' }}>
          <input
            type="text"
            value={contexto}
            onChange={(e) => setContexto(e.target.value)}
            placeholder="Ex.: Extensivo Advocacia Pública · Turma 2026"
            style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', font: 'inherit', fontSize: 14, color: 'var(--ink)' }}
          />
        </span>
      </label>

      {/* descrição — estilo do primitivo Textarea */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
        Descrição
        <textarea
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Descreva o pedido: curso, turma, período ou o que mais ajudar"
          style={{ width: '100%', height: 110, resize: 'vertical', padding: '12px 14px', borderRadius: 13, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', font: 'inherit', fontSize: 14, lineHeight: 1.5, boxSizing: 'border-box' }}
        />
      </label>

      {erro ? <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)' }}>{erro}</span> : null}

      <Row>
        <Btn kind="primary" icon="arrow" type="button" onClick={enviar} style={pending ? { opacity: 0.6, pointerEvents: 'none' } : undefined}>
          {pending ? 'Enviando…' : 'Enviar requerimento'}
        </Btn>
      </Row>
    </Card>
  )
}
