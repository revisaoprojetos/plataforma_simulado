// Agregação PURA (sem I/O) da "Matriz" de Disciplinas e metas: junta disciplina do cronograma (flags) ↔ pasta(s) da Biblioteca
// ↔ contagem de documentos por tipo de material efetivo. Recebe tudo já carregado (SQL agregado no servidor) e só combina.

import { calcularHeranca } from './metas-pasta-heranca'
import type { ClasseDisc, LinhaMatrizDisciplina, TipoFlagDisc } from './metas-pasta-tipos'

const CLASSES: string[] = ['essencial', 'complementar', 'especifica']

/** Flag da disciplina → slug do tipo de material (catálogo) que ela governa. */
export const FLAG_PARA_TIPO: { flag: TipoFlagDisc; tipo: string }[] = [
  { flag: 'pdfull', tipo: 'pdfull' }, { flag: 'pdfight', tipo: 'pdfight' }, { flag: 'pdflash', tipo: 'pdflash' },
  { flag: 'legproc', tipo: 'legproc' }, { flag: 'juris', tipo: 'jurisclub' },
]

/** Chave de comparação de nomes: sem acento, minúsculas, espaços colapsados. */
export function chaveNome(s: string): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export interface EntradaMatriz {
  cfg: { nome: string; pdflash: boolean; pdfight: boolean; pdfull: boolean; juris: boolean; legproc: boolean; ativa: boolean; manual: boolean; aulas: number }[]
  disciplinas: { id: string; nome: string; classificacao: string | null }[]
  pastas: { id: string; nome: string; paiId: string | null; disciplinaId: string | null; tipoMaterial: string | null }[]
  slugs: ReadonlySet<string>
  /** Documentos DIRETOS por pasta. */
  docsDiretos: ReadonlyMap<string, number>
  /** Planos ativos por pasta (subárvore). */
  planos: ReadonlyMap<string, number>
}

export function agregarMatriz(e: EntradaMatriz): LinhaMatrizDisciplina[] {
  const her = calcularHeranca(e.pastas.map((p) => ({ id: p.id, paiId: p.paiId, disciplinaId: p.disciplinaId, tipoMaterial: p.tipoMaterial })), e.slugs)
  const discPorNome = new Map(e.disciplinas.map((d) => [chaveNome(d.nome), d]))
  const pastasDaDisc = new Map<string, typeof e.pastas>()
  const filhos = new Map<string, typeof e.pastas>()
  for (const p of e.pastas) {
    if (p.disciplinaId) pastasDaDisc.set(p.disciplinaId, [...(pastasDaDisc.get(p.disciplinaId) ?? []), p])
    if (p.paiId) filhos.set(p.paiId, [...(filhos.get(p.paiId) ?? []), p])
  }

  const linhas = e.cfg.map((c): LinhaMatrizDisciplina => {
    const disc = discPorNome.get(chaveNome(c.nome))
    const raizes = disc ? pastasDaDisc.get(disc.id) ?? [] : []
    const docsPorTipo: Record<string, number> = {}
    let docsTotal = 0; let planosAtivos = 0
    const visto = new Set<string>()
    for (const r of raizes) {
      planosAtivos += e.planos.get(r.id) ?? 0
      const pilha = [r]
      while (pilha.length) {
        const p = pilha.pop()!
        if (visto.has(p.id)) continue
        visto.add(p.id)
        const n = e.docsDiretos.get(p.id) ?? 0
        if (n > 0) {
          const t = her.get(p.id)?.tipoEfetivo ?? 'pdfull'
          docsPorTipo[t] = (docsPorTipo[t] ?? 0) + n; docsTotal += n
        }
        // Subpasta que é OUTRA disciplina não entra na contagem desta.
        for (const f of filhos.get(p.id) ?? []) if (!f.disciplinaId || f.disciplinaId === disc!.id) pilha.push(f)
      }
    }
    const divergencias: TipoFlagDisc[] = []
    if (raizes.length && c.ativa) {
      for (const { flag, tipo } of FLAG_PARA_TIPO) {
        const n = docsPorTipo[tipo] ?? 0
        if ((c[flag] && n === 0) || (!c[flag] && n > 0)) divergencias.push(flag)
      }
    }
    return {
      nome: c.nome,
      classe: disc && CLASSES.includes(String(disc.classificacao)) ? (disc.classificacao as ClasseDisc) : null,
      ativa: c.ativa, pdfull: c.pdfull, pdfight: c.pdfight, pdflash: c.pdflash, legproc: c.legproc, juris: c.juris,
      manual: c.manual, aulas: c.aulas,
      pastas: raizes.map((r) => ({ id: r.id, nome: r.nome })),
      docsPorTipo, docsTotal, planosAtivos, divergencias,
    }
  })
  return linhas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** Parâmetros da rota de documentos da pasta (sanitizados). `null` = pasta inválida. */
export function lerParamsDocs(get: (k: string) => string | null): { pastaId: string; page: number; q: string; sub: boolean } | null {
  const pastaId = get('pasta') ?? ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pastaId)) return null
  const page = Math.max(1, Math.min(100000, Math.floor(Number(get('page') ?? 1)) || 1))
  return { pastaId, page, q: (get('q') ?? '').trim().slice(0, 80), sub: get('sub') === '1' }
}

/** Rejeita se `p` não resolver em `ms` (a rota responde 504 em vez de pendurar a UI). */
export function comTimeout<T>(p: Promise<T>, ms: number, msg = 'Tempo esgotado ao consultar o banco.'): Promise<T> {
  let t: ReturnType<typeof setTimeout>
  const limite = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error(msg)), ms) })
  return Promise.race([p, limite]).finally(() => clearTimeout(t))
}
