import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { FlaskConical, FileText, ClipboardList, BarChart3 } from 'lucide-react'
import { metaDaModalidade, type Modalidade } from '@/lib/caderno-teste/tipos'
import { CriarCadernoTesteBtn } from './criar-btn'

// Área de TESTE do novo construtor de cadernos — tabela isolada simulado_cadernos_teste.
// Começa do zero (não lista os cadernos reais). "Criar caderno" cria um vazio e abre o construtor.
export const dynamic = 'force-dynamic'

const ICONE: Record<Modalidade, any> = { caderno_questoes: FileText, folha_respostas: ClipboardList, diagnostico: BarChart3 }

export default async function CadernosTestePage() {
  const access = await getCurrentAccess()
  const pode = access.isAdmin || access.permissions.includes('questoes:view')
  if (!pode) {
    return (<div className="space-y-4"><h1 className="text-2xl font-bold tracking-tight">Cadernos (teste)</h1><SemPermissao>Sem permissão.</SemPermissao></div>)
  }

  const svc = createAdminClient()
  const tid = access.tenantId ?? '00000000-0000-0000-0000-000000000000'
  let cadernos: any[] = []
  {
    const sel = (cols: string) => svc.from('simulado_cadernos_teste').select(cols).eq('deletado', false).eq('tenant_id', tid).order('atualizado_em', { ascending: false })
    let r: { data: any[] | null; error: { message: string } | null } = await sel('id, nome, config')
    if (r.error) r = await sel('id, nome, config')
    cadernos = (r.data ?? []).filter((c: any) => c.nome !== '__padrao_diagnostico__') // esconde a linha do padrão
  }
  const lista = cadernos.map((c: any) => {
    const b = c.config?.builderV3
    const itens: any[] = Array.isArray(b?.itens) ? b.itens : (b?.modalidade ? [{ modalidade: b.modalidade }] : [])
    const mod = (itens[0]?.modalidade ?? 'caderno_questoes') as Modalidade
    const n = itens.length || 1
    return { id: c.id, nome: c.nome, modalidade: mod, legenda: n > 1 ? `${n} modalidades` : metaDaModalidade(mod).nome }
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><FlaskConical className="h-6 w-6 text-primary" /> Cadernos (teste)</h1>
          <p className="text-muted-foreground">Construtor <strong>novo e simples</strong>: escolha a modalidade e o modelo, ajuste e veja a prévia. Área <strong>isolada</strong> — não afeta os cadernos reais.</p>
        </div>
        <CriarCadernoTesteBtn />
      </div>

      {lista.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <FlaskConical className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Nenhum caderno de teste ainda. Clique em <strong>&ldquo;Criar caderno&rdquo;</strong> para começar do zero.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {lista.map((c) => {
            const Icon = ICONE[c.modalidade]
            return (
              <Link key={c.id} href={`/admin/cadernos-teste/${c.id}`} className="group flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold leading-tight" title={c.nome}>{c.nome}</p>
                  <p className="text-xs text-muted-foreground">{c.legenda}</p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
