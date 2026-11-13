'use client'
// Aba "Atualizações" do curso: pontos de versão PUBLICADOS dos materiais (data e hora de Brasília, rótulo, itens e
// link para o material). Dado vem de GET /api/aluno/atualizacoes (paginado no servidor; rota de API p/ domínio custom/iframe).
import * as React from 'react'
import { Tag } from '@/components/nova/ui'
import { R } from '@/lib/nova/rotas'
import { formatBrt } from '@/lib/brt'
import { NOME_TIPO_ATUALIZACAO } from '@/lib/admin-revisao/biblioteca-tipos'
import type { AtualizacaoAluno } from '@/lib/conteudo/atualizacoes-tipos'

const PP = 10

export default function AtualizacoesCurso({ cursoId, produtoId }: { cursoId?: string; produtoId?: string }) {
  const [rows, setRows] = React.useState<AtualizacaoAluno[]>([])
  const [total, setTotal] = React.useState(0)
  const [pagina, setPagina] = React.useState(0)
  const [carregando, setCarregando] = React.useState(true)
  const [erro, setErro] = React.useState<string | null>(null)

  const carregar = React.useCallback(async (pg: number) => {
    setCarregando(true)
    try {
      const qs = new URLSearchParams({ page: String(pg), pp: String(PP) })
      if (produtoId) qs.set('produtoId', produtoId); else if (cursoId) qs.set('cursoId', cursoId)
      const r = await fetch(`/api/aluno/atualizacoes?${qs}`, { credentials: 'same-origin' })
      if (!r.ok) throw new Error('falha')
      const j = (await r.json()) as { rows: AtualizacaoAluno[]; total: number }
      setRows((cur) => (pg === 1 ? j.rows : [...cur, ...j.rows])); setTotal(j.total); setPagina(pg); setErro(null)
    } catch { setErro('Não foi possível carregar as atualizações agora.') }
    finally { setCarregando(false) }
  }, [cursoId, produtoId])

  React.useEffect(() => { void carregar(1) }, [carregar])

  const caixa: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 28, textAlign: 'center', fontSize: 13, color: 'var(--muted)' }
  if (erro) return <div style={caixa}>{erro}</div>
  if (!carregando && rows.length === 0) return <div style={caixa}>Nenhuma atualização registrada para os materiais deste curso.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map((a) => (
        <div key={a.id} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 14.5, color: 'var(--ink)' }}>{a.rotulo ?? NOME_TIPO_ATUALIZACAO[a.tipo]}</b>
            <Tag kind="green">{NOME_TIPO_ATUALIZACAO[a.tipo]}</Tag>
            {a.produtoNome ? <Tag kind="red">{a.produtoNome}</Tag> : null}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{formatBrt(a.ocorridaEm)}</span>
          </div>
          <a href={R.painelLeitor(a.documentoId)} style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)' }}>{a.material}</a>
          {a.texto ? <span style={{ fontSize: 13, color: 'var(--ink)' }}>{a.texto}</span> : null}
          {a.itens.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {a.itens.map((it, k) => <li key={k} style={{ fontSize: 13, color: 'var(--muted)' }}>{it.texto}{it.local ? ` — ${it.local}` : ''}</li>)}
            </ul>
          )}
        </div>
      ))}
      {carregando && <div style={caixa}>Carregando…</div>}
      {!carregando && rows.length < total && (
        <button type="button" onClick={() => void carregar(pagina + 1)} style={{ alignSelf: 'center', height: 38, padding: '0 18px', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          Ver mais ({(total - rows.length).toLocaleString('pt-BR')})
        </button>
      )}
    </div>
  )
}
