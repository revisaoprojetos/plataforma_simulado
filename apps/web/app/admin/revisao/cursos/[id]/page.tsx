import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Eye } from 'lucide-react'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import {
  getAulasCurso, getCurso, getDadosPreview, getEditalContexto, listarAutomacoes, listarGruposOpcoes, listarPopups,
} from '@/lib/revisao/cursos'
import { getCurrentTenant } from '@/lib/tenant'
import { getAuthUser } from '@/lib/auth/permissions'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { RevisaoAbas, RevisaoHead } from '@/components/admin/revisao/ui'
import { SemAcessoArea } from '@/app/admin/conteudos/_components/sem-acesso-area'
import { CursoAtivoSwitch } from '../curso-ativo-switch'
import { AbaEtapas } from './aba-etapas'
import { AbaInfo } from './aba-info'
import { AbaModelo } from './aba-modelo'
import { AbaPassaporte } from './aba-passaporte'
import { AbaAulas } from './aba-aulas'
import { AbaArte } from './aba-arte'
import { AbaPop } from './aba-pop'
import { AbaMsg } from './aba-msg'
import { AbaMail } from './aba-mail'
import { AbaAcesso } from './aba-acesso'

export const dynamic = 'force-dynamic'
const MODULOS_POR_PAGINA = 10
const ABAS_IDS = ['etapas', 'info', 'modelo', 'pass', 'aulas', 'arte', 'pop', 'msg', 'mail', 'acesso'] as const

// Montagem de curso › CURSO (#curso): 10 abas por ?aba=. O servidor carrega só os dados da aba aberta.
export default async function CursoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const access = await getCurrentAccess()
  if (!(accessCan(access, 'produtos:view') || accessCan(access, 'produtos:manage'))) return <SemAcessoArea />
  if (!access.tenantId) return <div className="w-full p-6 text-sm text-muted-foreground">Tenant não resolvido — recarregue a página.</div>
  const podeEditar = accessCan(access, 'produtos:manage') || accessCan(access, 'produtos:update')
  const tenantId = access.tenantId

  const { id } = await params
  const sp = await searchParams
  const aba = (ABAS_IDS as readonly string[]).includes(sp.aba ?? '') ? (sp.aba as (typeof ABAS_IDS)[number]) : 'etapas'

  const det = await getCurso(tenantId, id)
  if (det === 'migracao') return <div className="rounded-2xl border border-dashed bg-muted/30 p-8 text-sm"><b>Aplique a migração 20261112020000_revisao_cursos.sql para usar Montagem de curso.</b></div>
  if (!det) notFound()
  const { curso: c, produtos, gruposMarcados, etapasOk, slugAluno } = det
  const etDone = etapasOk.filter(Boolean).length
  const hrefAluno = slugAluno ? `/aluno/extensivos/${slugAluno}` : null
  const marcados = gruposMarcados.map((g) => g.id)

  // Dados só da aba aberta (egress mínimo).
  const [grupos, aulas, popups, automacoes, edital] = await Promise.all([
    aba === 'etapas' || aba === 'acesso' ? listarGruposOpcoes(tenantId) : Promise.resolve([]),
    aba === 'aulas' && c.produto_id ? getAulasCurso(tenantId, c.produto_id, Math.max(1, Number(sp.mp ?? 1) || 1), MODULOS_POR_PAGINA) : Promise.resolve({ modulos: [], total: 0 }),
    aba === 'pop' ? listarPopups(tenantId, id) : Promise.resolve([]),
    aba === 'msg' || aba === 'mail' ? listarAutomacoes(tenantId, id) : Promise.resolve([]),
    aba === 'pass' && c.tipo !== 'Extensivo' ? getEditalContexto(tenantId, c, produtos.map((p) => p.id)) : Promise.resolve(null),
  ])
  const precisaPreview = aba === 'modelo' || aba === 'msg' || aba === 'mail'
  const [tenant, au] = precisaPreview ? await Promise.all([getCurrentTenant(), getAuthUser()]) : [null, null]
  const meta = (au?.user_metadata ?? {}) as Record<string, unknown>
  const nomeAdmin = String(meta.nome ?? meta.full_name ?? meta.name ?? au?.email?.split('@')[0] ?? 'aluno').trim().split(' ')[0] || 'aluno'
  const dados = precisaPreview ? await getDadosPreview(tenantId, c, marcados, tenant?.nome ?? '', nomeAdmin) : { tenantNome: '', modulos: [], aulas: [], materiais: [], eventos: [], nomeAdmin }
  const alunosAcesso = gruposMarcados.reduce((s, g) => s + (g.membros ?? 0), 0)

  const abas = [
    { id: 'etapas', titulo: `Passo a passo · ${etDone}/6` }, { id: 'info', titulo: 'Informações' }, { id: 'modelo', titulo: 'Como o aluno vê' },
    { id: 'pass', titulo: 'Passaporte e edital' }, { id: 'aulas', titulo: 'Aulas e materiais' }, { id: 'arte', titulo: 'Imagens e cores' },
    { id: 'pop', titulo: 'Pop-ups' }, { id: 'msg', titulo: 'Mensagens' }, { id: 'mail', titulo: 'E-mails automáticos' }, { id: 'acesso', titulo: 'Quem acessa' },
  ]

  return (
    <div className="w-full">
      <Link href="/admin/revisao/cursos" className="mb-3 inline-block text-sm font-bold text-primary underline-offset-4 hover:underline">← Todos os cursos</Link>
      <RevisaoHead
        secao="Montagem de curso"
        titulo={c.nome}
        acoes={
          <>
            <CursoAtivoSwitch id={c.id} nome={c.nome} ativo={c.ativo} desabilitado={!podeEditar} comRotulo="cabecalho" />
            {hrefAluno ? (
              <a href={hrefAluno} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'outline', size: 'lg' })}><Eye className="size-4" />Ver como aluno</a>
            ) : (
              <span className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'pointer-events-none opacity-50')}><Eye className="size-4" />Ver como aluno</span>
            )}
          </>
        }
      />
      <RevisaoAbas abas={abas} atual={aba} base={`/admin/revisao/cursos/${id}`} />

      {aba === 'etapas' && (
        <AbaEtapas cursoId={id} nome={c.nome} tipo={c.tipo} ativo={c.ativo} produtoPrincipalId={c.produto_id} etapas={c.etapas} etapasOk={etapasOk} etDone={etDone}
          produtos={produtos} grupos={grupos} gruposMarcados={marcados} podeEditar={podeEditar} />
      )}
      {aba === 'info' && <AbaInfo id={id} podeEditar={podeEditar} c={{ nome: c.nome, tipo: c.tipo, sub: c.sub, abre_em: c.abre_em, fecha_em: c.fecha_em, ativo: c.ativo, cronograma_adaptativo: c.cronograma_adaptativo }} />}
      {aba === 'modelo' && <AbaModelo id={id} nome={c.nome} tipo={c.tipo} c1={c.cor_principal} c2={c.cor_destaque} modelo={c.modelo} cfg={c.cfg} blk={c.blk} podeEditar={podeEditar} dados={dados} />}
      {aba === 'pass' && (edital ? <AbaPassaporte cursoId={id} tipo={c.tipo} edital={c.edital} ctx={edital} hrefAluno={hrefAluno} podeEditar={podeEditar} /> : <AbaPassaporte cursoId={id} tipo={c.tipo} edital={c.edital} ctx={{ alunosPassaporte: 0, conciliaram: 0, seguem: 0, naoEscolheram: 0, avulsos: 0, extensivoId: null, cobertura: [] }} hrefAluno={hrefAluno} podeEditar={podeEditar} />)}
      {aba === 'aulas' && <AbaAulas cursoId={id} produtoId={c.produto_id} modulos={aulas.modulos} total={aulas.total} page={Math.max(1, Number(sp.mp ?? 1) || 1)} perPage={MODULOS_POR_PAGINA} podeEditar={podeEditar} />}
      {aba === 'arte' && <AbaArte id={id} nome={c.nome} tipo={c.tipo} podeEditar={podeEditar} d={{ img_horizontal: c.img_horizontal, img_vertical: c.img_vertical, img_banner: c.img_banner, galeria: c.galeria, cor_principal: c.cor_principal, cor_destaque: c.cor_destaque }} />}
      {aba === 'pop' && <AbaPop cursoId={id} c1={c.cor_principal} c2={c.cor_destaque} galeria={c.galeria} popups={popups} podeEditar={podeEditar} />}
      {aba === 'msg' && <AbaMsg cursoId={id} cursoNome={c.nome} cfg={c.msg_cfg} automacoes={automacoes} podeEditar={podeEditar} tenantNome={dados.tenantNome} nomeExemplo={dados.nomeAdmin} />}
      {aba === 'mail' && <AbaMail cursoId={id} cursoNome={c.nome} automacoes={automacoes} podeEditar={podeEditar} tenantNome={dados.tenantNome} nomeExemplo={dados.nomeAdmin} />}
      {aba === 'acesso' && <AbaAcesso cursoId={id} grupos={grupos} marcados={marcados} alunos={alunosAcesso} podeEditar={podeEditar} />}
    </div>
  )
}
