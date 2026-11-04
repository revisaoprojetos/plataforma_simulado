import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getSessaoAluno } from '@/lib/aluno-session'
import { vitrineDoAluno, progressoExtensivo, avisosDoProduto, getExtensivoDoAluno, curriculoDoExtensivo, type VitrineSecao, type VitrineItem } from '@/lib/produtos/aluno'
import { ModulosVitrine } from './curriculo'
import { PRODUTO_TIPOS } from '@/lib/produtos/tipos'
import { ArrowLeft, ClipboardList, BookOpen, CalendarDays, CalendarClock, ChevronRight, Megaphone, Pin, Layers, Wrench } from 'lucide-react'

export const dynamic = 'force-dynamic'

const labelTipo = (t: string) => PRODUTO_TIPOS.find((x) => x.v === t)?.label ?? t

// Dimensões do card por tamanho da seção (espelha os layouts da Curseduca).
const CARD: Record<string, string> = {
  vertical_small: 'w-36 aspect-[3/4]',
  vertical_large: 'w-44 aspect-[3/4]',
  horizontal_small: 'w-56 aspect-video',
  horizontal_large: 'w-72 aspect-video',
  destaque: 'w-[22rem] aspect-[21/9]',
}
function iconeItem(tipo: string) {
  if (tipo === 'simulado') return ClipboardList
  if (tipo === 'cronograma') return CalendarDays
  return BookOpen
}

export default async function ExtensivoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const ext = await getExtensivoDoAluno(sessao.tenantId, sessao.estudanteId, slug)
  if (!ext) notFound()
  // Modo "em edição/manutenção": bloqueio TOTAL — todos os alunos (até matriculados) veem a mensagem de
  // atualização. Bypass: admin VISUALIZANDO a conta (impersonation) ignora o bloqueio p/ conferir antes de publicar.
  if (ext.bloqueado && !sessao.impersonation) {
    return (
      <div className="w-full">
        <Link href="/aluno/extensivos" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />Meus Extensivos
        </Link>
        <div className="mx-auto mt-10 max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Wrench className="h-7 w-7" />
          </span>
          <h1 className="text-lg font-bold tracking-tight">Produto em atualização</h1>
          <p className="mt-2 text-sm text-muted-foreground">Este produto está temporariamente indisponível enquanto preparamos melhorias. Volte em breve.</p>
          <Link href="/aluno/extensivos" className="mt-5 inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">
            <ArrowLeft className="h-4 w-4" />Voltar para Meus Extensivos
          </Link>
        </div>
      </div>
    )
  }
  const [vit, prog, avisos, curriculo] = await Promise.all([
    vitrineDoAluno(sessao.tenantId, sessao.estudanteId, slug),
    progressoExtensivo(sessao.tenantId, sessao.estudanteId, ext.id),
    avisosDoProduto(sessao.tenantId, ext.id),
    curriculoDoExtensivo(sessao.tenantId, sessao.estudanteId, ext.id, slug),
  ])
  if (!vit) notFound()
  const pct = prog.total > 0 ? Math.round((prog.feitos / prog.total) * 100) : 0
  const cor = vit.cor || 'var(--brand-primary, var(--primary))'
  const cor2 = vit.cor_secundaria || cor
  // Fallback: produto sem vitrine montada → lista simples do que foi liberado.
  // "Acessos incluídos" etc. só quando NÃO há vitrine NEM currículo (era o único conteúdo antes do currículo).
  const semVitrine = vit.secoes.length === 0 && curriculo.length === 0
  const fallback = ext

  return (
    <div className="w-full space-y-6">
      <Link href="/aluno/extensivos" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />Meus Extensivos
      </Link>

      {/* Cabeçalho branded (banner/cor/logo do produto) */}
      <div className="relative overflow-hidden rounded-3xl border p-6 text-white shadow-sm sm:p-8"
        style={vit.banner_url
          ? { backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${cor} 82%, transparent), color-mix(in srgb, ${cor2} 60%, #000)), url(${vit.banner_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : { background: `linear-gradient(135deg, ${cor}, color-mix(in srgb, ${cor2} 60%, #000))` }}>
        {vit.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={vit.logo_url} alt="" className="mb-3 h-9 w-auto" />
        )}
        <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium backdrop-blur-sm">{labelTipo(vit.tipo)}</span>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{vit.nome}</h1>
        {vit.descricao && <p className="mt-1 max-w-2xl text-sm text-white/85">{vit.descricao}</p>}
        {vit.expira_em && (
          <div className="mt-3 inline-flex items-center gap-1 text-xs text-white/85"><CalendarClock className="h-3.5 w-3.5" />Acesso até {new Date(vit.expira_em).toLocaleDateString('pt-BR')}</div>
        )}
      </div>

      {/* Avisos */}
      {avisos.length > 0 && (
        <div className="space-y-2">
          {avisos.map((a) => (
            <div key={a.id} className="flex items-start gap-3 rounded-2xl border bg-card p-4 shadow-sm">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${cor} 15%, transparent)`, color: cor }}>
                {a.fixado ? <Pin className="h-4 w-4" /> : <Megaphone className="h-4 w-4" />}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold">{a.titulo}</div>
                {a.corpo && <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground">{a.corpo}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Progresso */}
      {prog && prog.total > 0 && (
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold">Seu progresso nos simulados</span>
            <span className="tabular-nums text-muted-foreground">{prog.feitos}/{prog.total} · {pct}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: cor }} />
          </div>
          {prog.proximo && (
            <Link href="/aluno/simulados" className="mt-3 flex items-center justify-between gap-2 rounded-xl border p-2.5 transition-colors hover:bg-muted/50">
              <span className="min-w-0"><span className="text-xs text-muted-foreground">Continuar de onde parou</span><span className="block truncate text-sm font-medium">{prog.proximo.titulo}</span></span>
              <ChevronRight className="h-4 w-4 shrink-0" style={{ color: cor }} />
            </Link>
          )}
        </div>
      )}

      {/* CONTEÚDO DO CURSO — módulos e aulas montados no configurador do produto */}
      {curriculo.length > 0 && <ModulosVitrine modulos={curriculo} slug={slug} cor={cor} layout={vit.vitrine_layout} />}

      {/* VITRINE (seções) */}
      {vit.secoes.map((s) => <Secao key={s.id} s={s} cor={cor} />)}

      {/* Fallback quando a vitrine ainda não foi montada */}
      {semVitrine && fallback && (
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { titulo: 'Simulados', itens: fallback.simulados, href: '/aluno/simulados' },
            { titulo: 'Conteúdo e videoaulas', itens: fallback.pastas.map((p) => p.nome), href: '/aluno/biblioteca' },
            { titulo: 'Cronogramas', itens: fallback.cronogramas, href: '/aluno/cronograma' },
            { titulo: 'Acessos incluídos', itens: fallback.grupos, href: null as string | null },
          ].filter((x) => x.itens.length > 0).map((s) => (
            <div key={s.titulo} className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2"><Layers className="h-4 w-4" style={{ color: cor }} /><h2 className="text-sm font-semibold">{s.titulo}</h2><span className="ml-auto text-xs text-muted-foreground">{s.itens.length}</span></div>
              <ul className="space-y-1">{s.itens.slice(0, 6).map((n, i) => <li key={i} className="truncate text-sm text-muted-foreground">• {String(n)}</li>)}</ul>
              {s.href && <Link href={s.href} className="mt-2 inline-flex items-center gap-1 text-sm font-medium" style={{ color: cor }}>Abrir<ChevronRight className="h-4 w-4" /></Link>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Secao({ s, cor }: { s: VitrineSecao; cor: string }) {
  if (s.tipo === 'banner') {
    if (!s.imagem) return null
    const img = (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={s.imagem} alt={s.nome ?? ''} className="w-full rounded-2xl border object-cover shadow-sm" />
    )
    return s.link ? <a href={s.link} target="_blank" rel="noreferrer" className="block">{img}</a> : img
  }
  if (!s.itens.length) return null
  const size = CARD[s.tamanho] ?? CARD.vertical_small
  return (
    <section className="space-y-2">
      {s.nome && <h2 className="text-sm font-semibold">{s.nome}</h2>}
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {s.itens.map((it) => <CardItem key={`${it.tipo}:${it.id}`} it={it} size={size} cor={cor} />)}
      </div>
    </section>
  )
}

function CardItem({ it, size, cor }: { it: VitrineItem; size: string; cor: string }) {
  const Icon = iconeItem(it.tipo)
  return (
    <Link href={it.href} className={`group relative flex shrink-0 flex-col justify-end overflow-hidden rounded-2xl border p-3 text-white shadow-sm transition-transform hover:-translate-y-0.5 ${size}`}
      style={{ background: `linear-gradient(160deg, color-mix(in srgb, ${cor} 70%, #000), color-mix(in srgb, ${cor} 30%, #000))` }}>
      <Icon className="absolute right-2 top-2 h-4 w-4 text-white/70" />
      <span className="line-clamp-3 text-sm font-semibold leading-tight">{it.nome}</span>
      {it.area && <span className="mt-1 text-[10px] uppercase tracking-wide text-white/70">{it.area}</span>}
    </Link>
  )
}

