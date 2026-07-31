import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { BookOpen, Star, NotebookPen, ArrowRight, Sparkles, Trophy, Play, ListChecks, Radio, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolverLiberacoes } from '@/lib/simulado/liberacao'
import { resolverVisualSimulados } from '@/lib/aluno/simulado-visual'
import { montarItensSimulado } from '@/lib/aluno/simulado-item'
import { resolverEnunciadoUrls } from '@/lib/aluno/enunciado'
import { CardSimulado } from '@/components/aluno/card-simulado'
import { HeroCarrossel } from '@/components/aluno/hero-carrossel'
import { BannersPortal } from '@/components/aluno/banners-portal'
import { FileiraHorizontal } from '@/components/fileira-horizontal'
import { OCULTAR_ALUNO_EXTRAS, ROTAS_ALUNO_OCULTAS } from '@/lib/flags'

const notaTone = (n: number) => (n >= 70 ? 'text-emerald-600 dark:text-emerald-400' : n >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400')
// Largura de cada card na fileira do catálogo (deixa espiar um pedaço do próximo).
const FILEIRA_BASIS = 'shrink-0 basis-[calc((100%-1rem)/2.25)] sm:basis-[calc((100%-2rem)/3.3)] lg:basis-[calc((100%-3rem)/4.3)] xl:basis-[calc((100%-4rem)/5.3)]'

export default async function AlunoHome() {
  const sessao = await getSessaoAluno()
  const svc = await createServiceClient()
  const estId = sessao!.estudanteId

  const [{ data: mats }, { data: acs }, { data: sessAll }, { data: heroBanners }] = await Promise.all([
    svc.from('simulado_matriculas').select('simulado_id, liberado').eq('estudante_id', estId),
    svc.from('simulado_acessos').select('simulado_id, expira_em').eq('estudante_id', estId),
    // Sessões dela (independem do acesso ATUAL): garantem que simulados JÁ FEITOS contem
    // e não sumam se a matrícula/acesso mudou depois de concluir (histórico não some).
    svc.from('simulado_sessoes_prova').select('simulado_id, status, nota').eq('estudante_id', estId).eq('is_teste', false).eq('deletado', false),
    // Banners do tenant (só aparecem na HOME): destaque/carrossel + pop-up. Configurados no console.
    svc.from('simulado_banners').select('id, tipo, titulo, mensagem, imagem_url, link, cor').eq('tenant_id', sessao!.tenantId).eq('ativo', true).order('ordem', { ascending: true }).order('criado_em', { ascending: true }),
  ])
  const todosBanners = (heroBanners ?? []) as any[]
  const hero = todosBanners.filter((b) => b.tipo === 'hero')

  const ids = [...new Set([
    ...(mats ?? []).filter((m: any) => m.liberado !== false).map((m: any) => m.simulado_id),
    ...(acs ?? []).map((a: any) => a.simulado_id),
    ...(sessAll ?? []).map((s: any) => s.simulado_id),
  ].filter(Boolean))]
  const expiraPorSim = new Map<string, string | null>()
  for (const a of (acs ?? []) as any[]) {
    const atual = expiraPorSim.get(a.simulado_id)
    if (!atual || (a.expira_em && new Date(a.expira_em) > new Date(atual))) expiraPorSim.set(a.simulado_id, a.expira_em ?? null)
  }

  let sims: any[] = []
  const sessoesPorSim = new Map<string, any[]>()
  const notas: number[] = []
  if (ids.length) {
    const { data: s } = await svc.from('simulado_simulados').select('id, titulo, status, embed_token, regras, modo_aplicacao, data_inicio, data_fim, created_at').in('id', ids).eq('deletado', false)
    sims = s ?? []
    for (const x of (sessAll ?? []) as any[]) { const arr = sessoesPorSim.get(x.simulado_id) ?? []; arr.push(x); sessoesPorSim.set(x.simulado_id, arr) }
  }

  const simuladosFeitos: string[] = []
  for (const s of sims) {
    const finalizadas = (sessoesPorSim.get(s.id) ?? []).filter((x) => x.status === 'finalizada')
    if (finalizadas.length) {
      simuladosFeitos.push(s.id)
      // Só agrega notas de simulados cuja nota está liberada para o aluno.
      if (resolverLiberacoes(s.regras, s).notaLiberada) for (const f of finalizadas) if (f.nota != null) notas.push(Number(f.nota))
    }
  }
  const notaMedia = notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10 : null
  const melhorNota = notas.length ? Math.max(...notas) : null
  const nota = (n: number | null) => (n == null ? '—' : n.toFixed(1).replace('.', ','))

  // Simulados disponíveis (mesmos cards da área "Simulados"): capa + estado + fita "novo".
  // Aqui na home mostramos só os que o aluno AINDA NÃO FEZ (sem sessão finalizada);
  // os já feitos — mesmo que permitam retentativa — ficam em "Ver todos".
  const feitosSet = new Set(simuladosFeitos)
  const visual = await resolverVisualSimulados(svc, sims.map((s: any) => ({ id: s.id, regras: s.regras })))
  const dataLancamento = (i: any) => new Date(i.regras?.publicado_em ?? i.created_at ?? 0).getTime()
  const disponiveis = montarItensSimulado(sims, sessoesPorSim, expiraPorSim, visual)
    .filter((i) => i.podeFazer || i.emAndamento || i.statusLabel === 'Agendado')
    .filter((i) => !feitosSet.has(i.id))
    // Ordem de lançamento: mais recente → mais antigo.
    .sort((a, b) => dataLancamento(b) - dataLancamento(a))

  // Enunciado de Questões (PDF importado) por simulado → botão de 3 pontos no card baixa antes de iniciar.
  const enunUrls = await resolverEnunciadoUrls(svc, disponiveis.map((i) => ({ id: i.id, regras: i.regras })))
  const disponiveisCom = disponiveis.map((i) => ({ ...i, enunciadoUrl: enunUrls.get(i.id) ?? null }))

  const atalhos = [
    { href: '/aluno/recomendado', icon: Sparkles, titulo: 'Recomendado', desc: 'Questões focadas nos seus pontos fracos' },
    { href: '/aluno/simulado', icon: Radio, titulo: 'Simulados', desc: 'Faça os simulados liberados para você' },
    { href: '/aluno/simulados', icon: ClipboardList, titulo: 'Meus Simulados', desc: 'Seus resultados e simulados concluídos' },
    { href: '/aluno/questoes', icon: BookOpen, titulo: 'Banco de questões', desc: 'Pratique questões avulsas com filtros' },
    { href: '/aluno/favoritos', icon: Star, titulo: 'Favoritos', desc: 'Questões que você marcou' },
    { href: '/aluno/cadernos', icon: NotebookPen, titulo: 'Cadernos', desc: 'Organize seus estudos' },
  ].filter((a) => !(OCULTAR_ALUNO_EXTRAS && ROTAS_ALUNO_OCULTAS.includes(a.href)))

  return (
    <div className="animate-page space-y-5">
      {/* Banners do tenant (carrossel/pop-up) — SÓ na Início. */}
      <BannersPortal banners={todosBanners} />

      {/* Banner de DESTAQUE (tipo 'hero') — FULL-BLEED: ocupa toda a largura e cola no topo. */}
      {hero.length > 0 && (
        <div className="-mx-6 -mt-6">
          <HeroCarrossel banners={hero} />
        </div>
      )}

      {/* Saudação SOLTA na tela (sem card). Dados detalhados foram para o Perfil. */}
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--brand-accent)', boxShadow: '0 0 10px 1px color-mix(in oklab, var(--brand-accent) 60%, transparent)' }} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--brand-accent)' }}>Sua área de estudos</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-[2rem]">Olá, {sessao!.nome.split(' ')[0]} 👋</h1>
        <p className="mt-1 text-muted-foreground">Bem-vindo à sua área de estudos. {disponiveis.length > 0 ? `Você tem ${disponiveis.length} simulado(s) disponível(is).` : 'Você está em dia com seus simulados.'}</p>
      </div>

      {/* Atalhos */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {atalhos.map((a) => (
          <Link key={a.href} href={a.href}>
            <div className="group h-full rounded-2xl border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><a.icon className="h-5 w-5" /></span>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="mt-2">
                <div className="font-medium">{a.titulo}</div>
                <div className="text-xs text-muted-foreground">{a.desc}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Simulados disponíveis — abaixo dos atalhos, mesmos cards da área "Simulados" */}
      {disponiveis.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Play className="h-4 w-4 text-primary" /> Simulados disponíveis</h2>
            <Link href="/aluno/simulado" className="text-xs font-medium text-primary hover:underline">Ver todos</Link>
          </div>
          <FileiraHorizontal>
            {disponiveisCom.map((s) => (
              <div key={s.id} className={FILEIRA_BASIS}><CardSimulado s={s} /></div>
            ))}
          </FileiraHorizontal>
        </section>
      )}
    </div>
  )
}
