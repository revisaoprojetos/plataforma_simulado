import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getStorage } from '@/lib/storage'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import type { QuestaoCorrecao } from '@/components/admin/correcao-sessao'
import type { Marca } from '@/components/admin/correcao-folha'

type RespInput = { id: string; questao_id: string; status: string; feedback: string | null }

const r2 = (n: number) => Math.round(n * 100) / 100
function conceitosDefault(pontos: number): { nome: string; pontos: number }[] {
  if (pontos <= 0) return [{ nome: 'Conceito 0', pontos: 0 }]
  return [{ nome: 'Conceito 0', pontos: 0 }, { nome: 'Conceito 1', pontos: r2(pontos / 2) }, { nome: 'Conceito 2', pontos: r2(pontos) }]
}
const arr = (v: any): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [])

/** Carrega os dados da MESA (estilo AURÉA) para uma lista de respostas discursivas (já na ordem). */
export async function carregarQuestoesCorrecao(svc: SupabaseClient, tenantId: string, respostas: RespInput[]): Promise<QuestaoCorrecao[]> {
  if (!respostas.length) return []
  const questaoIds = [...new Set(respostas.map((r) => r.questao_id).filter(Boolean))] as string[]
  const respIds = respostas.map((r) => r.id)

  const [questoes, comps, notas, juncoes, anots, ias] = await Promise.all([
    fetchAllByIn<any>(questaoIds, (c) => svc.from('simulado_questoes').select('id, enunciado, comentario_professor').in('id', c)),
    (async () => {
      const full = await fetchAllByIn<any>(questaoIds, (c) => svc.from('simulado_competencias').select('id, questao_id, nome, pontos, ordem, descricao, conceitos').in('questao_id', c)).catch(() => null)
      if (full) return full
      return fetchAllByIn<any>(questaoIds, (c) => svc.from('simulado_competencias').select('id, questao_id, nome, pontos, ordem').in('questao_id', c))
    })(),
    (async () => {
      const full = await fetchAllByIn<any>(respIds, (c) => svc.from('simulado_correcao_competencias').select('resposta_id, competencia_id, nota, comentario, audit_state, mensagem_aluno, conceito, excerpt, pagina, linhas, recognized, missing, leitura_duvidosa').in('resposta_id', c)).catch(() => null)
      if (full) return full
      return fetchAllByIn<any>(respIds, (c) => svc.from('simulado_correcao_competencias').select('resposta_id, competencia_id, nota, comentario').in('resposta_id', c)).catch(() => [] as any[])
    })(),
    (async () => { try { return await fetchAllByIn<any>(respIds, (c) => svc.from('simulado_resposta_arquivos').select('resposta_id, arquivo_id, ordem').in('resposta_id', c)) } catch { return [] as any[] } })(),
    (async () => { try { return await fetchAllByIn<any>(respIds, (c) => svc.from('simulado_anotacoes_discursivas').select('id, resposta_id, arquivo_id, competencia_id, tipo, x, y, largura, altura, cor, icone, numero, conteudo').in('resposta_id', c)) } catch { return [] as any[] } })(),
    (async () => {
      const full = await fetchAllByIn<any>(respIds, (c) => svc.from('simulado_respostas_discursivas').select('id, ia_payload, transcricao').in('id', c)).catch(() => null)
      if (full) return full
      try { return await fetchAllByIn<any>(respIds, (c) => svc.from('simulado_respostas_discursivas').select('id, ia_payload').in('id', c)) } catch { return [] as any[] }
    })(),
  ])

  // Transcrição por resposta: coluna `transcricao` (OCR/manual) → fallback ia_payload.transcricao (IA).
  const transcricaoDe = new Map<string, string>()
  for (const x of ias as any[]) { const t = x?.transcricao || x?.ia_payload?.transcricao; if (t) transcricaoDe.set(x.id, String(t)) }

  const qMap = new Map(questoes.map((q: any) => [q.id, q]))
  const arqIds = [...new Set(juncoes.map((j: any) => j.arquivo_id).filter(Boolean))] as string[]
  const arqs = arqIds.length ? await fetchAllByIn<any>(arqIds, (c) => svc.from('simulado_arquivos').select('id, bucket, path').in('id', c)) : []
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
    const list = anotPorResp.get(a.resposta_id) ?? []
    list.push({ id: a.id, arquivo_id: a.arquivo_id, competencia_id: a.competencia_id, tipo: a.tipo, x: Number(a.x), y: Number(a.y), largura: a.largura != null ? Number(a.largura) : null, altura: a.altura != null ? Number(a.altura) : null, cor: a.cor, icone: a.icone, numero: a.numero != null ? Number(a.numero) : null, conteudo: a.conteudo })
    anotPorResp.set(a.resposta_id, list)
  }

  return respostas.map((r, i) => {
    const q = qMap.get(r.questao_id)
    const notaMap = notaPorResp.get(r.id) ?? new Map()
    const competencias = (compsPorQ.get(r.questao_id) ?? []).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)).map((c: any) => {
      const n = notaMap.get(c.id)
      const pontos = Number(c.pontos)
      const conceitos = Array.isArray(c.conceitos) && c.conceitos.length
        ? c.conceitos.map((x: any) => ({ nome: String(x.nome ?? ''), pontos: Number(x.pontos ?? 0) }))
        : conceitosDefault(pontos)
      return {
        id: c.id, nome: c.nome, pontos,
        nota: n?.nota != null ? Number(n.nota) : null,
        comentario: n?.comentario ?? '',
        audit_state: (n?.audit_state ?? 'pending') as string,
        mensagem: n?.mensagem_aluno ?? '',
        descricao: (c.descricao ?? '') as string,
        conceitos,
        conceito: (n?.conceito ?? '') as string,
        excerpt: (n?.excerpt ?? '') as string,
        pagina: (n?.pagina ?? '') as string,
        linhas: (n?.linhas ?? '') as string,
        recognized: arr(n?.recognized),
        missing: arr(n?.missing),
        leituraDuvidosa: !!n?.leitura_duvidosa,
      }
    })
    return {
      respostaId: r.id,
      numero: i + 1,
      status: r.status,
      enunciado: (q?.enunciado ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      jaCorrigida: r.status === 'corrigida',
      feedbackInicial: r.feedback ?? '',
      transcricao: transcricaoDe.get(r.id) ?? '',
      competencias,
      paginas: pagPorResp.get(r.id) ?? [],
      anotacoesIniciais: anotPorResp.get(r.id) ?? [],
      espelho: { enunciado: q?.enunciado ?? '', comentarioProfessor: q?.comentario_professor ?? null },
    }
  })
}
