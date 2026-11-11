import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { RevisaoHead, RevisaoAbas } from '@/components/admin/revisao/ui'
import { NotaCs } from '@/components/admin/revisao/cs-ui'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { eventosPeriodo, gruposOpcoes, hojeBrt, NADA } from '@/lib/admin-revisao/cs'
import { DIAS_SEMANA, MESES, diaValido, gradeMes, gradeSemana, semanaMais, ymMais, ymValido } from '@/lib/admin-revisao/cs-calendario'
import { EVENTO_TIPOS, type EventoCal } from '@/lib/admin-revisao/cs-tipos'
import { BARRA_EVENTO, COR_EVENTO } from '@/lib/admin-revisao/cs-estilos'
import { EventoForm } from './evento-form'

export const dynamic = 'force-dynamic'
type SP = Record<string, string | string[] | undefined>
const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

// CS › Calendário de eventos (#calendario). Vista Mês (como o protótipo) + Semana. Só LÊ eventos do período visível.
export default async function CalendarioPage({ searchParams }: { searchParams: Promise<SP> }) {
  const access = await getCurrentAccess()
  if (!accessCan(access, 'estudantes:view')) return <SemPermissao>Você não tem permissão para ver o calendário.</SemPermissao>
  const tenantId = access.tenantId ?? NADA
  const sp = await searchParams
  const hoje = hojeBrt()
  const vista = um(sp.vista) === 'semana' ? 'semana' : 'mes'
  const { y, m } = ymValido(um(sp.ym), hoje)
  const diaPedido = diaValido(um(sp.dia))
  const mesStr = `${y}-${String(m + 1).padStart(2, '0')}`
  const dia = diaPedido ?? (hoje.startsWith(mesStr) ? hoje : `${mesStr}-01`)

  const dias = vista === 'mes' ? gradeMes(y, m) : gradeSemana(dia)
  const [{ eventos, ok }, grupos] = await Promise.all([
    eventosPeriodo(tenantId, dias[0].iso, dias[dias.length - 1].iso),
    gruposOpcoes(tenantId),
  ])
  const porDia = new Map<string, EventoCal[]>()
  for (const e of eventos) porDia.set(e.data, [...(porDia.get(e.data) ?? []), e])

  const href = (o: { ym?: string; dia?: string; vista?: string }) => {
    const p = new URLSearchParams({ vista: o.vista ?? vista, ym: o.ym ?? mesStr, dia: o.dia ?? dia })
    return `/admin/revisao/calendario?${p}`
  }
  const prev = vista === 'mes' ? ymMais(y, m, -1) : null
  const next = vista === 'mes' ? ymMais(y, m, 1) : null
  const titulo = vista === 'mes' ? `${MESES[m]} ${y}` : `Semana de ${dias[0].iso.slice(8, 10)}/${dias[0].iso.slice(5, 7)} a ${dias[6].iso.slice(8, 10)}/${dias[6].iso.slice(5, 7)}`
  const [sy, sm, sd] = dia.split('-')

  return (
    <div className="animate-page">
      <RevisaoHead secao="CS" titulo="Calendário de eventos" subtitulo="Clique num dia para criar o evento. Ele aparece no calendário do Início de quem está no grupo escolhido." />
      {!ok && <div className="mb-4"><NotaCs tom="aviso">A tabela de eventos ainda não existe: aplique a migração <b>20261112040000</b> para criar e listar eventos.</NotaCs></div>}
      <RevisaoAbas abas={[{ id: 'mes', titulo: 'Mês' }, { id: 'semana', titulo: 'Semana' }]} atual={vista} base="/admin/revisao/calendario" param="vista" extra={{ ym: mesStr, dia }} />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <div className="grid min-w-0 gap-3">
          <div className="flex items-center gap-3">
            {vista === 'mes' ? (
              <Link href={href({ ym: prev! })} aria-label="Mês anterior" className={buttonVariants({ variant: 'outline', size: 'icon' })}><ChevronLeft /></Link>
            ) : (
              <Link href={href({ dia: semanaMais(dia, -1), ym: semanaMais(dia, -1).slice(0, 7) })} aria-label="Semana anterior" className={buttonVariants({ variant: 'outline', size: 'icon' })}><ChevronLeft /></Link>
            )}
            <h2 className="text-lg font-bold">{titulo}</h2>
            {vista === 'mes' ? (
              <Link href={href({ ym: next! })} aria-label="Próximo mês" className={buttonVariants({ variant: 'outline', size: 'icon' })}><ChevronRight /></Link>
            ) : (
              <Link href={href({ dia: semanaMais(dia, 1), ym: semanaMais(dia, 1).slice(0, 7) })} aria-label="Próxima semana" className={buttonVariants({ variant: 'outline', size: 'icon' })}><ChevronRight /></Link>
            )}
            <Link href={href({ ym: hoje.slice(0, 7), dia: hoje })} className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'text-muted-foreground')}>Hoje</Link>
          </div>

          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="grid grid-cols-7 border-b bg-muted/50">
              {DIAS_SEMANA.map((w) => <div key={w} className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{w}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {dias.map((d, i) => {
                const evs = porDia.get(d.iso) ?? []
                const sel = d.iso === dia, ehHoje = d.iso === hoje
                return (
                  <Link key={d.iso} href={href({ dia: d.iso, ym: vista === 'mes' ? mesStr : d.iso.slice(0, 7) })} scroll={false}
                    className={cn('flex flex-col gap-1 border-b border-r p-1.5 transition-colors hover:bg-muted/40', vista === 'mes' ? 'min-h-24' : 'min-h-64', i % 7 === 6 && 'border-r-0', sel && 'bg-primary/5 ring-2 ring-inset ring-primary', d.fora && 'opacity-45')}>
                    <span className={cn('inline-flex h-6 min-w-6 items-center justify-center self-start rounded-full px-1 text-xs font-bold', ehHoje ? 'bg-primary text-primary-foreground' : 'text-foreground')}>{d.dia}</span>
                    {evs.slice(0, vista === 'mes' ? 3 : 20).map((e) => (
                      <span key={e.id} className={cn('truncate rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold', COR_EVENTO[e.tipo])} title={`${e.hora} ${e.titulo}${e.grupoNome ? ` · ${e.grupoNome}` : ''}`}>{e.hora} {e.titulo}</span>
                    ))}
                    {vista === 'mes' && evs.length > 3 && <span className="px-1 text-[10.5px] text-muted-foreground">+{evs.length - 3} evento(s)</span>}
                  </Link>
                )
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Legenda">
            {EVENTO_TIPOS.map((t) => <span key={t.k} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"><span className={cn('h-2.5 w-2.5 rounded-sm', BARRA_EVENTO[t.k])} />{t.rotulo}</span>)}
          </div>
        </div>

        <EventoForm key={dia} dia={dia} diaTxt={`${sd}/${sm}/${sy}`} grupos={grupos} doDia={porDia.get(dia) ?? []} podeEditar={accessCan(access, 'estudantes:update')} />
      </div>
    </div>
  )
}
