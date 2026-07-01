'use client'

import { ThemeProvider } from 'next-themes'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { ThemeCookieSync } from '@/components/theme-cookie-sync'

export function Providers({ children, defaultTheme = 'light' }: { children: React.ReactNode; defaultTheme?: 'light' | 'dark' }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme={defaultTheme}
        themes={['light', 'dark']}
        enableSystem={false}
        disableTransitionOnChange
      >
        <ThemeCookieSync />
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  )
}
