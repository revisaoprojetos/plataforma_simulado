import Link from 'next/link'
import { ExternalLink, FileText } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { remember } from '@/lib/cache/relatorio-cache'
import { SemPermissao } from '@/components/ui/alert-box'
import { RevisaoHead } from '@/components/admin/revisao/ui'
import { KpiCard, KpiGrid, Nota } from '../_comp/lista'

export const dynamic = 'force-dynamic'

// Simulados — tela de ENTRADA (como no protótipo): o admin de simulados já é completo; aqui ficam os números e os atalhos.
// Diferença do protótipo: lá os links são externos (simulado.revisaopge.com.br/admin); aqui o admin de simulados É a própria
// plataforma, então os atalhos apontam para as telas internas já existentes (mesmo login, mesmo cadastro de alunos e de grupos).

const fmt = (n: number) => n.toLocaleString('pt-BR')

export default async function SimuladosRevisaoPage() {
  const access = await getCurrentAccess()
  const pode = access.isAdmin || access.permissions.includes('*') || access.permissions.includes('simulados:view')
  if (!pode || !access.tenantId) {
    return <div className="w-full space-y-4"><h1 className="text-2xl font-bold tracking-tight">Simulados</h1><SemPermissao>Você não tem permissão para acessar os simulados.</SemPermissao></div>
  }
  const tenantId = access.tenantId
  const k = await remember(`revisao-sim:kpis:${tenantId}`, 120, async () => {
    const svc = createAdminClient()
    const c = (t: string, f: (q: any) => any) => f(svc.from(t).select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('deletado', false))
    const [s, q, e, g] = await Promise.all([
      c('simulado_simulados', (x) => x.eq('status', 'publicado').is('owner_estudante_id', null)),
      c('simulado_questoes', (x) => x), c('simulado_estudantes', (x) => x), c('simulado_grupos', (x) => x),
    ])
    return { simulados: s.count ?? 0, questoes: q.count ?? 0, estudantes: e.count ?? 0, grupos: g.count ?? 0 }
  })

  const atalhos: Array<[string, string, string]> = [
    ['Aplicar simulado', 'Criar, agendar e publicar simulados por pasta', '/admin/simulados'],
    ['Banco de questões', `${fmt(k.questoes)} questões com disciplina e tema`, '/admin/questoes'],
    ['Modelos de caderno', 'Layout do caderno de prova em PDF', '/admin/modelos-caderno'],
    ['Desafio de Lei Seca', 'Módulos, leituras e questões da trilha', '/admin/leitura'],
    ['Desafio de Jurisprudência', 'Teses e súmulas do desafio', '/admin/jurisprudencia'],
    ['Relatórios de simulado', 'Por simulado, disciplina, aluno e ranking', '/admin/relatorios/simulados'],
    ['Reports de questões', 'Erros apontados pelos alunos nas questões', '/admin/feedbacks'],
    ['Grupos de alunos', `${fmt(k.grupos)} grupos de alunos`, '/admin/grupos'],
    ['Banners e pop-ups', 'Avisos no portal de simulados', '/admin/configuracoes/banners'],
  ]

  return (
    <div className="w-full">
      <RevisaoHead
        secao="Montagem de curso"
        titulo="Simulados"
        subtitulo="A plataforma de simulados já tem admin próprio e completo. Ele continua sendo o lugar para criar provas, questões e desafios."
        acoes={<Link href="/admin/simulados" className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"><ExternalLink className="h-4 w-4" />Abrir admin de simulados</Link>}
      />
      <KpiGrid>
        <KpiCard rotulo="Simulados ativos" valor={fmt(k.simulados)} />
        <KpiCard rotulo="Questões no banco" valor={fmt(k.questoes)} />
        <KpiCard rotulo="Estudantes" valor={fmt(k.estudantes)} />
        <KpiCard rotulo="Grupos de alunos" valor={fmt(k.grupos)} />
      </KpiGrid>
      <section className="mb-4 rounded-2xl border bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b p-4">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-muted"><FileText className="h-4 w-4 text-primary" /></span>
          <div><h2 className="text-sm font-semibold">Atalhos para o admin de simulados</h2><p className="text-xs text-muted-foreground">Abrem no mesmo painel, com o mesmo login.</p></div>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          {atalhos.map(([t, d, href]) => (
            <Link key={href} href={href} className="rounded-xl border p-3 transition-colors hover:border-primary/50 hover:bg-primary/5">
              <b className="flex items-center gap-1.5 text-sm">{t} <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" /></b>
              <span className="mt-1 block text-xs text-muted-foreground">{d}</span>
            </Link>
          ))}
        </div>
      </section>
      <Nota tipo="aviso">As duas áreas usam <b>o mesmo cadastro de alunos e os mesmos grupos de acesso</b>. Hoje há {fmt(k.grupos)} grupos: “Grupos de acesso” aqui e no admin de simulados são a mesma lista.</Nota>
    </div>
  )
}
