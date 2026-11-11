'use client'

// Conteúdo do curso (extensivo), em DUAS visões:
//  • <ModulosVitrine>  — página do extensivo: carrosséis de PÔSTERES dos módulos (estilo Netflix/Curseduca),
//    com a imagem do módulo (configurador → módulo → imagem; ideal vertical 2:3). Sem imagem, um pôster
//    gerado com a cor do produto e o nome do módulo. Cada card abre a página do módulo.
//  • <ModuloDetalhe>   — página do módulo: índice dos módulos com progresso à esquerda (desktop) e as
//    aulas do módulo em LINHA ÚNICA, com busca, cadeado/data de liberação e marca de "lida".
// Os dados vêm prontos do servidor (curriculoDoAluno: disponibilidade, links e "lida" já resolvidos).
import { useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, ChevronDown, CalendarDays, ClipboardList, ExternalLink, FileText, Lock, PlayCircle, Search, CheckCircle2, X, Play } from 'lucide-react'
import type { ModuloAluno, AulaAluno } from '@/lib/produtos/curriculo-aluno'
import type { VitrineLayout } from '@/lib/produtos/tipos'
import { SUBTIPO_LABEL } from '@/lib/produtos/curriculo'

export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export const fmtData = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }) : '')
export const hrefModulo = (slug: string, id: string) => `/aluno/extensivos/${slug}/modulo/${id}`

export function todasAulas(m: ModuloAluno): AulaAluno[] { return [...m.aulas, ...m.submodulos.flatMap(todasAulas)] }
// O card Cronograma não é "aula leitável": fica fora das contagens de progresso/"continuar".
const contavel = (x: AulaAluno) => x.tipoRef !== 'cronograma'
export function progresso(m: ModuloAluno) {
  const a = todasAulas(m).filter(contavel), lidas = a.filter((x) => x.lida).length
  return { total: a.length, lidas, pct: a.length ? Math.round((lidas / a.length) * 100) : 0 }
}

/**
 * Fileiras da vitrine: módulos cujo título começa com o MESMO prefixo "X - " (≥2 módulos, ex.: "LegProc - …")
 * ganham fileira própria com o nome do prefixo (e o card mostra só o resto do título); os demais ficam na
 * fileira "Módulos do curso". Ordem do configurador preservada dentro de cada fileira.
 */
function fileiras(modulos: ModuloAluno[], tituloPrincipal = 'Módulos do curso') {
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
  if (principal.length) out.push({ titulo: tituloPrincipal, itens: principal })
  for (const [p, itens] of grupos) out.push({ titulo: p, itens })
  return out
}

/* ═════════════════════════ VITRINE (página do extensivo) ═════════════════════════ */

/** Card "Seu progresso / Continuar de onde parou" (progresso geral do currículo + 1ª aula liberada não lida). */
export function ProgressoGeral({ modulos, slug, cor }: { modulos: ModuloAluno[]; slug: string; cor: string }) {
  const geral = useMemo(() => {
    const a = modulos.flatMap(todasAulas).filter(contavel), lidas = a.filter((x) => x.lida).length
    return { total: a.length, lidas, pct: a.length ? Math.round((lidas / a.length) * 100) : 0 }
  }, [modulos])
  // "Continuar": 1ª aula liberada e ainda não lida, na ordem do curso.
  const continuar = useMemo(() => {
    for (const m of modulos) for (const a of todasAulas(m)) if (a.liberada && !a.lida && a.href && contavel(a)) return { m, a }
    return null
  }, [modulos])
  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm @xl:flex-row @xl:items-center">
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
          className="flex min-w-0 items-center gap-3 rounded-xl px-4 py-2.5 shadow-sm transition-opacity hover:opacity-90 @xl:max-w-sm"
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
  )
}

/** Visão ANTIGA (produto sem blocos): progresso + todos os módulos. Mantida por compatibilidade. */
export function ModulosVitrine({ modulos, slug, cor, layout = 'netflix' }: { modulos: ModuloAluno[]; slug: string; cor: string; layout?: VitrineLayout }) {
  return (
    <div className="@container space-y-7">
      <ProgressoGeral modulos={modulos} slug={slug} cor={cor} />
      <SecaoModulos modulos={modulos} slug={slug} cor={cor} layout={layout} agruparPrefixo />
    </div>
  )
}

/**
 * Uma SEÇÃO (prateleira) de módulos. `titulo` = cabeçalho; `agruparPrefixo` reproduz as fileiras por prefixo
 * "X - " (comportamento original); `recolhivel` põe um cabeçalho clicável que abre/fecha a seção.
 */
export type LayoutModulos = VitrineLayout | 'poster'

export function SecaoModulos({ modulos, slug, cor, layout = 'netflix', titulo, tituloNode, agruparPrefixo = false, recolhivel = false, recolhida = false }: {
  modulos: ModuloAluno[]; slug: string; cor: string; layout?: LayoutModulos
  titulo?: string; agruparPrefixo?: boolean; recolhivel?: boolean; recolhida?: boolean
  /** Edição inline: substitui o texto do título (mesmo lugar/estilo) — o texto continua sendo `titulo`. */
  tituloNode?: ReactNode
}) {
  const [aberta, setAberta] = useState(!recolhida)
  const comFileiras = layout === 'netflix' || layout === 'grade' || layout === 'poster'
  // Nas fileiras (carrossel/grade) o título é da própria fileira; fora delas (ou recolhível) a seção tem cabeçalho próprio.
  const cabecalho = !!titulo && (recolhivel || !comFileiras)
  const linhas = useMemo(() => {
    if (!comFileiras) return []
    const t = cabecalho ? '' : (titulo ?? 'Módulos do curso')
    return agruparPrefixo ? fileiras(modulos, t) : [{ titulo: t, itens: modulos.map((m) => ({ m, nome: m.titulo })) }]
  }, [modulos, comFileiras, agruparPrefixo, cabecalho, titulo])
  const corpo = comFileiras
    ? linhas.map((l, i) => layout === 'grade'
      ? <GradeFileira key={l.titulo + i} titulo={l.titulo} tituloNode={l.titulo === titulo ? tituloNode : undefined} itens={l.itens} slug={slug} cor={cor} />
      : layout === 'poster'
        ? <PosterGrid key={l.titulo + i} titulo={l.titulo} tituloNode={l.titulo === titulo ? tituloNode : undefined} itens={l.itens} slug={slug} cor={cor} />
        : <Fileira key={l.titulo + i} titulo={l.titulo} tituloNode={l.titulo === titulo ? tituloNode : undefined} itens={l.itens} slug={slug} cor={cor} />)
    : layout === 'lista' ? <ListaModulos modulos={modulos} slug={slug} cor={cor} />
    : layout === 'trilha_imagem' ? <TrilhaImagem modulos={modulos} slug={slug} cor={cor} />
    : <TrilhaModulos modulos={modulos} slug={slug} cor={cor} />
  if (!cabecalho) return <div className="space-y-7">{corpo}</div>
  const contagem = <span className="text-xs text-muted-foreground">{modulos.length} {modulos.length === 1 ? 'módulo' : 'módulos'}</span>
  return (
    <section className="space-y-3">
      {recolhivel ? (
        <button type="button" onClick={() => setAberta((v) => !v)} aria-expanded={aberta} className="flex w-full items-center gap-3 text-left">
          <h2 className="text-lg font-bold tracking-tight">{tituloNode ?? titulo}</h2>{contagem}
          <ChevronDown className={`ml-auto h-5 w-5 shrink-0 text-muted-foreground transition-transform ${aberta ? 'rotate-180' : ''}`} />
        </button>
      ) : (
        <div className="flex items-center gap-3"><h2 className="text-lg font-bold tracking-tight">{tituloNode ?? titulo}</h2>{contagem}</div>
      )}
      {(!recolhivel || aberta) && <div className="space-y-7">{corpo}</div>}
    </section>
  )
}

/** Bloco "Plano de estudo" em formato CHAMADA (título + texto + botão). O formato resumo reusa o CardCronograma. */
export function ChamadaCronograma({ titulo, texto, cor }: { titulo: string; texto: string; cor: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${cor} 12%, transparent)`, color: cor }}><CalendarDays className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-snug">{titulo}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{texto || 'Organize seu estudo semana a semana e acompanhe as metas de cada dia.'}</p>
        </div>
        <Link href="/aluno/cronograma" className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition hover:opacity-90" style={{ background: cor, color: '#FFFFFF' }}>
          Abrir cronograma<ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}

/* ── Grade: as mesmas fileiras, mas cada uma numa GRADE de pôsteres (sem rolar pro lado) ── */
function GradeFileira({ titulo, tituloNode, itens, slug, cor }: { titulo: string; tituloNode?: ReactNode; itens: { m: ModuloAluno; nome: string }[]; slug: string; cor: string }) {
  return (
    <section className="space-y-3">
      {titulo && (
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold tracking-tight">{tituloNode ?? titulo}</h2>
          <span className="text-xs text-muted-foreground">{itens.length} {itens.length === 1 ? 'módulo' : 'módulos'}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 @xl:grid-cols-3 @3xl:grid-cols-4 @4xl:grid-cols-5 @6xl:grid-cols-6">
        {itens.map(({ m, nome }, i) => <Poster key={m.id} m={m} nome={nome} n={i + 1} href={hrefModulo(slug, m.id)} cor={cor} grade />)}
      </div>
    </section>
  )
}

/* ── Pôsteres: vitrine de capas grandes. Colunas automáticas pela largura do CONTAINER (≥ 11rem cada); o 1º módulo
      vira DESTAQUE (2 colunas, 4:3 — mesma altura dos vizinhos 2:3) quando há espaço. Mesmo Poster das outras visões. ── */
function PosterGrid({ titulo, tituloNode, itens, slug, cor }: { titulo: string; tituloNode?: ReactNode; itens: { m: ModuloAluno; nome: string }[]; slug: string; cor: string }) {
  return (
    <section className="space-y-3">
      {titulo && (
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold tracking-tight">{tituloNode ?? titulo}</h2>
          <span className="text-xs text-muted-foreground">{itens.length} {itens.length === 1 ? 'módulo' : 'módulos'}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 @2xl:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
        {itens.map(({ m, nome }, i) => (
          <Poster key={m.id} m={m} nome={nome} n={i + 1} href={hrefModulo(slug, m.id)} cor={cor} grade destaque={i === 0 && itens.length > 2} />
        ))}
      </div>
    </section>
  )
}

/* ── Trilha simples: jornada vertical com etapas conectadas (nó + card de texto), com progresso ── */
function TrilhaModulos({ modulos, slug, cor }: { modulos: ModuloAluno[]; slug: string; cor: string }) {
  return (
    <ol className="space-y-0">
      {modulos.map((m, i) => {
        const p = progresso(m)
        const feito = p.total > 0 && p.lidas === p.total
        const ultimo = i === modulos.length - 1
        return (
          <li key={m.id} className="relative flex gap-4 pb-4">
            {!ultimo && <span aria-hidden className="absolute left-[21px] top-11 bottom-0 w-0.5" style={{ background: `color-mix(in srgb, ${cor} 28%, transparent)` }} />}
            <span className="relative z-10 grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold shadow-sm"
              style={feito || m.liberado ? { background: cor, color: '#fff' } : { background: `color-mix(in srgb, ${cor} 14%, transparent)`, color: cor }}>
              {feito ? <CheckCircle2 className="h-5 w-5" /> : !m.liberado ? <Lock className="h-4 w-4" /> : i + 1}
            </span>
            <Link href={hrefModulo(slug, m.id)} title={m.titulo} className="min-w-0 flex-1 rounded-2xl border bg-card p-4 shadow-sm transition-colors hover:bg-muted/40">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Etapa {i + 1} de {modulos.length}</div>
                  <h3 className="truncate text-base font-bold tracking-tight">{m.titulo}</h3>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {!m.liberado
                      ? <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" />{m.exclusivo ? 'conteúdo exclusivo' : m.liberaEm ? `libera em ${fmtData(m.liberaEm)}` : 'bloqueado'}</span>
                      : <>{p.total} {p.total === 1 ? 'aula' : 'aulas'}{p.total > 0 ? ` · ${p.pct}%` : ''}</>}
                  </div>
                  {m.liberado && p.total > 0 && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${p.pct}%`, background: cor }} /></div>
                  )}
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}

/* ── Trilha com imagem (estilo Curseduca): linha central + cards em zigue-zague, capa 16:9 grande,
      progresso, "Começar/Continuar" e "Conteúdo ▾" (abre as aulas). No celular vira 1 coluna com a linha à esquerda. ── */
function TrilhaImagem({ modulos, slug, cor }: { modulos: ModuloAluno[]; slug: string; cor: string }) {
  return (
    <div className="relative">
      <span aria-hidden className="absolute bottom-0 left-[7px] top-2 w-0.5 @3xl:left-1/2 @3xl:-translate-x-1/2"
        style={{ background: `color-mix(in srgb, ${cor} 30%, transparent)` }} />
      <ol className="relative grid gap-y-6 @3xl:grid-cols-2 @3xl:gap-x-16">
        {modulos.map((m, i) => {
          const esq = i % 2 === 0
          return (
            // gridRow explícito: cada etapa na sua linha (zigue-zague). A da direita sobe ~meia altura p/ escalonar como na referência.
            <li key={m.id} style={{ gridRow: i + 1 }} className={`relative pl-9 @3xl:pl-0 ${esq ? '@3xl:col-start-1' : `@3xl:col-start-2 ${i > 0 ? '@3xl:-mt-32' : ''}`}`}>
              <span aria-hidden className={`absolute left-0 top-10 z-10 h-4 w-4 rounded-full border-2 bg-background @3xl:top-24 ${esq ? '@3xl:left-auto @3xl:-right-8 @3xl:translate-x-1/2' : '@3xl:-left-8 @3xl:-translate-x-1/2'}`}
                style={{ borderColor: cor }} />
              <CardTrilha m={m} n={i + 1} href={hrefModulo(slug, m.id)} cor={cor} />
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function CardTrilha({ m, n, href, cor }: { m: ModuloAluno; n: number; href: string; cor: string }) {
  const [aberto, setAberto] = useState(false)
  const p = progresso(m)
  const cta = p.lidas > 0 ? 'Continuar' : 'Começar'
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      {/* Capa 16:9 (imagem do módulo; sem imagem → capa gerada com a cor do produto e o nome) */}
      <Link href={href} title={m.titulo} className="group/capa relative block aspect-video overflow-hidden">
        {m.imagemUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.imagemUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover/capa:scale-105" />
        ) : (
          <div className="absolute inset-0" style={{ background: `radial-gradient(120% 90% at 20% 0%, color-mix(in srgb, ${cor} 75%, #fff 10%), transparent 60%), linear-gradient(160deg, color-mix(in srgb, ${cor} 85%, #000), var(--pn-0b0820,#0b0820) 92%)` }}>
            <span aria-hidden className="absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.07) 1px,transparent 1px)', backgroundSize: '18px 18px' }} />
            <span aria-hidden className="absolute -right-2 -top-4 select-none text-[120px] font-black italic leading-none text-white/[.08]">{n}</span>
            <span className="absolute inset-x-4 bottom-3 line-clamp-2 text-xl font-extrabold leading-tight text-[color:var(--pn-f1c232,#F1C232)]">{m.titulo}</span>
          </div>
        )}
        {!m.liberado && <span className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white"><Lock className="h-3.5 w-3.5" /></span>}
      </Link>

      <div className="space-y-2 px-4 pt-3">
        <div className="truncate text-xs font-bold" style={{ color: cor }} title={m.titulo}>{m.titulo}</div>
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${p.pct}%`, background: cor }} /></div>
          <span className="text-[11px] tabular-nums text-muted-foreground">{p.pct}%</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 px-4 py-3">
        {m.liberado
          ? <Link href={href} className="text-sm font-bold hover:underline" style={{ color: cor }}>{cta}</Link>
          : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Lock className="h-3 w-3" />{m.exclusivo ? 'conteúdo exclusivo' : m.liberaEm ? `libera em ${fmtData(m.liberaEm)}` : 'bloqueado'}</span>}
        <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}
          className="inline-flex items-center gap-1 rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted/70">
          Conteúdo <ChevronDown className={`h-3.5 w-3.5 transition-transform ${aberto ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {aberto && (
        <div className="space-y-3 border-t p-3">
          {todasAulas(m).length ? <ListaAulas aulas={todasAulas(m)} cor={cor} /> : <p className="px-1 py-2 text-xs text-muted-foreground">Sem aulas neste módulo ainda.</p>}
        </div>
      )}
    </div>
  )
}

/* ── Lista / acordeão: módulos empilhados; cada um abre e mostra as aulas (ListaAulas) ── */
function ListaModulos({ modulos, slug, cor }: { modulos: ModuloAluno[]; slug: string; cor: string }) {
  return (
    <div className="space-y-3">
      {modulos.map((m, i) => <ModuloAccordion key={m.id} m={m} n={i + 1} slug={slug} cor={cor} />)}
    </div>
  )
}

function ModuloAccordion({ m, n, slug, cor }: { m: ModuloAluno; n: number; slug: string; cor: string }) {
  const p = progresso(m)
  const feito = p.total > 0 && p.lidas === p.total
  const [aberto, setAberto] = useState(n === 1)
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[13px] font-bold"
          style={feito || m.liberado ? { background: cor, color: '#fff' } : { background: `color-mix(in srgb, ${cor} 14%, transparent)`, color: cor }}>
          {feito ? <CheckCircle2 className="h-4 w-4" /> : !m.liberado ? <Lock className="h-3.5 w-3.5" /> : n}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{m.titulo}</span>
          <span className="text-[11px] text-muted-foreground">
            {!m.liberado
              ? (m.exclusivo ? 'conteúdo exclusivo' : m.liberaEm ? `libera em ${fmtData(m.liberaEm)}` : 'bloqueado')
              : `${p.lidas}/${p.total} aulas${p.lidas ? ` · ${p.pct}%` : ''}`}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {aberto && (
        <div className="space-y-3 border-t p-3">
          <ListaAulas aulas={m.aulas} cor={cor} />
          {m.submodulos.map((s) => {
            const aulas = todasAulas(s)
            if (!aulas.length) return null
            return (
              <div key={s.id} className="space-y-2">
                <h3 className="px-1 text-xs font-semibold text-muted-foreground">{s.titulo}</h3>
                <ListaAulas aulas={aulas} cor={cor} />
              </div>
            )
          })}
          {p.total === 0 && <p className="px-1 py-2 text-xs text-muted-foreground">Sem aulas neste módulo ainda.</p>}
          <Link href={hrefModulo(slug, m.id)} className="inline-flex items-center gap-1 px-1 text-xs font-semibold" style={{ color: cor }}>
            Abrir módulo <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </div>
  )
}

function Fileira({ titulo, tituloNode, itens, slug, cor }: { titulo: string; tituloNode?: ReactNode; itens: { m: ModuloAluno; nome: string }[]; slug: string; cor: string }) {
  const trilho = useRef<HTMLDivElement>(null)
  const rolar = (dir: number) => { const el = trilho.current; if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' }) }
  return (
    <section className="space-y-3">
      {titulo && (
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold tracking-tight">{tituloNode ?? titulo}</h2>
          <span className="text-xs text-muted-foreground">{itens.length} {itens.length === 1 ? 'módulo' : 'módulos'}</span>
        </div>
      )}
      <div className="group/fileira relative">
        <div ref={trilho} className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {itens.map(({ m, nome }, i) => <Poster key={m.id} m={m} nome={nome} n={i + 1} href={hrefModulo(slug, m.id)} cor={cor} />)}
        </div>
        {itens.length > 3 && (
          <>
            <button type="button" aria-label="Anterior" onClick={() => rolar(-1)}
              className="absolute left-0 top-1/2 hidden h-24 w-10 -translate-y-1/2 items-center justify-center rounded-r-xl bg-black/55 text-white opacity-0 transition-opacity group-hover/fileira:opacity-100 @3xl:flex">
              <ChevronLeft className="h-7 w-7" />
            </button>
            <button type="button" aria-label="Próximo" onClick={() => rolar(1)}
              className="absolute right-0 top-1/2 hidden h-24 w-10 -translate-y-1/2 items-center justify-center rounded-l-xl bg-black/55 text-white opacity-0 transition-opacity group-hover/fileira:opacity-100 @3xl:flex">
              <ChevronRight className="h-7 w-7" />
            </button>
          </>
        )}
      </div>
    </section>
  )
}

export function Poster({ m, nome, n, href, cor, grade, destaque, stats }: { m: ModuloAluno; nome: string; n: number; href: string; cor: string; grade?: boolean; destaque?: boolean; stats?: { total: number; lidas: number; pct: number } }) {
  // `stats` = progresso já calculado no servidor (quando o módulo chega sem as aulas); senão deriva do próprio módulo.
  const p = stats ?? progresso(m)
  return (
    <Link href={href} title={m.titulo}
      className={`group/card relative aspect-[2/3] overflow-hidden rounded-2xl border border-white/10 shadow-md transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl ${grade ? 'w-full' : 'w-40 shrink-0 snap-start @xl:w-48 @4xl:w-52'} ${destaque ? '@2xl:col-span-2 @2xl:aspect-[4/3]' : ''}`}>
      {m.imagemUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.imagemUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover/card:scale-105" />
      ) : (
        // Pôster gerado (módulo sem imagem): cor do produto + textura + nome em destaque.
        <div className="absolute inset-0" style={{ background: `radial-gradient(120% 80% at 30% 0%, color-mix(in srgb, ${cor} 75%, #fff 10%), transparent 60%), linear-gradient(170deg, color-mix(in srgb, ${cor} 85%, #000), var(--pn-0b0820,#0b0820) 92%)` }}>
          <span aria-hidden className="absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.07) 1px,transparent 1px)', backgroundSize: '18px 18px' }} />
          <span aria-hidden className="absolute -right-3 top-2 select-none text-[110px] font-black italic leading-none text-white/[.08]">{n}</span>
        </div>
      )}
      {/* sombra inferior + título */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-3 pb-3 pt-16">
        {m.ocultarTitulo ? null : <div className={`font-extrabold uppercase leading-[1.05] tracking-tight text-[color:var(--pn-f1c232,#F1C232)] ${nome.length > 28 ? 'text-[15px]' : 'text-lg'} ${m.imagemUrl ? 'line-clamp-2' : 'line-clamp-4'}`}>{nome}</div>}
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-white/80">
          {!m.liberado ? <><Lock className="h-3 w-3" />{m.exclusivo ? 'conteúdo exclusivo' : m.liberaEm ? `libera em ${fmtData(m.liberaEm)}` : 'bloqueado'}</> : <>{p.total} {p.total === 1 ? 'aula' : 'aulas'}{p.lidas ? ` · ${p.pct}%` : ''}</>}
        </div>
        {m.liberado && p.total > 0 && (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-[color:var(--pn-f1c232,#F1C232)]" style={{ width: `${p.pct}%` }} /></div>
        )}
      </div>
      {!m.liberado && <span className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white"><Lock className="h-3.5 w-3.5" /></span>}
      {m.liberado && p.total > 0 && p.lidas === p.total && <span className="absolute right-2 top-2 rounded-full bg-[color:var(--pn-f1c232,#F1C232)] p-1 text-[color:var(--pn-2a1a55,#2A1A55)]"><CheckCircle2 className="h-4 w-4" /></span>}
    </Link>
  )
}

/* DETALHE (página do módulo) → ./modulo-detalhe.tsx (aulas agrupadas por tipo de material) */

export function ListaAulas({ aulas, cor }: { aulas: AulaAluno[]; cor: string }) {
  if (!aulas.length) return null
  const crono = aulas.filter((a) => a.tipoRef === 'cronograma')
  const demais = aulas.filter((a) => a.tipoRef !== 'cronograma')
  return (
    <div className="space-y-3">
      {demais.length > 0 && (
        <ol className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
          {demais.map((a, i) => <li key={a.id}><AulaLinha a={a} n={i + 1} cor={cor} /></li>)}
        </ol>
      )}
      {crono.map((a) => <CardCronograma key={a.id} a={a} cor={cor} />)}
    </div>
  )
}

/** Card "Plano de estudo" (item Cronograma do currículo). SÓ LEITURA: resumo pronto do servidor + atalho ao plano completo. */
export function CardCronograma({ a, cor }: { a: AulaAluno; cor: string }) {
  const r = a.cronograma
  const bloqueado = !a.liberada
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${cor} 12%, transparent)`, color: cor }}>
          {bloqueado ? <Lock className="h-5 w-5 text-muted-foreground" /> : <CalendarDays className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Plano de estudo</div>
          <div className="text-sm font-semibold leading-snug">{a.titulo}{r?.temPlano && r.titulo && r.titulo !== a.titulo ? <span className="font-normal text-muted-foreground"> · {r.titulo}</span> : null}</div>
          {bloqueado ? (
            <p className="mt-1 text-xs text-muted-foreground">{a.exclusivo ? 'Conteúdo exclusivo — não disponível para o seu perfil' : a.liberaEm ? `Libera em ${fmtData(a.liberaEm)}` : 'Indisponível no momento'}</p>
          ) : !r?.temPlano ? (
            <p className="mt-1 text-xs text-muted-foreground">Você ainda não tem um cronograma. Gere o seu para organizar o estudo semana a semana.</p>
          ) : r.modo === 'adaptativo' ? (
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${r.pctSemana}%`, background: cor }} /></div>
                <span className="whitespace-nowrap text-xs font-medium tabular-nums text-muted-foreground">{r.pctSemana}% da semana{r.pendencias > 0 ? ` · ${r.pendencias} atrasada${r.pendencias > 1 ? 's' : ''}` : ''}</span>
              </div>
              {r.metas.length > 0 ? (
                <ul className="space-y-1">
                  {r.metas.map((m, i) => (
                    <li key={i} className="flex items-baseline gap-2 text-xs"><span className="h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full" style={{ background: cor }} /><span className="min-w-0 flex-1 truncate font-medium">{m.titulo}</span>{m.sub && <span className="shrink-0 text-muted-foreground">{m.sub}</span>}</li>
                  ))}
                </ul>
              ) : <p className="text-xs text-muted-foreground">{r.totalHoje > 0 ? 'Metas de hoje concluídas.' : 'Sem metas para hoje.'}</p>}
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">{r.totalSemanas ? `${r.totalSemanas} semanas · ` : ''}{r.criadoEm ? `gerado em ${fmtData(r.criadoEm)}` : 'cronograma gerado'}</p>
          )}
        </div>
        {!bloqueado && (
          <Link href={r?.temPlano ? r.href : '/aluno/cronograma'} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90" style={{ background: cor }}>
            {r?.temPlano ? 'Abrir cronograma' : 'Gerar cronograma'}<ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  )
}

function iconeAula(a: AulaAluno) {
  if (!a.liberada) return Lock
  if (a.tipoRef === 'video_url' || a.subtipo === 'videoaula' || a.subtipo === 'video') return PlayCircle
  if (a.tipoRef === 'simulado' || a.tipoRef === 'quiz') return ClipboardList
  if (a.tipoRef === 'link') return ExternalLink
  return FileText
}

/** Colunas tabulares da lista de aulas (só em container largo; no estreito vira subtítulo compacto). */
const COL_TIPO = '@3xl:w-24', COL_ONDE = '@3xl:w-56', COL_DATA = '@3xl:w-28'
export function CabecalhoAulas() {
  return (
    <div aria-hidden className="hidden items-center gap-3 border-b bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground @3xl:flex">
      <span className="w-6 shrink-0 text-center">#</span>
      <span className="w-9 shrink-0" />
      <span className="min-w-0 flex-1">Aula</span>
      <span className={`shrink-0 ${COL_TIPO}`}>Tipo</span>
      <span className={`shrink-0 ${COL_ONDE}`}>Onde parou</span>
      <span className={`shrink-0 ${COL_DATA}`}>Último acesso</span>
      <span className={`shrink-0 ${COL_DATA}`}>Concluída em</span>
      <span className="w-4 shrink-0" />
    </div>
  )
}

/** `tabular` = lista larga com colunas (Tipo | Onde parou | Último acesso | Concluída em); sem ele, só o subtítulo compacto. */
export function AulaLinha({ a, n, cor, tabular }: { a: AulaAluno; n: number; cor: string; tabular?: boolean }) {
  const Icon = iconeAula(a)
  const rotulo = (a.subtipo && SUBTIPO_LABEL[a.subtipo]) || null
  const L = a.leituraFmt ?? null
  const compacto = tabular ? '@3xl:hidden' : ''
  const corpo = (
    <>
      <span className="w-6 shrink-0 text-center text-xs font-semibold tabular-nums text-muted-foreground">{n}</span>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={a.lida ? { background: cor, color: '#fff' } : a.liberada ? { background: `color-mix(in srgb, ${cor} 12%, transparent)`, color: cor } : undefined}>
        {a.lida ? <CheckCircle2 className="h-4 w-4" /> : <Icon className={`h-4 w-4 ${a.liberada ? '' : 'text-muted-foreground'}`} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-medium leading-snug ${a.liberada ? '' : 'text-muted-foreground'}`}>{a.titulo}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
          {rotulo && <span className={`rounded-md bg-muted px-1.5 py-px font-semibold uppercase tracking-wide ${compacto}`}>{rotulo}</span>}
          {!a.liberada && a.exclusivo && <span>conteúdo exclusivo</span>}
          {!a.liberada && !a.exclusivo && a.liberaEm && <span>libera em {fmtData(a.liberaEm)}</span>}
          {a.lida && <span style={{ color: cor }}>lida</span>}
          {L?.onde && <span className={`font-medium text-foreground/80 ${compacto}`}>{L.onde}</span>}
          {L?.ultimo && <span className={compacto}>Último acesso: {L.ultimo}</span>}
          {L?.concluida && <span className={compacto} style={{ color: cor }}>Concluída em {L.concluida}</span>}
        </span>
        {L?.pct != null && <span aria-hidden className="mt-1 block h-1 max-w-xs overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full" style={{ width: `${L.pct}%`, background: cor }} /></span>}
      </span>
      {tabular && (
        <>
          <span className={`hidden shrink-0 text-[11px] @3xl:block ${COL_TIPO}`}>{rotulo && <span className="rounded-md bg-muted px-1.5 py-px font-semibold uppercase tracking-wide text-muted-foreground">{rotulo}</span>}</span>
          <span className={`hidden shrink-0 text-xs @3xl:block ${COL_ONDE}`}>{L?.onde ?? <span className="text-muted-foreground">—</span>}</span>
          <span className={`hidden shrink-0 text-xs tabular-nums @3xl:block ${COL_DATA}`}>{L?.ultimo ?? <span className="text-muted-foreground">—</span>}</span>
          <span className={`hidden shrink-0 text-xs tabular-nums @3xl:block ${COL_DATA}`}>{L?.concluida ? <span style={{ color: cor }}>{L.concluida}</span> : <span className="text-muted-foreground">—</span>}</span>
        </>
      )}
      {!a.href && tabular && <span aria-hidden className="hidden w-4 shrink-0 @3xl:block" />}
      {a.href && (a.externo ? <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />)}
    </>
  )
  const cls = 'flex items-center gap-3 px-3 py-3'
  if (!a.href) return <div className={`${cls} ${a.liberada ? '' : 'opacity-70'}`}>{corpo}</div>
  if (a.externo) return <a href={a.href} target="_blank" rel="noreferrer" className={`${cls} transition-colors hover:bg-muted/50`}>{corpo}</a>
  return <Link href={a.href} className={`${cls} transition-colors hover:bg-muted/50`}>{corpo}</Link>
}
