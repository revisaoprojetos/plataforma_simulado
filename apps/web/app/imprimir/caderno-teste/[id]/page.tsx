import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { normalizarBuilder } from '@/lib/caderno-teste/tipos'
import type { DiscBanco } from '@/lib/caderno-teste/previa'
import type { PreviewQuestao } from '@/lib/caderno-teste/tipos'
import { previewQuestoesBanco, dadosBancoTeste } from '@/app/admin/cadernos-teste/actions'
import { PreviewCadernoTeste } from './preview-caderno-teste'

export const dynamic = 'force-dynamic'

/**
 * Prévia (paginada em A4) de um grupo do caderno de teste — usada no iframe da aba do banco.
 * Renderiza os MESMOS componentes do editor (Previa/PreviaBlocos), então a prévia bate 1:1.
 */
export default async function ImprimirCadernoTestePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ grupo?: string; aluno?: string; embed?: string }> }) {
  const { id: cadernoId } = await params
  const sp = await searchParams
  const grupoId = sp.grupo ?? ''
  const alunoId = sp.aluno
  const embed = sp.embed === '1'

  const access = await getCurrentAccess()
  if (!access.tenantId || !(access.isAdmin || access.permissions.includes('questoes:view'))) {
    return <div className="p-6 text-sm text-muted-foreground">Sem permissão.</div>
  }

  const svc = createAdminClient()
  const { data: cad } = await svc.from('simulado_cadernos_teste').select('nome, config').eq('id', cadernoId).eq('tenant_id', access.tenantId).maybeSingle()
  if (!cad) return <div className="p-6 text-sm text-muted-foreground">Caderno não encontrado.</div>

  const builder = normalizarBuilder((cad as any).config, (cad as any).nome)
  const item = builder.itens.find((i) => i.id === grupoId) ?? builder.itens.find((i) => i.id === builder.ativo) ?? builder.itens[0]
  if (!item) return <div className="p-6 text-sm text-muted-foreground">Grupo não encontrado.</div>

  const bancoId = builder.bancoId
  let vars: Record<string, string> = {}
  let disciplinas: DiscBanco[] = []
  let questoes: PreviewQuestao[] = []
  if (bancoId) {
    if (item.modalidade === 'diagnostico') {
      try {
        const rd = await dadosBancoTeste(bancoId)
        disciplinas = rd.disciplinas.map((d) => ({ nome: d.nome, chave: d.chave, pilar: d.pilar }))
        const reg = alunoId ? rd.registros.find((r) => r.id === alunoId) : rd.registros[0]
        if (reg) vars = reg.vars
      } catch { /* segue com o conteúdo do modelo */ }
    } else {
      try { const r = await previewQuestoesBanco(bancoId); questoes = r.questoes ?? [] } catch { /* sem questões */ }
    }
  }

  return <PreviewCadernoTeste item={item} questoes={questoes} vars={vars} discBanco={disciplinas} standalone={!embed} />
}
