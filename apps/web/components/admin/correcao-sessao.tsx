'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ArrowLeft, Check, User } from 'lucide-react'
import { CorrecaoMesa } from '@/components/admin/correcao-mesa'
import { type Marca } from '@/components/admin/correcao-folha'

export interface QuestaoCorrecao {
  respostaId: string
  numero: number
  status: string
  enunciado: string
  jaCorrigida: boolean
  feedbackInicial: string
  competencias: { id: string; nome: string; pontos: number; nota: number | null; comentario: string; audit_state: string; mensagem: string }[]
  paginas: { arquivoId: string; url: string }[]
  anotacoesIniciais: Marca[]
  espelho: { enunciado: string; comentarioProfessor: string | null }
}

/**
 * Shell de TELA CHEIA da correção (estilo AURÉA, imersivo): top bar com aluno + navegador de
 * questões, e a mesa da questão ativa preenchendo o resto. Corrige a tentativa inteira sem sair.
 */
export function CorrecaoSessao({ aluno, email, tentativa, simuladoTitulo, questoes, voltarUrl }: {
  aluno: string
  email: string
  tentativa: number | null
  simuladoTitulo: string
  questoes: QuestaoCorrecao[]
  voltarUrl: string
}) {
  const router = useRouter()
  const [ativo, setAtivo] = useState(0)
  const [override, setOverride] = useState<Record<string, string>>({})
  const statusDe = (q: QuestaoCorrecao) => override[q.respostaId] ?? q.status
  const q = questoes[ativo]
  const pendentes = questoes.filter((x) => statusDe(x) !== 'corrigida').length

  function handleDevolvido(respostaId: string) {
    setOverride((o) => ({ ...o, [respostaId]: 'corrigida' }))
    const idx = questoes.findIndex((x) => x.respostaId === respostaId)
    const next = questoes.findIndex((x, i) => i > idx && (override[x.respostaId] ?? x.status) !== 'corrigida')
    if (next >= 0) setAtivo(next)
    router.refresh()
    toast.success(pendentes <= 1 ? 'Tentativa corrigida!' : 'Questão corrigida — próxima aberta')
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      {/* TOP BAR */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-3 sm:px-4">
        <Link href={voltarUrl} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:bg-muted" title="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><User className="h-4 w-4" /></span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">{aluno}{tentativa != null && ` · Tentativa ${tentativa}`}</p>
          <p className="truncate text-[11px] leading-tight text-muted-foreground">{email || '—'} · {simuladoTitulo}</p>
        </div>

        {/* navegador de questões */}
        <div className="mx-auto flex items-center gap-1.5">
          {questoes.map((x, i) => {
            const s = statusDe(x)
            const at = i === ativo
            return (
              <button key={x.respostaId} type="button" onClick={() => setAtivo(i)} title={`Questão ${x.numero}`}
                className={cn('flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg px-2 text-sm font-bold transition-colors',
                  at ? 'bg-primary text-primary-foreground' : s === 'corrigida' ? 'bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 dark:text-emerald-400' : 'bg-muted text-muted-foreground hover:bg-muted/70')}>
                {s === 'corrigida' ? <Check className="h-4 w-4" /> : x.numero}
              </button>
            )
          })}
        </div>

        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {pendentes === 0 ? 'Tudo corrigido' : `${pendentes} pendente${pendentes === 1 ? '' : 's'}`}
        </span>
      </header>

      {/* MESA DA QUESTÃO ATIVA */}
      {q && (
        <CorrecaoMesa
          key={q.respostaId}
          respostaId={q.respostaId}
          jaCorrigida={statusDe(q) === 'corrigida'}
          competencias={q.competencias}
          feedbackInicial={q.feedbackInicial}
          voltarUrl={voltarUrl}
          paginas={q.paginas}
          anotacoesIniciais={q.anotacoesIniciais}
          espelho={q.espelho}
          embedded
          onDevolvido={() => handleDevolvido(q.respostaId)}
        />
      )}
    </div>
  )
}
