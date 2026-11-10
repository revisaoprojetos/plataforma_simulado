'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Lock, Unlock, Users, UserPlus, Search, X, CalendarClock, ShieldCheck, Loader2, FlaskConical } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CfgLiberacao } from '@/lib/cronograma/adaptativo/liberacao'
import type { PainelLiberacao, SimulacaoAluno } from './actions-tipos'
import {salvarPainelLiberacao, buscarAlunosLiberacao, simularAlunoLiberacao} from './actions'

type AlunoRef = { id: string; nome: string; email: string | null }
const fmt = (iso: string) => iso.split('-').reverse().join('/')

function Bloco({ titulo, desc, children }: { titulo: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-4">
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
      <span className={cn('mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border', on ? 'border-primary' : 'border-muted-foreground/40')}>
        {on && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>
      <span><span className="block text-sm font-medium">{titulo}</span><span className="block text-xs text-muted-foreground">{desc}</span></span>
    </button>
  )
}

/** Busca de alunos com debounce (nome ou e-mail). */
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
        className="h-10 w-full rounded-lg border bg-background pl-9 pr-9 text-sm outline-none focus:ring-1 focus:ring-ring" />
      {busy && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      {q.trim().length >= 2 && !busy && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-popover shadow-lg">
          {lista.length ? lista.map((a) => (
            <button key={a.id} type="button" onClick={() => { onEscolher(a); setQ(''); setRes([]) }}
              className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted">
              <span className="font-medium">{a.nome}</span>{a.email && <span className="text-xs text-muted-foreground">{a.email}</span>}
            </button>
          )) : <p className="px-3 py-2 text-sm text-muted-foreground">Nenhum aluno encontrado.</p>}
        </div>
      )}
    </div>
  )
}

export function LiberacaoClient({ inicial }: { inicial: PainelLiberacao }) {
  const router = useRouter()
  const [cfg, setCfg] = useState<CfgLiberacao>(inicial.cfg)
  const [alunos, setAlunos] = useState<AlunoRef[]>(inicial.alunosExcecao)
  const [filtroGrupo, setFiltroGrupo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [teste, setTeste] = useState<{ aluno: AlunoRef; sim?: SimulacaoAluno; carregando: boolean; erro?: string } | null>(null)

  const salvoJson = JSON.stringify({ ...inicial.cfg, atualizadoEm: null, atualizadoPor: null })
  const mudou = JSON.stringify({ ...cfg, atualizadoEm: null, atualizadoPor: null }) !== salvoJson
  const set = <K extends keyof CfgLiberacao>(k: K, v: CfgLiberacao[K]) => setCfg((c) => ({ ...c, [k]: v }))
  const totalMateriais = inicial.conteudo.aulas + inicial.conteudo.legproc + inicial.conteudo.materiais
  const gruposFiltrados = useMemo(() => {
    const t = filtroGrupo.trim().toLowerCase()
    return inicial.grupos.filter((g) => !t || g.nome.toLowerCase().includes(t))
  }, [inicial.grupos, filtroGrupo])

  async function salvar(proximo?: CfgLiberacao) {
    const alvo = proximo ?? cfg
    setSalvando(true)
    const r = await salvarPainelLiberacao(alvo)
    setSalvando(false)
    if (!r.ok) { toast.error(r.error || 'Falha ao salvar.'); return }
    toast.success(alvo.ativo ? 'Liberação por data ATIVA — salva.' : 'Configuração salva (bloqueio desligado).')
    router.refresh()
  }

  async function testar(a: AlunoRef) {
    setTeste({ aluno: a, carregando: true })
    const r = await simularAlunoLiberacao(a.id)
    setTeste({ aluno: a, carregando: false, sim: r.sim, erro: r.ok ? undefined : r.error })
  }

  const motivoTxt: Record<string, string> = {
    desligado: 'Bloqueio desligado — tudo liberado.', excecao: 'Aluno (ou grupo dele) está nas exceções — tudo liberado.',
    testador: 'Testador global — tudo liberado.', 'sem-plano': 'Aluno ainda não montou o cronograma.',
    'nao-cronograma': '', concluida: '', data: '', 'fora-do-plano': '',
  }

  return (
    <div className="space-y-4">
      {/* CHAVE MESTRE */}
      <section className={cn('flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center', cfg.ativo ? 'border-primary/40 bg-primary/5' : 'bg-card')}>
        <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', cfg.ativo ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
          {cfg.ativo ? <Lock className="h-6 w-6" /> : <Unlock className="h-6 w-6" />}
        </div>
        <div className="flex-1">
          <p className="text-base font-semibold">{cfg.ativo ? 'Liberação por data ATIVA' : 'Bloqueio desligado'}</p>
          <p className="text-sm text-muted-foreground">
            {cfg.ativo
              ? 'Os alunos só abrem e baixam cada material do cronograma quando a meta chega no plano deles.'
              : 'Todos os materiais seguem as regras normais de acesso (sem liberação por data).'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {totalMateriais} materiais controlados ({inicial.conteudo.aulas} aulas PDFULL · {inicial.conteudo.materiais} PDFight/PDFlash · {inicial.conteudo.legproc} LegProc) · {inicial.alunosComPlano} alunos com cronograma
          </p>
        </div>
        <button type="button" role="switch" aria-checked={cfg.ativo} onClick={() => set('ativo', !cfg.ativo)}
          className={cn('relative h-8 w-14 shrink-0 rounded-full transition', cfg.ativo ? 'bg-primary' : 'bg-muted-foreground/30')}>
          <span className={cn('absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all', cfg.ativo ? 'left-7' : 'left-1')} />
        </button>
      </section>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <Bloco titulo="Quando liberar" desc="O material abre na data da meta no plano do aluno — ou alguns dias antes, se você quiser dar folga.">
          <label className="flex items-center gap-3 text-sm">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            Liberar
            <input type="number" min={0} max={60} value={cfg.diasAntes}
              onChange={(e) => set('diasAntes', Math.max(0, Math.min(60, Math.trunc(Number(e.target.value)) || 0)))}
              className="h-9 w-20 rounded-lg border bg-background px-2 text-center text-sm tabular-nums outline-none focus:ring-1 focus:ring-ring" />
            dia(s) antes da meta
          </label>
          <p className="mt-2 text-xs text-muted-foreground">
            0 = só no dia da meta. Meta já concluída pelo aluno fica sempre liberada (para revisar).
            O download segue a mesma regra: só do material já liberado.
          </p>
        </Bloco>

        <Bloco titulo="Aluno sem cronograma" desc="Quem ainda não montou o cronograma adaptativo.">
          <div className="space-y-1.5">
            <Opcao valor="bloquear" atual={cfg.semPlano} onChange={(v) => set('semPlano', v)} titulo="Bloquear os materiais do cronograma" desc="Ele precisa montar o cronograma para começar a liberar (recomendado no lançamento)." />
            <Opcao valor="liberar" atual={cfg.semPlano} onChange={(v) => set('semPlano', v)} titulo="Liberar normalmente" desc="Sem cronograma, segue as regras normais de acesso da Biblioteca." />
          </div>
        </Bloco>

        <Bloco titulo="Material fora do plano do aluno" desc="Ex.: aula de uma disciplina que o aluno não escolheu no cronograma dele.">
          <div className="space-y-1.5">
            <Opcao valor="bloquear" atual={cfg.foraDoPlano} onChange={(v) => set('foraDoPlano', v)} titulo="Bloquear" desc="Só abre o que está no plano dele." />
            <Opcao valor="liberar" atual={cfg.foraDoPlano} onChange={(v) => set('foraDoPlano', v)} titulo="Liberar" desc="O que não está no plano segue as regras normais de acesso." />
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
                      <p className="mt-1">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">{teste.sim.liberados} liberados</span> ·{' '}
                        <span className="font-semibold text-amber-600 dark:text-amber-400">{teste.sim.bloqueados} bloqueados</span> de {teste.sim.total}
                      </p>
                      {teste.sim.motivo && motivoTxt[teste.sim.motivo] ? <p className="mt-1 text-xs text-muted-foreground">{motivoTxt[teste.sim.motivo]}</p> : null}
                      {teste.sim.proximas.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-muted-foreground">Próximas liberações</p>
                          <ul className="mt-1 space-y-0.5">
                            {teste.sim.proximas.map((p, i) => <li key={i} className="flex gap-2 text-xs"><span className="tabular-nums text-muted-foreground">{fmt(p.liberaEm)}</span><span className="truncate">{p.titulo}</span></li>)}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
            </div>
          )}
        </Bloco>
      </div>

      <Bloco titulo="Exceções — sem bloqueio" desc="Alunos e grupos que continuam com tudo liberado (equipe, suporte, VIP…). Testadores globais já ficam livres.">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-medium"><UserPlus className="h-4 w-4" />Alunos</p>
            <BuscaAluno placeholder="Adicionar aluno por nome ou e-mail…" excluir={cfg.alunos}
              onEscolher={(a) => { setAlunos((l) => [...l, a]); set('alunos', [...cfg.alunos, a.id]) }} />
            <div className="mt-3 flex flex-wrap gap-2">
              {alunos.filter((a) => cfg.alunos.includes(a.id)).map((a) => (
                <span key={a.id} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 py-1 pl-3 pr-1.5 text-xs">
                  {a.nome}
                  <button type="button" aria-label={`Remover ${a.nome}`} onClick={() => set('alunos', cfg.alunos.filter((x) => x !== a.id))} className="rounded-full p-0.5 hover:bg-muted"><X className="h-3 w-3" /></button>
                </span>
              ))}
              {!cfg.alunos.length && <p className="text-xs text-muted-foreground">Nenhum aluno nas exceções.</p>}
            </div>
          </div>
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-medium"><Users className="h-4 w-4" />Grupos <span className="text-xs font-normal text-muted-foreground">({cfg.grupos.length} selecionado{cfg.grupos.length === 1 ? '' : 's'})</span></p>
            <input value={filtroGrupo} onChange={(e) => setFiltroGrupo(e.target.value)} placeholder="Filtrar grupos…"
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-1 focus:ring-ring" />
            <div className="mt-2 max-h-56 space-y-1 overflow-auto rounded-lg border p-1">
              {gruposFiltrados.map((g) => {
                const on = cfg.grupos.includes(g.id)
                return (
                  <label key={g.id} className={cn('flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm', on ? 'bg-primary/10' : 'hover:bg-muted')}>
                    <input type="checkbox" checked={on} onChange={() => set('grupos', on ? cfg.grupos.filter((x) => x !== g.id) : [...cfg.grupos, g.id])} />
                    {g.nome}
                  </label>
                )
              })}
              {!gruposFiltrados.length && <p className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum grupo.</p>}
            </div>
          </div>
        </div>
      </Bloco>

      {/* BARRA DE SALVAR — sticky dentro da coluna de conteúdo (não cruza a sidebar) */}
      <div className="sticky bottom-3 z-20 flex items-center gap-3 rounded-2xl border bg-card/95 px-4 py-2.5 shadow-lg backdrop-blur">
        <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="flex-1 text-xs text-muted-foreground">
          {mudou ? 'Há alterações não salvas.' : inicial.cfg.atualizadoEm ? `Salvo em ${new Date(inicial.cfg.atualizadoEm).toLocaleString('pt-BR')}.` : 'Ainda não configurado.'}
          {' '}Vale em até 1 minuto para os alunos.
        </p>
        <button type="button" disabled={!mudou || salvando} onClick={() => salvar()}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {salvando && <Loader2 className="h-4 w-4 animate-spin" />}Salvar
        </button>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><FlaskConical className="h-3.5 w-3.5" />Hoje (Brasília): {fmt(inicial.hoje)}</p>
    </div>
  )
}
