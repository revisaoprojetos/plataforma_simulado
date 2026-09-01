import { redirect } from 'next/navigation'
import { Library } from 'lucide-react'
import { getSessaoAluno } from '@/lib/aluno-session'
import { documentosDoAluno } from '@/lib/leitura/acesso'
import { LEITURA_ATIVA } from '@/lib/flags'
import { LeituraCatalogo } from '@/components/aluno/leitura-catalogo'

export const dynamic = 'force-dynamic'

export default async function LeituraAlunoPage() {
  if (!LEITURA_ATIVA) redirect('/aluno')
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const docs = await documentosDoAluno(sessao.estudanteId, sessao.tenantId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Library className="h-6 w-6 text-primary" /> LegProc Digital</h1>
        <p className="text-muted-foreground">Leis e materiais organizados por matéria, para ler com anotações e acompanhar seu progresso.</p>
      </div>

      {docs.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">Nenhum documento disponível ainda.</div>
      ) : (
        <LeituraCatalogo docs={docs} />
      )}
    </div>
  )
}
