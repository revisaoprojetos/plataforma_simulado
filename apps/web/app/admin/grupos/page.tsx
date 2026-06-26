import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

export default async function GruposPage() {
  const supabase = await createClient()

  const { data: grupos } = await supabase
    .from('simulado_grupos')
    .select('id, nome, criado_em')
    .order('criado_em', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Grupos</h1>
          <p className="text-muted-foreground">
            Gerencie grupos de estudantes para atribuição de simulados
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Novo Grupo
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Grupos cadastrados</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Membros</TableHead>
                <TableHead>Simulados</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!grupos || grupos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    Nenhum grupo cadastrado.
                  </TableCell>
                </TableRow>
              ) : (
                grupos.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">{g.nome}</TableCell>
                    <TableCell className="text-muted-foreground">—</TableCell>
                    <TableCell className="text-muted-foreground">—</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
