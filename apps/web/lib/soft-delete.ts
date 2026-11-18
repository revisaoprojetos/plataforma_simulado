import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess } from '@/lib/auth/permissions'

// Entidades núcleo com soft delete (Lixeira). Ligações e matriculas seguem hard delete.
export const SOFT_DELETE_TABELAS = [
  'simulado_questoes',
  'simulado_simulados',
  'simulado_estudantes',
  'simulado_grupos',
  'simulado_pastas',
  'simulado_cadernos_designer',
  'simulado_etiquetas',
  'simulado_sessoes_prova',
  // Documento da Biblioteca (conteúdo): o soft-delete vem de removerDocumento (biblioteca/actions.ts),
  // que seta deletado/deletado_em/deletado_por. Entra na Lixeira e no cron de purge 30d (storage incluso).
  'simulado_conteudo_documentos',
  // Estúdio de Conteúdo (áreas novas): baralhos de flashcards e trilhas são entidades top-level
  // soft-deletáveis (deletado/deletado_em/deletado_por). Entram na Lixeira e no cron de purge 30d.
  'simulado_flashcard_baralhos',
  'simulado_trilhas',
] as const
export type SoftDeleteTabela = (typeof SOFT_DELETE_TABELAS)[number]

function permitida(t: string): t is SoftDeleteTabela {
  return (SOFT_DELETE_TABELAS as readonly string[]).includes(t)
}

/**
 * Soft delete: marca deletado=true (esconde das telas, mantém no banco/Lixeira).
 * Roda server-side com service-role; grava deletado_por = admin logado e filtra por tenant.
 */
export async function softDelete(
  tabela: SoftDeleteTabela,
  ids: string | string[],
): Promise<{ error: Error | null; count: number; bloqueadas?: { id: string; motivo: string }[]; mensagem?: string }> {
  let arr = (Array.isArray(ids) ? ids : [ids]).filter(Boolean)
  if (!permitida(tabela)) return { error: new Error(`Tabela não permitida: ${tabela}`), count: 0 }
  if (!arr.length) return { error: null, count: 0 }
  const access = await getCurrentAccess()
  if (!access.userId) return { error: new Error('Sem sessão.'), count: 0 }

  const svc = createAdminClient()

  // TRAVA CENTRAL (questões e bancos): recusa o que tem vínculo (respostas/simulados/documentos/cronograma/
  // cadernos…). Processa só as livres; devolve as bloqueadas com o motivo. Falha FECHADO se não der p/ verificar.
  let bloqueadas: { id: string; motivo: string }[] | undefined
  let mensagem: string | undefined
  if (tabela === 'simulado_questoes' || tabela === 'simulado_pastas') {
    try {
      const { bloquearSeTemVinculos, dependenciasBanco } = await import('@/lib/questoes/dependencias-questao')
      if (tabela === 'simulado_questoes') {
        const r = await bloquearSeTemVinculos(svc, access.tenantId ?? null, arr)
        if (r.bloqueadas.length) {
          bloqueadas = r.bloqueadas.map((b) => ({ id: b.id, motivo: b.motivo }))
          mensagem = r.mensagem
          arr = r.livres
        }
      } else {
        const livres: string[] = []
        const msgs: string[] = []
        for (const id of arr) {
          const d = await dependenciasBanco(svc, access.tenantId ?? null, id)
          if (d.emUso) { (bloqueadas ??= []).push({ id, motivo: d.mensagem }); msgs.push(d.mensagem) } else livres.push(id)
        }
        if (bloqueadas) { mensagem = msgs.slice(0, 3).join(' ') + (msgs.length > 3 ? ` (+${msgs.length - 3} outros)` : ''); arr = livres }
      }
    } catch (e) {
      return { error: new Error(`Exclusão recusada: não foi possível verificar os vínculos (${(e as Error).message}). Nada foi apagado.`), count: 0 }
    }
    if (!arr.length) return { error: new Error(mensagem ?? 'Exclusão recusada: itens em uso.'), count: 0, bloqueadas, mensagem }
  }

  // TRAVA CENTRAL (documentos da Biblioteca): vínculos ou "em uso" por plano ativo ⇒ recusa. Falha fechado.
  if (tabela === 'simulado_conteudo_documentos' && access.tenantId) {
    try {
      const { bloquearSeTemVinculos } = await import('@/lib/conteudo/dependencias-documento')
      const r = await bloquearSeTemVinculos(svc, access.tenantId, arr.map((id) => ({ id })))
      if (r.bloqueados.length) {
        bloqueadas = r.bloqueados.map((b) => ({ id: b.id, motivo: b.motivo }))
        mensagem = r.bloqueados[0].motivo + (r.bloqueados.length > 1 ? ` (+${r.bloqueados.length - 1} outros)` : '')
        arr = r.livres.map((l) => l.id)
      }
    } catch (e) {
      return { error: new Error(`Exclusão recusada: não foi possível verificar os vínculos (${(e as Error).message}). Nada foi apagado.`), count: 0 }
    }
    if (!arr.length) return { error: new Error(mensagem ?? 'Exclusão recusada: documentos com vínculos.'), count: 0, bloqueadas, mensagem }
  }

  const deletadoEm = new Date().toISOString()
  // UPDATE em lotes de 200: um `.in('id', arr)` com 1000+ ids gera URL gigante que o
  // proxy do Supabase pendura (~180s). fetchAllByIn é só p/ SELECT; aqui fatiamos à mão.
  let primeiroErro: Error | null = null
  let count = 0
  for (let i = 0; i < arr.length; i += 200) {
    const loteChunk = arr.slice(i, i + 200)
    let q = svc
      .from(tabela)
      .update({ deletado: true, deletado_em: deletadoEm, deletado_por: access.userId })
      .in('id', loteChunk)
      .eq('deletado', false)
    if (access.tenantId) q = q.eq('tenant_id', access.tenantId)
    const { data, error } = await q.select('id')
    if (error && !primeiroErro) primeiroErro = error as Error
    count += data?.length ?? 0
  }
  return { error: primeiroErro, count, bloqueadas, mensagem }
}

/** Restaura (deletado=false). O trigger limpa deletado_em/por. */
export async function softRestore(tabela: SoftDeleteTabela, id: string) {
  if (!permitida(tabela)) return { error: new Error(`Tabela não permitida: ${tabela}`) }
  const access = await getCurrentAccess()
  if (!access.userId) return { error: new Error('Sem sessão.') }
  const svc = createAdminClient()
  // Limpa o carimbo explicitamente: nas 8 tabelas núcleo o trigger já zera em/por ao restaurar,
  // mas simulado_conteudo_documentos não tem esse trigger — aqui garante o reset nos dois casos.
  let q = svc.from(tabela).update({ deletado: false, deletado_em: null, deletado_por: null }).eq('id', id).eq('deletado', true)
  if (access.tenantId) q = q.eq('tenant_id', access.tenantId)
  const { error } = await q
  return { error: (error as Error) ?? null }
}
