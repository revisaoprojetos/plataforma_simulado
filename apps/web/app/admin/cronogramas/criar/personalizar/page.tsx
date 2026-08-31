'use client'

import { useEffect, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCriar, useGuardStep } from '../criar-context'
import { Etapa } from '../etapa'
import { dadosPersonalizar } from '../dados'

export default function PersonalizarPage() {
  useGuardStep(0)
  const { draft, patch } = useCriar()
  const [categorias, setCategorias] = useState<{ id: string; nome: string }[]>([])

  useEffect(() => {
    dadosPersonalizar().then((r) => {
      if (r.ok) setCategorias(r.categorias ?? [])
    })
  }, [])

  return (
    <Etapa titulo="Personalizar" descricao="Como o cronograma aparece no catálogo.">
      <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="space-y-1.5">
          <Label>Nome</Label>
          <Input
            value={draft.nome}
            onChange={(e) => patch({ nome: e.target.value })}
            placeholder="9 Matérias Essenciais (4 horas)"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">Mínimo 3 letras. É o título que o aluno vê no catálogo.</p>
        </div>

        <div className="space-y-1.5">
          <Label>
            Subtítulo <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <Input
            value={draft.subtitulo}
            onChange={(e) => patch({ subtitulo: e.target.value })}
            placeholder="Ex.: pós-edital, foco em questões"
          />
        </div>

        <div className="space-y-1.5">
          <Label>
            Categoria <span className="text-xs font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <Select
            value={draft.categoriaId ?? 'nenhuma'}
            onValueChange={(v) => patch({ categoriaId: v === 'nenhuma' ? null : (v ?? null) })}
          >
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
          <p className="text-xs text-muted-foreground">Agrupa o cronograma no catálogo (Regulares, Específicos…).</p>
        </div>
      </div>
    </Etapa>
  )
}
