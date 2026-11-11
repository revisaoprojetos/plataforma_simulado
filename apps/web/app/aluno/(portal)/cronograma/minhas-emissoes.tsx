'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Card, Col, Muted, Row, IBtn, IconBox, Tag } from '@/components/nova/ui'
import { Icon } from '@/components/nova/icons'
import { fmtBr } from '@/lib/cronograma/datas'
import type { EmissaoResumo, PaginaEmissoes } from './emissoes-actions-tipos'

const POR_PAGINA = 20

type Ordem = 'recentes' | 'antigos' | 'nome'

const CAMPO: React.CSSProperties = {
  height: 42,
  borderRadius: 12,
  border: '1px solid var(--line)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  padding: '0 12px',
  fontSize: 13.5,
  minWidth: 0,
}

/** Instante da geração — timestamptz, então vale o fuso do aluno (não é data civil do plano). */
function geradoEm(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

/**
 * "9 Matérias Essenciais (4 horas)" → { carga: '4h', nome: '9 Matérias Essenciais' }.
 * Nome fora do padrão fica inteiro, sem etiqueta — melhor sem do que com adivinhação.
 */
function separarCarga(nome: string): { carga: string | null; nome: string } {
  const m = /^(.*?)\s*\((\d+(?:[.,]\d+)?)\s*horas?\)\s*$/i.exec(nome)
  if (!m) return { carga: null, nome }
  return { carga: `${m[2].replace(',', '.')}h`, nome: m[1].trim() }
}

/** Busca/paginação por ROTA DE API (server action é rejeitada em domínio custom / iframe Curseduca). */
async function buscarPagina(corpo: { busca: string; pagina: number; porPagina: number; arquivadas: boolean }): Promise<{ ok: boolean; dados?: PaginaEmissoes; error?: string }> {
  try {
    const res = await fetch('/api/aluno/cronograma/minhas', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    })
    const j = await res.json().catch(() => null)
    return j && typeof j.ok === 'boolean' ? j : { ok: false, error: 'Não foi possível carregar.' }
  } catch {
    return { ok: false, error: 'Sem conexão. Tente de novo.' }
  }
}

/**
 * "Meus cronogramas": o que o aluno já gerou, para reabrir. Busca, filtro (ativos/arquivados) e ordenação;
 * busca e paginação acontecem no BANCO (a ordenação reordena apenas a página carregada).
 * A aba de arquivados é a única porta para "Restaurar" — sem ela arquivar seria um caminho sem volta.
 */
export function MinhasEmissoes({ inicial }: { inicial: PaginaEmissoes }) {
  const [dados, setDados] = useState<PaginaEmissoes>(inicial)
  const [aba, setAba] = useState<'ativas' | 'arquivadas'>(inicial.ativas > 0 ? 'ativas' : 'arquivadas')
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('recentes')
  const [pagina, setPagina] = useState(0)
  const [carregando, setCarregando] = useState(false)
  const primeira = useRef(true)

  // Espera entre teclas e descarte de resposta fora de ordem.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requisicao = useRef(0)

  useEffect(() => {
    // A primeira renderização já veio do servidor — refazer a consulta aqui seria uma ida à toa.
    if (primeira.current) {
      primeira.current = false
      return
    }
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      const id = ++requisicao.current
      setCarregando(true)
      const r = await buscarPagina({ busca, pagina, porPagina: POR_PAGINA, arquivadas: aba === 'arquivadas' })
      if (id !== requisicao.current) return
      setCarregando(false)
      if (!r.ok || !r.dados) {
        toast.error(r.error ?? 'Não foi possível carregar.')
        return
      }
      setDados(r.dados)
    }, 250)
    return () => {
      if (debounce.current) clearTimeout(debounce.current)
    }
  }, [busca, pagina, aba])

  const ultimaPagina = Math.max(0, Math.ceil(dados.total / POR_PAGINA) - 1)

  function trocarAba(nova: 'ativas' | 'arquivadas') {
    setAba(nova)
    setPagina(0)
  }

  const itens = [...dados.itens].sort((a, b) => {
    if (ordem === 'nome') return (a.titulo || a.cronograma_nome).localeCompare(b.titulo || b.cronograma_nome, 'pt-BR')
    const d = new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime()
    return ordem === 'antigos' ? d : -d
  })

  return (
    <Col gap={14} style={{ width: '100%' }}>
      {/* Abas sublinhadas */}
      <div role="tablist" style={{ display: 'flex', gap: 22, borderBottom: '1px solid var(--line)', overflowX: 'auto' }}>
        {(
          [
            ['ativas', `Ativos (${dados.ativas})`],
            ['arquivadas', `Arquivados (${dados.arquivadas})`],
          ] as const
        ).map(([chave, rotulo]) => (
          <button
            key={chave}
            role="tab"
            aria-selected={aba === chave}
            onClick={() => trocarAba(chave)}
            className="border-b-2"
            style={{
              padding: '10px 2px',
              marginBottom: -1,
              fontSize: 14,
              fontWeight: 800,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              background: 'transparent',
              color: aba === chave ? 'var(--brand)' : 'var(--muted)',
              borderColor: aba === chave ? 'var(--brand)' : 'transparent',
            }}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {/* Busca + ordenação */}
      <Row gap={8} style={{ flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 0 }}>
          <span style={{ position: 'absolute', left: 12, top: 13, color: 'var(--muted)', pointerEvents: 'none' }}>
            <Icon n="search" size={16} />
          </span>
          <input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value)
              setPagina(0)
            }}
            placeholder="Buscar pelo nome que você deu ou pelo cronograma"
            aria-label="Buscar cronograma"
            style={{ ...CAMPO, width: '100%', paddingLeft: 36 }}
          />
        </div>
        <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} aria-label="Ordenar" style={CAMPO}>
          <option value="recentes">Mais recentes</option>
          <option value="antigos">Mais antigos</option>
          <option value="nome">Nome (A–Z)</option>
        </select>
        {carregando ? <Muted size={12}>Carregando…</Muted> : null}
      </Row>

      {itens.length === 0 ? (
        <Card pad={28} style={{ alignItems: 'center', textAlign: 'center' }}>
          <Muted>
            {busca.trim()
              ? 'Nenhum cronograma com esse nome.'
              : aba === 'ativas'
                ? 'Nenhum cronograma ativo — seus arquivados continuam na outra aba.'
                : 'Nenhum cronograma arquivado.'}
          </Muted>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: 14 }}>
          {itens.map((e: EmissaoResumo) => {
            const inicio = e.formulario?.inicio as string | undefined
            const semDatas = !!e.formulario?.semDatas
            const { carga, nome } = separarCarga(e.cronograma_nome)
            const semanas = e.resumo?.semanasConteudo ?? e.resumo?.totalSemanas
            const revisoes = e.resumo?.semanasRevisao ?? 0
            const apoio = [
              e.titulo ? nome : null,
              inicio && !semDatas ? `começa ${fmtBr(inicio)}` : null,
              semanas ? `${semanas} semanas${revisoes ? ` + ${revisoes} rev.` : ''}` : null,
            ].filter(Boolean)
            return (
              <Link key={e.id} href={`/aluno/cronograma/${e.id}`} style={{ display: 'flex', textDecoration: 'none' }}>
                <Card pad={16} style={{ width: '100%', gap: 10, opacity: e.arquivada ? 0.8 : 1 }}>
                  <Row gap={11} style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                    <IconBox icon="cal" s={42} fg="var(--brand)" />
                    <Col gap={4} style={{ minWidth: 0, flex: 1 }}>
                      <b
                        title={e.titulo || nome}
                        style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {e.titulo || nome}
                      </b>
                      <Row gap={6}>
                        {carga ? <Tag kind="brand">{carga}</Tag> : null}
                        {e.arquivada ? <Tag kind="gray" icon="lock">Arquivado</Tag> : null}
                      </Row>
                    </Col>
                  </Row>
                  {apoio.length ? <Muted size={12.5}>{apoio.join(' · ')}</Muted> : null}
                  <Muted size={12}>Gerado em {geradoEm(e.criado_em)}</Muted>
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      {dados.total > POR_PAGINA && (
        <Row style={{ justifyContent: 'space-between' }}>
          <Muted size={12.5}>
            {(pagina * POR_PAGINA + 1).toLocaleString('pt-BR')}–{Math.min((pagina + 1) * POR_PAGINA, dados.total).toLocaleString('pt-BR')} de{' '}
            {dados.total.toLocaleString('pt-BR')}
          </Muted>
          <Row gap={6}>
            <IBtn icon="back" label="Página anterior" size={36} onClick={() => pagina > 0 && !carregando && setPagina((p) => Math.max(0, p - 1))} />
            <IBtn icon="chev" label="Próxima página" size={36} onClick={() => pagina < ultimaPagina && !carregando && setPagina((p) => Math.min(ultimaPagina, p + 1))} />
          </Row>
        </Row>
      )}
    </Col>
  )
}

