import Link from 'next/link'
import { BarChart3, FlaskConical, Pencil, Clock, Layers } from 'lucide-react'
import { listarCadernosTesteDoBanco } from '@/app/admin/cadernos-teste/actions'
import { NovoCadernoTesteBtn } from '@/components/admin/caderno-teste-novo-btn'

/** Aba "Caderno teste" do banco: lista os cadernos de teste vinculados + entrada para o construtor. */
export async function BancoCadernoTeste({ bancoId, cor = '#6d28d9' }: { bancoId: string; cor?: string }) {
  const cadernos = await listarCadernosTesteDoBanco(bancoId)
  const fmt = (d: string | null) => { if (!d) return ''; try { return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) } catch { return '' } }

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3.5" style={{ background: `linear-gradient(90deg, ${cor}1f, transparent 55%)` }}>
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" style={{ background: cor }}><FlaskConical className="h-5 w-5" /></span>
          <div>
            <h3 className="text-sm font-semibold leading-tight">Caderno de teste</h3>
            <p className="text-xs text-muted-foreground">Construtor “modelo + ajustes” (diagnóstico, caderno de questões, folha) — {cadernos.length} caderno(s)</p>
          </div>
        </div>
        <NovoCadernoTesteBtn bancoId={bancoId} />
      </div>

      <div className="p-4">
        {cadernos.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <FlaskConical className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium">Nenhum caderno de teste para este banco.</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">Crie um para montar o material no construtor (escolha um modelo, ajuste os blocos e a prévia usa os dados reais deste banco).</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cadernos.map((c) => (
              <Link key={c.id} href={`/admin/cadernos-teste/${c.id}`} className="group flex flex-col gap-3 rounded-xl border bg-background p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md">
                <div className="flex items-start gap-2.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white shadow-sm" style={{ background: cor }}><BarChart3 className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-tight" title={c.nome}>{c.nome}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Layers className="h-3 w-3" /> {c.grupos} grupo(s)</span>
                      {c.atualizadoEm && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {fmt(c.atualizadoEm)}</span>}
                    </div>
                  </div>
                </div>
                <span className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium text-primary transition-colors group-hover:border-primary/50 group-hover:bg-primary/5">
                  <Pencil className="h-3.5 w-3.5" /> Abrir editor
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
