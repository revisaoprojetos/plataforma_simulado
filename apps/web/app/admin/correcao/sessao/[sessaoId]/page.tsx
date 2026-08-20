import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { getStorage } from '@/lib/storage'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { CorrecaoSessao, type QuestaoCorrecao } from '@/components/admin/correcao-sessao'
import { type Marca } from '@/components/admin/correcao-folha'
import { ArrowLeft, User } from 'lucide-react'

export const dynamic = 'force-dynamic'
const ZERO = '00000000-0000-0000-0000-000000000000'

/** Correção de uma TENTATIVA inteira: todas as questões discursivas da sessão, juntas. */
export default async function CorrecaoSessaoPage({ params }: { params: Promise<{ sessaoId: string }> }) {
  const { sessaoId } = await params
  const access = await getCurrentAccess()
  const svc = createAdminClient()
  const tenantId = access.tenantId ?? ZERO

  const { data: sessao } = await svc.from('simulado_sessoes_prova')
    .select('id, estudante_id, simulado_id, status, tentativa_num').eq('id', sessaoId).eq('tenant_id', tenantId).maybeSingle()
  if (!sessao) notFound()

  const [{ data: estudante }, { data: sim }, { data: respRows }, { data: ordemRows }] = await Promise.all([
    svc.from('simulado_estudantes').select('nome, email').eq('id', sessao.estudante_id).maybeSingle(),
    svc.from('simulado_simulados').select('id, titulo').eq('id', sessao.simulado_id).maybeSingle(),
    svc.from('simulado_respostas_discursivas').select('id, questao_id, texto, status, nota, feedback').eq('sessao_id', sessaoId).eq('tenant_id', tenantId),
    svc.from('simulado_prova_questoes').select('questao_id, ordem').eq('simulado_id', sessao.simulado_id),
  ])
  const respostas = respRows ?? []
  if (!respostas.length) notFound()

  const ordem = new Map((ordemRows ?? []).map((o: any) => [o.questao_id, o.ordem ?? 0]))
  respostas.sort((a: any, b: any) => (ordem.get(a.questao_id) ?? 999) - (ordem.get(b.questao_id) ?? 999))

  const questaoIds = [...new Set(respostas.map((r: any) => r.questao_id).filter(Boolean))] as string[]
  const respIds = respostas.map((r: any) => r.id)

  // Batches: questões (enunciado/gabarito), competências, notas (com ritual), páginas (junção→arquivos), anotações.
  const [questoes, comps, notas, juncoes, anots] = await Promise.all([
    fetchAllByIn<any>(questaoIds, (c) => svc.from('simulado_questoes').select('id, enunciado, comentario_professor').in('id', c)),
    fetchAllByIn<any>(questaoIds, (c) => svc.from('simulado_competencias').select('id, questao_id, nome, pontos, ordem').in('questao_id', c)),
    (async () => {
      const full = await fetchAllByIn<any>(respIds, (c) => svc.from('simulado_correcao_competencias').select('resposta_id, competencia_id, nota, comentario, audit_state, mensagem_aluno').in('resposta_id', c)).catch(() => null)
      if (full) return full
      return fetchAllByIn<any>(respIds, (c) => svc.from('simulado_correcao_competencias').select('resposta_id, competencia_id, nota, comentario').in('resposta_id', c))
    })(),
    (async () => { try { return await fetchAllByIn<any>(respIds, (c) => svc.from('simulado_resposta_arquivos').select('resposta_id, arquivo_id, ordem').in('resposta_id', c)) } catch { return [] as any[] } })(),
    (async () => { try { return await fetchAllByIn<any>(respIds, (c) => svc.from('simulado_anotacoes_discursivas').select('id, resposta_id, arquivo_id, competencia_id, tipo, x, y, largura, altura, cor, icone, numero, conteudo').in('resposta_id', c)) } catch { return [] as any[] } })(),
  ])

  const qMap = new Map(questoes.map((q: any) => [q.id, q]))
  // Páginas → URLs assinadas (bucket privado).
  const arqIds = [...new Set(juncoes.map((j: any) => j.arquivo_id).filter(Boolean))] as string[]
  const arqs = arqIds.length ? await fetchAllByIn<any>(arqIds, (c) => svc.from('simulado_arquivos').select('id, bucket, path').in('id', c)) : []
  const arqMap = new Map(arqs.map((a: any) => [a.id, a]))
  const storage = getStorage()
  const urlDe = new Map<string, string>()
  for (const a of arqs as any[]) { try { urlDe.set(a.id, await storage.getSignedUrl(a.bucket, a.path, 3600)) } catch { /* sumiu */ } }

  const compsPorQ = new Map<string, any[]>()
  for (const c of comps as any[]) { const a = compsPorQ.get(c.questao_id) ?? []; a.push(c); compsPorQ.set(c.questao_id, a) }
  const notaPorResp = new Map<string, Map<string, any>>()
  for (const n of notas as any[]) { let m = notaPorResp.get(n.resposta_id); if (!m) { m = new Map(); notaPorResp.set(n.resposta_id, m) } m.set(n.competencia_id, n) }
  const pagPorResp = new Map<string, { arquivoId: string; url: string }[]>()
  for (const j of (juncoes as any[]).slice().sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))) {
    const url = urlDe.get(j.arquivo_id); if (!url) continue
    const a = pagPorResp.get(j.resposta_id) ?? []; a.push({ arquivoId: j.arquivo_id, url }); pagPorResp.set(j.resposta_id, a)
  }
  const anotPorResp = new Map<string, Marca[]>()
  for (const a of anots as any[]) {
    const arr = anotPorResp.get(a.resposta_id) ?? []
    arr.push({ id: a.id, arquivo_id: a.arquivo_id, competencia_id: a.competencia_id, tipo: a.tipo, x: Number(a.x), y: Number(a.y), largura: a.largura != null ? Number(a.largura) : null, altura: a.altura != null ? Number(a.altura) : null, cor: a.cor, icone: a.icone, numero: a.numero != null ? Number(a.numero) : null, conteudo: a.conteudo })
    anotPorResp.set(a.resposta_id, arr)
  }

  const questoesCorrecao: QuestaoCorrecao[] = respostas.map((r: any, i: number) => {
    const q = qMap.get(r.questao_id)
    const notaMap = notaPorResp.get(r.id) ?? new Map()
    const competencias = (compsPorQ.get(r.questao_id) ?? []).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)).map((c: any) => {
      const n = notaMap.get(c.id)
      return { id: c.id, nome: c.nome, pontos: Number(c.pontos), nota: n?.nota != null ? Number(n.nota) : null, comentario: n?.comentario ?? '', audit_state: (n?.audit_state ?? 'pending') as string, mensagem: n?.mensagem_aluno ?? '' }
    })
    return {
      respostaId: r.id,
      numero: i + 1,
      status: r.status as string,
      enunciado: (q?.enunciado ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      jaCorrigida: r.status === 'corrigida',
      feedbackInicial: r.feedback ?? '',
      competencias,
      paginas: pagPorResp.get(r.id) ?? [],
      anotacoesIniciais: anotPorResp.get(r.id) ?? [],
      espelho: { enunciado: q?.enunciado ?? '', comentarioProfessor: q?.comentario_professor ?? null },
    }
  })

  const voltarUrl = `/admin/correcao/simulado/${sessao.simulado_id}`

  return (
    <div className="mx-auto max-w-[110rem] space-y-4">
      <Link href={voltarUrl} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {sim?.titulo ?? 'Voltar'}
      </Link>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><User className="h-5 w-5" /></span>
        <div>
          <h1 className="text-2xl font-bold leading-tight tracking-tight">{estudante?.nome ?? 'Aluno'}</h1>
          <p className="text-sm text-muted-foreground">{estudante?.email || '—'} · {questoesCorrecao.length} questão(ões) discursiva(s)</p>
        </div>
      </div>

      <CorrecaoSessao questoes={questoesCorrecao} voltarUrl={voltarUrl} />
    </div>
  )
}
