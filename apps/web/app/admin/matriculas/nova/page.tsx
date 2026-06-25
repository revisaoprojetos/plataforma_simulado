import { createServiceClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NovaMatriculaForm } from '@/components/admin/nova-matricula-form'

export default async function NovaMatriculaPage() {
  const supabase = await createServiceClient()

  const [{ data: estudantes }, { data: simulados }] = await Promise.all([
    supabase.from('estudantes').select('id, nome, email').order('nome').limit(500),
    supabase.from('simulados').select('id, titulo').order('titulo').limit(200),
  ])

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nova Matrícula</h1>
        <p className="text-muted-foreground">
          Vincule um estudante a um simulado específico.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados da Matrícula</CardTitle>
        </CardHeader>
        <CardContent>
          <NovaMatriculaForm
            estudantes={estudantes ?? []}
            simulados={simulados ?? []}
          />
        </CardContent>
      </Card>
    </div>
  )
}
