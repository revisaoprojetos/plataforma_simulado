'use client'

import Link from 'next/link'
import { Plus, Users } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import type { GrupoOpcao } from '@/lib/revisao/cursos'
import { alternarGrupoCursoAction } from '../actions'
import { Chip, useAcao } from '../ui-cursos'

// "Quem acessa": grupos que liberam o curso (marcar = liberar todos os produtos do curso para o grupo).
export function AbaAcesso({ cursoId, grupos, marcados, alunos, podeEditar }: {
  cursoId: string; grupos: GrupoOpcao[]; marcados: string[]; alunos: number; podeEditar: boolean
}) {
  const [pendente, executar] = useAcao()
  return (
    <section className="rounded-2xl border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary"><Users className="size-4" /></span>
          <div><h2 className="text-sm font-semibold">Grupos que liberam este curso</h2><p className="text-xs text-muted-foreground">Quem está num destes grupos vê o curso. Marque ou desmarque.</p></div>
        </div>
        <Link href="/admin/grupos" className={buttonVariants({ variant: 'outline', size: 'sm' })}><Plus className="size-3.5" />Criar grupo</Link>
      </div>
      <div className="p-4">
        <div className="flex flex-wrap gap-2">
          {grupos.map((g) => {
            const on = marcados.includes(g.id)
            return <Chip key={g.id} on={on} disabled={!podeEditar || pendente} onClick={() => executar(() => alternarGrupoCursoAction(cursoId, g.id, !on))}>{g.nome}</Chip>
          })}
          {!grupos.length && <span className="text-sm text-muted-foreground">Nenhum grupo cadastrado ainda.</span>}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{alunos.toLocaleString('pt-BR')} alunos têm acesso hoje.</p>
      </div>
    </section>
  )
}
