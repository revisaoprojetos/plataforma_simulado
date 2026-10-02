'use client'

import { useEffect, useMemo, useState, type ReactNode, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Trophy, Flame, Zap, Award, BookCheck, CalendarDays, X, Loader2, Check, Save, Crown, TrendingUp, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBrt } from '@/lib/brt'
import { AvatarEstudante } from '@/components/aluno/avatar-estudante'
import type { RankingLeitura, RankingLeituraItem } from '@/lib/leitura/ranking'
import { detalheRankingAluno, salvarSequenciaAjuste, type DetalheRankingAluno } from '@/app/admin/leitura/actions'
import { calcularSequencia } from '@/lib/leitura/sequencia'
import { cargoParaNivel } from '@/lib/gamificacao/niveis'
import { iconeCargo } from '@/lib/gamificacao/cargo-icones'
import type { TituloNivel } from '@/lib/gamificacao/config'

const POR_PAG = 10

/** Duração legível a partir de segundos (controle detalhado do suporte). */
const fmtDur = (s?: number | null): string | null => {
  if (!s || s <= 0) return null
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60)
  return h > 0 ? `${h}h ${m}min` : m > 0 ? `${m}min ${sec}s` : `${sec}s`
}
/** Intervalo "início → fim" em BRT (só um lado quando igual/ausente). */
const fmtMomento = (ini?: string | null, fim?: string | null): string => {
  const a = ini ? formatBrt(ini) : null, b = fim ? formatBrt(fim) : null
  if (a && b && a !== b) return `${a} → ${b}`
  return a ?? b ?? '—'
}
/** Duração entre dois instantes (p/ o tempo gasto no quiz). */
const durEntre = (ini?: string | null, fim?: string | null): string | null => (ini && fim ? fmtDur((Date.parse(fim) - Date.parse(ini)) / 1000) : null)

/** Nome curto p/ preservar privacidade no ranking do aluno: "João Marcello Pedote" → "J. P.". */
const nomeCurto = (n: string) => {
  const ps = (n || '').split(' ').filter(Boolean)
  if (!ps.length) return '—'
  const a = ps[0][0]?.toUpperCase() ?? ''
  const b = ps.length > 1 ? (ps[ps.length - 1][0]?.toUpperCase() ?? '') : ''
  return b ? `${a}. ${b}.` : `${a}.`
}

function PagBtn({ children, onClick, disabled, aria }: { children: ReactNode; onClick: () => void; disabled?: boolean; aria: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={aria}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors hover:bg-muted disabled:opacity-40">{children}</button>
  )
}

type Aba = 'pontos' | 'sequencia' | 'aulas'

/**
 * Ranking do módulo LegProc para o ALUNO. Layout em duas colunas: à esquerda o cabeçalho + pódio (top 3)
 * + "Sua posição"; à direita a tabela de Classificação com abas (Pontos/Sequência/Aulas) e paginação.
 * Regras: nomes abreviados (privacidade; só "Você" aparece por extenso), contas de teste nunca aparecem,
 * e o próprio aluno sempre aparece — mesmo que a lista cacheada (5 min) ainda esteja defasada — via
 * `minhaLinha` (calculada fresca no servidor). A "Var." é a variação de posição desde a última visita,
 * calculada no cliente (localStorage) p/ não precisar pollar o servidor (egress) num desafio ao vivo.
 */
export function LeituraRanking({ ranking, minhaLinha = null, meuId, meuNome, moduloId, moduloNome, titulos = [], totalDesafio = 0 }: {
  ranking: RankingLeitura
  minhaLinha?: RankingLeituraItem | null
  meuId?: string | null
  meuNome?: string | null
  moduloId?: string
  moduloNome?: string | null
  titulos?: TituloNivel[]
  /** Total de aulas/dias do DESAFIO inteiro (ex.: 30) — denominador do "Progresso do desafio". */
  totalDesafio?: number
}) {
  const { itens, gamAtivo } = ranking
  const [ordem, setOrdem] = useState<{ campo: Aba; dir: 'asc' | 'desc' }>({ campo: 'pontos', dir: 'desc' }) // ordenação de EXIBIÇÃO (clique nas colunas)
  const [pagina, setPagina] = useState(1)

  const metrica = (campo: Aba, it: RankingLeituraItem) => (campo === 'pontos' ? it.score : campo === 'sequencia' ? it.streakAtual : it.aulasConcluidas)

  // Aluno nunca vê contas de teste (ocultas).
  const reais = useMemo(() => itens.filter((i) => !i.oculto), [itens])

  // Garante que o PRÓPRIO aluno apareça mesmo se a lista cacheada (5 min) ainda não o reflete.
  const base = useMemo(() => {
    if (!meuId) return reais
    if (reais.some((i) => i.estudanteId === meuId)) return reais
    if (minhaLinha && minhaLinha.estudanteId === meuId && (minhaLinha.aulasConcluidas > 0 || minhaLinha.acertos > 0)) return [...reais, minhaLinha]
    return reais
  }, [reais, meuId, minhaLinha])

  // RANKING CANÔNICO (posição REAL e FIXA de cada aluno) — por pontos, com desempates. O "#" da tabela,
  // o pódio e o "Sua posição" usam SEMPRE isto: reordenar as colunas muda só a ordem das linhas, nunca o
  // número de ninguém.
  const canonicos = useMemo(() => [...base].sort((a, b) =>
    b.score - a.score || b.streakAtual - a.streakAtual || b.aulasConcluidas - a.aulasConcluidas || a.nome.localeCompare(b.nome, 'pt-BR')
  ), [base])
  const rankCanonico = useMemo(() => new Map(canonicos.map((it, i) => [it.estudanteId, i + 1])), [canonicos])

  // Ordem de EXIBIÇÃO (clique nas colunas). asc = reverso EXATO do desc → puxa o último pro topo mesmo
  // quando a métrica empata (o desempate também inverte).
  const ordenados = useMemo(() => [...base].sort((a, b) => {
    const t = metrica(ordem.campo, b) - metrica(ordem.campo, a)
      || b.streakAtual - a.streakAtual || b.score - a.score || b.aulasConcluidas - a.aulasConcluidas || a.nome.localeCompare(b.nome, 'pt-BR')
    return ordem.dir === 'asc' ? -t : t
  }), [base, ordem])

  useEffect(() => { setPagina(1) }, [ordem])

  if (!itens.length) {
    return (
      <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">
        <Trophy className="mx-auto mb-2 h-8 w-8 opacity-40" />
        Ainda não há ranking neste módulo. Responda o quiz das aulas para pontuar.
      </div>
    )
  }

  // Pódio / Sua posição / minha linha vêm do CANÔNICO (não da ordem de exibição da tabela).
  const top3 = canonicos.slice(0, 3)
  const meuIt = meuId ? canonicos.find((i) => i.estudanteId === meuId) ?? null : null
  const minhaPos = meuIt ? rankCanonico.get(meuIt.estudanteId) ?? 0 : 0

  const totalPag = Math.max(1, Math.ceil(ordenados.length / POR_PAG))
  const pag = Math.min(pagina, totalPag)
  const ini = (pag - 1) * POR_PAG
  const visiveis = ordenados.slice(ini, ini + POR_PAG)

  const cargoDe = (nivel: number) => {
    const c = cargoParaNivel(nivel, titulos)
    return c && c.titulo ? { titulo: c.titulo, Icon: iconeCargo(c.icone) } : null
  }
  const corPodio = ['#f5c518', '#c7cdd6', '#cd8d4e'] // 1º ouro · 2º prata · 3º bronze (iguais ao admin)

  // Cabeçalho ordenável: clica → ordena a EXIBIÇÃO por esta coluna; clica de novo → inverte (↑/↓).
  // O número (#) é sempre a posição canônica, então a ordem muda só as linhas, não o rank de ninguém.
  const ThSort = ({ campo, children }: { campo: Aba; children: ReactNode }) => {
    const ativo = ordem.campo === campo
    const Seta = ativo ? (ordem.dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
    return (
      <th className="w-16 px-2 py-2.5 text-center font-medium sm:w-28 sm:px-4">
        <button type="button"
          onClick={() => setOrdem((prev) => {
            // Mesma coluna → inverte. Coluna nova → desc; mas se desc deixar a ordem IGUAL (valores
            // empatados), já vai pra asc, pra todo clique mudar algo na hora.
            if (prev.campo === campo) return { campo, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
            const idsPor = (dir: 'asc' | 'desc') => [...base].sort((a, b) => {
              const t = metrica(campo, b) - metrica(campo, a) || b.streakAtual - a.streakAtual || b.score - a.score || b.aulasConcluidas - a.aulasConcluidas || a.nome.localeCompare(b.nome, 'pt-BR')
              return dir === 'asc' ? -t : t
            }).map((x) => x.estudanteId).join(',')
            const atual = ordenados.map((x) => x.estudanteId).join(',')
            return { campo, dir: idsPor('desc') === atual ? 'asc' : 'desc' }
          })}
          title="Ordenar por esta coluna (clique de novo para inverter)"
          className={cn('mx-auto inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-foreground', ativo && 'text-primary')}>
          {children}<Seta className={cn('h-3 w-3', ativo ? 'text-primary' : 'text-muted-foreground/40')} />
        </button>
      </th>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 pb-24 sm:gap-5 lg:grid-cols-[30rem_minmax(0,1fr)] lg:pb-0">
      {/* ESQUERDA — cabeçalho + pódio + sua posição (card em volta do "Ranking geral", fundo animado) */}
      <div className="relative flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/[0.1] via-card to-card p-4 shadow-sm sm:p-5">
        {/* Fundo animado (aurora na cor da marca) — igual ao admin. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-12 -top-16 h-52 w-52 rounded-full bg-primary/30 blur-3xl" style={{ animation: 'rankBlobA 11s ease-in-out infinite' }} />
          <div className="absolute -top-10 right-0 h-44 w-44 rounded-full bg-primary/20 blur-3xl" style={{ animation: 'rankBlobB 14s ease-in-out infinite' }} />
          <div className="absolute -bottom-20 left-1/4 h-52 w-52 rounded-full bg-primary/15 blur-3xl" style={{ animation: 'rankBlobA 17s ease-in-out infinite reverse' }} />
          <div className="rank-sheen absolute -inset-y-10 -left-1/3 w-1/3 rotate-12 bg-gradient-to-r from-transparent via-white/5 to-transparent" style={{ animation: 'rankSheen 9s ease-in-out infinite' }} />
        </div>
        <style>{`
          @keyframes rankBlobA{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(22px,-16px) scale(1.16)}}
          @keyframes rankBlobB{0%,100%{transform:translate(0,0) scale(1.1)}50%{transform:translate(-24px,12px) scale(.92)}}
          @keyframes rankSheen{0%{transform:translateX(0) rotate(12deg);opacity:0}15%{opacity:1}50%{transform:translateX(380%) rotate(12deg)}60%,100%{transform:translateX(380%) rotate(12deg);opacity:0}}
          @media (prefers-reduced-motion: reduce){.rank-sheen{display:none}}
        `}</style>
        <div className="relative flex flex-1 flex-col gap-4">
        <div>
          {moduloNome && <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{moduloNome}</p>}
          <h2 className="text-2xl font-bold leading-tight">Ranking geral</h2>
          <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Ao vivo
            </span>
            <span aria-hidden>·</span>
            <span><b className="text-foreground tabular-nums">{reais.length}</b> {reais.length === 1 ? 'aluno' : 'alunos'}</span>
          </div>
        </div>

        {/* Pódio + card do aluno — ocupam o espaço central do card; o card fica "colado" na base do pódio */}
        <div className="flex flex-1 flex-col justify-center">
          {top3.length >= 3 && (
          <div className="grid w-full grid-cols-3 items-end gap-1.5 sm:gap-2.5">
            {[top3[1], top3[0], top3[2]].map((it, i) => {
              if (!it) return <div key={i} />
              const lugar = [2, 1, 3][i]
              const eu = !!meuId && it.estudanteId === meuId
              const cor = corPodio[lugar - 1]
              const h = lugar === 1 ? 'h-16 sm:h-32' : lugar === 2 ? 'h-11 sm:h-24' : 'h-8 sm:h-20'
              return (
                <div key={it.estudanteId} className="flex min-w-0 flex-col items-center text-center">
                  <span className="relative mb-2 inline-flex rounded-full ring-2 ring-offset-2 ring-offset-card" style={{ '--tw-ring-color': cor } as CSSProperties}>
                    {lugar === 1 && <Crown className="absolute -top-4 left-1/2 z-10 h-4 w-4 -translate-x-1/2 sm:-top-5 sm:h-5 sm:w-5" style={{ color: cor }} />}
                    <AvatarEstudante nome={it.nome} avatar={it.avatar} cor={it.avatarCor ?? '#6d28d9'} className={cn('text-white shadow-md', lugar === 1 ? 'h-12 w-12 text-sm sm:h-16 sm:w-16 sm:text-lg' : 'h-10 w-10 text-xs sm:h-12 sm:w-12 sm:text-sm')} />
                  </span>
                  <span className={cn('line-clamp-1 max-w-full text-xs font-semibold sm:text-sm', eu && 'text-primary')}>{eu ? 'Você' : nomeCurto(it.nome)}</span>
                  <span className="flex flex-wrap items-center justify-center gap-x-1 text-[10px] font-bold tabular-nums sm:gap-x-1.5 sm:text-xs">
                    <span className="text-primary">{it.score} pts</span>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400"><Flame className="h-3 w-3 sm:h-3.5 sm:w-3.5" />{it.streakAtual}</span>
                  </span>
                  <div className={cn('mt-2 flex w-full items-start justify-center rounded-t-xl border border-b-0 pt-1.5 text-base font-black sm:pt-2 sm:text-lg', h)}
                    style={{ background: `linear-gradient(to top, ${cor}2e, ${cor}0a)`, borderColor: `${cor}66`, color: cor }}>
                    {lugar}º
                  </div>
                </div>
              )
            })}
          </div>
          )}

          {/* Card do aluno (eu) — posição à esquerda + identidade + stats espaçados.
              z-10 + margem negativa sobrepõem a base dos pedestais (fundo sólido) → o pódio "nasce"
              de dentro do card, conectado, sem ficar flutuando. */}
          {meuIt && (
            <div className="relative z-10 mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-card p-3 shadow-sm sm:-mt-4 sm:gap-x-4 sm:p-3.5">
              {/* posição à esquerda */}
              <div className="flex shrink-0 flex-col items-center">
                <span className="text-xl font-black leading-none tabular-nums sm:text-2xl">{minhaPos}º</span>
                <span className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">posição</span>
              </div>
              <div className="hidden h-11 w-px shrink-0 bg-border sm:block" />
              {/* identidade */}
              <span className="relative shrink-0">
                <AvatarEstudante nome={meuNome ?? meuIt.nome} avatar={meuIt.avatar} cor={meuIt.avatarCor ?? '#6d28d9'} className="h-11 w-11 text-sm text-white" />
                {gamAtivo && meuIt.nivel > 0 && <span className="absolute -bottom-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold text-primary-foreground ring-2 ring-card">{meuIt.nivel}</span>}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-semibold">{meuNome ?? meuIt.nome}</span>
                  <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">você</span>
                </div>
                {gamAtivo && (() => { const c = cargoDe(meuIt.nivel); if (!c) return null; const CargoIcon = c.Icon; return <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground"><span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary/10 text-primary"><CargoIcon className="h-3 w-3" /></span><span className="truncate">{c.titulo}</span></span> })()}
              </div>
              {/* stats bem espaçados, com divisórias — no mobile quebram p/ a linha de baixo, centralizados */}
              <div className="flex w-full items-center justify-center divide-x divide-border/70 text-center sm:ml-auto sm:w-auto sm:justify-start">
                <div className="px-3 sm:px-3.5"><div className="text-base font-bold leading-none tabular-nums">{meuIt.aulasConcluidas}</div><div className="mt-1 text-[10px] text-muted-foreground">aulas</div></div>
                <div className="px-3 sm:px-3.5"><div className="inline-flex items-center gap-0.5 text-base font-bold leading-none tabular-nums text-amber-600 dark:text-amber-400"><Flame className="h-3.5 w-3.5" />{meuIt.streakAtual}</div><div className="mt-1 text-[10px] text-muted-foreground">seq.</div></div>
                <div className="px-3 sm:px-3.5"><div className="text-base font-bold leading-none tabular-nums text-primary">{meuIt.score}</div><div className="mt-1 text-[10px] text-muted-foreground">pts</div></div>
              </div>
            </div>
          )}
        </div>

        {/* Progresso do desafio — info COMPLEMENTAR ao card (sem repetir posição/nome/pts). */}
        <div className="rounded-xl border bg-muted/30 p-3.5">
          {meuIt ? (() => {
            // Progresso sobre o DESAFIO INTEIRO (todas as aulas/dias do módulo, ex.: 30), não só as
            // aulas já publicadas. Fallback p/ o total do ranking.
            const total = Math.max(totalDesafio || 0, meuIt.totalAulas, meuIt.aulasConcluidas, 1)
            const feitas = meuIt.aulasConcluidas
            const pct = Math.round((feitas / total) * 100)
            // Próximo objetivo: quanto falta (em PONTOS — métrica do ranking) p/ alcançar quem está acima.
            const acima = minhaPos > 1 ? canonicos[minhaPos - 2] : null
            const delta = acima ? acima.score - meuIt.score : 0
            const unidade = 'pts'
            return (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Progresso do desafio</span>
                  <span className="font-semibold tabular-nums text-primary">{pct}%</span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground"><b className="text-foreground tabular-nums">{feitas}</b> de {total} aulas concluídas</p>
                <div className="mt-3 flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
                  {!acima ? (
                    <><Crown className="h-4 w-4 shrink-0 text-amber-500" /> <span>Você lidera o ranking!</span></>
                  ) : delta > 0 ? (
                    <><TrendingUp className="h-4 w-4 shrink-0 text-emerald-500" /> <span>Faltam <b className="text-foreground tabular-nums">{delta}</b> {unidade} para o <b className="text-foreground">{minhaPos - 1}º</b></span></>
                  ) : (
                    <><TrendingUp className="h-4 w-4 shrink-0 text-emerald-500" /> <span>Empatado com o <b className="text-foreground">{minhaPos - 1}º</b> — avance para desempatar</span></>
                  )}
                </div>
              </>
            )
          })() : (
            <div className="flex items-center gap-3">
              <AvatarEstudante nome={meuNome ?? 'Você'} avatar={null} cor="#6d28d9" className="h-9 w-9 shrink-0 text-[11px] text-white" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-primary">Você</p>
                <p className="text-xs text-muted-foreground">Faça uma aula para entrar no ranking.</p>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* DIREITA — classificação */}
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">Classificação</h3>
          <span className="text-xs text-muted-foreground">Clique numa coluna para ordenar</span>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[25rem] text-sm">
            <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-14 px-3 py-2.5 text-center font-medium">#</th>
                <th className="px-3 py-2.5 font-medium">Aluno</th>
                <ThSort campo="aulas">Aulas</ThSort>
                <ThSort campo="sequencia">Sequência</ThSort>
                <ThSort campo="pontos">Pontos</ThSort>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((it) => {
                const pos = rankCanonico.get(it.estudanteId) ?? 0
                const eu = !!meuId && it.estudanteId === meuId
                const cargo = gamAtivo ? cargoDe(it.nivel) : null
                return (
                  <tr key={it.estudanteId} className={cn('border-b last:border-0 transition-colors', eu ? 'bg-primary/5' : 'hover:bg-muted/30')}>
                    <td className="px-3 py-2.5 text-center">
                      <span className={cn('inline-flex h-7 min-w-7 items-center justify-center rounded-lg px-1 text-xs font-bold tabular-nums',
                        pos === 1 ? 'bg-primary text-primary-foreground' : pos <= 3 ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>{pos}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="relative shrink-0">
                          <AvatarEstudante nome={it.nome} avatar={it.avatar} cor={it.avatarCor ?? '#6d28d9'} className="h-9 w-9 text-[11px] text-white" />
                          {gamAtivo && it.nivel > 0 && <span className="absolute -bottom-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold text-primary-foreground ring-2 ring-card">{it.nivel}</span>}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={cn('truncate font-medium', eu && 'text-primary')}>{eu ? (meuNome ?? it.nome) : nomeCurto(it.nome)}</span>
                            {eu && <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">você</span>}
                          </div>
                          {cargo && (
                            <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary/10 text-primary"><cargo.Icon className="h-3 w-3" /></span>
                              <span className="truncate">{cargo.titulo}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="w-16 px-2 py-2.5 text-center sm:w-28 sm:px-4 tabular-nums text-muted-foreground">{it.aulasConcluidas}</td>
                    <td className="w-16 px-2 py-2.5 text-center sm:w-28 sm:px-4">
                      <span className={cn('inline-flex items-center gap-1 tabular-nums', it.streakAtual > 0 ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                        <Flame className="h-3.5 w-3.5" />{it.streakAtual}
                      </span>
                    </td>
                    <td className="w-16 px-2 py-2.5 text-center sm:w-28 sm:px-4 font-bold tabular-nums">{it.score}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
          {/* Rodapé: contagem + paginação (estilo admin) */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-sm">
            <span className="text-xs text-muted-foreground">
              {ordenados.length > 0 ? <>Mostrando <b className="tabular-nums text-foreground">{ini + 1}–{Math.min(ini + POR_PAG, ordenados.length)}</b> de <b className="tabular-nums text-foreground">{ordenados.length}</b></> : 'Nenhum aluno'}
            </span>
            {totalPag > 1 && (
              <div className="flex w-full items-center justify-center gap-1 sm:w-auto">
                <PagBtn onClick={() => setPagina(1)} disabled={pag <= 1} aria="Primeira"><ChevronsLeft className="h-4 w-4" /></PagBtn>
                <PagBtn onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pag <= 1} aria="Anterior"><ChevronLeft className="h-4 w-4" /></PagBtn>
                <span className="px-2 text-xs tabular-nums text-muted-foreground">{pag}/{totalPag}</span>
                <PagBtn onClick={() => setPagina((p) => Math.min(totalPag, p + 1))} disabled={pag >= totalPag} aria="Próxima"><ChevronRight className="h-4 w-4" /></PagBtn>
                <PagBtn onClick={() => setPagina(totalPag)} disabled={pag >= totalPag} aria="Última"><ChevronsRight className="h-4 w-4" /></PagBtn>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Pop-up com o detalhe do aluno. Abas: "Visão geral" (sequência/progresso/aulas) e "Sequência"
 *  (calendário do suporte: marcar/desconsiderar dias que contam no streak). */
export function DetalheAlunoModal({ moduloId, it, onClose }: { moduloId: string; it: RankingLeituraItem; onClose: () => void }) {
  const [d, setD] = useState<DetalheRankingAluno | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aba, setAba] = useState<'geral' | 'sequencia'>('geral')
  const [ovr, setOvr] = useState<Record<string, boolean>>({})
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    detalheRankingAluno(moduloId, it.estudanteId).then((r) => { if (r.ok && r.detalhe) { setD(r.detalhe); setOvr(r.detalhe.overrides ?? {}) } else setErro(r.error ?? 'Erro ao carregar.') }).catch(() => setErro('Erro ao carregar.'))
    return () => document.removeEventListener('keydown', onKey)
  }, [moduloId, it.estudanteId, onClose])

  // Sequência AO VIVO (reflete as edições do calendário antes de salvar).
  const seqLive = useMemo(() => (d ? calcularSequencia(d.diasAuto, ovr, d.hoje) : null), [d, ovr])
  const streakAtual = seqLive?.streakAtual ?? d?.streakAtual ?? 0
  const streakMaior = seqLive?.streakMaior ?? d?.streakMaior ?? 0

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
      <div className="relative flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b p-4">
          <AvatarEstudante nome={it.nome} avatar={it.avatar} cor={it.avatarCor ?? '#6d28d9'} className="h-10 w-10 shrink-0 text-sm text-white" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold">{it.nome}</h3>
            {it.email && <p className="truncate text-xs text-muted-foreground">{it.email}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        {d && (
          <div className="flex gap-1 border-b px-3 pt-2">
            {([['geral', 'Visão geral'], ['sequencia', 'Sequência']] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setAba(k)}
                className={cn('relative rounded-t-lg px-3.5 py-2 text-sm font-medium transition-colors', aba === k ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                <span className="inline-flex items-center gap-1.5">{k === 'sequencia' && <CalendarDays className="h-3.5 w-3.5" />}{label}</span>
                {aba === k && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {erro ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{erro}</p>
          ) : !d ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
          ) : aba === 'geral' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <Stat icon={Zap} label="pontos" valor={d.pontosTotal.toLocaleString('pt-BR')} />
                <Stat icon={Flame} label="sequência atual" valor={`${streakAtual}d`} />
                <Stat icon={Award} label="maior sequência" valor={`${streakMaior}d`} />
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
                          <span className="flex items-center gap-1.5 text-sm font-medium"><span className="truncate">{a.titulo}</span>{a.tentativas > 1 && <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">{a.tentativas} tentativas</span>}</span>
                          <span className="block text-[11px] text-muted-foreground"><b className="font-semibold text-foreground/70">Leitura:</b> {fmtMomento(a.leituraInicio, a.leituraFim)}{fmtDur(a.leituraTempoSeg) ? ` · ${fmtDur(a.leituraTempoSeg)}` : ''}</span>
                          <span className="block text-[11px] text-muted-foreground"><b className="font-semibold text-foreground/70">Quiz:</b> {fmtMomento(a.quizInicio, a.quizFim)}{durEntre(a.quizInicio, a.quizFim) ? ` · ${durEntre(a.quizInicio, a.quizFim)}` : ''}</span>
                        </span>
                        <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary tabular-nums">+{a.pontos}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <CalendarioSequencia
              d={d} ovr={ovr} setOvr={setOvr} moduloId={moduloId} estudanteId={it.estudanteId}
              streakAtual={streakAtual} streakMaior={streakMaior}
              onSaved={(novo) => setD({ ...d, overrides: novo })}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Calendário de reconfiguração da sequência (suporte). Cada dia: verde = conta (o aluno fez);
 *  tracejado = marcado manualmente (preenche buraco/reativa); acinzentado/riscado = desconsiderado
 *  (ele fez mas você tirou → quebra a sequência ali). Clique alterna; salva por (aluno, módulo). */
function CalendarioSequencia({ d, ovr, setOvr, moduloId, estudanteId, streakAtual, streakMaior, onSaved }: {
  d: DetalheRankingAluno; ovr: Record<string, boolean>; setOvr: (o: Record<string, boolean>) => void
  moduloId: string; estudanteId: string; streakAtual: number; streakMaior: number; onSaved: (o: Record<string, boolean>) => void
}) {
  const autoSet = useMemo(() => new Set(d.diasAuto), [d.diasAuto])
  const baseDia = d.diasAuto[d.diasAuto.length - 1] || d.hoje
  const [mes, setMes] = useState<string>(() => baseDia.slice(0, 7)) // 'YYYY-MM'
  const [salvando, setSalvando] = useState(false)
  const sujo = useMemo(() => JSON.stringify(ovr) !== JSON.stringify(d.overrides ?? {}), [ovr, d.overrides])

  const [ano, mesN] = mes.split('-').map(Number)
  const diasNoMes = new Date(Date.UTC(ano, mesN, 0)).getUTCDate()
  const offsetInicio = new Date(Date.UTC(ano, mesN - 1, 1)).getUTCDay() // 0=Dom
  const iso = (dia: number) => `${ano}-${String(mesN).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  const nomeMes = new Date(Date.UTC(ano, mesN - 1, 1)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

  const estadoDia = (day: string): 'conta-auto' | 'conta-manual' | 'desconsiderado' | 'vazio' => {
    const auto = autoSet.has(day)
    const cur = ovr[day]
    const conta = cur === undefined ? auto : cur
    if (conta) return auto ? 'conta-auto' : 'conta-manual'
    return auto ? 'desconsiderado' : 'vazio'
  }
  const toggle = (day: string) => {
    const auto = autoSet.has(day)
    const cur = ovr[day]
    const conta = cur === undefined ? auto : cur
    const novoConta = !conta
    const novo = { ...ovr }
    if (novoConta === auto) delete novo[day]
    else novo[day] = novoConta
    setOvr(novo)
  }
  const mudarMes = (delta: number) => { const dt = new Date(Date.UTC(ano, mesN - 1 + delta, 1)); setMes(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`) }
  async function salvar() {
    setSalvando(true)
    const r = await salvarSequenciaAjuste(moduloId, estudanteId, ovr)
    setSalvando(false)
    if (r.ok) { toast.success('Sequência atualizada.'); onSaved(ovr) }
    else toast.error(r.error ?? 'Não foi possível salvar.')
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2.5">
        <div className="flex-1 rounded-xl border bg-muted/30 p-3 text-center">
          <Flame className="mx-auto mb-1 h-4 w-4 text-primary" />
          <div className="text-lg font-bold leading-none tabular-nums">{streakAtual}d</div>
          <div className="mt-1 text-[11px] text-muted-foreground">sequência atual</div>
        </div>
        <div className="flex-1 rounded-xl border bg-muted/30 p-3 text-center">
          <Award className="mx-auto mb-1 h-4 w-4 text-primary" />
          <div className="text-lg font-bold leading-none tabular-nums">{streakMaior}d</div>
          <div className="mt-1 text-[11px] text-muted-foreground">maior sequência</div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[19rem] items-center justify-between">
        <button type="button" onClick={() => mudarMes(-1)} aria-label="Mês anterior" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-sm font-semibold capitalize">{nomeMes}</span>
        <button type="button" onClick={() => mudarMes(1)} aria-label="Próximo mês" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><ChevronRight className="h-4 w-4" /></button>
      </div>

      <div className="mx-auto grid w-full max-w-[19rem] grid-cols-7 gap-1 text-center">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((w, i) => <div key={i} className="pb-0.5 text-[10px] font-medium text-muted-foreground">{w}</div>)}
        {Array.from({ length: offsetInicio }).map((_, i) => <div key={'e' + i} />)}
        {Array.from({ length: diasNoMes }).map((_, i) => {
          const dia = i + 1; const day = iso(dia); const est = estadoDia(day); const ehHoje = day === d.hoje
          const titles = d.diaAulas[day]
          const cls = est === 'conta-auto' ? 'border-primary bg-primary text-primary-foreground'
            : est === 'conta-manual' ? 'border-dashed border-primary bg-primary/15 text-primary'
            : est === 'desconsiderado' ? 'border-transparent bg-muted text-muted-foreground/60 line-through'
            : 'border-transparent text-muted-foreground hover:bg-muted'
          const tip = titles?.length ? titles.join(' · ') : est === 'vazio' ? 'Marcar como dia da sequência' : est === 'desconsiderado' ? 'Desconsiderado — clique p/ reativar' : ''
          return (
            <button key={day} type="button" onClick={() => toggle(day)} title={tip}
              className={cn('relative flex aspect-square items-center justify-center rounded-md border text-xs font-medium transition-colors', cls, ehHoje && 'ring-2 ring-inset ring-primary')}>
              {dia}
              {est === 'desconsiderado' && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" title="Fez, mas desconsiderado" />}
              {est === 'conta-manual' && <Check className="absolute right-0.5 top-0.5 h-2.5 w-2.5" />}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-primary" /> Conta (fez)</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded border border-dashed border-primary bg-primary/15" /> Marcado manual</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-muted" /> Desconsiderado</span>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Clique num dia pra <b className="text-foreground">marcar</b> (conta na sequência, preenche um buraco) ou pra <b className="text-foreground">desconsiderar</b> um dia que ele fez (quebra a sequência ali). Dias feitos e desconsiderados ficam acinzentados, sinalizando o dia.
      </p>

      <div className="flex items-center justify-end gap-2 border-t pt-3">
        {sujo && <button type="button" onClick={() => setOvr(d.overrides ?? {})} className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted">Descartar</button>}
        <button type="button" onClick={salvar} disabled={salvando || !sujo}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
        </button>
      </div>
    </div>
  )
}
