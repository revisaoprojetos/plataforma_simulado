import { redirect } from 'next/navigation'
import ReactDOM from 'react-dom'
import { Library } from 'lucide-react'
import { getSessaoAluno } from '@/lib/aluno-session'
import { LEITURA_ATIVA } from '@/lib/flags'
import { carregarTrilhaLeituraAluno, carregarModuloCompleto } from '@/lib/leitura/trilha'
import { carregarRankingModulo } from '@/lib/leitura/ranking'
import { LeituraModulos } from '@/components/aluno/leitura-modulos'
import { LeituraModuloView } from '@/components/aluno/leitura-modulo-view'
import { getCurrentTenant } from '@/lib/tenant'
import { resolverCardView } from '@/lib/card-view'
import { carregarGamRail } from '@/lib/aluno/trilhas'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function LeituraAlunoPage({ searchParams }: { searchParams: Promise<{ modulo?: string }> }) {
  if (!LEITURA_ATIVA) redirect('/aluno')
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const { modulo } = await searchParams

  // ===== Módulo aberto: infos + tabs (trilha / desempenho) =====
  if (modulo) {
    const [mod, ranking] = await Promise.all([
      carregarModuloCompleto(sessao.estudanteId, sessao.tenantId, modulo),
      carregarRankingModulo(modulo, sessao.tenantId),
    ])
    if (mod.trilha) {
      // O cabeçalho (título/voltar/subtítulo) agora vive DENTRO do banner colapsável.
      // Aparência (símbolos + formato) vem do MÓDULO (editada na aba "Editar trilha"), não do tenant.
      const svc = createAdminClient()
      const gam = await carregarGamRail(svc, sessao.tenantId, sessao.estudanteId)
      // Dias em que o aluno teve atividade de LEITURA (concluiu aula / quiz) — base da Ofensiva/calendário.
      let diasLeitura: string[] = []
      if (gam) {
        try {
          const tz = gam.config.timezone || 'America/Sao_Paulo'
          const { data: ev } = await svc.from('simulado_xp_eventos').select('criado_em').eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId).eq('origem', 'leitura').order('criado_em', { ascending: false }).limit(600)
          const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
          diasLeitura = [...new Set((ev ?? []).map((r: any) => fmt.format(new Date(r.criado_em))))]
        } catch { /* tolerante */ }
      }
      // Pré-carrega a imagem de fundo da trilha (alta prioridade) → ao voltar do quiz ela já está pronta,
      // sem o "flash preto" enquanto carrega.
      const bgTrilha = mod.trilhaAparencia.livre.fundo?.url ?? mod.trilha.capa ?? mod.trilha.capaCard ?? null
      if (bgTrilha) ReactDOM.preload(bgTrilha, { as: 'image', fetchPriority: 'high' })
      return <LeituraModuloView modulo={modulo} trilha={mod.trilha} desempenho={mod.desempenho} pendentes={mod.pendentes} aulasPendentes={mod.aulasPendentes} ranking={ranking} meuId={sessao.estudanteId} formato={mod.trilhaAparencia.formato} simbolos={mod.trilhaAparencia.simbolos} livre={mod.trilhaAparencia.livre} inverter={mod.trilhaAparencia.inverter} degrade={mod.trilhaAparencia.degrade} degradeTrilha={mod.trilhaAparencia.degradeTrilha} descricao={mod.trilhaAparencia.descricao} regulamento={mod.regulamento} pontuacao={mod.pontuacao} desafios={mod.desafios} desempenhoDesafios={mod.desempenhoDesafios} gam={gam} diasLeitura={diasLeitura} />
    }
    // módulo inexistente/sem acesso → cai na lista
  }

  // ===== Seleção de módulos (cards) =====
  const trilhas = await carregarTrilhaLeituraAluno(sessao.estudanteId, sessao.tenantId)
  const tema = ((await getCurrentTenant())?.tema as any) ?? {}
  const cardView = resolverCardView(tema.card_view)
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Library className="h-6 w-6 text-primary" /> Desafio de Lei Seca</h1>
        <p className="text-muted-foreground">Escolha um módulo para começar — leia as aulas e libere as questões de cada uma.</p>
      </div>

      {trilhas.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">Nenhum módulo disponível ainda.</div>
      ) : (
        <LeituraModulos cardView={cardView} modulos={trilhas.map((t) => ({ id: t.id, nome: t.nome, cor: t.cor, capa: t.capa ?? null, capaCard: t.capaCard ?? null, total: t.total, done: t.done, pendentes: t.pendentes ?? 0 }))} />
      )}
    </div>
  )
}
