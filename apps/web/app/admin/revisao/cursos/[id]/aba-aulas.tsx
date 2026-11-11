'use client'

import Link from 'next/link'
import { BookOpen, Folder, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { pedirTexto } from '@/components/ui/confirm-dialog'
import type { ModuloResumo } from '@/lib/revisao/cursos-defs'
import { salvarModuloAction } from '@/app/admin/conteudos/produtos/actions'
import { Nota, useAcao } from '../ui-cursos'

// Aulas e materiais: módulo → aula → o que a aula já tem (PDF, Vídeo, LegProc, Questões).
// Criar módulo/aula e escolher material REUSAM o currículo do Estúdio (salvarModuloAction / editor de conteúdos do produto).
export function AbaAulas({ cursoId, produtoId, modulos, total, page, perPage, podeEditar }: {
  cursoId: string; produtoId: string | null; modulos: ModuloResumo[]; total: number; page: number; perPage: number; podeEditar: boolean
}) {
  const [pendente, executar] = useAcao()
  if (!produtoId) return <Nota tipo="gold">Este curso ainda não tem produto principal. Crie um na etapa 2 do Passo a passo.</Nota>
  const lock = !podeEditar || pendente
  const editor = `/admin/conteudos/produtos/${produtoId}`

  async function criar(paiId: string | null) {
    const titulo = await pedirTexto({ titulo: paiId ? 'Nova aula' : 'Novo módulo', label: paiId ? 'Nome da aula' : 'Nome do módulo', placeholder: paiId ? 'Aula 1' : 'Módulo 1', confirmar: 'Criar' })
    if (!titulo?.trim()) return
    executar(async () => { const r = await salvarModuloAction(produtoId!, { titulo: titulo.trim(), pai_id: paiId }); return 'ok' in r && r.ok ? { ok: true as const } : { error: ('error' in r && r.error) || 'Falha ao criar.' } }, paiId ? 'Aula criada' : 'Módulo criado')
  }
  const paginas = Math.max(1, Math.ceil(total / perPage))
  const linkPg = (p: number) => `/admin/revisao/cursos/${cursoId}?aba=aulas${p > 1 ? `&mp=${p}` : ''}`

  return (
    <div className="flex flex-col gap-4">
      <Nota>Cada aula mostra o que já tem: <b>PDF</b>, <b>Vídeo</b>, <b>LegProc</b> e <b>Questões</b>. Verde = já subido. Os arquivos ficam na Biblioteca: use “Escolher da Biblioteca” na linha da aula.</Nota>
      <div className="flex flex-col gap-3">
        {modulos.map((m) => (
          <div key={m.id} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5 text-sm font-bold">
              <Folder className="size-4" />{m.titulo}
              <span className="flex-1" />
              <span className="text-xs font-normal text-muted-foreground">{m.aulas.length} aulas</span>
              <Button variant="outline" size="sm" disabled={lock} onClick={() => criar(m.id)}><Plus className="size-3.5" />Aula</Button>
            </div>
            {m.aulas.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 last:border-0">
                <span className="text-sm"><b>{a.titulo}</b>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {([['PDF', a.pdf], ['Vídeo', a.video], ['LegProc', a.legproc], ['Questões', a.questoes]] as const).map(([k, y]) => (
                      <span key={k} className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-semibold', y ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>{k}</span>
                    ))}
                  </span>
                </span>
                <Link href={editor} className={buttonVariants({ variant: 'outline', size: 'sm' })}><BookOpen className="size-3.5" />Escolher da Biblioteca</Link>
              </div>
            ))}
            {!m.aulas.length && <p className="px-4 py-3 text-sm text-muted-foreground">Nenhuma aula neste módulo ainda.</p>}
          </div>
        ))}
        {!modulos.length && <p className="text-sm text-muted-foreground">Nenhum módulo ainda. Crie o primeiro.</p>}
      </div>
      <div><Button variant="outline" size="lg" disabled={lock} onClick={() => criar(null)}><Plus className="size-4" />Criar módulo</Button></div>
      {paginas > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Paginação de módulos">
          <span className="text-muted-foreground">Página {page} de {paginas} · {total} módulos</span>
          <span className="flex gap-2">
            {page > 1 && <Link href={linkPg(page - 1)} className={buttonVariants({ variant: 'outline' })}>Anterior</Link>}
            {page < paginas && <Link href={linkPg(page + 1)} className={buttonVariants({ variant: 'outline' })}>Próxima</Link>}
          </span>
        </nav>
      )}
    </div>
  )
}
