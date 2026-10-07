import { redirect } from 'next/navigation'
import ReactDOM from 'react-dom'
import { Library } from 'lucide-react'
import { getSessaoAluno } from '@/lib/aluno-session'
import { LEITURA_ATIVA } from '@/lib/flags'
import { carregarTrilhaLeituraAluno, carregarModuloCompleto } from '@/lib/leitura/trilha'
import { carregarRankingModulo, calcularMinhaLinhaLeitura, anonimizarRankingParaAluno } from '@/lib/leitura/ranking'
import { LeituraModulos } from '@/components/aluno/leitura-modulos'
import { LeituraModuloView } from '@/components/aluno/leitura-modulo-view'
import { getCurrentTenant } from '@/lib/tenant'
import { resolverCardView } from '@/lib/card-view'
import { carregarGamRail } from '@/lib/aluno/trilhas'
import { carimbosDoAluno, conquistasModuloDoAluno, avaliarMedalhasModulo, progressoModuloAluno } from '@/lib/leitura/carimbos'
import { createAdminClient } from '@/lib/supabase/server'
import { resolverInterno } from '@/lib/aluno/interno-gate'
import { InternaPageRoot } from '@/components/brand/interna/page-shell'
import { PlatformLeiSeca } from '@/components/brand/interna/leiseca'

export const dynamic = 'force-dynamic'

export default async function LeituraAlunoPage({ searchParams }: { searchParams: Promise<{ modulo?: string }> }) {
  if (!LEITURA_ATIVA) redirect('/aluno')
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const { modulo } = await searchParams
  // Resolve o gate do visual novo uma vez (usado na lista E no interior).
  const _it = await resolverInterno()

  // ===== Módulo aberto: infos + tabs (trilha / desempenho) =====
  if (modulo) {
    // PERF: tudo que é independente roda em UMA leva paralela (antes era em série: gam → query de dias →
    // ESCRITA de medalhas bloqueante → carimbos, somando round-trips). A escrita de medalhas corre JUNTO
    // (não bloqueia) e, como `carimbos` vem na 2ª leva (depois), já reflete o que foi concedido.
    const svc = createAdminClient()
    // PERF: no visual novo (interno), o ranking (1000+ alunos) é carregado SOB DEMANDA no cliente (aba
    // Ranking, via /api/aluno/leitura/ranking) — tira o RPC pesado + o payload grande da leva crítica de
    // abrir o desafio. A linha "Você" (minhaLinha, barata) continua no servidor p/ a posição imediata.
    // O legado (não-interno) mantém o ranking no servidor.
    const [mod, rankingRaw, minhaLinha, gam, eventosDia] = await Promise.all([
      carregarModuloCompleto(sessao.estudanteId, sessao.tenantId, modulo),
      _it.ativo ? Promise.resolve(null) : carregarRankingModulo(modulo, sessao.tenantId),
      // Linha "Você" fresca (sem cache): garante os números certos na hora, mesmo se a lista cacheada
      // ainda não refletiu a última aula concluída. Tolerante — nunca quebra a página.
      calcularMinhaLinhaLeitura(modulo, sessao.tenantId, sessao.estudanteId).catch(() => null),
      carregarGamRail(svc, sessao.tenantId, sessao.estudanteId),
      // Dias de CONCLUSÃO do quiz (Ofensiva/calendário) — MESMA fonte do streak (ledger imutável: eventos
      // `quiz:%`, `meta.dia`). Antes usava `criado_em` de TODO evento de leitura → a faixa marcava dias
      // diferentes do número da sequência (virada de meia-noite / leitura sem quiz). Formatados abaixo.
      svc.from('simulado_xp_eventos').select('ref_id, meta, criado_em').eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId).eq('origem', 'leitura').like('ref_id', 'quiz:%').order('criado_em', { ascending: false }).limit(600).then((r) => r.data ?? [], () => []),
      // Concede retroativamente medalhas merecidas — corre em paralelo (não segura o render).
      avaliarMedalhasModulo(svc, sessao.tenantId, modulo, sessao.estudanteId).then(() => null, () => null),
    ])
    // PRIVACIDADE: o aluno só pode receber as INICIAIS dos OUTROS (e sem e-mail); o nome completo de
    // terceiros não sai do servidor. A linha dele próprio ("Você") mantém o nome.
    // Interno: ranking vazio (lazy no cliente); legado: anonimiza o carregado no servidor.
    const ranking = rankingRaw
      ? anonimizarRankingParaAluno(rankingRaw, sessao.estudanteId)
      : { itens: [], gamAtivo: !!(gam && gam.config), pontuacao: mod.pontuacao ?? null }
    if (mod.trilha) {
      // Aparência (símbolos + formato) vem do MÓDULO (editada na aba "Editar trilha"), não do tenant.
      let diasLeitura: string[] = []
      try {
        const tz = gam?.config.timezone || 'America/Sao_Paulo'
        const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
        // Prefere o dia IMUTÁVEL do carimbo (meta.dia); fallback p/ criado_em no fuso do tenant.
        diasLeitura = [...new Set((eventosDia as { meta?: { dia?: string }; criado_em: string }[])
          .map((r) => r.meta?.dia || fmt.format(new Date(r.criado_em)))
          .filter(Boolean))]
      } catch { /* tolerante */ }
      // Pré-carrega a imagem de fundo da trilha (alta prioridade) → ao voltar do quiz ela já está pronta,
      // sem o "flash preto" enquanto carrega.
      const bgTrilha = mod.trilhaAparencia.livre.fundo?.url ?? mod.trilha.capa ?? mod.trilha.capaCard ?? null
      if (bgTrilha) ReactDOM.preload(bgTrilha, { as: 'image', fetchPriority: 'high' })
      // 2ª leva (depende das medalhas já concedidas acima): carimbos/conquistas/progresso em paralelo.
      const [carimbos, conquistasModulo, prog] = await Promise.all([
        carimbosDoAluno(svc, sessao.tenantId, modulo, sessao.estudanteId),
        conquistasModuloDoAluno(svc, sessao.tenantId, modulo, sessao.estudanteId),
        progressoModuloAluno(svc, sessao.tenantId, modulo, sessao.estudanteId),
      ])
      const view = <LeituraModuloView modulo={modulo} trilha={mod.trilha} desempenho={mod.desempenho} pendentes={mod.pendentes} aulasPendentes={mod.aulasPendentes} ranking={ranking} minhaLinha={minhaLinha} meuId={sessao.estudanteId} meuNome={sessao.nome} formato={mod.trilhaAparencia.formato} simbolos={mod.trilhaAparencia.simbolos} livre={mod.trilhaAparencia.livre} inverter={mod.trilhaAparencia.inverter} degrade={mod.trilhaAparencia.degrade} degradeTrilha={mod.trilhaAparencia.degradeTrilha} descricao={mod.trilhaAparencia.descricao} regulamento={mod.regulamento} pontuacao={mod.pontuacao} desafios={mod.desafios} desempenhoDesafios={mod.desempenhoDesafios} gam={gam} diasLeitura={diasLeitura} carimbos={carimbos} conquistasModulo={conquistasModulo} progAulas={prog.porAula} interno={_it.ativo ? { brand: _it.brand, theme: _it.theme } : null} />
      // No visual novo o interior (DesafioLS) gerencia o próprio layout e o BANNER é FULL-BLEED (cobre
      // toda a área interna, como a home) — então NÃO embrulhamos em padding. O legado mantém o padding.
      return view
    }
    // módulo inexistente/sem acesso → cai na lista
  }

  // ===== Seleção de módulos (cards) =====
  const trilhas = await carregarTrilhaLeituraAluno(sessao.estudanteId, sessao.tenantId)
  const tema = ((await getCurrentTenant())?.tema as any) ?? {}
  const cardView = resolverCardView(tema.card_view)
  const modulosEl = trilhas.length === 0
    ? <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">Nenhum módulo disponível ainda.</div>
    : <LeituraModulos cardView={cardView} modulos={trilhas.map((t) => ({ id: t.id, nome: t.nome, cor: t.cor, capa: t.capa ?? null, capaCard: t.capaCard ?? null, total: t.total, done: t.done, pendentes: t.pendentes ?? 0 }))} />

  // ── NOVO VISUAL INTERNO: lista no design novo (PlatformLeiSeca), fiel ao mockup, com dados reais. ──
  if (_it.ativo) {
    const modulosData = trilhas.map((t) => ({ id: t.id, nome: t.nome, cor: t.cor, capa: t.capa ?? null, capaCard: t.capaCard ?? null, total: t.total, done: t.done, pendentes: t.pendentes ?? 0 }))
    // Stats reais do aluno nesta área: leis (módulos), aulas concluídas (soma do progresso) e
    // questões respondidas/acerto médio a partir das respostas de leitura (1 query agregada).
    const leis = modulosData.length
    const aulasConcluidas = modulosData.reduce((s, m) => s + (m.done || 0), 0)
    let questoesRespondidas = 0
    let acertoMedio: number | null = null
    // ÚLTIMO módulo em que o aluno teve atividade (último desafio feito) → é o que aparece no card
    // "Continue de onde parou" (com a imagem e as infos dele). Vem do último evento de LEITURA → documento → pasta.
    let ultimoModuloId: string | null = null
    try {
      const svc2 = createAdminClient()
      const base = () => svc2.from('simulado_leitura_respostas').select('*', { count: 'exact', head: true }).eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId)
      const [{ count: total }, { count: corretas }, ultEv] = await Promise.all([
        base(), base().eq('correta', true),
        svc2.from('simulado_xp_eventos').select('meta').eq('tenant_id', sessao.tenantId).eq('estudante_id', sessao.estudanteId).eq('origem', 'leitura').order('criado_em', { ascending: false }).limit(1).maybeSingle().then((r) => r.data, () => null),
      ])
      questoesRespondidas = total ?? 0
      if (questoesRespondidas > 0) acertoMedio = Math.round(((corretas ?? 0) / questoesRespondidas) * 100)
      const docId = (ultEv as { meta?: { documentoId?: string } } | null)?.meta?.documentoId
      if (docId) {
        const { data: doc } = await svc2.from('simulado_documentos').select('pasta_id').eq('id', docId).maybeSingle()
        ultimoModuloId = (doc as { pasta_id?: string | null } | null)?.pasta_id ?? null
      }
    } catch { /* tolerante: sem stats/último módulo */ }
    return (
      <InternaPageRoot brand={_it.brand} theme={_it.theme}>
        <PlatformLeiSeca brand={_it.brand} theme={_it.theme} modulos={modulosData} stats={{ leis, aulasConcluidas, questoesRespondidas, acertoMedio }} ultimoModuloId={ultimoModuloId} />
      </InternaPageRoot>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Library className="h-6 w-6 text-primary" /> Desafio de Lei Seca</h1>
        <p className="text-muted-foreground">Escolha um módulo para começar — leia as aulas e libere as questões de cada uma.</p>
      </div>
      {modulosEl}
    </div>
  )
}
