'use client'

// FormularioDeCampos GENÉRICO: renderiza ElementoDef.schema (CampoDef) para o bloco selecionado.
// Tipos: texto | rich | imagem | link | token-cor | seletor | toggle | numero (+ seletores especiais de dados do produto).
import { useState } from 'react'
import { AlertCircle, Minus, Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { CampoImagem } from '@/components/admin/campo-imagem'
import type { CampoDef } from '@/lib/produtos/pagina/registro'
import type { BlocoAny } from '@/lib/produtos/pagina/tipos'
import { imagemSegura, linkSeguro } from '@/lib/produtos/pagina/normalizar'
import type { TokenCor } from '@/lib/produtos/pagina/tokens'
import { useEditor } from '../store'
import { CampoRich } from './campo-rich'
import { SeletorCor } from './seletor-cor'
import { SeletorCronogramaCatalogo, SeletorItens, SeletorModulos } from './seletores-dados'
import { cx, gravarCampo, valorDe } from './util'

export function Rotulo({ children, ajuda, extra }: { children: React.ReactNode; ajuda?: string; extra?: React.ReactNode }) {
  return (
    <div className="mb-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">{children}</span>{extra}
      </div>
      {ajuda && <p className="text-[11px] leading-snug text-muted-foreground">{ajuda}</p>}
    </div>
  )
}

/** Controle segmentado (opções curtas: espaçamento, raio, alinhamento, ordenação). */
export function Segmentado({ value, onChange, opcoes }: { value: string | undefined; onChange: (v: string) => void; opcoes: { v: string; rotulo: string }[] }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/30 p-0.5" role="radiogroup">
      {opcoes.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}
          className={cx('min-w-0 flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors', value === o.v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{o.rotulo}</button>
      ))}
    </div>
  )
}

function Numero({ value, onChange, min = 0, max = 100, passo = 1 }: { value: number; onChange: (n: number) => void; min?: number; max?: number; passo?: number }) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  return (
    <div className="inline-flex items-center rounded-lg border">
      <button type="button" aria-label="Diminuir" disabled={value <= min} onClick={() => onChange(clamp(value - passo))} className="px-2.5 py-2 text-muted-foreground hover:text-foreground disabled:opacity-30"><Minus className="h-3.5 w-3.5" /></button>
      <input type="number" value={value} min={min} max={max} step={passo} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(clamp(Math.round(n))) }}
        className="h-9 w-14 border-x bg-transparent text-center text-sm tabular-nums outline-none" />
      <button type="button" aria-label="Aumentar" disabled={value >= max} onClick={() => onChange(clamp(value + passo))} className="px-2.5 py-2 text-muted-foreground hover:text-foreground disabled:opacity-30"><Plus className="h-3.5 w-3.5" /></button>
    </div>
  )
}

function Aviso({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 flex items-center gap-1 text-[11px] text-destructive"><AlertCircle className="h-3 w-3 shrink-0" />{children}</p>
}

function Campo({ def, bloco }: { def: CampoDef; bloco: BlocoAny }) {
  const ed = useEditor()
  const [foco, setFoco] = useState(false)
  const v = valorDe(bloco, def.chave)
  const set = (valor: unknown) => gravarCampo(ed, bloco, def.chave, valor)
  const cores = { cor: ed.dadosAmostra.cor, cor2: ed.dadosAmostra.cor2 }

  // Seletores especiais (dados do produto), identificados pela chave.
  if (def.chave === 'conteudo.modulo_ids' && bloco.tipo === 'modulos') return <div><Rotulo ajuda="Marque os módulos que aparecem nesta seção; a ordem aqui é a ordem na página.">{def.rotulo}</Rotulo><SeletorModulos bloco={bloco} /></div>
  if (def.chave === 'conteudo.itens' && bloco.tipo === 'carrossel') return <div><Rotulo ajuda="Só itens liberados ao aluno aparecem na página.">{def.rotulo}</Rotulo><SeletorItens bloco={bloco} /></div>

  switch (def.tipo) {
    case 'texto': {
      const s = typeof v === 'string' ? v : ''
      const max = def.max_chars ?? 120
      return (
        <div>
          <Rotulo ajuda={def.ajuda} extra={foco || s.length > max * 0.8 ? <span className={cx('text-[10px] tabular-nums', s.length >= max ? 'text-destructive' : 'text-muted-foreground')}>{s.length}/{max}</span> : null}>{def.rotulo}</Rotulo>
          {max > 150
            ? <textarea value={s} maxLength={max} rows={3} placeholder={def.placeholder} onFocus={() => setFoco(true)} onBlur={() => setFoco(false)} onChange={(e) => set(e.target.value)}
                className="w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/30" />
            : <Input value={s} maxLength={max} placeholder={def.placeholder} onFocus={() => setFoco(true)} onBlur={() => setFoco(false)} onChange={(e) => set(e.target.value)} />}
        </div>
      )
    }
    case 'rich':
      return <div><Rotulo ajuda={def.ajuda}>{def.rotulo}</Rotulo><CampoRich value={typeof v === 'string' ? v : ''} max={def.max_chars ?? 8000} onChange={set} /></div>
    case 'imagem': {
      const s = typeof v === 'string' ? v : ''
      const invalida = !!s && !imagemSegura(s)
      return (
        <div>
          <Rotulo ajuda={def.ajuda}>{def.rotulo}</Rotulo>
          <CampoImagem value={s} onChange={set} aspecto="16 / 6" compacto textoVazio="Enviar imagem" />
          {s && <button type="button" onClick={() => set('')} className="mt-1 text-[11px] font-medium text-muted-foreground hover:text-destructive">Remover imagem</button>}
          {invalida && <Aviso>Endereço inválido: use https:// ou um caminho interno.</Aviso>}
        </div>
      )
    }
    case 'link': {
      const s = typeof v === 'string' ? v : ''
      const invalido = !!s.trim() && linkSeguro(s) !== s.trim()
      return (
        <div>
          <Rotulo ajuda={def.ajuda ?? 'https://…, mailto:, /caminho interno ou #âncora.'}>{def.rotulo}</Rotulo>
          <Input value={s} placeholder={def.placeholder ?? 'https://…'} aria-invalid={invalido} onChange={(e) => set(e.target.value)} className={cx(invalido && 'border-destructive')} />
          {invalido && <Aviso>Link inválido — será descartado ao salvar.</Aviso>}
        </div>
      )
    }
    case 'token-cor':
      return <div><Rotulo ajuda={def.ajuda}>{def.rotulo}</Rotulo><SeletorCor value={v as TokenCor | undefined} onChange={set} cores={cores} /></div>
    case 'seletor': {
      if (!def.opcoes) return null
      return <div><Rotulo ajuda={def.ajuda}>{def.rotulo}</Rotulo>{def.opcoes.length <= 5
        ? <Segmentado value={(v as string | undefined) ?? (def.chave.startsWith('estilo.') ? undefined : def.opcoes[0]?.v)} onChange={set} opcoes={def.opcoes} />
        : <select value={String(v ?? '')} onChange={(e) => set(e.target.value)} className="h-9 w-full rounded-lg border bg-background px-2.5 text-sm">{def.opcoes.map((o) => <option key={o.v} value={o.v}>{o.rotulo}</option>)}</select>}</div>
    }
    case 'toggle':
      return (
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-1 py-1">
          <span><span className="text-sm">{def.rotulo}</span>{def.ajuda && <span className="block text-[11px] text-muted-foreground">{def.ajuda}</span>}</span>
          <Switch checked={!!v} onCheckedChange={set} />
        </label>
      )
    case 'numero':
      return <div><Rotulo ajuda={def.ajuda}>{def.rotulo}</Rotulo><Numero value={Number(v ?? def.min ?? 0)} min={def.min} max={def.max} passo={def.passo} onChange={set} /></div>
  }
}

const visivel = (def: CampoDef, b: BlocoAny) => !def.visivelSe || valorDe(b, def.visivelSe.chave) === def.visivelSe.igual

/** Renderiza os campos do schema do elemento para um grupo (conteudo|estilo|avancado). `excluir` = chaves tratadas à parte. */
export function FormularioDeCampos({ bloco, campos, excluir = [] }: { bloco: BlocoAny; campos: CampoDef[]; excluir?: string[] }) {
  const ed = useEditor()
  const lista = campos.filter((c) => !excluir.includes(c.chave) && visivel(c, bloco))
  return (
    <div className="space-y-4">
      {lista.map((c) => <Campo key={c.chave} def={c} bloco={bloco} />)}
      {bloco.tipo === 'cronograma' && campos.some((c) => c.grupo === 'conteudo') && (
        <div>
          <Rotulo ajuda="Opcional. Para tenants no fluxo padrão: usa um modelo do catálogo em vez do cronograma individual do aluno.">Modelo do catálogo</Rotulo>
          <SeletorCronogramaCatalogo valor={bloco.conteudo.cronograma_id} onChange={(id) => ed.atualizarConteudo(bloco.id, 'cronograma_id', id)} />
        </div>
      )}
      {lista.length === 0 && <p className="text-xs text-muted-foreground">Sem opções neste grupo.</p>}
    </div>
  )
}
