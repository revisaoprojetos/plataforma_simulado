import type { Metadata } from 'next'
import { BibliotecaClient } from './biblioteca-client'

export const metadata: Metadata = { title: 'Biblioteca de Conteúdos' }
export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <div className="w-full">
      <BibliotecaClient />
    </div>
  )
}
