import Link from 'next/link'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { RevisaoHead } from '@/components/admin/revisao/ui'
import { SemAcessoArea } from '@/app/admin/conteudos/_components/sem-acesso-area'
import { getCurrentTenant } from '@/lib/tenant'
import { coresDoTenant } from '@/lib/revisao/cursos'
import { NovoCursoClient } from './novo-curso-client'

export const dynamic = 'force-dynamic'

// Montagem de curso › Cursos › CRIAR CURSO (#novocurso): escolha do modelo. Dá para trocar depois.
export default async function NovoCursoPage() {
  const access = await getCurrentAccess()
  if (!(accessCan(access, 'produtos:manage') || accessCan(access, 'produtos:update'))) return <SemAcessoArea />
  const tenant = await getCurrentTenant()
  const cores = coresDoTenant(tenant?.tema)
  return (
    <div className="w-full">
      <Link href="/admin/revisao/cursos" className="mb-3 inline-block text-sm font-bold text-primary underline-offset-4 hover:underline">← Todos os cursos</Link>
      <RevisaoHead
        secao="Criar curso"
        titulo="Como este curso vai ser montado para o aluno?"
        subtitulo="Escolha o modelo. Dá para trocar depois, sem perder aulas nem o progresso dos alunos. O Extensivo tem modelo próprio e não entra aqui."
      />
      <NovoCursoClient c1={cores.c1 ?? '#2E2150'} c2={cores.c2 ?? '#E5B230'} dados={{ tenantNome: tenant?.nome ?? '', modulos: [], aulas: [], materiais: [], eventos: [], nomeAdmin: '' }} />
    </div>
  )
}
