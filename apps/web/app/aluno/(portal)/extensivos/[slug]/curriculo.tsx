'use client'

// Conteúdo do curso (extensivo), em DUAS visões:
//  • <ModulosVitrine>  — página do extensivo: carrosséis de PÔSTERES dos módulos (estilo Netflix/Curseduca),
//    com a imagem do módulo (configurador → módulo → imagem; ideal vertical 2:3). Sem imagem, um pôster
//    gerado com a cor do produto e o nome do módulo. Cada card abre a página do módulo.
//  • <ModuloDetalhe>   — página do módulo: índice dos módulos com progresso à esquerda (desktop) e as
//    aulas do módulo em LINHA ÚNICA, com busca, cadeado/data de liberação e marca de "lida".
// Os dados vêm prontos do servidor (curriculoDoAluno: disponibilidade, links e "lida" já resolvidos).
import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, ClipboardList, ExternalLink, FileText, Lock, PlayCircle, Search, CheckCircle2, X, Play } from 'lucide-react'
import type { ModuloAluno, AulaAluno } from '@/lib/produtos/curriculo-aluno'
import { SUBTIPO_LABEL } from '@/lib/produtos/curriculo'

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const fmtData = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }) : '')
const hrefModulo = (slug: string, id: string) => `/aluno/extensivos/${slug}/modulo/${id}`

export function todasAulas(m: ModuloAluno): AulaAluno[] { return [...m.aulas, ...m.submodulos.flatMap(todasAulas)] }
function progresso(m: ModuloAluno) {
  const a = todasAulas(m), lidas = a.filter((x) => x.lida).length
  return { total: a.length, lidas, pct: a.length ? Math.round((lidas / a.length) * 100) : 0 }
}

/**
 * Fileiras da vitrine: módulos cujo título começa com o MESMO prefixo "X - " (≥2 módulos, ex.: "LegProc - …")
 * ganham fileira própria com o nome do prefixo (e o card mostra só o resto do título); os demais ficam na
 * fileira "Módulos do curso". Ordem do configurador preservada dentro de cada fileira.
 */
function fileiras(modulos: ModuloAluno[]) {
  const prefixo = (t: string) => { const i = t.indexOf(' - '); return i > 0 && i <= 40 ? t.slice(0, i).trim() : null }
  const cont = new Map<string, number>()
  for (const m of modulos) { const p = prefixo(m.titulo); if (p) cont.set(p, (cont.get(p) ?? 0) + 1) }
  const principal: { m: ModuloAluno; nome: string }[] = []
  const grupos = new Map<string, { m: ModuloAluno; nome: string }[]>()
  for (const m of modulos) {
    const p = prefixo(m.titulo)
    if (p && (cont.get(p) ?? 0) >= 2) {
      const l = grupos.get(p) ?? []; l.push({ m, nome: m.titulo.slice(m.titulo.indexOf(' - ') + 3).trim() || m.titulo }); grupos.set(p, l)
    } else principal.push({ m, nome: m.titulo })
  }
  const out: { titulo: string; itens: { m: ModuloAluno; nome: string }[] }[] = []
  if (principal.length) out.push({ titulo: 'Módulos do curso', itens: principal })
  for (const [p, itens] of grupos) out.push({ titulo: p, itens })
  return out
}

/* ═════════════════════════ VITRINE (página do extensivo) ═════════════════════════ */

export function ModulosVitrine({ modulos, slug, cor }: { modulos: ModuloAluno[]; slug: string; cor: string }) {
  const linhas = useMemo(() => fileiras(modulos), [modulos])
  const geral = useMemo(() => {
    const a = modulos.flatMap(todasAulas), lidas = a.filter((x) => x.lida).length
    return { total: a.length, lidas, pct: a.length ? Math.round((lidas / a.length) * 100) : 0 }
  }, [modulos])
  // "Continuar": 1ª aula liberada e ainda não lida, na ordem do curso.
  const continuar = useMemo(() => {
    for (const m of modulos) for (const a of todasAulas(m)) if (a.liberada && !a.lida && a.href) return { m, a }
    return null
  }, [modulos])

  return (
    <div className="space-y-7">
      {/* Progresso geral + continuar */}
      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Seu progresso</span>
            <span className="text-xs text-muted-foreground">{geral.lidas} de {geral.total} aulas · {modulos.length} módulos</span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${geral.pct}%`, background: cor }} /></div>
            <span className="text-sm font-bold tabular-nums">{geral.pct}%</span>
          </div>
        </div>
        {continuar && (
          <Link href={continuar.a.externo ? hrefModulo(slug, continuar.m.id) : continuar.a.href!}
            className="flex min-w-0 items-center gap-3 rounded-xl px-4 py-2.5 shadow-sm transition-opacity hover:opacity-90 sm:max-w-sm"
            // cor via style (não classe): o CSS do tema do tenant pinta <a> do conteúdo e vencia o text-white
            style={{ background: cor, color: '#FFFFFF' }}>
            <Play className="h-4 w-4 shrink-0" style={{ color: '#FFFFFF', fill: '#FFFFFF' }} />
            <span className="min-w-0">
              <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: 'rgba(255,255,255,.82)' }}>{geral.lidas ? 'Continuar de onde parou' : 'Começar o curso'}</span>
              <span className="block truncate text-sm font-semibold" style={{ color: '#FFFFFF' }}>{continuar.a.titulo}</span>
            </span>
          </Link>
        )}
      </div>

      {linhas.map((l) => <Fileira key={l.titulo} titulo={l.titulo} itens={l.itens} slug={slug} cor={cor} />)}
    </div>
  )
}

function Fileira({ titulo, itens, slug, cor }: { titulo: string; itens: { m: ModuloAluno; nome: string }[]; slug: string; cor: string }) {
  const trilho = useRef<HTMLDivElement>(null)
  const rolar = (dir: number) => { const el = trilho.current; if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' }) }
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-bold tracking-tight">{titulo}</h2>
        <span className="text-xs text-muted-foreground">{itens.length} {itens.length === 1 ? 'módulo' : 'módulos'}</span>
      </div>
      <div className="group/fileira relative">
        <div ref={trilho} className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {itens.map(({ m, nome }, i) => <Poster key={m.id} m={m} nome={nome} n={i + 1} href={hrefModulo(slug, m.id)} cor={cor} />)}
        </div>
        {itens.length > 3 && (
          <>
            <button type="button" aria-label="Anterior" onClick={() => rolar(-1)}
              className="absolute left-0 top-1/2 hidden h-24 w-10 -translate-y-1/2 items-center justify-center rounded-r-xl bg-black/55 text-white opacity-0 transition-opacity group-hover/fileira:opacity-100 md:flex">
              <ChevronLeft className="h-7 w-7" />
            </button>
            <button type="button" aria-label="Próximo" onClick={() => rolar(1)}
              className="absolute right-0 top-1/2 hidden h-24 w-10 -translate-y-1/2 items-center justify-center rounded-l-xl bg-black/55 text-white opacity-0 transition-opacity group-hover/fileira:opacity-100 md:flex">
              <ChevronRight className="h-7 w-7" />
            </button>
          </>
        )}
      </div>
    </section>
  )
}

function Poster({ m, nome, n, href, cor }: { m: ModuloAluno; nome: string; n: number; href: string; cor: string }) {
  const p = progresso(m)
  return (
    <Link href={href} title={m.titulo}
      className="group/card relative aspect-[2/3] w-40 shrink-0 snap-start overflow-hidden rounded-2xl border border-white/10 shadow-md transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl sm:w-48 lg:w-52">
      {m.imagemUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.imagemUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover/card:scale-105" />
      ) : (
        // Pôster gerado (módulo sem imagem): cor do produto + textura + nome em destaque.
        <div className="absolute inset-0" style={{ background: `radial-gradient(120% 80% at 30% 0%, color-mix(in srgb, ${cor} 75%, #fff 10%), transparent 60%), linear-gradient(170deg, color-mix(in srgb, ${cor} 85%, #000), #0b0820 92%)` }}>
          <span aria-hidden className="absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.07) 1px,transparent 1px)', backgroundSize: '18px 18px' }} />
          <span aria-hidden className="absolute -right-3 top-2 select-none text-[110px] font-black italic leading-none text-white/[.08]">{n}</span>
        </div>
      )}
      {/* sombra inferior + título */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-3 pb-3 pt-16">
        <div className={`font-extrabold uppercase leading-[1.05] tracking-tight text-[#F1C232] ${nome.length > 28 ? 'text-[15px]' : 'text-lg'} ${m.imagemUrl ? 'line-clamp-2' : 'line-clamp-4'}`}>{nome}</div>
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-white/80">
          {!m.liberado ? <><Lock className="h-3 w-3" />{m.exclusivo ? 'conteúdo exclusivo' : m.liberaEm ? `libera em ${fmtData(m.liberaEm)}` : 'bloqueado'}</> : <>{p.total} {p.total === 1 ? 'aula' : 'aulas'}{p.lidas ? ` · ${p.pct}%` : ''}</>}
        </div>
        {m.liberado && p.lidas > 0 && (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-[#F1C232]" style={{ width: `${p.pct}%` }} /></div>
        )}
      </div>
      {!m.liberado && <span className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white"><Lock className="h-3.5 w-3.5" /></span>}
      {m.liberado && p.total > 0 && p.lidas === p.total && <span className="absolute right-2 top-2 rounded-full bg-[#F1C232] p-1 text-[#2A1A55]"><CheckCircle2 className="h-4 w-4" /></span>}
    </Link>
  )
}

/* ═════════════════════════ DETALHE (página do módulo) ═════════════════════════ */

export function ModuloDetalhe({ modulos, atual, slug, cor }: { modulos: ModuloAluno[]; atual: ModuloAluno; slug: string; cor: string }) {
  const [busca, setBusca] = useState('')
  const q = fold(busca.trim())
  const p = progresso(atual)
  const idx = modulos.findIndex((m) => m.id === atual.id)
  const ant = idx > 0 ? modulos[idx - 1] : null
  const prox = idx >= 0 && idx < modulos.length - 1 ? modulos[idx + 1] : null
  const filtra = (l: AulaAluno[]) => (q ? l.filter((a) => fold(a.titulo).includes(q)) : l)

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      {/* ÍNDICE dos módulos (desktop) — navega entre as páginas de módulo */}
      <aside className="hidden lg:sticky lg:top-4 lg:block">
        <div className="rounded-2xl border bg-card p-3 shadow-sm">
          <div className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Módulos</div>
          <nav className="max-h-[calc(100vh-10rem)] space-y-0.5 overflow-y-auto overscroll-contain">
            {modulos.map((m, i) => {
              const pm = progresso(m), on = m.id === atual.id, feito = pm.total > 0 && pm.lidas === pm.total
              return (
                <Link key={m.id} href={hrefModulo(slug, m.id)} aria-current={on ? 'page' : undefined}
                  className={`flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors ${on ? 'bg-muted' : 'hover:bg-muted/60'}`}>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
                    style={feito || on ? { background: cor, color: '#fff' } : { background: `color-mix(in srgb, ${cor} 14%, transparent)`, color: cor }}>
                    {feito ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`line-clamp-2 text-[13px] leading-snug ${on ? 'font-semibold' : 'font-medium'}`}>{m.titulo}</span>
                    <span className="text-[11px] text-muted-foreground">{pm.lidas}/{pm.total} aulas</span>
                  </span>
                  {!m.liberado && <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                </Link>
              )
            })}
          </nav>
        </div>
      </aside>

      <div className="min-w-0 space-y-4">
        {/* Cabeçalho do módulo: capa + título + progresso */}
        <div className="flex gap-4 rounded-2xl border bg-card p-4 shadow-sm">
          <div className="relative hidden aspect-[2/3] w-24 shrink-0 overflow-hidden rounded-xl sm:block"
            style={atual.imagemUrl ? undefined : { background: `linear-gradient(170deg, color-mix(in srgb, ${cor} 85%, #000), #0b0820)` }}>
            {atual.imagemUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={atual.imagemUrl} alt="" className="h-full w-full object-cover" />
              : <span className="absolute inset-0 flex items-end p-2 text-[11px] font-extrabold uppercase leading-tight text-[#F1C232]">{atual.titulo}</span>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Módulo {idx + 1} de {modulos.length}</div>
            <h1 className="mt-0.5 text-xl font-bold leading-tight tracking-tight sm:text-2xl">{atual.titulo}</h1>
            {atual.descricao && <p className="mt-1 text-sm text-muted-foreground">{atual.descricao}</p>}
            {!atual.liberado && (atual.exclusivo || atual.liberaEm) && <p className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground"><Lock className="h-3.5 w-3.5" />{atual.exclusivo ? 'Conteúdo exclusivo — não disponível para o seu perfil' : `Libera em ${fmtData(atual.liberaEm!)}`}</p>}
            <div className="mt-3 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${p.pct}%`, background: cor }} /></div>
              <span className="whitespace-nowrap text-xs font-medium tabular-nums text-muted-foreground">{p.lidas}/{p.total} aulas · {p.pct}%</span>
            </div>
          </div>
        </div>

        {/* Busca */}
        {p.total > 6 && (
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar aula neste módulo…"
              className="h-10 w-full rounded-xl border bg-card pl-9 pr-9 text-sm outline-none focus:ring-2 focus:ring-[color:var(--ring)]" />
            {busca && <button type="button" onClick={() => setBusca('')} aria-label="Limpar busca" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>}
          </label>
        )}

        {/* Aulas em LINHA ÚNICA (numeradas) */}
        <ListaAulas aulas={filtra(atual.aulas)} cor={cor} />
        {atual.submodulos.map((s) => {
          const l = filtra(todasAulas(s))
          if (!l.length) return null
          return (
            <div key={s.id} className="space-y-2">
              <h2 className="px-1 pt-2 text-sm font-semibold">{s.titulo}{!s.liberado && s.liberaEm ? <span className="ml-2 text-xs font-normal text-muted-foreground">libera em {fmtData(s.liberaEm)}</span> : null}</h2>
              <ListaAulas aulas={l} cor={cor} />
            </div>
          )
        })}
        {q && !filtra(todasAulas(atual)).length && (
          <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma aula encontrada para “{busca}”.</div>
        )}

        {/* Navegação entre módulos */}
        <div className="flex flex-wrap justify-between gap-3 pt-2">
          {ant ? <Link href={hrefModulo(slug, ant.id)} className="inline-flex max-w-[48%] items-center gap-1.5 rounded-xl border bg-card px-3 py-2 text-sm hover:bg-muted/60"><ChevronLeft className="h-4 w-4 shrink-0" /><span className="truncate">{ant.titulo}</span></Link> : <span />}
          {prox && <Link href={hrefModulo(slug, prox.id)} className="ml-auto inline-flex max-w-[48%] items-center gap-1.5 rounded-xl border bg-card px-3 py-2 text-sm hover:bg-muted/60"><span className="truncate">{prox.titulo}</span><ChevronRight className="h-4 w-4 shrink-0" /></Link>}
        </div>
      </div>
    </div>
  )
}

function ListaAulas({ aulas, cor }: { aulas: AulaAluno[]; cor: string }) {
  if (!aulas.length) return null
  return (
    <ol className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
      {aulas.map((a, i) => <li key={a.id}><AulaLinha a={a} n={i + 1} cor={cor} /></li>)}
    </ol>
  )
}

function iconeAula(a: AulaAluno) {
  if (!a.liberada) return Lock
  if (a.tipoRef === 'video_url' || a.subtipo === 'videoaula' || a.subtipo === 'video') return PlayCircle
  if (a.tipoRef === 'simulado' || a.tipoRef === 'quiz') return ClipboardList
  if (a.tipoRef === 'link') return ExternalLink
  return FileText
}

function AulaLinha({ a, n, cor }: { a: AulaAluno; n: number; cor: string }) {
  const Icon = iconeAula(a)
  const rotulo = (a.subtipo && SUBTIPO_LABEL[a.subtipo]) || null
  const corpo = (
    <>
      <span className="w-6 shrink-0 text-center text-xs font-semibold tabular-nums text-muted-foreground">{n}</span>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={a.lida ? { background: cor, color: '#fff' } : a.liberada ? { background: `color-mix(in srgb, ${cor} 12%, transparent)`, color: cor } : undefined}>
        {a.lida ? <CheckCircle2 className="h-4 w-4" /> : <Icon className={`h-4 w-4 ${a.liberada ? '' : 'text-muted-foreground'}`} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-medium leading-snug ${a.liberada ? '' : 'text-muted-foreground'}`}>{a.titulo}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {rotulo && <span className="rounded-md bg-muted px-1.5 py-px font-semibold uppercase tracking-wide">{rotulo}</span>}
          {!a.liberada && a.exclusivo && <span>conteúdo exclusivo</span>}
          {!a.liberada && !a.exclusivo && a.liberaEm && <span>libera em {fmtData(a.liberaEm)}</span>}
          {a.lida && <span style={{ color: cor }}>lida</span>}
        </span>
      </span>
      {a.href && (a.externo ? <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />)}
    </>
  )
  const cls = 'flex items-center gap-3 px-3 py-3'
  if (!a.href) return <div className={`${cls} ${a.liberada ? '' : 'opacity-70'}`}>{corpo}</div>
  if (a.externo) return <a href={a.href} target="_blank" rel="noreferrer" className={`${cls} transition-colors hover:bg-muted/50`}>{corpo}</a>
  return <Link href={a.href} className={`${cls} transition-colors hover:bg-muted/50`}>{corpo}</Link>
}
