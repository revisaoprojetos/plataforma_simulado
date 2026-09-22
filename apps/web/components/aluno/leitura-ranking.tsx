'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Trophy, Sparkles, ArrowUpDown, MoreVertical, X, Loader2, Flame, Zap, BookCheck, Award, Search, Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatBrt } from '@/lib/brt'
import { AvatarEstudante } from '@/components/aluno/avatar-estudante'
import type { RankingLeitura, RankingLeituraItem } from '@/lib/leitura/ranking'
import { detalheRankingAluno, type DetalheRankingAluno } from '@/app/admin/leitura/actions'

const POR_PAG = 10
const iniciais = (n: string) => (n || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'
type Campo = 'posicao' | 'aulas' | 'sequencia' | 'acertos'

/**
 * Ranking do módulo LegProc. `modo='admin'` mostra nome + e-mail e leva ao perfil do aluno; `modo='aluno'`
 * mostra só as iniciais (sem e-mail/sem link). Ambos: fotos de perfil, ordenação (posição/aulas/acertos)
 * e paginação (10/pág).
 */
export function LeituraRanking({ ranking, meuId, meuNome, modo = 'aluno', moduloId }: { ranking: RankingLeitura; meuId?: string | null; meuNome?: string | null; modo?: 'admin' | 'aluno'; moduloId?: string }) {
  const { itens, gamAtivo } = ranking
  const rotulo = gamAtivo ? 'Pontos' : 'Acertos'
  const [campo, setCampo] = useState<Campo>('posicao')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')
  const [pagina, setPagina] = useState(1)
  const [busca, setBusca] = useState('')
  const [mostrarOcultos, setMostrarOcultos] = useState(true)
  const [detalhe, setDetalhe] = useState<RankingLeituraItem | null>(null)
  // Só o admin (com o módulo resolvido) abre o pop-up de detalhe do aluno.
  const expandir = modo === 'admin' && moduloId ? setDetalhe : undefined

  // Aluno NÃO vê contas de teste (ocultas); admin vê, marcadas. Ocultos nunca no pódio nem no "você".
  const reaisList = useMemo(() => itens.filter((i) => !i.oculto), [itens])
  const qtdOcultos = useMemo(() => itens.filter((i) => i.oculto).length, [itens])
  const temOcultos = modo === 'admin' && qtdOcultos > 0

  const ordenados = useMemo(() => {
    // Base: aluno só vê reais; admin alterna entre "com ocultos" e "só reais" pelo toggle.
    const base = modo === 'aluno' ? reaisList : mostrarOcultos ? itens : reaisList
    const q = busca.trim().toLowerCase()
    const filtrada = q
      ? base.filter((i) => i.nome.toLowerCase().includes(q) || (modo === 'admin' && (i.email ?? '').toLowerCase().includes(q)))
      : base
    const arr = filtrada.slice()
    arr.sort((a, b) => {
      // Ocultos (posição 0) sempre no fim quando ordena por posição.
      if (campo === 'posicao' && a.oculto !== b.oculto) return a.oculto ? 1 : -1
      const c = campo === 'posicao' ? a.posicao - b.posicao : campo === 'aulas' ? a.aulasConcluidas - b.aulasConcluidas : campo === 'sequencia' ? a.streakAtual - b.streakAtual : a.score - b.score
      return dir === 'asc' ? c : -c
    })
    return arr
  }, [itens, reaisList, modo, mostrarOcultos, busca, campo, dir])

  // Busca/toggle mudou → volta à 1ª página (evita ficar numa página que não existe mais).
  useEffect(() => { setPagina(1) }, [busca, mostrarOcultos])

  function ordenar(c: Campo) {
    if (campo === c) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setCampo(c); setDir(c === 'posicao' ? 'asc' : 'desc') }
    setPagina(1)
  }

  if (!itens.length) {
    return (
      <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">
        <Trophy className="mx-auto mb-2 h-8 w-8 opacity-40" />
        Ainda não há ranking neste módulo. {modo === 'admin' ? 'Os alunos precisam responder o quiz das aulas.' : 'Responda o quiz das aulas para pontuar.'}
      </div>
    )
  }

  const top3 = reaisList.slice(0, 3)
  const ordemPodio = [top3[1], top3[0], top3[2]].filter(Boolean) // 2º · 1º · 3º
  const medalha = ['#facc15', '#cbd5e1', '#f59e0b']

  const totalPag = Math.max(1, Math.ceil(ordenados.length / POR_PAG))
  const pag = Math.min(pagina, totalPag)
  const visiveis = ordenados.slice((pag - 1) * POR_PAG, pag * POR_PAG)

  const Th = ({ c, children, className }: { c: Campo; children: ReactNode; className?: string }) => (
    <th className={cn('px-3 py-2.5 font-medium', className)}>
      <button type="button" onClick={() => ordenar(c)} className="inline-flex items-center gap-1 hover:text-foreground">
        {children}<ArrowUpDown className={cn('h-3 w-3', campo === c ? 'text-primary' : 'text-muted-foreground/50')} />
      </button>
    </th>
  )

  return (
    <div className="space-y-4">
      {/* Pódio (top 3 por posição) */}
      {top3.length >= 3 && (
        <div className="grid grid-cols-3 items-end gap-3">
          {ordemPodio.map((it) => {
            const eu = !!meuId && it.estudanteId === meuId
            return (
              <div key={it.estudanteId} className={cn('flex flex-col items-center rounded-2xl border bg-card p-3 text-center shadow-sm', it.posicao === 1 ? 'pt-2' : 'pt-6', eu && 'border-primary/50 bg-primary/5')}>
                <span className="relative">
                  <AvatarEstudante nome={it.nome} avatar={it.avatar} cor={it.avatarCor ?? '#6d28d9'} className={cn('text-white ring-2 ring-offset-2 ring-offset-card', it.posicao === 1 ? 'h-14 w-14 text-base' : 'h-11 w-11 text-sm')} />
                  <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-black text-black shadow" style={{ background: medalha[it.posicao - 1] }}>{it.posicao}</span>
                </span>
                <span className="mt-2 line-clamp-1 text-sm font-semibold">{modo === 'aluno' ? (eu ? 'Você' : iniciais(it.nome)) : it.nome}</span>
                <span className="text-xs font-bold tabular-nums text-primary">{it.score} {rotulo.toLowerCase()}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Card "Você" (aluno) — comprido, fixo abaixo do pódio: acompanha o rank em TODAS as páginas.
          Aparece SEMPRE que há aluno logado; se ele ainda não pontuou (fora do ranking), mostra 0/0/0
          com posição "—" para ele saber que ainda não entrou. */}
      {modo === 'aluno' && meuId && (() => {
        const meuIt = reaisList.find((i) => i.estudanteId === meuId)
        const nome = meuIt?.nome ?? meuNome ?? 'Você'
        return (
          <div className="flex items-center gap-3 rounded-2xl border-2 border-primary/50 bg-primary/5 px-4 py-3 shadow-sm">
            <span className="flex h-8 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold tabular-nums text-primary-foreground">{meuIt ? meuIt.posicao : '—'}</span>
            <AvatarEstudante nome={nome} avatar={meuIt?.avatar ?? null} cor={meuIt?.avatarCor ?? '#6d28d9'} className="h-9 w-9 shrink-0 text-[11px] text-white" />
            <span className="min-w-0 flex-1 truncate">
              <span className="font-semibold text-primary">Você</span>
              {!meuIt && <span className="ml-2 text-xs font-normal text-muted-foreground">Faça uma aula para entrar no ranking</span>}
            </span>
            <div className="flex items-center gap-5 sm:gap-8">
              <span className="text-center"><span className="block font-bold leading-none tabular-nums">{meuIt?.aulasConcluidas ?? 0}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">aulas</span></span>
              <span className="text-center"><span className="inline-flex items-center gap-1 font-bold leading-none tabular-nums text-amber-600 dark:text-amber-400"><Flame className="h-3.5 w-3.5" />{meuIt?.streakAtual ?? 0}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">sequência</span></span>
              <span className="text-center"><span className="block font-bold leading-none tabular-nums text-primary">{meuIt?.score ?? 0}</span><span className="mt-0.5 block text-[10px] text-muted-foreground">{rotulo.toLowerCase()}</span></span>
            </div>
          </div>
        )
      })()}

      {/* Barra (SÓ admin): busca por nome/e-mail + toggle de contas de teste. O aluno não vê busca. */}
      {modo === 'admin' && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail…" className="h-9 pl-9" />
            {busca && (
              <button type="button" onClick={() => setBusca('')} aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
            )}
          </div>
          {temOcultos && (
            <button type="button" onClick={() => setMostrarOcultos((v) => !v)}
              className={cn('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors', mostrarOcultos ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'hover:bg-muted')}
              title={mostrarOcultos ? 'Esconder contas de teste da lista' : 'Mostrar contas de teste na lista'}>
              {mostrarOcultos ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              {mostrarOcultos ? 'Ocultar contas de teste' : `Mostrar contas de teste (${qtdOcultos})`}
            </button>
          )}
        </div>
      )}

      {/* Tabela — 10 por página, TODAS visíveis (sem rolagem interna; a página rola se precisar). */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted text-left text-muted-foreground">
            <tr>
              <Th c="posicao" className="w-14 text-center">#</Th>
              <th className="px-3 py-2.5 font-medium">Aluno</th>
              <Th c="aulas" className="w-24 text-center">Aulas</Th>
              <Th c="sequencia" className="w-28 text-center">Sequência</Th>
              <Th c="acertos" className="w-24 text-center">{rotulo}</Th>
              {/* Espaço à direita p/ trazer as colunas de número mais para o meio. */}
              <th className="w-6 sm:w-24" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-muted-foreground">Nenhum aluno encontrado{busca ? ` para “${busca}”` : ''}.</td></tr>
            ) : (
              visiveis.map((it) => <LinhaRanking key={it.estudanteId} it={it} eu={!!meuId && it.estudanteId === meuId} modo={modo} onExpand={expandir} />)
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalPag > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Página {pag} de {totalPag} · {ordenados.length} alunos</span>
          <div className="flex gap-1.5">
            <button onClick={() => setPagina(1)} disabled={pag <= 1} className="rounded-lg border px-2.5 py-1 hover:bg-muted disabled:opacity-40">Início</button>
            <button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pag <= 1} className="rounded-lg border px-2.5 py-1 hover:bg-muted disabled:opacity-40">Anterior</button>
            <button onClick={() => setPagina((p) => Math.min(totalPag, p + 1))} disabled={pag >= totalPag} className="rounded-lg border px-2.5 py-1 hover:bg-muted disabled:opacity-40">Próxima</button>
            <button onClick={() => setPagina(totalPag)} disabled={pag >= totalPag} className="rounded-lg border px-2.5 py-1 hover:bg-muted disabled:opacity-40">Final</button>
          </div>
        </div>
      )}

      {gamAtivo && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Sparkles className="h-3.5 w-3.5 text-amber-500" /> Pontuação da gamificação ativa — por aula concluída: leitura + quiz (mais acertos/combo, se configurados).</p>
      )}

      {detalhe && moduloId && <DetalheAlunoModal moduloId={moduloId} it={detalhe} onClose={() => setDetalhe(null)} />}
    </div>
  )
}

/** Pop-up com o detalhe do aluno: sequência (atual/maior), progresso e a lista de aulas (data + pontos). */
function DetalheAlunoModal({ moduloId, it, onClose }: { moduloId: string; it: RankingLeituraItem; onClose: () => void }) {
  const [d, setD] = useState<DetalheRankingAluno | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    detalheRankingAluno(moduloId, it.estudanteId).then((r) => { if (r.ok && r.detalhe) setD(r.detalhe); else setErro(r.error ?? 'Erro ao carregar.') }).catch(() => setErro('Erro ao carregar.'))
    return () => document.removeEventListener('keydown', onKey)
  }, [moduloId, it.estudanteId, onClose])

  const pctProg = d && d.totalAulas > 0 ? Math.round((d.aulasConcluidas / d.totalAulas) * 100) : 0
  const Stat = ({ icon: Icon, label, valor }: { icon: typeof Flame; label: string; valor: ReactNode }) => (
    <div className="rounded-xl border bg-muted/30 p-3 text-center">
      <Icon className="mx-auto mb-1 h-4 w-4 text-primary" />
      <div className="text-lg font-bold leading-none tabular-nums">{valor}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{label}</div>
    </div>
  )

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b p-4">
          <AvatarEstudante nome={it.nome} avatar={it.avatar} cor={it.avatarCor ?? '#6d28d9'} className="h-10 w-10 shrink-0 text-sm text-white" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold">{it.nome}</h3>
            {it.email && <p className="truncate text-xs text-muted-foreground">{it.email}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {erro ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{erro}</p>
          ) : !d ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <Stat icon={Zap} label="pontos" valor={d.pontosTotal.toLocaleString('pt-BR')} />
                <Stat icon={Flame} label="sequência atual" valor={`${d.streakAtual}d`} />
                <Stat icon={Award} label="maior sequência" valor={`${d.streakMaior}d`} />
                <Stat icon={BookCheck} label="aulas" valor={`${d.aulasConcluidas}/${d.totalAulas}`} />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground"><span>Progresso</span><span className="tabular-nums">{pctProg}%</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pctProg}%` }} /></div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Aulas feitas ({d.aulas.length})</p>
                {d.aulas.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Ainda não fez nenhuma aula.</p>
                ) : (
                  <ul className="divide-y rounded-xl border">
                    {d.aulas.map((a, i) => (
                      <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{a.titulo}</span>
                          <span className="block text-[11px] text-muted-foreground">{formatBrt(a.data) ?? '—'}</span>
                        </span>
                        <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary tabular-nums">+{a.pontos}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function LinhaRanking({ it, eu, modo, onExpand }: { it: RankingLeituraItem; eu: boolean; modo: 'admin' | 'aluno'; onExpand?: (it: RankingLeituraItem) => void }) {
  const avatar = <AvatarEstudante nome={it.nome} avatar={it.avatar} cor={it.avatarCor ?? '#6d28d9'} className="h-9 w-9 shrink-0 text-[11px] text-white" />
  const identidade = modo === 'admin' ? (
    <Link href={`/admin/estudantes/${it.estudanteId}`} className="flex min-w-0 items-center gap-2.5 hover:underline">
      {avatar}
      <span className="min-w-0">
        <span className="block truncate font-medium">{it.nome}</span>
        {it.email && <span className="block truncate text-xs text-muted-foreground">{it.email}</span>}
      </span>
    </Link>
  ) : (
    <div className="flex min-w-0 items-center gap-2.5">
      {avatar}
      <span className={cn('truncate font-medium', eu && 'text-primary')}>{eu ? 'Você' : iniciais(it.nome)}</span>
    </div>
  )
  return (
    <tr className={cn('border-b last:border-0', it.oculto ? 'bg-muted/20 opacity-70' : eu ? 'bg-primary/5' : 'hover:bg-muted/30')}>
      <td className="px-3 py-2.5 text-center font-bold tabular-nums text-muted-foreground">{it.oculto ? '—' : it.posicao}</td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          {identidade}
          {it.oculto && <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400" title="Conta de teste — não conta no ranking">não contabilizado</span>}
        </div>
      </td>
      <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">{it.aulasConcluidas}</td>
      <td className="px-3 py-2.5 text-center tabular-nums">
        <span className={cn('inline-flex items-center gap-1', it.streakAtual > 0 ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
          <Flame className="h-3.5 w-3.5" /> {it.streakAtual}
        </span>
      </td>
      <td className="px-3 py-2.5 text-center font-semibold tabular-nums">{it.score}</td>
      <td className="px-2 py-2.5 text-center">
        {onExpand && (
          <button type="button" onClick={() => onExpand(it)} aria-label="Ver detalhes do aluno" title="Ver detalhes"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <MoreVertical className="h-4 w-4" />
          </button>
        )}
      </td>
    </tr>
  )
}
