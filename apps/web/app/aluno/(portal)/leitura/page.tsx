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
      const gam = await carregarGamRail(createAdminClient(), sessao.tenantId, sessao.estudanteId)
      // Pré-carrega a imagem de fundo da trilha (alta prioridade) → ao voltar do quiz ela já está pronta,
      // sem o "flash preto" enquanto carrega.
      const bgTrilha = mod.trilhaAparencia.livre.fundo?.url ?? mod.trilha.capa ?? mod.trilha.capaCard ?? null
      if (bgTrilha) ReactDOM.preload(bgTrilha, { as: 'image', fetchPriority: 'high' })
      return <LeituraModuloView modulo={modulo} trilha={mod.trilha} desempenho={mod.desempenho} pendentes={mod.pendentes} aulasPendentes={mod.aulasPendentes} ranking={ranking} meuId={sessao.estudanteId} formato={mod.trilhaAparencia.formato} simbolos={mod.trilhaAparencia.simbolos} livre={mod.trilhaAparencia.livre} inverter={mod.trilhaAparencia.inverter} degrade={mod.trilhaAparencia.degrade} degradeTrilha={mod.trilhaAparencia.degradeTrilha} descricao={mod.trilhaAparencia.descricao} regulamento={mod.regulamento} pontuacao={mod.pontuacao} gam={gam} />
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
