'use client'

// BARRA HORIZONTAL de filtros do Banco de Questões do ADMIN (um botão por filtro, quebra de linha, lista como painel flutuante;
// multi-seleção, número de questões à esquerda, "Aplicar N", "Limpar"), reusando MultiFiltro/ArvoreAssuntos (components/filtros/multi-filtro).
// O rascunho NÃO filtra a lista: só "Aplicar". A contagem por opção e o total vêm do SERVIDOR (rota questoes-facetas, debounce 250 ms).

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ArvoreAssuntos, BarraFiltrosHorizontal, CampoFiltro, EscopoFiltroAdmin, MultiFiltro, type OpcaoMulti } from '@/components/filtros/multi-filtro'
import { juntarLista, lerLista } from '@/lib/aluno/filtros-multi'
import { paramsDeEstadoQ, type EstadoQ, type OpcoesQ } from '@/lib/admin-revisao/biblioteca-questoes-tipos'

/** Campos do EstadoQ que o card edita (todos "a|b" multi-valor). */
export const CAMPOS_CARD = ['disc', 'ass', 'det', 'banca', 'orgao', 'cargo', 'ano', 'dif', 'status', 'tipo', 'etq'] as const
export type CampoCard = (typeof CAMPOS_CARD)[number]
export type RascunhoCard = Record<CampoCard, string>

export const STATUS_OPC: OpcaoMulti[] = [{ v: 'publicada', label: 'Publicada' }, { v: 'rascunho', label: 'Rascunho' }, { v: 'arquivada', label: 'Arquivada' }]
export const DIF_OPC: OpcaoMulti[] = [{ v: 'facil', label: 'Fácil' }, { v: 'medio', label: 'Médio' }, { v: 'dificil', label: 'Difícil' }]
export const TIPO_OPC: OpcaoMulti[] = [{ v: 'objetiva', label: 'Objetiva' }, { v: 'discursiva', label: 'Discursiva' }]
const ROT: Record<CampoCard, string> = { disc: 'Disciplina', ass: 'Assunto', det: 'Tópico', banca: 'Banca', orgao: 'Órgão', cargo: 'Cargo', ano: 'Ano', dif: 'Dificuldade', status: 'Status', tipo: 'Tipo', etq: 'Etiqueta' }

export const rascunhoDe = (st: EstadoQ): RascunhoCard => ({ disc: st.disc, ass: st.ass, det: st.det, banca: st.banca, orgao: st.orgao, cargo: st.cargo, ano: st.ano, dif: st.dif, status: st.status, tipo: st.tipo, etq: st.etq })
export const VAZIO_CARD: RascunhoCard = { disc: '', ass: '', det: '', banca: '', orgao: '', cargo: '', ano: '', dif: '', status: '', tipo: '', etq: '' }

/** Um chip por valor aplicado (remover tira só aquele valor). Pura: usada pela barra da tabela. */
export function chipsDoEstado(st: EstadoQ, opcoes: OpcoesQ | null): { campo: CampoCard; valor: string; label: string }[] {
  const nome = (arr: { id: string; nome: string }[] | undefined, id: string) => arr?.find((x) => x.id === id)?.nome
  const rot: Record<CampoCard, (v: string) => string> = {
    disc: (v) => nome(opcoes?.disciplinas, v) ?? 'Disciplina', ass: (v) => nome(opcoes?.assuntos, v) ?? 'Assunto', det: (v) => v,
    banca: (v) => nome(opcoes?.bancas, v) ?? 'Banca', orgao: (v) => nome(opcoes?.orgaos, v) ?? 'Órgão', cargo: (v) => v, ano: (v) => v,
    dif: (v) => DIF_OPC.find((o) => o.v === v)?.label ?? v, status: (v) => STATUS_OPC.find((o) => o.v === v)?.label ?? v,
    tipo: (v) => TIPO_OPC.find((o) => o.v === v)?.label ?? v, etq: (v) => nome(opcoes?.etiquetas, v) ?? 'Etiqueta',
  }
  const out: { campo: CampoCard; valor: string; label: string }[] = []
  for (const c of CAMPOS_CARD) for (const v of lerLista(st[c])) out.push({ campo: c, valor: v, label: `${ROT[c]}: ${rot[c](v)}` })
  return out
}

type Fac = { total: number; contagens: Record<string, Record<string, number>> }

export function PainelFiltrosQuestoesAdmin({ st, opcoes, onAplicar }: {
  /** estado aplicado COMPLETO (visão/nó/busca entram nas facetas; só os campos do card são editados aqui). Monte o componente só quando a barra estiver visível. */
  st: EstadoQ; opcoes: OpcoesQ | null
  onAplicar: (patch: RascunhoCard) => void
}) {
  const [r, setR] = useState<RascunhoCard>(rascunhoDe(st))
  const [painel, setPainel] = useState<string | null>(null)
  const [fac, setFac] = useState<Fac | null>(null)
  const [contando, setContando] = useState(false)
  const aplicadoKey = JSON.stringify(rascunhoDe(st))
  useEffect(() => { setR(rascunhoDe(st)) }, [aplicadoKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const rKey = JSON.stringify([r, st.vis, st.no, st.agrupar, st.q])
  useEffect(() => {
    const ac = new AbortController()
    setContando(true)
    const t = setTimeout(async () => {
      try {
        const p = paramsDeEstadoQ({ ...st, ...r, page: 1 })
        const res = await fetch(`/api/admin/revisao/biblioteca/questoes-facetas?${p}`, { signal: ac.signal, cache: 'no-store' })
        const j = await res.json()
        if (j?.ok) setFac({ total: j.total, contagens: j.contagens })
      } catch { /* abortado/offline: mantém o último valor */ }
      if (!ac.signal.aborted) setContando(false)
    }, 250)
    return () => { clearTimeout(t); ac.abort() }
  }, [rKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: CampoCard) => (v: string[]) => setR((p) => ({ ...p, [k]: juntarLista(v) ?? '' }))
  const tp = (k: string) => () => setPainel((a) => (a === k ? null : k))
  const discSel = lerLista(r.disc)
  const assuntos = useMemo(() => {
    const todos = opcoes?.assuntos ?? []
    return (discSel.length ? todos.filter((a) => a.disciplina_id && discSel.includes(a.disciplina_id)) : todos).map((a) => ({ id: a.id, nome: a.nome, pai_id: a.pai_id }))
  }, [opcoes?.assuntos, r.disc]) // eslint-disable-line react-hooks/exhaustive-deps
  const detalhes = useMemo(() => { const ids = new Set(assuntos.map((a) => a.id)); return (opcoes?.detalhes ?? []).filter((d) => ids.has(d.assunto_id)) }, [assuntos, opcoes?.detalhes])
  const opt = (arr: { id: string; nome: string }[] | undefined): OpcaoMulti[] => (arr ?? []).map((x) => ({ v: x.id, label: x.nome }))
  const total = fac?.total
  const dirty = JSON.stringify(r) !== aplicadoKey
  const algo = CAMPOS_CARD.some((c) => r[c])
  const C = fac?.contagens
  const bloco = (rotulo: string, filho: React.ReactNode) => <CampoFiltro label={rotulo}>{filho}</CampoFiltro>

  return (
    <EscopoFiltroAdmin className="rounded-xl border bg-card p-3">
      <BarraFiltrosHorizontal>
        {bloco('Disciplina', <MultiFiltro vazio="Todas" selecionados={lerLista(r.disc)} busca="Buscar disciplina…" contagens={C?.disciplina} aberto={painel === 'disc'} onToggle={tp('disc')} onChange={(v) => setR((p) => ({ ...p, disc: juntarLista(v) ?? '' }))} options={opt(opcoes?.disciplinas)} />)}
        {bloco('Assunto', <ArvoreAssuntos vazio="Todos" assuntos={assuntos} detalhes={detalhes} selAssuntos={lerLista(r.ass)} selDetalhes={lerLista(r.det)} contAssunto={C?.assunto} contDetalhe={C?.detalhe}
          onAssuntos={set('ass')} onDetalhes={set('det')} aberto={painel === 'ass'} onToggle={tp('ass')} />)}
        {bloco('Banca', <MultiFiltro vazio="Todas" selecionados={lerLista(r.banca)} busca="Buscar banca…" contagens={C?.banca} aberto={painel === 'banca'} onToggle={tp('banca')} onChange={set('banca')} options={opt(opcoes?.bancas)} />)}
        {bloco('Órgão', <MultiFiltro vazio="Todos" selecionados={lerLista(r.orgao)} busca="Buscar órgão…" contagens={C?.orgao} aberto={painel === 'orgao'} onToggle={tp('orgao')} onChange={set('orgao')} options={opt(opcoes?.orgaos)} />)}
        {(opcoes?.cargos?.length ?? 0) > 0 && bloco('Cargo', <MultiFiltro vazio="Todos" selecionados={lerLista(r.cargo)} busca="Buscar cargo…" contagens={C?.cargo} aberto={painel === 'cargo'} onToggle={tp('cargo')} onChange={set('cargo')} options={(opcoes?.cargos ?? []).map((c) => ({ v: c, label: c }))} />)}
        {bloco('Ano', <MultiFiltro vazio="Todos" selecionados={lerLista(r.ano)} contagens={C?.ano} aberto={painel === 'ano'} onToggle={tp('ano')} onChange={set('ano')} options={(opcoes?.anos ?? []).map((a) => ({ v: String(a), label: String(a) }))} />)}
        {bloco('Dificuldade', <MultiFiltro vazio="Todas" selecionados={lerLista(r.dif)} contagens={C?.dificuldade} aberto={painel === 'dif'} onToggle={tp('dif')} onChange={set('dif')} options={DIF_OPC} />)}
        {bloco('Status', <MultiFiltro vazio="Todos" selecionados={lerLista(r.status)} contagens={C?.status} aberto={painel === 'status'} onToggle={tp('status')} onChange={set('status')} options={STATUS_OPC} />)}
        {bloco('Tipo', <MultiFiltro vazio="Todos" selecionados={lerLista(r.tipo)} contagens={C?.tipo} aberto={painel === 'tipo'} onToggle={tp('tipo')} onChange={set('tipo')} options={TIPO_OPC} />)}
        {(opcoes?.etiquetas?.length ?? 0) > 0 && bloco('Etiqueta', <MultiFiltro vazio="Todas" selecionados={lerLista(r.etq)} busca="Buscar etiqueta…" contagens={C?.etiqueta} aberto={painel === 'etq'} onToggle={tp('etq')} onChange={set('etq')} options={opt(opcoes?.etiquetas)} />)}
        <div className="ml-auto flex shrink-0 items-end gap-2">
          <Button type="button" variant="ghost" disabled={!algo} onClick={() => setR(VAZIO_CARD)}>Limpar</Button>
          <Button type="button" onClick={() => { setPainel(null); onAplicar(r) }} disabled={!dirty && total === undefined}>
            {contando ? <Loader2 className="animate-spin" /> : <Search />}Aplicar {total === undefined ? '' : `${total.toLocaleString('pt-BR')} ${total === 1 ? 'questão' : 'questões'}`}
          </Button>
        </div>
      </BarraFiltrosHorizontal>
    </EscopoFiltroAdmin>
  )
}
