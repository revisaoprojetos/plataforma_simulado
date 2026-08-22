import Link from 'next/link'
import { CalendarDays, ChevronRight } from 'lucide-react'
import { redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { getTenantTheme } from '@/lib/tenant-theme'
import { createAdminClient } from '@/lib/supabase/server'
import { cronogramasDoAluno } from '@/lib/cronograma/acesso'
import { Card } from '@/components/ui/card'
import { CronogramaClient } from './cronograma-client'
import { listarMinhasEmissoes } from './emissoes-actions'

export const dynamic = 'force-dynamic'

export default async function CronogramaAlunoPage() {
  // O layout do portal já barra quem não tem sessão; repetimos porque a página lê
  // estudanteId e tenantId dela — e o tenant vem da SESSÃO, não do host (que falha
  // dentro de iframe).
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')

  const svc = createAdminClient()

  // O módulo é ligado por tenant; enquanto estiver desligado, nem a tela aparece.
  const { data: cfg } = await svc
    .from('simulado_cronograma_config')
    .select('ativo')
    .eq('tenant_id', sessao.tenantId)
    .maybeSingle()

  const ativo = !!(cfg as { ativo?: boolean } | null)?.ativo
  const catalogo = ativo ? await cronogramasDoAluno(svc, sessao.tenantId, sessao.estudanteId) : []
  const emissoes = await listarMinhasEmissoes()
  const { tenantNome } = await getTenantTheme()
  const salvos = (emissoes.itens ?? []).filter((e) => !e.arquivada).length
  // "Revisão / Ensino Jurídico" no meio da frase fica arrastado — a manchete usa só a primeira
  // parte do nome do tenant, que é como a marca é dita ("do Revisão").
  const marca = (tenantNome ?? '').split(/[/|–—-]/)[0].trim()

  // Mesma linguagem dos heróis do portal (Ligas, Perfil): marca do tenant no gradiente e
  // `--brand-accent` no destaque. É o que aproxima esta tela do gerador antigo sem trocar
  // a identidade da plataforma por outra.
  const HERO_BG =
    'linear-gradient(135deg, color-mix(in oklab, var(--brand-primary, var(--primary)) 62%, #17122e) 0%, color-mix(in oklab, var(--brand-primary, var(--primary)) 26%, #14102a) 100%)'
  const ACENTO = 'var(--brand-accent, #f6c343)'

  return (
    <div className="animate-page">
      <section
        className="relative overflow-hidden rounded-2xl px-6 pb-28 pt-10 sm:px-10 sm:pt-14"
        style={{ background: HERO_BG }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full"
          style={{ background: `color-mix(in oklab, ${ACENTO} 20%, transparent)`, filter: 'blur(70px)' }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 right-1/4 h-64 w-64 rounded-full"
          style={{ background: 'color-mix(in oklab, #ffffff 12%, transparent)', filter: 'blur(60px)' }}
        />

        <div className="relative max-w-2xl">
          <div className="mb-3 flex items-center gap-2">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: ACENTO, boxShadow: `0 0 10px 1px color-mix(in oklab, ${ACENTO} 60%, transparent)` }}
            />
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: ACENTO }}>
              Cronograma de estudos
            </span>
          </div>
          {/* `main h1` recebe --content-title do tema; aqui o fundo é escuro, então a cor é explícita. */}
          <h1 className="text-3xl font-bold leading-[1.1] tracking-tight sm:text-[2.5rem]" style={{ color: '#fff' }}>
            Gere seu cronograma de estudo{' '}
            <span style={{ color: ACENTO }}>{marca ? `do ${marca}.` : 'do seu jeito.'}</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm text-white/70 sm:text-base">
            Escolha sua rotina, defina quando começar e receba um plano completo — organizado semana a semana
            {salvos > 0 ? ' e guardado na sua conta.' : ' e guardado na sua conta, para você voltar quando quiser.'}
          </p>
          {salvos > 0 && (
            <Link
              href="/aluno/cronograma/meus"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-white/85 ring-1 ring-inset ring-white/25 transition hover:bg-white/10"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              {salvos === 1 ? 'Ver meu cronograma salvo' : `Ver meus ${salvos} cronogramas salvos`}
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </section>

      {/* O cartão sobe sobre o herói, como no gerador antigo. */}
      <div className="relative z-10 -mt-20 space-y-6 sm:mx-4">
        {!catalogo.length ? (
          <Card className="px-4 py-12 text-center">
            <CalendarDays className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">Nenhum cronograma disponível para você</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {ativo
                ? 'Os cronogramas são liberados pela equipe. Fale com o suporte para saber como ter acesso.'
                : 'Esta área ainda está sendo preparada. Volte em breve.'}
            </p>
          </Card>
        ) : (
          <CronogramaClient catalogo={catalogo} />
        )}

      </div>
    </div>
  )
}
