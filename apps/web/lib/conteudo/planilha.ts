import 'server-only'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { registrarAudit } from '@/lib/audit'
import { formatBrt } from '@/lib/brt'
import { TIPOS_CONTEUDO, type KindConteudo } from '@/lib/biblioteca/tipos-conteudo'
import {
  CAMPOS_META, normalizarMetadados, normTexto, validarCampoMeta, type CampoMeta, type Metadados,
} from './metadados'

// PLANILHA da Biblioteca: EXPORTA os conteúdos (só conteúdos, sem pastas) de uma pasta (+ subpastas) ou da
// biblioteca inteira, e IMPORTA atualizações dos METADADOS. Regras do import:
//   • casa por NOME (Título) — e pelo ID quando a planilha o traz — dentro do escopo escolhido;
//   • Título e Tipo NÃO podem ser alterados: linha cujo nome/tipo não bate com o do sistema é IGNORADA;
//   • só as colunas de metadado (Disciplina, Assunto específico, Tribunais, Informativo, Ano, Estado de
//     origem) são lidas; célula vazia = mantém o valor atual; "-" = limpa o valor.

export type CategoriaPlanilha = 'conteudo' | 'modelo_caderno' | 'jurisclub'
const T_DOC = 'simulado_conteudo_documentos'
const T_VER = 'simulado_conteudo_versoes'
const areaDaCategoria = (c: CategoriaPlanilha) => (c === 'modelo_caderno' ? 'conteudo_modelo' : c === 'jurisclub' ? 'conteudo_jurisclub' : 'conteudo')

export interface DocEscopo {
  id: string; titulo: string; tipo_origem: string; status: string; pasta_id: string | null
  versao_atual_id: string | null; fonte: string | null; criado_em: string | null; atualizado_em: string | null
  acesso_geral: string | null; metadados: Metadados; pastaCaminho: string; versaoNumero: number | null
}
export interface Escopo { docs: DocEscopo[]; nomePasta: string }

const rotuloTipo = (t: string) => TIPOS_CONTEUDO[(t === 'html' ? 'docx' : t) as KindConteudo]?.label ?? t

/** Docs (sem pastas) da pasta + descendentes; `pastaId=null` = biblioteca inteira da categoria. */
export async function carregarEscopo(svc: any, tenantId: string, categoria: CategoriaPlanilha, pastaId: string | null): Promise<Escopo | { erro: string }> {
  const pastas = (await fetchAll<any>(() => svc.from('simulado_pastas').select('id, nome, pai_id, deletado')
    .eq('tenant_id', tenantId).eq('folder_area', areaDaCategoria(categoria)).eq('is_folder', true).order('id', { ascending: true }))) ?? []
  const vivas = pastas.filter((p) => !p.deletado)
  const porId = new Map<string, any>(vivas.map((p) => [p.id, p]))
  const caminho = (id: string | null): string => {
    const partes: string[] = []; let cur = id; let guard = 0
    while (cur && porId.has(cur) && guard++ < 20) { const p = porId.get(cur); partes.unshift(String(p.nome)); cur = p.pai_id ?? null }
    return partes.join(' / ')
  }
  let ids: string[] | null = null
  let nomePasta = 'Biblioteca'
  if (pastaId) {
    if (!porId.has(pastaId)) return { erro: 'Pasta não encontrada.' }
    nomePasta = String(porId.get(pastaId).nome)
    const filhos = new Map<string, string[]>()
    for (const p of vivas) { const k = p.pai_id ?? '__raiz__'; (filhos.get(k) ?? filhos.set(k, []).get(k)!).push(p.id) }
    ids = [pastaId]
    for (let i = 0; i < ids.length && ids.length < 5000; i++) for (const f of filhos.get(ids[i]) ?? []) ids.push(f)
  }

  const COLS = 'id, titulo, tipo_origem, status, pasta_id, versao_atual_id, fonte, criado_em, atualizado_em, acesso_geral'
  const buscar = async (cols: string): Promise<any[]> => {
    if (ids) return (await fetchAllByIn<any>(ids, (c) => svc.from(T_DOC).select(cols).eq('tenant_id', tenantId).eq('categoria', categoria).eq('deletado', false).in('pasta_id', c).order('id', { ascending: true }))) ?? []
    return (await fetchAll<any>(() => svc.from(T_DOC).select(cols).eq('tenant_id', tenantId).eq('categoria', categoria).eq('deletado', false).order('id', { ascending: true }))) ?? []
  }
  // `metadados` é coluna NOVA: tolerante à migração pendente (sem ela, tudo vem vazio).
  let rows: any[]
  try { rows = await buscar(`${COLS}, metadados`) } catch { rows = await buscar(COLS) }

  const verIds = [...new Set(rows.map((r) => r.versao_atual_id).filter(Boolean))] as string[]
  const numVer = new Map<string, number>()
  if (verIds.length) {
    try {
      const vs = (await fetchAllByIn<any>(verIds, (c) => svc.from(T_VER).select('id, numero').eq('tenant_id', tenantId).in('id', c).order('id', { ascending: true }))) ?? []
      for (const v of vs) numVer.set(v.id, v.numero)
    } catch { /* versão é só informativa */ }
  }

  const docs: DocEscopo[] = rows.map((r) => ({
    id: r.id, titulo: String(r.titulo ?? ''), tipo_origem: String(r.tipo_origem ?? ''), status: String(r.status ?? ''),
    pasta_id: r.pasta_id ?? null, versao_atual_id: r.versao_atual_id ?? null, fonte: r.fonte ?? null,
    criado_em: r.criado_em ?? null, atualizado_em: r.atualizado_em ?? null, acesso_geral: r.acesso_geral ?? null,
    metadados: normalizarMetadados(r.metadados), pastaCaminho: caminho(r.pasta_id ?? null), versaoNumero: r.versao_atual_id ? (numVer.get(r.versao_atual_id) ?? null) : null,
  })).sort((a, b) => a.pastaCaminho.localeCompare(b.pastaCaminho, 'pt-BR') || a.titulo.localeCompare(b.titulo, 'pt-BR'))
  return { docs, nomePasta }
}

// ───────────────────────────── EXPORTAR ─────────────────────────────

const STATUS_ROT: Record<string, string> = { rascunho: 'Rascunho', publicado: 'Publicado', arquivado: 'Arquivado' }

export async function gerarPlanilha(escopo: Escopo): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Plataforma'
  wb.created = new Date()

  const ws = wb.addWorksheet('Conteúdos', { views: [{ state: 'frozen', ySplit: 1 }] })
  type Col = { header: string; key: string; width: number; editavel?: boolean; nota?: string }
  const cols: Col[] = [
    { header: 'Título', key: 'titulo', width: 60, nota: 'NÃO ALTERE o título: é por ele que o conteúdo é reconhecido na importação.' },
    { header: 'Tipo', key: 'tipo', width: 14, nota: 'NÃO ALTERE o tipo.' },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Pasta', key: 'pasta', width: 34 },
    ...CAMPOS_META.map((c): Col => ({ header: c.rot, key: c.k, width: c.k === 'assunto_especifico' ? 32 : c.k === 'ano' ? 10 : c.k === 'selos' ? 28 : 22, editavel: true, nota: c.dica })),
    { header: 'Data de atualização', key: 'atualizado', width: 18 },
    { header: 'Criado em', key: 'criado', width: 18 },
    { header: 'Versão', key: 'versao', width: 9 },
    { header: 'Acesso', key: 'acesso', width: 11 },
    { header: 'Origem', key: 'origem', width: 28 },
    { header: 'ID', key: 'id', width: 38 },
  ]
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width }))
  const hdr = ws.getRow(1)
  hdr.height = 24
  cols.forEach((c, i) => {
    const cell = hdr.getCell(i + 1)
    cell.font = { name: 'Arial', bold: true, size: 10, color: { argb: c.editavel ? 'FF3B2A00' : 'FF333333' } }
    // Editável = dourado; somente-leitura = cinza (a legenda está na aba "Instruções").
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.editavel ? 'FFFAD165' : 'FFE5E7EB' } }
    cell.alignment = { vertical: 'middle', wrapText: true }
    if (c.nota) cell.note = c.nota
  })

  for (const d of escopo.docs) {
    const m = d.metadados
    const row = ws.addRow({
      titulo: d.titulo, tipo: rotuloTipo(d.tipo_origem), status: STATUS_ROT[d.status] ?? d.status, pasta: d.pastaCaminho,
      disciplina: m.disciplina ?? '', assunto_especifico: m.assunto_especifico ?? '', tribunal: m.tribunal ?? '',
      informativo: m.informativo ?? '', ano: m.ano ?? '', estado_origem: m.estado_origem ?? '', selos: m.selos ?? '',
      atualizado: formatBrt(d.atualizado_em) ?? '', criado: formatBrt(d.criado_em) ?? '', versao: d.versaoNumero ?? '',
      acesso: d.acesso_geral === 'restrito' ? 'Restrito' : 'Todos', origem: d.fonte ?? '', id: d.id,
    })
    row.font = { name: 'Arial', size: 10 }
    cols.forEach((c, i) => { if (!c.editavel) row.getCell(i + 1).font = { name: 'Arial', size: 10, color: { argb: 'FF6B7280' } } })
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } }

  const ins = wb.addWorksheet('Instruções')
  ins.getColumn(1).width = 110
  const linhas: [string, boolean][] = [
    ['COMO USAR ESTA PLANILHA', true],
    ['', false],
    ['• Cada linha é um CONTEÚDO (as pastas não entram). Edite apenas as colunas em DOURADO e depois importe a planilha de volta na Biblioteca.', false],
    ['• NÃO ALTERE o TÍTULO nem o TIPO: é por eles que cada conteúdo é reconhecido. Se o título ou o tipo não bater com o do sistema, a linha é IGNORADA (nada é alterado).', false],
    ['• Só entram na importação os conteúdos que existem na pasta escolhida (e subpastas). Linhas de outros conteúdos são ignoradas.', false],
    ['• Colunas em cinza (Status, Pasta, Data de atualização, Criado em, Versão, Acesso, Origem, ID) são só informativas — qualquer alteração nelas é desconsiderada.', false],
    ['', false],
    ['COLUNAS EDITÁVEIS', true],
    ...CAMPOS_META.map((c): [string, boolean] => [`• ${c.rot}: ${c.dica}`, false]),
    ['', false],
    ['CÉLULAS VAZIAS E LIMPEZA', true],
    ['• Célula em branco = mantém o valor que já está no sistema.', false],
    ['• Para APAGAR um valor, escreva um hífen ("-") na célula.', false],
    ['', false],
    ['• A "Data de atualização" é preenchida pelo sistema quando o conteúdo é alterado (inclusive por esta importação).', false],
  ]
  linhas.forEach(([t, negrito]) => { const r = ins.addRow([t]); r.getCell(1).font = { name: 'Arial', size: 10, bold: negrito }; r.getCell(1).alignment = { wrapText: true, vertical: 'top' } })

  return Buffer.from(await wb.xlsx.writeBuffer())
}

// ───────────────────────────── IMPORTAR ─────────────────────────────

export interface LinhaIgnorada { linha: number; titulo: string; motivo: string }
export interface ResultadoImportPlanilha {
  ok: boolean; error?: string
  totalLinhas: number; atualizados: number; semAlteracao: number; ignorados: LinhaIgnorada[]
}

function cellTexto(v: any): string {
  if (v == null) return ''
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((r: any) => r?.text ?? '').join('')
    if (typeof v.text === 'string') return v.text
    if ('result' in v) return cellTexto(v.result)
    if (v instanceof Date) return v.toISOString()
    return ''
  }
  return String(v)
}

const CABECALHOS: Record<string, string> = {
  titulo: 'titulo', nome: 'titulo', tipo: 'tipo', pasta: 'pasta', id: 'id',
  disciplina: 'disciplina', disciplinas: 'disciplina',
  'assunto especifico': 'assunto_especifico', 'assunto': 'assunto_especifico',
  tribunal: 'tribunal', tribunais: 'tribunal',
  informativo: 'informativo', ano: 'ano',
  'estado de origem': 'estado_origem', estado: 'estado_origem', uf: 'estado_origem',
  selos: 'selos', selo: 'selos',
}

const MAX_LINHAS = 5000

export async function importarPlanilha(args: {
  svc: any; tenantId: string; atorId: string | null; categoria: CategoriaPlanilha; pastaId: string | null; buffer: Buffer
}): Promise<ResultadoImportPlanilha> {
  const { svc, tenantId, categoria, pastaId } = args
  const vazio = (error: string): ResultadoImportPlanilha => ({ ok: false, error, totalLinhas: 0, atualizados: 0, semAlteracao: 0, ignorados: [] })

  const esc = await carregarEscopo(svc, tenantId, categoria, pastaId)
  if ('erro' in esc) return vazio(esc.erro)

  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  try { await wb.xlsx.load(args.buffer as any) } catch { return vazio('Não foi possível ler o arquivo. Envie uma planilha .xlsx.') }
  const ws = wb.getWorksheet('Conteúdos') ?? wb.worksheets[0]
  if (!ws) return vazio('A planilha está vazia.')

  // Cabeçalho → índice de coluna (por nome normalizado).
  const idx: Record<string, number> = {}
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    const k = CABECALHOS[normTexto(cellTexto(cell.value))]
    if (k && idx[k] == null) idx[k] = col
  })
  if (idx.titulo == null) return vazio('Cabeçalho "Título" não encontrado na primeira linha. Use a planilha exportada pela Biblioteca.')
  const camposPresentes = CAMPOS_META.filter((c) => idx[c.k] != null)
  if (!camposPresentes.length) return vazio('Nenhuma coluna de metadados encontrada (Disciplina, Assunto específico, Tribunais, Informativo, Ano, Estado de origem, Selos).')
  if (ws.rowCount - 1 > MAX_LINHAS) return vazio(`A planilha tem mais de ${MAX_LINHAS} linhas.`)

  const porId = new Map(esc.docs.map((d) => [d.id, d]))
  const porTitulo = new Map<string, DocEscopo[]>()
  for (const d of esc.docs) { const k = normTexto(d.titulo); (porTitulo.get(k) ?? porTitulo.set(k, []).get(k)!).push(d) }

  const ignorados: LinhaIgnorada[] = []
  const alteracoes: { doc: DocEscopo; novo: Metadados }[] = []
  let total = 0, semAlteracao = 0
  const jaVistos = new Set<string>()

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const get = (k: string) => (idx[k] != null ? cellTexto(row.getCell(idx[k]).value).trim() : '')
    const titulo = get('titulo')
    const celulas = [titulo, ...camposPresentes.map((c) => get(c.k))]
    if (!celulas.some((c) => c)) continue // linha totalmente vazia
    total++
    const ign = (motivo: string) => { ignorados.push({ linha: r, titulo: titulo || '(sem título)', motivo }) }
    if (!titulo) { ign('Título vazio'); continue }

    // 1) localizar o conteúdo (ID quando existir; senão pelo nome, desambiguando pela pasta).
    let doc: DocEscopo | undefined
    const idPlan = get('id')
    if (idPlan && porId.has(idPlan)) doc = porId.get(idPlan)
    else {
      const cands = porTitulo.get(normTexto(titulo)) ?? []
      if (cands.length === 1) doc = cands[0]
      else if (cands.length > 1) {
        const pastaPlan = normTexto(get('pasta'))
        const filtrados = pastaPlan ? cands.filter((c) => normTexto(c.pastaCaminho) === pastaPlan) : []
        if (filtrados.length === 1) doc = filtrados[0]
        else { ign('Há mais de um conteúdo com esse nome no escopo — não foi possível identificar qual atualizar'); continue }
      }
    }
    if (!doc) { ign('Conteúdo não encontrado neste escopo (o nome precisa ser igual ao do sistema)'); continue }

    // 2) Título e Tipo NÃO podem mudar.
    if (doc.titulo.trim() !== titulo) { ign(`Nome alterado — o título não pode ser mudado (no sistema: "${doc.titulo}")`); continue }
    const tipoPlan = get('tipo')
    if (tipoPlan) {
      const ok = normTexto(tipoPlan) === normTexto(rotuloTipo(doc.tipo_origem)) || normTexto(tipoPlan) === normTexto(doc.tipo_origem)
      if (!ok) { ign(`Tipo alterado — o tipo não pode ser mudado (no sistema: ${rotuloTipo(doc.tipo_origem)})`); continue }
    }
    if (jaVistos.has(doc.id)) { ign('Conteúdo repetido na planilha — apenas a primeira linha é usada'); continue }
    jaVistos.add(doc.id)

    // 3) aplicar só as colunas de metadado (vazio = mantém; "-" = limpa).
    const novo: Record<string, unknown> = { ...doc.metadados }
    let erro: string | null = null
    for (const c of camposPresentes) {
      const bruto = get(c.k)
      if (!bruto) continue
      if (bruto === '-') { delete novo[c.k]; continue }
      const v = validarCampoMeta(c.k as CampoMeta, bruto)
      if (!v.ok) { erro = v.erro; break }
      novo[c.k] = v.valor
    }
    if (erro) { ign(erro); continue }
    const antes = JSON.stringify(normalizarMetadados(doc.metadados))
    const depois = normalizarMetadados(novo)
    if (JSON.stringify(depois) === antes) { semAlteracao++; continue }
    alteracoes.push({ doc, novo: depois })
  }

  // 4) gravar (em lotes), atualizando `atualizado_em` — a "data de atualização" da lista.
  const agora = new Date().toISOString()
  for (let i = 0; i < alteracoes.length; i += 20) {
    const lote = alteracoes.slice(i, i + 20)
    const res = await Promise.all(lote.map((a) => svc.from(T_DOC).update({ metadados: a.novo, atualizado_em: agora }).eq('tenant_id', tenantId).eq('id', a.doc.id)))
    const falha = res.find((x: any) => x.error)
    if (falha) {
      const msg = String(falha.error.message || '')
      return { ok: false, error: /metadados|schema cache|column/i.test(msg) ? 'Aplique a migração 20261106000000 (coluna metadados) no banco.' : msg, totalLinhas: total, atualizados: i, semAlteracao, ignorados }
    }
  }
  if (alteracoes.length) {
    await registrarAudit({
      operacao: 'UPDATE', entidade: T_DOC, entidadeId: null, atorId: args.atorId, tenantId,
      depois: { importacao_planilha: true, escopo: pastaId ?? 'biblioteca', atualizados: alteracoes.length, ignorados: ignorados.length },
    }).catch(() => {})
  }
  return { ok: true, totalLinhas: total, atualizados: alteracoes.length, semAlteracao, ignorados }
}
