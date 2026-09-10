import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Library, ArrowLeft } from 'lucide-react'
import { getSessaoAluno } from '@/lib/aluno-session'
import { LEITURA_ATIVA } from '@/lib/flags'
import { carregarTrilhaLeituraAluno } from '@/lib/leitura/trilha'
import { TrilhaGigante } from '@/components/aluno/trilha-simulados'
import { LeituraModulos } from '@/components/aluno/leitura-modulos'

export const dynamic = 'force-dynamic'

export default async function LeituraAlunoPage({ searchParams }: { searchParams: Promise<{ modulo?: string }> }) {
  if (!LEITURA_ATIVA) redirect('/aluno')
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const trilhas = await carregarTrilhaLeituraAluno(sessao.estudanteId, sessao.tenantId)
  const { modulo } = await searchParams
  const sel = modulo ? trilhas.find((t) => t.id === modulo) : null

  // ===== Módulo aberto: infos + trilha serpenteada dele =====
  if (sel) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/aluno/leitura" aria-label="Voltar aos módulos" title="Voltar aos módulos" className="inline-flex shrink-0 items-center justify-center rounded-lg border bg-card p-2 text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Library className="h-6 w-6 text-primary" /> {sel.nome}</h1>
            <p className="text-muted-foreground">
              Leia cada aula e desbloqueie as questões. <span className="font-semibold text-foreground">{sel.done}/{sel.total}</span> concluída(s).
            </p>
          </div>
        </div>
        <div className="overflow-x-auto pb-10"><TrilhaGigante trilhas={[sel]} gamAtivo={false} /></div>
      </div>
    )
  }

  // ===== Seleção de módulos (cards) =====
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Library className="h-6 w-6 text-primary" /> LegProc Digital</h1>
        <p className="text-muted-foreground">Escolha um módulo para começar — leia as aulas e libere as questões de cada uma.</p>
      </div>

      {trilhas.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">Nenhum módulo disponível ainda.</div>
      ) : (
        <LeituraModulos modulos={trilhas.map((t) => ({ id: t.id, nome: t.nome, cor: t.cor, capa: t.capa ?? null, capaCard: t.capaCard ?? null, total: t.total, done: t.done }))} />
      )}
    </div>
  )
}
