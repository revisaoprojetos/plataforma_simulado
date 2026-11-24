/**
 * VERIFICAÇÃO DAS REGRAS VIGENTES DO MOTOR (Cronograma Adaptativo). Puro, sem I/O, não altera o motor.
 * Checagens: cobertura de horas das faixas, restrições conflitantes/inválidas (via `validarRegras`), diferenças em relação ao padrão 2.0.
 */
import type { ItemVerificacao } from '../../admin/fluxo/verificacao'
import { REGRAS_PADRAO, type RegrasMotor } from './regras'
import { validarRegras } from './regras-validacao'

const fh = (min: number): string => { const h = Math.floor(min / 60), m = min % 60; return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h` }

/** Faixas: começam em 0, sem lacuna nem sobreposição, última aberta. Cada lacuna aponta o nó da árvore A (`f.d{k}`). */
export function verificarCoberturaFaixas(R: RegrasMotor): ItemVerificacao[] {
  const out: ItemVerificacao[] = [], f = R.faixas
  if (!f.length) return [{ id: 'fx:vazio', severidade: 'erro', categoria: 'sistema', titulo: 'Sem faixas de carga', descricao: 'Nenhuma faixa definida: nenhuma carga semanal tem regra.', diagrama: 'faixa' }]
  if (f[0].minMin !== 0) out.push({ id: 'fx:ini', severidade: 'erro', categoria: 'sistema', titulo: 'Faixa sem cobertura de horas', descricao: `Cargas de 0 a ${fh(f[0].minMin - 1)} por semana não têm faixa (a 1ª faixa começa em ${fh(f[0].minMin)}).`, diagrama: 'faixa', noId: 'f.carga' })
  for (let k = 1; k < f.length; k++) {
    const a = f[k - 1], b = f[k]
    if (a.maxMin == null) { out.push({ id: `fx:aberta${k}`, severidade: 'erro', categoria: 'sistema', titulo: 'Faixa aberta no meio', descricao: `“${a.nome}” não tem limite superior, mas há faixas depois dela.`, diagrama: 'faixa', noId: `f.r${k - 1}` }); continue }
    if (b.minMin > a.maxMin + 1) out.push({ id: `fx:gap${k}`, severidade: 'erro', categoria: 'sistema', titulo: 'Faixa sem cobertura de horas', descricao: `Cargas entre ${fh(a.maxMin + 1)} e ${fh(b.minMin - 1)} por semana não pertencem a nenhuma faixa (entre “${a.nome}” e “${b.nome}”).`, diagrama: 'faixa', noId: `f.d${k - 1}` })
    else if (b.minMin <= a.maxMin) out.push({ id: `fx:ov${k}`, severidade: 'erro', categoria: 'sistema', titulo: 'Faixas sobrepostas', descricao: `“${a.nome}” e “${b.nome}” se sobrepõem (${fh(b.minMin)} a ${fh(a.maxMin)}).`, diagrama: 'faixa', noId: `f.d${k - 1}` })
  }
  const u = f[f.length - 1]
  if (u.maxMin != null) out.push({ id: 'fx:fim', severidade: 'aviso', categoria: 'sistema', titulo: 'Faixa sem cobertura de horas', descricao: `Cargas acima de ${fh(u.maxMin)} por semana não têm faixa (a última faixa deveria ser aberta).`, diagrama: 'faixa', noId: `f.r${f.length - 1}` })
  return out
}

/** Folhas diferentes entre duas árvores JSON (caminhos `a.b.0.c`). */
export function diferencasFolhas(a: unknown, b: unknown, prefixo = '', out: string[] = []): string[] {
  const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
  if (obj(a) && obj(b)) { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diferencasFolhas(a[k], b[k], prefixo ? `${prefixo}.${k}` : k, out); return out }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) { a.forEach((x, i) => diferencasFolhas(x, b[i], `${prefixo}.${i}`, out)); return out }
  if (JSON.stringify(a) !== JSON.stringify(b)) out.push(prefixo)
  return out
}

const SECAO_NO: Record<string, string> = { faixas: 'c.rotina', restricoes: 'd.restr', limitesDia: 'd.lim', retaFinal: 'rf.d', juris: 'j.d2', legproc: 'l.res', desempenho: 'e.ac', revisao: 'r.d', adaptacao: 'm.dom' }

/** Regras que divergem do padrão 2.0 (informativo; o padrão é o provado pelo golden). */
export function verificarDiferencasPadrao(R: RegrasMotor): ItemVerificacao[] {
  const out: ItemVerificacao[] = []
  for (const sec of Object.keys(REGRAS_PADRAO) as Array<keyof RegrasMotor>) {
    if (sec === 'versaoSchema') continue
    const d = diferencasFolhas(REGRAS_PADRAO[sec], R[sec], String(sec))
    if (!d.length) continue
    out.push({ id: `pd:${sec}`, severidade: 'info', categoria: 'sistema', titulo: `“${String(sec)}” difere do padrão 2.0`, descricao: `${d.length} valor(es) alterado(s): ${d.slice(0, 5).join(', ')}${d.length > 5 ? '…' : ''}.`, ...(SECAO_NO[sec] ? { noId: SECAO_NO[sec] } : {}) })
  }
  return out
}

/** Tudo do sistema: cobertura + validação oficial (erros/conflitos de restrições) + diferenças do padrão. */
export function verificarRegrasMotor(R: RegrasMotor): ItemVerificacao[] {
  const out = verificarCoberturaFaixas(R)
  const v = validarRegras(R)
  v.erros.forEach((m, k) => out.push({ id: `vr:e${k}`, severidade: 'erro', categoria: 'sistema', titulo: 'Regra inválida', descricao: m }))
  ;(v.avisos ?? []).forEach((m, k) => out.push({ id: `vr:a${k}`, severidade: 'aviso', categoria: 'sistema', titulo: 'Restrições em conflito', descricao: m, diagrama: 'dia', noId: 'd.restr' }))
  out.push(...verificarDiferencasPadrao(R))
  return out
}
