import type { Metadata } from 'next'
import { Lock } from 'lucide-react'
import { AppLoading } from '@/components/admin/app-loading'
import { isSuperAdmin } from '@/lib/auth/permissions'
import { Suspense } from 'react'
import { BibliotecaClient } from './biblioteca-client'
import { listarArvore } from './actions'

export const metadata: Metadata = { title: 'Biblioteca de Conteúdos' }
export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  // ?tab=modelos = "Modelos de Caderno (OnlyOffice)" → área SUPER-ONLY (não dá p/ gatear por path, então aqui).
  // As server actions também recusam a categoria 'modelo_caderno' p/ não-super (ver actions.ts → guard).
  const tab = (await searchParams)?.tab
  if ((Array.isArray(tab) ? tab[0] : tab) === 'modelos' && !(await isSuperAdmin())) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400"><Lock className="h-7 w-7" /></span>
        <h2 className="text-lg font-semibold">Sem acesso a esta área</h2>
        <p className="max-w-md text-sm text-muted-foreground">Esta área é restrita ao super administrador.</p>
        <a href="/admin/biblioteca" className="mt-1 inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">Voltar à Biblioteca</a>
      </div>
    )
  }
  const categoria = tab === 'modelos' || (Array.isArray(tab) && tab[0] === 'modelos') ? 'modelo_caderno' : (Array.isArray(tab) ? tab[0] : tab) === 'jurisclub' ? 'jurisclub' : 'conteudo'
  return (
    <div className="w-full">
      {/* Raiz pré-carregada no servidor (sem cascata HTML→JS→action); o shell/loading aparece enquanto resolve. */}
      <Suspense fallback={<AppLoading />}>
        <BibliotecaComRaiz categoria={categoria} />
      </Suspense>
    </div>
  )
}

async function BibliotecaComRaiz({ categoria }: { categoria: 'conteudo' | 'modelo_caderno' | 'jurisclub' }) {
  // Falha/sem permissão → sem `initial`: o client cai no fetch normal (mesma mensagem de erro de antes).
  const r = await listarArvore(null, categoria).catch(() => null)
  return <BibliotecaClient initial={r && r.ok ? { categoria, dados: r } : undefined} />
}
