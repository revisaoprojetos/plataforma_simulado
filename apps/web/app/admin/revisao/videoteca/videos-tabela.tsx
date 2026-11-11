'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ExternalLink, Settings2 } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { definirVisibilidadeConteudo } from '@/app/admin/biblioteca/gestao-actions'
import type { LinhaVideoteca } from '@/lib/admin-revisao/videoteca'
import { definirDuracaoVideoAction } from './actions'

const hm = (m: number) => { const h = Math.floor(m / 60), r = Math.round(m % 60); return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h` }
const ORIGEM = { link: 'Link na aula', biblioteca: 'Vídeo da Biblioteca', proprio: 'Vídeo próprio' } as const
const STATUS: Record<string, string> = { rascunho: 'Rascunho', enviando: 'Enviando', processando: 'Processando', pronta: 'Pronta', erro: 'Com erro' }

export function VideosTabela({ rows, podeEditar, controleVisivel }: { rows: LinhaVideoteca[]; podeEditar: boolean; controleVisivel: boolean }) {
  const router = useRouter()
  const [pendente, iniciar] = useTransition()
  const [visiveis, setVisiveis] = useState<Record<string, boolean>>({})

  function alternar(r: LinhaVideoteca, v: boolean) {
    if (!r.docId) return
    setVisiveis((s) => ({ ...s, [r.chave]: v }))
    iniciar(async () => {
      const res = await definirVisibilidadeConteudo(r.docId!, v)
      if (!res.ok) { setVisiveis((s) => ({ ...s, [r.chave]: !v })); toast.error(res.error || 'Não foi possível alterar.'); return }
      toast.success(v ? 'Videoaula visível ao aluno.' : 'Videoaula escondida do aluno.')
      router.refresh()
    })
  }

  function salvarDuracao(r: LinhaVideoteca, txt: string) {
    const n = txt.trim() === '' ? null : Number(txt)
    if ((n ?? 0) === (r.duracaoMin ?? 0)) return
    iniciar(async () => {
      const res = await definirDuracaoVideoAction(r.docId!, n)
      if (!res.ok) { toast.error(res.error || 'Não foi possível salvar a duração.'); return }
      toast.success('Duração salva.'); router.refresh()
    })
  }

  return (
    <section className="rounded-2xl border bg-card p-2 shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2.5 font-medium">Aula (PDFull)</th>
              <th className="px-3 py-2.5 font-medium">Título</th>
              <th className="px-3 py-2.5 font-medium text-right">Duração (min)</th>
              <th className="px-3 py-2.5 font-medium">Origem</th>
              <th className="px-3 py-2.5 font-medium">Visível ao aluno</th>
              <th className="px-3 py-2.5 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">Nenhuma videoaula encontrada. Use “Incluir videoaula” ou configure o vídeo na aula do PDFull.</td></tr>
            )}
            {rows.map((r) => {
              const v = visiveis[r.chave] ?? r.visivel
              return (
                <tr key={r.chave} className={cn('border-b last:border-0', v === false && 'opacity-60')}>
                  <td className="px-3 py-2.5">{r.aula ?? <span className="text-muted-foreground">sem aula ligada</span>}</td>
                  <td className="px-3 py-2.5"><b className="font-medium">{r.titulo}</b></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {r.docId && podeEditar
                      ? <input type="number" min={1} max={1440} defaultValue={r.duracaoMin ?? ''} placeholder="min" aria-label="Duração em minutos" onBlur={(e) => salvarDuracao(r, e.target.value)} className="h-8 w-20 rounded-lg border bg-background px-2 text-right text-sm" />
                      : r.duracaoMin != null ? hm(r.duracaoMin) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{ORIGEM[r.origem]}</span>
                    {r.status && <span className={cn('ml-1.5 rounded-full px-2 py-0.5 text-xs font-medium', r.status === 'pronta' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>{STATUS[r.status] ?? r.status}</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {v == null
                      ? <span className="text-xs text-muted-foreground">{r.origem === 'link' ? 'segue a aula' : 'sem controle'}</span>
                      : <Switch checked={v} disabled={!podeEditar || pendente || !controleVisivel} onCheckedChange={(x) => alternar(r, x)} aria-label="Visível ao aluno" />}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {r.link && <a href={r.link} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'ghost', size: 'sm' })}><ExternalLink />Abrir</a>}
                      {r.docId && <Link href={`/admin/biblioteca/conteudo/${r.docId}/gerenciar`} className={buttonVariants({ variant: 'outline', size: 'sm' })}><Settings2 />{r.origem === 'link' ? 'Trocar vídeo' : 'Gerenciar'}{r.versao ? ` · v${r.versao}` : ''}</Link>}
                      {r.origem === 'proprio' && <Link href="/admin/conteudos/videos" className={buttonVariants({ variant: 'outline', size: 'sm' })}><Settings2 />Gerenciar</Link>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
