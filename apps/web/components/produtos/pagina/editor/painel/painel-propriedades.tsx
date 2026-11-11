'use client'

// PAINEL DE PROPRIEDADES (coluna direita do editor). Sem seleção = propriedades da PÁGINA; com bloco = abas Conteúdo | Estilo | Avançado,
// geradas a partir de ElementoDef.schema. Todas as mutações passam por useEditor() (o canvas já reflete ao vivo).
import { useState } from 'react'
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Laptop, Lightbulb, RotateCcw, Smartphone, Tablet, Trash2 } from 'lucide-react'
import { confirmar } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { getElemento } from '@/lib/produtos/pagina/catalogo'
import { VISIB_TODOS, type BlocoAny, type Dispositivo, type Espaco, type Raio, type TemaPagina } from '@/lib/produtos/pagina/tipos'
import type { TokenCor } from '@/lib/produtos/pagina/tokens'
import { useEditor } from '../store'
import { FormularioDeCampos, Rotulo, Segmentado } from './formulario-campos'
import { iconeDe } from './icones'
import { Miniatura } from './miniaturas'
import { SeletorCor } from './seletor-cor'
import { cx, gravarCampo } from './util'

type Aba = 'conteudo' | 'estilo' | 'avancado'
const ABAS: { id: Aba; rotulo: string }[] = [{ id: 'conteudo', rotulo: 'Conteúdo' }, { id: 'estilo', rotulo: 'Estilo' }, { id: 'avancado', rotulo: 'Avançado' }]

const OPC_ESPACO = [{ v: 'sm', rotulo: 'Pequeno' }, { v: 'md', rotulo: 'Médio' }, { v: 'lg', rotulo: 'Grande' }]
const OPC_RAIO = [{ v: 'none', rotulo: 'Nenhum' }, { v: 'sm', rotulo: 'P' }, { v: 'md', rotulo: 'M' }, { v: 'lg', rotulo: 'G' }, { v: 'full', rotulo: 'Total' }]
const DISPOSITIVOS: { id: Dispositivo; rotulo: string; Icone: typeof Laptop }[] = [
  { id: 'desktop', rotulo: 'Computador', Icone: Laptop }, { id: 'tablet', rotulo: 'Tablet', Icone: Tablet }, { id: 'mobile', rotulo: 'Celular', Icone: Smartphone },
]

function Secao({ titulo, children }: { titulo?: string; children: React.ReactNode }) {
  return <section className="space-y-3 border-b pb-4 last:border-b-0 last:pb-0">{titulo && <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h4>}{children}</section>
}

// ───────── Página (nada selecionado) ─────────
function PropriedadesPagina() {
  const ed = useEditor()
  const tema: TemaPagina = ed.pagina.tema ?? {}
  const cores = { cor: ed.dadosAmostra.cor, cor2: ed.dadosAmostra.cor2 }
  function mudar(patch: Partial<TemaPagina>) {
    const novo: TemaPagina = { ...tema, ...patch }
    for (const k of Object.keys(novo) as (keyof TemaPagina)[]) if (novo[k] === undefined) delete novo[k]
    const api = ed as typeof ed & { atualizarTema?: (t: TemaPagina) => void }
    // Preferência: ação do store (entra no histórico e marca “sujo”); fallback: substitui a página inteira.
    if (api.atualizarTema) api.atualizarTema(novo)
    else ed.definirPagina({ ...ed.pagina, tema: Object.keys(novo).length ? novo : undefined })
  }
  return (
    <div className="space-y-4">
      <Secao titulo="Tema da página">
        <div><Rotulo ajuda="Cor padrão dos elementos que não têm cor própria.">Cor de destaque padrão</Rotulo><SeletorCor value={tema.cor as TokenCor | undefined} onChange={(t) => mudar({ cor: t })} cores={cores} padraoRotulo="Cor do produto" /></div>
        <div><Rotulo ajuda="Fundo atrás de todos os elementos.">Fundo da página</Rotulo><SeletorCor value={tema.fundo as TokenCor | undefined} onChange={(t) => mudar({ fundo: t })} cores={cores} padraoRotulo="Fundo do tema" /></div>
      </Secao>
      <Secao titulo="Espaçamento e forma">
        <div><Rotulo ajuda="Respiro vertical padrão entre os elementos.">Espaçamento geral</Rotulo><Segmentado value={tema.espaco} onChange={(v) => mudar({ espaco: v as Espaco })} opcoes={OPC_ESPACO} /></div>
        <div><Rotulo>Arredondamento padrão</Rotulo><Segmentado value={tema.raio} onChange={(v) => mudar({ raio: v as Raio })} opcoes={OPC_RAIO} /></div>
        {(tema.espaco || tema.raio) && <button type="button" onClick={() => mudar({ espaco: undefined, raio: undefined })} className="text-[11px] font-medium text-muted-foreground hover:text-foreground">Voltar ao padrão do sistema</button>}
      </Secao>
      <Secao titulo="Dicas">
        <ul className="space-y-2 text-xs text-muted-foreground">
          {[
            'Clique em um elemento da página para editar suas propriedades.',
            'Clique no texto do elemento para editar direto na prévia.',
            'Arraste elementos da paleta para a página e use o ícone de alça para reordenar.',
            'Use os botões de computador, tablet e celular para conferir cada tela.',
            'As cores são do tema da plataforma: mudam junto com a marca e o modo escuro.',
          ].map((t) => <li key={t} className="flex gap-2"><Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-accent" />{t}</li>)}
        </ul>
      </Secao>
    </div>
  )
}

// ───────── Bloco selecionado ─────────
function AbaEstilo({ bloco }: { bloco: BlocoAny }) {
  const ed = useEditor()
  const def = getElemento(bloco.tipo)
  const camposEstilo = def.schema.filter((c) => c.grupo === 'estilo')
  const alterarVisib = (d: Dispositivo) => ed.atualizarBloco(bloco.id, (b) => ({ ...b, visib: { ...b.visib, [d]: !b.visib[d] } }))
  return (
    <div className="space-y-4">
      {def.variacoes.length > 1 && (
        <Secao titulo="Variação">
          <div className="grid grid-cols-2 gap-2">
            {def.variacoes.map((v) => {
              const sel = bloco.variacao === v.id
              return (
                <button key={v.id} type="button" aria-pressed={sel} onClick={() => gravarCampo(ed, bloco, 'variacao', v.id)}
                  className={cx('rounded-xl border p-1.5 text-left transition-colors', sel ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50')}>
                  <div className="rounded-lg bg-muted/40 p-1"><Miniatura tipo={bloco.tipo} variacao={v.id} /></div>
                  <div className={cx('mt-1 px-0.5 text-[11px] leading-tight', sel ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{v.rotulo}</div>
                </button>
              )
            })}
          </div>
        </Secao>
      )}
      <Secao titulo="Aparência"><FormularioDeCampos bloco={bloco} campos={camposEstilo} /></Secao>
      <Secao titulo="Visibilidade por dispositivo">
        <div className="grid grid-cols-3 gap-1.5">
          {DISPOSITIVOS.map(({ id, rotulo, Icone }) => {
            const on = bloco.visib[id]
            return (
              <button key={id} type="button" aria-pressed={on} onClick={() => alterarVisib(id)}
                className={cx('flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-[11px] transition-colors', on ? 'border-primary bg-primary/5 font-semibold text-foreground' : 'text-muted-foreground hover:bg-muted/50')}>
                <Icone className="h-4 w-4" />{rotulo}
                {on ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              </button>
            )
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">Esconda este elemento nas telas em que ele não faz sentido.</p>
      </Secao>
    </div>
  )
}

function AbaAvancado({ bloco }: { bloco: BlocoAny }) {
  const ed = useEditor()
  const def = getElemento(bloco.tipo)
  const idx = ed.blocos.findIndex((b) => b.id === bloco.id)
  const temNomeNoSchema = def.schema.some((c) => c.chave === 'nome')

  async function restaurar() {
    if (!(await confirmar({ mensagem: 'Restaurar o conteúdo, a variação e o estilo deste elemento para o padrão? A posição na página é mantida.', confirmar: 'Restaurar' }))) return
    const d = def.defaults()
    ed.atualizarBloco(bloco.id, (b) => ({ ...b, variacao: d.variacao, nome: d.nome, conteudo: d.conteudo as never, estilo: d.estilo ?? {}, visib: d.visib ?? { ...VISIB_TODOS } }))
  }
  async function excluir() {
    if (!(await confirmar({ mensagem: `Excluir o elemento "${bloco.nome || def.rotulo}"?`, destrutivo: true, confirmar: 'Excluir' }))) return
    ed.remover(bloco.id)
  }
  const Acao = ({ onClick, disabled, destrutivo, children }: { onClick: () => void; disabled?: boolean; destrutivo?: boolean; children: React.ReactNode }) => (
    <button type="button" onClick={onClick} disabled={disabled}
      className={cx('flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:opacity-40', destrutivo ? 'text-destructive hover:bg-destructive/10' : 'hover:bg-muted/50')}>{children}</button>
  )
  return (
    <div className="space-y-4">
      <Secao titulo="Identificação">
        {!temNomeNoSchema && (
          <div><Rotulo ajuda="Só aparece no editor, para você reconhecer o elemento.">Nome no editor</Rotulo>
            <Input value={bloco.nome ?? ''} maxLength={120} placeholder={def.rotulo} onChange={(e) => gravarCampo(ed, bloco, 'nome', e.target.value)} /></div>
        )}
        <FormularioDeCampos bloco={bloco} campos={def.schema.filter((c) => c.grupo === 'avancado')} />
      </Secao>
      <Secao titulo="Ações">
        <div className="grid gap-1.5">
          <Acao onClick={() => ed.alternarAtivo(bloco.id)}>{bloco.ativo ? <><EyeOff className="h-4 w-4" />Ocultar da página</> : <><Eye className="h-4 w-4" />Mostrar na página</>}</Acao>
          <Acao onClick={() => ed.duplicar(bloco.id)} disabled={!!def.unico}><Copy className="h-4 w-4" />Duplicar{def.unico ? ' (elemento único)' : ''}</Acao>
          <div className="grid grid-cols-2 gap-1.5">
            <Acao onClick={() => ed.mover(bloco.id, idx - 1)} disabled={idx <= 0}><ArrowUp className="h-4 w-4" />Subir</Acao>
            <Acao onClick={() => ed.mover(bloco.id, idx + 1)} disabled={idx < 0 || idx >= ed.blocos.length - 1}><ArrowDown className="h-4 w-4" />Descer</Acao>
          </div>
          <Acao onClick={restaurar}><RotateCcw className="h-4 w-4" />Restaurar padrão do elemento</Acao>
          {!def.fixo && <Acao onClick={excluir} destrutivo><Trash2 className="h-4 w-4" />Excluir elemento</Acao>}
        </div>
      </Secao>
    </div>
  )
}

function PropriedadesBloco({ bloco }: { bloco: BlocoAny }) {
  const def = getElemento(bloco.tipo)
  const Icone = iconeDe(def.icone)
  const [aba, setAba] = useState<Aba>('conteudo')
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2.5 border-b px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icone className="h-4 w-4" /></span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{def.rotulo}</div>
          <div className="truncate text-[11px] text-muted-foreground">{bloco.nome || def.descricao}</div>
        </div>
      </div>
      <div className="flex border-b px-2" role="tablist">
        {ABAS.map((a) => (
          <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)}
            className={cx('flex-1 border-b-2 px-2 py-2.5 text-xs font-medium transition-colors', aba === a.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>{a.rotulo}</button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4" role="tabpanel">
        {aba === 'conteudo' && <FormularioDeCampos bloco={bloco} campos={def.schema.filter((c) => c.grupo === 'conteudo')} />}
        {aba === 'estilo' && <AbaEstilo bloco={bloco} />}
        {aba === 'avancado' && <AbaAvancado bloco={bloco} />}
      </div>
    </div>
  )
}

export function PainelPropriedades() {
  const ed = useEditor()
  const bloco = ed.selecaoId ? ed.blocos.find((b) => b.id === ed.selecaoId) : undefined
  if (bloco) return <PropriedadesBloco key={bloco.id} bloco={bloco} />
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-4 py-3"><div className="text-sm font-semibold">Página</div><div className="text-[11px] text-muted-foreground">Nenhum elemento selecionado</div></div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4"><PropriedadesPagina /></div>
    </div>
  )
}
