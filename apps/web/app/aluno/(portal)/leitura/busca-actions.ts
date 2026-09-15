'use server'

import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'
import { documentosDoAluno } from '@/lib/leitura/acesso'

export interface ResultadoBuscaTrilha {
  docId: string
  titulo: string
  ocorrencias: number
  trecho: string
}

// Normaliza p/ busca: minúsculo + sem acentos (case/acento-insensível).
const norm = (s: string) => (s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
// HTML → texto puro (tira tags e entidades comuns, colapsa espaço).
const htmlParaTexto = (html: string) =>
  (html ?? '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Busca por artigo/palavra nas aulas do MÓDULO (só as que o aluno pode ver). Retorna, por aula, o nº de
 * ocorrências e um trecho de contexto. O clique abre `/aluno/leitura/<docId>?busca=<termo>` (o leitor
 * abre a busca interna já no ponto). O gate rígido continua no leitor (aula bloqueada volta à trilha).
 */
export async function buscarNaTrilha(moduloId: string, termo: string): Promise<{ ok: boolean; resultados: ResultadoBuscaTrilha[]; error?: string }> {
  const t = (termo ?? '').trim()
  if (t.length < 2) return { ok: true, resultados: [] }
  const sessao = await getSessaoAluno()
  if (!sessao) return { ok: false, resultados: [], error: 'Sessão expirada.' }

  // Aulas visíveis do aluno (acesso já aplicado) filtradas pelo módulo aberto.
  const docs = (await documentosDoAluno(sessao.estudanteId, sessao.tenantId, { leve: true }))
    .filter((d) => (d.pastaId ?? '__geral__') === moduloId)
  if (!docs.length) return { ok: true, resultados: [] }

  const svc = createAdminClient()
  const ids = docs.map((d) => d.id)
  // Versão publicada vigente de cada aula + o HTML dessa versão.
  const { data: metas } = await svc.from('simulado_documentos').select('id, versao, versao_publicada').in('id', ids)
  const versaoDe = new Map<string, number>((metas ?? []).map((m: any) => [m.id, m.versao_publicada ?? m.versao ?? 1]))
  const { data: conts } = await svc.from('simulado_documento_conteudos').select('documento_id, versao, html').in('documento_id', ids)
  const htmlDe = new Map<string, string>()
  for (const c of (conts ?? []) as any[]) if (c.versao === versaoDe.get(c.documento_id)) htmlDe.set(c.documento_id, c.html ?? '')

  const termoNorm = norm(t)
  const resultados: ResultadoBuscaTrilha[] = []
  for (const d of docs) {
    const texto = htmlParaTexto(htmlDe.get(d.id) ?? '')
    if (!texto) continue
    const textoNorm = norm(texto)
    let idx = textoNorm.indexOf(termoNorm)
    if (idx < 0) continue
    // Conta ocorrências.
    let ocorrencias = 0, from = 0
    while ((from = textoNorm.indexOf(termoNorm, from)) >= 0) { ocorrencias++; from += termoNorm.length }
    // Trecho de contexto ao redor do 1º match (usa o texto ORIGINAL — índices batem: norm preserva o comprimento).
    const ini = Math.max(0, idx - 45)
    const fim = Math.min(texto.length, idx + termoNorm.length + 60)
    const trecho = (ini > 0 ? '…' : '') + texto.slice(ini, fim).trim() + (fim < texto.length ? '…' : '')
    resultados.push({ docId: d.id, titulo: d.titulo, ocorrencias, trecho })
  }
  // Mais ocorrências primeiro.
  resultados.sort((a, b) => b.ocorrencias - a.ocorrencias)
  return { ok: true, resultados }
}
