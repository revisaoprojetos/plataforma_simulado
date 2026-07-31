import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { montarRelatorioEstudante } from '@/app/admin/relatorios/estudantes/_dados'
import { RelatorioEstudanteView } from '@/app/admin/relatorios/estudantes/relatorio-estudante-view'
import { Mail, Phone, IdCard, BarChart3, ArrowRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Meu perfil' }

function iniciais(nome: string) {
  return nome.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase() || 'A'
}
function mascararCpf(cpf?: string | null) {
  const d = (cpf ?? '').replace(/\D/g, '')
  if (d.length !== 11) return cpf ?? null
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.***-**`
}

/**
 * Perfil do estudante: dados pessoais + o MESMO relatório de desempenho do admin
 * (KPIs, evolução, acerto por disciplina aluno×turma, histórico), escopado ao próprio
 * estudante (id vem da sessão assinada — sem IDOR). Absorve os KPIs que saíram da home.
 */
export default async function PerfilAlunoPage() {
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')

  const svc = createAdminClient()
  const [{ data: est }, dados] = await Promise.all([
    svc.from('simulado_estudantes').select('nome, email, cpf, telefone').eq('id', sessao.estudanteId).maybeSingle(),
    montarRelatorioEstudante(svc, sessao.estudanteId, sessao.tenantId),
  ])

  const nome = est?.nome ?? sessao.nome
  const email = est?.email ?? sessao.email
  const contatos = [
    email && { icon: Mail, label: email },
    est?.cpf && { icon: IdCard, label: mascararCpf(est.cpf) },
    est?.telefone && { icon: Phone, label: est.telefone },
  ].filter(Boolean) as { icon: any; label: string }[]

  return (
    <div className="animate-page space-y-6">
      {/* Cabeçalho do perfil */}
      <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-primary/[0.10] via-card to-card p-6 shadow-sm sm:p-7">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-primary/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, color-mix(in oklab, var(--brand-accent) 75%, transparent), transparent)' }} />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white text-xl font-bold text-primary shadow-sm ring-1 ring-black/10">{iniciais(nome)}</span>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--brand-accent)' }} />
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--brand-accent)' }}>Meu perfil</span>
            </div>
            <h1 className="truncate text-2xl font-bold tracking-tight sm:text-[2rem]">{nome}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
              {contatos.map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1.5"><c.icon className="h-4 w-4" /> {c.label}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Desempenho — KPIs, gráficos e histórico (mesmo motor do admin) */}
      {dados && dados.simulados > 0 ? (
        <RelatorioEstudanteView d={dados} semCabecalho />
      ) : (
        <div className="rounded-2xl border bg-muted/30 p-10 text-center">
          <BarChart3 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Seu desempenho aparecerá aqui</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Finalize ao menos um simulado para ver seus números, a evolução e o acerto por disciplina.</p>
          <Link href="/aluno" className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90">
            Ver simulados disponíveis <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  )
}
