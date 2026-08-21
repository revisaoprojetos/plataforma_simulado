'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { ChevronRight, Package, Plus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SecaoHeader } from '@/components/admin/secao-header'
import { AlertBox } from '@/components/ui/alert-box'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { criarPacote, type PacoteLista } from './actions'

export function PacotesClient({ inicial }: { inicial: PacoteLista[] }) {
  const [itens, setItens] = useState(inicial)
  const [pendente, iniciar] = useTransition()
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')

  function criar() {
    iniciar(async () => {
      const r = await criarPacote(nome, descricao)
      if (!r.ok) return toast.error(r.error ?? 'Não foi possível criar.')
      toast.success('Pacote criado')
      setItens((xs) => [
        ...xs,
        { id: (r as any).id, nome, descricao: descricao || null, ativo: true, ordem: xs.length, cronogramas: 0, grupos: 0, estudantes: 0, alcance: 0 },
      ])
      setNome('')
      setDescricao('')
      setAberto(false)
    })
  }

  return (
    <>
      <AlertBox variante="info" titulo="Como o aluno recebe um cronograma">
        <p className="text-sm">
          O pacote reúne cronogramas e é liberado para <strong>grupos de alunos</strong> ou para alunos
          avulsos — o mesmo raciocínio do banco nos simulados. A diferença é que aqui vincular um grupo de
          3.000 alunos grava uma linha, não 3.000: o acesso é resolvido na hora da leitura.
        </p>
      </AlertBox>

      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader
          icon={Package}
          titulo="Pacotes"
          subtitulo={`${itens.length} pacote(s)`}
          acao={
            <Button size="sm" onClick={() => setAberto(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Novo pacote
            </Button>
          }
        />

        {itens.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">Nenhum pacote ainda</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Crie um pacote, coloque os cronogramas dentro e vincule os grupos de alunos que devem
              recebê-los.
            </p>
            <Button className="mt-4" onClick={() => setAberto(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Criar o primeiro
            </Button>
          </div>
        ) : (
          <div className="divide-y">
            {itens.map((p) => (
              <Link
                key={p.id}
                href={`/admin/cronogramas/pacotes/${p.id}`}
                className={`flex items-center gap-3 px-4 py-3 transition hover:bg-muted/40 ${p.ativo ? '' : 'opacity-60'}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{p.nome}</span>
                    {!p.ativo && <Badge variant="secondary">Inativo</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {p.cronogramas} cronograma(s) · {p.grupos} grupo(s)
                    {p.estudantes > 0 && ` · ${p.estudantes} aluno(s) avulso(s)`}
                    {p.descricao && ` · ${p.descricao}`}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 gap-1">
                  <Users className="h-3 w-3" />
                  {p.alcance.toLocaleString('pt-BR')} aluno(s)
                </Badge>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo pacote</DialogTitle>
            <DialogDescription>
              Um conjunto de cronogramas liberado junto. Ex.: “Pré-Edital AGU”, “Turma 2026”.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Pré-Edital AGU" />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Opcional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)} disabled={pendente}>
              Cancelar
            </Button>
            <Button onClick={criar} disabled={pendente || !nome.trim()}>
              {pendente ? 'Criando…' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
