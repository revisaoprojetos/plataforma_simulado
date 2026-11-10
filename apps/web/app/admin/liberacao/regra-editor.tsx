'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { RegraAdmin, ProdutoSeletor } from '@/lib/integracoes/liberacao/dados'
import type { CriterioValor, InicioConfig, FimConfig, ModoNome } from '@/lib/integracoes/liberacao/tipos'
import type { SalvarRegraInput } from './actions-tipos'

const PROVIDERS_SUGERIDOS = ['guru', 'hotmart', 'kiwify', 'hubla', 'curseduca', 'manual']
const sel = 'h-9 rounded-lg border bg-background px-2 text-sm'

/** Editor de UM critério de produto/oferta (tipo id|nome + modo + valor). */
function CriteriosEditor({ titulo, criterios, onChange }: { titulo: string; criterios: CriterioValor[]; onChange: (c: CriterioValor[]) => void }) {
  const setI = (i: number, patch: Partial<CriterioValor>) => onChange(criterios.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{titulo}</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...criterios, { tipo: 'id', valor: '' }])}>
          <Plus className="h-3.5 w-3.5" />critério
        </Button>
      </div>
      {criterios.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">Sem filtro (qualquer {titulo.toLowerCase()}).</p>
      ) : (
        <div className="space-y-2">
          {criterios.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select className={sel} value={c.tipo} onChange={(e) => setI(i, { tipo: e.target.value as 'id' | 'nome' })}>
                <option value="id">por ID</option>
                <option value="nome">por nome</option>
              </select>
              {c.tipo === 'nome' && (
                <select className={sel} value={c.modo ?? 'igual'} onChange={(e) => setI(i, { modo: e.target.value as ModoNome })}>
                  <option value="igual">igual a</option>
                  <option value="contem">contém</option>
                  <option value="comeca">começa com</option>
                </select>
              )}
              <Input className="h-9 min-w-0 flex-1" value={c.valor} placeholder={c.tipo === 'id' ? 'ID exato' : 'texto'} onChange={(e) => setI(i, { valor: e.target.value })} />
              <Button type="button" variant="ghost" size="icon" aria-label="Remover" onClick={() => onChange(criterios.filter((_, idx) => idx !== i))}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function RegraEditor({ regra, produtos, salvando, onSalvar, onFechar }: {
  regra: RegraAdmin | null
  produtos: ProdutoSeletor[]
  salvando: boolean
  onSalvar: (input: SalvarRegraInput) => void
  onFechar: () => void
}) {
  const f = regra?.filtros
  const [nome, setNome] = useState(regra?.nome ?? '')
  const [status, setStatus] = useState<'active' | 'paused'>(regra?.status === 'paused' ? 'paused' : 'active')
  const [prioridade, setPrioridade] = useState<number>(regra?.prioridade ?? 100)
  const [plataformas, setPlataformas] = useState<string[]>(f?.plataformas ?? [])
  const [produtosCrit, setProdutosCrit] = useState<CriterioValor[]>(f?.produtos ?? [])
  const [ofertasCrit, setOfertasCrit] = useState<CriterioValor[]>(f?.ofertas ?? [])
  const [periodoDe, setPeriodoDe] = useState(f?.periodoDe ?? '')
  const [periodoAte, setPeriodoAte] = useState(f?.periodoAte ?? '')
  const [aplicarATudo, setAplicarATudo] = useState(!!f?.aplicarATudo)
  const [inicio, setInicio] = useState<InicioConfig>(regra?.inicio ?? { tipo: 'immediate' })
  const [fim, setFim] = useState<FimConfig>(regra?.fim ?? { tipo: 'lifetime' })
  const [produtoIds, setProdutoIds] = useState<string[]>(regra?.produtoIds ?? [])

  const togglePlataforma = (p: string) => setPlataformas((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]))
  const toggleProduto = (id: string) => setProdutoIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  function salvar() {
    onSalvar({
      id: regra?.id, nome, status, prioridade,
      filtros: { plataformas, produtos: produtosCrit, ofertas: ofertasCrit, periodoDe: periodoDe || null, periodoAte: periodoAte || null, aplicarATudo },
      inicio, fim, produtoIds,
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm" onClick={onFechar}>
      <div className="my-8 w-full max-w-2xl rounded-2xl border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">{regra ? 'Editar regra' : 'Nova regra de liberação'}</h2>
          <Button variant="ghost" size="icon" aria-label="Fechar" onClick={onFechar}><X className="h-4 w-4" /></Button>
        </div>

        <div className="space-y-5">
          {/* Identificação */}
          <div className="grid gap-3 sm:grid-cols-[1fr_7rem_8rem]">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Nome</label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Extensivo PGE – Hotmart" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Prioridade</label>
              <Input type="number" value={prioridade} onChange={(e) => setPrioridade(Number(e.target.value) || 0)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Estado</label>
              <select className={`${sel} w-full`} value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'paused')}>
                <option value="active">Ativa</option>
                <option value="paused">Pausada</option>
              </select>
            </div>
          </div>

          {/* Condições */}
          <div className="rounded-xl border bg-muted/20 p-3">
            <p className="mb-3 text-xs text-muted-foreground">A regra casa quando <strong>TODAS</strong> as dimensões preenchidas baterem (E). Dimensão vazia = qualquer. Dentro de uma dimensão, basta um valor (OU).</p>
            <div className="space-y-4">
              <div>
                <span className="text-sm font-semibold">Plataformas</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {PROVIDERS_SUGERIDOS.map((p) => (
                    <button key={p} type="button" onClick={() => togglePlataforma(p)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${plataformas.includes(p) ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}>
                      {p}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">Critério por ID exige ao menos uma plataforma (IDs só valem dentro da plataforma).</p>
              </div>
              <CriteriosEditor titulo="Produtos" criterios={produtosCrit} onChange={setProdutosCrit} />
              <CriteriosEditor titulo="Ofertas" criterios={ofertasCrit} onChange={setOfertasCrit} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Compra a partir de</label>
                  <Input type="date" value={periodoDe} onChange={(e) => setPeriodoDe(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Compra até</label>
                  <Input type="date" value={periodoAte} onChange={(e) => setPeriodoAte(e.target.value)} />
                </div>
              </div>
              {produtosCrit.length === 0 && ofertasCrit.length === 0 && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={aplicarATudo} onChange={(e) => setAplicarATudo(e.target.checked)} />
                  Sem filtro de produto/oferta — aplicar a TODAS as compras (use com cuidado)
                </label>
              )}
            </div>
          </div>

          {/* Janela de acesso */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border p-3">
              <span className="text-sm font-semibold">Acesso começa</span>
              <select className={`${sel} mt-2 w-full`} value={inicio.tipo} onChange={(e) => {
                const t = e.target.value as InicioConfig['tipo']
                setInicio(t === 'after_days' ? { tipo: 'after_days', dias: 0 } : t === 'fixed_date' ? { tipo: 'fixed_date', data: '' } : { tipo: 'immediate' })
              }}>
                <option value="immediate">Imediato</option>
                <option value="after_days">N dias após a compra</option>
                <option value="fixed_date">Data fixa</option>
              </select>
              {inicio.tipo === 'after_days' && <Input className="mt-2" type="number" value={inicio.dias} onChange={(e) => setInicio({ tipo: 'after_days', dias: Number(e.target.value) || 0 })} placeholder="dias" />}
              {inicio.tipo === 'fixed_date' && <Input className="mt-2" type="date" value={inicio.data} onChange={(e) => setInicio({ tipo: 'fixed_date', data: e.target.value })} />}
            </div>
            <div className="rounded-xl border p-3">
              <span className="text-sm font-semibold">Acesso termina</span>
              <select className={`${sel} mt-2 w-full`} value={fim.tipo} onChange={(e) => {
                const t = e.target.value as FimConfig['tipo']
                setFim(t === 'after_days' ? { tipo: 'after_days', dias: 0 } : t === 'fixed_date' ? { tipo: 'fixed_date', data: '' } : { tipo: 'lifetime' })
              }}>
                <option value="lifetime">Vitalício</option>
                <option value="after_days">N dias após a compra</option>
                <option value="fixed_date">Data fixa</option>
              </select>
              {fim.tipo === 'after_days' && <Input className="mt-2" type="number" value={fim.dias} onChange={(e) => setFim({ tipo: 'after_days', dias: Number(e.target.value) || 0 })} placeholder="dias" />}
              {fim.tipo === 'fixed_date' && <Input className="mt-2" type="date" value={fim.data} onChange={(e) => setFim({ tipo: 'fixed_date', data: e.target.value })} />}
            </div>
          </div>

          {/* Produtos concedidos */}
          <div>
            <span className="text-sm font-semibold">Produtos que a regra libera</span>
            {produtos.length === 0 ? (
              <p className="mt-1.5 rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">Nenhum produto no catálogo ainda. Crie em “Produtos / Extensivos”.</p>
            ) : (
              <div className="mt-1.5 max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
                {produtos.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted/50">
                    <input type="checkbox" checked={produtoIds.includes(p.id)} onChange={() => toggleProduto(p.id)} />
                    <span className={p.ativo ? '' : 'text-muted-foreground'}>{p.nome}{!p.ativo && ' (inativo)'}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || !nome.trim() || produtoIds.length === 0}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Salvar regra
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
