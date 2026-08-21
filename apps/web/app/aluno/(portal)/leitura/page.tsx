import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BookOpenText, CheckCircle2, Library } from 'lucide-react'
import { getSessaoAluno } from '@/lib/aluno-session'
import { documentosDoAluno } from '@/lib/leitura/acesso'
import { LEITURA_ATIVA } from '@/lib/flags'

export const dynamic = 'force-dynamic'

export default async function LeituraAlunoPage() {
  if (!LEITURA_ATIVA) redirect('/aluno')
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const docs = await documentosDoAluno(sessao.estudanteId, sessao.tenantId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Library className="h-6 w-6 text-primary" /> Leitura</h1>
        <p className="text-muted-foreground">Documentos e materiais para ler com anotações e acompanhamento do seu progresso.</p>
      </div>

      {docs.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">Nenhum documento disponível ainda.</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {docs.map((d) => {
            const c = d.cor ?? '#6d28d9'
            return (
              <Link key={d.id} href={`/aluno/leitura/${d.id}`} className="group relative aspect-[4/5] overflow-hidden rounded-2xl border shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
                {d.capa_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.capa_url} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                ) : (
                  <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${c} 0%, #0f172a 135%)` }} />
                )}
                {!d.capa_url && <BookOpenText className="absolute -right-6 -top-6 h-40 w-40 text-white/10" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />

                {/* Selo de progresso / concluído */}
                <div className="absolute right-2 top-2 z-20">
                  {d.concluido ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/85 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur"><CheckCircle2 className="h-3 w-3" /> Concluído</span>
                  ) : d.pct > 0 ? (
                    <span className="inline-flex items-center rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">{d.pct}%</span>
                  ) : null}
                </div>

                <div className="absolute inset-x-0 bottom-0 z-20 p-3">
                  <h3 className="line-clamp-2 text-sm font-bold leading-tight text-white drop-shadow-sm">{d.titulo}</h3>
                  {d.descricao && <p className="mt-0.5 line-clamp-1 text-[11px] text-white/70">{d.descricao}</p>}
                  {/* Barra de progresso */}
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20">
                    <div className="h-full rounded-full bg-white/90" style={{ width: `${d.pct}%` }} />
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
