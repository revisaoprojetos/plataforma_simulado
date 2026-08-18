import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { getStorage } from '@/lib/storage'
import { CorrecaoForm } from '@/components/admin/correcao-form'
import { MarkdownContent } from '@/components/markdown-content'
import { ArrowLeft, Images, BookOpen } from 'lucide-react'

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

  const [{ data: questao }, { data: estudante }, { data: comps }, { data: notas }, { data: sessao }] = await Promise.all([
    svc.from('simulado_questoes').select('enunciado, comentario_professor').eq('id', r.questao_id).maybeSingle(),
    svc.from('simulado_estudantes').select('nome').eq('id', r.estudante_id).maybeSingle(),
    svc.from('simulado_competencias').select('id, nome, pontos, ordem').eq('questao_id', r.questao_id).order('ordem'),
    svc.from('simulado_correcao_competencias').select('competencia_id, nota, comentario').eq('resposta_id', id),
    svc.from('simulado_sessoes_prova').select('simulado_id').eq('id', r.sessao_id).maybeSingle(),
  ])

  // Páginas (fotos) enviadas pelo aluno → URLs assinadas (bucket privado).
  const paginas: { url: string }[] = []
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
        try { paginas.push({ url: await storage.getSignedUrl(a.bucket, a.path, 3600) }) } catch { /* sumiu */ }
      }
    }
  } catch { /* junção não migrada */ }

  const notaMap = new Map((notas ?? []).map((n: any) => [n.competencia_id, n]))
  const competencias = (comps ?? []).map((c: any) => ({
    id: c.id, nome: c.nome, pontos: Number(c.pontos),
    nota: notaMap.get(c.id)?.nota != null ? Number(notaMap.get(c.id).nota) : null,
    comentario: notaMap.get(c.id)?.comentario ?? '',
  }))
  const simuladoId = (sessao as any)?.simulado_id as string | undefined
  const voltarUrl = simuladoId ? `/admin/correcao/simulado/${simuladoId}` : '/admin/correcao'

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link href={voltarUrl} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Corrigir resposta</h1>
        <p className="text-muted-foreground">Aluno: {estudante?.nome ?? '—'}</p>
      </div>

      {/* Prova do aluno (imagens) × Espelho (enunciado + gabarito + competências) lado a lado. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Images className="h-4 w-4" /> Resposta do aluno</p>
          {paginas.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {paginas.map((p, i) => (
                <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className="group relative block overflow-hidden rounded-lg border bg-background">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={`Página ${i + 1}`} className="h-56 w-full object-contain" />
                  <span className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white">Página {i + 1}</span>
                </a>
              ))}
            </div>
          ) : (
            <p className="rounded-md border bg-background p-3 text-sm text-muted-foreground">Nenhuma foto enviada.</p>
          )}
          {r.texto && (
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">Observações do aluno</p>
              <p className="whitespace-pre-wrap rounded-md border bg-background p-3 text-sm">{r.texto}</p>
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-lg border bg-card p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><BookOpen className="h-4 w-4" /> Espelho de correção</p>
          <div>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">Enunciado</p>
            <MarkdownContent className="text-sm leading-relaxed">{questao?.enunciado ?? '—'}</MarkdownContent>
          </div>
          {questao?.comentario_professor && (
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">Gabarito / comentário</p>
              <MarkdownContent className="text-sm leading-relaxed">{questao.comentario_professor}</MarkdownContent>
            </div>
          )}
          {competencias.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">Competências</p>
              <ul className="space-y-1 text-sm">
                {competencias.map((c) => (
                  <li key={c.id} className="flex justify-between gap-2 rounded-md border px-2.5 py-1.5">
                    <span>{c.nome}</span><span className="shrink-0 text-muted-foreground">{c.pontos.toFixed(1)} pts</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <CorrecaoForm
        respostaId={r.id}
        jaCorrigida={r.status === 'corrigida'}
        competencias={competencias}
        feedbackInicial={r.feedback ?? ''}
        voltarUrl={voltarUrl}
      />
    </div>
  )
}
