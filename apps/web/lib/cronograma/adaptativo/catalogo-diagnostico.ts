import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { remember } from '@/lib/cache/relatorio-cache'
import { carregarConteudoBanco } from './conteudo-banco'
import { lerCfgMetas } from './config-metas'
import { chaveDisciplina } from './catalogo-html'

/**
 * DIAGNÓSTICO DO CATÁLOGO QUE O MOTOR CONSOME (admin › Cronograma adaptativo › Catálogo).
 * Só leitura: mostra, por disciplina, quantas aulas entram na distribuição, quantas metas de LegProc, leis,
 * páginas informadas e se gera revisão — e aponta problemas que fazem o motor estimar/pular conteúdo.
 * O conteúdo em si é editado na Biblioteca (pastas por disciplina + subpastas tipadas).
 */

export interface LinhaDisciplina {
  nome: string
  classificacao: string | null
  aulas: number // aulas ativas na ordem de distribuição
  semPaginas: number // aulas sem nº de páginas (motor estima 60)
  paginas: number // total de páginas informadas
  legprocMetas: number
  leis: number
  semRevisao: boolean // disciplina fora da revisão regular (config)
}
export interface Aviso { nivel: 'alto' | 'medio' | 'info'; texto: string }
export interface CatalogoMotor {
  vazio: boolean
  totais: { aulas: number; semPaginas: number; legprocMetas: number; leis: number; disciplinas: number }
  disciplinas: LinhaDisciplina[]
  /** primeiras aulas da ORDEM GLOBAL de distribuição (a fila real de PDFull). */
  ordemInicial: Array<{ pos: number; disc: string; aula: string; tema: string }>
  avisos: Aviso[]
}

export async function diagnosticarCatalogo(svc: SupabaseClient, tenantId: string): Promise<CatalogoMotor> {
  return remember<CatalogoMotor>(`crono-catalogo-diag:${tenantId}`, 60, async () => {
    const [c, cfg] = await Promise.all([carregarConteudoBanco(svc, tenantId), lerCfgMetas(svc, tenantId)])
    const semFlash = new Set(cfg.semFlash.map((d) => chaveDisciplina(d)))
    const ordem = c.ordem && c.ordem.length ? c.ordem : c.AS.map((_, i) => i)
    const porDisc = new Map<string, LinhaDisciplina>()
    const linha = (nome: string): LinhaDisciplina => {
      const k = chaveDisciplina(nome)
      let l = porDisc.get(k)
      if (!l) {
        const info = c.disciplinas.find((d) => chaveDisciplina(d.nome) === k)
        l = { nome: info?.nome ?? nome, classificacao: info?.classificacao ?? null, aulas: 0, semPaginas: 0, paginas: 0, legprocMetas: 0, leis: 0, semRevisao: semFlash.has(k) }
        porDisc.set(k, l)
      }
      return l
    }
    for (const i of ordem) {
      const a = c.AS[i]; if (!a) continue
      const l = linha(String(a[0])); l.aulas++
      const p = Number(a[3]) || 0
      if (p > 0) l.paginas += p; else l.semPaginas++
    }
    const leisPorDisc = new Map<string, Set<string>>()
    for (const m of c.LP ?? []) {
      if (!m.disc) continue
      const l = linha(m.disc); l.legprocMetas++
      const k = chaveDisciplina(m.disc)
      if (!leisPorDisc.has(k)) leisPorDisc.set(k, new Set())
      leisPorDisc.get(k)!.add(m.lei)
    }
    for (const [k, s] of leisPorDisc) { const l = porDisc.get(k); if (l) l.leis = s.size }
    const disciplinas = [...porDisc.values()].sort((a, b) => b.aulas - a.aulas || a.nome.localeCompare(b.nome, 'pt-BR'))
    const totais = {
      aulas: disciplinas.reduce((s, d) => s + d.aulas, 0),
      semPaginas: disciplinas.reduce((s, d) => s + d.semPaginas, 0),
      legprocMetas: disciplinas.reduce((s, d) => s + d.legprocMetas, 0),
      leis: disciplinas.reduce((s, d) => s + d.leis, 0),
      disciplinas: disciplinas.length,
    }
    const avisos: Aviso[] = []
    if (c.vazio) avisos.push({ nivel: 'alto', texto: 'A Biblioteca ainda não está vinculada ao cronograma — o motor usa o conteúdo-semente padrão. Vincule as pastas de disciplina na Biblioteca.' })
    if (totais.semPaginas > 0) avisos.push({ nivel: 'medio', texto: `${totais.semPaginas} aula(s) sem número de páginas: o motor estima 60 páginas e a duração do PDFull pode ficar imprecisa.` })
    const semLp = disciplinas.filter((d) => d.aulas > 0 && d.legprocMetas === 0).map((d) => d.nome)
    if (semLp.length) avisos.push({ nivel: 'info', texto: `Disciplinas com aulas mas sem LegProc: ${semLp.join(', ')}.` })
    const soLp = disciplinas.filter((d) => d.aulas === 0 && d.legprocMetas > 0).map((d) => d.nome)
    if (soLp.length) avisos.push({ nivel: 'info', texto: `Disciplinas só com LegProc (sem aulas de PDFull): ${soLp.join(', ')}.` })
    const fantasma = cfg.semFlash.filter((n) => !porDisc.has(chaveDisciplina(n)))
    if (fantasma.length) avisos.push({ nivel: 'info', texto: `Em "sem revisão regular" há disciplina(s) que não existem no catálogo atual: ${fantasma.join(', ')}.` })
    const ordemInicial = ordem.slice(0, 24).map((i, pos) => { const a = c.AS[i]; return { pos: pos + 1, disc: String(a?.[0] ?? ''), aula: String(a?.[1] ?? ''), tema: String(a?.[2] ?? '') } }).filter((x) => x.disc)
    return { vazio: !!c.vazio, totais, disciplinas, ordemInicial, avisos }
  })
}
