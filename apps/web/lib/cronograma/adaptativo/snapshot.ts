// Snapshot de leitura do Cronograma Adaptativo (backend-first: a página server
// computa isto e passa pronto ao client). Deriva, do Estado + conteúdo, tudo que
// as 4 telas precisam: Hoje, Semana, Desempenho, Configurar. Módulo PURO.

import {
  type DataISO, type Cfg, dParse, dAdd, dDow, semInicio, horasDia, ehRev, recessoEm,
  acertoTema, saudePlano, minPdf, VID_MIN,
} from './engine'
import { type Estado, type ProgMeta, indexar, info, feito, estadoMeta, atrasadas, semAtual, hojeISO } from './estado'
import { type Conteudo, TIPOS, COR, DIAS, DIAS3, tipoBase, ehMetaRev } from './conteudo'

export interface MetaVM {
  id: string
  tipo: string
  tipoNome: string
  tipoCor: string // css var (--pf/--fl/--qu/--lp)
  tipoCorSoft: string
  disc: string
  discCor: string // hex
  aula: string
  tema: string
  titulo: string
  data: DataISO
  durMin: number
  estado: '' | 'done' | 'missed'
  parcial: string | null
  atrasada: boolean
  grau: number | null
  resolverHref: string | null
  qtd: number
  tempoSeg: number
  pags: number | null
  parte: number | null
}

export interface DiaVM { data: DataISO; dow: number; diaNome: string; dia3: string; metas: MetaVM[]; cargaMin: number; capMin: number; hoje: boolean }
export interface SemanaVM { n: number; ini: DataISO; fim: DataISO; kind: 'conteudo' | 'revisao' | 'recesso'; dias: DiaVM[]; ok: number; tot: number }
export interface HojeVM { data: DataISO; metas: MetaVM[]; cargaMin: number; capMin: number; atrasadas: number; proximos: Array<{ data: DataISO; diaNome: string; metas: MetaVM[] }> }
export interface PorDiscVM { disc: string; cor: string; feitas: number; total: number; pct: number; acerto: number | null }
export interface DesempenhoVM {
  pct: number; feitas: number; total: number
  porDisc: PorDiscVM[]
  ritmo: { planejadasAteHoje: number; feitasAteHoje: number; atrasado: boolean; delta: number }
  erros: Array<{ disc: string; aula: string; tema: string; acerto: number }>
  tempoTotalSeg: number
}
export interface ConfigVM {
  cfg: Cfg
  saude: ReturnType<typeof saudePlano>
  nDias: number
  previa: { semanas: number; atividades: number; horasSemana: number }
}
export interface AdaptativoSnapshot {
  temPlano: boolean
  exemplo: boolean
  cfg: Cfg
  hoje: HojeVM
  semanas: SemanaVM[]
  semAtual: number
  fim: number
  desempenho: DesempenhoVM
  config: ConfigVM
  pausa: { desde: DataISO } | null
}

function metaVM(st: Estado, conteudo: Conteudo, id: string, data: DataISO, horas: number, hoje: DataISO): MetaVM {
  const i = info(id, conteudo)
  const t = i.tipo
  const def = TIPOS[t] || TIPOS.pf
  const disc = i.disc || ''
  const prog: ProgMeta = st.prog[id] || {}
  const s = estadoMeta(st, id)
  const titulo = t === 'lp' ? (i.texto || 'Lei seca') : (i.tema || i.disc || '')
  const qtd = t === 'qu' || t === 'rq' ? 1 : 0
  return {
    id,
    tipo: t,
    tipoNome: def.nome,
    tipoCor: def.c,
    tipoCorSoft: def.cs,
    disc,
    discCor: COR[disc] || '#6b6b6b',
    aula: i.aula || '',
    tema: i.tema || '',
    titulo,
    data,
    durMin: Math.round((horas || 0) * 60),
    estado: s as MetaVM['estado'],
    parcial: prog.parou?.v || null,
    atrasada: data < hoje && s !== 'done',
    grau: st.notas['pf:' + i.idx]?.grau ?? null,
    resolverHref: (t === 'qu' || t === 'rq') ? id : null,
    qtd,
    tempoSeg: prog.t || 0,
    pags: i.pags ?? null,
    parte: i.parte ?? null,
  }
}

export function construirSnapshot(st: Estado, conteudo: Conteudo, hoje: DataISO = hojeISO()): AdaptativoSnapshot {
  const { IDX, RV } = indexar(st, conteudo, hoje)
  const pos = (id: string): [DataISO, number] | undefined => st.plano[id] || RV[id]

  // --- Semanas (grade) ---
  const semanas: SemanaVM[] = []
  for (let n = 1; n <= (st.fim || 1); n++) {
    const ini = semInicio(st.cfg.start, n)
    const fim = dAdd(ini, 6)
    const diasData = [0, 1, 2, 3, 4, 5, 6].map((k) => dAdd(ini, k))
    const nRecesso = diasData.filter((d) => recessoEm(st.cfg, d)).length
    const kind: SemanaVM['kind'] = ehRev(st.cfg, n) ? 'revisao' : nRecesso >= 4 ? 'recesso' : 'conteudo'
    const dias: DiaVM[] = diasData.map((d) => {
      const ids = (IDX[d] || [])
      const metas = ids.map((id) => { const p = pos(id); return metaVM(st, conteudo, id, d, p ? p[1] : 0, hoje) })
      const cargaMin = metas.reduce((s, m) => s + m.durMin, 0)
      return { data: d, dow: dDow(d), diaNome: DIAS[dDow(d)], dia3: DIAS3[dDow(d)], metas, cargaMin, capMin: Math.round(horasDia(st.cfg, d) * 60), hoje: d === hoje }
    })
    const tot = dias.reduce((s, d) => s + d.metas.length, 0)
    const ok = dias.reduce((s, d) => s + d.metas.filter((m) => m.estado === 'done').length, 0)
    semanas.push({ n, ini, fim, kind, dias, ok, tot })
  }

  // --- Hoje ---
  const metasHoje = (IDX[hoje] || []).map((id) => { const p = pos(id); return metaVM(st, conteudo, id, hoje, p ? p[1] : 0, hoje) })
  const proximos: HojeVM['proximos'] = []
  for (let k = 1; k <= 7 && proximos.length < 3; k++) {
    const d = dAdd(hoje, k); const ids = IDX[d] || []
    if (ids.length) proximos.push({ data: d, diaNome: DIAS[dDow(d)], metas: ids.map((id) => { const p = pos(id); return metaVM(st, conteudo, id, d, p ? p[1] : 0, hoje) }) })
  }
  const hojeVM: HojeVM = {
    data: hoje,
    metas: metasHoje,
    cargaMin: metasHoje.reduce((s, m) => s + m.durMin, 0),
    capMin: Math.round(horasDia(st.cfg, hoje) * 60),
    atrasadas: atrasadas(st, hoje).length,
    proximos,
  }

  // --- Desempenho ---
  const todosIds = [...Object.keys(st.plano), ...Object.keys(RV)]
  const total = todosIds.length
  const feitas = todosIds.filter((id) => feito(st, id)).length
  // por disciplina
  const porDiscMap = new Map<string, { feitas: number; total: number; res: number; err: number }>()
  for (const id of todosIds) {
    const i = info(id, conteudo); const disc = i.disc; if (!disc) continue
    const cur = porDiscMap.get(disc) || { feitas: 0, total: 0, res: 0, err: 0 }
    cur.total++; if (feito(st, id)) cur.feitas++
    porDiscMap.set(disc, cur)
  }
  // acerto por disciplina a partir das notas (res/err por índice de aula)
  const aulasDaDisc = new Map<string, number[]>()
  conteudo.AS.forEach((a, idx) => { const arr = aulasDaDisc.get(a[0]) || []; arr.push(idx); aulasDaDisc.set(a[0], arr) })
  const porDisc: PorDiscVM[] = [...porDiscMap.entries()].map(([disc, v]) => {
    let res = 0, err = 0
    for (const idx of (aulasDaDisc.get(disc) || [])) { const ac = acertoTema(st.notas, idx); if (ac) { res += ac.res; err += ac.err } }
    const acerto = res ? Math.max(0, (res - err) / res * 100) : null
    return { disc, cor: COR[disc] || '#6b6b6b', feitas: v.feitas, total: v.total, pct: v.total ? Math.round(v.feitas / v.total * 100) : 0, acerto: acerto == null ? null : Math.round(acerto) }
  }).sort((a, b) => b.total - a.total)
  // ritmo
  const planejadasAteHoje = todosIds.filter((id) => { const p = pos(id); return p && p[0] <= hoje }).length
  const feitasAteHoje = todosIds.filter((id) => { const p = pos(id); return p && p[0] <= hoje && feito(st, id) }).length
  // erros: temas com menor acerto
  const erros: DesempenhoVM['erros'] = []
  conteudo.AS.forEach((a, idx) => { const ac = acertoTema(st.notas, idx); if (ac && ac.res >= 1) erros.push({ disc: a[0], aula: a[1], tema: a[2], acerto: Math.round(ac.pct) }) })
  erros.sort((a, b) => a.acerto - b.acerto)
  const tempoTotalSeg = Object.values(st.prog).reduce((s, p) => s + (p.t || 0), 0)
  const desempenho: DesempenhoVM = {
    pct: total ? Math.round(feitas / total * 100) : 0,
    feitas, total, porDisc,
    ritmo: { planejadasAteHoje, feitasAteHoje, atrasado: feitasAteHoje < planejadasAteHoje, delta: feitasAteHoje - planejadasAteHoje },
    erros: erros.slice(0, 8),
    tempoTotalSeg,
  }

  // --- Config ---
  const nDias = st.cfg.horas.filter((h) => h > 0).length
  const horasSemana = st.cfg.horas.reduce((s, h) => s + h, 0)
  const atividades = total
  const config: ConfigVM = {
    cfg: st.cfg,
    saude: saudePlano(st.plano, st.cfg),
    nDias,
    previa: { semanas: st.fim || 0, atividades, horasSemana },
  }

  return {
    temPlano: total > 0,
    exemplo: !!st.exemplo,
    cfg: st.cfg,
    hoje: hojeVM,
    semanas,
    semAtual: semAtual(st, hoje),
    fim: st.fim || 1,
    desempenho,
    config,
    pausa: st.pausa,
  }
}

export { minPdf, VID_MIN, tipoBase, ehMetaRev }
