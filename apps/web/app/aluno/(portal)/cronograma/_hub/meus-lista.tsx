'use client'
// Lista "Meus cronogramas" (Adaptativo + Revisão). Recebe os itens JÁ prontos do servidor (ordem,
// filtro, página e datas formatadas). Ações por ROTA DE API (nunca server action — domínio custom):
//  Adaptativo → /api/aluno/cronograma/adaptativo ; Revisão → /api/aluno/cronograma/emissoes.
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Card, Row, Col, Muted, Btn, Grid, IconBox, IBtn, Tag, Bar } from '@/components/nova/ui'
import type { ItemCronograma } from '@/lib/cronograma/meus'

const API_ADAPT = '/api/aluno/cronograma/adaptativo'
const API_REV = '/api/aluno/cronograma/emissoes'

async function post(url: string, body: Record<string, unknown>): Promise<{ ok?: boolean; message?: string; error?: string }> {
  try {
    const r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return await r.json()
  } catch {
    return { ok: false }
  }
}

export function MeusCronogramasLista({ itens }: { itens: ItemCronograma[] }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [erro, setErro] = React.useState<string | null>(null)

  const exec = async (id: string, fn: () => Promise<{ ok?: boolean; message?: string; error?: string }>, depois?: () => void) => {
    setBusy(id); setErro(null)
    const j = await fn()
    setBusy(null)
    if (j?.ok) { if (depois) depois(); else router.refresh() }
    else setErro(j?.message || j?.error || 'Não foi possível concluir. Tente novamente.')
  }

  const abrir = (i: ItemCronograma) => {
    try { window.dispatchEvent(new Event('navprogress:start')) } catch { /* ignore */ }
    if (i.tipo === 'adaptativo') {
      // Abrir um plano Adaptativo = fixá-lo (foco) e ir para a visualização.
      exec(i.id, () => post(API_ADAPT, { acao: 'fixar', planoId: i.id }), () => router.push(i.href))
    } else router.push(i.href)
  }
  const tornarPrincipal = (i: ItemCronograma) => exec(i.id, () => post(API_ADAPT, { acao: 'fixar', planoId: i.id }))
  const renomear = (i: ItemCronograma) => {
    const nome = window.prompt('Novo nome do cronograma:', i.titulo)
    if (nome == null) return
    exec(i.id, () => i.tipo === 'adaptativo'
      ? post(API_ADAPT, { acao: 'renomear', planoId: i.id, titulo: nome })
      : post(API_REV, { acao: 'renomear', id: i.id, titulo: nome }))
  }
  const arquivar = (i: ItemCronograma) => {
    if (!window.confirm(`Arquivar o cronograma "${i.titulo}"? Ele sai da lista.`)) return
    exec(i.id, () => i.tipo === 'adaptativo'
      ? post(API_ADAPT, { acao: 'arquivar', planoId: i.id, arquivar: true })
      : post(API_REV, { acao: 'arquivar', id: i.id, arquivar: true }))
  }

  return (
    <Col gap={12}>
      {erro ? <div role="alert" style={{ fontSize: 13, color: 'var(--ink)', padding: '9px 12px', borderRadius: 12, background: 'color-mix(in srgb, var(--danger, #c0392b) 12%, transparent)' }}>{erro}</div> : null}
      <Grid min={320} gap={14}>
        {itens.map((i) => {
          const pend = busy === i.id
          const principal = !!i.fixado
          return (
            <Card key={`${i.tipo}-${i.id}`} pad={0} style={{ position: 'relative', gap: 0, overflow: 'hidden', border: principal ? '1.5px solid var(--brand)' : '1px solid var(--line)' }}>
              {principal ? <div style={{ height: 4, background: 'var(--brand)' }} /> : null}
              <Col gap={12} style={{ padding: 16 }}>
                <Row gap={11} style={{ minWidth: 0, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                  <IconBox icon="cal" s={42} fg={principal ? 'var(--brand)' : 'var(--muted)'} />
                  <Col gap={4} style={{ minWidth: 0, flex: 1 }}>
                    <b style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={i.titulo}>{i.titulo}</b>
                    <Row gap={6}>
                      <Tag kind={i.tipo === 'adaptativo' ? 'brand' : 'gray'}>{i.tipo === 'adaptativo' ? 'Adaptativo' : 'Revisão'}</Tag>
                      {principal ? <Tag kind="gold" icon="tack">Principal</Tag> : null}
                    </Row>
                  </Col>
                </Row>
                <Muted size={12}>
                  Criado em {i.criadoEmFmt}{i.atualizadoEmFmt && i.atualizadoEmFmt !== i.criadoEmFmt ? ` · atualizado em ${i.atualizadoEmFmt}` : ''}
                </Muted>
                {typeof i.progresso === 'number' ? (
                  <Col gap={4}>
                    <Row style={{ justifyContent: 'space-between' }}><Muted size={12}>Progresso</Muted><b style={{ fontSize: 12, color: 'var(--ink)' }}>{i.progresso}%</b></Row>
                    <Bar pct={i.progresso} />
                  </Col>
                ) : null}
                <Row style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <Btn kind="primary" size="sm" icon="cal" style={{ background: 'var(--brand)' }} onClick={() => abrir(i)}>{pend ? 'Abrindo…' : 'Abrir'}</Btn>
                  <Row gap={6}>
                    {i.tipo === 'adaptativo' && !principal ? <IBtn icon="tack" label="Tornar principal" size={34} onClick={() => tornarPrincipal(i)} /> : null}
                    <IBtn icon="pen" label="Renomear" size={34} onClick={() => renomear(i)} />
                    <IBtn icon="trash" label="Arquivar" size={34} onClick={() => arquivar(i)} />
                  </Row>
                </Row>
              </Col>
            </Card>
          )
        })}
      </Grid>
    </Col>
  )
}

