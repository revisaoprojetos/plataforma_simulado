import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { getStorage } from '@/lib/storage'
import { CorrecaoMesa } from '@/components/admin/correcao-mesa'
import { type Marca } from '@/components/admin/correcao-folha'
import { ArrowLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'
const ZERO = '00000000-0000-0000-0000-000000000000'

export default async function CorrigirPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await getCurrentAccess()
  const svc = createAdminClient()
  const tenantId = access.tenantId ?? ZERO

  const { data: r } = await svc
    .from('simulado_respostas_discursivas')
    .select('id, sessao_id, questao_id, estudante_id, texto, status, nota, feedback')
    .eq('id', id).eq('tenant_id', tenantId).maybeSingle()
  if (!r) notFound()

  const [{ data: questao }, { data: estudante }, { data: comps }, { data: sessao }] = await Promise.all([
    svc.from('simulado_questoes').select('enunciado, comentario_professor').eq('id', r.questao_id).maybeSingle(),
    svc.from('simulado_estudantes').select('nome').eq('id', r.estudante_id).maybeSingle(),
    svc.from('simulado_competencias').select('id, nome, pontos, ordem').eq('questao_id', r.questao_id).order('ordem'),
    svc.from('simulado_sessoes_prova').select('simulado_id').eq('id', r.sessao_id).maybeSingle(),
  ])
  // Notas por competência com o estado do ritual (tolerante à migração 2 ausente).
  const notas = await (async () => {
    const full = await svc.from('simulado_correcao_competencias').select('competencia_id, nota, comentario, audit_state, mensagem_aluno').eq('resposta_id', id)
    if (!full.error) return full.data ?? []
    const basic = await svc.from('simulado_correcao_competencias').select('competencia_id, nota, comentario').eq('resposta_id', id)
    return basic.data ?? []
  })()

  // Páginas (fotos) enviadas pelo aluno → URLs assinadas (bucket privado). arquivoId liga a anotação à página.
  const paginas: { arquivoId: string; url: string }[] = []
  try {
    const { data: js } = await svc.from('simulado_resposta_arquivos').select('arquivo_id, ordem').eq('resposta_id', id).order('ordem')
    const arqIds = (js ?? []).map((j: any) => j.arquivo_id)
    if (arqIds.length) {
      const { data: arqs } = await svc.from('simulado_arquivos').select('id, bucket, path').in('id', arqIds)
      const arqMap = new Map((arqs ?? []).map((a: any) => [a.id, a]))
      const storage = getStorage()
      for (const j of (js ?? []) as any[]) {
        const a = arqMap.get(j.arquivo_id)
        if (!a) continue
        try { paginas.push({ arquivoId: a.id as string, url: await storage.getSignedUrl(a.bucket, a.path, 3600) }) } catch { /* sumiu */ }
      }
    }
  } catch { /* junção não migrada */ }

  // Anotações da mesa (tolerante à tabela ausente — migração pendente).
  let anotacoesIniciais: Marca[] = []
  try {
    const { data: an } = await svc
      .from('simulado_anotacoes_discursivas')
      .select('id, arquivo_id, competencia_id, tipo, x, y, largura, altura, cor, icone, numero, conteudo')
      .eq('resposta_id', id).eq('tenant_id', tenantId).order('criado_em', { ascending: true })
    anotacoesIniciais = (an ?? []).map((a: any) => ({
      id: a.id, arquivo_id: a.arquivo_id, competencia_id: a.competencia_id, tipo: a.tipo,
      x: Number(a.x), y: Number(a.y),
      largura: a.largura != null ? Number(a.largura) : null, altura: a.altura != null ? Number(a.altura) : null,
      cor: a.cor, icone: a.icone, numero: a.numero != null ? Number(a.numero) : null, conteudo: a.conteudo,
    }))
  } catch { /* tabela não migrada */ }

  const notaMap = new Map((notas ?? []).map((n: any) => [n.competencia_id, n]))
  const competencias = (comps ?? []).map((c: any) => {
    const n = notaMap.get(c.id)
    return {
      id: c.id, nome: c.nome, pontos: Number(c.pontos),
      nota: n?.nota != null ? Number(n.nota) : null,
      comentario: n?.comentario ?? '',
      audit_state: (n?.audit_state ?? 'pending') as string,
      mensagem: n?.mensagem_aluno ?? '',
    }
  })
  const simuladoId = (sessao as any)?.simulado_id as string | undefined
  const voltarUrl = simuladoId ? `/admin/correcao/simulado/${simuladoId}` : '/admin/correcao'

  return (
    <div className="mx-auto max-w-[110rem] space-y-4">
      <Link href={voltarUrl} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Corrigir resposta</h1>
          <p className="text-muted-foreground">Aluno: {estudante?.nome ?? '—'}</p>
        </div>
        {r.texto && <p className="max-w-md text-xs text-muted-foreground">Obs. do aluno: <span className="italic">“{r.texto.slice(0, 140)}”</span></p>}
      </div>

      <CorrecaoMesa
        respostaId={r.id}
        jaCorrigida={r.status === 'corrigida'}
        competencias={competencias}
        feedbackInicial={r.feedback ?? ''}
        voltarUrl={voltarUrl}
        paginas={paginas}
        anotacoesIniciais={anotacoesIniciais}
        espelho={{ enunciado: questao?.enunciado ?? '', comentarioProfessor: questao?.comentario_professor ?? null }}
      />
    </div>
  )
}
