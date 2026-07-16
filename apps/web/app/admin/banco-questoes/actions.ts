'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, checkPermission } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { softDelete } from '@/lib/soft-delete'
import { tipoEhCertoErrado, alternativasSaoCertoErrado } from '@/lib/simulado/formato'
import type { AnaliseImport, QuestaoImport, AltImport, ResultadoImport } from './import-types'

async function guard() {
  if (!(await checkPermission('questoes:view'))) {
    return { ok: false as const, error: 'Sem permissão.' }
  }
  const access = await getCurrentAccess()
  if (!access.tenantId) return { ok: false as const, error: 'Tenant não resolvido.' }
  return { ok: true as const, tenantId: access.tenantId }
}

/** Cria um banco (pasta) de questões. */
export async function criarBanco(nome: string, tipo: string = 'objetiva'): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const titulo = nome.trim()
  if (!titulo) return { ok: false, error: 'Informe um nome.' }
  const tp = tipo === 'discursiva' ? 'discursiva' : 'objetiva'

  const svc = createAdminClient()
  let { data, error } = await svc
    .from('simulado_pastas')
    .insert({ tenant_id: g.tenantId, nome: titulo, tipo: tp })
    .select('id')
    .single()
  // Tolerante: se a coluna `tipo` ainda não foi migrada, cria sem ela.
  if (error && /tipo|column/i.test(error.message)) {
    ({ data, error } = await svc.from('simulado_pastas').insert({ tenant_id: g.tenantId, nome: titulo }).select('id').single())
  }
  if (error || !data) return { ok: false, error: error?.message ?? 'Erro ao criar' }

  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_pastas', entidadeId: data.id, depois: { nome: titulo, tipo: tp } })
  revalidatePath('/admin/banco-questoes')
  return { ok: true, id: data.id }
}

/** Renomeia um banco. */
export async function renomearBanco(id: string, nome: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const titulo = nome.trim()
  if (!titulo) return { ok: false, error: 'Informe um nome.' }

  const svc = createAdminClient()
  const { error } = await svc.from('simulado_pastas').update({ nome: titulo }).eq('id', id).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }

  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_pastas', entidadeId: id, depois: { nome: titulo } })
  revalidatePath('/admin/banco-questoes')
  revalidatePath(`/admin/banco-questoes/${id}`)
  return { ok: true }
}

/** Atualiza nome + personalização (cor/ícone/capa + imagem do card) de um banco. Tolerante caso as colunas não existam. */
export async function atualizarBanco(id: string, nome: string, cor: string | null, icone: string | null, capaUrl?: string | null, capaCardUrl?: string | null): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const titulo = nome.trim()
  if (!titulo) return { ok: false, error: 'Informe um nome.' }

  const svc = createAdminClient()
  const upd = (patch: Record<string, unknown>) => svc.from('simulado_pastas').update(patch).eq('id', id).eq('tenant_id', g.tenantId)
  const completo = { nome: titulo, cor: cor || null, icone: icone || null, capa_url: capaUrl || null, capa_card_url: capaCardUrl || null }

  let { error } = await upd(completo)
  // Fallback 1: coluna capa_card_url ainda não migrada → salva o resto (cor/ícone/capa preservados).
  if (error && /capa_card_url/i.test(error.message)) {
    const { capa_card_url, ...semCard } = completo
    ;({ error } = await upd(semCard))
  }
  // Fallback 2: outras colunas de personalização ausentes → salva só o nome.
  if (error && /cor|icone|capa_url|column/i.test(error.message)) {
    ;({ error } = await upd({ nome: titulo }))
  }
  if (error) return { ok: false, error: error.message }

  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_pastas', entidadeId: id, depois: { nome: titulo, cor, icone, capa: !!capaUrl, capaCard: !!capaCardUrl } })
  revalidatePath('/admin/banco-questoes')
  revalidatePath(`/admin/banco-questoes/${id}`)
  return { ok: true }
}

/** Duplica um banco: cria uma cópia com os mesmos vínculos de questões. */
export async function duplicarBanco(id: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const g = await guard()
  if (!g.ok) return g

  const svc = createAdminClient()
  const { data: orig } = await svc.from('simulado_pastas').select('nome').eq('id', id).eq('tenant_id', g.tenantId).maybeSingle()
  if (!orig) return { ok: false, error: 'Banco não encontrado.' }

  const { data: novo, error } = await svc
    .from('simulado_pastas')
    .insert({ tenant_id: g.tenantId, nome: `${orig.nome} (cópia)` })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }

  // Copia os vínculos de questões.
  const { data: vinculos } = await svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', id).eq('tenant_id', g.tenantId)
  if (vinculos?.length) {
    await svc.from('simulado_questao_pasta').insert(
      vinculos.map((v: any) => ({ tenant_id: g.tenantId, pasta_id: novo.id, questao_id: v.questao_id })),
    )
  }

  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_pastas', entidadeId: novo.id, depois: { copia_de: id, questoes: vinculos?.length ?? 0 } })
  revalidatePath('/admin/banco-questoes')
  return { ok: true, id: novo.id }
}

/** Exclui um banco (e seus vínculos com questões — as questões NÃO são apagadas). */
export async function excluirBanco(id: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g

  // Soft delete: o banco vai para a Lixeira. Mantemos os vínculos (questões/estudantes)
  // para que a restauração traga o banco completo de volta.
  const { error } = await softDelete('simulado_pastas', id)
  if (error) return { ok: false, error: error.message }

  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_pastas', entidadeId: id, depois: { deletado: true } })
  revalidatePath('/admin/banco-questoes')
  return { ok: true }
}

/** Adiciona questões a um banco (ignora as que já estão nele). */
export async function adicionarQuestoes(bancoId: string, questaoIds: string[]): Promise<{ ok: boolean; adicionadas?: number; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  if (!questaoIds.length) return { ok: false, error: 'Selecione ao menos uma questão.' }

  const svc = createAdminClient()
  const { data: jaTem } = await svc
    .from('simulado_questao_pasta')
    .select('questao_id')
    .eq('pasta_id', bancoId)
    .in('questao_id', questaoIds)
  const existentes = new Set((jaTem ?? []).map((r: any) => r.questao_id))
  const novas = questaoIds.filter((q) => !existentes.has(q))
  if (!novas.length) return { ok: true, adicionadas: 0 }

  const { error } = await svc
    .from('simulado_questao_pasta')
    .insert(novas.map((questao_id) => ({ tenant_id: g.tenantId, pasta_id: bancoId, questao_id })))
  if (error) return { ok: false, error: error.message }

  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_pastas', entidadeId: bancoId, depois: { questoes_adicionadas: novas.length } })
  revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return { ok: true, adicionadas: novas.length }
}

/** Remove várias questões de um banco de uma vez (as questões continuam existindo). */
export async function removerQuestoes(bancoId: string, questaoIds: string[]): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  if (!questaoIds.length) return { ok: true }
  const svc = createAdminClient()
  const { error } = await svc
    .from('simulado_questao_pasta')
    .delete()
    .eq('pasta_id', bancoId)
    .eq('tenant_id', g.tenantId)
    .in('questao_id', questaoIds)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return { ok: true }
}

/** Remove uma questão de um banco (a questão continua existindo). */
export async function removerQuestao(bancoId: string, questaoId: string): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g

  const svc = createAdminClient()
  const { error } = await svc
    .from('simulado_questao_pasta')
    .delete()
    .eq('pasta_id', bancoId)
    .eq('questao_id', questaoId)
    .eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return { ok: true }
}

// ───────────────────────── Importação de questões ─────────────────────────

function norm(s: string) {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}
function normEnun(s: string) {
  return norm(s).replace(/\s+/g, ' ')
}

/** Extrai o nome da coluna ausente de um erro do PostgREST/Postgres (para o insert tolerante). */
function colFaltante(msg?: string): string | null {
  if (!msg) return null
  return msg.match(/'([a-z0-9_]+)' column/i)?.[1] ?? msg.match(/column "?([a-z0-9_]+)"? does not exist/i)?.[1] ?? null
}

/** Mapeia um cabeçalho da planilha para o campo interno. */
function mapHeader(h: string): string | null {
  const n = norm(h).replace(/[\s_]+/g, '')
  if (['numero', 'num', 'no'].includes(n)) return 'numero'
  if (['enunciado', 'questao', 'pergunta'].includes(n)) return 'enunciado'
  if (n === 'tipo') return 'tipo'
  if (['disciplina', 'materia'].includes(n)) return 'disciplina'
  if (n === 'categoria') return 'categoria'
  if (['assuntoprincipal', 'assunto'].includes(n)) return 'assunto'
  if (['assuntodetalhe', 'assuntodetalhado', 'detalhe'].includes(n)) return 'assunto_detalhe'
  if (n === 'grupo') return 'grupo'
  if (['pilar1', 'pilarum'].includes(n)) return 'pilar_1'
  if (['pilar2', 'pilardois'].includes(n)) return 'pilar_2'
  if (n === 'banca') return 'banca'
  if (['orgao', 'orgaos'].includes(n)) return 'orgao'
  if (n === 'cargo') return 'cargo'
  if (n === 'ano') return 'ano'
  if (['dificuldade', 'nivel', 'niveldificuldade'].includes(n)) return 'dificuldade'
  if (['correta', 'gabarito', 'resposta', 'alternativacorreta', 'alternativascorretas'].includes(n)) return 'correta'
  if (['alternativasincorretas', 'incorretas', 'incorreta'].includes(n)) return 'incorretas'
  const lei = n.match(/^lei([a-e])$/); if (lei) return 'lei_' + lei[1]
  const com = n.match(/^comentario([a-e])$/); if (com) return 'com_' + com[1]
  if (['comentario', 'comentarioprofessor', 'resolucao', 'comentarios'].includes(n)) return 'comentario'
  const m = n.match(/^(?:alternativa|alt)?([a-e])$/)
  if (m) return 'alt_' + m[1]
  return null
}

/** Parser CSV simples com suporte a aspas e delimitador , ou ; */
function parseCSV(txt: string): string[][] {
  const primeira = txt.split(/\r?\n/)[0] ?? ''
  const delim = primeira.split(';').length > primeira.split(',').length ? ';' : ','
  const linhas: string[][] = []
  let campo = '', linha: string[] = [], aspas = false
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i]
    if (aspas) {
      if (c === '"') { if (txt[i + 1] === '"') { campo += '"'; i++ } else aspas = false }
      else campo += c
    } else if (c === '"') aspas = true
    else if (c === delim) { linha.push(campo); campo = '' }
    else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = '' }
    else if (c !== '\r') campo += c
  }
  if (campo.length || linha.length) { linha.push(campo); linhas.push(linha) }
  return linhas.map((l) => l.map((x) => x.trim()))
}

/** Lê o arquivo (.xlsx/.xls via exceljs, ou .csv/.txt) em uma matriz de células. */
async function lerLinhas(arquivo: File): Promise<string[][]> {
  const nome = (arquivo.name || '').toLowerCase()
  if (nome.endsWith('.xlsx') || nome.endsWith('.xls')) {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await arquivo.arrayBuffer())
    const ws = wb.worksheets[0]
    const linhas: string[][] = []
    ws?.eachRow((row) => {
      const vals: string[] = []
      row.eachCell({ includeEmpty: true }, (cell) => {
        const v: any = cell.value
        const s = v && typeof v === 'object' && 'text' in v ? v.text : v
        vals.push(s == null ? '' : String(s).trim())
      })
      linhas.push(vals)
    })
    return linhas
  }
  return parseCSV(await lerTextoCsv(arquivo))
}

/**
 * Lê o texto do CSV tolerando o encoding: UTF-8 (com ou sem BOM) ou, se os bytes
 * não forem UTF-8 válido (ex.: "CSV ANSI"/Windows-1252 exportado do Excel), refaz
 * a decodificação em Windows-1252. Evita cabeçalhos acentuados (Número, Nível,
 * Órgão, Comentário…) chegarem corrompidos e não serem reconhecidos.
 */
async function lerTextoCsv(arquivo: File): Promise<string> {
  const buf = new Uint8Array(await arquivo.arrayBuffer())
  // Remove BOM UTF-8, se houver.
  const bytes = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? buf.subarray(3) : buf
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  // O caractere de substituição (�) indica bytes que não eram UTF-8 → tenta Windows-1252.
  if (utf8.includes('�')) {
    try { return new TextDecoder('windows-1252').decode(bytes) } catch { return utf8 }
  }
  return utf8
}

/** Constrói as questões a partir das linhas da planilha (1ª linha = cabeçalho). */
function montarQuestoes(linhas: string[][]): QuestaoImport[] {
  if (linhas.length < 2) return []
  const header = linhas[0].map(mapHeader)
  const letras = ['a', 'b', 'c', 'd', 'e']
  const out: QuestaoImport[] = []
  for (let r = 1; r < linhas.length; r++) {
    const row = linhas[r]
    if (!row.some((c) => c && c.trim())) continue
    const get = (campo: string) => { const idx = header.indexOf(campo); return idx >= 0 ? (row[idx] ?? '').trim() : '' }

    const enunciado = get('enunciado')
    const tipoCell = get('tipo')
    const tipoRaw = norm(tipoCell)
    // Certo/Errado é uma OBJETIVA de 2 opções, marcada por formato — não é um tipo separado.
    const ehCE = tipoEhCertoErrado(tipoCell)
    const tipo: 'objetiva' | 'discursiva' = tipoRaw.startsWith('disc') ? 'discursiva' : 'objetiva'
    const difRaw = norm(get('dificuldade'))
    const dif = difRaw.startsWith('fac') ? 'facil' : difRaw.startsWith('dif') ? 'dificil' : difRaw.startsWith('med') ? 'medio' : null
    const anoNum = parseInt(get('ano'), 10)
    // Gabarito: aceita letra (A–E) OU "Certo"/"Errado".
    const corretaNorm = norm(get('correta'))
    const corretaLetra = corretaNorm.replace(/[^a-e]/g, '').charAt(0)
    const corretaCE = corretaNorm.startsWith('cert') ? 'certo' : corretaNorm.startsWith('err') ? 'errado' : null
    let alternativas: AltImport[] = []
    letras.forEach((L, i) => {
      const t = get('alt_' + L)
      if (!t) return
      const correta = corretaCE ? norm(t) === corretaCE : L === corretaLetra
      alternativas.push({ texto: t, correta, ordem: i, lei: get('lei_' + L) || null, comentario: get('com_' + L) || null })
    })

    // Formato: explícito (Tipo = Certo/Errado) ou deduzido (2 alternativas Certo/Errado).
    let formato: 'multipla' | 'certo_errado' = 'multipla'
    if (tipo === 'objetiva' && (ehCE || alternativasSaoCertoErrado(alternativas.map((a) => a.texto)))) formato = 'certo_errado'

    // Atalho: Tipo = Certo/Errado sem A/B preenchidos → cria as 2 alternativas automaticamente.
    if (formato === 'certo_errado' && alternativas.length === 0) {
      const certoCerto = corretaCE ? corretaCE === 'certo' : corretaLetra !== 'b'
      alternativas = [
        { texto: 'Certo', correta: certoCerto, ordem: 0, lei: null, comentario: get('com_a') || null },
        { texto: 'Errado', correta: !certoCerto, ordem: 1, lei: null, comentario: get('com_b') || null },
      ]
    }

    let erro: string | null = null
    if (!enunciado) erro = 'Enunciado vazio'
    else if (tipo === 'objetiva') {
      if (alternativas.length < 2) erro = 'Menos de 2 alternativas'
      else if (!alternativas.some((a) => a.correta)) erro = 'Alternativa correta não indicada'
    }

    out.push({
      linha: r + 1, numero: get('numero') || null, enunciado, tipo, formato,
      disciplina: get('disciplina') || null, categoria: get('categoria') || null,
      assunto: get('assunto') || null, assunto_detalhe: get('assunto_detalhe') || null, grupo: get('grupo') || null,
      pilar_1: get('pilar_1') || null, pilar_2: get('pilar_2') || null,
      banca: get('banca') || null, orgao: get('orgao') || null, cargo: get('cargo') || null,
      ano: Number.isFinite(anoNum) ? anoNum : null, nivel_dificuldade: dif,
      comentario_professor: get('comentario') || null, alternativas, erro,
    })
  }
  return out
}

/** Resolve/cria taxonomia por nome (versão service-role para a importação). */
async function resolveNome(svc: ReturnType<typeof createAdminClient>, table: 'simulado_bancas' | 'simulado_orgaos' | 'simulado_disciplinas', tenantId: string, nome?: string | null): Promise<string | null> {
  const n = nome?.trim(); if (!n) return null
  const { data: ex } = await svc.from(table).select('id').eq('tenant_id', tenantId).ilike('nome', n).maybeSingle()
  if (ex) return (ex as any).id
  const { data: cr, error } = await svc.from(table).insert({ nome: n, tenant_id: tenantId }).select('id').single()
  if (error) { const { data: again } = await svc.from(table).select('id').eq('tenant_id', tenantId).ilike('nome', n).maybeSingle(); return (again as any)?.id ?? null }
  return (cr as any).id
}

/** Resolve/cria um assunto (filho de disciplina) por nome. */
async function resolveAssunto(svc: ReturnType<typeof createAdminClient>, tenantId: string, nome?: string | null, disciplinaId?: string | null): Promise<string | null> {
  const n = nome?.trim(); if (!n) return null
  let q = svc.from('simulado_assuntos').select('id').eq('tenant_id', tenantId).ilike('nome', n)
  if (disciplinaId) q = q.eq('disciplina_id', disciplinaId)
  const { data: ex } = await q.maybeSingle()
  if (ex) return (ex as any).id
  const { data: cr, error } = await svc.from('simulado_assuntos').insert({ nome: n, tenant_id: tenantId, disciplina_id: disciplinaId ?? null }).select('id').single()
  if (error) { const { data: again } = await svc.from('simulado_assuntos').select('id').eq('tenant_id', tenantId).ilike('nome', n).maybeSingle(); return (again as any)?.id ?? null }
  return (cr as any).id
}

/** Lê o arquivo enviado e devolve a relação de questões, marcando as que já existem. */
export async function analisarQuestoesImport(formData: FormData): Promise<AnaliseImport> {
  const g = await guard(); if (!g.ok) return { ok: false, error: g.error }
  const arquivo = formData.get('arquivo') as File | null
  if (!arquivo || arquivo.size === 0) return { ok: false, error: 'Selecione um arquivo.' }

  let linhas: string[][]
  try { linhas = await lerLinhas(arquivo) } catch (e: any) { return { ok: false, error: 'Falha ao ler o arquivo: ' + (e?.message ?? '') } }
  const questoes = montarQuestoes(linhas)
  if (!questoes.length) return { ok: false, error: 'Nenhuma questão encontrada. Confira se há um cabeçalho e ao menos uma linha.' }

  // Dedupe por enunciado normalizado (contra as questões já cadastradas no tenant).
  const svc = createAdminClient()
  const { data: existentes } = await svc.from('simulado_questoes').select('id, enunciado').eq('tenant_id', g.tenantId).eq('deletado', false)
  const mapa = new Map<string, string>()
  for (const e of existentes ?? []) mapa.set(normEnun((e as any).enunciado ?? ''), (e as any).id)
  for (const q of questoes) {
    const id = mapa.get(normEnun(q.enunciado))
    if (id) { q.jaExiste = true; q.questaoIdExistente = id }
  }

  const resumo = {
    total: questoes.length,
    novas: questoes.filter((q) => !q.jaExiste && !q.erro).length,
    jaExistem: questoes.filter((q) => q.jaExiste).length,
    comErro: questoes.filter((q) => q.erro).length,
  }
  return { ok: true, questoes, resumo }
}

/** Cria as questões novas no sistema, ignora as já existentes e (se houver banco) vincula todas a ele. */
export async function confirmarImportQuestoes(bancoId: string | null, questoes: QuestaoImport[]): Promise<ResultadoImport> {
  const g = await guard(); if (!g.ok) return { ok: false, error: g.error }
  if (!questoes?.length) return { ok: false, error: 'Nada para importar.' }
  const svc = createAdminClient()

  const idsParaVincular: string[] = []
  let criadas = 0, jaExistiam = 0

  for (const q of questoes) {
    if (q.erro) continue
    if (q.jaExiste && q.questaoIdExistente) { idsParaVincular.push(q.questaoIdExistente); jaExistiam++; continue }

    const banca_id = await resolveNome(svc, 'simulado_bancas', g.tenantId, q.banca)
    const orgao_id = await resolveNome(svc, 'simulado_orgaos', g.tenantId, q.orgao)
    const disciplina_id = await resolveNome(svc, 'simulado_disciplinas', g.tenantId, q.disciplina)
    const assunto_id = await resolveAssunto(svc, g.tenantId, q.assunto, disciplina_id)

    const base: Record<string, unknown> = {
      tenant_id: g.tenantId, tipo: q.tipo, enunciado: q.enunciado, banca_id, orgao_id, disciplina_id, assunto_id,
      ano: q.ano ?? null, nivel_dificuldade: q.nivel_dificuldade ?? null, gabarito_tipo: 'oficial',
      comentario_professor: q.comentario_professor ?? null, status: 'publicada',
    }
    // Campos novos (existem após a migration). Se a coluna não existir ainda, reenvia só o base.
    const extra: Record<string, unknown> = {
      numero: q.numero ?? null, grupo: q.grupo ?? null, categoria: q.categoria ?? null,
      assunto_detalhe: q.assunto_detalhe ?? null, pilar_1: q.pilar_1 ?? null, pilar_2: q.pilar_2 ?? null, cargo: q.cargo ?? null,
      formato: q.formato ?? 'multipla',
    }
    // Insere a questão. Se alguma coluna nova ainda não existir no banco, remove SÓ ela e tenta de novo
    // (não perde os outros campos). Assim funciona antes e depois das migrations.
    let payloadQ: Record<string, unknown> = { ...base, ...extra }
    let novaId: string | null = null
    for (let tent = 0; tent < 10; tent++) {
      const r = await svc.from('simulado_questoes').insert(payloadQ).select('id').single()
      if (!r.error && r.data) { novaId = (r.data as any).id; break }
      const col = colFaltante(r.error?.message)
      if (col && col in payloadQ && !(col in base)) { delete payloadQ[col]; continue }
      break
    }
    if (!novaId) continue

    if (q.tipo === 'objetiva' && q.alternativas.length) {
      let payloadA: Record<string, unknown>[] = q.alternativas.map((a) => ({
        tenant_id: g.tenantId, questao_id: novaId, texto: a.texto, correta: a.correta, ordem: a.ordem, lei: a.lei ?? null, comentario: a.comentario ?? null,
      }))
      for (let tent = 0; tent < 6; tent++) {
        const r = await svc.from('simulado_alternativas').insert(payloadA)
        if (!r.error) break
        const col = colFaltante(r.error?.message)
        if (col && payloadA[0] && col in payloadA[0]) { payloadA = payloadA.map((x) => { const y = { ...x }; delete y[col]; return y }); continue }
        break
      }
    }
    idsParaVincular.push(novaId); criadas++
  }

  // Vincula ao banco (ignora as já vinculadas) — só quando há banco de destino.
  let vinculadas = 0
  if (bancoId && idsParaVincular.length) {
    const { data: jaTem } = await svc.from('simulado_questao_pasta').select('questao_id').eq('pasta_id', bancoId).in('questao_id', idsParaVincular)
    const existSet = new Set((jaTem ?? []).map((r: any) => r.questao_id))
    const novos = idsParaVincular.filter((id) => !existSet.has(id))
    if (novos.length) {
      const { error } = await svc.from('simulado_questao_pasta').insert(novos.map((questao_id) => ({ tenant_id: g.tenantId, pasta_id: bancoId, questao_id })))
      if (!error) vinculadas = novos.length
    }
  }

  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_questoes', entidadeId: bancoId ?? 'sistema', depois: { importadas: criadas, jaExistiam, vinculadas } })
  revalidatePath('/admin/questoes')
  if (bancoId) revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return { ok: true, criadas, jaExistiam, vinculadas }
}

/** Salva a ordem manual das questões dentro de um banco (lista de questao_id). */
export async function reordenarQuestoesBanco(bancoId: string, ordemIds: string[]): Promise<{ ok: boolean; error?: string }> {
  const g = await guard(); if (!g.ok) return g
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_pastas').update({ ordem_questoes: ordemIds }).eq('id', bancoId).eq('tenant_id', g.tenantId)
  if (error) {
    if (/ordem_questoes/i.test(error.message)) return { ok: false, error: 'Rode a migration ordem_questoes no banco.' }
    return { ok: false, error: error.message }
  }
  revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return { ok: true }
}

export type GrupoBanco = { id: string; nome: string; disciplinas: string[] }

/** Salva os grupos de disciplinas de um banco (pasta). */
export async function salvarGruposBanco(bancoId: string, grupos: GrupoBanco[]): Promise<{ ok: boolean; error?: string }> {
  const g = await guard()
  if (!g.ok) return g
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_pastas').update({ grupos }).eq('id', bancoId).eq('tenant_id', g.tenantId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/admin/banco-questoes/${bancoId}`)
  return { ok: true }
}
