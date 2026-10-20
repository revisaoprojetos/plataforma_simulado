import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FileText, FileType2, FileCode2, BookOpen } from 'lucide-react'
import { getSessaoAluno } from '@/lib/aluno-session'
import { listarBibliotecaAluno } from '@/lib/conteudo/leitor'

export const dynamic = 'force-dynamic'

const ICONE: Record<string, typeof FileText> = { docx: FileType2, pdf: FileText, html: FileCode2 }

export default async function BibliotecaAlunoPage() {
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const docs = await listarBibliotecaAluno(sessao.estudanteId)

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <div className="mb-6 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary"><BookOpen className="h-6 w-6" /></span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Biblioteca</h1>
          <p className="text-sm text-muted-foreground">Seus materiais de leitura — leia na plataforma e salve seus grifos.</p>
        </div>
      </div>

      {docs.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/30 px-6 py-16 text-center text-sm text-muted-foreground">
          Nenhum material liberado ainda.
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,240px),1fr))' }}>
          {docs.map((d) => {
            const Icone = ICONE[d.tipo_origem] ?? FileText
            return (
              <Link key={d.id} href={`/aluno/biblioteca/${d.id}`} className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm transition hover:border-primary/40 hover:shadow">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-muted text-foreground"><Icone className="h-5 w-5" /></span>
                <span className="truncate text-sm font-semibold" title={d.titulo}>{d.titulo}</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
