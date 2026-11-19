'use client'
// Barra de ferramentas da folha livre. Alvos >= 44px, aria-label em tudo, cores só por tokens.
import { Eraser, Hand, Highlighter, Minus, MousePointer2, Pen, Plus, Redo2, Type, Undo2, Trash2, PenLine } from 'lucide-react'
import { PALETA_FOLHA, corParaVar, type CorFolha } from '@/lib/aluno/notebook-folha'

export type FerramentaFolha = 'caneta' | 'marca-texto' | 'borracha' | 'caixa' | 'selecionar' | 'mao'

const ROTULO_COR: Record<CorFolha, string> = {
  tinta: 'Tinta padrão', primaria: 'Cor da marca', vermelho: 'Vermelho', laranja: 'Laranja', amarelo: 'Amarelo', verde: 'Verde', azul: 'Azul', rosa: 'Rosa',
}
export const ESPESSURAS = [2, 4, 7, 12] as const

interface Props {
  ferramenta: FerramentaFolha
  aoFerramenta: (f: FerramentaFolha) => void
  cor: CorFolha
  aoCor: (c: CorFolha) => void
  espessura: number
  aoEspessura: (n: number) => void
  podeDesfazer: boolean
  podeRefazer: boolean
  aoDesfazer: () => void
  aoRefazer: () => void
  soCaneta: boolean
  aoSoCaneta: (v: boolean) => void
  zoom: number
  aoZoom: (z: number) => void
  temSelecao: boolean
  aoExcluirSelecao: () => void
  desabilitado?: boolean
}

const base: React.CSSProperties = {
  minWidth: 44, minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', cursor: 'pointer', padding: '0 10px',
}
const ativo: React.CSSProperties = { background: 'var(--brand-primary)', color: 'var(--brand-foreground, var(--primary-foreground))', borderColor: 'var(--brand-primary)' }

function Botao({ rotulo, ativo: on, desabilitado, aoClicar, children, pressionado }: {
  rotulo: string; ativo?: boolean; desabilitado?: boolean; aoClicar: () => void; children: React.ReactNode; pressionado?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      aria-pressed={pressionado ?? on}
      disabled={desabilitado}
      onClick={aoClicar}
      style={{ ...base, ...(on ? ativo : null), opacity: desabilitado ? 0.45 : 1, cursor: desabilitado ? 'not-allowed' : 'pointer' }}
    >
      {children}
    </button>
  )
}

export function BarraFerramentasFolha(p: Props) {
  const tinta = p.ferramenta === 'caneta' || p.ferramenta === 'marca-texto'
  return (
    <div
      role="toolbar"
      aria-label="Ferramentas da folha"
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: 8, background: 'var(--card)', borderBottom: '1px solid var(--border)', width: '100%' }}
    >
      <Botao rotulo="Caneta" ativo={p.ferramenta === 'caneta'} aoClicar={() => p.aoFerramenta('caneta')} desabilitado={p.desabilitado}><Pen size={20} /></Botao>
      <Botao rotulo="Marca-texto" ativo={p.ferramenta === 'marca-texto'} aoClicar={() => p.aoFerramenta('marca-texto')} desabilitado={p.desabilitado}><Highlighter size={20} /></Botao>
      <Botao rotulo="Borracha (apaga o traço inteiro)" ativo={p.ferramenta === 'borracha'} aoClicar={() => p.aoFerramenta('borracha')} desabilitado={p.desabilitado}><Eraser size={20} /></Botao>
      <Botao rotulo="Caixa de texto: toque na folha para criar" ativo={p.ferramenta === 'caixa'} aoClicar={() => p.aoFerramenta('caixa')} desabilitado={p.desabilitado}><Type size={20} /></Botao>
      <Botao rotulo="Selecionar e mover caixas" ativo={p.ferramenta === 'selecionar'} aoClicar={() => p.aoFerramenta('selecionar')}><MousePointer2 size={20} /></Botao>
      <Botao rotulo="Mão: rolar a folha" ativo={p.ferramenta === 'mao'} aoClicar={() => p.aoFerramenta('mao')}><Hand size={20} /></Botao>

      <span aria-hidden style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)' }} />

      {tinta && (
        <>
          <div role="group" aria-label="Cor" style={{ display: 'flex', gap: 4 }}>
            {PALETA_FOLHA.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={ROTULO_COR[c]}
                title={ROTULO_COR[c]}
                aria-pressed={p.cor === c}
                onClick={() => p.aoCor(c)}
                style={{ minWidth: 44, minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 0, cursor: 'pointer', padding: 0 }}
              >
                <span
                  style={{
                    width: 26, height: 26, borderRadius: '50%', background: corParaVar(c),
                    border: `2px solid ${p.cor === c ? 'var(--brand-primary)' : 'var(--border)'}`,
                    boxShadow: p.cor === c ? '0 0 0 2px var(--card), 0 0 0 4px var(--brand-primary)' : undefined,
                  }}
                />
              </button>
            ))}
          </div>
          <div role="group" aria-label="Espessura" style={{ display: 'flex', gap: 4 }}>
            {ESPESSURAS.map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`Espessura ${n}`}
                aria-pressed={p.espessura === n}
                onClick={() => p.aoEspessura(n)}
                style={{ ...base, padding: 0, ...(p.espessura === n ? { borderColor: 'var(--brand-primary)', borderWidth: 2 } : null) }}
              >
                <span style={{ width: 22, height: Math.max(2, Math.min(n, 12)), borderRadius: 99, background: 'var(--foreground)' }} />
              </button>
            ))}
          </div>
          <span aria-hidden style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)' }} />
        </>
      )}

      <Botao rotulo="Desfazer" aoClicar={p.aoDesfazer} desabilitado={!p.podeDesfazer || p.desabilitado}><Undo2 size={20} /></Botao>
      <Botao rotulo="Refazer" aoClicar={p.aoRefazer} desabilitado={!p.podeRefazer || p.desabilitado}><Redo2 size={20} /></Botao>
      {p.temSelecao && <Botao rotulo="Excluir caixa selecionada" aoClicar={p.aoExcluirSelecao}><Trash2 size={20} /></Botao>}

      <span aria-hidden style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)' }} />

      <Botao rotulo="Só caneta: o dedo apenas rola e dá zoom (rejeição de palma)" pressionado={p.soCaneta} ativo={p.soCaneta} aoClicar={() => p.aoSoCaneta(!p.soCaneta)}>
        <PenLine size={20} /><span style={{ fontSize: 12 }}>Só caneta</span>
      </Botao>
      <Botao rotulo="Reduzir zoom" aoClicar={() => p.aoZoom(p.zoom - 0.15)}><Minus size={20} /></Botao>
      <span aria-live="polite" style={{ minWidth: 44, textAlign: 'center', fontSize: 12, color: 'var(--muted-foreground)' }}>{Math.round(p.zoom * 100)}%</span>
      <Botao rotulo="Aumentar zoom" aoClicar={() => p.aoZoom(p.zoom + 0.15)}><Plus size={20} /></Botao>
    </div>
  )
}
