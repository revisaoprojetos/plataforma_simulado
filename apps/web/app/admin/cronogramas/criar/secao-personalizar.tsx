'use client'

import { useEffect, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCriar } from './criar-context'
import { Secao } from './secao'
import { dadosPersonalizar } from './dados'

export function SecaoPersonalizar() {
  const { draft, patch } = useCriar()
  const [categorias, setCategorias] = useState<{ id: string; nome: string }[]>([])

  useEffect(() => {
    dadosPersonalizar().then((r) => {
      if (r.ok) setCategorias(r.categorias ?? [])
    })
  }, [])

  return (
    <Secao numero={1} titulo="Personalizar" descricao="Como o cronograma aparece no catálogo.">
      <div className="grid gap-3 rounded-2xl border bg-card p-4 shadow-sm sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Nome</Label>
          <Input value={draft.nome} onChange={(e) => patch({ nome: e.target.value })} placeholder="9 Matérias Essenciais (4 horas)" autoFocus />
          <p className="text-xs text-muted-foreground">Mínimo 3 letras — é o título que o aluno vê.</p>
        </div>
        <div className="space-y-1.5">
          <Label>
            Subtítulo <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <Input value={draft.subtitulo} onChange={(e) => patch({ subtitulo: e.target.value })} placeholder="Ex.: pós-edital, foco em questões" />
        </div>
        <div className="space-y-1.5">
          <Label>
            Categoria <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <Select value={draft.categoriaId ?? 'nenhuma'} onValueChange={(v) => patch({ categoriaId: v === 'nenhuma' ? null : (v ?? null) })}>
            <SelectTrigger>
              <SelectValue>
                {draft.categoriaId ? (categorias.find((c) => c.id === draft.categoriaId)?.nome ?? 'Categoria') : 'Sem categoria'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nenhuma">Sem categoria</SelectItem>
              {categorias.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </Secao>
  )
}
