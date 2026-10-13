import { Gavel } from 'lucide-react'
import { getSessaoAluno } from '@/lib/aluno-session'
import { getCurrentTenant } from '@/lib/tenant'
import { resolverSidebarRotulos, rotuloDe, IconeMenu } from '@/lib/sidebar-rotulos'
import { desafiosDoAluno, temAcessoDesafio, lerDesafioJogo } from '@/lib/jurisprudencia/conteudo'
import { createAdminClient } from '@/lib/supabase/server'
import { JurisprudenciaJogo } from '@/components/aluno/jurisprudencia-jogo'
import { JurisprudenciaTickets } from '@/components/aluno/jurisprudencia-ticket'
import { DesafioJurisInterno } from '@/components/aluno/jurisprudencia/desafio-juris-interno'
import { resolverInterno } from '@/lib/aluno/interno-gate'
import { InternaPageRoot } from '@/components/brand/interna/page-shell'
import { PlatformJuris } from '@/components/brand/interna/juris'
import { JurisprudenciaMeq } from '@/components/aluno/jurisprudencia-meq'

export const dynamic = 'force-dynamic'

/** Entrada do aluno no Desafio de Jurisprudência.
 *  - SEM ?desafio: lista como TICKETS só os desafios a que o aluno tem acesso.
 *  - COM ?desafio=ID: confere o acesso e abre o jogo (imersivo). A animação de carregamento é a
 *    abertura do próprio jogo (não criamos outra). */
export default async function JurisprudenciaAlunoPage({
  searchParams,
}: {
  searchParams: Promise<{ desafio?: string }>
}) {
  const sessao = await getSessaoAluno()
  if (!sessao) return null // o layout do portal já redireciona para o login

  const { desafio } = await searchParams

  if (desafio) {
    const ok = await temAcessoDesafio(sessao.estudanteId, sessao.tenantId, desafio)
    if (!ok) {
      return (
        <div className="mx-auto max-w-md px-4 py-16 text-center">
          <h1 className="text-lg font-semibold text-foreground">Desafio indisponível</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Você não tem acesso a este desafio ou ele não existe mais.
          </p>
        </div>
      )
    }
    // Visual novo (interno): o desafio vira uma ÁREA INTERNA com abas (como a Lei Seca) — a aba
    // "Desafio" traz o arcade inteiro encaixado; + Regulamento / Desempenho / Ranking.
    const _itDesafio = await resolverInterno()
    if (_itDesafio.ativo) {
      const svc = createAdminClient()
      const [dj, pastaRow] = await Promise.all([
        lerDesafioJogo(svc, desafio),
        svc.from('simulado_pastas').select('nome').eq('id', desafio).maybeSingle(),
      ])
      const nomeDesafio = ((pastaRow.data as any)?.nome ?? 'Desafio de Jurisprudência') as string
      const diasObj = dj?.dias && typeof dj.dias === 'object' ? (dj.dias as Record<string, any>) : {}
      const diasArr = Object.entries(diasObj)
        .map(([chave, d]) => ({ chave, titulo: ((d as any)?.titulo ?? '').trim() || `Dia ${chave}`, ordem: (d as any)?.ordem ?? Number(chave) }))
        .sort((a, b) => (a.ordem - b.ordem) || (Number(a.chave) - Number(b.chave)))
        .map(({ chave, titulo }) => ({ chave, titulo }))
      const totalDias = diasArr.length
      const materiasCount = Array.isArray(dj?.materias) ? dj.materias.length : 0
      const imagens = dj?.imagens && typeof dj.imagens === 'object' ? (dj.imagens as any) : {}
      // Fundo DEDICADO do cabeçalho (imagens.fundo) — NÃO herda do ticket/capa; vazio = só o gradiente.
      const bannerUrl = (imagens.fundo || null) as string | null
      const config = dj?.config && typeof dj.config === 'object' ? (dj.config as any) : null
      const compacto = config?.compacto === true
      const corFundo = (config?.corFundo as string) || null
      return (
        <InternaPageRoot brand={_itDesafio.brand} theme={_itDesafio.theme}>
          <DesafioJurisInterno desafioId={desafio} titulo={nomeDesafio} theme={_itDesafio.theme} totalDias={totalDias} materiasCount={materiasCount} config={config} bannerUrl={bannerUrl} compacto={compacto} corFundo={corFundo} dias={diasArr} />
        </InternaPageRoot>
      )
    }
    return <JurisprudenciaJogo desafioId={desafio} />
  }

  const desafios = await desafiosDoAluno(sessao.estudanteId, sessao.tenantId)

  // Ícone + título seguem a BARRA LATERAL (rótulos/ícone personalizados do tenant p/ este item).
  const tema = ((await getCurrentTenant())?.tema as any) ?? {}
  const rotAluno = resolverSidebarRotulos(tema.sidebar_rotulos).aluno
  const chaveNav = '/aluno/jurisprudencia'
  const titulo = rotuloDe(rotAluno?.itens, chaveNav, 'Desafio de Jurisprudência')
  const iconeNav = rotAluno?.itens?.[chaveNav]?.icone

  const ticketsEl = desafios.length === 0
    ? <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">Nenhum desafio disponível para você no momento.</div>
    : <JurisprudenciaTickets desafios={desafios} />

  // ── NOVO VISUAL INTERNO: lista no design novo (PlatformJuris), fiel ao mockup, com dados reais. ──
  const _it = await resolverInterno()
  if (_it.ativo) {
    // Progresso REAL por desafio (dias dominados / total) p/ a barra do ticket — 2 queries em lote,
    // calculado em memória. Tolerante: se a tabela/coluna não existir, cai p/ 0 (card sem barra).
    const progDesafio = new Map<string, { feitos: number; total: number }>()
    try {
      const ids = desafios.map((d) => d.id)
      if (ids.length) {
        const svcP = createAdminClient()
        const [pastasRes, progRes] = await Promise.all([
          svcP.from('simulado_pastas').select('id, desafio_jogo').in('id', ids),
          svcP.from('simulado_jurisprudencia_progresso').select('desafio_id, dom').eq('estudante_id', sessao.estudanteId).in('desafio_id', ids),
        ])
        const jogoMap = new Map((pastasRes.data ?? []).map((p: any) => [p.id, p.desafio_jogo ?? {}]))
        const domMap = new Map((progRes.data ?? []).map((p: any) => [p.desafio_id, p.dom ?? {}]))
        for (const id of ids) {
          const dj: any = jogoMap.get(id) ?? {}
          const dias = dj?.dias && typeof dj.dias === 'object' ? dj.dias : {}
          const total = Object.keys(dias).length
          const dom: any = domMap.get(id) ?? {}
          const feitos = Object.keys(dias).filter((k) => {
            const teses = dias[k]?.teses
            const n = Array.isArray(teses) ? teses.length : 0
            const arr = dom[k]
            return n > 0 && Array.isArray(arr) && arr.length >= n
          }).length
          progDesafio.set(id, { feitos, total })
        }
      }
    } catch { /* progresso é best-effort — card renderiza sem barra */ }
    const desafiosData = desafios.map((d) => {
      const p = progDesafio.get(d.id)
      return { id: d.id, nome: d.nome, imagemTicket: d.imagemTicket ?? null, diasFeitos: p?.feitos ?? 0, totalDias: p?.total ?? 0 }
    })
    const stats = { desafios: desafiosData.length, disponiveis: desafiosData.length }
    // MEQ tem composição própria (spec 04 §2): o shell da marca (shell-meq) já traz rail + top bar,
    // então renderizamos só a região de conteúdo (sem o cabeçalho duplicado do InternaPageRoot).
    if (_it.brand === 'meq') {
      return <JurisprudenciaMeq theme={_it.theme} titulo={titulo} desafios={desafiosData} stats={stats} />
    }
    return (
      <InternaPageRoot brand={_it.brand} theme={_it.theme}>
        <PlatformJuris brand={_it.brand} theme={_it.theme} titulo={titulo} desafios={desafiosData} stats={stats} />
      </InternaPageRoot>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><span className="inline-flex shrink-0 text-primary"><IconeMenu override={iconeNav} fallback={Gavel} className="h-6 w-6" /></span> {titulo}</h1>
        <p className="text-muted-foreground">Escolha um desafio para começar.</p>
      </div>

      {ticketsEl}
    </div>
  )
}
