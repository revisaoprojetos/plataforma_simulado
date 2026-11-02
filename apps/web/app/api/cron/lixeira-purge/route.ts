import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getStorage } from '@/lib/storage'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { registrarAudit } from '@/lib/audit'
import { SOFT_DELETE_TABELAS } from '@/lib/soft-delete'
import { resolverBucketConteudo } from '@/lib/conteudo/ingestao'

export const dynamic = 'force-dynamic'

/**
 * PURGE da Lixeira: apaga DEFINITIVAMENTE os registros soft-deletados
 * (`deletado = true`) cujo `deletado_em` já passou da janela de retenção.
 *
 * - Retenção configurável por env `LIXEIRA_PURGE_DIAS` (default 30). O prazo de
 *   30 dias é o default do plano; a coordenação pode ajustar sem redeploy.
 * - Varre todas as tabelas de `SOFT_DELETE_TABELAS`. Para tabelas de
 *   documentos/arquivos (hoje `simulado_conteudo_documentos`), remove também os
 *   objetos de Storage das versões (`arquivo_key`) ANTES de perder a referência.
 * - Isolamento por tenant: `?tenant=<id>` limita a um tenant; sem ele purga
 *   todos (service-role bypassa RLS → o filtro é manual via `tenant_id`).
 * - Idempotente (só toca em `deletado=true` já vencido) e tolerante a coluna
 *   ausente (`/column/` → pula a tabela).
 * - Auditado via `registrarAudit` (operacao DELETE), uma linha-resumo por tabela.
 *
 * Como é DESTRUTIVO, roda em **dry-run por padrão** (só reporta o que seria
 * apagado). Passe `?aplicar=1` para efetivar. Protegido por CRON_SECRET.
 * Agendamento: `apps/worker/src/main.ts` chama `?aplicar=1` 1x/dia.
 */
function autorizado(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET
  if (!segredo) return false
  const h = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return h === segredo
}

// Tabelas cujos registros têm arquivos no Storage que precisam ser removidos no purge.
const TABELAS_COM_STORAGE = new Set<string>(['simulado_conteudo_documentos'])

type ResultadoTabela = {
  tabela: string
  purgados: number
  storageRemovidos?: number
  pulada?: boolean
  erro?: string
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ message: 'Não autorizado.' }, { status: 401 })

  const svc = createAdminClient()
  const sp = new URL(req.url).searchParams
  const alvo = sp.get('tenant')
  const aplicar = sp.get('aplicar') === '1'

  const dias = Math.max(0, Number(process.env.LIXEIRA_PURGE_DIAS ?? 30) || 30)
  const cutoff = new Date(Date.now() - dias * 86_400_000).toISOString()

  const resultados: ResultadoTabela[] = []

  for (const tabela of SOFT_DELETE_TABELAS) {
    const res: ResultadoTabela = { tabela, purgados: 0 }
    try {
      // 1. Coleta os ids vencidos (deletado=true e deletado_em < cutoff). Ordena por id
      //    (coluna única) p/ paginação estável do fetchAll.
      const rows = await fetchAll<{ id: string }>(
        () => {
          let q = svc.from(tabela).select('id').eq('deletado', true).lt('deletado_em', cutoff).order('id', { ascending: true })
          if (alvo) q = q.eq('tenant_id', alvo)
          return q
        },
        1000,
        `lixeira-purge:${tabela}`,
      )
      const ids = rows.map((r) => r.id)

      // 2. Storage: mapeia arquivo_key por documento ANTES de deletar (as versões
      //    somem em cascata com o documento). Removemos só dos que forem deletados.
      let keysPorDoc: Map<string, string[]> | null = null
      let bucket = ''
      if (TABELAS_COM_STORAGE.has(tabela) && ids.length) {
        bucket = await resolverBucketConteudo()
        const versoes = await fetchAllByIn<{ documento_id: string; arquivo_key: string | null }>(
          ids,
          (chunk) => svc.from('simulado_conteudo_versoes').select('id, documento_id, arquivo_key').in('documento_id', chunk).order('id', { ascending: true }),
          { chunk: 80, rotulo: 'lixeira-purge:versoes' },
        )
        keysPorDoc = new Map()
        for (const v of versoes) {
          if (!v.arquivo_key) continue
          const arr = keysPorDoc.get(v.documento_id) ?? []
          arr.push(v.arquivo_key)
          keysPorDoc.set(v.documento_id, arr)
        }
        res.storageRemovidos = 0
      }

      // DRY-RUN: só reporta o que seria apagado (nenhuma escrita/remoção).
      if (!aplicar) {
        res.purgados = ids.length
        if (keysPorDoc) res.storageRemovidos = [...keysPorDoc.values()].reduce((s, a) => s + a.length, 0)
        resultados.push(res)
        continue
      }

      if (!ids.length) {
        resultados.push(res)
        continue
      }

      // 3. Hard delete em lotes de 200 (evita URL gigante no .in). Guarda os ids
      //    realmente apagados p/ remover o Storage só deles. FK RESTRICT (vínculos
      //    pendentes) não derruba o job: registra o 1º erro e segue.
      const deletados: string[] = []
      let primeiroErro: string | null = null
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200)
        let dq = svc.from(tabela).delete().in('id', chunk).eq('deletado', true)
        if (alvo) dq = dq.eq('tenant_id', alvo)
        const { data, error } = await dq.select('id')
        if (error && !primeiroErro) primeiroErro = error.message
        for (const r of (data ?? []) as { id: string }[]) deletados.push(r.id)
      }
      res.purgados = deletados.length
      if (primeiroErro) res.erro = primeiroErro

      // 4. Remove os objetos de Storage dos documentos efetivamente apagados.
      if (keysPorDoc && deletados.length) {
        const storage = getStorage()
        let removidos = 0
        for (const docId of deletados) {
          for (const key of keysPorDoc.get(docId) ?? []) {
            try {
              await storage.remove(bucket, key)
              removidos++
            } catch (e) {
              // best-effort: um objeto já ausente não deve travar o purge.
              console.error('[lixeira-purge] storage.remove falhou', bucket, key, (e as Error).message)
            }
          }
        }
        res.storageRemovidos = removidos
      }

      // 5. Auditoria: uma linha-resumo por tabela quando algo foi apagado.
      if (res.purgados) {
        await registrarAudit({
          operacao: 'DELETE',
          entidade: tabela,
          atorTipo: 'sistema',
          tenantId: alvo ?? null,
          depois: { purge_lixeira: true, purgados: res.purgados, storageRemovidos: res.storageRemovidos ?? 0, cutoff, dias },
        })
      }
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e)
      // Tolerante a coluna ausente (ex.: tabela sem deletado_em ainda).
      if (/column/.test(msg)) {
        res.pulada = true
      } else {
        res.erro = msg
        console.error('[lixeira-purge] tabela', tabela, msg)
      }
      resultados.push(res)
      continue
    }
    resultados.push(res)
  }

  const totalPurgados = resultados.reduce((s, r) => s + r.purgados, 0)
  const totalStorage = resultados.reduce((s, r) => s + (r.storageRemovidos ?? 0), 0)
  return NextResponse.json({ ok: true, dry: !aplicar, dias, cutoff, tenant: alvo ?? 'todos', totalPurgados, totalStorage, resultados })
}
