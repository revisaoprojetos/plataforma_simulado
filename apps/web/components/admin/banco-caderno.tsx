import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { BancoCadernoClient } from '@/components/admin/banco-caderno-client'
import { mesclarModalidades } from '@/lib/caderno-designer/types'
import { materialDoConfig, type MaterialCaderno } from '@/lib/caderno-designer/material'
import { AlertTriangle } from 'lucide-react'

/** Modalidade (caderno interno) tem conteúdo se alguma página tem bloco além do plano-fundo. */
function temConteudo(d: any): boolean {
  return !!d && Array.isArray(d.pages) && d.pages.some((p: any) => (p.blocks ?? []).some((b: any) => b.type !== 'plano-fundo'))
}

export async function BancoCaderno({ bancoId, cor = '#6d28d9' }: { bancoId: string; cor?: string }) {
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()

  const { data: banco, error } = await svc
    .from('simulado_pastas')
    .select('caderno_id')
    .eq('id', bancoId)
    .eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000')
    .maybeSingle()
  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        Recurso indisponível: rode o SQL pendente (coluna <code>simulado_pastas.caderno_id</code>) no Supabase e recarregue.
      </div>
    )
  }

  // Personalização (cor/ícone/capa) — tolerante caso a migration ainda não tenha rodado.
  let cadernosRaw: any[] | null = null
  {
    const r = await svc
      .from('simulado_cadernos_designer')
      .select('id, nome, descricao, cor, icone, capa_url')
      .eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000')
      .order('nome')
    if (r.error && /cor|icone|capa_url|column/i.test(r.error.message)) {
      const r2 = await svc
        .from('simulado_cadernos_designer')
        .select('id, nome, descricao')
        .eq('tenant_id', tenantId ?? '00000000-0000-0000-0000-000000000000')
        .order('nome')
      cadernosRaw = r2.data
    } else cadernosRaw = r.data
  }
  const cadernos = (cadernosRaw ?? []).map((c: any) => ({
    id: c.id, nome: c.nome, descricao: c.descricao ?? null,
    cor: c.cor ?? null, icone: c.icone ?? null, capa: c.capa_url ?? null,
  }))

  // Modalidades internas (Objetivo / Completo / Diagnóstico…) do caderno associado,
  // considerando só as que têm conteúdo real.
  const cadernoAtualId = (banco?.caderno_id as string) ?? null
  let modalidades: { id: string; nome: string }[] = []
  let material: MaterialCaderno = { fonte: 'sistema', pdfUrl: '', pdfNome: '' }
  if (cadernoAtualId) {
    const { data: cad } = await svc.from('simulado_cadernos_designer').select('config').eq('id', cadernoAtualId).maybeSingle()
    const cfg = ((cad as any)?.config ?? {}) as any
    const docs = (cfg.docsV2 ?? {}) as Record<string, unknown>
    modalidades = mesclarModalidades(cfg.modalidadesV2)
      .filter((m) => temConteudo(docs[m.id]))
      .map((m) => ({ id: m.id, nome: m.nome }))
    material = materialDoConfig(cfg)
  }

  return <BancoCadernoClient bancoId={bancoId} cadernoAtualId={cadernoAtualId} cadernos={cadernos} modalidades={modalidades} material={material} cor={cor} />
}
