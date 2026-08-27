import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { QuestaoForm } from '@/components/admin/questao-form'
import { EtiquetaPicker } from '@/components/admin/etiqueta-picker'
import { etiquetasDaQuestao } from '@/app/admin/etiquetas/actions'
import { codigoQuestao } from '@/lib/codigo-questao'
import { updateQuestaoAction } from '../../actions'
import { notFound } from 'next/navigation'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditarQuestaoPage({ params }: PageProps) {
  const { id } = await params
  const tenantId = await getCurrentTenantId()
  // Leituras via service role (admin): a taxonomia (assuntos) tem RLS que barra o embed sob a
  // sessão RLS do admin logado — como no resto do painel, lemos com createAdminClient (escopado por tenant).
  const admin = createAdminClient()
  const NADA = '00000000-0000-0000-0000-000000000000'

  const [
    { data: questao },
    { data: bancas },
    { data: disciplinas },
    { data: assuntosLista },
    { data: alternativas },
    { data: bancosDestino },
    { data: vinculos },
    vincAll,
  ] = await Promise.all([
    admin
      .from('simulado_questoes')
      .select('*, bancas:simulado_bancas(nome), disciplinas:simulado_disciplinas(nome), assuntos:simulado_assuntos(nome)')
      .eq('id', id)
      .eq('tenant_id', tenantId ?? NADA)
      .maybeSingle(),
    admin.from('simulado_bancas').select('nome').eq('tenant_id', tenantId ?? NADA).order('nome'),
    admin.from('simulado_disciplinas').select('nome').eq('tenant_id', tenantId ?? NADA).order('nome'),
    admin.from('simulado_assuntos').select('nome').eq('tenant_id', tenantId ?? NADA).order('nome'),
    admin
      .from('simulado_alternativas')
      .select('*')
      .eq('questao_id', id)
      .eq('tenant_id', tenantId ?? NADA)
      .order('ordem'),
    admin.from('simulado_pastas').select('id, nome, cor, icone, capa_url, capa_card_url').eq('deletado', false).eq('tenant_id', tenantId ?? NADA).order('nome'),
    admin.from('simulado_questao_pasta').select('pasta_id').eq('questao_id', id).eq('tenant_id', tenantId ?? NADA),
    // Contagem de questões por banco (para o "X questões neste banco" da sidebar).
    fetchAll<{ pasta_id: string }>(() => admin.from('simulado_questao_pasta').select('pasta_id').eq('tenant_id', tenantId ?? NADA)),
  ])

  if (!questao) {
    notFound()
  }

  const bancasSugestoes = (bancas ?? []).map((b) => b.nome)
  const disciplinasSugestoes = (disciplinas ?? []).map((d) => d.nome)
  const assuntosSugestoes = [...new Set((assuntosLista ?? []).map((a: { nome: string }) => a.nome).filter(Boolean))]
  const bancoIds = (vinculos ?? []).map((v: { pasta_id: string }) => v.pasta_id)
  const et = await etiquetasDaQuestao(id)

  const countPorBanco = new Map<string, number>()
  for (const v of vincAll) countPorBanco.set(v.pasta_id, (countPorBanco.get(v.pasta_id) ?? 0) + 1)
  const bancos = (bancosDestino ?? []).map((b: { id: string; nome: string; cor?: string | null; icone?: string | null; capa_url?: string | null; capa_card_url?: string | null }) => ({
    id: b.id,
    nome: b.nome,
    total: countPorBanco.get(b.id) ?? 0,
    cor: b.cor ?? null,
    icone: b.icone ?? null,
    capa: (b.capa_card_url ?? b.capa_url) ?? null,
  }))

  const statusAtual = (questao.status ?? 'rascunho') as 'rascunho' | 'publicada' | 'arquivada'

  const initialData = {
    tipo: questao.tipo as 'objetiva' | 'discursiva',
    formato: ((questao.formato as string | null) === 'certo_errado' ? 'certo_errado' : 'multipla') as 'multipla' | 'certo_errado',
    enunciado: questao.enunciado,
    banca: (questao.bancas as { nome?: string } | null)?.nome ?? undefined,
    disciplina: (questao.disciplinas as { nome?: string } | null)?.nome ?? undefined,
    assunto: (questao.assuntos as { nome?: string } | null)?.nome ?? undefined,
    assunto_detalhe: (questao.assunto_detalhe as string | null) ?? undefined,
    ano: questao.ano ?? undefined,
    nivel_dificuldade: (questao.nivel_dificuldade ?? undefined) as 'facil' | 'medio' | 'dificil' | undefined,
    gabarito_tipo: (questao.gabarito_tipo ?? undefined) as 'oficial' | 'extraoficial' | undefined,
    comentario_professor: questao.comentario_professor ?? undefined,
    status: statusAtual,
    imagem_url: (questao.imagem_url as string | null) ?? undefined,
    pontuacao_total: (questao.pontuacao_total as number | null) ?? undefined,
    linhas: (questao.linhas as number | null) ?? undefined,
    categoria_discursiva: (questao.categoria_discursiva as string | null) ?? undefined,
    alternativas: alternativas?.map((a) => ({
      texto: a.texto,
      correta: a.correta,
      ordem: a.ordem,
      comentario: (a.comentario as string | null) ?? '',
    })),
    bancoIds,
  }

  return (
    <QuestaoForm
      initialData={initialData}
      codigo={codigoQuestao(id, (questao as { codigo?: string | null }).codigo)}
      bancasSugestoes={bancasSugestoes}
      disciplinasSugestoes={disciplinasSugestoes}
      assuntosSugestoes={assuntosSugestoes}
      bancos={bancos}
      onSubmit={updateQuestaoAction.bind(null, id)}
      sidebarExtra={<EtiquetaPicker questaoId={id} todas={et.todas ?? []} ativasIniciais={et.ativas ?? []} />}
    />
  )
}
