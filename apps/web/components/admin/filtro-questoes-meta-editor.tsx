'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, RotateCcw, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MultiSelectLista, type OpcaoMulti } from '@/components/admin/multi-select-lista'
import { obterOpcoesQf, contarQuestoesQf, salvarFiltroQf } from '@/app/admin/cronogramas/adaptativo/qf-actions'
import { DIFICULDADES, filtroVazio, normalizarFiltro, type Dificuldade, type FiltroQuestoesMeta, type OpcoesQf } from '@/lib/cronograma/adaptativo/qf'

// Taxonomia carregada UMA vez e compartilhada por todas as aulas abertas na página (promessa em módulo).
let opcoesPromise: Promise<OpcoesQf | null> | null = null
function carregarOpcoes(): Promise<OpcoesQf | null> {
  if (!opcoesPromise) opcoesPromise = obterOpcoesQf().then((r) => (r.ok && r.opcoes ? r.opcoes : null)).catch(() => null)
  return opcoesPromise
}

/** Assuntos em ordem de árvore (pai → filhos), com recuo por nível. */
function arvoreAssuntos(assuntos: OpcoesQf['assuntos']): OpcaoMulti[] {
  const ids = new Set(assuntos.map((a) => a.id))
  const filhos = new Map<string | null, OpcoesQf['assuntos']>()
  for (const a of assuntos) {
    const pai = a.pai_id && ids.has(a.pai_id) ? a.pai_id : null
    ;(filhos.get(pai) ?? filhos.set(pai, []).get(pai)!).push(a)
  }
  const out: OpcaoMulti[] = []
  const visitar = (pai: string | null, nivel: number) => {
    for (const a of (filhos.get(pai) ?? []).sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'))) {
      out.push({ id: a.id, nome: a.nome, nivel }); visitar(a.id, nivel + 1)
    }
  }
  visitar(null, 0)
  return out
}

/**
 * Filtro de QUESTÕES DA PLATAFORMA de uma meta (aula) do Catálogo de metas. Salva na hora (tabela própria) —
 * independente do "Salvar catálogo". Mostra quantas questões elegíveis casam com o filtro.
 */
export function FiltroQuestoesMetaEditor({ aulaKey, inicial, onSalvo }: {
  aulaKey: string
  inicial: FiltroQuestoesMeta
  onSalvo: (f: FiltroQuestoesMeta) => void
}) {
  const [f, setF] = useState<FiltroQuestoesMeta>(inicial)
  const [opcoes, setOpcoes] = useState<OpcoesQf | null>(null)
  const [erroOpcoes, setErroOpcoes] = useState(false)
  const [total, setTotal] = useState<number | null>(null)
  const [contando, setContando] = useState(false)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { setF(inicial) }, [inicial])
  useEffect(() => { let vivo = true; carregarOpcoes().then((o) => { if (!vivo) return; if (o) setOpcoes(o); else setErroOpcoes(true) }); return () => { vivo = false } }, [])

  // Contagem (debounce) — só informativa; o servidor reaplica as mesmas regras do banco de questões do aluno.
  const chave = JSON.stringify(f)
  useEffect(() => {
    if (filtroVazio(f)) { setTotal(null); return }
    let vivo = true
    setContando(true)
    const t = setTimeout(async () => {
      const r = await contarQuestoesQf(f).catch(() => null)
      if (!vivo) return
      setContando(false)
      setTotal(r?.ok ? (r.total ?? 0) : null)
    }, 450)
    return () => { vivo = false; clearTimeout(t) }
  }, [chave]) // eslint-disable-line react-hooks/exhaustive-deps

  const disciplinas = useMemo<OpcaoMulti[]>(() => (opcoes?.disciplinas ?? []).map((d) => ({ id: d.id, nome: d.nome })), [opcoes])
  const bancas = useMemo<OpcaoMulti[]>(() => (opcoes?.bancas ?? []).map((d) => ({ id: d.id, nome: d.nome })), [opcoes])
  const orgaos = useMemo<OpcaoMulti[]>(() => (opcoes?.orgaos ?? []).map((d) => ({ id: d.id, nome: d.nome })), [opcoes])
  const anos = useMemo<OpcaoMulti[]>(() => (opcoes?.anos ?? []).map((a) => ({ id: String(a), nome: String(a) })), [opcoes])
  // Assuntos só das disciplinas escolhidas (evita uma lista de milhares sem contexto).
  const assuntos = useMemo<OpcaoMulti[]>(() => {
    if (!opcoes || !f.disc?.length) return []
    const d = new Set(f.disc)
    return arvoreAssuntos(opcoes.assuntos.filter((a) => a.disciplina_id && d.has(a.disciplina_id)))
  }, [opcoes, f.disc])

  const mudou = JSON.stringify(normalizarFiltro(f)) !== JSON.stringify(normalizarFiltro(inicial))
  const setDisc = (disc: string[]) => {
    // trocar as disciplinas descarta os assuntos que não pertencem mais a elas
    const validos = new Set((opcoes?.assuntos ?? []).filter((a) => a.disciplina_id && disc.includes(a.disciplina_id)).map((a) => a.id))
    setF((c) => ({ ...c, disc, ass: (c.ass ?? []).filter((id) => validos.has(id)) }))
  }
  const toggleDif = (d: Dificuldade) => setF((c) => ({ ...c, dif: c.dif?.includes(d) ? c.dif.filter((x) => x !== d) : [...(c.dif ?? []), d] }))

  async function salvar() {
    setSalvando(true)
    const r = await salvarFiltroQf(aulaKey, f)
    setSalvando(false)
    if (!r.ok) { toast.error(r.error || 'Falha ao salvar o filtro.'); return }
    toast.success(filtroVazio(r.filtro) ? 'Filtro removido — esta meta não oferece mais questões da plataforma.' : 'Filtro salvo. O aluno já vê o botão na meta.')
    onSalvo(r.filtro ?? {})
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Defina quais questões <strong className="text-foreground">do banco da plataforma</strong> aparecem para esta meta. O aluno ganha o botão
        “Fazer questões da plataforma” e resolve só as que casam com estes filtros (um assunto-pai inclui os assuntos filhos).
      </p>
      {erroOpcoes && <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">Não foi possível carregar as opções (disciplinas, bancas…). Recarregue a página.</p>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MultiSelectLista rotulo="Disciplinas" opcoes={disciplinas} valor={f.disc ?? []} onChange={setDisc} carregando={!opcoes} />
        <MultiSelectLista rotulo="Assuntos" opcoes={assuntos} valor={f.ass ?? []} onChange={(ass) => setF((c) => ({ ...c, ass }))}
          desabilitado={!f.disc?.length} dica="Escolha uma disciplina primeiro" vazioTexto="Sem assuntos nessas disciplinas" />
        <MultiSelectLista rotulo="Bancas" opcoes={bancas} valor={f.banca ?? []} onChange={(banca) => setF((c) => ({ ...c, banca }))} carregando={!opcoes} />
        <MultiSelectLista rotulo="Órgãos" opcoes={orgaos} valor={f.orgao ?? []} onChange={(orgao) => setF((c) => ({ ...c, orgao }))} carregando={!opcoes} />
        <MultiSelectLista rotulo="Anos" opcoes={anos} valor={(f.anos ?? []).map(String)} onChange={(v) => setF((c) => ({ ...c, anos: v.map(Number) }))} carregando={!opcoes} />
        <div>
          <span className="text-[11px] font-medium text-muted-foreground">Dificuldade</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {DIFICULDADES.map((d) => {
              const on = !!f.dif?.includes(d.v)
              return (
                <button key={d.v} type="button" onClick={() => toggleDif(d.v)} aria-pressed={on}
                  className={cn('h-8 rounded-md border px-3 text-sm transition', on ? 'border-primary bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:bg-muted')}>{d.rot}</button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t pt-3">
        <span className="flex items-center gap-1.5 text-sm">
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          {filtroVazio(f) ? <span className="text-muted-foreground">Sem filtro — a meta não oferece questões da plataforma.</span>
            : contando ? <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Contando…</span>
              : total == null ? <span className="text-muted-foreground">—</span>
                : total === 0 ? <span className="text-amber-600 dark:text-amber-400">Nenhuma questão elegível casa com esse filtro.</span>
                  : <span><b className="tabular-nums">{total.toLocaleString('pt-BR')}</b> <span className="text-muted-foreground">questões elegíveis</span></span>}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" disabled={salvando || filtroVazio(f)} onClick={() => setF({})} className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" />Limpar</button>
          <button type="button" disabled={!mudou || salvando} onClick={salvar} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Salvar filtro
          </button>
        </div>
      </div>
    </div>
  )
}
