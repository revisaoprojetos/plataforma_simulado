import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { SimuladoWizard } from '@/components/admin/simulado-wizard'
import { createSimuladoAction, listarDisciplinasWizard } from '../actions'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export default async function NovoSimuladoPage() {
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()
  const tid = tenantId ?? '00000000-0000-0000-0000-000000000000'

  // Carregamento LEVE: só as disciplinas (filtro) e a LISTA de bancos (sem fotos, sem contagens).
  // As contagens de questões/estudantes por banco são buscadas SOB DEMANDA por página no wizard
  // (contarBancosWizard) — antes pré-carregávamos TODOS os vínculos questão-banco e banco-estudante
  // (dezenas de milhares de linhas), o que fazia a tela levar >1min para abrir.
  const disciplinas = await listarDisciplinasWizard()

  // Pastas do tenant (bancos is_folder=false + PASTAS is_folder=true) — tolerante às colunas ausentes.
  let all: any[] = []
  {
    const sel = (cols: string) => svc.from('simulado_pastas').select(cols).eq('deletado', false).eq('tenant_id', tid)
    let r = await sel('id, nome, cor, icone, tipo, is_folder, folder_area, pai_id, created_at')
    if (r.error && /created_at|pai_id|tipo|is_folder|folder_area|column/i.test(r.error.message)) r = await sel('id, nome, cor, icone, is_folder, pai_id')
    if (r.error) r = await sel('id, nome, cor, icone')
    all = r.data ?? []
  }
  const daArea = (b: any) => b.folder_area !== 'simulado' && b.folder_area !== 'caderno'
  const bancosRows = all.filter((b: any) => !b.is_folder && daArea(b))
  // Mapa de pastas (is_folder) p/ montar o CAMINHO de cada banco (pai → pai → …).
  const folderMap = new Map(all.filter((b: any) => b.is_folder && daArea(b)).map((f: any) => [f.id, { nome: f.nome as string, pai: (f.pai_id ?? null) as string | null }]))
  const caminho = (paiId: string | null): string | null => {
    const parts: string[] = []; const seen = new Set<string>(); let cur = paiId
    while (cur && folderMap.has(cur) && !seen.has(cur)) { seen.add(cur); const f = folderMap.get(cur)!; parts.unshift(f.nome); cur = f.pai }
    return parts.length ? parts.join(' / ') : null
  }

  const bancosDetalhe = bancosRows.map((b: any) => ({
    id: b.id, nome: b.nome, cor: b.cor ?? null, icone: b.icone ?? null, tipo: b.tipo ?? 'objetiva',
    pasta: caminho(b.pai_id ?? null), created_at: (b.created_at ?? null) as string | null,
  }))

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/simulados" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Voltar para Simulados
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Novo Simulado</h1>
      </div>

      <SimuladoWizard bancos={bancosDetalhe} disciplinas={disciplinas} onSubmit={createSimuladoAction} />
    </div>
  )
}
