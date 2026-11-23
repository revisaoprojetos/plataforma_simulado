// HARNESS DE DESENVOLVIMENTO (não vai para produção): renderiza o OneNoteApp sem sessão, para o E2E em navegador real
// (.claude/skills/run-plataforma-simulado/e2e/onenote.mjs), que intercepta /api/aluno/notebook/** com um backend falso em memória.
// Só responde em dev E com ENABLE_DEV_HARNESS=1; em produção (NODE_ENV=production) é sempre 404.
import { notFound } from 'next/navigation'
import '@/app/aluno/(portal)/nova/nova.css'
import { OneNoteApp } from '@/components/aluno/notebook/onenote/onenote-app'

export const dynamic = 'force-dynamic'

export default function DevHarnessOneNote() {
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_DEV_HARNESS !== '1') notFound()
  return (
    <div className="novaplat np-conteudo">
      <OneNoteApp voltarHref="/" estudanteId="00000000-0000-4000-8000-0000000000e2" marca={{ logo: null, nome: 'Plataforma de Teste' }} />
    </div>
  )
}
