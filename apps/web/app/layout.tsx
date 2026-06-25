import type { Metadata } from 'next'
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
  const { css: tenantCss, tenantNome, favicon } = await getTenantTheme()

  const themeCSS = tenantCss || DEFAULT_THEME_CSS

  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${plusJakarta.variable}`}
      suppressHydrationWarning
    >
      <head>
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
        <Providers>
          {children}
          <Toaster position="bottom-right" richColors />
        </Providers>
      </body>
    </html>
  )
}
