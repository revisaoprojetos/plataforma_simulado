import Link from 'next/link'
import { ChevronLeft, Radio } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AoVivoPainel } from '@/components/admin/simulado-ao-vivo'
import { SimuladoProgresso } from '@/components/admin/simulado-progresso'

export default async function AoVivoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()
  const { data: sim } = await supabase.from('simulado_simulados').select('titulo').eq('id', id).eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000').maybeSingle()

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/admin/simulados/${id}`} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Voltar para o simulado
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Radio className="h-5 w-5 text-emerald-500" /> Ao vivo — {sim?.titulo ?? 'Simulado'}
        </h1>
        <p className="text-sm text-muted-foreground">Acompanhe em tempo real quem está fazendo agora, quem finalizou e quem ainda não iniciou.</p>
      </div>

      <Tabs defaultValue="painel">
        <TabsList>
          <TabsTrigger value="painel">Painel ao vivo</TabsTrigger>
          <TabsTrigger value="estudantes">Progresso dos estudantes</TabsTrigger>
        </TabsList>

        <div className="pt-5">
          <TabsContent value="painel">
            <AoVivoPainel simuladoId={id} />
          </TabsContent>

          <TabsContent value="estudantes">
            <Card>
              <CardHeader>
                <CardTitle>Progresso individual</CardTitle>
                <CardDescription>Por estudante: situação ao vivo (fazendo agora / pausado / finalizou), última atividade, respondidas, acertos, erros, em branco e média — filtre por “Fazendo agora” para o controle em tempo real.</CardDescription>
              </CardHeader>
              <CardContent>
                <SimuladoProgresso simuladoId={id} />
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
