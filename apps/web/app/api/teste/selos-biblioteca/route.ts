import { NextResponse } from 'next/server'
import { getCurrentTenant } from '@/lib/tenant'
import { carregarTagsBiblioteca, normalizarTermoTag } from '@/lib/leitura/biblioteca-tags'
import { SELOS, SELOS_APELIDO, codigoCurto } from '@/lib/leitura/selos'

// Biblioteca de SELOS para o plugin "Selos" do OnlyOffice. Resolvida no servidor pelo host (tenant), igual ao
// blocos-palette: as tags vêm da Biblioteca do tenant (simulado_biblioteca_itens, tipo 'tag') — a MESMA fonte
// que o sanitizador usa para trocar `<tag>` por selo na visão do aluno. Os selos padrão ainda não cadastrados
// aparecem com `naBiblioteca:false` (o plugin avisa: sem cadastro o texto fica como está p/ o aluno).
export const dynamic = 'force-dynamic'

const BASE = '/leitura/selos'
const apelidosDe = (slug: string) => Object.entries(SELOS_APELIDO).filter(([, s]) => s === slug).map(([a]) => a)

export async function GET() {
  const tenant = await getCurrentTenant()
  const tags = tenant?.id ? await carregarTagsBiblioteca(tenant.id) : []
  const vistos = new Set<string>()
  const selos: Array<{ id: string | null; slug: string; nome: string; codigo: string; img: string; imgSm: string | null; imgIc: string | null; padrao: boolean; naBiblioteca: boolean; apelidos: string[] }> = []

  for (const t of tags) {
    const slug = (t.slug || '').trim()
    const padrao = !!SELOS[slug]
    const imgHtml = /<img\b[^>]*\bsrc="(https?:\/\/[^"]+)"/i.exec(t.html || '')?.[1] ?? null
    if (!padrao && !imgHtml) continue // tag da Biblioteca que não é imagem (ex.: bloco de texto) não entra aqui
    const chave = padrao ? slug : normalizarTermoTag(slug || t.nome)
    if (!chave || vistos.has(chave)) continue
    vistos.add(chave)
    selos.push({
      id: padrao ? null : (t.id ?? null),
      slug: padrao ? slug : chave.replace(/\s+/g, '-'),
      nome: t.nome || SELOS[slug]?.nome || slug,
      codigo: padrao ? codigoCurto(slug) : chave.replace(/\s+/g, '-'),
      img: padrao ? `${BASE}/${slug}.png` : (imgHtml as string),
      imgSm: padrao ? `${BASE}/${slug}-sm.png` : null,
      imgIc: padrao ? `${BASE}/${slug}-ic.png` : null,
      padrao, naBiblioteca: true, apelidos: padrao ? apelidosDe(slug) : [],
    })
  }
  for (const [slug, def] of Object.entries(SELOS)) {
    if (vistos.has(slug)) continue
    selos.push({ id: null, slug, nome: def.nome, codigo: codigoCurto(slug), img: `${BASE}/${slug}.png`, imgSm: `${BASE}/${slug}-sm.png`, imgIc: `${BASE}/${slug}-ic.png`, padrao: true, naBiblioteca: false, apelidos: apelidosDe(slug) })
  }
  return NextResponse.json({ selos }, { headers: { 'cache-control': 'no-store' } })
}
