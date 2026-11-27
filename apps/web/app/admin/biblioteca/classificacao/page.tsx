import Link from 'next/link'
import { checkPermission } from '@/lib/auth/permissions'
import { getCurrentTenantId } from '@/lib/tenant'
import { createAdminClient } from '@/lib/supabase/server'
import { SemAcessoArea } from '@/app/admin/conteudos/_components/sem-acesso-area'
import { CabecalhoArea } from '@/components/admin/cabecalho-area'
import { AbasLinha } from '@/components/ui/abas-linha'
import { filtroValido } from '@/lib/conteudo/classificacao/matriz'
import { listarMatrizClassificacao } from '@/lib/conteudo/classificacao/matriz-server'
import { filtroTipoValido, ordemTipoValida } from '@/lib/conteudo/classificacao/gestao'
import { listarTiposGestao } from '@/lib/conteudo/classificacao/gestao-server'
import { ClassificacaoMatrizClient } from './classificacao-matriz-client'
import { ClassificacoesClient } from './classificacoes-client'
import { QuestoesEtiquetas } from '@/app/admin/revisao/biblioteca/questoes-etiquetas'
import { carregarInicialEtiquetas } from '@/lib/admin-revisao/questoes-etiquetas'
import { accessCan, getCurrentAccess } from '@/lib/auth/permissions'

export const dynamic = 'force-dynamic'

const PP = [10, 25, 50, 100]
const ABAS = [
  { key: 'classificacoes', label: 'Classificações' },
  { key: 'documentos', label: 'Documentos' },
  { key: 'etiquetas', label: 'Etiquetas' },
] as const
type Aba = (typeof ABAS)[number]['key']

// CLASSIFICAÇÃO (área central): o que são as classificações do tenant, o que cada uma faz em cada área, e a atribuição a documentos.
//   ?aba=classificacoes (padrão) | documentos | etiquetas
// Backend-first: filtros/ordenação/paginação (.range()+count), uso, cascata e tempo calculados AQUI; o client só exibe e chama as rotas de API.
// Documentos (URL): ?f=<filtro>&pasta=<id>&q=&sort=&dir=&page=&pp=&tec=1&indice=1
export default async function ClassificacaoBibliotecaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await checkPermission('configuracoes:view'))) return <SemAcessoArea />
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return <SemAcessoArea mensagem="Tenant não resolvido." />
  const sp = await searchParams
  const aba: Aba = ABAS.some((a) => a.key === sp.aba) ? (sp.aba as Aba) : 'classificacoes'
  const pp = PP.includes(Number(sp.pp)) ? Number(sp.pp) : 10
  const podeEditar = await checkPermission('configuracoes:update')
  const svc = createAdminClient()

  let corpo: React.ReactNode
  if (aba === 'classificacoes') {
    const dados = await listarTiposGestao(svc, tenantId, {
      q: (sp.q ?? '').trim(), filtro: filtroTipoValido(sp.f), sort: ordemTipoValida(sp.sort),
      dir: sp.sort ? (sp.dir === 'asc' ? 'asc' : 'desc') : 'asc', page: Math.max(1, Number(sp.page ?? 1) || 1), pp,
    })
    corpo = <ClassificacoesClient dados={dados} podeEditar={podeEditar} pp={pp} />
  } else if (aba === 'etiquetas') {
    // Etiquetas das questões (reuso exato da sub-aba antiga da Biblioteca › Questões): 1ª página no servidor; permissões = as da rota (questoes:view / questoes:update).
    const access = await getCurrentAccess()
    if (!accessCan(access, 'questoes:view')) corpo = <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Você não tem permissão para ver as etiquetas (questoes:view).</p>
    else {
      const inicial = await carregarInicialEtiquetas(tenantId)
      corpo = <QuestoesEtiquetas podeEditar={accessCan(access, 'questoes:update')} inicial={inicial} />
    }
  } else {
    const dados = await listarMatrizClassificacao(svc, tenantId, {
      page: Math.max(1, Number(sp.page ?? 1) || 1), pp,
      sort: sp.sort, dir: sp.dir, q: (sp.q ?? '').trim(),
      filtro: filtroValido(sp.f), pastaId: sp.pasta || null, disciplinaId: sp.disc || null,
      indice: sp.tec === '1' && sp.indice === '1',
    })
    corpo = (
      <>
        <ClassificacaoMatrizClient dados={dados} podeEditar={podeEditar} pp={pp} />
      </>
    )
  }

  return (
    <div className="w-full space-y-5">
      <CabecalhoArea
        titulo="Classificação"
        descricao="Defina o que é cada classificação de conteúdo, o que ela faz em cada área (Biblioteca, Cronogramas…) e quais documentos pertencem a ela."
        abas={<AbasLinha aria-label="Seções da classificação" ativo={aba} itens={ABAS.map((a) => ({ key: a.key, label: a.label, href: a.key === 'classificacoes' ? '?' : `?aba=${a.key}`, prefetch: false }))} />}
      />
      {corpo}
    </div>
  )
}
