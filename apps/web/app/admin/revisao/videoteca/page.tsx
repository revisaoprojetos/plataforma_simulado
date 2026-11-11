import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { createAdminClient } from '@/lib/supabase/server'
import { SemPermissao } from '@/components/ui/alert-box'
import { buttonVariants } from '@/components/ui/button'
import { RevisaoHead } from '@/components/admin/revisao/ui'
import { BuscaGet, KpiGrade, Nota, Paginacao, lerPaginacao } from '@/components/admin/revisao/pedagogico-ui'
import { listarVideoteca, resumoVideoteca } from '@/lib/admin-revisao/videoteca'
import { AVISO_OCULTO } from '@/lib/admin-revisao/biblioteca'
import { cn } from '@/lib/utils'
import { VideosTabela } from './videos-tabela'

export const metadata: Metadata = { title: 'Videoteca' }
export const dynamic = 'force-dynamic'

const BASE = '/admin/revisao/videoteca'
type SP = Record<string, string | string[] | undefined>
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const hm = (m: number) => { const h = Math.floor(m / 60), r = Math.round(m % 60); return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h` }

// VIDEOTECA (Plataforma Revisão · Pedagógico): todas as videoaulas, ligadas à aula do PDFull. Só LÊ dados prontos.
export default async function VideotecaRevisaoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const access = await getCurrentAccess()
  if (!accessCan(access, 'configuracoes:view') || !access.tenantId) return <SemPermissao />
  const podeEditar = accessCan(access, 'configuracoes:update')
  const sp = await searchParams
  const q = (um(sp.q) ?? '').trim().slice(0, 80)
  const vis = um(sp.vis) === 'escondidos' ? 'escondidos' : 'todos'
  const { pagina, porPagina } = lerPaginacao(sp)
  const svc = createAdminClient()
  const [resumo, lista] = await Promise.all([
    resumoVideoteca(svc, access.tenantId),
    listarVideoteca(svc, access.tenantId, { q, pagina, porPagina, soEscondidos: vis === 'escondidos' }),
  ])
  const pars = { q: q || undefined, vis: vis === 'escondidos' ? 'escondidos' : undefined }

  return (
    <div className="w-full">
      <RevisaoHead
        secao="Pedagógico"
        titulo="Videoteca"
        subtitulo="Todas as videoaulas, ligadas à aula do PDFull. O tempo delas não entra nas horas do cronograma. Ao trocar um vídeo, o progresso e as anotações com minutagem dos alunos continuam."
        acoes={podeEditar ? <Link href="/admin/conteudos/videos" className={buttonVariants()}><Plus />Incluir videoaula</Link> : undefined}
      />
      <KpiGrade itens={[
        { valor: resumo.total, rotulo: 'videoaulas' },
        { valor: hm(resumo.minutos), rotulo: 'de vídeo no total' },
        { valor: resumo.escondidas, rotulo: 'escondidas dos alunos' },
        { valor: '—', rotulo: 'processando (veja no gerenciador de vídeo)' },
      ]} />
      {!resumo.temOculto && <Nota destaque>{AVISO_OCULTO}</Nota>}
      <BuscaGet placeholder="Buscar por aula, disciplina ou título" q={q} ocultos={{ pp: porPagina !== 25 ? String(porPagina) : undefined, vis: pars.vis }} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[70ch] text-[0.84rem] text-muted-foreground">
          Videoaulas complementares, ligadas à aula. O tempo delas não entra nas horas do cronograma. Desligue “Visível ao aluno” para esconder sem excluir.
        </p>
        <div className="flex items-center gap-1.5 text-xs">
          {podeEditar && <Link href="/admin/conteudos/videos" className={buttonVariants({ variant: 'outline', size: 'sm' })}><Plus />Adicionar linha</Link>}
          {(resumo.temOculto ? ([['todos', 'Todas'], ['escondidos', 'Só escondidas']] as const) : ([['todos', 'Todas']] as const)).map(([v, r]) => (
            <Link key={v} href={`${BASE}?${new URLSearchParams({ ...(q ? { q } : {}), ...(v === 'escondidos' ? { vis: v } : {}) })}`}
              className={cn('rounded-lg border px-2.5 py-1 font-medium', vis === v ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted')}>{r}</Link>
          ))}
        </div>
      </div>
      <VideosTabela rows={lista.rows} podeEditar={podeEditar} controleVisivel={resumo.temOculto} />
      <details className="mt-4 rounded-2xl border bg-card p-4 shadow-sm">
        <summary className="cursor-pointer select-none text-sm font-semibold text-primary">Importar Videoaulas em lote</summary>
        <p className="mt-2 text-sm text-muted-foreground">
          O envio de vários vídeos (com acompanhamento do processamento) é feito no gerenciador de vídeo. Para ligar um vídeo a uma aula do PDFull,
          abra a aula na Biblioteca e use a aba Vídeo (link ou vídeo da plataforma).
        </p>
        <Link href="/admin/conteudos/videos" className={`${buttonVariants({ variant: 'outline', size: 'sm' })} mt-2`}>Abrir o gerenciador de vídeo</Link>
      </details>
      <Paginacao total={lista.total} pagina={pagina} porPagina={porPagina} base={BASE} params={pars} />
    </div>
  )
}
