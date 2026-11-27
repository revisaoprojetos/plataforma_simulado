import { Suspense } from 'react'
import { VoltarCronogramas } from '@/components/admin/cronograma/voltar-cronogramas'
import { SemPermissao } from '@/components/ui/alert-box'
import { AbasLinha } from '@/components/ui/abas-linha'
import { checkPermission, getCurrentAccess } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { listarTiposMeta } from '@/lib/cronograma/carregar-tipos'
import { POR_PAGINA_MATRIZ, SITUACOES_MATRIZ, type SituacaoLinhaMatriz } from '@/lib/cronograma/matriz-gerador-tipos'
import { carregarMatriz, lerConjunto } from '@/lib/cronograma/matriz-gerador-server'
import { voltarSeguro } from '@/lib/admin/cronogramas-nav'
import { carregarConjunto } from '../actions'
import { listarDisciplinasFiltro } from '../../../banco-questoes/actions'
import { ConjuntoEditorClient } from './conjunto-editor-client'
import { MatrizAulasClient } from './matriz-aulas-client'

export const dynamic = 'force-dynamic'

type SP = { tipo?: string; aba?: string; voltar?: string; page?: string; pp?: string; q?: string; cls?: string; sit?: string; sort?: string; dir?: string }

// ÁREA INTERNA (o shell de Cronogramas não desenha as abas aqui — ver rotaInternaSemAbas): só "← Voltar" (exato, ?voltar=),
// o cabeçalho enxuto e as abas desta tela: Matriz de aulas (principal) | Avançado / legado (campos antigos preservados).
export default async function ConjuntoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params
  const sp = await searchParams
  const aba = sp.aba === 'legado' || sp.tipo === 'legproc' ? 'legado' : 'matriz'
  const acesso = await getCurrentAccess()
  const base = `/admin/cronogramas/conteudos/${id}`
  const voltar = voltarSeguro(sp.voltar)
  const qsVoltar = voltar ? `&voltar=${encodeURIComponent(voltar)}` : ''
  const abas = (
    <AbasLinha
      aria-label="Seções do conjunto" ativo={aba}
      itens={[
        { key: 'matriz', label: 'Matriz de aulas', href: `${base}?aba=matriz${qsVoltar}` },
        { key: 'legado', label: 'Avançado / legado', href: `${base}?aba=legado${qsVoltar}`, title: 'Campos antigos: tipo, aula, conteúdo, vídeo, PDF, links e questões' },
      ]}
    />
  )
  const topo = (
    <>
      <div><Suspense fallback={null}><VoltarCronogramas tela="conteudo" /></Suspense></div>
      {abas}
    </>
  )

  if (!(await checkPermission('cronogramas:view')) || !acesso.tenantId) {
    return <div className="animate-page space-y-6">{topo}<SemPermissao /></div>
  }

  if (aba === 'legado') {
    const [r, disciplinas, tipos] = await Promise.all([carregarConjunto(id), listarDisciplinasFiltro(), listarTiposMeta(acesso.tenantId)])
    return (
      <div className="animate-page space-y-6">
        {topo}
        {!r.ok || !r.dados ? <SemPermissao>{r.error ?? 'Conjunto não encontrado.'}</SemPermissao>
          : <ConjuntoEditorClient dados={r.dados} tipos={tipos} disciplinas={disciplinas} filtroInicial={sp.tipo === 'legproc' ? 'legproc' : undefined} />}
      </div>
    )
  }

  const svc = createAdminClient()
  const [conjunto, disciplinas, tipos, podeEditar] = await Promise.all([
    lerConjunto(svc, acesso.tenantId, id), listarDisciplinasFiltro(), listarTiposMeta(acesso.tenantId), checkPermission('cronogramas:update'),
  ])
  if (!conjunto) return <div className="animate-page space-y-6">{topo}<SemPermissao>Conjunto não encontrado.</SemPermissao></div>
  const pp = Number(sp.pp)
  const dados = await carregarMatriz(svc, acesso.tenantId, conjunto, {
    page: Math.max(1, Number(sp.page) || 1),
    pp: (POR_PAGINA_MATRIZ as readonly number[]).includes(pp) ? pp : 10,
    q: (sp.q ?? '').slice(0, 120), tipo: (sp.tipo ?? '').slice(0, 60), cls: (sp.cls ?? '').slice(0, 60),
    sit: (SITUACOES_MATRIZ as readonly string[]).includes(sp.sit ?? '') ? (sp.sit as SituacaoLinhaMatriz) : '',
    sort: sp.sort === 'situacao' ? 'situacao' : 'aula', dir: sp.dir === 'desc' ? 'desc' : 'asc',
  })
  return (
    <div className="animate-page space-y-6">
      {topo}
      <MatrizAulasClient dados={dados} tipos={tipos} disciplinas={disciplinas} podeEditar={podeEditar} />
    </div>
  )
}
