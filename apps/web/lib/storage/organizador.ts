import type { SupabaseClient } from '@supabase/supabase-js'
import { descobrirBuckets, bfsBucket } from './listar-buckets'
import { construirMapaReferencias, estaReferenciado } from './referencias'
import { pathCanonico } from './canonico'
import { getStorage } from './index'
import { backupObjeto, registrarBackup, garantirBucketBackup, prefixoData } from './backup'

// Organizador SEGURO do storage. Três operações:
//  - analisar: dry-run read-only, classifica cada objeto (OK / MISPLACED / ORPHAN).
//  - aplicarMigracao: COPIA → reescreve referências (backup antes) → verifica via list →
//    só então apaga o original (com backup dos bytes). Nunca move "às cegas".
//  - limparOrfaos: apaga não-referenciados (backup antes). Gated no chamador.
//
// Regras de segurança (aprendidas em auditorias): verificar existência por .list()
// (NUNCA HEAD, que o CDN cacheia), reescrever a URL INTEIRA (não o basename), e fazer
// backup dos bytes + do JSON de URLs-antes antes de qualquer deleção.

export type StatusObjeto = 'OK' | 'MISPLACED' | 'ORPHAN'

export interface ItemOrganizacao {
  bucket: string
  path: string
  destino: string | null
  size: number
  referenciado: boolean
  status: StatusObjeto
}
export interface RelatorioOrganizador {
  itens: ItemOrganizacao[]
  resumo: { OK: number; MISPLACED: number; ORPHAN: number; totalBytesOrfaos: number }
}

/** Índice bucket|path → catalogId (para checar órfão de discursiva por FK). */
async function catalogoIndex(svc: SupabaseClient): Promise<Map<string, string>> {
  const idx = new Map<string, string>()
  let off = 0
  while (true) {
    const { data, error } = await svc.from('simulado_arquivos').select('id,bucket,path').range(off, off + 999)
    if (error || !Array.isArray(data) || data.length === 0) break
    for (const r of data as any[]) idx.set(`${r.bucket}|${r.path}`, r.id)
    if (data.length < 1000) break
    off += 1000
  }
  return idx
}

export async function analisarOrganizacao(svc: SupabaseClient): Promise<RelatorioOrganizador> {
  const buckets = await descobrirBuckets(svc)
  const mapa = await construirMapaReferencias(svc)
  const idx = await catalogoIndex(svc)
  const itens: ItemOrganizacao[] = []

  for (const b of buckets) {
    for (const o of await bfsBucket(svc, b.nome)) {
      const destino = pathCanonico({ bucket: b.nome, pathAtual: o.path })
      const catalogId = idx.get(`${b.nome}|${o.path}`) ?? null
      const referenciado = estaReferenciado(mapa, { bucket: b.nome, path: o.path, catalogId })
      let status: StatusObjeto
      if (destino && destino !== o.path) status = 'MISPLACED'
      else if (!referenciado) status = 'ORPHAN'
      else status = 'OK'
      itens.push({ bucket: b.nome, path: o.path, destino, size: o.size, referenciado, status })
    }
  }

  const resumo = {
    OK: itens.filter((i) => i.status === 'OK').length,
    MISPLACED: itens.filter((i) => i.status === 'MISPLACED').length,
    ORPHAN: itens.filter((i) => i.status === 'ORPHAN').length,
    totalBytesOrfaos: itens.filter((i) => i.status === 'ORPHAN').reduce((s, i) => s + i.size, 0),
  }
  return { itens, resumo }
}

// Tabelas/colunas que guardam URLs de storage (texto e jsonb) — para reescrever refs.
const REF_TABELAS: { tabela: string; texto: string[]; jsonb: string[] }[] = [
  { tabela: 'simulado_questoes', texto: ['imagem_url', 'enunciado', 'comentario_professor'], jsonb: [] },
  { tabela: 'simulado_cadernos_designer', texto: ['capa_url'], jsonb: ['config'] },
  { tabela: 'simulado_tenants', texto: [], jsonb: ['tema'] },
  { tabela: 'simulado_pastas', texto: ['capa_url', 'capa_card_url'], jsonb: ['caderno_entrega'] },
  { tabela: 'simulado_banners', texto: ['imagem_url'], jsonb: [] },
  { tabela: 'simulado_pdf_jobs', texto: ['arquivo_path', 'arquivo_url'], jsonb: [] },
]

interface RefAntes { tabela: string; id: string; coluna: string; valor: unknown }

/** Reescreve a URL INTEIRA (urlAntes→urlDepois) em todas as colunas conhecidas. Guarda os valores-antes. */
async function reescreverRefs(svc: SupabaseClient, urlAntes: string, urlDepois: string, before: RefAntes[]): Promise<number> {
  let alteradas = 0
  for (const cfg of REF_TABELAS) {
    const cols = ['id', ...cfg.texto, ...cfg.jsonb].join(',')
    let off = 0
    while (true) {
      const { data, error } = await svc.from(cfg.tabela).select(cols).range(off, off + 999)
      if (error || !Array.isArray(data) || data.length === 0) break
      for (const row of data as any[]) {
        const patch: Record<string, unknown> = {}
        for (const c of cfg.texto) {
          const v = row[c]
          if (typeof v === 'string' && v.includes(urlAntes)) {
            before.push({ tabela: cfg.tabela, id: row.id, coluna: c, valor: v })
            patch[c] = v.split(urlAntes).join(urlDepois)
          }
        }
        for (const c of cfg.jsonb) {
          const s = JSON.stringify(row[c] ?? null)
          if (s.includes(urlAntes)) {
            before.push({ tabela: cfg.tabela, id: row.id, coluna: c, valor: row[c] })
            try {
              patch[c] = JSON.parse(s.split(urlAntes).join(urlDepois))
            } catch {
              // parse falhou → NÃO aplica esta coluna (nunca grava jsonb corrompido)
            }
          }
        }
        if (Object.keys(patch).length) {
          const { error: upErr } = await svc.from(cfg.tabela).update(patch).eq('id', row.id)
          if (!upErr) alteradas++
        }
      }
      if (data.length < 1000) break
      off += 1000
    }
  }
  return alteradas
}

/** Verifica (via LIST, nunca HEAD) que o objeto existe no destino. */
async function existeNoStorage(svc: SupabaseClient, bucket: string, path: string): Promise<boolean> {
  const barra = path.lastIndexOf('/')
  const dir = barra >= 0 ? path.slice(0, barra) : ''
  const base = barra >= 0 ? path.slice(barra + 1) : path
  const { data } = await svc.storage.from(bucket).list(dir, { search: base, limit: 100 })
  return Array.isArray(data) && data.some((f: any) => f.name === base)
}

export interface ResultadoMigracao { migrados: number; falhas: { path: string; motivo: string }[]; backupId: string | null }

/**
 * Aplica a migração dos MISPLACED: por item, copy → backup do original → reescreve refs
 * (públicas) ou o campo `arquivos` (discursivas) → atualiza catálogo → verifica destino →
 * só então deleta o original. Reversível pelo backup (JSON de URLs-antes + bytes).
 */
export async function aplicarMigracao(
  svc: SupabaseClient,
  itens: { bucket: string; de: string; para: string }[],
  userId: string | null,
): Promise<ResultadoMigracao> {
  const falhas: { path: string; motivo: string }[] = []
  const before: RefAntes[] = []
  const originaisApagados: string[] = []
  await garantirBucketBackup(svc)
  const prefixo = prefixoData()
  const storage = getStorage()
  let migrados = 0

  for (const it of itens) {
    try {
      // 1) copy (idempotente: "exists" = ok)
      const { error: cpErr } = await svc.storage.from(it.bucket).copy(it.de, it.para)
      if (cpErr && !/exist/i.test(cpErr.message)) { falhas.push({ path: it.de, motivo: `copy: ${cpErr.message}` }); continue }

      // 2) backup dos bytes do original
      const bkp = await backupObjeto(svc, it.bucket, it.de, prefixo)
      if (!bkp) { falhas.push({ path: it.de, motivo: 'falha no backup' }); continue }

      // 3) reescreve referências
      if (it.bucket === 'discursivas') {
        // discursivas são servidas por URL assinada (path); só o campo `arquivos` guarda o path.
        await reescreverArquivosDiscursivas(svc, it.de, it.para, before)
      } else {
        const urlAntes = storage.getPublicUrl(it.bucket, it.de)
        const urlDepois = storage.getPublicUrl(it.bucket, it.para)
        await reescreverRefs(svc, urlAntes, urlDepois, before)
      }
      // catálogo: path antigo → novo
      await svc.from('simulado_arquivos').update({ path: it.para, nome: it.para.split('/').pop() }).eq('bucket', it.bucket).eq('path', it.de)

      // 4) verifica destino via LIST (nunca HEAD)
      if (!(await existeNoStorage(svc, it.bucket, it.para))) { falhas.push({ path: it.de, motivo: 'destino não confirmado' }); continue }

      // 5) só então apaga o original
      await storage.remove(it.bucket, it.de)
      originaisApagados.push(`${it.bucket}/${it.de}`)
      migrados++
    } catch (e) {
      falhas.push({ path: it.de, motivo: e instanceof Error ? e.message : 'erro' })
    }
  }

  const backupId = await registrarBackup(svc, 'migracao', { prefixo, urlsAntes: before, originaisApagados }, userId)
  return { migrados, falhas, backupId }
}

/** Substitui o path `de`→`para` no campo `arquivos` das respostas discursivas. */
async function reescreverArquivosDiscursivas(svc: SupabaseClient, de: string, para: string, before: RefAntes[]): Promise<void> {
  let off = 0
  while (true) {
    const { data, error } = await svc.from('simulado_respostas_discursivas').select('id,arquivos').range(off, off + 999)
    if (error || !Array.isArray(data) || data.length === 0) break
    for (const row of data as any[]) {
      const s = JSON.stringify(row.arquivos ?? null)
      if (s.includes(de)) {
        before.push({ tabela: 'simulado_respostas_discursivas', id: row.id, coluna: 'arquivos', valor: row.arquivos })
        try {
          await svc.from('simulado_respostas_discursivas').update({ arquivos: JSON.parse(s.split(de).join(para)) }).eq('id', row.id)
        } catch { /* jsonb inválido → ignora */ }
      }
    }
    if (data.length < 1000) break
    off += 1000
  }
}
