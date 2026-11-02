import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessaoAluno } from '@/lib/aluno-session'
import { produtosDoAluno } from '@/lib/produtos/aluno'
import { PRODUTO_TIPOS } from '@/lib/produtos/tipos'
import { GraduationCap, ChevronRight, CalendarClock } from 'lucide-react'

export const dynamic = 'force-dynamic'

const labelTipo = (t: string) => PRODUTO_TIPOS.find((x) => x.v === t)?.label ?? t

export default async function MeusExtensivosPage() {
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const produtos = await produtosDoAluno(sessao.tenantId, sessao.estudanteId)

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Meus Extensivos</h1>
        <p className="text-sm text-muted-foreground">Seus programas de estudo — conteúdo, videoaulas e simulados liberados.</p>
      </div>

      {produtos.length === 0 ? (
        <div className="rounded-2xl border bg-muted/30 p-10 text-center">
          <GraduationCap className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Você ainda não tem um extensivo ativo. Seu acesso ao conteúdo continua disponível normalmente pelo menu.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {produtos.map((p) => {
            const cor = p.cor || 'var(--brand-primary, var(--primary))'
            return (
              <Link key={p.id} href={`/aluno/extensivos/${p.slug}`}
                className="group overflow-hidden rounded-2xl border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                <div className="relative h-28" style={p.capa_url
                  ? { backgroundImage: `url(${p.capa_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                  : { background: `linear-gradient(135deg, ${cor}, color-mix(in srgb, ${cor} 55%, #000))` }}>
                  <span className="absolute left-3 top-3 rounded-full bg-black/35 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">{labelTipo(p.tipo)}</span>
                </div>
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold leading-tight">{p.nome}</h2>
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                  {p.descricao && <p className="line-clamp-2 text-xs text-muted-foreground">{p.descricao}</p>}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{p.itens} item(ns) liberado(s)</span>
                    {p.expira_em && (
                      <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />até {new Date(p.expira_em).toLocaleDateString('pt-BR')}</span>
                    )}
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
