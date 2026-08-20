'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { CheckCircle2 } from 'lucide-react'
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
 * Correção de uma TENTATIVA inteira: navegador com todas as questões discursivas da
 * sessão + a mesa da questão ativa. O professor corrige uma a uma sem sair da página;
 * ao "Devolver", avança para a próxima pendente (não redireciona).
 */
export function CorrecaoSessao({ questoes, voltarUrl }: { questoes: QuestaoCorrecao[]; voltarUrl: string }) {
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
    toast.success(pendentes <= 1 ? 'Tentativa corrigida!' : 'Questão corrigida — próxima pendente aberta')
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {questoes.map((x, i) => {
          const s = statusDe(x)
          const at = i === ativo
          return (
            <button key={x.respostaId} type="button" onClick={() => setAtivo(i)}
              className={cn('flex max-w-[15rem] items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors', at ? 'border-primary bg-primary/5' : 'hover:bg-muted/50')}>
              <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                s === 'corrigida' ? 'bg-emerald-500 text-white' : s === 'em_correcao' ? 'bg-sky-500 text-white' : 'bg-muted text-muted-foreground')}>
                {s === 'corrigida' ? <CheckCircle2 className="h-3.5 w-3.5" /> : x.numero}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold leading-tight">Questão {x.numero}</span>
                <span className="block truncate text-[11px] leading-tight text-muted-foreground">{x.enunciado.slice(0, 38) || '—'}</span>
              </span>
            </button>
          )
        })}
        <span className="ml-1 text-xs text-muted-foreground">
          {pendentes === 0 ? 'Tudo corrigido' : `${pendentes} pendente${pendentes === 1 ? '' : 's'}`}
        </span>
      </div>

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
