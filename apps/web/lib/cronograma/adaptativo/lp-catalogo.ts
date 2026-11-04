import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { remember } from '@/lib/cache/relatorio-cache'
import type { ItemLP } from './motor28'

/**
 * CATÁLOGO DE LEGPROC 2.8 a partir dos documentos de lei da Biblioteca (subpastas "LegProc" das
 * disciplinas). Cada documento = uma LEI vinculada à DISCIPLINA da pasta. A lei é dividida em METAS de
 * ~30 min de leitura, cortadas SEMPRE no início de um artigo (trechos do tipo "artigo" da ingestão),
 * com a orientação "Lei X — arts. 1º a 15". Doc sem artigos → partes por volume de texto. Doc sem
 * trechos → 1 meta de leitura.
 *
 * Calibragem: 12.000 caracteres ≈ 30 min (≈ 400 car./min de leitura atenta de lei) → ~660 metas no
 * acervo atual, na ordem de grandeza das 622 metas do catálogo 2.8.
 *
 * Custo: ler os trechos de ~90 leis leva dezenas de segundos → o catálogo é guardado no storage
 * (cronograma/lp-catalogo/<tenant>.json) com uma ASSINATURA (doc+versão+disciplina) e só é recalculado
 * quando alguma lei muda. Por cima, `remember` (Redis/memória).
 *
 * IDs ESTÁVEIS: "lp:<12 hex do doc>:<n>" — não dependem da posição no catálogo (incluir/remover lei
 * não renumera as metas das outras), preservando conclusões, tempo e anotações do aluno.
 */

export const CHARS_META = 12000
const BUCKET = 'pdfs'
const caminho = (t: string) => `cronograma/lp-catalogo/${t}.json`

export interface DocLegProc { id: string; titulo: string; disc: string; versaoId: string | null }

function hash(s: string): string { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(16) }

/** "Lei 9.717_1998 - RPPS 10.10.26" → "Lei 9.717/1998 - RPPS" */
export function nomeLei(titulo: string): string {
  return (titulo || 'Lei')
    .replace(/\s*\(?\d{2}\.\d{2}\.\d{2,4}\)?\s*$/, '')
    .replace(/(\d)_(\d{2,4})/g, '$1/$2')
    .replace(/\s+/g, ' ').trim()
}

/** Rótulo do artigo a partir do texto do trecho ("Art. 1º-A. O servidor…" → "1º-A"). */
function rotArtigo(texto: string, rotulo: string | null): string | null {
  const m = /^\s*Art\.?\s*(\d+(?:\.\d+)*)\s*([º°o]?)\s*(-\s*[A-Z]{1,3})?/i.exec(texto || '')
  if (m) return `${m[1]}${m[2] ? 'º' : (/^\d$/.test(m[1]) ? 'º' : '')}${m[3] ? m[3].replace(/\s+/g, '') : ''}`
  const r = /(\d+[A-Z-]*)/.exec(rotulo || '')
  return r ? r[1] : null
}

async function trechosDaVersao(svc: SupabaseClient, versaoId: string) {
  const out: Array<{ tipo: string | null; rotulo: string | null; texto: string | null }> = []
  for (let off = 0; ; off += 1000) {
    const { data, error } = await svc.from('simulado_conteudo_trechos').select('tipo, rotulo, texto')
      .eq('versao_id', versaoId).order('ordem', { ascending: true }).range(off, off + 999)
    if (error || !data) break
    out.push(...(data as typeof out))
    if (data.length < 1000) break
  }
  return out
}

/** Divide UMA lei em metas de ~30 min, cortando no início de artigos. */
export async function segmentarLei(svc: SupabaseClient, d: DocLegProc): Promise<ItemLP[]> {
  const lei = nomeLei(d.titulo)
  const base = `lp:${d.id.replace(/-/g, '').slice(0, 12)}`
  const trechos = d.versaoId ? await trechosDaVersao(svc, d.versaoId) : []
  const total = trechos.reduce((s, t) => s + (t.texto || '').length, 0)
  if (!total) return [{ id: `${base}:1`, disc: d.disc, lei: d.id, texto: `${lei} — leitura`, doc: d.id }]
  // unidades = artigo (com seus incisos/parágrafos/comentários); o preâmbulo vai junto do 1º artigo
  const unidades: Array<{ art: string | null; chars: number }> = []
  let atual: { art: string | null; chars: number } | null = null
  const temArtigo = trechos.some((t) => t.tipo === 'artigo')
  for (const t of trechos) {
    const n = (t.texto || '').length
    if (temArtigo && t.tipo === 'artigo') {
      const art = rotArtigo(t.texto || '', t.rotulo)
      if (!atual) atual = { art, chars: n }                          // 1º artigo
      else if (!atual.art) { atual.art = art; atual.chars += n }     // preâmbulo absorvido pelo 1º artigo
      else { unidades.push(atual); atual = { art, chars: n } }       // novo artigo = nova unidade
    } else {
      if (!atual) atual = { art: null, chars: 0 }
      atual.chars += n
    }
  }
  if (atual) unidades.push(atual)
  // empacota unidades em metas de ~CHARS_META (nunca corta um artigo ao meio)
  const metas: Array<{ de: string | null; ate: string | null; chars: number }> = []
  let m: { de: string | null; ate: string | null; chars: number } | null = null
  for (const u of unidades) {
    if (m && m.chars >= CHARS_META * 0.6 && m.chars + u.chars > CHARS_META) { metas.push(m); m = null }
    if (!m) m = { de: u.art, ate: u.art, chars: 0 }
    m.chars += u.chars; if (u.art) { m.ate = u.art; if (!m.de) m.de = u.art }
  }
  if (m) metas.push(m)
  const N = metas.length
  return metas.map((x, k) => {
    const faixa = temArtigo && x.de
      ? (x.de === x.ate ? `art. ${x.de}` : `arts. ${x.de} a ${x.ate}`)
      : `parte ${k + 1} de ${N}`
    return { id: `${base}:${k + 1}`, disc: d.disc, lei: d.id, texto: `${lei} — ${faixa}`, doc: d.id }
  })
}

/** Catálogo completo (todas as leis, na ordem recebida: disciplina → título). Cacheado por assinatura. */
export async function catalogoLegProc(svc: SupabaseClient, tenantId: string, docs: DocLegProc[]): Promise<ItemLP[]> {
  if (!docs.length) return []
  const assinatura = hash(`${CHARS_META}|` + docs.map((d) => `${d.id}:${d.versaoId}:${d.disc}`).join('|'))
  return remember<ItemLP[]>(`crono-lp:${tenantId}:${assinatura}`, 86400, async () => {
    try {
      const { data } = await svc.storage.from(BUCKET).download(caminho(tenantId))
      if (data) {
        const j = JSON.parse(await data.text()) as { assinatura?: string; itens?: ItemLP[] }
        if (j.assinatura === assinatura && Array.isArray(j.itens)) return j.itens
      }
    } catch { /* sem cache no storage → calcula */ }
    const itens: ItemLP[] = []
    for (const d of docs) itens.push(...await segmentarLei(svc, d))
    try {
      const corpo = new Blob([JSON.stringify({ assinatura, geradoEm: new Date().toISOString(), itens })], { type: 'application/json' })
      await svc.storage.from(BUCKET).upload(caminho(tenantId), corpo, { upsert: true, contentType: 'application/json' })
    } catch { /* cache é opcional */ }
    return itens
  })
}
