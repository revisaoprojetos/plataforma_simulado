import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConsentimentoForm } from '@/components/lgpd/consentimento-form'

const CURRENT_POLICY_VERSION = '1.0'

export default async function ConsentimentoPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Check if already consented — skip gracefully if table doesn't exist yet
  try {
    const { data: consentimento } = await supabase
      .from('simulado_lgpd_consentimentos')
      .select('id')
      .eq('user_id', user.id)
      .eq('versao_politica', CURRENT_POLICY_VERSION)
      .single()

    if (consentimento) redirect(params.redirectTo ?? '/admin')
  } catch {
    // Table doesn't exist yet, show the form anyway
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Política de Privacidade</CardTitle>
          <CardDescription>
            Antes de continuar, leia e aceite nossa política de privacidade.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground max-h-64 overflow-y-auto mb-6 space-y-3">
            <p>
              <strong>1. Coleta de dados:</strong> Coletamos seu nome, e-mail, CPF e telefone para
              fins de identificação e controle de acesso à plataforma.
            </p>
            <p>
              <strong>2. Uso dos dados:</strong> Seus dados são utilizados exclusivamente para
              gerenciar seu acesso, registrar participações em simulados e emitir relatórios de
              desempenho.
            </p>
            <p>
              <strong>3. Compartilhamento:</strong> Seus dados não são compartilhados com
              terceiros, exceto quando exigido por lei.
            </p>
            <p>
              <strong>4. Seus direitos (LGPD):</strong> Você tem direito a acessar, corrigir,
              portar e solicitar a exclusão dos seus dados a qualquer momento, mediante solicitação
              à plataforma.
            </p>
            <p>
              <strong>5. Retenção:</strong> Os dados são retidos enquanto houver vínculo ativo com
              a plataforma ou pelo prazo legal mínimo aplicável.
            </p>
            <p>
              <strong>6. Segurança:</strong> Adotamos medidas técnicas e organizacionais para
              proteger seus dados contra acesso não autorizado.
            </p>
            <p className="text-xs pt-2 border-t">Versão {CURRENT_POLICY_VERSION} — atualizado em 25/06/2026</p>
          </div>

          <ConsentimentoForm
            userId={user.id}
            versao={CURRENT_POLICY_VERSION}
            redirectTo={params.redirectTo ?? '/admin'}
          />
        </CardContent>
      </Card>
    </div>
  )
}
