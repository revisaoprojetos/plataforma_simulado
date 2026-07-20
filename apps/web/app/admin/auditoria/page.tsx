import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SecaoHeader } from '@/components/admin/secao-header'
import { ScrollText, ShieldCheck, GraduationCap, LogIn, ClipboardList, BookOpen, ArrowUpDown } from 'lucide-react'
import { AuditoriaFilters } from '@/components/admin/auditoria-filters'
import { AuditoriaDiff } from '@/components/admin/auditoria-diff'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PaginationControls } from '@/components/admin/pagination-controls'
import { isoParaBrtLocal } from '@/lib/brt'
import { cn } from '@/lib/utils'

const ITEMS_PER_PAGE = 12

interface PageProps {
  searchParams: Promise<{
    page?: string; tipo?: string; area?: string; sub?: string; ord?: string; dir?: string
    q?: string; acao?: string; entidade?: string; data_inicio?: string; data_fim?: string
  }>
}

const ACESSO_OPS = ['LOGIN', 'LOGOUT', 'BLOQUEIO_AUTOMATICO']
const MODIFICACAO_OPS = ['INSERT', 'UPDATE', 'DELETE', 'LIBERAR', 'BLOQUEAR', 'ANULAR', 'RECORRIGIR']

const acaoVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  INSERT: 'default', UPDATE: 'secondary', DELETE: 'destructive', LOGIN: 'outline', LOGOUT: 'outline',
  ANULAR: 'destructive', RECORRIGIR: 'secondary', LIBERAR: 'default',
}

const isUuid = (s: unknown) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

function fmtBR(iso?: string | null): string {
  const s = isoParaBrtLocal(iso)
  if (!s) return '—'
  const [d, t] = s.split('T'); const [y, mo, da] = d.split('-')
  return `${da}/${mo}/${y} ${t}`
}

function resumoAutomacao(log: any, nomes: Map<string, string>): { origem: string; texto: string } {
  const d = (log.dados_novos ?? (log.detalhes as any)?.depois ?? {}) as any
  const alvo = isUuid(log.entidade_id) ? (nomes.get(log.entidade_id) ?? `${String(log.entidade_id).slice(0, 8)}…`) : null
  if (log.entidade === 'simulado_assinaturas') {
    const prov = d.provider ? String(d.provider) : 'integração'
    const acao = log.operacao === 'LIBERAR' ? 'liberou acesso' : 'cancelou acesso'
    return { origem: prov.charAt(0).toUpperCase() + prov.slice(1), texto: `${acao}${alvo ? ` de ${alvo}` : ''} — produto ${d.produto ?? '?'} (status ${d.status ?? '?'})` }
  }
  if (log.entidade === 'simulado_estudantes') {
    const canais = Array.isArray(d.curseduca_grupos) ? d.curseduca_grupos : []
    return { origem: 'Curseduca', texto: `Importação: ${d.novos ?? 0} novo(s) · ${d.jaExistiam ?? 0} já existia(m)${d.vinculados ? ` · ${d.vinculados} vinculado(s)` : ''}${d.removidos ? ` · ${d.removidos} removido(s)` : ''}${alvo ? ` → grupo ${alvo}` : ''}${canais.length ? ` · canais [${canais.join(', ')}]` : ''}` }
  }
  if (log.entidade === 'simulado_curseduca_sync') {
    return { origem: 'Sincronização', texto: `Sync automática ${d.ativo ? 'ligada' : 'desligada'}${d.intervaloMin ? ` · a cada ${d.intervaloMin} min` : ''}${d.grupos != null ? ` · ${d.grupos} grupo(s)` : ''}` }
  }
  return { origem: '—', texto: log.operacao }
}

function NavTab({ href, active, icon: Icon, children }: { href: string; active: boolean; icon: any; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn('inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
      active ? 'border-primary bg-primary/5 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
      <Icon className="h-4 w-4" /> {children}
    </Link>
  )
}

type Col = { label: string; w: string; sort?: string; right?: boolean }
type SortCtx = { ord: string; dir: 'asc' | 'desc'; href: (key: string) => string }

export default async function AuditoriaPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = Number(params.page ?? 1) || 1
  const supabase = createAdminClient()
  const tenantId = await getCurrentTenantId()
  const tid = tenantId ?? '00000000-0000-0000-0000-000000000000'
  const offset = (page - 1) * ITEMS_PER_PAGE

  const tipo = params.tipo === 'acessos' ? 'acessos' : params.tipo === 'modificacoes' ? 'modificacoes' : params.tipo === 'automacoes' ? 'automacoes' : 'todos'
  const ehAuto = tipo === 'automacoes'
  const area = tipo === 'acessos' && params.area === 'estudantes' ? 'estudantes' : 'admin'
  const sub = ['plataforma', 'simulados', 'cadernos'].includes(params.sub ?? '') ? (params.sub as string) : 'plataforma'
  const acessosEstud = tipo === 'acessos' && area === 'estudantes'

  const view: 'audit' | 'automacoes' | 'sessoes' | 'eventos' =
    ehAuto ? 'automacoes'
      : acessosEstud && sub === 'simulados' ? 'sessoes'
        : acessosEstud && sub === 'cadernos' ? 'eventos'
          : 'audit'

  // Ordenação (server-side): coluna permitida por visão + direção. Header alterna a direção.
  const ALLOWED: Record<string, string[]> = { audit: ['criado_em', 'operacao', 'entidade'], automacoes: ['criado_em'], sessoes: ['iniciado_em', 'finalizado_em', 'status'], eventos: ['criado_em', 'tipo'] }
  const defOrd = view === 'sessoes' ? 'iniciado_em' : 'criado_em'
  const ord = ALLOWED[view].includes(params.ord ?? '') ? (params.ord as string) : defOrd
  const dir: 'asc' | 'desc' = params.dir === 'asc' ? 'asc' : 'desc'
  const baseSort: Record<string, string> = { tipo }
  if (tipo === 'acessos') { baseSort.area = area; if (area === 'estudantes') baseSort.sub = sub }
  for (const k of ['acao', 'entidade', 'data_inicio', 'data_fim'] as const) if (params[k]) baseSort[k] = params[k]!
  const sortHref = (key: string) => `/admin/auditoria?${new URLSearchParams({ ...baseSort, ord: key, dir: ord === key && dir === 'desc' ? 'asc' : 'desc' }).toString()}`
  const sortCtx: SortCtx = { ord, dir, href: sortHref }

  // Busca (q): nas visões de estudante, procura por nome/e-mail do aluno (e título do simulado);
  // nas de audit_logs, procura por módulo/ação. Resolvida em ids para filtrar server-side.
  const like = (params.q ?? '').replace(/[%,()*]/g, ' ').trim()
  const NADA = '00000000-0000-0000-0000-000000000000'
  let estIdsQ: string[] | null = null, simIdsQ: string[] | null = null
  if (like && (view === 'sessoes' || view === 'eventos' || (acessosEstud && sub === 'plataforma'))) {
    const { data } = await supabase.from('simulado_estudantes').select('id').eq('tenant_id', tid).eq('deletado', false).or(`nome.ilike.%${like}%,email.ilike.%${like}%`).limit(300)
    estIdsQ = (data ?? []).map((e: any) => e.id)
  }
  if (like && (view === 'sessoes' || view === 'eventos')) {
    const { data } = await supabase.from('simulado_simulados').select('id').eq('tenant_id', tid).ilike('titulo', `%${like}%`).limit(200)
    simIdsQ = (data ?? []).map((s: any) => s.id)
  }

  let logs: any[] | null = null, sessoes: any[] | null = null, eventos: any[] | null = null, count = 0
  const nomesEst = new Map<string, { nome: string; email: string | null }>()
  const nomesSim = new Map<string, string>()
  const nomesAuto = new Map<string, string>()
  const nomesAtor = new Map<string, string>()

  if (view === 'audit' || view === 'automacoes') {
    let query = supabase
      .from('simulado_audit_logs')
      .select('id, ator_tipo, ator_id, operacao, entidade, entidade_id, dados_anteriores, dados_novos, detalhes, ip, user_agent, criado_em', { count: 'exact' })
      .eq('tenant_id', tid).order(ord, { ascending: dir === 'asc' }).range(offset, offset + ITEMS_PER_PAGE - 1)
    if (tipo === 'acessos') {
      query = query.in('operacao', ACESSO_OPS)
      if (area === 'admin') query = query.neq('ator_tipo', 'estudante')
      else query = query.eq('ator_tipo', 'estudante')
    } else if (tipo === 'modificacoes') query = query.in('operacao', MODIFICACAO_OPS)
    else if (ehAuto) query = query.or('entidade.eq.simulado_assinaturas,entidade.eq.simulado_curseduca_sync,and(entidade.eq.simulado_estudantes,dados_novos->curseduca_grupos.not.is.null)')
    if (params.acao) query = query.eq('operacao', params.acao)
    if (params.entidade) query = query.ilike('entidade', `%${params.entidade}%`)
    if (params.data_inicio) query = query.gte('criado_em', params.data_inicio)
    if (params.data_fim) query = query.lte('criado_em', params.data_fim + 'T23:59:59Z')
    if (like) {
      if (acessosEstud && sub === 'plataforma') query = estIdsQ?.length ? query.in('entidade_id', estIdsQ) : query.eq('id', NADA)
      else query = query.or(`entidade.ilike.%${like}%,operacao.ilike.%${like}%`)
    }
    const r = await query; logs = r.data; count = r.count ?? 0

    if (ehAuto && logs?.length) {
      const grupoIds = [...new Set(logs.filter((l) => l.entidade === 'simulado_estudantes' && isUuid(l.entidade_id)).map((l) => l.entidade_id as string))]
      const estIds = [...new Set(logs.filter((l) => l.entidade === 'simulado_assinaturas' && isUuid(l.entidade_id)).map((l) => l.entidade_id as string))]
      if (grupoIds.length) { const { data } = await supabase.from('simulado_grupos').select('id, nome').in('id', grupoIds); for (const g of data ?? []) nomesAuto.set((g as any).id, (g as any).nome) }
      if (estIds.length) { const { data } = await supabase.from('simulado_estudantes').select('id, nome').in('id', estIds); for (const e of data ?? []) nomesAuto.set((e as any).id, (e as any).nome) }
    }
    if (acessosEstud && sub === 'plataforma' && logs?.length) {
      const ids = [...new Set(logs.filter((l) => isUuid(l.entidade_id)).map((l) => l.entidade_id as string))]
      if (ids.length) { const { data } = await supabase.from('simulado_estudantes').select('id, nome, email').in('id', ids); for (const e of data ?? []) nomesEst.set((e as any).id, { nome: (e as any).nome, email: (e as any).email }) }
    }
    // Registros (não-plataforma): resolve o NOME do ator (admin) via auth.users (metadata.nome/email).
    if (!ehAuto && !(acessosEstud && sub === 'plataforma') && logs?.length) {
      const atorIds = [...new Set(logs.map((l) => (l.actor_user_id ?? l.ator_id)).filter(isUuid))] as string[]
      await Promise.all(atorIds.map(async (uid) => {
        try {
          const { data } = await supabase.auth.admin.getUserById(uid)
          const u = data?.user
          if (u) nomesAtor.set(uid, ((u.user_metadata as any)?.nome as string) || u.email || '')
        } catch { /* ignora */ }
      }))
    }
  } else if (view === 'sessoes') {
    let q = supabase.from('simulado_sessoes_prova')
      .select('id, estudante_id, simulado_id, status, iniciado_em, finalizado_em', { count: 'exact' })
      .eq('tenant_id', tid).eq('is_teste', false).eq('deletado', false)
    if (params.data_inicio) q = q.gte('iniciado_em', params.data_inicio)
    if (params.data_fim) q = q.lte('iniciado_em', params.data_fim + 'T23:59:59Z')
    if (like) {
      const parts: string[] = []
      if (estIdsQ?.length) parts.push(`estudante_id.in.(${estIdsQ.join(',')})`)
      if (simIdsQ?.length) parts.push(`simulado_id.in.(${simIdsQ.join(',')})`)
      q = parts.length ? q.or(parts.join(',')) : q.eq('id', NADA)
    }
    q = q.order(ord, { ascending: dir === 'asc', nullsFirst: false }).range(offset, offset + ITEMS_PER_PAGE - 1)
    const r = await q; sessoes = r.data; count = r.count ?? 0
  } else if (view === 'eventos') {
    let q = supabase.from('simulado_relatorio_eventos')
      .select('id, estudante_id, simulado_id, tipo, criado_em', { count: 'exact' })
      .eq('tenant_id', tid)
    if (params.data_inicio) q = q.gte('criado_em', params.data_inicio)
    if (params.data_fim) q = q.lte('criado_em', params.data_fim + 'T23:59:59Z')
    if (like) {
      const parts: string[] = []
      if (estIdsQ?.length) parts.push(`estudante_id.in.(${estIdsQ.join(',')})`)
      if (simIdsQ?.length) parts.push(`simulado_id.in.(${simIdsQ.join(',')})`)
      q = parts.length ? q.or(parts.join(',')) : q.eq('id', NADA)
    }
    q = q.order(ord, { ascending: dir === 'asc' }).range(offset, offset + ITEMS_PER_PAGE - 1)
    const r = await q; eventos = r.data; count = r.count ?? 0
  }

  if (view === 'sessoes' || view === 'eventos') {
    const linhas = (view === 'sessoes' ? sessoes : eventos) ?? []
    const eIds = [...new Set(linhas.map((l: any) => l.estudante_id).filter(isUuid))] as string[]
    const sIds = [...new Set(linhas.map((l: any) => l.simulado_id).filter(isUuid))] as string[]
    if (eIds.length) { const { data } = await supabase.from('simulado_estudantes').select('id, nome, email').in('id', eIds); for (const e of data ?? []) nomesEst.set((e as any).id, { nome: (e as any).nome, email: (e as any).email }) }
    if (sIds.length) { const { data } = await supabase.from('simulado_simulados').select('id, titulo').in('id', sIds); for (const s of data ?? []) nomesSim.set((s as any).id, (s as any).titulo) }
  }

  const totalPages = Math.ceil((count ?? 0) / ITEMS_PER_PAGE)
  const titulo = tipo === 'acessos' ? 'Auditoria · Acessos' : tipo === 'modificacoes' ? 'Auditoria · Modificações' : ehAuto ? 'Auditoria · Automações' : 'Auditoria'
  const subtitulo = tipo === 'acessos' ? 'Controle de acessos por área — administradores e estudantes'
    : tipo === 'modificacoes' ? 'Criações, edições, exclusões, liberações e anulações'
      : ehAuto ? 'Tudo que as integrações fizeram sozinhas'
        : 'Registro imutável de todas as ações'
  const qs = (extra: Record<string, string>) => new URLSearchParams({ tipo: 'acessos', ...extra }).toString()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
        <p className="text-muted-foreground">{subtitulo} — {count ?? 0} entradas</p>
      </div>

      {tipo === 'acessos' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <NavTab href={`/admin/auditoria?${qs({ area: 'admin' })}`} active={area === 'admin'} icon={ShieldCheck}>Administradores</NavTab>
            <NavTab href={`/admin/auditoria?${qs({ area: 'estudantes', sub: 'plataforma' })}`} active={area === 'estudantes'} icon={GraduationCap}>Estudantes</NavTab>
          </div>
          {area === 'estudantes' && (
            <div className="flex flex-wrap gap-2 border-l-2 border-primary/20 pl-3">
              <NavTab href={`/admin/auditoria?${qs({ area: 'estudantes', sub: 'plataforma' })}`} active={sub === 'plataforma'} icon={LogIn}>Plataforma (acesso)</NavTab>
              <NavTab href={`/admin/auditoria?${qs({ area: 'estudantes', sub: 'simulados' })}`} active={sub === 'simulados'} icon={ClipboardList}>Simulados (início/término)</NavTab>
              <NavTab href={`/admin/auditoria?${qs({ area: 'estudantes', sub: 'cadernos' })}`} active={sub === 'cadernos'} icon={BookOpen}>Cadernos (acessou/baixou)</NavTab>
            </div>
          )}
        </div>
      )}

      <AuditoriaFilters
        mostrarAcao={view === 'audit' && !(acessosEstud && sub === 'plataforma')}
        buscaPlaceholder={view === 'sessoes' || view === 'eventos' ? 'Buscar por estudante ou simulado…' : acessosEstud ? 'Buscar por estudante…' : 'Buscar por módulo ou ação…'}
      />

      {view === 'automacoes' && (
        <TabelaCard titulo="Automações" subtitulo={`${count ?? 0} evento(s)`} sort={sortCtx}
          cols={[{ label: 'Data/Hora', w: '18%', sort: 'criado_em' }, { label: 'Origem', w: '16%' }, { label: 'O que aconteceu', w: '54%' }, { label: 'Detalhes', w: '12%' }]}
          vazio="Nenhuma automação registrada ainda." temLinhas={!!logs?.length}>
          {(logs ?? []).map((log) => {
            const r = resumoAutomacao(log, nomesAuto)
            return (
              <TableRow key={log.id}>
                <TableCell className="truncate whitespace-nowrap text-sm text-muted-foreground">{fmtBR(log.criado_em)}</TableCell>
                <TableCell className="truncate"><Badge variant={log.operacao === 'BLOQUEAR' ? 'destructive' : 'default'}>{r.origem}</Badge></TableCell>
                <TableCell className="truncate text-sm" title={r.texto}>{r.texto}</TableCell>
                <TableCell><DetalhesCell log={log} /></TableCell>
              </TableRow>
            )
          })}
        </TabelaCard>
      )}

      {view === 'audit' && acessosEstud && sub === 'plataforma' && (
        <TabelaCard titulo="Acessos dos estudantes" subtitulo={`${count ?? 0} acesso(s)`} sort={sortCtx}
          cols={[{ label: 'Data/Hora', w: '24%', sort: 'criado_em' }, { label: 'Estudante', w: '34%' }, { label: 'Onde', w: '26%' }, { label: 'IP', w: '16%' }]}
          vazio="Nenhum acesso de estudante registrado ainda." temLinhas={!!logs?.length}>
          {(logs ?? []).map((log) => {
            const est = isUuid(log.entidade_id) ? nomesEst.get(log.entidade_id) : null
            const nome = est?.nome ?? (log.dados_novos as any)?.nome ?? '—'
            const email = est?.email ?? (log.dados_novos as any)?.email ?? null
            const onde = log.entidade === 'simulado_acesso' ? `Simulado${(log.dados_novos as any)?.simulado ? `: ${(log.dados_novos as any).simulado}` : ''}` : 'Portal do aluno'
            return (
              <TableRow key={log.id}>
                <TableCell className="truncate whitespace-nowrap text-sm text-muted-foreground">{fmtBR(log.criado_em)}</TableCell>
                <TableCell className="truncate" title={nome}><span className="font-medium">{nome}</span>{email && <span className="block truncate text-xs text-muted-foreground">{email}</span>}</TableCell>
                <TableCell className="truncate text-sm" title={onde}>{onde}</TableCell>
                <TableCell className="truncate text-xs text-muted-foreground">{log.ip ? String(log.ip) : '—'}</TableCell>
              </TableRow>
            )
          })}
        </TabelaCard>
      )}

      {view === 'audit' && !(acessosEstud && sub === 'plataforma') && (
        <TabelaCard titulo="Registros" subtitulo={`${count ?? 0} entrada(s)`} sort={sortCtx}
          cols={[{ label: 'Data/Hora', w: '17%', sort: 'criado_em' }, { label: 'Ator & Nome', w: '24%' }, { label: 'Ação', w: '13%', sort: 'operacao' }, { label: 'Módulo', w: '20%', sort: 'entidade' }, { label: 'IP', w: '14%' }, { label: 'Detalhes', w: '12%' }]}
          vazio="Nenhum registro encontrado." temLinhas={!!logs?.length}>
          {(logs ?? []).map((log) => {
            const nome = isUuid(log.ator_id) ? nomesAtor.get(log.ator_id) : null
            return (
              <TableRow key={log.id}>
                <TableCell className="truncate whitespace-nowrap text-sm text-muted-foreground">{fmtBR(log.criado_em)}</TableCell>
                <TableCell className="truncate" title={nome ?? log.ator_tipo}>
                  <span className="font-medium">{nome ?? '—'}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{log.ator_tipo}{!nome && log.ator_id ? ` · ${String(log.ator_id).slice(0, 8)}…` : ''}</span>
                </TableCell>
                <TableCell className="truncate"><Badge variant={acaoVariant[log.operacao] ?? 'outline'}>{log.operacao}</Badge></TableCell>
                <TableCell className="truncate font-mono text-xs text-muted-foreground" title={log.entidade}>{log.entidade}</TableCell>
                <TableCell className="truncate text-xs text-muted-foreground">{log.ip ? String(log.ip) : '—'}</TableCell>
                <TableCell><DetalhesCell log={log} /></TableCell>
              </TableRow>
            )
          })}
        </TabelaCard>
      )}

      {view === 'sessoes' && (
        <TabelaCard titulo="Início e término de simulados" subtitulo={`${count ?? 0} sessão(ões)`} sort={sortCtx}
          cols={[{ label: 'Estudante', w: '24%' }, { label: 'Simulado', w: '26%' }, { label: 'Início', w: '18%', sort: 'iniciado_em' }, { label: 'Término', w: '18%', sort: 'finalizado_em' }, { label: 'Situação', w: '14%', sort: 'status' }]}
          vazio="Nenhuma sessão registrada ainda." temLinhas={!!sessoes?.length}>
          {(sessoes ?? []).map((s) => {
            const est = nomesEst.get(s.estudante_id)
            const stCfg: Record<string, { label: string; cls: string }> = {
              finalizada: { label: 'Finalizada', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
              em_andamento: { label: 'Em andamento', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
              aguardando: { label: 'Aguardando', cls: 'bg-muted text-muted-foreground' },
            }
            const cfg = stCfg[s.status] ?? stCfg.aguardando
            return (
              <TableRow key={s.id}>
                <TableCell className="truncate" title={est?.nome}><span className="font-medium">{est?.nome ?? '—'}</span>{est?.email && <span className="block truncate text-xs text-muted-foreground">{est.email}</span>}</TableCell>
                <TableCell className="truncate text-sm" title={nomesSim.get(s.simulado_id) ?? undefined}>{nomesSim.get(s.simulado_id) ?? '—'}</TableCell>
                <TableCell className="truncate whitespace-nowrap text-sm text-muted-foreground">{fmtBR(s.iniciado_em)}</TableCell>
                <TableCell className="truncate whitespace-nowrap text-sm text-muted-foreground">{fmtBR(s.finalizado_em)}</TableCell>
                <TableCell className="truncate"><span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', cfg.cls)}>{cfg.label}</span></TableCell>
              </TableRow>
            )
          })}
        </TabelaCard>
      )}

      {view === 'eventos' && (
        <TabelaCard titulo="Cadernos e relatórios" subtitulo={`${count ?? 0} evento(s)`} sort={sortCtx}
          cols={[{ label: 'Data/Hora', w: '24%', sort: 'criado_em' }, { label: 'Estudante', w: '32%' }, { label: 'Simulado', w: '28%' }, { label: 'Ação', w: '16%', sort: 'tipo' }]}
          vazio="Nenhum acesso a caderno/relatório registrado ainda." temLinhas={!!eventos?.length}>
          {(eventos ?? []).map((e) => {
            const est = nomesEst.get(e.estudante_id)
            return (
              <TableRow key={e.id}>
                <TableCell className="truncate whitespace-nowrap text-sm text-muted-foreground">{fmtBR(e.criado_em)}</TableCell>
                <TableCell className="truncate" title={est?.nome}><span className="font-medium">{est?.nome ?? '—'}</span>{est?.email && <span className="block truncate text-xs text-muted-foreground">{est.email}</span>}</TableCell>
                <TableCell className="truncate text-sm" title={nomesSim.get(e.simulado_id) ?? undefined}>{nomesSim.get(e.simulado_id) ?? '—'}</TableCell>
                <TableCell className="truncate"><Badge variant={e.tipo === 'baixou' ? 'default' : 'secondary'}>{e.tipo === 'baixou' ? 'Baixou' : 'Visualizou'}</Badge></TableCell>
              </TableRow>
            )
          })}
        </TabelaCard>
      )}

      <PaginationControls page={page} totalPages={totalPages} />
    </div>
  )
}

function SortHead({ col, sort }: { col: Col; sort?: SortCtx }) {
  const inner = <>{col.label}{col.sort && <ArrowUpDown className={cn('ml-1 inline h-3 w-3', sort && sort.ord === col.sort ? 'text-primary' : 'text-muted-foreground/50')} />}</>
  return (
    <TableHead className={cn(col.right && 'text-right')}>
      {col.sort && sort ? <Link href={sort.href(col.sort)} className="inline-flex items-center hover:text-foreground">{inner}</Link> : inner}
    </TableHead>
  )
}

function TabelaCard({ titulo, subtitulo, cols, vazio, temLinhas, sort, children }: { titulo: string; subtitulo: string; cols: Col[]; vazio: string; temLinhas: boolean; sort?: SortCtx; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
      <SecaoHeader icon={ScrollText} titulo={titulo} subtitulo={subtitulo} />
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table className="w-full table-fixed text-sm [&_td]:py-2 [&_th]:h-9 [&_th]:py-0">
            <colgroup>{cols.map((c, i) => <col key={i} style={{ width: c.w }} />)}</colgroup>
            <TableHeader>
              <TableRow>{cols.map((c) => <SortHead key={c.label} col={c} sort={sort} />)}</TableRow>
            </TableHeader>
            <TableBody>
              {!temLinhas ? (
                <TableRow><TableCell colSpan={cols.length} className="py-8 text-center text-muted-foreground">{vazio}</TableCell></TableRow>
              ) : children}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

function DetalhesCell({ log }: { log: any }) {
  if (!(log.dados_anteriores || log.dados_novos || log.detalhes)) return null
  return (
    <AuditoriaDiff
      antes={(log.dados_anteriores as Record<string, unknown> | null) ?? ((log.detalhes as Record<string, unknown>)?.antes as Record<string, unknown> | null)}
      depois={(log.dados_novos as Record<string, unknown> | null) ?? ((log.detalhes as Record<string, unknown>)?.depois as Record<string, unknown> | null)}
      raw={(log.detalhes as Record<string, unknown>) ?? {}}
    />
  )
}
