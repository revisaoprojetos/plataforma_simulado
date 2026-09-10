'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, BookOpenText, CheckCircle2 } from 'lucide-react'
import { QuestaoLeitura } from '@/components/aluno/questao-leitura'
import type { DocumentoCarregado } from '@/lib/leitura/acesso'

/**
 * Etapa de QUESTÕES da aula (liberada após concluir a leitura). Mostra as questões da aula; para
 * consultar o documento COM os grifos (padrão + pessoal), o botão "Consultar o documento" abre o
 * leitor. Ao responder todas as obrigatórias, a próxima aula é liberada na trilha.
 */
export function LeituraQuestoesStep({ doc }: { doc: DocumentoCarregado }) {
  const questoes = doc.questoes ?? []
  const [respondidas, setRespondidas] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(questoes.filter((q) => q.resposta).map((q) => [q.docQuestaoId, true])))
  const obrig = questoes.filter((q) => q.obrigatoria)
  const feitas = obrig.filter((q) => respondidas[q.docQuestaoId]).length
  const tudoFeito = obrig.length === 0 || feitas >= obrig.length

  return (
    <div className="mx-auto max-w-3xl space-y-5 py-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/aluno/leitura" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Trilha</Link>
        <Link href={`/aluno/leitura/${doc.id}`} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"><BookOpenText className="h-4 w-4" /> Consultar o documento</Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{doc.titulo}</h1>
        <p className="text-sm text-muted-foreground">Questões da aula {obrig.length > 0 && <>· <span className="font-semibold text-foreground">{feitas}/{obrig.length}</span> obrigatórias respondidas</>}</p>
      </div>

      {questoes.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">Esta aula não tem questões.</div>
      ) : (
        <div className="space-y-4">
          {questoes.map((q) => (
            <QuestaoLeitura key={q.docQuestaoId} documentoId={doc.id} q={q} corFg="var(--foreground)" corMuted="var(--muted-foreground)" onRespondida={(id) => setRespondidas((p) => ({ ...p, [id]: true }))} />
          ))}
        </div>
      )}

      {tudoFeito && questoes.length > 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-50 p-5 text-center dark:bg-emerald-950/30">
          <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
          <p className="font-semibold text-emerald-700 dark:text-emerald-400">Aula concluída! A próxima foi liberada na trilha. 🎉</p>
          <Link href="/aluno/leitura" className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90">Voltar à trilha</Link>
        </div>
      )}
    </div>
  )
}
