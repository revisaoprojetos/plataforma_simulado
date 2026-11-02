// Helpers PUROS da área Ofertas (usados no servidor — page/export — e no client).
import type { OfertaAdmin } from '@/lib/integracoes/liberacao/ofertas'

/** Código curto, derivado e estável do id (a oferta não tem campo de código). */
export function codigoOferta(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return String(h % 10000).padStart(4, '0')
}

export function rotuloSituacao(s: OfertaAdmin['status']): string {
  return s === 'active' ? 'Publicada' : s === 'canceled' ? 'Cancelada' : 'Rascunho'
}

export function dataBr(d: string | null | undefined): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return day && m && y ? `${day}/${m}/${y}` : d
}

export function acessoLabel(o: OfertaAdmin): string {
  return o.fim?.tipo === 'fixed_date' ? `até ${dataBr((o.fim as any).data)}` : 'Vitalício'
}

export type FiltrosOferta = {
  q: string
  situacao: '' | OfertaAdmin['status']
  acesso: '' | 'vitalicio' | 'data'
  sort: 'codigo' | 'nome' | 'conteudos' | 'acessos'
  dir: 'asc' | 'desc'
}

export function normalizarFiltrosOferta(raw: Record<string, unknown>): FiltrosOferta {
  const s = (v: unknown) => (typeof v === 'string' ? v : '')
  const sit = s(raw.situacao)
  const ac = s(raw.acesso)
  const sort = s(raw.sort)
  return {
    q: s(raw.q).trim().slice(0, 120),
    situacao: sit === 'active' || sit === 'paused' || sit === 'canceled' ? sit : '',
    acesso: ac === 'vitalicio' || ac === 'data' ? ac : '',
    sort: sort === 'nome' || sort === 'conteudos' || sort === 'acessos' ? sort : 'codigo',
    dir: s(raw.dir) === 'asc' ? 'asc' : 'desc',
  }
}

/** Busca + filtros + ordenação (ofertas são poucas: em memória no servidor). */
export function filtrarOrdenarOfertas(todas: OfertaAdmin[], f: FiltrosOferta): OfertaAdmin[] {
  const q = f.q.toLowerCase()
  const lista = todas.filter((o) =>
    (!q || o.nome.toLowerCase().includes(q) || codigoOferta(o.id).includes(q)) &&
    (!f.situacao || o.status === f.situacao) &&
    (!f.acesso || (f.acesso === 'data' ? o.fim?.tipo === 'fixed_date' : o.fim?.tipo !== 'fixed_date')),
  )
  const fator = f.dir === 'asc' ? 1 : -1
  return lista.sort((a, b) => {
    let d = 0
    if (f.sort === 'nome') d = a.nome.localeCompare(b.nome, 'pt-BR')
    else if (f.sort === 'conteudos') d = a.produtoIds.length - b.produtoIds.length
    else if (f.sort === 'acessos') d = a.grantsAtivos - b.grantsAtivos
    else d = codigoOferta(a.id).localeCompare(codigoOferta(b.id))
    return d * fator
  })
}
