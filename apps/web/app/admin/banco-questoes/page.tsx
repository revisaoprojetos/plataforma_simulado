import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
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

  // Só pastas do CONTEXTO banco (exclui as pastas da Aplicação de Simulado, folder_area='simulado',
  // e as de Cadernos de Prova, folder_area='caderno'). Pastas legadas (folder_area null) permanecem
  // no Banco por compatibilidade.
  const folders = pastas.filter((p) => p.is_folder && p.folder_area !== 'simulado' && p.folder_area !== 'caderno')
  const bancosAll = pastas.filter((p) => !p.is_folder)
  const bancosPorPasta = new Map<string, number>()
  for (const b of bancosAll) if (b.pai_id) bancosPorPasta.set(b.pai_id, (bancosPorPasta.get(b.pai_id) ?? 0) + 1)
  // Subpastas por pasta (para o card mostrar "X pasta(s)").
  const subpastasPorPasta = new Map<string, number>()
  for (const f of folders) if (f.pai_id) subpastasPorPasta.set(f.pai_id, (subpastasPorPasta.get(f.pai_id) ?? 0) + 1)

  // Nível atual: dentro de uma pasta (?pasta=id) ou na raiz. Pastas ANINHAM (subpastas via pai_id):
  // no nível de uma pasta mostramos os bancos E as subpastas cujo pai é ela.
  const current = pastaParam ? folders.find((f) => f.id === pastaParam) ?? null : null
  const bancosNivel = current ? bancosAll.filter((b) => b.pai_id === current.id) : bancosAll.filter((b) => !b.pai_id)
  const foldersNivel = current ? folders.filter((f) => f.pai_id === current.id) : folders.filter((f) => !f.pai_id)

  // Trilha (breadcrumb) da raiz até a pasta atual, subindo por pai_id (com trava anti-ciclo).
  const folderById = new Map<string, any>(folders.map((f) => [f.id, f]))
  const trilha: { id: string; nome: string }[] = []
  {
    let node: any = current
    const visto = new Set<string>()
    while (node && !visto.has(node.id)) {
      visto.add(node.id)
      trilha.unshift({ id: node.id, nome: node.nome })
      node = node.pai_id ? folderById.get(node.pai_id) ?? null : null
    }
  }

  // Contagem de questões E de estudantes SÓ dos bancos deste nível (count exato por banco, em
  // paralelo). Evita paginar `simulado_pasta_estudantes` inteiro — pode ter centenas de milhares de
  // linhas em tenants com muitos alunos por banco.
  const idsNivel = bancosNivel.map((b) => b.id)
  const contarPorBanco = async (tabela: string) => {
    const m = new Map<string, number>()
    // Concorrência LIMITADA (12): muitos bancos no nível não estouram o pool do PgBouncer.
    const CONC = 12
    for (let i = 0; i < idsNivel.length; i += CONC) {
      await Promise.all(idsNivel.slice(i, i + CONC).map(async (id) => {
        const { count } = await svc.from(tabela).select('*', { count: 'exact', head: true }).eq('tenant_id', tid).eq('pasta_id', id)
        m.set(id, count ?? 0)
      }))
    }
    return m
  }
  const [contagem, contEstudantes] = await Promise.all([
    contarPorBanco('simulado_questao_pasta'),
    contarPorBanco('simulado_pasta_estudantes'),
  ])

  const capa = (b: any) => (b.capa_card_url ?? b.capa_url) ?? null
  const bancosOut = bancosNivel.map((b) => ({ id: b.id, nome: b.nome, total: contagem.get(b.id) ?? 0, estudantes: contEstudantes.get(b.id) ?? 0, cor: b.cor ?? null, icone: b.icone ?? null, capa: capa(b), tipo: b.tipo ?? null }))
  const foldersOut = foldersNivel.map((f) => ({ id: f.id, nome: f.nome, cor: f.cor ?? null, icone: f.icone ?? null, capa: capa(f), capaLarga: f.capa_url ?? null, count: bancosPorPasta.get(f.id) ?? 0, subpastas: subpastasPorPasta.get(f.id) ?? 0 }))
  // Destinos de "mover banco": todas as pastas, exceto a atual (não faz sentido mover p/ onde já está).
  const destinos = folders.filter((f) => f.id !== current?.id).map((f) => ({ id: f.id, nome: f.nome }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {current && (
              <Link href="/admin/banco-questoes" aria-label="Todas as pastas" title="Todas as pastas"
                className="inline-flex items-center justify-center rounded-lg border bg-card p-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-muted">
                <ChevronLeft className="h-4 w-4" />
              </Link>
            )}
            <h1 className="text-2xl font-bold tracking-tight">Banco de Simulado</h1>
          </div>
          <p className="text-muted-foreground">
            Monte e organize seus simulados: disciplinas/conteúdo, questões, estudantes e cadernos. Depois é só selecionar o banco pronto na Aplicação de Simulado.
          </p>
        </div>
        <NovoBancoForm pastaId={current?.id ?? null} />
      </div>

      <BancosGrid bancos={bancosOut} folders={foldersOut} destinos={destinos} atual={current ? { id: current.id, nome: current.nome } : null} trilha={trilha} />
    </div>
  )
}
