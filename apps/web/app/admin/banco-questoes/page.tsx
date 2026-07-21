import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { NovoBancoForm } from '@/components/admin/novo-banco-form'
import { BancosGrid } from '@/components/admin/bancos-grid'

// Sempre renderizar fresco — a lista precisa refletir criações/exclusões/movimentações na hora.
export const dynamic = 'force-dynamic'

export default async function BancoQuestoesPage({ searchParams }: { searchParams: Promise<{ pasta?: string }> }) {
  const { pasta: pastaParam } = await searchParams
  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()
  const tid = tenantId ?? '00000000-0000-0000-0000-000000000000'

  // Pastas: bancos (is_folder=false) + PASTAS-container (is_folder=true). Tolerante às colunas de
  // personalização (cor/ícone/capa) e às de pasta (pai_id/is_folder) — se faltar migration, o
  // recurso de pastas some, mas os bancos continuam listados normalmente.
  let pastas: any[] = []
  {
    const sel = (cols: string) => svc.from('simulado_pastas').select(cols).eq('deletado', false).eq('tenant_id', tid).order('nome')
    let r: { data: any[] | null; error: { message: string } | null } = await sel('id, nome, cor, icone, capa_url, capa_card_url, tipo, pai_id, is_folder, folder_area')
    if (r.error && /folder_area/i.test(r.error.message)) r = await sel('id, nome, cor, icone, capa_url, capa_card_url, tipo, pai_id, is_folder')
    if (r.error && /pai_id|is_folder/i.test(r.error.message)) r = await sel('id, nome, cor, icone, capa_url, capa_card_url, tipo')
    if (r.error && /cor|icone|capa_url|capa_card_url|tipo|column/i.test(r.error.message)) r = await sel('id, nome')
    pastas = (r.data ?? []).map((b: any) => ({ ...b, pai_id: b.pai_id ?? null, is_folder: b.is_folder ?? false, folder_area: b.folder_area ?? null }))
  }

  // Contagem de questões E de estudantes por banco — paginado (fetchAll) para não truncar em
  // 1000 (teto do PostgREST) e contar errado em bancos/tenants grandes.
  const [vinculos, estudantes] = await Promise.all([
    fetchAll<any>(() => svc.from('simulado_questao_pasta').select('pasta_id').eq('tenant_id', tid).order('pasta_id', { ascending: true })),
    fetchAll<any>(() => svc.from('simulado_pasta_estudantes').select('pasta_id').eq('tenant_id', tid).order('pasta_id', { ascending: true })),
  ])
  const contagem = new Map<string, number>()
  for (const v of vinculos) contagem.set(v.pasta_id, (contagem.get(v.pasta_id) ?? 0) + 1)
  const contEstudantes = new Map<string, number>()
  for (const e of estudantes) contEstudantes.set(e.pasta_id, (contEstudantes.get(e.pasta_id) ?? 0) + 1)

  // Só pastas do CONTEXTO banco (exclui as pastas da Aplicação de Simulado, folder_area='simulado').
  const folders = pastas.filter((p) => p.is_folder && p.folder_area !== 'simulado')
  const bancosAll = pastas.filter((p) => !p.is_folder)
  const bancosPorPasta = new Map<string, number>()
  for (const b of bancosAll) if (b.pai_id) bancosPorPasta.set(b.pai_id, (bancosPorPasta.get(b.pai_id) ?? 0) + 1)

  // Nível atual: dentro de uma pasta (?pasta=id) ou na raiz. Pastas são de nível único (raiz).
  const current = pastaParam ? folders.find((f) => f.id === pastaParam) ?? null : null
  const bancosNivel = current ? bancosAll.filter((b) => b.pai_id === current.id) : bancosAll.filter((b) => !b.pai_id)
  const foldersNivel = current ? [] : folders.filter((f) => !f.pai_id)

  const capa = (b: any) => (b.capa_card_url ?? b.capa_url) ?? null
  const bancosOut = bancosNivel.map((b) => ({ id: b.id, nome: b.nome, total: contagem.get(b.id) ?? 0, estudantes: contEstudantes.get(b.id) ?? 0, cor: b.cor ?? null, icone: b.icone ?? null, capa: capa(b), tipo: b.tipo ?? null }))
  const foldersOut = foldersNivel.map((f) => ({ id: f.id, nome: f.nome, cor: f.cor ?? null, icone: f.icone ?? null, capa: capa(f), count: bancosPorPasta.get(f.id) ?? 0 }))
  const destinos = folders.map((f) => ({ id: f.id, nome: f.nome }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Banco de Simulado</h1>
          <p className="text-muted-foreground">
            Monte e organize seus simulados: disciplinas/conteúdo, questões, estudantes e cadernos. Depois é só selecionar o banco pronto na Aplicação de Simulado.
          </p>
        </div>
        <NovoBancoForm pastaId={current?.id ?? null} />
      </div>

      <BancosGrid bancos={bancosOut} folders={foldersOut} destinos={destinos} atual={current ? { id: current.id, nome: current.nome } : null} />
    </div>
  )
}
