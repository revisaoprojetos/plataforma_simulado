import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'
import type { ItemCaderno } from '@/lib/caderno-teste/tipos'
import { PreviewCadernoTeste } from '@/app/imprimir/caderno-teste/[id]/preview-caderno-teste'

export const dynamic = 'force-dynamic'

const semPermissao = (msg = 'Sem permissão.') => <div className="p-6 text-sm text-muted-foreground">{msg}</div>

/**
 * Impressão FIEL de um MODELO de caderno (área Modelos de Caderno, tabela simulado_caderno_modelos).
 * Renderiza o MESMO componente da prévia/editor (PreviaBlocos/Previa via PreviewCadernoTeste), então o
 * PDF ("Imprimir / Salvar como PDF") bate 1:1 com a prévia — honra docEdit e blocos livres. Sem banco:
 * questões vazias (é um template), igual à prévia dos modelos. Acesso: admin/questoes:view do tenant.
 */
export default async function ImprimirModeloPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ auto?: string; word?: string }> }) {
  const { id } = await params
  const { auto, word } = await searchParams

  const access = await getCurrentAccess()
  if (!access.tenantId || !(access.isAdmin || access.permissions.includes('questoes:view'))) return semPermissao()

  const svc = createAdminClient()
  const { data: mod } = await svc.from('simulado_caderno_modelos').select('nome, config').eq('id', id).eq('tenant_id', access.tenantId).eq('deletado', false).maybeSingle()
  if (!mod) return semPermissao('Modelo não encontrado.')

  const item = ((mod as any).config?.item ?? null) as ItemCaderno | null
  if (!item || !item.modalidade) return semPermissao('Modelo sem conteúdo.')
  const nomeArq = ((mod as any).nome || item.ajustes?.titulo || 'caderno') as string

  return <PreviewCadernoTeste item={item} questoes={[]} vars={{}} discBanco={[]} standalone auto={auto === '1'} baixarWord={word === '1'} nomeArq={nomeArq} />
}
