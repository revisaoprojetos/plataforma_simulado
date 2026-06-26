import { headers } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { getTenantTheme } from '@/lib/tenant-theme'

export default async function EmbedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [embedConfig, themeResult] = await Promise.all([
    fetchEmbedConfig(),
    getTenantTheme(),
  ])

  if (!embedConfig.ativo) {
    return (
      <html lang="pt-BR">
        <body style={{ margin: 0, padding: '2rem', fontFamily: 'sans-serif', textAlign: 'center', color: '#666' }}>
          <p>Área de embed desativada.</p>
        </body>
      </html>
    )
  }

  // Build restrictive frame-ancestors from allowed origins
  const origens = embedConfig.origens_permitidas ?? []
  const frameAncestors =
    origens.length > 0
      ? `frame-ancestors 'self' ${origens.join(' ')}`
      : "frame-ancestors *"

  const headersList = await headers()
  // Next.js does not allow mutating response headers in layouts directly — the middleware
  // already set a permissive default. The frameAncestors value is injected via meta tag
  // as a best-effort hint (real enforcement is middleware-level).
  // For production, set headers from the middleware using a lookup or edge config.
  void headersList

  return (
    <html lang="pt-BR">
      <head>
        {themeResult.css && (
          <style dangerouslySetInnerHTML={{ __html: themeResult.css }} />
        )}
        <meta httpEquiv="Content-Security-Policy" content={frameAncestors} />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('load', function() {
                try {
                  parent.postMessage({ type: 'embed-ready', height: document.body.scrollHeight }, '*');
                } catch(e) {}
              });
              // Auto-resize on body changes
              if (typeof ResizeObserver !== 'undefined') {
                var ro = new ResizeObserver(function() {
                  try {
                    parent.postMessage({ type: 'embed-resize', height: document.body.scrollHeight }, '*');
                  } catch(e) {}
                });
                ro.observe(document.body);
              }
            `,
          }}
        />
      </head>
      <body style={{ margin: 0, background: 'white' }} className="antialiased">
        {children}
      </body>
    </html>
  )
}

async function fetchEmbedConfig(): Promise<{
  ativo: boolean
  origens_permitidas: string[]
  metodo_identificacao: string
  otp_email: boolean
}> {
  const defaults = {
    ativo: true,
    origens_permitidas: [] as string[],
    metodo_identificacao: 'email_cpf',
    otp_email: false,
  }

  try {
    const tenantId = await getCurrentTenantId()
    const supabase = await createServiceClient()
    const { data } = await supabase
      .from('simulado_embed_config')
      .select('ativo, origens_permitidas, metodo_identificacao, otp_email')
      .eq('tenant_id', tenantId ?? '')
      .limit(1)
      .single()

    if (!data) return defaults

    return {
      ativo: data.ativo ?? true,
      origens_permitidas: (data.origens_permitidas as string[]) ?? [],
      metodo_identificacao: (data.metodo_identificacao as string) ?? 'email_cpf',
      otp_email: data.otp_email ?? false,
    }
  } catch {
    return defaults
  }
}
