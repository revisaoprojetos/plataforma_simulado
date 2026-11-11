import Link from 'next/link'
import { BookOpen, ChevronRight, Scale } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { checkPermission } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { buttonVariants } from '@/components/ui/button'
import { RevisaoAbas } from '@/components/admin/revisao/ui'
import { listarDisciplinasFiltro } from '@/app/admin/banco-questoes/actions'
import { listarConjuntosPag, listarLinksPag } from '@/lib/revisao/gerador/conteudos'
import { BarraBusca, Nota, ParamsInt, Pilula, ThFixo, ThOrd, hrefCom, type QS } from '../../../_comp/lista'
import { TabelaSel } from './tabela-sel'
import { AcoesConjunto, ExcluirLinkBtn, LinkDialogo, LinksExternos, NovaPasta, NovoConjunto, PastaChip, PlataformasDialogo } from './acoes-client'

// Sub-aba "Conteúdos" do Gerador: Conjuntos (Banco de Conteúdos) × Links de aula, com toggle interno por `?painel=`.
// Só LÊ dados prontos (lib/revisao/gerador/conteudos). O editor do conjunto continua em /admin/cronogramas/conteudos/[id].
// Parâmetros: q, ord, dir, pag, pps + painel (conjuntos|links), pasta, tipo (legproc), situ (sem|com|pend).

const PPS = [10, 14, 25, 50, 100]
const PP_PADRAO = 14
const porPagina = (v: string | undefined) => { const n = ParamsInt(v, PP_PADRAO); return PPS.includes(n) ? n : PP_PADRAO }

type SP = Record<string, string | string[] | undefined>
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default async function GeradorConteudos({ sp, tenantId, basePath }: { sp: SP; tenantId: string; basePath: string }) {
  const [pathname, queryBase = ''] = basePath.split('?')
  // qs = params da URL + os fixos do basePath (aba/sub), para os links de ordenação/filtro/paginação preservarem tudo.
  const qs: QS = {}
  for (const [k, v] of new URLSearchParams(queryBase)) qs[k] = v
  for (const [k, v] of Object.entries(sp)) { const s = um(v); if (s) qs[k] = s }

  const [pode, podeEditar] = await Promise.all([checkPermission('cronogramas:view'), checkPermission('cronogramas:update')])
  if (!pode) return <SemPermissao>Você não tem permissão para ver os conteúdos do cronograma.</SemPermissao>

  const painel = qs.painel === 'links' ? 'links' : 'conjuntos'
  const svc = createAdminClient()
  const dir = qs.dir === 'desc' ? 'desc' : 'asc'
  const pagina = ParamsInt(qs.pag, 1)
  const pp = porPagina(qs.pps)
  const preservar = ['aba', 'sub', 'painel', 'pasta', 'pps']

  return (
    <div className="w-full">
      <RevisaoAbas
        base={pathname} param="painel" atual={painel} extra={{ aba: qs.aba, sub: qs.sub }}
        abas={[{ id: 'conjuntos', titulo: 'Conjuntos' }, { id: 'links', titulo: 'Links de aula' }]}
      />
      {painel === 'conjuntos'
        ? await Conjuntos({ svc, tenantId, pathname, qs, dir, pagina, pp, preservar, podeEditar })
        : await Links({ svc, tenantId, pathname, qs, dir, pagina, pp, preservar, podeEditar })}
    </div>
  )
}

type Ctx = { svc: ReturnType<typeof createAdminClient>; tenantId: string; pathname: string; qs: QS; dir: 'asc' | 'desc'; pagina: number; pp: number; preservar: string[]; podeEditar: boolean }

async function Conjuntos({ svc, tenantId, pathname, qs, dir, pagina, pp, preservar, podeEditar }: Ctx) {
  const [r, disciplinas] = await Promise.all([
    listarConjuntosPag(svc, tenantId, { pasta: qs.pasta ?? null, q: qs.q, legproc: qs.tipo === 'legproc', ord: qs.ord, dir, pagina, porPagina: pp }),
    podeEditar ? listarDisciplinasFiltro().catch(() => []) : Promise.resolve([]),
  ])
  const pastaAtual = r.trilha.length ? r.trilha[r.trilha.length - 1].id : null
  const hrefPasta = (id: string | null) => hrefCom(pathname, qs, { pasta: id ?? undefined, pag: undefined, q: undefined })

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground" aria-label="Pastas">
          <Link href={hrefPasta(null)} className={pastaAtual ? 'hover:text-foreground' : 'font-semibold text-foreground'}>Todas as pastas</Link>
          {r.trilha.map((t, i) => (
            <span key={t.id} className="inline-flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 opacity-50" />
              <Link href={hrefPasta(t.id)} className={i === r.trilha.length - 1 ? 'font-semibold text-foreground' : 'hover:text-foreground'}>{t.nome}</Link>
            </span>
          ))}
        </nav>
        {podeEditar && (
          <div className="flex items-center gap-2">
            <NovaPasta paiId={pastaAtual} />
            <NovoConjunto pastaId={pastaAtual} disciplinas={disciplinas} />
          </div>
        )}
      </div>

      {r.pastas.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {r.pastas.map((p) => podeEditar
            ? <PastaChip key={p.id} id={p.id} nome={p.nome} href={hrefPasta(p.id)} />
            : <Link key={p.id} href={hrefPasta(p.id)} className="rounded-lg border bg-card px-2.5 py-1 text-sm font-medium shadow-sm hover:text-primary">{p.nome}</Link>)}
        </div>
      )}

      <BarraBusca base={pathname} qs={qs} preservar={preservar} placeholder="Buscar conjunto ou disciplina (em todas as pastas)"
        filtros={[{ nome: 'tipo', rotulo: 'Todos os conjuntos', opcoes: [{ v: 'legproc', l: 'Só com aula LegProc' }] }]} />

      <TabelaSel tipo="conjuntos" podeEditar={podeEditar} colunas={6} total={r.total} page={r.pagina} pp={r.porPagina} pastas={r.todasPastas}
        vazio={qs.q || qs.tipo ? 'Nada encontrado com esses filtros.' : 'Nenhum conjunto neste nível. Crie o primeiro para reunir aulas de uma disciplina.'}
        head={<><ThOrd rotulo="Conjunto" col="nome" base={pathname} qs={qs} /><ThOrd rotulo="Disciplina" col="disciplina" base={pathname} qs={qs} /><ThFixo align="right">Aulas</ThFixo><ThFixo align="right">Questões</ThFixo><ThFixo align="right">LegProc</ThFixo><ThFixo>Ações</ThFixo></>}
        rows={r.linhas.map((c) => ({
          id: c.id,
          cells: [
            <span key="n" className="flex min-w-0 flex-col">
              <Link href={`/admin/cronogramas/conteudos/${c.id}${qs.tipo === 'legproc' ? '?tipo=legproc' : ''}`} className="inline-flex items-center gap-1.5 font-medium hover:text-primary"><BookOpen className="h-3.5 w-3.5 shrink-0 text-primary" /><span className="truncate">{c.nome}</span></Link>
              {c.descricao && <span className="truncate text-xs text-muted-foreground">{c.descricao}</span>}
            </span>,
            <Pilula key="d" tipo="vio">{c.disciplina || '—'}</Pilula>,
            <span key="a" className="block text-right tabular-nums">{c.aulas.toLocaleString('pt-BR')}</span>,
            <span key="q" className="block text-right tabular-nums">{c.questoes ? c.questoes.toLocaleString('pt-BR') : '—'}</span>,
            <span key="l" className="block text-right tabular-nums">{c.aulasLegproc ? <Pilula tipo="warn"><Scale className="h-3 w-3" />{c.aulasLegproc.toLocaleString('pt-BR')}</Pilula> : '—'}</span>,
            <span key="x" className="inline-flex items-center gap-1">
              <Link href={`/admin/cronogramas/conteudos/${c.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>Abrir</Link>
              <AcoesConjunto id={c.id} nome={c.nome} podeEditar={podeEditar} />
            </span>,
          ],
        }))} />
    </>
  )
}

async function Links({ svc, tenantId, pathname, qs, dir, pagina, pp, preservar, podeEditar }: Ctx) {
  const situ = qs.situ === 'sem' || qs.situ === 'com' || qs.situ === 'pend' ? qs.situ : undefined
  const r = await listarLinksPag(svc, tenantId, { q: qs.q, situ, ord: qs.ord, dir, pagina, porPagina: pp })

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Um link por plataforma de curso e por aula; vale para todos os cronogramas que citarem a aula. {r.totalLinks.toLocaleString('pt-BR')} aula(s) · {r.plataformas.length} plataforma(s).
        </p>
        {podeEditar && (
          <div className="flex items-center gap-2">
            <PlataformasDialogo plataformas={r.plataformas} />
            <LinkDialogo modo="novo" plataformas={r.plataformas} />
          </div>
        )}
      </div>

      {r.modo === 'pend' && <Nota tipo="aviso">Aulas citadas por metas de questões que ainda não têm link: nelas o aluno vê “Não há link cadastrado para esta aula”.</Nota>}

      <BarraBusca base={pathname} qs={qs} preservar={preservar} placeholder="Buscar disciplina, aula ou tema"
        filtros={[{ nome: 'situ', rotulo: 'Todas as aulas', opcoes: [{ v: 'sem', l: 'Cadastradas sem link' }, { v: 'com', l: 'Com link' }, { v: 'pend', l: 'Pendentes (metas sem cadastro)' }] }]} />

      {r.modo === 'pend' ? (
        <TabelaSel tipo="leitura" podeEditar={false} colunas={4} total={r.total} page={r.pagina} pp={r.porPagina} vazio="Nenhuma pendência — toda aula de questões tem link cadastrado."
          head={<><ThOrd rotulo="Disciplina" col="disciplina" base={pathname} qs={qs} /><ThOrd rotulo="Aula" col="aula" base={pathname} qs={qs} /><ThOrd rotulo="Metas" col="metas" base={pathname} qs={qs} /><ThFixo>Ações</ThFixo></>}
          rows={r.pendentes.map((x) => ({
            id: `${x.disciplina}|${x.aula}`,
            cells: [
              x.disciplina,
              <span key="a" className="font-mono">{x.aula}</span>,
              <span key="m" className="tabular-nums">{x.metas.toLocaleString('pt-BR')}</span>,
              podeEditar ? <LinkDialogo key="c" modo="novo" rotulo="Cadastrar" plataformas={r.plataformas} inicial={{ disciplina: x.disciplina, aula: x.aula, tema: null, urls: [] }} /> : null,
            ],
          }))} />
      ) : (
        <TabelaSel tipo="links" podeEditar={podeEditar} colunas={6} total={r.total} page={r.pagina} pp={r.porPagina}
          vazio={qs.q || situ ? 'Nada encontrado com esses filtros.' : 'Nenhum link cadastrado ainda.'}
          head={<><ThOrd rotulo="Disciplina" col="disciplina" base={pathname} qs={qs} /><ThOrd rotulo="Aula" col="aula" base={pathname} qs={qs} /><ThOrd rotulo="Tema" col="tema" base={pathname} qs={qs} /><ThFixo>Links</ThFixo><ThFixo align="right">Metas</ThFixo><ThFixo>Ações</ThFixo></>}
          rows={r.linhas.map((l) => ({
            id: l.id,
            cells: [
              l.disciplina,
              <span key="a" className="font-mono">{l.aula}</span>,
              l.tema ?? <span key="t" className="italic text-muted-foreground">sem tema</span>,
              <LinksExternos key="u" urls={l.urls} plataformas={r.plataformas} />,
              <span key="m" className="block text-right tabular-nums">{l.usos ? l.usos.toLocaleString('pt-BR') : '—'}</span>,
              podeEditar ? (
                <span key="x" className="inline-flex items-center gap-0.5">
                  <LinkDialogo modo="editar" pequeno plataformas={r.plataformas} inicial={{ id: l.id, disciplina: l.disciplina, aula: l.aula, tema: l.tema, urls: l.urls }} />
                  <ExcluirLinkBtn id={l.id} rotulo={`${l.disciplina} · aula ${l.aula}`} usos={l.usos} />
                </span>
              ) : null,
            ],
          }))} />
      )}
    </>
  )
}
