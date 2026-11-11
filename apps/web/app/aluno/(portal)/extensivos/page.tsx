import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessaoAluno } from '@/lib/aluno-session'
import { produtosDoAluno } from '@/lib/produtos/aluno'
import { organizarCardsCursos } from '@/lib/produtos/cursos-posicao'
import { PRODUTO_TIPOS } from '@/lib/produtos/tipos'
import { GraduationCap, ChevronRight, CalendarClock } from 'lucide-react'

export const dynamic = 'force-dynamic'

const labelTipo = (t: string) => PRODUTO_TIPOS.find((x) => x.v === t)?.label ?? t

export default async function MeusExtensivosPage() {
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const produtos = (await produtosDoAluno(sessao.tenantId, sessao.estudanteId)).filter((p) => p.tipo !== 'jurisclub') // JurisClub tem área própria
  const cards = organizarCardsCursos(produtos) // agrupados entram no card do produto-pai; largura 1/2 colunas

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
          {cards.map(({ principal: p, filhos, largura }) => {
            const cor = p.cor || 'var(--brand-primary, var(--primary))'
            return (
              <div key={p.id} className={`group flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${largura === 2 ? 'sm:col-span-2' : ''}`}>
                <Link href={`/aluno/extensivos/${p.slug}`} className="block">
                  <div className={`relative ${largura === 2 ? 'h-40' : 'h-28'}`} style={p.capa_url
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
                {filhos.length > 0 && (
                  <div className="mt-auto border-t bg-muted/30 p-2">
                    <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Também neste card</div>
                    {filhos.map((f) => (
                      <Link key={f.id} href={`/aluno/extensivos/${f.slug}`} className="group/f flex items-center justify-between gap-2 rounded-xl px-2 py-2 text-sm font-medium hover:bg-muted">
                        <span className="min-w-0 truncate">{f.nome}</span>
                        <span className="flex shrink-0 items-center gap-2 text-xs font-normal text-muted-foreground">{f.itens} item(ns)<ChevronRight className="h-4 w-4 transition-transform group-hover/f:translate-x-0.5" /></span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
