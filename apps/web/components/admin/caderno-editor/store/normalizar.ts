// Normalização/migração ON-LOAD do editor de cadernos.
// Recebe o `config` cru (JSONB de simulado_cadernos_designer) + os metadados das COLUNAS
// (nome/cor/icone/capa) e devolve o estado inicial já saneado para o editor:
//  - migra cadernos v1 (config.blocos/cabecalho/instrucoes) → docsV2 (compatível com migração);
//  - garante um doc por modalidade (semente quando falta);
//  - preenche defaults de atributos ausentes por bloco (protege o inspetor de undefined);
//  - lê material/material_enunciado.
// NÃO toca base64 (o save/impressão hospedam) e NÃO grava nada — é puro e idempotente.

import {
  HUD_CORES_PADRAO, RUNNING_PADRAO, docCadernoCompleto, docCadernoPerguntas, novoDoc,
  mesclarModalidades, genId, type CadernoDoc, type Modalidade, type HudCores, type HudPorPagina, type Block,
} from '@/lib/caderno-designer/types'
import { getBlockMeta } from '@/lib/caderno-designer/blocks'
import { materialDoConfig, materialEnunciadoDoConfig, type MaterialCaderno } from '@/lib/caderno-designer/material'

export type MetaCaderno = { nome: string; cor: string | null; icone: string | null; capa: string | null }

export type EditorInicial = {
  docs: Record<string, CadernoDoc>
  modalidades: Modalidade[]
  cores: Record<string, string>
  hudCores: HudCores
  hudPorPagina: HudPorPagina
  bancoId: string | null
  material: MaterialCaderno
  materialEnunciado: MaterialCaderno
  /** true quando o caderno estava no formato v1 e foi migrado ao abrir. */
  migradoV1: boolean
}

const defaultsDe = (type: string): Record<string, unknown> => ({ ...(getBlockMeta(type)?.defaults ?? {}) })

/** Preenche defaults de atributos ausentes (recursivo, idempotente). */
function completarBlocos(blocks: Block[] | undefined): Block[] {
  return (blocks ?? []).map((b) => {
    const attrs = { ...defaultsDe(b.type), ...(b.attributes ?? {}) }
    return b.innerBlocks ? { ...b, attributes: attrs, innerBlocks: completarBlocos(b.innerBlocks) } : { ...b, attributes: attrs }
  })
}

/** Garante o shape completo do doc (páginas/cabeçalho/rodapé/running) + defaults dos blocos. */
function completarDoc(doc: CadernoDoc): CadernoDoc {
  const base = novoDoc()
  return {
    ...base, ...doc,
    pages: (doc.pages?.length ? doc.pages : base.pages).map((p) => ({ ...p, blocks: completarBlocos(p.blocks) })),
    cabecalho: completarBlocos(doc.cabecalho),
    rodape: completarBlocos(doc.rodape),
    running: doc.running ?? { ...RUNNING_PADRAO },
  }
}

/** Migra um caderno v1 (config.blocos/cabecalho/instrucoes) em um CadernoDoc de blocos v2. */
function migrarV1(config: any): CadernoDoc {
  const bloco = (type: string, patch: Record<string, unknown> = {}, innerBlocks?: Block[]): Block =>
    innerBlocks ? { id: genId('b'), type, attributes: { ...defaultsDe(type), ...patch }, innerBlocks } : { id: genId('b'), type, attributes: { ...defaultsDe(type), ...patch } }
  const blocks: Block[] = []
  if (config.cabecalho) blocks.push(bloco('titulo-secao', { texto: String(config.cabecalho), nivel: 1 }))
  if (config.instrucoes) blocks.push(bloco('instrucoes', { texto: String(config.instrucoes) }))
  for (const b of (config.blocos ?? []) as any[]) {
    if (b?.tipo === 'texto') blocks.push(bloco('texto-livre', { texto: String(b.conteudo ?? '') }))
  }
  // As questões v1 (listadas por id) viram um repetidor pelo banco vinculado (modelo do v2).
  if ((config.blocos ?? []).some((b: any) => b?.tipo === 'questao')) {
    blocks.push(bloco('repeticao', {}, [
      bloco('titulo-secao', { texto: 'Questão {q_num}', nivel: 2, mostrarLinha: false }),
      bloco('texto-livre', { texto: '{q_enunciado}' }),
      bloco('alternativas', {}),
    ]))
  }
  return { versao: 1, pages: [{ id: genId('page'), kind: 'conteudo', titulo: 'Página 1', blocks }], cabecalho: [], rodape: [], running: { ...RUNNING_PADRAO } }
}

/** Semente por modalidade quando não há doc salvo. */
function semente(modId: string): CadernoDoc {
  return modId === 'caderno_completo' ? docCadernoCompleto() : modId === 'caderno_perguntas' ? docCadernoPerguntas() : novoDoc()
}

export function normalizarConfig(configCru: unknown, meta: MetaCaderno): { inicial: EditorInicial; meta: MetaCaderno } {
  const config = (configCru ?? {}) as any
  const modalidades = mesclarModalidades(config.modalidadesV2)
  const docsSalvos = (config.docsV2 ?? {}) as Record<string, CadernoDoc>
  const migradoV1 = !config.docsV2 && Array.isArray(config.blocos) && config.blocos.length > 0
  const docV1 = migradoV1 ? completarDoc(migrarV1(config)) : null

  const docs: Record<string, CadernoDoc> = {}
  for (const m of modalidades) {
    if (docsSalvos[m.id]) docs[m.id] = completarDoc(docsSalvos[m.id])
    else if (docV1 && m.id === 'caderno_perguntas') docs[m.id] = docV1
    else docs[m.id] = semente(m.id)
  }
  // Preserva docs de modalidades salvas fora da lista canônica (raro, mas não perde conteúdo).
  for (const id of Object.keys(docsSalvos)) if (!docs[id]) docs[id] = completarDoc(docsSalvos[id])

  return {
    inicial: {
      docs, modalidades,
      cores: (config.cores ?? {}) as Record<string, string>,
      hudCores: { ...HUD_CORES_PADRAO, ...((config.hudCores ?? {}) as Partial<HudCores>) },
      hudPorPagina: (config.hudPorPagina ?? {}) as HudPorPagina,
      bancoId: (config.bancoId ?? null) as string | null,
      material: materialDoConfig(config),
      materialEnunciado: materialEnunciadoDoConfig(config),
      migradoV1,
    },
    meta,
  }
}
