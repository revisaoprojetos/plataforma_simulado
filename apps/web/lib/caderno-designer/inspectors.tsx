'use client'

import { useRef } from 'react'
import { Plus, Trash2, Upload, Image as ImageIcon, Bold, Italic, Underline } from 'lucide-react'
import type { Block } from './types'
import { SHEET_H, PAD_V } from './types'
import { FONTES_CADERNO } from './theme'

// Altura máxima do espaçador = altura útil da página (folha − margens sup./inf.).
const ESPACADOR_MAX = SHEET_H - 2 * PAD_V

const VARIAVEIS = [
  { token: '{nome}', label: 'Nome' },
  { token: '{simulado}', label: 'Simulado' },
  { token: '{acertos}', label: 'Acertos' },
  { token: '{total_questoes}', label: 'Total questões' },
  { token: '{nota}', label: 'Nota' },
  { token: '{percentual}', label: 'Percentual' },
]
const QVARIAVEIS = [
  { token: '{q_num}', label: 'Nº da questão' },
  { token: '{q_enunciado}', label: 'Enunciado' },
  { token: '{q_disciplina}', label: 'Disciplina' },
  { token: '{q_alternativas}', label: 'Alternativas (todas)' },
  { token: '{q_letras}', label: 'Letras (A,B,C…)' },
  { token: '{q_resposta}', label: 'Resposta marcada (B) texto)' },
  { token: '{q_resposta_letra}', label: 'Resposta (só letra)' },
]
const ALTVARIAVEIS = [
  { token: '{q_alt_a}', label: 'A)' }, { token: '{q_alt_b}', label: 'B)' }, { token: '{q_alt_c}', label: 'C)' },
  { token: '{q_alt_d}', label: 'D)' }, { token: '{q_alt_e}', label: 'E)' },
]

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
// Grupo (div, sem <label>): usar quando houver vários botões — evita que o hover
// num botão acione o :hover do 1º controle associado ao label.
function Grupo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}
const inputCls = 'w-full rounded-md border bg-[var(--input-bg,transparent)] px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring'

function Cor({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Row label={label}>
      <div className="flex items-center gap-2">
        <input type="color" value={value || '#000000'} onChange={(e) => onChange(e.target.value)} className="h-8 w-10 cursor-pointer rounded border bg-[var(--input-bg,transparent)]" />
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="auto (tema)" className={inputCls} />
        {value && <button type="button" onClick={() => onChange('')} className="text-xs text-muted-foreground hover:text-foreground">limpar</button>}
      </div>
    </Row>
  )
}

const ALIN = [{ v: 'left', n: 'Esq.' }, { v: 'center', n: 'Centro' }, { v: 'right', n: 'Dir.' }]
const ALIN_JUST = [...ALIN, { v: 'justify', n: 'Justif.' }]
function Align({ value, onChange, comJustificar }: { value: string; onChange: (v: string) => void; comJustificar?: boolean }) {
  return (
    <Grupo label="Alinhamento">
      <div className="flex gap-1">
        {(comJustificar ? ALIN_JUST : ALIN).map((o) => (
          <button key={o.v} type="button" onClick={() => onChange(o.v)} className={`flex-1 rounded-md border px-2 py-1 text-xs ${value === o.v ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted'}`}>{o.n}</button>
        ))}
      </div>
    </Grupo>
  )
}

function UploadImagem({ url, onChange }: { url: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="space-y-2">
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => onChange(String(r.result)); r.readAsDataURL(f); e.target.value = '' }} />
      <button type="button" onClick={() => ref.current?.click()}
        className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-primary/40 p-4 text-center text-xs transition-colors hover:border-primary hover:bg-primary/5">
        {url ? <img src={url} alt="" className="max-h-24 w-auto rounded object-contain" /> : <Upload className="h-7 w-7 text-primary" />}
        <span className="flex items-center gap-1 font-medium text-primary"><ImageIcon className="h-3.5 w-3.5" /> {url ? 'Trocar imagem' : 'Enviar imagem'}</span>
      </button>
      {url && <button type="button" onClick={() => onChange('')} className="text-xs text-muted-foreground hover:text-foreground">Remover imagem</button>}
    </div>
  )
}

type Campo = { rotulo: string; valor: string }
/** Aceita formato antigo (string[]) e normaliza para { rotulo, valor }. */
export const normCampos = (arr: any[]): Campo[] =>
  (arr ?? []).map((x) => (typeof x === 'string' ? { rotulo: x, valor: '' } : { rotulo: x?.rotulo ?? '', valor: x?.valor ?? '' }))

/** Editor de um grupo de campos: cada um com rótulo (texto) + variável embaixo. */
function GrupoCampos({ label, items, onChange, exemplos }: { label: string; items: Campo[]; onChange: (v: Campo[]) => void; exemplos?: string }) {
  const lista = items ?? []
  const upd = (i: number, patch: Partial<Campo>) => onChange(lista.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  return (
    <div className="space-y-2">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {lista.map((f, i) => (
        <div key={i} className="space-y-1 rounded-md border bg-muted/20 p-2">
          <div className="flex items-center gap-1">
            <input value={f.rotulo} onChange={(e) => upd(i, { rotulo: e.target.value })} placeholder="Rótulo (ex.: Nome)" className={inputCls} />
            <button type="button" title="Remover" onClick={() => onChange(lista.filter((_, j) => j !== i))} className="shrink-0 text-destructive hover:opacity-70"><Trash2 className="h-4 w-4" /></button>
          </div>
          <input value={f.valor} onChange={(e) => upd(i, { valor: e.target.value })} placeholder="Variável (ex.: {{nome}})" className={`${inputCls} font-mono text-xs`} />
        </div>
      ))}
      <button type="button" onClick={() => onChange([...lista, { rotulo: 'Campo', valor: '' }])} className="flex items-center gap-1 text-xs text-primary hover:underline"><Plus className="h-3.5 w-3.5" /> Adicionar campo</button>
      {exemplos && <p className="text-[10px] leading-snug text-muted-foreground">Variáveis: {exemplos}</p>}
    </div>
  )
}

function FonteSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Row label="Fonte">
      <select value={value || ''} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">Padrão do tema</option>
        {FONTES_CADERNO.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
      </select>
    </Row>
  )
}

/** Slider + campo numérico para digitar o valor exato (com clamp em [min,max]). */
function Faixa({ label, min, max, step = 1, value, onChange }: { label: string; min: number; max: number; step?: number; value: number; onChange: (v: number) => void }) {
  const aplicar = (raw: string) => { const n = Number(raw); if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n))) }
  return (
    <Row label={label}>
      <div className="flex items-center gap-2">
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => aplicar(e.target.value)} className="w-full" />
        <input type="number" min={min} max={max} step={step} value={value} onChange={(e) => aplicar(e.target.value)} className="w-16 shrink-0 rounded border bg-transparent px-1 py-1 text-center text-xs outline-none focus:ring-1 focus:ring-ring" />
      </div>
    </Row>
  )
}

/** Altura mínima do bloco + alinhamento vertical do conteúdo dentro dela. */
function AlturaVertical({ a, set }: { a: any; set: (k: string, v: any) => void }) {
  return (
    <>
      <Faixa label="Altura mínima (px)" min={0} max={1000} value={a.alturaMin ?? 0} onChange={(v) => set('alturaMin', v)} />
      <Row label="Alinhamento vertical">
        <div className="flex gap-1">
          {([['top', 'Topo'], ['center', 'Centro'], ['bottom', 'Rodapé']] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => set('valignV', v)}
              className={`flex-1 rounded border px-2 py-1 text-xs transition-colors ${(a.valignV ?? 'top') === v ? 'border-primary bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted'}`}>{l}</button>
          ))}
        </div>
      </Row>
    </>
  )
}

/** Largura do bloco (%) + posição horizontal quando menor que 100%. */
function LarguraBloco({ a, set }: { a: any; set: (k: string, v: any) => void }) {
  const larg = a.largura ?? 100
  return (
    <>
      <Faixa label="Largura (%)" min={10} max={100} value={larg} onChange={(v) => set('largura', v)} />
      {larg < 100 && (
        <Row label="Posição">
          <div className="flex gap-1">
            {([['left', 'Esquerda'], ['center', 'Centro'], ['right', 'Direita']] as const).map(([v, l]) => (
              <button key={v} type="button" onClick={() => set('alinhamentoBloco', v)}
                className={`flex-1 rounded border px-2 py-1 text-xs transition-colors ${(a.alinhamentoBloco ?? 'left') === v ? 'border-primary bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted'}`}>{l}</button>
            ))}
          </div>
        </Row>
      )}
    </>
  )
}

export function BlockInspector({ block, onChange, varsExtra, gruposBanco, assuntosBanco }: { block: Block; onChange: (patch: Record<string, unknown>) => void; varsExtra?: { grupo: string; itens: { token: string; label: string }[] }[]; gruposBanco?: { id: string; nome: string; disciplinas: string[] }[]; assuntosBanco?: Record<string, string[]> }) {
  const a = block.attributes as any
  const set = (k: string, v: unknown) => onChange({ [k]: v })
  const fieldRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null)

  function inserirVar(token: string) {
    const el = fieldRef.current
    const texto = String(a.texto ?? '')
    if (!el) { set('texto', texto + token); return }
    const s = el.selectionStart ?? texto.length, e = el.selectionEnd ?? texto.length
    set('texto', texto.slice(0, s) + token + texto.slice(e))
    requestAnimationFrame(() => { el.focus(); const p = s + token.length; try { el.setSelectionRange(p, p) } catch { /* ignore */ } })
  }
  const Chip = ({ token, label }: { token: string; label: string }) => (
    <button type="button" title={token} onMouseDown={(e) => e.preventDefault()} onClick={() => inserirVar(token)}
      className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary">{label}</button>
  )
  const Variaveis = () => (
    <>
      <Grupo label="Variáveis (mala direta)">
        <div className="flex flex-wrap gap-1">{VARIAVEIS.map((v) => <Chip key={v.token} {...v} />)}</div>
      </Grupo>
      {(varsExtra ?? []).map((g) => (
        <Grupo key={g.grupo} label={g.grupo}>
          <div className="flex flex-wrap gap-1">{g.itens.map((v) => <Chip key={v.token} {...v} />)}</div>
        </Grupo>
      ))}
      <Grupo label="Variáveis da questão (no repetidor)">
        <div className="flex flex-wrap gap-1">{QVARIAVEIS.map((v) => <Chip key={v.token} {...v} />)}</div>
      </Grupo>
      <Grupo label="Alternativa por letra (A) texto…)">
        <div className="flex flex-wrap gap-1">{ALTVARIAVEIS.map((v) => <Chip key={v.token} {...v} />)}</div>
      </Grupo>
    </>
  )

  const estiloBtn = (on: boolean) => `flex-1 rounded-md border px-2 py-1.5 ${on ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted'}`

  switch (block.type) {
    case 'titulo-secao':
      return (
        <div className="space-y-3">
          <Row label="Texto"><input ref={fieldRef as React.RefObject<HTMLInputElement>} value={a.texto} onChange={(e) => set('texto', e.target.value)} className={inputCls} /></Row>
          <Variaveis />
          <Row label="Nível">
            <select value={a.nivel} onChange={(e) => set('nivel', Number(e.target.value))} className={inputCls}>
              <option value={1}>Título (grande)</option><option value={2}>Subtítulo</option><option value={3}>Menor</option>
            </select>
          </Row>
          <FonteSelect value={a.fonte} onChange={(v) => set('fonte', v)} />
          <AlturaVertical a={a} set={set} />
          <LarguraBloco a={a} set={set} />
          <Grupo label="Estilo">
            <div className="flex gap-1">
              <button type="button" onClick={() => set('italico', !a.italico)} className={estiloBtn(a.italico)}><Italic className="mx-auto h-4 w-4" /></button>
              <button type="button" onClick={() => set('sublinhado', !a.sublinhado)} className={estiloBtn(a.sublinhado)}><Underline className="mx-auto h-4 w-4" /></button>
            </div>
          </Grupo>
          <Align value={a.align} onChange={(v) => set('align', v)} comJustificar />
          <Row label="Subtítulo (opcional)"><input value={a.subtitulo ?? ''} onChange={(e) => set('subtitulo', e.target.value)} className={inputCls} placeholder="linha menor abaixo do título" /></Row>
          <Cor label="Cor do texto" value={a.cor} onChange={(v) => set('cor', v)} />
          <Cor label="Cor de fundo (barra de seção)" value={a.corFundo} onChange={(v) => set('corFundo', v)} />
          {a.corFundo && <Faixa label="Cantos da barra (px)" min={0} max={16} value={a.fundoRaio ?? 6} onChange={(v) => set('fundoRaio', v)} />}
          <Faixa label="Espaçamento entre letras (px)" min={0} max={8} value={a.espacamento ?? 0} onChange={(v) => set('espacamento', v)} />
          {!a.corFundo && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={a.mostrarLinha} onChange={(e) => set('mostrarLinha', e.target.checked)} /> Linha sob o título</label>}
        </div>
      )
    case 'texto-livre':
      return (
        <div className="space-y-3">
          <Row label="Texto"><textarea ref={fieldRef as React.RefObject<HTMLTextAreaElement>} value={a.texto} onChange={(e) => set('texto', e.target.value)} rows={4} className={inputCls} /></Row>
          <Variaveis />
          <FonteSelect value={a.fonte} onChange={(v) => set('fonte', v)} />
          <AlturaVertical a={a} set={set} />
          <LarguraBloco a={a} set={set} />
          <Grupo label="Estilo">
            <div className="flex gap-1">
              <button type="button" onClick={() => set('bold', !a.bold)} className={estiloBtn(a.bold)}><Bold className="mx-auto h-4 w-4" /></button>
              <button type="button" onClick={() => set('italico', !a.italico)} className={estiloBtn(a.italico)}><Italic className="mx-auto h-4 w-4" /></button>
              <button type="button" onClick={() => set('sublinhado', !a.sublinhado)} className={estiloBtn(a.sublinhado)}><Underline className="mx-auto h-4 w-4" /></button>
            </div>
          </Grupo>
          <Align value={a.align} onChange={(v) => set('align', v)} comJustificar />
          <Row label="Tamanho (pt)"><input type="number" min={8} max={48} value={a.size} onChange={(e) => set('size', Number(e.target.value))} className={inputCls} /></Row>
          <Faixa label="Altura da linha" min={1} max={4} step={0.1} value={a.lineHeight ?? 1.5} onChange={(v) => set('lineHeight', v)} />
          <Cor label="Cor" value={a.color} onChange={(v) => set('color', v)} />
          <Faixa label="Espaçamento entre letras (px)" min={0} max={8} value={a.espacamento ?? 0} onChange={(v) => set('espacamento', v)} />
        </div>
      )
    case 'instrucoes':
      return (
        <div className="space-y-3">
          <Row label="Título"><input value={a.titulo} onChange={(e) => set('titulo', e.target.value)} className={inputCls} /></Row>
          <Row label="Texto"><textarea value={a.texto} onChange={(e) => set('texto', e.target.value)} rows={4} className={inputCls} /></Row>
          <FonteSelect value={a.fonte} onChange={(v) => set('fonte', v)} />
          <AlturaVertical a={a} set={set} />
          <LarguraBloco a={a} set={set} />
          <Cor label="Cor de fundo" value={a.corFundo} onChange={(v) => set('corFundo', v)} />
          <Cor label="Cor da borda" value={a.corBorda} onChange={(v) => set('corBorda', v)} />
        </div>
      )
    case 'lista-questoes':
      return (
        <div className="space-y-3">
          <p className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs text-muted-foreground">Puxa as questões reais do simulado/pasta vinculado.</p>
          <Row label="Título (opcional)"><input value={a.titulo} onChange={(e) => set('titulo', e.target.value)} className={inputCls} /></Row>
          <Row label="Quantidade (vazio = todas)"><input type="number" min={1} value={a.quantidade ?? ''} onChange={(e) => set('quantidade', e.target.value ? Number(e.target.value) : null)} className={inputCls} /></Row>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={a.mostrarAlternativas} onChange={(e) => set('mostrarAlternativas', e.target.checked)} /> Mostrar alternativas</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={a.mostrarGabarito} onChange={(e) => set('mostrarGabarito', e.target.checked)} /> Marcar gabarito</label>
        </div>
      )
    case 'gabarito-grid':
      return (
        <div className="space-y-3">
          <Row label="Mostrar">
            <select value={a.origem ?? 'marcado'} onChange={(e) => set('origem', e.target.value)} className={inputCls}>
              <option value="marcado">Respostas do aluno</option>
              <option value="oficial">Gabarito oficial</option>
            </select>
          </Row>
          {(a.origem ?? 'marcado') === 'oficial' && <p className="rounded-md border border-amber-300/40 bg-amber-50 px-2 py-1.5 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">O <b>gabarito oficial</b> revela as respostas — aparece só na versão do caderno <b>com o gabarito liberado</b>.</p>}
          <Row label="Título (vazio = automático)"><input value={a.titulo ?? ''} onChange={(e) => set('titulo', e.target.value)} placeholder={(a.origem ?? 'marcado') === 'oficial' ? 'Gabarito Oficial' : 'Gabarito de Alternativas'} className={inputCls} /></Row>
          <Faixa label="Questões por linha" min={4} max={20} value={a.porLinha ?? 10} onChange={(v) => set('porLinha', v)} />
          <Faixa label="Arredondamento das bordas (0 = retas)" min={0} max={16} value={a.bordaRaio ?? 8} onChange={(v) => set('bordaRaio', v)} />
          <Row label="Nº de questões (vazio = real)"><input type="number" min={1} value={a.numQuestoes ?? ''} onChange={(e) => set('numQuestoes', e.target.value ? Number(e.target.value) : null)} className={inputCls} /></Row>
          <Row label="Alternativas por questão"><input type="number" min={2} max={6} value={a.numAlternativas ?? 5} onChange={(e) => set('numAlternativas', Number(e.target.value))} className={inputCls} /></Row>
          <p className="pt-1 text-xs font-semibold text-muted-foreground">Fonte</p>
          <FonteSelect value={a.fonte ?? ''} onChange={(v) => set('fonte', v)} />
          <p className="pt-1 text-xs font-semibold text-muted-foreground">Cabeçalho</p>
          <Cor label="Fundo do cabeçalho" value={a.corHeader} onChange={(v) => set('corHeader', v)} />
          <Cor label="Cor do texto do cabeçalho" value={a.corHeaderTexto} onChange={(v) => set('corHeaderTexto', v)} />
          <p className="pt-1 text-xs font-semibold text-muted-foreground">Respostas</p>
          <Cor label="Cor do texto (respostas marcadas)" value={a.corMarcadas ?? a.corLetra} onChange={(v) => set('corMarcadas', v)} />
          <p className="pt-1 text-xs font-semibold text-muted-foreground">Linhas ímpares (1ª, 3ª…)</p>
          <Cor label="Cor do fundo — linha ímpar" value={a.fundoImpar ?? a.corLinhaImpar} onChange={(v) => set('fundoImpar', v)} />
          <Cor label="Cor do texto (nº) — linha ímpar" value={a.textoImpar} onChange={(v) => set('textoImpar', v)} />
          <p className="pt-1 text-xs font-semibold text-muted-foreground">Linhas pares (2ª, 4ª…)</p>
          <Cor label="Cor do fundo — linha par" value={a.fundoPar ?? a.corLinhaPar ?? a.corListra} onChange={(v) => set('fundoPar', v)} />
          <Cor label="Cor do texto (nº) — linha par" value={a.textoPar} onChange={(v) => set('textoPar', v)} />
        </div>
      )
    case 'identificacao':
      return (
        <div className="space-y-3">
          <Row label="Título"><input value={a.titulo ?? ''} onChange={(e) => set('titulo', e.target.value)} placeholder="Dados do Candidato" className={inputCls} /></Row>
          <Faixa label="Arredondamento das bordas (0 = retas)" min={0} max={16} value={a.bordaRaio ?? 8} onChange={(v) => set('bordaRaio', v)} />
          <p className="pt-1 text-xs font-semibold text-muted-foreground">Fonte</p>
          <FonteSelect value={a.fonte ?? ''} onChange={(v) => set('fonte', v)} />
          <p className="pt-1 text-xs font-semibold text-muted-foreground">Cabeçalho</p>
          <Cor label="Fundo do cabeçalho" value={a.corHeader} onChange={(v) => set('corHeader', v)} />
          <Cor label="Texto do cabeçalho" value={a.corHeaderTexto} onChange={(v) => set('corHeaderTexto', v)} />
          <p className="pt-1 text-xs font-semibold text-muted-foreground">Campos</p>
          <Cor label="Cor do rótulo" value={a.corRotulo} onChange={(v) => set('corRotulo', v)} />
          <Cor label="Cor do valor" value={a.corValor} onChange={(v) => set('corValor', v)} />
          <Cor label="Fundo da linha de destaque" value={a.corDestaque} onChange={(v) => set('corDestaque', v)} />
          <p className="pt-1 text-xs font-semibold text-muted-foreground">Detalhes</p>
          <Cor label="Cor da borda" value={a.corBorda} onChange={(v) => set('corBorda', v)} />
          <Cor label="Linha inferior (destaque)" value={a.corAcento} onChange={(v) => set('corAcento', v)} />
          <GrupoCampos label="Destaque (linha de cima, maior)" items={normCampos(a.destaque)} onChange={(v) => set('destaque', v)} exemplos="{{nome}} {{email}} {{telefone}} {{simulado}} {{classificacao}}" />
          <GrupoCampos label="Estatísticas (linha de baixo)" items={normCampos(a.campos)} onChange={(v) => set('campos', v)} exemplos="{{data}} {{inicio}} {{termino}} {{tempo_total}} {{respondidas}} {{em_branco}}" />
          <div className="border-t pt-2" />
          <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={a.mostrarDesempenho !== false} onChange={(e) => set('mostrarDesempenho', e.target.checked)} className="h-4 w-4 rounded border" /> Linha de desempenho (só no caderno com gabarito liberado)</label>
          {a.mostrarDesempenho !== false && (
            <>
              <GrupoCampos label="Desempenho (centralizado, aparece só com gabarito liberado)" items={normCampos(a.desempenho)} onChange={(v) => set('desempenho', v)} exemplos="{{acertos}} {{erros}} {{percentual}} {{nota}} {{total_questoes}}" />
              <p className="text-[11px] text-muted-foreground">Cores por tipo: o campo com <code>{'{{acertos}}'}</code> usa a cor de acerto, <code>{'{{erros}}'}</code> a de erro, e <code>{'{{percentual}}'}</code>/<code>{'{{nota}}'}</code> muda pela faixa de % abaixo.</p>
              <Cor label="Cor de Acertos" value={a.corAcertos} onChange={(v) => set('corAcertos', v)} />
              <Cor label="Cor de Erros" value={a.corErros} onChange={(v) => set('corErros', v)} />
              <p className="pt-1 text-xs font-semibold text-muted-foreground">Média — cor por faixa de %</p>
              <Row label="Abaixo de (%) → cor baixa"><input type="number" min={0} max={100} value={a.mediaLim1 ?? 33} onChange={(e) => set('mediaLim1', Number(e.target.value))} className={inputCls} /></Row>
              <Row label="Até (%) → cor média"><input type="number" min={0} max={100} value={a.mediaLim2 ?? 66} onChange={(e) => set('mediaLim2', Number(e.target.value))} className={inputCls} /></Row>
              <Cor label={`Baixa (< ${a.mediaLim1 ?? 33}%)`} value={a.corMediaBaixa} onChange={(v) => set('corMediaBaixa', v)} />
              <Cor label={`Média (${a.mediaLim1 ?? 33}–${a.mediaLim2 ?? 66}%)`} value={a.corMediaMedia} onChange={(v) => set('corMediaMedia', v)} />
              <Cor label={`Alta (${a.mediaLim2 ?? 66}–99%)`} value={a.corMediaAlta} onChange={(v) => set('corMediaAlta', v)} />
              <Cor label="100% (padrão = roxo do sistema)" value={a.corMediaMax} onChange={(v) => set('corMediaMax', v)} />
            </>
          )}
        </div>
      )
    case 'imagem':
      return (
        <div className="space-y-3">
          <UploadImagem url={a.url} onChange={(v) => set('url', v)} />
          <Faixa label="Largura (%)" min={10} max={100} value={a.largura} onChange={(v) => set('largura', v)} />
          <Align value={a.align} onChange={(v) => set('align', v)} />
        </div>
      )
    case 'separador':
      return (
        <div className="space-y-3">
          <Row label="Orientação"><select value={a.orientacao ?? 'horizontal'} onChange={(e) => set('orientacao', e.target.value)} className={inputCls}><option value="horizontal">Horizontal (entre blocos)</option><option value="vertical">Vertical (entre colunas)</option></select></Row>
          <Row label="Espessura"><select value={a.espessura} onChange={(e) => set('espessura', Number(e.target.value))} className={inputCls}><option value={1}>Fina</option><option value={2}>Média</option><option value={4}>Grossa</option></select></Row>
          <Row label="Estilo"><select value={a.estilo} onChange={(e) => set('estilo', e.target.value)} className={inputCls}><option value="solido">Sólido</option><option value="tracejado">Tracejado</option><option value="pontilhado">Pontilhado</option></select></Row>
          {a.orientacao === 'vertical' && <Faixa label="Altura mínima (px)" min={0} max={600} value={a.altura ?? 0} onChange={(v) => set('altura', v)} />}
          <Cor label="Cor" value={a.cor} onChange={(v) => set('cor', v)} />
        </div>
      )
    case 'espacador':
      return <Faixa label="Altura (px)" min={4} max={ESPACADOR_MAX} value={Math.min(a.altura, ESPACADOR_MAX)} onChange={(v) => set('altura', v)} />
    case 'linhas-resposta':
      return (
        <div className="space-y-3">
          <Row label="Rótulo"><input value={a.rotulo ?? ''} onChange={(e) => set('rotulo', e.target.value)} placeholder="Resposta:" className={inputCls} /></Row>
          <Row label="Nº de linhas"><input type="number" min={1} max={40} value={a.quantidade ?? 6} onChange={(e) => set('quantidade', Number(e.target.value))} className={inputCls} /></Row>
          <Faixa label="Altura da linha (px)" min={16} max={120} value={a.altura ?? 28} onChange={(v) => set('altura', v)} />
          <Cor label="Cor da linha" value={a.cor} onChange={(v) => set('cor', v)} />
        </div>
      )
    case 'repeticao':
      return (
        <div className="space-y-3">
          <p className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs text-muted-foreground">Desenhe o template dentro do bloco (textos, cards, alternativas). Ele se repete para cada questão do banco. Use as variáveis <code>{'{q_num}'}</code>, <code>{'{q_enunciado}'}</code> e o bloco <strong>Alternativas</strong>.</p>
          <Row label="Quantidade (vazio = todas)"><input type="number" min={1} value={a.quantidade ?? ''} onChange={(e) => set('quantidade', e.target.value ? Number(e.target.value) : null)} className={inputCls} /></Row>
          <Faixa label="Espaço entre questões (px)" min={0} max={48} value={a.gap ?? 16} onChange={(v) => set('gap', v)} />
        </div>
      )
    case 'alternativas':
      return (
        <div className="space-y-3">
          <p className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs text-muted-foreground">Mostra as alternativas da questão atual (uma embaixo da outra). Use dentro do bloco <strong>Repetir por questão</strong>.</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={a.mostrarGabarito} onChange={(e) => set('mostrarGabarito', e.target.checked)} /> Marcar gabarito</label>
        </div>
      )
    case 'gabarito-correcao':
      return (
        <div className="space-y-3">
          <p className="rounded bg-green-50 px-2 py-1.5 text-xs text-green-700 dark:bg-green-950/40 dark:text-green-300">Mostra a resposta marcada (verde se acertou, vermelho se errou) e, ao errar, a alternativa correta em verde. Aparece só quando o gabarito do simulado é liberado. Use dentro do <strong>Repetir por questão</strong>.</p>
          <Row label="Rótulo (opcional)"><input value={a.rotulo ?? ''} onChange={(e) => set('rotulo', e.target.value)} placeholder="Sua resposta:" className={inputCls} /></Row>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={a.mostrarCorreta} onChange={(e) => set('mostrarCorreta', e.target.checked)} /> Mostrar a correta quando errar</label>
        </div>
      )
    case 'q-comentario':
      return (
        <div className="space-y-3">
          <p className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs text-muted-foreground">Mostra o <b>comentário da questão</b> (vem da alternativa correta). Use dentro do <strong>Repetir por questão</strong>. Revela o gabarito, então por padrão só aparece na versão <b>com correção</b>. Questões sem comentário não exibem o bloco.</p>
          <Row label="Título"><input value={a.titulo ?? ''} onChange={(e) => set('titulo', e.target.value)} className={inputCls} placeholder="Comentário (vazio = sem título)" /></Row>
          <Row label="Conteúdo"><select value={a.modo ?? 'correta'} onChange={(e) => set('modo', e.target.value)} className={inputCls}>
            <option value="correta">Comentário da alternativa correta</option>
            <option value="todas">Comentário de todas as alternativas (A–E)</option>
          </select></Row>
          <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={a.mostrarGabarito !== false} onChange={(e) => set('mostrarGabarito', e.target.checked)} className="h-4 w-4 rounded border" /> Mostrar “Gabarito: X” no título</label>
          <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={a.mostrarLei !== false} onChange={(e) => set('mostrarLei', e.target.checked)} className="h-4 w-4 rounded border" /> Mostrar a lei/base legal (quando houver)</label>
          <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={a.respeitaGabarito !== false} onChange={(e) => set('respeitaGabarito', e.target.checked)} className="h-4 w-4 rounded border" /> Só na versão com correção (respeita o gabarito)</label>
          <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={a.soSeTiver !== false} onChange={(e) => set('soSeTiver', e.target.checked)} className="h-4 w-4 rounded border" /> Só aparece se a questão tiver comentário</label>
          <FonteSelect value={a.fonte} onChange={(v) => set('fonte', v)} />
          <Faixa label="Espaçamento interno (px)" min={0} max={24} value={a.padding ?? 10} onChange={(v) => set('padding', v)} />
          <Faixa label="Arredondamento (px)" min={0} max={20} value={a.bordaRaio ?? 8} onChange={(v) => set('bordaRaio', v)} />
          <div className="border-t pt-2" />
          <Cor label="Cor de fundo" value={a.corFundo} onChange={(v) => set('corFundo', v)} />
          <Cor label="Cor da borda" value={a.corBorda} onChange={(v) => set('corBorda', v)} />
          <Cor label="Cor do título" value={a.corTitulo} onChange={(v) => set('corTitulo', v)} />
          <Cor label="Cor do texto" value={a.corTexto} onChange={(v) => set('corTexto', v)} />
          <Cor label="Cor da lei" value={a.corLei} onChange={(v) => set('corLei', v)} />
        </div>
      )
    case 'card':
      return (
        <div className="space-y-3">
          <p className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs text-muted-foreground">Use os botões no card (canvas) para inserir blocos dentro dele.</p>
          <Cor label="Cor de fundo" value={a.corFundo} onChange={(v) => set('corFundo', v)} />
          <Cor label="Cor da borda" value={a.bordaCor} onChange={(v) => set('bordaCor', v)} />
          <Faixa label="Espessura da borda (px)" min={0} max={6} value={a.bordaLargura} onChange={(v) => set('bordaLargura', v)} />
          <Faixa label="Cantos arredondados (px)" min={0} max={28} value={a.bordaRaio} onChange={(v) => set('bordaRaio', v)} />
          <Faixa label="Espaçamento interno (px)" min={0} max={40} value={a.padding} onChange={(v) => set('padding', v)} />
          <Faixa label="Largura (%)" min={5} max={100} value={a.largura} onChange={(v) => set('largura', v)} />
          <Align value={a.alinhamento} onChange={(v) => set('alinhamento', v)} />
          <div className="border-t pt-2" />
          <Cor label="Fita no topo (cor)" value={a.fitaCor} onChange={(v) => set('fitaCor', v)} />
          <Faixa label="Altura da fita (px) — 0 = sem fita" min={0} max={12} value={a.fitaAltura ?? 0} onChange={(v) => set('fitaAltura', v)} />
        </div>
      )
    case 'diag-nota':
      return (
        <div className="space-y-3">
          <p className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs text-muted-foreground">Cartão de nota do aluno. À esquerda o <b>número/total</b>; à direita o texto (edite com as variáveis).</p>
          <Row label="Número (esquerda)"><select value={a.varNumero ?? 'acertos'} onChange={(e) => set('varNumero', e.target.value)} className={inputCls}><option value="acertos">Acertos</option><option value="percentual">Percentual (média)</option><option value="nota">Nota</option></select></Row>
          <Row label="Total (após a /)"><select value={a.varTotal ?? 'total_questoes'} onChange={(e) => set('varTotal', e.target.value)} className={inputCls}><option value="total_questoes">Total de questões</option><option value="__100">100 (fixo)</option></select></Row>
          <Row label="Texto (direita)"><textarea value={a.texto ?? ''} onChange={(e) => set('texto', e.target.value)} rows={2} className={inputCls} placeholder="{acertos} acertos de {total_questoes} questões — {percentual} de aproveitamento" /></Row>
          <Variaveis />
          <FonteSelect value={a.fonte} onChange={(v) => set('fonte', v)} />
          <Faixa label="Largura da caixa da nota (px)" min={80} max={280} value={a.larguraEsquerda ?? 150} onChange={(v) => set('larguraEsquerda', v)} />
          <div className="border-t pt-2" />
          <Cor label="Cor 1 (caixa da nota)" value={a.corEsquerda} onChange={(v) => set('corEsquerda', v)} />
          <Cor label="Cor 2 (faixa do texto)" value={a.corDireita} onChange={(v) => set('corDireita', v)} />
          <Cor label="Cor do número (X/100)" value={a.corNumero} onChange={(v) => set('corNumero', v)} />
          <Cor label="Cor do texto" value={a.corTexto} onChange={(v) => set('corTexto', v)} />
        </div>
      )
    case 'diag-sugestoes':
      return (
        <div className="space-y-3">
          <p className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs text-muted-foreground">Cole os tópicos em <b>Tópicos</b>, um por linha. Comece com <code>&gt;&gt;</code> para <b>alto</b> (seta dupla) ou <code>&gt;</code> para <b>médio</b> (seta simples).</p>
          <Row label="Título"><input value={a.titulo ?? ''} onChange={(e) => set('titulo', e.target.value)} className={inputCls} placeholder="LEI SECA" /></Row>
          <Variaveis />
          <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={a.mostrarPrioridade !== false} onChange={(e) => set('mostrarPrioridade', e.target.checked)} className="h-4 w-4 rounded border" /> Mostrar prioridade (à direita)</label>
          {a.mostrarPrioridade !== false && <Row label="Prioridade"><input value={a.prioridade ?? ''} onChange={(e) => set('prioridade', e.target.value)} className={inputCls} placeholder="Prioridade Alta" /></Row>}
          <Row label="Texto de introdução"><textarea value={a.intro ?? ''} onChange={(e) => set('intro', e.target.value)} rows={3} className={inputCls} placeholder="Texto abaixo do título…" /></Row>
          <Row label="Tópicos (>> alto | > médio)"><textarea value={a.topicos ?? ''} onChange={(e) => set('topicos', e.target.value)} rows={8} className={`${inputCls} font-mono text-[11px]`} placeholder={'>> CF/1988 — arts. 44-75 (Poder Legislativo)…\n> Lei 8.112/1990 (Estatuto do Servidor)…'} /></Row>
          <FonteSelect value={a.fonte} onChange={(v) => set('fonte', v)} />
          <div className="border-t pt-2" />
          <Cor label="Fundo do cabeçalho" value={a.corHeader} onChange={(v) => set('corHeader', v)} />
          <Cor label="Cor do título" value={a.corTitulo} onChange={(v) => set('corTitulo', v)} />
          <Cor label="Cor da prioridade" value={a.corPrioridade} onChange={(v) => set('corPrioridade', v)} />
          <Cor label="Fundo do corpo" value={a.corRow} onChange={(v) => set('corRow', v)} />
          <Cor label="Seta alta (>>)" value={a.corSetaAlto} onChange={(v) => set('corSetaAlto', v)} />
          <Cor label="Seta média (>)" value={a.corSetaMedio} onChange={(v) => set('corSetaMedio', v)} />
          <Cor label="Cor do texto" value={a.corTexto} onChange={(v) => set('corTexto', v)} />
        </div>
      )
    case 'diag-grupo-header': {
      const chaves: string[] = Array.isArray(a.chaves) ? a.chaves : []
      const grupos = gruposBanco ?? []
      const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
      const humano = (s: string) => s.replace(/_/g, ' ').replace(/^./, (ch) => ch.toUpperCase())
      const escolher = (nome: string) => {
        const gr = grupos.find((x) => x.nome === nome)
        if (!gr) { onChange({ grupo: nome }); return }
        onChange({ grupo: gr.nome, chaves: gr.disciplinas.map(slugify) })
      }
      return (
        <div className="space-y-3">
          <p className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs text-muted-foreground">Selecione um <b>grupo do simulado</b> — o nome e as disciplinas (e o “Acertos X/N” somado) vêm dele automaticamente.</p>
          <Row label="Grupo do simulado">
            <select value={a.grupo ?? ''} onChange={(e) => escolher(e.target.value)} className={inputCls}>
              <option value="">— escolher grupo —</option>
              {grupos.map((gr) => <option key={gr.id} value={gr.nome}>{gr.nome} ({gr.disciplinas.length} disc.)</option>)}
              {a.grupo && !grupos.some((gr) => gr.nome === a.grupo) && <option value={a.grupo}>{a.grupo} (atual)</option>}
            </select>
          </Row>
          {grupos.length === 0 && <p className="text-[11px] text-amber-600 dark:text-amber-400">Nenhum grupo definido no banco. Defina os grupos em Banco de Simulado → Grupos, e recarregue.</p>}
          {chaves.length > 0 && (
            <Grupo label={`Disciplinas do grupo (${chaves.length})`}>
              <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border bg-muted/20 p-1.5 text-xs">
                {chaves.map((s) => <div key={s} className="truncate">• {humano(s)}</div>)}
              </div>
            </Grupo>
          )}
          <FonteSelect value={a.fonte} onChange={(v) => set('fonte', v)} />
          <Cor label="Cor de fundo" value={a.corHeader} onChange={(v) => set('corHeader', v)} />
          <Cor label="Cor do texto" value={a.corTexto} onChange={(v) => set('corTexto', v)} />
        </div>
      )
    }
    case 'diag-disciplina': {
      const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
      const humano = (s: string) => s.replace(/_/g, ' ').replace(/^./, (ch) => ch.toUpperCase())
      // Se o nome vier TODO EM MAIÚSCULA, formata para Título (pt-br); se já tem minúsculas, mantém.
      const MINUS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'em', 'na', 'no', 'para', 'por', 'com', 'sobre', 'ao', 'à'])
      const formatar = (s: string) => /[a-zà-ÿ]/.test(s) ? s : s.toLowerCase().split(/\s+/).map((w, i) => (i > 0 && MINUS.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      // Nomes REAIS das disciplinas (do banco/grupos). Fallback: slugs das variáveis, humanizados.
      const nomesReais = [...new Set((gruposBanco ?? []).flatMap((g) => g.disciplinas))].sort()
      const slugsVar = [...new Set((varsExtra ?? []).filter((g) => /Disciplina/i.test(g.grupo)).flatMap((g) => g.itens.map((v) => v.token.match(/\{pct_(.+)\}/)?.[1]).filter(Boolean)))] as string[]
      const usarReais = nomesReais.length > 0
      return (
        <div className="space-y-3">
          <p className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs text-muted-foreground">Escolha a <b>disciplina do simulado</b> — o bloco usa o <b>nome real</b> dela e preenche acertos/total/% automaticamente. Só aparece se o aluno <b>errou</b> ao menos uma questão.</p>
          <Row label="Disciplina">
            {usarReais ? (
              <select value={a.chave ?? ''} onChange={(e) => { const real = nomesReais.find((n) => slugify(n) === e.target.value); if (real) onChange({ nome: formatar(real), chave: slugify(real) }) }} className={inputCls}>
                <option value="">— escolher —</option>
                {nomesReais.map((n) => <option key={n} value={slugify(n)}>{formatar(n)}</option>)}
                {a.chave && !nomesReais.some((n) => slugify(n) === a.chave) && <option value={a.chave}>{a.nome || humano(a.chave)} (atual)</option>}
              </select>
            ) : (
              <select value={a.chave ?? ''} onChange={(e) => { const s = e.target.value; onChange({ chave: s, nome: humano(s) }) }} className={inputCls}>
                <option value="">— escolher —</option>
                {slugsVar.map((s) => <option key={s} value={s}>{humano(s)}</option>)}
                {a.chave && !slugsVar.includes(a.chave) && <option value={a.chave}>{humano(a.chave)} (atual)</option>}
              </select>
            )}
          </Row>
          <Row label="Nome exibido"><input value={a.nome ?? ''} onChange={(e) => set('nome', e.target.value)} className={inputCls} placeholder="Direito Constitucional" /></Row>
          <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={a.assuntoAuto !== false} onChange={(e) => set('assuntoAuto', e.target.checked)} className="h-4 w-4 rounded border" /> Assuntos automáticos (das questões erradas)</label>
          {a.assuntoAuto !== false ? (
            (() => {
              const lista = (assuntosBanco ?? {})[a.chave] ?? []
              return (
                <div className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs text-muted-foreground">
                  {a.chave
                    ? (lista.length
                        ? <><b>Assuntos desta disciplina ({lista.length}):</b><div className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">{lista.map((s) => <div key={s} className="truncate">• {s}</div>)}</div><p className="mt-1.5 text-[11px]">No relatório, cada aluno vê só os assuntos das questões que <b>errou</b> (uma por linha); se acertou tudo, o bloco não aparece.</p></>
                        : <>Nenhum assunto principal armazenado para esta disciplina nas questões do banco. Importe a coluna <b>“Assunto Principal”</b> ou preencha manualmente (desmarque a opção acima).</>)
                    : 'Selecione uma disciplina para ver os assuntos que serão listados.'}
                </div>
              )
            })()
          ) : (
            <Row label="Assunto principal (manual)"><input value={a.assunto ?? ''} onChange={(e) => set('assunto', e.target.value)} className={inputCls} placeholder="Assunto Principal (vazio = não mostra)" /></Row>
          )}
          <FonteSelect value={a.fonte} onChange={(v) => set('fonte', v)} />
          <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={a.soSeErrou !== false} onChange={(e) => set('soSeErrou', e.target.checked)} className="h-4 w-4 rounded border" /> Só aparece se errou alguma questão</label>
          <div className="border-t pt-2" />
          <Cor label="Cor da linha (de cima)" value={a.corLinha} onChange={(v) => set('corLinha', v)} />
          <Faixa label="Espessura da linha (px)" min={0} max={8} value={a.linhaAltura ?? 2} onChange={(v) => set('linhaAltura', v)} />
          <Cor label="Fundo" value={a.corRow} onChange={(v) => set('corRow', v)} />
          <Cor label="Cor do título" value={a.corTitulo} onChange={(v) => set('corTitulo', v)} />
          <Cor label="Cor dos assuntos" value={a.corAssunto} onChange={(v) => set('corAssunto', v)} />
          <Cor label="Cor do acerto (X/N)" value={a.corAcerto} onChange={(v) => set('corAcerto', v)} />
          <Cor label="Cor do %" value={a.corPct} onChange={(v) => set('corPct', v)} />
        </div>
      )
    }
    case 'diag-grupo': {
      const disc: any[] = Array.isArray(a.disciplinas) ? a.disciplinas : []
      const setD = (i: number, k: string, v: string) => set('disciplinas', disc.map((d, idx) => idx === i ? { ...d, [k]: v } : d))
      const addD = () => set('disciplinas', [...disc, { chave: '', nome: 'Nova disciplina', assunto: '' }])
      const rmD = (i: number) => set('disciplinas', disc.filter((_, idx) => idx !== i))
      const mvD = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= disc.length) return; const arr = [...disc]; [arr[i], arr[j]] = [arr[j], arr[i]]; set('disciplinas', arr) }
      return (
        <div className="space-y-3">
          <p className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs text-muted-foreground">Um bloco por grupo. As disciplinas listadas mostram acertos/total/% reais do aluno. A <b>chave</b> é o slug da disciplina (ex.: <code>direito_administrativo</code>) — veja no painel “Disciplinas (deste simulado)”. “Acertos x/N” do topo é somado automaticamente.</p>
          <Row label="Nome do grupo"><input value={a.grupo ?? ''} onChange={(e) => set('grupo', e.target.value)} className={inputCls} placeholder="Grupo I" /></Row>
          {(varsExtra ?? []).filter((g) => /Disciplina/i.test(g.grupo)).map((g) => (
            <Grupo key={g.grupo} label={`${g.grupo} — clique para adicionar`}>
              <div className="flex flex-wrap gap-1">{[...new Set(g.itens.map((v) => v.token.match(/\{pct_(.+)\}/)?.[1]).filter(Boolean))].map((slugK) => (
                <button key={slugK} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => set('disciplinas', [...disc, { chave: slugK, nome: String(slugK).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), assunto: 'Assunto Principal' }])} className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:bg-primary/5 hover:text-primary">+ {String(slugK).replace(/_/g, ' ')}</button>
              ))}</div>
            </Grupo>
          ))}
          {disc.map((d, i) => (
            <div key={i} className="space-y-1.5 rounded-lg border p-2">
              <div className="flex items-center gap-1">
                <input value={d.nome ?? ''} onChange={(e) => setD(i, 'nome', e.target.value)} className={inputCls} placeholder="Nome exibido" />
                <button type="button" onClick={() => mvD(i, -1)} className="rounded p-1 text-muted-foreground hover:text-foreground">↑</button>
                <button type="button" onClick={() => mvD(i, 1)} className="rounded p-1 text-muted-foreground hover:text-foreground">↓</button>
                <button type="button" onClick={() => rmD(i)} className="rounded p-1 text-muted-foreground hover:text-destructive">✕</button>
              </div>
              <input value={d.chave ?? ''} onChange={(e) => setD(i, 'chave', e.target.value.trim())} className={inputCls} placeholder="chave (direito_administrativo)" />
              <input value={d.assunto ?? ''} onChange={(e) => setD(i, 'assunto', e.target.value)} className={inputCls} placeholder="Assunto principal (opcional)" />
            </div>
          ))}
          <button type="button" onClick={addD} className="w-full rounded-md border border-dashed py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-primary">+ Adicionar disciplina (em branco)</button>
          <div className="border-t pt-2" />
          <Row label="Fita (linha colorida)"><select value={a.fitaPosicao ?? 'base'} onChange={(e) => set('fitaPosicao', e.target.value)} className={inputCls}><option value="base">Embaixo</option><option value="topo">Em cima</option></select></Row>
          <Faixa label="Espessura da fita (px)" min={0} max={8} value={a.fitaAltura ?? 3} onChange={(v) => set('fitaAltura', v)} />
          <Faixa label="Altura mínima da linha (px) — 0 = automática" min={0} max={120} value={a.alturaLinha ?? 0} onChange={(v) => set('alturaLinha', v)} />
          <Faixa label="Espaço entre linhas (px)" min={0} max={20} value={a.gapLinha ?? 6} onChange={(v) => set('gapLinha', v)} />
          <Cor label="Cor do cabeçalho" value={a.corHeader} onChange={(v) => set('corHeader', v)} />
          <Cor label="Texto do cabeçalho" value={a.corHeaderTexto} onChange={(v) => set('corHeaderTexto', v)} />
          <Cor label="Fita das linhas" value={a.corFita} onChange={(v) => set('corFita', v)} />
          <Cor label="Fundo das linhas" value={a.corRow} onChange={(v) => set('corRow', v)} />
          <Cor label="Cor do título (disciplina)" value={a.corTitulo} onChange={(v) => set('corTitulo', v)} />
          <Cor label="Cor do acerto (X/N)" value={a.corAcerto} onChange={(v) => set('corAcerto', v)} />
          <Cor label="Cor do %" value={a.corPct} onChange={(v) => set('corPct', v)} />
        </div>
      )
    }
    case 'diag-pilar':
      return (
        <div className="space-y-3">
          <p className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs text-muted-foreground">Um pilar único (dá pra empilhar vários e montar o layout que quiser). A <b>chave</b> casa com o desempenho do aluno (ex.: <code>lei_seca</code>); o <b>texto de faixa</b> é escolhido pelo % real (0–50 / 51–80 / 81–100).</p>
          <Row label="Nome exibido"><input value={a.nome ?? ''} onChange={(e) => set('nome', e.target.value)} className={inputCls} placeholder="LEI SECA" /></Row>
          <Row label="Chave do pilar"><input value={a.chave ?? ''} onChange={(e) => set('chave', e.target.value.trim())} className={inputCls} placeholder="lei_seca" /></Row>
          <textarea value={a.f1 ?? ''} onChange={(e) => set('f1', e.target.value)} rows={2} className={inputCls} placeholder="Texto faixa 0–50" />
          <textarea value={a.f2 ?? ''} onChange={(e) => set('f2', e.target.value)} rows={2} className={inputCls} placeholder="Texto faixa 51–80" />
          <textarea value={a.f3 ?? ''} onChange={(e) => set('f3', e.target.value)} rows={2} className={inputCls} placeholder="Texto faixa 81–100" />
          <div className="border-t pt-2" />
          <FonteSelect value={a.fonte ?? ''} onChange={(v) => set('fonte', v)} />
          <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={a.mostrarLinhaInterna !== false} onChange={(e) => set('mostrarLinhaInterna', e.target.checked)} className="h-4 w-4 rounded border" /> Linha interna (antes do texto)</label>
          <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={a.mostrarLabel !== false} onChange={(e) => set('mostrarLabel', e.target.checked)} className="h-4 w-4 rounded border" /> Mostrar rótulo “TEXTO MODULADO”</label>
          {a.mostrarLabel !== false && <Row label="Texto do rótulo"><input value={a.textoLabel ?? ''} onChange={(e) => set('textoLabel', e.target.value)} className={inputCls} placeholder="TEXTO MODULADO" /></Row>}
          <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={a.mostrarFaixa !== false} onChange={(e) => set('mostrarFaixa', e.target.checked)} className="h-4 w-4 rounded border" /> Mostrar rótulo da faixa (0-50 / 51-80 / 81-100)</label>
          <Faixa label="Tamanho do título (px)" min={8} max={24} value={a.tamTitulo ?? 12} onChange={(v) => set('tamTitulo', v)} />
          <Faixa label="Tamanho do % (px)" min={12} max={40} value={a.tamPct ?? 22} onChange={(v) => set('tamPct', v)} />
          <div className="border-t pt-2" />
          <Cor label="Cor de fundo" value={a.corFundo} onChange={(v) => set('corFundo', v)} />
          <Cor label="Cor do título" value={a.corTitulo} onChange={(v) => set('corTitulo', v)} />
          <Cor label="Cor do %" value={a.corPct} onChange={(v) => set('corPct', v)} />
          <Cor label="Cor de “X de N questões”" value={a.corQuestoes} onChange={(v) => set('corQuestoes', v)} />
          <Cor label="Cor da linha interna" value={a.corLinhaInterna} onChange={(v) => set('corLinhaInterna', v)} />
          <Cor label="Cor do rótulo (TEXTO MODULADO)" value={a.corLabel} onChange={(v) => set('corLabel', v)} />
          <Cor label="Cor da faixa (0-50…)" value={a.corFaixa} onChange={(v) => set('corFaixa', v)} />
          <Cor label="Cor do texto modulado" value={a.corTexto} onChange={(v) => set('corTexto', v)} />
        </div>
      )
    case 'diag-pilares': {
      const pilares: any[] = Array.isArray(a.pilares) ? a.pilares : []
      const setP = (i: number, k: string, v: string) => set('pilares', pilares.map((p, idx) => idx === i ? { ...p, [k]: v } : p))
      const addP = () => set('pilares', [...pilares, { chave: '', nome: 'NOVO PILAR', f1: '', f2: '', f3: '' }])
      const rmP = (i: number) => set('pilares', pilares.filter((_, idx) => idx !== i))
      return (
        <div className="space-y-3">
          <p className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs text-muted-foreground">Os 3 pilares aparecem colados com % real do aluno. O <b>texto de faixa</b> é escolhido automaticamente pelo desempenho (0–50 / 51–80 / 81–100). A <b>chave</b> deve casar com o pilar da importação (ex.: <code>lei_seca</code>).</p>
          {pilares.map((p, i) => (
            <div key={i} className="space-y-1.5 rounded-lg border p-2">
              <div className="flex items-center gap-1.5">
                <input value={p.nome ?? ''} onChange={(e) => setP(i, 'nome', e.target.value)} className={inputCls} placeholder="Nome exibido (LEI SECA)" />
                <button type="button" onClick={() => rmP(i)} className="rounded p-1 text-muted-foreground hover:text-destructive">✕</button>
              </div>
              <input value={p.chave ?? ''} onChange={(e) => setP(i, 'chave', e.target.value.trim())} className={inputCls} placeholder="chave do pilar (lei_seca)" />
              <textarea value={p.f1 ?? ''} onChange={(e) => setP(i, 'f1', e.target.value)} rows={2} className={inputCls} placeholder="Texto faixa 0–50" />
              <textarea value={p.f2 ?? ''} onChange={(e) => setP(i, 'f2', e.target.value)} rows={2} className={inputCls} placeholder="Texto faixa 51–80" />
              <textarea value={p.f3 ?? ''} onChange={(e) => setP(i, 'f3', e.target.value)} rows={2} className={inputCls} placeholder="Texto faixa 81–100" />
            </div>
          ))}
          <button type="button" onClick={addP} className="w-full rounded-md border border-dashed py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-primary">+ Adicionar pilar</button>
          <div className="border-t pt-2" />
          <FonteSelect value={a.fonte ?? ''} onChange={(v) => set('fonte', v)} />
          <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={a.mostrarLinhaInterna !== false} onChange={(e) => set('mostrarLinhaInterna', e.target.checked)} className="h-4 w-4 rounded border" /> Linha interna (antes do texto)</label>
          <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={a.mostrarLabel !== false} onChange={(e) => set('mostrarLabel', e.target.checked)} className="h-4 w-4 rounded border" /> Mostrar rótulo “TEXTO MODULADO”</label>
          {a.mostrarLabel !== false && <Row label="Texto do rótulo"><input value={a.textoLabel ?? ''} onChange={(e) => set('textoLabel', e.target.value)} className={inputCls} placeholder="TEXTO MODULADO" /></Row>}
          <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={a.mostrarFaixa !== false} onChange={(e) => set('mostrarFaixa', e.target.checked)} className="h-4 w-4 rounded border" /> Mostrar rótulo da faixa (0-50 / 51-80 / 81-100)</label>
          <Faixa label="Tamanho do título (px)" min={8} max={24} value={a.tamTitulo ?? 12} onChange={(v) => set('tamTitulo', v)} />
          <Faixa label="Tamanho do % (px)" min={12} max={40} value={a.tamPct ?? 22} onChange={(v) => set('tamPct', v)} />
          <div className="border-t pt-2" />
          <Cor label="Cor de fundo" value={a.corFundo} onChange={(v) => set('corFundo', v)} />
          <Cor label="Cor da divisória (entre colunas)" value={a.divisoriaCor} onChange={(v) => set('divisoriaCor', v)} />
          <Cor label="Cor do título" value={a.corTitulo} onChange={(v) => set('corTitulo', v)} />
          <Cor label="Cor do %" value={a.corPct} onChange={(v) => set('corPct', v)} />
          <Cor label="Cor de “X de N questões”" value={a.corQuestoes} onChange={(v) => set('corQuestoes', v)} />
          <Cor label="Cor da linha interna" value={a.corLinhaInterna} onChange={(v) => set('corLinhaInterna', v)} />
          <Cor label="Cor do rótulo (TEXTO MODULADO)" value={a.corLabel} onChange={(v) => set('corLabel', v)} />
          <Cor label="Cor da faixa (0-50…)" value={a.corFaixa} onChange={(v) => set('corFaixa', v)} />
          <Cor label="Cor do texto modulado" value={a.corTexto} onChange={(v) => set('corTexto', v)} />
        </div>
      )
    }
    case 'condicao':
      return (
        <div className="space-y-3">
          <p className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs text-muted-foreground">Mostra os blocos DENTRO só quando a condição é verdadeira. Empilhe várias condições para o <b>texto modulado</b> (ex.: 0–50, 51–80, 81–100).</p>
          <Row label="Variável"><input value={a.variavel ?? ''} onChange={(e) => set('variavel', e.target.value.replace(/[{}]/g, ''))} className={inputCls} placeholder="ex.: pct_pilar_lei_seca" /></Row>
          {(varsExtra ?? []).map((g) => (
            <Grupo key={g.grupo} label={g.grupo}>
              <div className="flex flex-wrap gap-1">{g.itens.filter((v) => v.token.startsWith('{pct')).map((v) => (
                <button key={v.token} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => set('variavel', v.token.replace(/[{}]/g, ''))} className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:bg-primary/5 hover:text-primary">{v.label.replace(' · %', '')}</button>
              ))}</div>
            </Grupo>
          ))}
          <Row label="Condição"><select value={a.operador ?? 'entre'} onChange={(e) => set('operador', e.target.value)} className={inputCls}>
            <option value="entre">está entre</option><option value=">=">maior ou igual</option><option value="<=">menor ou igual</option>
            <option value=">">maior que</option><option value="<">menor que</option><option value="igual">igual a</option>
            <option value="diferente">diferente de</option><option value="contem">contém o texto</option>
          </select></Row>
          <Row label={a.operador === 'entre' ? 'De' : 'Valor'}><input value={a.valor ?? ''} onChange={(e) => set('valor', e.target.value)} className={inputCls} placeholder="ex.: 0" /></Row>
          {a.operador === 'entre' && <Row label="Até"><input value={a.valor2 ?? ''} onChange={(e) => set('valor2', e.target.value)} className={inputCls} placeholder="ex.: 50" /></Row>}
          <p className="text-[11px] text-muted-foreground">Dica: números com “%” funcionam (ex.: “45%” conta como 45).</p>
        </div>
      )
    case 'colunas':
      return (
        <div className="space-y-3">
          <p className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs text-muted-foreground">Use “+ coluna / − coluna” no bloco (canvas) e adicione blocos dentro de cada coluna. Clique numa coluna para ajustar a largura dela.</p>
          <Faixa label="Espaço entre colunas (px)" min={0} max={48} value={a.gap} onChange={(v) => set('gap', v)} />
          <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={!!a.divisoria} onChange={(e) => set('divisoria', e.target.checked)} className="h-4 w-4 rounded border" /> Linha divisória entre as colunas</label>
          {a.divisoria && (
            <>
              <Row label="Espessura"><select value={a.divisoriaEspessura ?? 1} onChange={(e) => set('divisoriaEspessura', Number(e.target.value))} className={inputCls}><option value={1}>Fina</option><option value={2}>Média</option><option value={4}>Grossa</option></select></Row>
              <Row label="Estilo"><select value={a.divisoriaEstilo ?? 'solido'} onChange={(e) => set('divisoriaEstilo', e.target.value)} className={inputCls}><option value="solido">Sólido</option><option value="tracejado">Tracejado</option><option value="pontilhado">Pontilhado</option></select></Row>
              <Cor label="Cor da divisória" value={a.divisoriaCor} onChange={(v) => set('divisoriaCor', v)} />
            </>
          )}
        </div>
      )
    case 'coluna':
      return (
        <div className="space-y-3">
          <p className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs text-muted-foreground">Largura desta coluna. <strong>0 = automática</strong> (divide o espaço igualmente com as demais).</p>
          <Faixa label="Largura da coluna (%)" min={0} max={100} value={a.largura ?? 0} onChange={(v) => set('largura', v)} />
        </div>
      )
    case 'plano-fundo':
      return (
        <div className="space-y-3">
          <UploadImagem url={a.url} onChange={(v) => set('url', v)} />
          <Faixa label="Opacidade (%)" min={5} max={100} value={a.opacidade} onChange={(v) => set('opacidade', v)} />
        </div>
      )
    case 'cabecalho-prova':
      return (
        <div className="space-y-3">
          <Row label="Colunas"><input type="number" min={1} max={4} value={a.colunas ?? 2} onChange={(e) => set('colunas', Number(e.target.value))} className={inputCls} /></Row>
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Campos (rótulo + valor)</span>
            {(a.campos ?? []).map((f: { rotulo: string; valor: string }, i: number) => (
              <div key={i} className="flex items-center gap-1">
                <input value={f.rotulo} onChange={(e) => { const cp = [...a.campos]; cp[i] = { ...cp[i], rotulo: e.target.value }; set('campos', cp) }} placeholder="Rótulo" className={inputCls} />
                <input value={f.valor} onChange={(e) => { const cp = [...a.campos]; cp[i] = { ...cp[i], valor: e.target.value }; set('campos', cp) }} placeholder="Valor" className={inputCls} />
                <button type="button" onClick={() => set('campos', a.campos.filter((_: unknown, j: number) => j !== i))} className="text-destructive hover:opacity-70"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button type="button" onClick={() => set('campos', [...(a.campos ?? []), { rotulo: 'Campo', valor: '' }])} className="flex items-center gap-1 text-xs text-primary hover:underline"><Plus className="h-3.5 w-3.5" /> Adicionar campo</button>
          </div>
          <p className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs text-muted-foreground">O valor aceita variáveis (ex.: <code>{'{nome}'}</code>).</p>
        </div>
      )
    case 'assinatura':
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Assinaturas (rótulo sob cada linha)</span>
            {(a.assinaturas ?? []).map((label: string, i: number) => (
              <div key={i} className="flex items-center gap-1">
                <input value={label} onChange={(e) => { const cp = [...a.assinaturas]; cp[i] = e.target.value; set('assinaturas', cp) }} className={inputCls} />
                <button type="button" onClick={() => set('assinaturas', a.assinaturas.filter((_: string, j: number) => j !== i))} className="text-destructive hover:opacity-70"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button type="button" onClick={() => set('assinaturas', [...(a.assinaturas ?? []), 'Assinatura'])} className="flex items-center gap-1 text-xs text-primary hover:underline"><Plus className="h-3.5 w-3.5" /> Adicionar assinatura</button>
          </div>
          <Align value={a.align} onChange={(v) => set('align', v)} />
          <Faixa label="Largura da linha (px)" min={100} max={400} value={a.larguraLinha ?? 220} onChange={(v) => set('larguraLinha', v)} />
        </div>
      )
    case 'quebra-pagina':
      return <p className="rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs text-muted-foreground">Força o conteúdo seguinte a começar numa nova página na impressão/PDF. O marcador tracejado não aparece no PDF.</p>
    default:
      return <p className="text-sm text-muted-foreground">Sem opções.</p>
  }
}
