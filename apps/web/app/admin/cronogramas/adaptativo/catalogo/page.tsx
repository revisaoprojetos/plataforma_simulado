import Link from 'next/link'
import { AlertTriangle, Info } from 'lucide-react'
import { obterCatalogoMotor, obterEditorCatalogo } from '../actions'
import { obterFiltrosQf } from '../qf-actions'
import { CatalogoEditor } from './catalogo-editor'
import { AdaptativoTabs } from '@/components/admin/adaptativo-tabs'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// Admin: Cronograma Adaptativo — Catálogo de metas: edição de aulas, links de questões e LegProc (+ diagnóstico do que o motor usa).
export default async function CatalogoMetasPage() {
  const [ed, r, filtrosQf] = await Promise.all([obterEditorCatalogo(), obterCatalogoMotor(), obterFiltrosQf()])
  const c = r.catalogo
  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cronograma adaptativo · Catálogo de metas</h1>
        <p className="text-muted-foreground">
          Cadastre e ajuste as aulas (títulos, páginas e links de questões) e as metas de LegProc por disciplina. Ao salvar, os cronogramas dos alunos
          são atualizados preservando o que já foi concluído. Os documentos em si continuam na{' '}
          <Link href="/admin/biblioteca" className="text-primary underline-offset-2 hover:underline">Biblioteca</Link>.
        </p>
      </div>
      <AdaptativoTabs />
      <div className="text-sm">
        <Link href="/admin/cronogramas/adaptativo/catalogo/paginas" className="text-primary underline-offset-2 hover:underline">Divergência de páginas (planilha × Biblioteca) e recontagem →</Link>
      </div>

      {c && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-2xl border bg-card px-4 py-2.5 text-sm">
          {[['disciplinas', c.totais.disciplinas], ['aulas ativas', c.totais.aulas], ['metas de LegProc', c.totais.legprocMetas], ['leis', c.totais.leis]].map(([t, v]) => (
            <span key={String(t)}><b className="tabular-nums">{Number(v).toLocaleString('pt-BR')}</b> <span className="text-muted-foreground">{t}</span></span>
          ))}
          {c.totais.semPaginas > 0 && <span className="text-amber-600 dark:text-amber-400"><b className="tabular-nums">{c.totais.semPaginas}</b> aula(s) sem páginas</span>}
        </div>
      )}
      {c && c.avisos.length > 0 && (
        <div className="space-y-2">
          {c.avisos.map((a, i) => (
            <div key={i} className={cn('flex items-start gap-3 rounded-2xl border p-3 text-sm',
              a.nivel === 'alto' ? 'border-destructive/30 bg-destructive/5 text-destructive' : a.nivel === 'medio' ? 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400' : 'bg-muted/40 text-muted-foreground')}>
              {a.nivel === 'info' ? <Info className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>{a.texto}</span>
            </div>
          ))}
        </div>
      )}

      {!ed.ok || !ed.editor ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{ed.error ?? 'Falha ao carregar o catálogo.'}</div>
      ) : (
        <CatalogoEditor inicial={ed.editor} filtrosQf={filtrosQf} />
      )}

      {c && (
        <details className="rounded-2xl border bg-card">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold">Resumo por disciplina e fila global de PDFull</summary>
          <div className="space-y-4 border-t p-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-3 font-medium">Disciplina</th>
                    <th className="px-3 py-2 font-medium">Grupo</th>
                    <th className="px-3 py-2 text-right font-medium">Aulas</th>
                    <th className="px-3 py-2 text-right font-medium">Páginas</th>
                    <th className="px-3 py-2 text-right font-medium">Sem págs.</th>
                    <th className="px-3 py-2 text-right font-medium">Metas LegProc</th>
                    <th className="px-3 py-2 text-right font-medium">Leis</th>
                    <th className="px-3 py-2 font-medium">Revisão regular</th>
                  </tr>
                </thead>
                <tbody>
                  {c.disciplinas.map((d) => (
                    <tr key={d.nome} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{d.nome}</td>
                      <td className="px-3 py-2 capitalize text-muted-foreground">{d.classificacao ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.aulas}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.paginas.toLocaleString('pt-BR')}</td>
                      <td className={cn('px-3 py-2 text-right tabular-nums', d.semPaginas > 0 && 'font-medium text-amber-600 dark:text-amber-400')}>{d.semPaginas}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.legprocMetas}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.leis}</td>
                      <td className="px-3 py-2"><span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', d.semRevisao ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary')}>{d.semRevisao ? 'não gera' : 'gera'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="text-sm font-semibold">Fila global de PDFull (primeiras {c.ordemInicial.length} aulas)</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">A ordem intercala disciplinas — o motor não agrupa por matéria. Alunos recebem as aulas das disciplinas que escolherem, nesta sequência.</p>
              <ol className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {c.ordemInicial.map((o) => (
                  <li key={o.pos} className="flex gap-2"><span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">{o.pos}</span><span className="truncate"><span className="font-medium">{o.disc}</span> · aula {o.aula} · <span className="text-muted-foreground">{o.tema}</span></span></li>
                ))}
              </ol>
            </div>
          </div>
        </details>
      )}
    </div>
  )
}
