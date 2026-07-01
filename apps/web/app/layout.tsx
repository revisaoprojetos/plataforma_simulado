import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { Inter, Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'
import { Toaster } from 'sonner'
import { getTenantTheme } from '@/lib/tenant-theme'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
})

export const metadata: Metadata = {
  title: 'Plataforma de Simulados',
  description: 'Plataforma de questões e simulados para concurso',
}

// Default CSS variables used when no tenant theme is configured
const DEFAULT_THEME_CSS = `
:root {
  --brand-primary: oklch(0.5 0.2 300);
  --brand-secondary: oklch(0.8 0.15 90);
  --font-sans: var(--font-plus-jakarta), var(--font-inter), sans-serif;
}
`.trim()

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Fetch tenant theme server-side; falls back to defaults on any error
  const { css: tenantCss, tenantNome, favicon, modoPadrao } = await getTenantTheme()

  const themeCSS = tenantCss || DEFAULT_THEME_CSS

  // Tema resolvido no servidor (cookie do next-themes; senão, padrão do tenant).
  // `color-scheme` faz o "vazio" do navegador durante o load já ser escuro — sem flash branco.
  const cookieTheme = (await cookies()).get('theme')?.value
  const dark = cookieTheme === 'dark' || (cookieTheme == null && modoPadrao === 'dark')

  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${plusJakarta.variable}`}
      style={{ colorScheme: dark ? 'dark' : 'light', background: dark ? '#0b0b0f' : undefined }}
      suppressHydrationWarning
    >
      <head>
        {/* Espelha o tema (next-themes/localStorage) num cookie ANTES de qualquer navegação,
            para os Server Components (login/simulado) já renderizarem no tema certo — sem flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.cookie='theme='+t+';path=/;max-age=31536000;samesite=lax'}catch(e){}`,
          }}
        />
        {/* Dynamic white-label theme — overrides shadcn CSS variable defaults */}
        <style dangerouslySetInnerHTML={{ __html: themeCSS }} />
        {/* Favicon: use tenant's if available, otherwise fall back to default */}
        {favicon && <link rel="icon" href={favicon} />}
        {/* Page title reflects tenant name when available */}
        {tenantNome && (
          <title>{tenantNome}</title>
        )}
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers defaultTheme={modoPadrao}>
          {children}
          <Toaster position="bottom-right" richColors />
        </Providers>
      </body>
    </html>
  )
}
