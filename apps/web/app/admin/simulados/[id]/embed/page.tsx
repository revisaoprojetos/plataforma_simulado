import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Code, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmbedConfigForm } from '@/components/admin/embed-config-form'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function SimuladoEmbedPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createServiceClient()

  const { data: simulado } = await supabase
    .from('simulados')
    .select('id, titulo, status, embed_token, embed_ativo, metodo_identificacao')
    .eq('id', id)
    .single()

  if (!simulado) {
    notFound()
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://seu-dominio.com'
  const embedToken = simulado.embed_token as string | null
  const embedAtivo = simulado.embed_ativo as boolean ?? false

  const embedUrl = embedToken
    ? `${baseUrl}/embed/simulado/${embedToken}`
    : null

  const iframeSnippet = embedUrl
    ? `<iframe\n  src="${embedUrl}"\n  width="100%"\n  height="700"\n  frameborder="0"\n  allow="fullscreen"\n></iframe>`
    : null

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/simulados/${id}`}
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar para o Simulado
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Configuração de Embed</h1>
          {embedAtivo ? (
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
              Embed Ativo
            </Badge>
          ) : (
            <Badge variant="secondary">Embed Inativo</Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{simulado.titulo}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <EmbedConfigForm
          simuladoId={id}
          embedAtivo={embedAtivo}
          embedToken={embedToken}
          metodoIdentificacao={(simulado.metodo_identificacao as string) ?? 'email_cpf'}
        />

        <div className="space-y-4">
          {embedUrl ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Link de Embed</CardTitle>
                  <CardDescription>URL direta para o simulado embedado.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-muted px-3 py-2 text-xs break-all">
                      {embedUrl}
                    </code>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      render={<Link href={embedUrl} target="_blank" />}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Code className="h-4 w-4" />
                    Snippet para Embed
                  </CardTitle>
                  <CardDescription>
                    Cole este código HTML na página onde deseja exibir o simulado.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <pre className="rounded bg-muted p-3 text-xs overflow-x-auto whitespace-pre-wrap break-all">
                    {iframeSnippet}
                  </pre>
                  <p className="mt-3 text-xs text-muted-foreground">
                    O domínio da página hospedeira deve estar na lista de origens permitidas
                    da configuração de embed do tenant.
                  </p>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="pt-6 text-center text-sm text-muted-foreground space-y-2">
                <p>Ative o embed para gerar o link e o snippet.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
