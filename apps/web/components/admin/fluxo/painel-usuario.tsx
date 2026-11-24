'use client'

// PAINEL DO CONSTRUTOR: edita o nó/aresta selecionado na camada do usuário (título, descrição, tipo, regra executável), duplica, exclui/oculta.
// Genérico: o catálogo de variáveis/ações vem do adaptador (`DadosConstrutor.catalogo`).
import { useEffect, useRef } from 'react'
import { Copy, EyeOff, Plus, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NoFluxo, TipoNo } from '@/lib/admin/fluxo/adaptador'
import { ROTULO_OP, type AcaoDef, type AcaoUsuario, type CatalogoExecutavel, type Comparacao, type Condicao, type NoUsuario, type PatchNo, type VariavelDef } from '@/lib/admin/fluxo/overlay'
import { ESTILO_NO, ROTULO_NO } from './estilo-no'

const inputCls = 'h-8 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60'
const btnCls = 'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium hover:bg-muted disabled:opacity-60'

const valorNumerico = (v: VariavelDef, s: string): number | string => (v.opcoes?.every((o) => /^-?\d+$/.test(o.valor)) ? Number(s) : s)

function EditorComparacao({ c, cat, onChange, onRemover }: { c: Comparacao; cat: CatalogoExecutavel; onChange: (c: Comparacao) => void; onRemover: () => void }) {
  const v = cat.variaveis.find((x) => x.chave === c.variavel)
  const multi = c.op === 'em' || c.op === 'fora_de'
  const trocarVar = (chave: string) => { const nv = cat.variaveis.find((x) => x.chave === chave); if (nv) onChange({ variavel: chave, op: nv.ops.includes('igual') ? 'igual' : nv.ops[0], valor: [] }) }
  const sel = new Set(c.valor.map(String))
  return (
    <div className="space-y-1.5 rounded-lg border bg-background/60 p-2">
      <div className="flex items-center gap-1.5">
        <select className={inputCls} value={c.variavel} onChange={(e) => trocarVar(e.target.value)} aria-label="Variável">
          {cat.variaveis.map((x) => <option key={x.chave} value={x.chave} disabled={!x.disponivel && x.chave !== c.variavel}>{x.rotulo}{x.disponivel ? '' : ' (indisponível)'}</option>)}
        </select>
        <button type="button" onClick={onRemover} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Remover comparação"><X className="h-3.5 w-3.5" /></button>
      </div>
      {v && !v.disponivel && <p className="text-[11px] text-destructive">{v.motivo}</p>}
      {v && v.dica && <p className="text-[11px] text-muted-foreground">{v.dica}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        <select className={cn(inputCls, 'w-auto')} value={c.op} onChange={(e) => onChange({ ...c, op: e.target.value as Comparacao['op'], valor: multi && !(e.target.value === 'em' || e.target.value === 'fora_de') ? c.valor.slice(0, 1) : c.valor })} aria-label="Operador">
          {(v?.ops ?? []).map((o) => <option key={o} value={o}>{ROTULO_OP[o]}</option>)}
        </select>
        {v?.opcoes && !multi && (
          <select className={cn(inputCls, 'min-w-0 flex-1')} value={String(c.valor[0] ?? '')} onChange={(e) => onChange({ ...c, valor: [valorNumerico(v, e.target.value)] })} aria-label="Valor">
            <option value="">Escolha…</option>
            {v.opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
          </select>
        )}
        {v && !v.opcoes && <input className={cn(inputCls, 'min-w-0 flex-1')} inputMode="decimal" value={String(c.valor[0] ?? '')} onChange={(e) => onChange({ ...c, valor: e.target.value === '' ? [] : [Number(e.target.value)] })} aria-label="Valor" />}
      </div>
      {v?.opcoes && multi && (
        <div className="flex flex-wrap gap-1.5">
          {v.opcoes.map((o) => (
            <label key={o.valor} className={cn('inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-0.5 text-xs', sel.has(o.valor) && 'border-primary bg-primary/10')}>
              <input type="checkbox" className="h-3 w-3 accent-primary" checked={sel.has(o.valor)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(o.valor); else n.delete(o.valor); onChange({ ...c, valor: [...n].map((x) => valorNumerico(v, x)) }) }} />{o.rotulo}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

function EditorCondicao({ cond, cat, onChange }: { cond: Condicao; cat: CatalogoExecutavel; onChange: (c: Condicao) => void }) {
  const novaCmp = (): Comparacao => { const v = cat.variaveis.find((x) => x.disponivel) ?? cat.variaveis[0]; return { variavel: v.chave, op: v.ops.includes('igual') ? 'igual' : v.ops[0], valor: [] } }
  const setG = (gi: number, g: Comparacao[]) => onChange({ ou: cond.ou.map((x, i) => (i === gi ? g : x)).filter((x) => x.length > 0) })
  return (
    <div className="space-y-2">
      {cond.ou.length === 0 && <p className="rounded-lg border border-dashed p-2 text-xs text-muted-foreground">Sem comparações: este nó só repassa a condição dos nós ligados a ele. Adicione uma comparação abaixo.</p>}
      {cond.ou.map((g, gi) => (
        <div key={gi} className="space-y-1.5">
          {gi > 0 && <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">ou</p>}
          {g.map((c, ci) => <EditorComparacao key={ci} c={c} cat={cat} onChange={(n) => setG(gi, g.map((x, i) => (i === ci ? n : x)))} onRemover={() => setG(gi, g.filter((_, i) => i !== ci))} />)}
          <button type="button" className={btnCls} onClick={() => setG(gi, [...g, novaCmp()])}><Plus className="h-3.5 w-3.5" />e (mais uma condição)</button>
        </div>
      ))}
      <button type="button" className={btnCls} onClick={() => onChange({ ou: [...cond.ou, [novaCmp()]] })}><Plus className="h-3.5 w-3.5" />{cond.ou.length ? 'ou (outro grupo)' : 'Adicionar condição'}</button>
      <p className="text-[11px] text-muted-foreground">Ligue este nó a uma Ação com a aresta “sim”. Na aresta “não” a condição é invertida.</p>
    </div>
  )
}

function EditorAcao({ acao, cat, onChange }: { acao: AcaoUsuario; cat: CatalogoExecutavel; onChange: (a: AcaoUsuario) => void }) {
  const def: AcaoDef | undefined = cat.acoes.find((a) => a.tipo === acao.tipo)
  const trocar = (tipo: string) => {
    const d = cat.acoes.find((a) => a.tipo === tipo)
    const n: AcaoUsuario = { tipo }
    for (const p of d?.params ?? []) if (p.padrao != null) (n as unknown as Record<string, unknown>)[p.chave] = p.padrao
    onChange(n)
  }
  return (
    <div className="space-y-2">
      <select className={inputCls} value={acao.tipo} onChange={(e) => trocar(e.target.value)} aria-label="Tipo de ação">
        {cat.acoes.map((a) => <option key={a.tipo} value={a.tipo}>{a.rotulo}{a.informativa ? ' (só informa)' : ''}</option>)}
      </select>
      {def && <p className="text-[11px] text-muted-foreground">{def.descricao}</p>}
      {def?.params.map((p) => (
        <label key={p.chave} className="block space-y-1 text-xs text-muted-foreground">
          <span>{p.rotulo}</span>
          {p.tipo === 'opcao' ? (
            <select className={inputCls} value={String(acao[p.chave] ?? '')} onChange={(e) => onChange({ ...acao, [p.chave]: e.target.value })}>
              <option value="">Escolha…</option>
              {p.opcoes?.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
            </select>
          ) : p.tipo === 'int' ? (
            <input className={inputCls} inputMode="numeric" value={acao[p.chave] == null ? '' : String(acao[p.chave])} onChange={(e) => onChange({ ...acao, [p.chave]: e.target.value === '' ? undefined : Math.trunc(Number(e.target.value)) })} />
          ) : (
            <input className={inputCls} maxLength={300} value={String(acao[p.chave] ?? '')} onChange={(e) => onChange({ ...acao, [p.chave]: e.target.value })} />
          )}
          {p.tipo === 'int' && (p.min != null || p.max != null) && <span className="text-[11px]">de {p.min} a {p.max}</span>}
        </label>
      ))}
    </div>
  )
}

export interface PainelUsuarioProps {
  no: NoFluxo
  usuario: NoUsuario | null
  catalogo: CatalogoExecutavel | null
  executavel: boolean
  tiposNo: readonly TipoNo[]
  onEditar: (p: PatchNo) => void
  onAjusteBase: (p: { titulo?: string; descricao?: string }) => void
  onDuplicar: () => void
  onRemover: () => void
  onFechar: () => void
  /** incrementa para focar/selecionar o campo Título (duplo clique no nó). */
  focarTitulo?: number
}

/** Painel de construção do nó selecionado (nó do usuário: tudo editável; nó base: rótulo/descrição, duplicar, ocultar). */
export function PainelUsuario({ no, usuario, catalogo, executavel, tiposNo, onEditar, onAjusteBase, onDuplicar, onRemover, onFechar, focarTitulo }: PainelUsuarioProps) {
  const eUsuario = !!usuario
  const refTitulo = useRef<HTMLInputElement>(null)
  useEffect(() => { if (focarTitulo) { refTitulo.current?.focus(); refTitulo.current?.select() } }, [focarTitulo, no.id])
  return (
    <aside className="flex w-full flex-col gap-3 p-1" aria-label="Construtor — nó">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <span className={cn('rounded-md border-2 px-2 py-0.5 text-[11px] font-semibold', ESTILO_NO[no.tipo])}>{ROTULO_NO[no.tipo]}</span>
          <h3 className="text-sm font-semibold">{eUsuario ? 'Seu nó' : 'Nó do fluxo base'}</h3>
        </div>
        <button type="button" onClick={onFechar} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Fechar painel"><X className="h-4 w-4" /></button>
      </div>
      <label className="block space-y-1 text-xs text-muted-foreground">
        <span>Título</span>
        <input ref={refTitulo} className={inputCls} maxLength={120} value={no.titulo} onChange={(e) => (eUsuario ? onEditar({ titulo: e.target.value }) : onAjusteBase({ titulo: e.target.value }))} />
      </label>
      <label className="block space-y-1 text-xs text-muted-foreground">
        <span>Descrição</span>
        <textarea className={cn(inputCls, 'h-24 resize-y py-1.5')} maxLength={4000} value={no.descricao} onChange={(e) => (eUsuario ? onEditar({ descricao: e.target.value }) : onAjusteBase({ descricao: e.target.value }))} />
      </label>
      {eUsuario && (
        <label className="block space-y-1 text-xs text-muted-foreground">
          <span>Tipo do nó</span>
          <select className={inputCls} value={usuario.tipo} onChange={(e) => onEditar({ tipo: e.target.value as TipoNo })}>
            {tiposNo.map((t) => <option key={t} value={t}>{ROTULO_NO[t]}</option>)}
          </select>
        </label>
      )}
      {eUsuario && executavel && catalogo && usuario.tipo === 'condicao' && (
        <div className="space-y-2 border-t pt-3"><h4 className="text-sm font-semibold">Condição (afeta o cronograma)</h4><EditorCondicao cond={usuario.condicao ?? { ou: [] }} cat={catalogo} onChange={(c) => onEditar({ condicao: c })} /></div>
      )}
      {eUsuario && executavel && catalogo && usuario.tipo === 'acao' && (
        <div className="space-y-2 border-t pt-3"><h4 className="text-sm font-semibold">Ação (catálogo fechado)</h4><EditorAcao acao={usuario.acao ?? { tipo: 'aviso', texto: '' }} cat={catalogo} onChange={(a) => onEditar({ acao: a })} />
          <p className="text-[11px] text-muted-foreground">Sem nenhuma condição ligada, a ação vale sempre. Ligue uma Condição a esta Ação para restringir quando ela vale.</p></div>
      )}
      <div className="mt-auto flex flex-wrap gap-2 border-t pt-3">
        <button type="button" className={btnCls} onClick={onDuplicar}><Copy className="h-3.5 w-3.5" />Duplicar</button>
        <button type="button" className={cn(btnCls, 'text-destructive')} onClick={onRemover}>{eUsuario ? <Trash2 className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}{eUsuario ? 'Excluir' : 'Ocultar'}</button>
      </div>
      {!eUsuario && <p className="text-[11px] text-muted-foreground">Nós do fluxo base vêm do motor: aqui você só pode renomear, mover ou ocultar (reversível). Os valores das regras continuam editáveis no painel “Editar valores”.</p>}
    </aside>
  )
}

export function PainelAresta({ rotulo, origem, onRotulo, onRemover, onFechar }: { rotulo: string; origem: 'base' | 'usuario'; onRotulo: (r: string) => void; onRemover: () => void; onFechar: () => void }) {
  return (
    <aside className="flex w-full flex-col gap-3 p-1" aria-label="Construtor — conexão">
      <div className="flex items-start gap-2">
        <h3 className="flex-1 text-sm font-semibold">{origem === 'usuario' ? 'Sua conexão' : 'Conexão do fluxo base'}</h3>
        <button type="button" onClick={onFechar} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Fechar painel"><X className="h-4 w-4" /></button>
      </div>
      {origem === 'usuario' ? (
        <>
          <label className="block space-y-1 text-xs text-muted-foreground"><span>Rótulo</span><input className={inputCls} maxLength={40} value={rotulo} onChange={(e) => onRotulo(e.target.value)} placeholder="ex.: sim, não" /></label>
          <div className="flex gap-2"><button type="button" className={btnCls} onClick={() => onRotulo('sim')}>sim</button><button type="button" className={btnCls} onClick={() => onRotulo('não')}>não</button></div>
        </>
      ) : <p className="text-xs text-muted-foreground">Esta conexão vem do fluxo base: dá para ocultá-la (reversível), não para editá-la.</p>}
      <button type="button" className={cn(btnCls, 'w-fit text-destructive')} onClick={onRemover}><Trash2 className="h-3.5 w-3.5" />{origem === 'usuario' ? 'Excluir conexão' : 'Ocultar conexão'}</button>
    </aside>
  )
}
