import { checkPermission } from '@/lib/auth/permissions'
import { getCurrentTenantId } from '@/lib/tenant'
import { createAdminClient } from '@/lib/supabase/server'
import { SemAcessoArea } from '@/app/admin/conteudos/_components/sem-acesso-area'
import { filtroValido } from '@/lib/conteudo/classificacao/matriz'
import { listarMatrizClassificacao } from '@/lib/conteudo/classificacao/matriz-server'
import { ClassificacaoMatrizClient } from './classificacao-matriz-client'

export const dynamic = 'force-dynamic'

const PP = [10, 25, 50, 100]

// MATRIZ ÚNICA DE CLASSIFICAÇÃO da Biblioteca (Fase 5). Backend-first: filtros/ordenação/paginação no banco
// (.range()/SQL + count) e herança calculada AQUI; o client só exibe e dispara a edição em lote (rota de API).
// URL: ?f=<filtro>&pasta=<id>&disc=<id>&q=&sort=&dir=&page=&pp=&indice=1
export default async function ClassificacaoBibliotecaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await checkPermission('configuracoes:view'))) return <SemAcessoArea />
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return <SemAcessoArea mensagem="Tenant não resolvido." />
  const sp = await searchParams
  const pp = PP.includes(Number(sp.pp)) ? Number(sp.pp) : 25
  const podeEditar = await checkPermission('configuracoes:update')

  const dados = await listarMatrizClassificacao(createAdminClient(), tenantId, {
    page: Math.max(1, Number(sp.page ?? 1) || 1), pp,
    sort: sp.sort, dir: sp.dir, q: (sp.q ?? '').trim(),
    filtro: filtroValido(sp.f), pastaId: sp.pasta || null, disciplinaId: sp.disc || null,
    indice: sp.indice === '1',
  })

  return <ClassificacaoMatrizClient dados={dados} podeEditar={podeEditar} pp={pp} />
}
