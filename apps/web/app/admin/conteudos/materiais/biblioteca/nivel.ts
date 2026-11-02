// Nível atual do navegador da Biblioteca (pastas + documentos), já filtrado e ordenado no servidor.
// Compartilhado entre a page e a rota de export XLSX. Fica FORA de 'use server'.
import { listarArvore } from '@/app/admin/biblioteca/actions'
import { timestampsPastas, contarVinculosDocs } from './actions'
import type { LinhaBiblioteca } from '@/components/admin/estudio/biblioteca-estudio'

export async function montarNivelBiblioteca(sp: Record<string, string | undefined>) {
  const pasta = sp.pasta || null
  const arv = await listarArvore(pasta, 'conteudo')
  const [vinculos, criadoPasta] = await Promise.all([
    contarVinculosDocs(arv.documentos.map((d) => d.id)),
    timestampsPastas(arv.pastas.map((p) => p.id)),
  ])

  const pastas: LinhaBiblioteca[] = arv.pastas.map((p) => ({
    kind: 'pasta', id: p.id, nome: p.nome, cor: p.cor, itens: arv.contagens[p.id] ?? 0,
    restrito: !!arv.restritasPasta[p.id], criadoEm: criadoPasta[p.id] ?? null, atualizadoEm: null,
  }))
  const docs: LinhaBiblioteca[] = arv.documentos.map((d) => ({
    kind: 'doc', id: d.id, nome: d.titulo, tipoOrigem: d.tipo_origem, vinculos: vinculos[d.id] ?? 0,
    restrito: !!arv.restritoDoc[d.id], criadoEm: d.criado_em ?? null, atualizadoEm: d.atualizado_em ?? null,
    versaoAtualId: d.versao_atual_id ?? null,
  }))

  const q = (sp.q ?? '').trim().toLowerCase()
  const tipo = sp.tipo || ''
  const vinculo = sp.vinculo === 'com' || sp.vinculo === 'sem' ? sp.vinculo : ''
  const filtra = (l: LinhaBiblioteca) => {
    if (q && !l.nome.toLowerCase().includes(q) && !(l.tipoOrigem ?? '').toLowerCase().includes(q)) return false
    if (tipo === 'pasta' && l.kind !== 'pasta') return false
    if (tipo && tipo !== 'pasta' && (l.kind !== 'doc' || l.tipoOrigem !== tipo)) return false
    if (vinculo && (l.kind !== 'doc' || ((l.vinculos ?? 0) > 0) !== (vinculo === 'com'))) return false
    return true
  }
  const sortKey = sp.sort ?? 'atualizacao'
  const asc = sp.sort ? sp.dir === 'asc' : false
  const val = (l: LinhaBiblioteca): string | number => {
    if (sortKey === 'titulo') return l.nome.toLocaleLowerCase('pt-BR')
    if (sortKey === 'itens') return l.itens ?? l.vinculos ?? 0
    if (sortKey === 'criado_em') return l.criadoEm ?? ''
    return l.atualizadoEm ?? l.criadoEm ?? ''
  }
  const ordena = (a: LinhaBiblioteca, b: LinhaBiblioteca) => {
    const va = val(a), vb = val(b)
    const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR')
    return asc ? c : -c
  }
  const todas = [...pastas.filter(filtra).sort(ordena), ...docs.filter(filtra).sort(ordena)]
  return {
    pasta, todas,
    breadcrumb: arv.breadcrumb.map((b) => ({ id: b.id, nome: b.nome })),
    resumo: arv.resumo,
  }
}
