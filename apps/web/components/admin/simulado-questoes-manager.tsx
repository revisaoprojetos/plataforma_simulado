'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { addQuestaoToSimulado, removeQuestaoFromSimulado } from '@/app/admin/simulados/actions'

interface QuestaoNoSimulado {
  id: string // id do vínculo simulado_questoes
  ordem: number
  peso: number
  anulada: boolean
  questao_id: string
  enunciado: string
  disciplina?: string
}

interface QuestaoDisponivel {
  id: string
  enunciado: string
  disciplina?: string
  status: string
}

interface Props {
  simuladoId: string
  questoesNoSimulado: QuestaoNoSimulado[]
  questoesDisponiveis: QuestaoDisponivel[]
}

function preview(t: string, n = 70) {
  return t.length > n ? t.slice(0, n) + '…' : t
}

export function SimuladoQuestoesManager({ simuladoId, questoesNoSimulado, questoesDisponiveis }: Props) {
  const [busca, setBusca] = useState('')
  const [adicionando, setAdicionando] = useState(false)
  const [pending, startTransition] = useTransition()
  const [actingId, setActingId] = useState<string | null>(null)

  const disponiveisFiltradas = questoesDisponiveis.filter((q) =>
    q.enunciado.toLowerCase().includes(busca.toLowerCase()),
  )

  function handleAdd(questaoId: string) {
    setActingId(questaoId)
    startTransition(async () => {
      const r = await addQuestaoToSimulado(simuladoId, questaoId)
      if (r?.error) toast.error(r.error)
      else toast.success('Questão adicionada')
      setActingId(null)
    })
  }

  function handleRemove(vinculoId: string) {
    setActingId(vinculoId)
    startTransition(async () => {
      const r = await removeQuestaoFromSimulado(vinculoId, simuladoId)
      if (r?.error) toast.error(r.error)
      else toast.success('Questão removida')
      setActingId(null)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {questoesNoSimulado.length} questão(ões) neste simulado
        </p>
        <Button size="sm" variant={adicionando ? 'secondary' : 'default'} onClick={() => setAdicionando((v) => !v)}>
          <Plus className="mr-2 h-4 w-4" />
          {adicionando ? 'Fechar' : 'Adicionar Questões'}
        </Button>
      </div>

      {/* Banco de questões disponíveis */}
      {adicionando && (
        <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
          <Input
            placeholder="Buscar questão por enunciado…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="max-w-md"
          />
          {disponiveisFiltradas.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhuma questão disponível. Cadastre questões no banco primeiro.
            </p>
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-md border bg-background">
              <Table>
                <TableBody>
                  {disponiveisFiltradas.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell className="text-sm">{preview(q.enunciado)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground w-[160px]">
                        {q.disciplina ?? '—'}
                      </TableCell>
                      <TableCell className="w-[120px]">
                        <Badge variant={q.status === 'publicada' ? 'default' : 'outline'} className="text-[10px]">
                          {q.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="w-[110px] text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending && actingId === q.id}
                          onClick={() => handleAdd(q.id)}
                        >
                          {pending && actingId === q.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <><Plus className="mr-1 h-3.5 w-3.5" /> Adicionar</>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* Questões já no simulado */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[60px]">Ordem</TableHead>
            <TableHead>Enunciado</TableHead>
            <TableHead>Disciplina</TableHead>
            <TableHead className="w-[70px]">Peso</TableHead>
            <TableHead className="w-[90px]">Status</TableHead>
            <TableHead className="w-[60px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {questoesNoSimulado.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                Nenhuma questão adicionada. Use &quot;Adicionar Questões&quot;.
              </TableCell>
            </TableRow>
          ) : (
            questoesNoSimulado.map((sq) => (
              <TableRow key={sq.id}>
                <TableCell className="text-center">{sq.ordem + 1}</TableCell>
                <TableCell className="text-sm">{preview(sq.enunciado)}</TableCell>
                <TableCell className="text-sm">{sq.disciplina ?? '—'}</TableCell>
                <TableCell>{sq.peso}</TableCell>
                <TableCell>
                  {sq.anulada ? (
                    <Badge variant="destructive">Anulada</Badge>
                  ) : (
                    <Badge variant="secondary">Ativa</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    disabled={pending && actingId === sq.id}
                    onClick={() => handleRemove(sq.id)}
                  >
                    {pending && actingId === sq.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
