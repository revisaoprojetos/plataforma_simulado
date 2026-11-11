'use client'

import { useEffect, useState, useTransition, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarClock, FlaskConical, Loader2, Lock, Search, ShieldCheck, Unlock, UserPlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { CfgLiberacao } from '@/lib/cronograma/adaptativo/liberacao'
import type { SimulacaoAluno } from '@/app/admin/cronogramas/adaptativo/actions-tipos'
import { buscarAlunosLiberacao, salvarPainelLiberacao, simularAlunoLiberacao } from '@/app/admin/cronogramas/adaptativo/actions'
import { PaginacaoBib } from '../../../biblioteca/paginacao-bib'

// Painel de Liberação (Gerador): mesmas regras e MESMAS actions do Adaptativo · Liberação (salvarPainelLiberacao,
// simularAlunoLiberacao, buscarAlunosLiberacao). As exceções (grupos e alunos) viram tabela paginada no servidor com
// seleção + ações em massa; o rascunho da config vive aqui e só grava ao clicar em Salvar.

type AlunoRef = { id: string; nome: string; email: string | null }
export interface LinhaExc { id: string; nome: string; detalhe: string | null }
const PP = [10, 14, 25, 50, 100]
const fmt = (iso: string) => iso.split('-').reverse().join('/')

function Bloco({ titulo, desc, children }: { titulo: string; desc?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <h2 className="text-sm font-semibold">{titulo}</h2>
      {desc && <p className="mt-0.5 text-sm text-muted-foreground">{desc}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Opcao<T extends string>({ valor, atual, onChange, titulo, desc }: { valor: T; atual: T; onChange: (v: T) => void; titulo: string; desc: string }) {
  const on = valor === atual
  return (
    <button type="button" onClick={() => onChange(valor)}
      className={cn('flex w-full items-start gap-3 rounded-xl border p-2.5 text-left transition', on ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'hover:bg-muted/50')}>
      <span className={cn('mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border', on ? 'border-primary' : 'border-muted-foreground/40')}>{on && <span className="h-2 w-2 rounded-full bg-primary" />}</span>
      <span><span className="block text-sm font-medium">{titulo}</span><span className="block text-xs text-muted-foreground">{desc}</span></span>
    </button>
  )
}

/** Busca de alunos com debounce (nome ou e-mail), via a action existente. */
function BuscaAluno({ onEscolher, excluir, placeholder }: { onEscolher: (a: AlunoRef) => void; excluir: string[]; placeholder: string }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<AlunoRef[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return }
    let vivo = true; setBusy(true)
    const t = setTimeout(async () => { const r = await buscarAlunosLiberacao(q); if (vivo) { setRes(r); setBusy(false) } }, 250)
    return () => { vivo = false; clearTimeout(t) }
  }, [q])
  const lista = res.filter((a) => !excluir.includes(a.id))
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder}
        className="h-10 w-full rounded-lg border bg-background pl-9 pr-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      {busy && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      {q.trim().length >= 2 && !busy && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-popover shadow-lg">
          {lista.length ? lista.map((a) => (
            <button key={a.id} type="button" onClick={() => { onEscolher(a); setQ(''); setRes([]) }} className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted">
              <span className="font-medium">{a.nome}</span>{a.email && <span className="text-xs text-muted-foreground">{a.email}</span>}
            </button>
          )) : <p className="px-3 py-2 text-sm text-muted-foreground">Nenhum aluno encontrado.</p>}
        </div>
      )}
    </div>
  )
}

const MOTIVO: Record<string, string> = {
  desligado: 'Bloqueio desligado — tudo liberado.', excecao: 'Aluno (ou grupo dele) está nas exceções — tudo liberado.',
  testador: 'Testador global — tudo liberado.', 'sem-plano': 'Aluno ainda não montou o cronograma.',
}

export function LiberacaoPainel({ inicial, vis, topo, head, linhas, total, page, pp, vazio, podeEditar }: {
  inicial: { cfg: CfgLiberacao; hoje: string; conteudo: { aulas: number; legproc: number; materiais: number }; planos: number }
  vis: 'grupos' | 'alunos'
  /** abas internas + barra de busca/filtro (renderizadas no servidor) */
  topo: ReactNode
  head: ReactNode
  linhas: LinhaExc[]
  total: number; page: number; pp: number; vazio: string; podeEditar: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [navegando, nav] = useTransition()
  const [cfg, setCfg] = useState<CfgLiberacao>(inicial.cfg)
  const [novos, setNovos] = useState<AlunoRef[]>([]) // alunos adicionados no rascunho (ainda não estão na lista salva)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [salvando, setSalvando] = useState(false)
  const [teste, setTeste] = useState<{ aluno: AlunoRef; sim?: SimulacaoAluno; carregando: boolean; erro?: string } | null>(null)

  const limpo = (c: CfgLiberacao) => JSON.stringify({ ...c, atualizadoEm: null, atualizadoPor: null })
  const mudou = limpo(cfg) !== limpo(inicial.cfg)
  const set = <K extends keyof CfgLiberacao>(k: K, v: CfgLiberacao[K]) => setCfg((c) => ({ ...c, [k]: v }))
  const lista = vis === 'grupos' ? cfg.grupos : cfg.alunos
  const setLista = (l: string[]) => set(vis === 'grupos' ? 'grupos' : 'alunos', l)
  const isento = (id: string) => lista.includes(id)
  const totalMateriais = inicial.conteudo.aulas + inicial.conteudo.legproc + inicial.conteudo.materiais
  const todos = linhas.length > 0 && linhas.every((r) => sel.has(r.id))

  function ir(mudar: Record<string, string | undefined>) {
    const q = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(mudar)) { if (v) q.set(k, v); else q.delete(k) }
    nav(() => { router.push(`${pathname}?${q.toString()}`) })
  }
  const marcar = (id: string, v: boolean) => setSel((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n })
  const marcarPagina = (v: boolean) => setSel((s) => { const n = new Set(s); for (const r of linhas) { if (v) n.add(r.id); else n.delete(r.id) } return n })
  const tornarIsento = (ids: string[], v: boolean) => { setLista(v ? [...new Set([...lista, ...ids])] : lista.filter((x) => !ids.includes(x))); setSel(new Set()) }

  async function salvar() {
    setSalvando(true)
    const r = await salvarPainelLiberacao(cfg)
    setSalvando(false)
    if (!r.ok) { toast.error(r.error || 'Falha ao salvar.'); return }
    toast.success(cfg.ativo ? 'Liberação por data ATIVA — salva.' : 'Configuração salva (bloqueio desligado).')
    setNovos([]); setSel(new Set())
    router.refresh()
  }
  async function testar(a: AlunoRef) {
    setTeste({ aluno: a, carregando: true })
    const r = await simularAlunoLiberacao(a.id)
    setTeste({ aluno: a, carregando: false, sim: r.sim, erro: r.ok ? undefined : r.error })
  }

  const ed = podeEditar
  return (
    <div className="space-y-4">
      <section className={cn('flex flex-col gap-3 rounded-2xl border p-4 shadow-sm sm:flex-row sm:items-center', cfg.ativo ? 'border-primary/40 bg-primary/5' : 'bg-card')}>
        <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', cfg.ativo ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
          {cfg.ativo ? <Lock className="h-6 w-6" /> : <Unlock className="h-6 w-6" />}
        </div>
        <div className="flex-1">
          <p className="text-base font-semibold">{cfg.ativo ? 'Liberação por data ATIVA' : 'Bloqueio desligado'}</p>
          <p className="text-sm text-muted-foreground">{cfg.ativo ? 'Os alunos só abrem e baixam cada material do cronograma quando a meta chega no plano deles.' : 'Todos os materiais seguem as regras normais de acesso (sem liberação por data).'}</p>
          <p className="mt-1 text-xs text-muted-foreground">{totalMateriais.toLocaleString('pt-BR')} materiais controlados ({inicial.conteudo.aulas} aulas PDFull · {inicial.conteudo.materiais} PDFight/PDFlash · {inicial.conteudo.legproc} LegProc) · {inicial.planos.toLocaleString('pt-BR')} planos de cronograma</p>
        </div>
        <button type="button" role="switch" aria-checked={cfg.ativo} aria-label="Ligar ou desligar o bloqueio" disabled={!ed} onClick={() => set('ativo', !cfg.ativo)}
          className={cn('relative h-8 w-14 shrink-0 rounded-full transition disabled:opacity-50', cfg.ativo ? 'bg-primary' : 'bg-muted-foreground/30')}>
          <span className={cn('absolute top-1 h-6 w-6 rounded-full bg-background shadow transition-all', cfg.ativo ? 'left-7' : 'left-1')} />
        </button>
      </section>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <Bloco titulo="Quando liberar" desc="O material abre na data da meta no plano do aluno — ou alguns dias antes, se você quiser dar folga.">
          <label className="flex items-center gap-3 text-sm">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />Liberar
            <input type="number" min={0} max={60} value={cfg.diasAntes} disabled={!ed}
              onChange={(e) => set('diasAntes', Math.max(0, Math.min(60, Math.trunc(Number(e.target.value)) || 0)))}
              className="h-9 w-20 rounded-lg border bg-background px-2 text-center text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            dia(s) antes da meta
          </label>
          <p className="mt-2 text-xs text-muted-foreground">0 = só no dia da meta. Meta já concluída pelo aluno fica sempre liberada (para revisar). O download segue a mesma regra.</p>
        </Bloco>
        <Bloco titulo="Aluno sem cronograma" desc="Quem ainda não montou o cronograma adaptativo.">
          <div className="space-y-1.5">
            <Opcao valor="bloquear" atual={cfg.semPlano} onChange={(v) => ed && set('semPlano', v)} titulo="Bloquear os materiais do cronograma" desc="Ele precisa montar o cronograma para começar a liberar (recomendado no lançamento)." />
            <Opcao valor="liberar" atual={cfg.semPlano} onChange={(v) => ed && set('semPlano', v)} titulo="Liberar normalmente" desc="Sem cronograma, segue as regras normais de acesso da Biblioteca." />
          </div>
        </Bloco>
        <Bloco titulo="Material fora do plano do aluno" desc="Ex.: aula de uma disciplina que o aluno não escolheu no cronograma dele.">
          <div className="space-y-1.5">
            <Opcao valor="bloquear" atual={cfg.foraDoPlano} onChange={(v) => ed && set('foraDoPlano', v)} titulo="Bloquear" desc="Só abre o que está no plano dele." />
            <Opcao valor="liberar" atual={cfg.foraDoPlano} onChange={(v) => ed && set('foraDoPlano', v)} titulo="Liberar" desc="O que não está no plano segue as regras normais de acesso." />
          </div>
        </Bloco>
        <Bloco titulo="Testar um aluno" desc="Veja o que um aluno consegue abrir hoje com a configuração SALVA.">
          <BuscaAluno placeholder="Buscar aluno por nome ou e-mail…" excluir={[]} onEscolher={testar} />
          {teste && (
            <div className="mt-3 rounded-xl border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{teste.aluno.nome}</p>
              {teste.carregando ? <p className="mt-1 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Calculando…</p>
                : teste.erro ? <p className="mt-1 text-destructive">{teste.erro}</p>
                  : teste.sim && (
                    <>
                      <p className="mt-1"><span className="font-semibold text-emerald-600 dark:text-emerald-400">{teste.sim.liberados} liberados</span> · <span className="font-semibold text-amber-600 dark:text-amber-400">{teste.sim.bloqueados} bloqueados</span> de {teste.sim.total}</p>
                      {teste.sim.motivo && MOTIVO[teste.sim.motivo] ? <p className="mt-1 text-xs text-muted-foreground">{MOTIVO[teste.sim.motivo]}</p> : null}
                      {teste.sim.proximas.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-muted-foreground">Próximas liberações</p>
                          <ul className="mt-1 space-y-0.5">{teste.sim.proximas.map((p, i) => <li key={i} className="flex gap-2 text-xs"><span className="tabular-nums text-muted-foreground">{fmt(p.liberaEm)}</span><span className="truncate">{p.titulo}</span></li>)}</ul>
                        </div>
                      )}
                    </>
                  )}
            </div>
          )}
        </Bloco>
      </div>

      {/* Exceções — sem bloqueio: lista paginada no servidor */}
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <h2 className="text-sm font-semibold">Exceções — sem bloqueio</h2>
        <p className="mb-3 mt-0.5 text-sm text-muted-foreground">Alunos e grupos que continuam com tudo liberado (equipe, suporte, VIP…). Testadores globais já ficam livres. As alterações só valem depois de Salvar.</p>
        {topo}

        {vis === 'alunos' && ed && (
          <div className="mb-3 grid gap-2 lg:grid-cols-[minmax(0,26rem)_1fr] lg:items-start">
            <BuscaAluno placeholder="Adicionar aluno à exceção por nome ou e-mail…" excluir={cfg.alunos}
              onEscolher={(a) => { setNovos((l) => [...l, a]); set('alunos', [...cfg.alunos, a.id]) }} />
            {novos.filter((a) => cfg.alunos.includes(a.id)).length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1 text-xs text-muted-foreground"><UserPlus className="h-3.5 w-3.5" />A salvar:</span>
                {novos.filter((a) => cfg.alunos.includes(a.id)).map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 py-1 pl-3 pr-1.5 text-xs">{a.nome}
                    <button type="button" aria-label={`Remover ${a.nome}`} onClick={() => set('alunos', cfg.alunos.filter((x) => x !== a.id))} className="rounded-full p-0.5 hover:bg-muted"><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className={cn('rounded-2xl border bg-card p-2 transition-opacity', navegando && 'opacity-70')} aria-busy={navegando}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-9 px-3 py-2.5"><input type="checkbox" aria-label="Selecionar todos desta página" checked={todos} onChange={(e) => marcarPagina(e.target.checked)} className="h-4 w-4 cursor-pointer accent-[var(--primary)]" /></th>
                  {head}
                </tr>
              </thead>
              <tbody>
                {linhas.length === 0 && <tr><td colSpan={3} className="px-3 py-10 text-center text-muted-foreground">{vazio}</td></tr>}
                {linhas.map((r) => {
                  const on = isento(r.id)
                  return (
                    <tr key={r.id} className={cn('border-b last:border-0 hover:bg-muted/40', sel.has(r.id) && 'bg-primary/5')}>
                      <td className="px-3 py-1.5"><input type="checkbox" aria-label="Selecionar linha" checked={sel.has(r.id)} onChange={(e) => marcar(r.id, e.target.checked)} className="h-4 w-4 cursor-pointer accent-[var(--primary)]" /></td>
                      <td className="px-3 py-1.5"><b className="font-medium">{r.nome}</b>{r.detalhe && <small className="block text-muted-foreground">{r.detalhe}</small>}</td>
                      <td className="px-3 py-1.5">
                        <button type="button" disabled={!ed} onClick={() => tornarIsento([r.id], !on)}
                          className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition disabled:opacity-60', on ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground hover:bg-muted/70')}>
                          {on ? 'Sem bloqueio' : (vis === 'alunos' ? 'Será removido' : 'Com bloqueio')}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        <PaginacaoBib total={total} page={page} pp={pp} opcoesPP={PP} selecionados={sel.size} carregando={navegando}
          onPage={(p) => ir({ pag: p > 1 ? String(p) : undefined })} onPP={(n) => ir({ pps: String(n), pag: undefined })} />

        {ed && sel.size > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-card px-3 py-2" role="toolbar" aria-label="Ações em massa">
            <b className="mr-1 text-sm">{sel.size} {sel.size === 1 ? 'selecionado' : 'selecionados'}</b>
            <Button size="sm" variant="outline" onClick={() => tornarIsento([...sel], true)}>Deixar sem bloqueio</Button>
            <Button size="sm" variant="outline" onClick={() => tornarIsento([...sel], false)}>{vis === 'alunos' ? 'Remover da exceção' : 'Voltar a bloquear'}</Button>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSel(new Set())}><X />Limpar seleção</Button>
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">{cfg.grupos.length} grupo(s) e {cfg.alunos.length} aluno(s) na exceção (incluindo alterações ainda não salvas).</p>
      </section>

      <div className="sticky bottom-3 z-20 flex items-center gap-3 rounded-2xl border bg-card/95 px-4 py-2.5 shadow-lg backdrop-blur">
        <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="flex-1 text-xs text-muted-foreground">
          {mudou ? 'Há alterações não salvas.' : inicial.cfg.atualizadoEm ? `Salvo em ${new Date(inicial.cfg.atualizadoEm).toLocaleString('pt-BR')}.` : 'Ainda não configurado.'} Vale em até 1 minuto para os alunos.
        </p>
        <Button type="button" disabled={!ed || !mudou || salvando} onClick={salvar}>{salvando && <Loader2 className="animate-spin" />}Salvar</Button>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><FlaskConical className="h-3.5 w-3.5" />Hoje (Brasília): {fmt(inicial.hoje)}</p>
    </div>
  )
}
