import type { Metadata } from 'next'
import { getCurrentAccess, accessCan, isSuperAdmin } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { SemPermissao } from '@/components/ui/alert-box'
import type { RespostaBib } from '@/lib/admin-revisao/biblioteca-tipos'
import { listarBaralhosAba, listarSimuladosAba } from '@/lib/admin-revisao/biblioteca'
import { arvoreBiblioteca, estadoDeParams, listarGestao, opcoesFiltros, resumoEmCache } from '@/lib/admin-revisao/biblioteca-gestao'
import { ehSubAbaQ, estadoQDeParams, type SubAbaQ } from '@/lib/admin-revisao/biblioteca-questoes-tipos'
import { resumoComBanco, respostaQuestoes, totalBanco } from '@/lib/admin-revisao/biblioteca-questoes'
import { resumoClassificacao } from '@/lib/admin-revisao/biblioteca-questoes-gestao'
import { carregarInicialUnificar } from '@/lib/admin-revisao/questoes-unificar'
import { carregarInicialClassificacao } from '@/lib/admin-revisao/questoes-classificacao'
import { carregarInicialEtiquetas } from '@/lib/admin-revisao/questoes-etiquetas'
import { carregarInicialUnificarDisciplinas } from '@/lib/admin-revisao/biblioteca-pastas-unificar'
import { BibliotecaApp } from './biblioteca-app'

export const metadata: Metadata = { title: 'Biblioteca' }
export const dynamic = 'force-dynamic'

type SP = Record<string, string | string[] | undefined>

// BIBLIOTECA (Plataforma Revisão · Pedagógico) — fonte única dos materiais: o Cronograma Adaptativo e a Montagem de curso usam o que
// está aqui. A página só entrega o 1º quadro (lista + árvore de pastas + resumo, no servidor); depois tudo é client-driven pela rota
// /api/admin/revisao/biblioteca (aba, pasta, busca, filtros, ordem e página sem navegação completa).
export default async function BibliotecaRevisaoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const access = await getCurrentAccess()
  if (!accessCan(access, 'configuracoes:view') || !access.tenantId) return <SemPermissao />
  const tenantId = access.tenantId
  const sp = await searchParams
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) { const x = Array.isArray(v) ? v[0] : v; if (x) usp.set(k, x) }
  // compat. com links antigos (?p= página, ?pp=)
  if (!usp.get('page') && usp.get('p')) usp.set('page', usp.get('p')!)
  const e = estadoDeParams(usp)
  const svc = createAdminClient()
  // Aba Questões: sub-abas Banco (padrão) · Unificar · Classificação · Etiquetas (?modo=). Só o Banco traz o 1º quadro no servidor; as demais carregam por rota de API.
  const verQ = accessCan(access, 'questoes:view')
  const subQ: SubAbaQ = e.aba === 'questoes' && ehSubAbaQ(usp.get('modo')) ? (usp.get('modo') as SubAbaQ) : 'banco'
  const bancoAtivo = e.aba === 'questoes' && subQ === 'banco'
  const eq = estadoQDeParams(usp)
  const ehDoc = !['flashcards', 'simulados', 'questoes'].includes(e.aba)
  const q = { q: e.q, pagina: e.page, porPagina: e.pp }
  // SSR por sub-área: SÓ o loader da sub-área ativa entra no Promise.all (nunca todos) — o componente nasce com dados, sem cascata HTML → JS → API.
  const ehQ = e.aba === 'questoes' && verQ
  const unificarDisc = ehDoc && usp.get('modo') === 'unificar-disciplinas'
  const [resumoDocs, lista, baralhos, simulados, arvore, opcoes, inicialQ, totalQ, contagensQ, ssrUnificar, ssrEtiquetas, ssrClassif, ssrDisc] = await Promise.all([
    resumoEmCache(svc, tenantId),
    ehDoc ? listarGestao(svc, tenantId, e) : null,
    e.aba === 'flashcards' ? listarBaralhosAba(svc, tenantId, q) : null,
    e.aba === 'simulados' ? listarSimuladosAba(svc, tenantId, q) : null,
    ehDoc ? arvoreBiblioteca(svc, tenantId, e.aba) : null,
    ehDoc ? opcoesFiltros(svc, tenantId, e.aba) : null,
    bancoAtivo && verQ ? respostaQuestoes(svc, tenantId, eq, true) : null,
    verQ ? totalBanco(svc, tenantId) : null,
    bancoAtivo && verQ ? resumoClassificacao(svc, tenantId).catch(() => null) : null,
    ehQ && subQ === 'unificar' ? carregarInicialUnificar(tenantId) : null,
    ehQ && subQ === 'etiquetas' ? carregarInicialEtiquetas(tenantId) : null,
    ehQ && subQ === 'classificacao' ? carregarInicialClassificacao(tenantId).catch(() => null) : null,
    unificarDisc && verQ ? carregarInicialUnificarDisciplinas(tenantId, e.aba === 'jurisclub' ? 'jurisclub' : 'conteudo') : null,
  ])
  const resumo = totalQ !== null ? resumoComBanco(resumoDocs, totalQ) : resumoDocs
  const inicial: RespostaBib = {
    aba: e.aba, page: e.page, pp: e.pp, total: lista?.total ?? baralhos?.total ?? simulados?.total ?? 0,
    rows: lista?.rows ?? [], baralhos: baralhos?.rows ?? null, simulados: simulados?.rows ?? null, resumo, aviso: baralhos?.aviso, degradado: lista?.degradado,
  }
  return (
    <div className="animate-page">
      <BibliotecaApp inicial={inicial} estadoInicial={e} arvoreInicial={arvore} opcoesInicial={opcoes ?? {}}
        podeEditar={accessCan(access, 'configuracoes:update')} podeCriarSimulado={accessCan(access, 'simulados:create')}
        subQInicial={subQ} inicialQ={inicialQ} estadoQInicial={eq} unificarInicial={unificarDisc} contagensInicialQ={contagensQ}
        ssr={{ classificacao: ssrClassif, unificar: ssrUnificar ? { duplicadas: ssrUnificar } : null, etiquetas: ssrEtiquetas, disciplinas: ssrDisc }}
        qPerm={{ ver: verQ, editar: accessCan(access, 'questoes:update'), excluir: accessCan(access, 'questoes:delete'), criar: accessCan(access, 'questoes:create'), importarPlataforma: await isSuperAdmin(), taxonomia: accessCan(access, 'classificacao:manage') }} />
    </div>
  )
}
