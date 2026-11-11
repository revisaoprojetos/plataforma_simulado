import Link from 'next/link'
import { RevisaoHead } from '@/components/admin/revisao/ui'
import { AvisoSemAcesso } from '@/components/admin/aviso-sem-acesso'
import { checkPermission, getCurrentAccess } from '@/lib/auth/permissions'
import { isoParaBrtLocal } from '@/lib/brt'
import { jcPasta } from '@/lib/revisao/jurisclub-tipos'
import { alunosComJurisclub, disciplinasTenant, gruposDaEdicao, gruposDoTenant, obterEdicao } from '@/lib/revisao/jurisclub-dados'
import { Wizard, type WizardBase } from './wizard'

// Nova edição / novo dia (protótipo #jcnova): passo a passo de 6 etapas. A página só carrega o que o formulário precisa
// (grupos, edição-base p/ "a partir de uma já pronta"); o estado do passo a passo vive no client e só grava na etapa 6.
export const dynamic = 'force-dynamic'

export default async function NovaEdicaoPage({ searchParams }: { searchParams: Promise<{ pasta?: string; base?: string }> }) {
  if (!(await checkPermission('biblioteca:update'))) return <AvisoSemAcesso />
  const access = await getCurrentAccess()
  if (!access.tenantId) return <AvisoSemAcesso />
  const sp = await searchParams
  const b = sp.base ? await obterEdicao(access.tenantId, sp.base) : null
  const pasta = b ? b.pasta : sp.pasta === '1a7d' ? '1a7d' : 'mensal'
  const p = jcPasta(pasta)

  const [grupos, grupoIds, disciplinas, totalTodos] = await Promise.all([
    gruposDoTenant(access.tenantId),
    b ? gruposDaEdicao(access.tenantId, b.id) : Promise.resolve([] as string[]),
    disciplinasTenant(access.tenantId).catch(() => [] as string[]),
    alunosComJurisclub(access.tenantId).catch(() => 0),
  ])
  const base: WizardBase | null = b ? { id: b.id, titulo: b.titulo, cor: b.cor, versao: b.versao, todos: b.todos, grupoIds, filtrosAuto: b.filtros_auto } : null
  const agora = new Date()
  const mesAtual = isoParaBrtLocal(agora.toISOString()).slice(0, 7)
  const dataPadrao = isoParaBrtLocal(new Date(agora.getTime() + 24 * 3600 * 1000).toISOString()).slice(0, 11) + '08:00'

  return (
    <div className="space-y-4">
      <Link href="/admin/revisao/jurisclub" className="text-sm font-bold text-primary underline-offset-4 hover:underline">← Voltar para o JurisClub</Link>
      <RevisaoHead secao={`JurisClub · ${p.n}`} titulo={b ? `Nova ${p.un.toLowerCase()} a partir de ${b.titulo}` : `Nova ${p.un.toLowerCase()}`} />
      <Wizard pastaInicial={pasta} base={base} grupos={grupos} disciplinas={disciplinas} totalTodos={totalTodos} tenantId={access.tenantId} mesAtual={mesAtual} dataPadrao={dataPadrao} />
    </div>
  )
}
