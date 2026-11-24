import Link from 'next/link'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { BookOpen } from 'lucide-react'
import { checkPermission, getCurrentAccess } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { RevisaoHead } from '@/components/admin/revisao/ui'
import { EYEBROW_CRONOGRAMAS, grupoDaRota, hrefDaVista, hrefNoShell, normalizarShell, type ModalidadeId } from '@/lib/admin/cronogramas-nav'
import type { QS } from '../_comp/lista'
import { SalvarVersaoBotao } from './acoes-client'
import { SUBS_ADAPTATIVO, type SubAdaptativo } from './adaptativo/comum'
import AdaptativoCobertura from './adaptativo/cobertura'
import AdaptativoDisciplinas from './adaptativo/disciplinas'
import AdaptativoRegras from './adaptativo/regras'
import AdaptativoSprints from './adaptativo/sprints'
import AdaptativoVersoes from './adaptativo/versoes'
import AdaptativoParametros from './adaptativo/parametros'
import GeradorVisao from './gerador/visao'
import GeradorCatalogo from './gerador/catalogo'
import GeradorMetas from './gerador/metas'
import GeradorConteudos from './gerador/conteudos'
import GeradorAcessos from './gerador/acessos'
import GeradorImportacao from './gerador/importacao'
import GeradorRelatorios from './gerador/relatorios'
import GeradorLiberacao from './gerador/liberacao'
import GeradorLiberacaoAulas from './liberacao-aulas'

export const dynamic = 'force-dynamic'

// Cronograma — admin "Plataforma Revisão". Só LÊ dados prontos (lib/revisao/cronograma).
// Navegação ÚNICA = <CronogramasNav/> (lib/admin/cronogramas-nav.ts), posicionada pelo cabeçalho DEPOIS do título:
// `?aba=<gerador|adaptativo>&sub=<aba>&v=<vista>` (sem aba = Gerador; links antigos ?sub=conteudos|mat|ver… redirecionam). Este arquivo NÃO tem abas próprias.
// Busca/filtro/ordenação/paginação (`q`, `ord`, `dir`, `pag`, `pps`) por query string, resolvidos no servidor.
// Cada sub-aba é um server component próprio (gerador/*, adaptativo/*) e só paga as consultas de que precisa.

const BASE = '/admin/revisao/cronograma'

const DESC_GERADOR = 'O cronograma padrão da plataforma: catálogo, metas, conteúdos, acessos, importação, relatórios e liberação. O aluno gera o próprio cronograma a partir do catálogo.'
const DESC_ADAPTATIVO = 'O cronograma monta as metas de cada aluno a partir dos materiais e das regras cadastrados aqui. As regras começam com os valores do Cronograma Adaptativo 2.0.'

// Vista (id da nav) → sub-aba do Adaptativo implementada neste shell.
const SUB_ADAPTATIVO_DA_VISTA: Record<string, SubAdaptativo> = {
  cobertura: 'mat', disciplinas: 'disc', regras: 'regras', faixas: 'faixas', especial: 'especial', sprint: 'sprint', versoes: 'ver',
}
const VISTAS_AUDITORIA = ['aula', 'duracao', 'buscar']

export default async function CronogramaRevisaoPage({ searchParams }: { searchParams: Promise<QS> }) {
  const sp = await searchParams
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) if (v) q.set(k, v)

  // Links antigos (?aba=mat|disc|regras|sprint|ver) e Faixas/semana especial/prévia que eram do Gerador na 1ª versão.
  let reescrito = false
  if (SUBS_ADAPTATIVO.includes(sp.aba as SubAdaptativo)) { q.set('sub', sp.aba as string); q.set('aba', 'adaptativo'); reescrito = true }
  if (q.get('aba') === 'gerador' && ['faixas', 'especial', 'previa'].includes(q.get('sub') ?? '')) {
    q.set('sub', q.get('sub') === 'previa' ? 'regras' : (q.get('sub') as string)); q.set('aba', 'adaptativo'); reescrito = true
  }
  const aba: ModalidadeId = q.get('aba') === 'adaptativo' ? 'adaptativo' : 'gerador'

  // ?sub=conteudos|mat|ver… (formato antigo) → ?sub=<aba>&v=<vista>, preservando o resto da query.
  const n = normalizarShell(aba, q.get('sub'), q)
  if (reescrito || n.legado) {
    const novo = new URLSearchParams({ aba })
    if (n.sub) novo.set('sub', n.sub)
    if (n.v) novo.set('v', n.v)
    for (const [k, v] of q) if (!['aba', 'sub', 'v'].includes(k) && !(k === 'painel' && aba === 'gerador')) novo.set(k, v)
    redirect(`${BASE}?${novo.toString()}`)
  }

  // Onde estamos (aba + vista). Vista que ainda mora numa rota legada: o alias do shell redireciona para ela.
  const rota = grupoDaRota(BASE, q)!
  const vista = rota.subaba
  if (!hrefNoShell(vista) && !vista.noShell) redirect(hrefDaVista(vista, q))
  const titulo = vista.label

  const [pode, podeEditar, access] = await Promise.all([checkPermission('cronogramas:view'), checkPermission('cronogramas:update'), getCurrentAccess()])
  if (!pode || !access.tenantId) {
    return <div className="w-full space-y-4"><RevisaoHead secao={EYEBROW_CRONOGRAMAS} titulo="Cronogramas" /><SemPermissao>Você não tem permissão para acessar o cronograma.</SemPermissao></div>
  }
  const tenantId = access.tenantId

  // Gerador (cronograma padrão): cada vista é um server component próprio e SÓ a ativa roda (sem tocar nas outras).
  if (aba === 'gerador') {
    const basePath = `${BASE}?aba=gerador&sub=${rota.grupo.id}${vista.shell.v ? `&v=${vista.shell.v}` : ''}`
    // O `v=` seleciona o painel/vista interna dos componentes (que leem ?painel= e ?vista=).
    const spG: Record<string, string | undefined> = { ...(sp as Record<string, string | undefined>) }
    if (vista.id === 'conjuntos') delete spG.painel
    if (vista.id === 'links') spG.painel = 'links'
    if (vista.id === 'tipos') delete spG.vista
    if (vista.id === 'auditoria-metas' && !VISTAS_AUDITORIA.includes(spG.vista ?? '')) spG.vista = 'aula'
    const props = { sp: spG, tenantId, basePath }
    return (
      <div className="w-full">
        <RevisaoHead secao={EYEBROW_CRONOGRAMAS} titulo={titulo} subtitulo={vista.id === 'visao' ? DESC_GERADOR : undefined} />
        {vista.id === 'visao' && <GeradorVisao {...props} />}
        {vista.id === 'catalogo' && <GeradorCatalogo {...props} />}
        {(vista.id === 'conjuntos' || vista.id === 'links') && <GeradorConteudos {...props} />}
        {(vista.id === 'tipos' || vista.id === 'auditoria-metas') && <GeradorMetas {...props} />}
        {vista.id === 'acessos' && <GeradorAcessos {...props} />}
        {vista.id === 'importacao' && <GeradorImportacao {...props} />}
        {vista.id === 'relatorios' && <GeradorRelatorios {...props} />}
        {vista.id === 'liberacao' && <GeradorLiberacao {...props} />}
        {vista.id === 'liberacao-aulas' && <GeradorLiberacaoAulas {...props} />}
      </div>
    )
  }

  const subAd = SUB_ADAPTATIVO_DA_VISTA[vista.id] ?? 'mat'
  const prop = { sp, tenantId, podeEditar }
  return (
    <div className="w-full">
      <RevisaoHead
        secao={EYEBROW_CRONOGRAMAS}
        titulo={titulo}
        subtitulo={DESC_ADAPTATIVO}
        acoes={<>
          <Link href="/admin/biblioteca" className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm font-medium hover:bg-accent"><BookOpen className="h-4 w-4" />Abrir a Biblioteca</Link>
          <SalvarVersaoBotao podeEditar={podeEditar} />
        </>}
      />
      {subAd === 'mat' && <AdaptativoCobertura {...prop} />}
      {subAd === 'disc' && <AdaptativoDisciplinas {...prop} />}
      {subAd === 'regras' && <AdaptativoRegras {...prop} />}
      {subAd === 'sprint' && <AdaptativoSprints {...prop} />}
      {subAd === 'ver' && <AdaptativoVersoes {...prop} />}
      {(subAd === 'faixas' || subAd === 'especial') && <AdaptativoParametros grupo={subAd} sp={sp} tenantId={tenantId} />}
    </div>
  )
}
