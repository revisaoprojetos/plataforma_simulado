import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { ArrowLeft, Check, X } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const LETRA = ['A', 'B', 'C', 'D', 'E', 'F']

export default async function GabaritoEstudantePage({ params }: { params: Promise<{ id: string; sessao: string }> }) {
  const { id, sessao } = await params
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()

  const { data: sess } = await svc
    .from('simulado_sessoes_prova')
    .select('id, estudante_id, nota, status, finalizado_em, tentativa_num, simulado_id, simulados:simulado_simulados(titulo), estudantes:simulado_estudantes(nome)')
    .eq('id', sessao)
    .eq('tenant_id', tenantId ?? '')
    .maybeSingle()
  if (!sess || sess.estudante_id !== id) notFound()

  // Respostas da sessão: alternativa marcada (em snapshot_gabarito) + acerto.
  const { data: resp } = await svc
    .from('simulado_respostas_objetivas')
    .select('questao_id, correta, alternativa_id, snapshot_gabarito, respondido_em')
    .eq('sessao_id', sessao)
  const marcada = new Map<string, string>() // questaoId → alternativaId marcada
  const marcadaLetra = new Map<string, string>() // questaoId → letra marcada (valor armazenado)
  const acertou = new Map<string, boolean>()
  for (const r of resp ?? []) {
    const snap = (r as any).snapshot_gabarito
    const altId = (r as any).alternativa_id ?? snap?.alternativa_id
    if (altId) marcada.set((r as any).questao_id, altId)
    if (snap?.letra) marcadaLetra.set((r as any).questao_id, snap.letra)
    acertou.set((r as any).questao_id, !!(r as any).correta)
  }

  const qids = [...new Set((resp ?? []).map((r: any) => r.questao_id))]
  const [{ data: questoes }, { data: alts }] = await Promise.all([
    qids.length ? svc.from('simulado_questoes').select('id, enunciado').in('id', qids) : Promise.resolve({ data: [] as any[] }),
    qids.length ? svc.from('simulado_alternativas').select('id, questao_id, texto, ordem, correta').in('questao_id', qids) : Promise.resolve({ data: [] as any[] }),
  ])
  const qMap = new Map((questoes ?? []).map((q: any) => [q.id, q]))
  const altsPorQ = new Map<string, any[]>()
  for (const a of alts ?? []) { const arr = altsPorQ.get(a.questao_id) ?? []; arr.push(a); altsPorQ.set(a.questao_id, arr) }

  // Ordem das questões pela prova, se houver; senão, ordem das respostas.
  let ordem = qids
  const { data: pq } = await svc.from('simulado_prova_questoes').select('questao_id, ordem').eq('simulado_id', sess.simulado_id).order('ordem')
  if (pq?.length) {
    const ord = pq.map((p: any) => p.questao_id).filter((q: string) => qids.includes(q))
    ordem = [...ord, ...qids.filter((q) => !ord.includes(q))]
  }

  const total = qids.length
  const acertosN = [...acertou.values()].filter(Boolean).length
  const nome = (sess as any).estudantes?.nome ?? 'Estudante'
  const titulo = (sess as any).simulados?.titulo ?? 'Simulado'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/admin/estudantes/${id}`} className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}><ArrowLeft className="h-4 w-4" /></Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gabarito do estudante</h1>
          <p className="text-muted-foreground">{nome} · {titulo}{sess.tentativa_num ? ` · ${sess.tentativa_num}ª tentativa` : ''}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Acertos</p><p className="text-2xl font-bold text-green-600">{acertosN}<span className="text-base font-normal text-muted-foreground">/{total}</span></p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Nota</p><p className="text-2xl font-bold">{sess.nota != null ? Number(sess.nota).toFixed(1) : '—'}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Finalizado</p><p className="text-sm font-medium">{sess.finalizado_em ? format(new Date(sess.finalizado_em), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : 'Em andamento'}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Respostas ({total} questões)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {total === 0 ? <p className="text-sm text-muted-foreground">Nenhuma resposta registrada.</p> : ordem.map((qid, i) => {
            const q = qMap.get(qid)
            const qAlts = (altsPorQ.get(qid) ?? []).slice().sort((a, b) => a.ordem - b.ordem)
            const marcadaId = marcada.get(qid)
            const letraMarc = marcadaLetra.get(qid)
            const respondeu = !!marcadaId || !!letraMarc
            const ok = acertou.get(qid)
            return (
              <div key={qid} className="rounded-lg border p-3">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <p className="text-sm font-medium"><span className="text-primary">{i + 1}.</span> {q?.enunciado ?? '(questão removida)'}</p>
                  {respondeu ? (
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${ok ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
                      {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />} {ok ? 'Acertou' : 'Errou'}{letraMarc ? ` · marcou ${letraMarc}` : ''}
                    </span>
                  ) : <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Em branco</span>}
                </div>
                <div className="ml-4 space-y-1">
                  {qAlts.map((a, j) => {
                    const ehMarcada = a.id === marcadaId || (!!letraMarc && (LETRA[j] ?? '') === letraMarc)
                    const ehCorreta = !!a.correta
                    return (
                      <div key={a.id} className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${ehMarcada ? (ok ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20') : ehCorreta ? 'bg-emerald-50/60 dark:bg-emerald-900/10' : ''}`}>
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${ehMarcada ? (ok ? 'border-green-500 bg-green-500 text-white' : 'border-red-500 bg-red-500 text-white') : 'border-muted-foreground/30'}`}>{LETRA[j] ?? j + 1}</span>
                        <span className={ehMarcada ? 'font-medium' : ''}>{a.texto}</span>
                        {ehMarcada && <span className="text-xs text-muted-foreground">(marcada)</span>}
                        {ehCorreta && !ehMarcada && <span className="text-xs font-medium text-emerald-600">✓ gabarito</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
