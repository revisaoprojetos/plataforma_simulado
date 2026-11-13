import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { getTenantTheme } from '@/lib/tenant-theme'
import { allowlistEfetiva } from '@/lib/embed/origem-host'
import { EmbedOrigensProvider } from '@/components/embed/embed-origens-context'

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
      : "frame-ancestors 'self'" // meta é ignorada p/ frame-ancestors; a aplicação real é o header do proxy.ts

  // Allowlist (tenant + Curseduca conhecidas) serializada com segurança p/ o <script> inline.
  const allowJson = JSON.stringify(allowlistEfetiva(origens)).replace(/</g, '\\u003c')

  const headersList = await headers()
  // Next.js does not allow mutating response headers in layouts directly — the proxy
  // (apps/web/proxy.ts) already set a permissive default. The frameAncestors value is
  // injected via meta tag as a best-effort hint (real enforcement is proxy-level).
  // For production, set headers from the proxy using a lookup or edge config.
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
              (function() {
                // Origem do pai derivada (ancestorOrigins/referrer) e validada contra a allowlist; sem validação, só altura (sem dados) com '*'.
                var ALLOW = ${allowJson};
                function parentOrigin() {
                  try {
                    var a = window.location.ancestorOrigins;
                    if (a && a.length && a[0] && a[0] !== 'null') return a[0];
                  } catch(e) {}
                  try { if (document.referrer) return new URL(document.referrer).origin; } catch(e) {}
                  return null;
                }
                function permitido(o) {
                  if (!o) return false;
                  var u; try { u = new URL(o); } catch(e) { return false; }
                  for (var i = 0; i < ALLOW.length; i++) {
                    var p = ALLOW[i];
                    if (p === u.origin) return true;
                    var m = /^(https?:)\\/\\/\\*\\.([^:/]+)$/.exec(p);
                    if (m && u.protocol === m[1] && u.hostname.slice(-(m[2].length + 1)) === '.' + m[2]) return true;
                  }
                  return false;
                }
                function enviar(msg) {
                  try {
                    var o = parentOrigin();
                    parent.postMessage(msg, permitido(o) ? new URL(o).origin : '*');
                  } catch(e) {}
                }
                window.addEventListener('load', function() {
                  enviar({ type: 'embed-ready', height: document.body.scrollHeight });
                });
                // Auto-resize on body changes
                if (typeof ResizeObserver !== 'undefined') {
                  var ro = new ResizeObserver(function() {
                    enviar({ type: 'embed-resize', height: document.body.scrollHeight });
                  });
                  ro.observe(document.body);
                }
              })();
            `,
          }}
        />
      </head>
      <body style={{ margin: 0, background: 'white' }} className="antialiased">
        <EmbedOrigensProvider origens={origens}>{children}</EmbedOrigensProvider>
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
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('simulado_embed_config')
      .select('ativo, origens_permitidas, metodo_identificacao, otp_email')
      .eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000')
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
