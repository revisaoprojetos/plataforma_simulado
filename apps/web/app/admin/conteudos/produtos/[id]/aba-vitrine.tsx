'use client'

// Aba VITRINE do Produto (Estúdio) = CONSTRUTOR DA PÁGINA DO EXTENSIVO: lista ordenada de BLOCOS arrastáveis
//   [Progresso] [Plano de estudo (cronograma)] [Seção de módulos 1..N] [Banner] [Carrossel]
// Seções de módulos (prateleiras): título, formato, módulos atribuídos (arrastar + setas + mover em massa), ocultar, recolhível.
// Módulo sem seção cai na seção marcada "recebe os módulos sem seção" (ou em "Outros módulos") — nenhum módulo some.
// Persistência: salvarPaginaExtensivoAction (simulado_produto_secoes; sem migração). Banner/carrossel como sempre.
// LAZY + BUSCA NO SERVIDOR: a aba só monta na 1ª abertura; nomes dos itens já escolhidos e candidatos vêm de busca paginada.

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Loader2, Save, Search, Boxes, Image as ImageIcon, LayoutGrid, ChevronUp, ChevronDown, Eye, EyeOff, GripVertical, CalendarDays, Gauge, Layers } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CampoImagem } from '@/components/admin/campo-imagem'
import { SECAO_TAMANHOS, ITENS_PASTA, type SecaoTipo, type SecaoTamanho, type SecaoOrdenacao, type ItemRef, type ItemTipo } from '@/lib/produtos/tipos'
import {
  completarBlocos, configModulosImplicita, normConfigCronograma, normConfigModulos, FORMATOS_SECAO, VARIACOES_CRONOGRAMA,
  TITULO_MODULOS_PADRAO, TITULO_CRONOGRAMA_PADRAO, type ConfigModulos, type ConfigCronograma, type FormatoSecaoModulos,
} from '@/lib/produtos/blocos-pagina'
import { BlocoCronogramaView, RESUMO_EXEMPLO } from '@/components/produtos/bloco-cronograma'
import { carregarVitrineAction, buscarRecursosAction } from './lazy-actions'
import { carregarModulosRaizAction, salvarPaginaExtensivoAction } from './pagina-actions'

export type RecursoVitrine = { id: string; nome: string; area?: string | null }
type KindBusca = 'simulado' | 'pasta' | 'cronograma'
export type SecaoVitrineIn = {
  id?: string; tipo: SecaoTipo; nome: string | null; tamanho: SecaoTamanho; ordenacao: SecaoOrdenacao
  config: Record<string, any> | null; ativo?: boolean
}

type Draft = {
  _key: string; tipo: SecaoTipo; nome: string; tamanho: SecaoTamanho; ordenacao: SecaoOrdenacao; ativo: boolean
  config: { imagem?: string; imagem_mobile?: string; link?: string; itens?: ItemRef[] } & Record<string, any>
}
type ModuloRef = { id: string; titulo: string }

const ORDENACOES: [string, string][] = [['manual', 'Manual'], ['alfabetica', 'Alfabética'], ['recentes', 'Recentes']]
const uid = () => Math.random().toString(36).slice(2, 10)
const isPasta = (t: string) => ITENS_PASTA.includes(t as ItemTipo)
const cm = (d: Draft): ConfigModulos => normConfigModulos(d.config)
const cc = (d: Draft): ConfigCronograma => normConfigCronograma(d.config)

function tem(s: Draft, tipoItem: ItemTipo, id: string) {
  const itens = s.config.itens ?? []
  return isPasta(tipoItem)
    ? itens.some((it) => isPasta(it.tipo_item) && it.item_id === id)
    : itens.some((it) => it.tipo_item === tipoItem && it.item_id === id)
}
/** Ids já escolhidos na seção para um tipo (lista pequena: só o que o usuário marcou). */
function idsDe(s: Draft, tipoItem: ItemTipo): string[] {
  return (s.config.itens ?? []).filter((it) => (isPasta(tipoItem) ? isPasta(it.tipo_item) : it.tipo_item === tipoItem)).map((it) => it.item_id)
}

const novoDraft = (tipo: SecaoTipo): Draft => {
  if (tipo === 'progresso') return { _key: uid(), tipo, nome: '', tamanho: 'vertical_small', ordenacao: 'manual', ativo: true, config: {} }
  if (tipo === 'modulos') return { _key: uid(), tipo, nome: TITULO_MODULOS_PADRAO, tamanho: 'vertical_small', ordenacao: 'manual', ativo: true, config: configModulosImplicita() }
  return { _key: uid(), tipo, nome: '', tamanho: 'vertical_small', ordenacao: 'manual', ativo: true, config: {} }
}

export function AbaVitrine({ produtoId, secoesIniciais, podeEditar }: {
  produtoId: string; secoesIniciais: SecaoVitrineIn[]; podeEditar: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  // Completa com os blocos implícitos (Progresso + Módulos do curso) — mesma regra do aluno (completarBlocos).
  const [secoes, setSecoes] = useState<Draft[]>(() => completarBlocos<Draft>(
    secoesIniciais.map((s) => ({ _key: s.id || uid(), tipo: s.tipo, nome: s.nome ?? '', tamanho: s.tamanho, ordenacao: s.ordenacao, ativo: s.ativo !== false, config: s.config ?? {} })),
    (t) => { const d = novoDraft(t); if (t === 'modulos') d.config = { ...configModulosImplicita() }; return d },
  ))
  const [sujo, setSujo] = useState(false)
  // Nomes dos itens (chave `kind:id`) — carregados 1x p/ os já escolhidos; a busca acrescenta os novos.
  const [nomes, setNomes] = useState<Record<string, RecursoVitrine>>({})
  const [modulos, setModulos] = useState<ModuloRef[] | null>(null) // módulos de topo do produto (null = carregando)
  const [sel, setSel] = useState<Set<string>>(new Set())            // módulos marcados p/ mover em massa
  const [destino, setDestino] = useState('')
  useEffect(() => {
    carregarVitrineAction(produtoId).then((r) => { if ('ok' in r) setNomes((cur) => ({ ...r.nomes, ...cur })) }).catch(() => {})
    carregarModulosRaizAction(produtoId).then((r) => setModulos((('modulos' in r && r.modulos) || []).map((m) => ({ id: m.id, titulo: m.titulo })))).catch(() => setModulos([]))
  }, [produtoId])
  const addNomes = (kind: KindBusca, rs: RecursoVitrine[]) => setNomes((cur) => { const n = { ...cur }; for (const r of rs) n[kind + ':' + r.id] = r; return n })
  const mut = (fn: (s: Draft[]) => Draft[]) => { setSecoes(fn); setSujo(true) }

  const patch = (i: number, p: Partial<Draft>) => mut((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const patchCfg = (i: number, p: Record<string, any>) => mut((s) => s.map((x, j) => (j === i ? { ...x, config: { ...x.config, ...p } } : x)))
  const mover = (i: number, dir: -1 | 1) => mut((s) => {
    const j = i + dir
    if (j < 0 || j >= s.length) return s
    const c = [...s]; const [it] = c.splice(i, 1); c.splice(j, 0, it); return c
  })
  const moverPara = (de: number, para: number) => mut((s) => {
    if (de === para || de < 0 || para < 0 || de >= s.length || para >= s.length) return s
    const c = [...s]; const [it] = c.splice(de, 1); c.splice(para, 0, it); return c
  })
  // Os módulos de uma seção removida voltam para "sem seção" (deixam de estar em modulo_ids).
  const remover = (i: number) => mut((s) => s.filter((_, j) => j !== i))
  const add = (tipo: SecaoTipo) => mut((s) => {
    const d = novoDraft(tipo)
    if (tipo === 'carrossel') { d.nome = 'Nova seção'; d.config = { itens: [] } }
    if (tipo === 'banner') d.tamanho = 'horizontal_large'
    if (tipo === 'modulos') { d.nome = 'Nova seção de módulos'; d.config = { ...configModulosImplicita(), restantes: false, agrupar_prefixo: false } }
    // Plano de estudo entra logo DEPOIS do progresso (topo da página); demais blocos no fim.
    if (tipo === 'cronograma') {
      const p = s.findIndex((x) => x.tipo === 'progresso')
      const c = [...s]; c.splice(p + 1, 0, d); return c
    }
    return [...s, d]
  })

  function toggleItem(i: number, tipoItem: ItemTipo, id: string) {
    mut((s) => s.map((x, j) => {
      if (j !== i) return x
      const itens = x.config.itens ?? []
      const on = tem(x, tipoItem, id)
      const novos = on
        ? itens.filter((it) => !(it.item_id === id && (isPasta(tipoItem) ? isPasta(it.tipo_item) : it.tipo_item === tipoItem)))
        : [...itens, { tipo_item: tipoItem, item_id: id }]
      return { ...x, config: { ...x.config, itens: novos } }
    }))
  }

  // ── módulos × seções ──
  const nomeModulo = useMemo(() => new Map((modulos ?? []).map((m) => [m.id, m.titulo])), [modulos])
  const idsValidos = (d: Draft) => (modulos ? cm(d).modulo_ids.filter((id) => nomeModulo.has(id)) : cm(d).modulo_ids)
  const atribuidos = useMemo(() => {
    const set = new Set<string>()
    for (const s of secoes) if (s.tipo === 'modulos') for (const id of cm(s).modulo_ids) set.add(id)
    return set
  }, [secoes])
  const semSecao = useMemo(() => (modulos ?? []).filter((m) => !atribuidos.has(m.id)), [modulos, atribuidos])
  const secoesMod = secoes.map((s, i) => ({ s, i })).filter((x) => x.s.tipo === 'modulos')
  const iRestantes = secoes.findIndex((s) => s.tipo === 'modulos' && cm(s).restantes)

  /** Move módulos para a seção `paraKey` (posição `antesDe` ou fim). paraKey 'pool' = tira de todas (volta p/ "sem seção"). */
  function moverModulos(ids: string[], paraKey: string, antesDe: string | null = null) {
    mut((s) => {
      return s.map((x) => {
        if (x.tipo !== 'modulos') return x
        const c = cm(x)
        let lista = c.modulo_ids.filter((id) => !ids.includes(id))
        if (x._key === paraKey) {
          const i = antesDe ? lista.indexOf(antesDe) : -1
          lista = i >= 0 ? [...lista.slice(0, i), ...ids, ...lista.slice(i)] : [...lista, ...ids]
        }
        return { ...x, config: { ...x.config, ...c, modulo_ids: lista } }
      })
    })
    setSel(new Set())
  }
  const moverModuloDentro = (key: string, id: string, dir: -1 | 1) => mut((s) => s.map((x) => {
    if (x._key !== key) return x
    const lista = [...cm(x).modulo_ids]; const i = lista.indexOf(id); const j = i + dir
    if (i < 0 || j < 0 || j >= lista.length) return x
    ;[lista[i], lista[j]] = [lista[j], lista[i]]
    return { ...x, config: { ...x.config, modulo_ids: lista } }
  }))
  const marcarRestantes = (i: number, on: boolean) => mut((s) => s.map((x, j) => x.tipo !== 'modulos' ? x : { ...x, config: { ...x.config, restantes: on && j === i } }))

  function salvar() {
    start(async () => {
      const r = await salvarPaginaExtensivoAction(produtoId, secoes.map((s) => ({
        tipo: s.tipo, nome: s.nome.trim() || null, tamanho: s.tamanho, ordenacao: s.ordenacao, ativo: s.ativo,
        config: s.tipo === 'modulos' ? { ...cm(s), modulo_ids: idsValidos(s) } : s.config,
      })))
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success('Página do extensivo salva.'); setSujo(false); router.refresh()
    })
  }

  const totalItens = useMemo(() => {
    const set = new Set<string>()
    for (const s of secoes) if (s.tipo === 'carrossel') for (const it of s.config.itens ?? []) set.add(`${it.tipo_item}:${it.item_id}`)
    return set.size
  }, [secoes])

  const [arrastando, setArrastando] = useState<number | null>(null)
  const [arrastoMod, setArrastoMod] = useState<string | null>(null) // módulo sendo arrastado entre seções
  const opcoesDestino: [string, string][] = [
    ...secoesMod.map(({ s }) => [s._key, s.nome.trim() || 'Seção sem nome'] as [string, string]),
    ['pool', 'Sem seção (módulos soltos)'],
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Página do extensivo</h2>
          <p className="text-xs text-muted-foreground">{secoes.length} bloco(s) · {secoesMod.length} seção(ões) de módulos · {totalItens} conteúdo(s) nos carrosséis</p>
        </div>
        {podeEditar && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => add('modulos')}><Plus className="h-4 w-4" />Seção de módulos</Button>
            <Button variant="outline" onClick={() => add('cronograma')} ><Plus className="h-4 w-4" />Plano de estudo</Button>
            <Button variant="outline" onClick={() => add('banner')}><Plus className="h-4 w-4" />Banner</Button>
            <Button variant="outline" onClick={() => add('carrossel')}><Plus className="h-4 w-4" />Carrossel</Button>
            <Button onClick={salvar} disabled={pending || !sujo}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar página</Button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
        Arraste os blocos (ou use as setas) para definir a <strong className="text-foreground">ordem da página do aluno</strong>. Em cada <strong className="text-foreground">seção de módulos</strong> escolha o formato e atribua os módulos; o que não for atribuído cai na seção marcada como <strong className="text-foreground">&ldquo;recebe os módulos sem seção&rdquo;</strong> — nenhum módulo some. O <strong className="text-foreground">conteúdo liberado</strong> continua derivado dos carrosséis somados aos <strong className="text-foreground">grupos</strong>.
      </div>

      {podeEditar && secoesMod.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-sm">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm"><strong>{sel.size}</strong> módulo(s) selecionado(s)</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="w-56"><Select value={destino} onChange={setDestino} opts={[['', 'Mover para seção…'], ...opcoesDestino]} /></div>
            <Button variant="outline" disabled={!sel.size || !destino} onClick={() => { moverModulos([...sel], destino); setDestino('') }}>Mover</Button>
            {sel.size > 0 && <Button variant="ghost" onClick={() => setSel(new Set())}>Limpar</Button>}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {secoes.map((s, i) => (
          <div key={s._key}
            draggable={podeEditar && arrastando === i}
            onDragOver={(e) => { if (arrastando !== null) e.preventDefault() }}
            onDrop={() => { if (arrastando !== null) { moverPara(arrastando, i); setArrastando(null) } }}
            onDragEnd={() => setArrastando(null)}
            className={`rounded-2xl border bg-card p-4 shadow-sm transition-opacity ${!s.ativo ? 'opacity-60' : ''}`}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {podeEditar && (
                  <span onMouseDown={() => setArrastando(i)} onMouseUp={() => setArrastando(null)} title="Arrastar para reordenar" aria-label="Arrastar para reordenar"
                    className="flex h-8 w-6 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing"><GripVertical className="h-4 w-4" /></span>
                )}
                <TipoBadge tipo={s.tipo} />
                <span className="text-xs text-muted-foreground">#{i + 1}</span>
                {!s.ativo && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">oculto para o aluno</span>}
              </div>
              {podeEditar && (
                <div className="flex items-center gap-1">
                  <IconBtn label={s.ativo ? 'Ocultar para o aluno' : 'Exibir para o aluno'} onClick={() => patch(i, { ativo: !s.ativo })}>{s.ativo ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</IconBtn>
                  <IconBtn label="Mover para cima" disabled={i === 0} onClick={() => mover(i, -1)}><ChevronUp className="h-4 w-4" /></IconBtn>
                  <IconBtn label="Mover para baixo" disabled={i === secoes.length - 1} onClick={() => mover(i, 1)}><ChevronDown className="h-4 w-4" /></IconBtn>
                  {s.tipo !== 'progresso' && <IconBtn label="Remover bloco" destrutivo onClick={() => remover(i)}><Trash2 className="h-4 w-4" /></IconBtn>}
                </div>
              )}
            </div>

            {s.tipo === 'progresso' ? (
              <p className="text-xs text-muted-foreground">Card &ldquo;Seu progresso&rdquo; com o botão &ldquo;Continuar de onde parou&rdquo;. Calculado automaticamente a partir das aulas do aluno — arraste para mudar a posição (ou oculte).</p>
            ) : s.tipo === 'cronograma' ? (
              <BlocoCronograma d={s} i={i} secoes={secoes} podeEditar={podeEditar} patchCfg={patchCfg} mut={mut} />
            ) : s.tipo === 'modulos' ? (
              <BlocoModulos d={s} i={i} podeEditar={podeEditar} modulos={modulos} nomeModulo={nomeModulo} idsValidos={idsValidos(s)}
                semSecao={i === iRestantes ? semSecao : []} arrasto={arrastoMod} setArrasto={setArrastoMod} sel={sel} setSel={setSel} opcoesDestino={opcoesDestino.filter(([k]) => k !== s._key)}
                patch={patch} patchCfg={patchCfg} marcarRestantes={marcarRestantes} moverModulos={moverModulos} moverDentro={moverModuloDentro} />
            ) : s.tipo === 'banner' ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <ImgField label="Imagem (URL)" value={s.config.imagem ?? ''} onChange={(v) => patchCfg(i, { imagem: v })} disabled={!podeEditar} />
                <ImgField label="Imagem mobile (URL)" value={s.config.imagem_mobile ?? ''} onChange={(v) => patchCfg(i, { imagem_mobile: v })} disabled={!podeEditar} />
                <Campo label="Link ao clicar (URL)"><Input value={s.config.link ?? ''} onChange={(e) => patchCfg(i, { link: e.target.value })} placeholder="https://…" disabled={!podeEditar} /></Campo>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Campo label="Nome da seção"><Input value={s.nome} onChange={(e) => patch(i, { nome: e.target.value })} placeholder="Ex.: Simulados da semana" disabled={!podeEditar} /></Campo>
                  <Campo label="Tamanho"><Select value={s.tamanho} onChange={(v) => patch(i, { tamanho: v as SecaoTamanho })} disabled={!podeEditar} opts={SECAO_TAMANHOS.map((t) => [t.v, t.label])} /></Campo>
                  <Campo label="Ordenação"><Select value={s.ordenacao} onChange={(v) => patch(i, { ordenacao: v as SecaoOrdenacao })} disabled={!podeEditar} opts={ORDENACOES} /></Campo>
                </div>
                <div className="grid gap-3 lg:grid-cols-3">
                  <Seletor titulo="Simulados" tipoItem="simulado" kind="simulado" selIds={idsDe(s, 'simulado')} nomes={nomes} addNomes={addNomes} toggle={(t, id) => toggleItem(i, t, id)} podeEditar={podeEditar} />
                  <Seletor titulo="Pastas · Biblioteca · Desafios" tipoItem="banco" kind="pasta" selIds={idsDe(s, 'banco')} nomes={nomes} addNomes={addNomes} toggle={(t, id) => toggleItem(i, t, id)} podeEditar={podeEditar} comArea />
                  <Seletor titulo="Cronogramas" tipoItem="cronograma" kind="cronograma" selIds={idsDe(s, 'cronograma')} nomes={nomes} addNomes={addNomes} toggle={(t, id) => toggleItem(i, t, id)} podeEditar={podeEditar} />
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Sem nenhuma seção marcada como "recebe sem seção": os soltos aparecem para o aluno em "Outros módulos". */}
        {iRestantes < 0 && semSecao.length > 0 && (
          <div className="rounded-2xl border border-dashed bg-card p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Layers className="h-4 w-4 text-muted-foreground" />Outros módulos <span className="text-xs font-normal text-muted-foreground">· {semSecao.length} sem seção (aparecem no fim da página)</span></div>
            <ListaSoltos soltos={semSecao} sel={sel} setSel={setSel} podeEditar={podeEditar} arrastar={setArrastoMod} />
          </div>
        )}
      </div>
    </div>
  )
}

const TIPO_INFO: Record<string, { label: string; cls: string; Icon: typeof Eye }> = {
  banner: { label: 'Banner', cls: 'bg-sky-500/10 text-sky-600 dark:text-sky-400', Icon: ImageIcon },
  carrossel: { label: 'Carrossel', cls: 'bg-primary/10 text-primary', Icon: LayoutGrid },
  progresso: { label: 'Progresso', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', Icon: Gauge },
  cronograma: { label: 'Plano de estudo', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', Icon: CalendarDays },
  modulos: { label: 'Seção de módulos', cls: 'bg-violet-500/10 text-violet-600 dark:text-violet-400', Icon: Layers },
}
function TipoBadge({ tipo }: { tipo: string }) {
  const t = TIPO_INFO[tipo] ?? TIPO_INFO.carrossel
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${t.cls}`}><t.Icon className="h-3 w-3" />{t.label}</span>
}

function Check({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} className="h-4 w-4 accent-[var(--primary)]" />{label}
    </label>
  )
}

/** Elemento "Plano de estudo": design (variação, título, subtítulo, botão), conteúdo (toggles + nº de metas), posição, modelo do catálogo e prévia ao vivo. */
function BlocoCronograma({ d, i, secoes, podeEditar, patchCfg, mut }: {
  d: Draft; i: number; secoes: Draft[]; podeEditar: boolean
  patchCfg: (i: number, p: Record<string, any>) => void; mut: (fn: (s: Draft[]) => Draft[]) => void
}) {
  const c = cc(d)
  const [catalogo, setCatalogo] = useState<RecursoVitrine[] | null>(null)
  useEffect(() => {
    buscarRecursosAction('cronograma', '', 1).then((r) => setCatalogo('ok' in r ? (r.rows as RecursoVitrine[]) : [])).catch(() => setCatalogo([]))
  }, [])
  const iProg = secoes.findIndex((s) => s.tipo === 'progresso')
  const posicao = iProg < 0 ? 'depois' : i < iProg ? 'antes' : 'depois'
  const mudarPosicao = (v: string) => mut((s) => {
    const me = s.findIndex((x) => x._key === d._key)
    if (s.findIndex((x) => x.tipo === 'progresso') < 0 || me < 0) return s
    const c2 = [...s]; const [it] = c2.splice(me, 1)
    const p2 = c2.findIndex((x) => x.tipo === 'progresso')
    c2.splice(v === 'antes' ? p2 : p2 + 1, 0, it); return c2
  })
  const T = (k: keyof ConfigCronograma, label: string) => <Check label={label} checked={!!c[k]} onChange={(v) => patchCfg(i, { [k]: v })} disabled={!podeEditar} />
  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Variação visual"><Select value={c.variacao} onChange={(v) => patchCfg(i, { variacao: v })} disabled={!podeEditar} opts={VARIACOES_CRONOGRAMA.map((o): [string, string] => [o.v, o.label])} /></Campo>
            <Campo label="Posição"><Select value={posicao} onChange={mudarPosicao} disabled={!podeEditar || iProg < 0} opts={[['antes', 'Antes do card de progresso'], ['depois', 'Depois do card de progresso']]} /></Campo>
            <Campo label="Título"><Input value={c.titulo} onChange={(e) => patchCfg(i, { titulo: e.target.value })} placeholder={TITULO_CRONOGRAMA_PADRAO} maxLength={120} disabled={!podeEditar} /></Campo>
            <Campo label="Subtítulo"><Input value={c.subtitulo} onChange={(e) => patchCfg(i, { subtitulo: e.target.value })} placeholder="Opcional" maxLength={200} disabled={!podeEditar} /></Campo>
            <Campo label="Texto do botão"><Input value={c.texto_botao} onChange={(e) => patchCfg(i, { texto_botao: e.target.value })} placeholder="Abrir cronograma" maxLength={40} disabled={!podeEditar} /></Campo>
            <Campo label="Nº de metas exibidas">
              <Select value={String(c.qtd_metas)} onChange={(v) => patchCfg(i, { qtd_metas: Number(v) })} disabled={!podeEditar || !c.mostrar_metas} opts={[1, 2, 3, 4, 5].map((n): [string, string] => [String(n), String(n)])} />
            </Campo>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {T('mostrar_metas', 'Próximas metas')}{T('mostrar_progresso', 'Progresso da semana')}{T('mostrar_hoje', 'Metas de hoje')}{T('mostrar_atrasadas', 'Metas atrasadas')}{T('mostrar_botao', 'Botão Abrir/Gerar cronograma')}
          </div>
          <Campo label="Modelo do catálogo (fluxo padrão)">
            <Select value={c.cronograma_id ?? ''} onChange={(v) => patchCfg(i, { cronograma_id: v || null })} disabled={!podeEditar}
              opts={[['', 'Qualquer / último gerado pelo aluno'], ...(catalogo ?? []).map((r): [string, string] => [r.id, r.nome]), ...(c.cronograma_id && !(catalogo ?? []).some((r) => r.id === c.cronograma_id) ? [[c.cronograma_id, 'Cronograma selecionado'] as [string, string]] : [])]} />
          </Campo>
          <p className="text-xs text-muted-foreground">No tenant Adaptativo o aluno vê o <strong className="text-foreground">plano fixado</strong> dele (metas, hoje e atrasadas); o modelo do catálogo vale só para o fluxo padrão. Pode haver mais de um bloco de plano de estudo na página.</p>
        </div>
        <div>
          <span className="mb-1 block text-sm font-medium">Pré-visualização <span className="font-normal text-muted-foreground">(dados de exemplo)</span></span>
          <div className="rounded-xl border bg-muted/30 p-3"><BlocoCronogramaView cfg={c} resumo={RESUMO_EXEMPLO} cor="var(--brand-primary, var(--primary))" preview /></div>
        </div>
      </div>
    </div>
  )
}

/** Seção (prateleira) de módulos: título, formato, opções e a lista ORDENADA de módulos atribuídos (arrastar + setas). */
function BlocoModulos({ d, i, podeEditar, modulos, nomeModulo, idsValidos, semSecao, arrasto, setArrasto, sel, setSel, opcoesDestino, patch, patchCfg, marcarRestantes, moverModulos, moverDentro }: {
  d: Draft; i: number; podeEditar: boolean; modulos: ModuloRef[] | null; nomeModulo: Map<string, string>; idsValidos: string[]
  semSecao: ModuloRef[]; arrasto: string | null; setArrasto: (id: string | null) => void; sel: Set<string>; setSel: (s: Set<string>) => void; opcoesDestino: [string, string][]
  patch: (i: number, p: Partial<Draft>) => void; patchCfg: (i: number, p: Record<string, any>) => void
  marcarRestantes: (i: number, on: boolean) => void
  moverModulos: (ids: string[], paraKey: string, antesDe?: string | null) => void
  moverDentro: (key: string, id: string, dir: -1 | 1) => void
}) {
  const c = cm(d)
  const alternar = (id: string) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); setSel(n) }
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Título da seção"><Input value={d.nome} onChange={(e) => patch(i, { nome: e.target.value })} placeholder="Ex.: Legislação (LegProc)" maxLength={120} disabled={!podeEditar} /></Campo>
        <Campo label="Formato"><Select value={c.formato} onChange={(v) => patchCfg(i, { formato: v as FormatoSecaoModulos })} disabled={!podeEditar} opts={FORMATOS_SECAO.map((f): [string, string] => [f.v, f.label])} /></Campo>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        <Check label="Recebe os módulos sem seção" checked={c.restantes} onChange={(v) => marcarRestantes(i, v)} disabled={!podeEditar} />
        <Check label="Seção recolhível" checked={c.recolhivel} onChange={(v) => patchCfg(i, { recolhivel: v, recolhida: v ? c.recolhida : false })} disabled={!podeEditar} />
        {c.recolhivel && <Check label="Começa recolhida" checked={c.recolhida} onChange={(v) => patchCfg(i, { recolhida: v })} disabled={!podeEditar} />}
        {(c.formato === 'herdar' || c.formato === 'grade' || c.formato === 'carrossel') && (
          <Check label="Agrupar por prefixo do título (ex.: “LegProc - …”)" checked={c.agrupar_prefixo} onChange={(v) => patchCfg(i, { agrupar_prefixo: v })} disabled={!podeEditar} />
        )}
      </div>

      <div className="rounded-xl border bg-background"
        onDragOver={(e) => { if (arrasto) e.preventDefault() }}
        onDrop={() => { if (arrasto) { moverModulos([arrasto], d._key); setArrasto(null) } }}>
        <div className="flex items-center justify-between border-b p-2.5 text-sm font-semibold">
          <span>Módulos desta seção</span>
          <span className="text-xs font-normal text-muted-foreground">{idsValidos.length} atribuído(s){semSecao.length ? ` · +${semSecao.length} sem seção` : ''}</span>
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {modulos === null ? <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Carregando módulos…</div>
            : idsValidos.length === 0 && semSecao.length === 0 ? <div className="py-4 text-center text-xs text-muted-foreground">Nenhum módulo. Selecione módulos em outra seção e use &ldquo;Mover para seção…&rdquo;, ou arraste até aqui.</div>
            : null}
          {idsValidos.map((id, k) => (
            <div key={id} draggable={podeEditar} onDragStart={() => setArrasto(id)} onDragEnd={() => setArrasto(null)}
              onDragOver={(e) => { if (arrasto) e.preventDefault() }}
              onDrop={(e) => { e.stopPropagation(); if (arrasto && arrasto !== id) { moverModulos([arrasto], d._key, id); setArrasto(null) } }}
              className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-muted/50">
              <input type="checkbox" checked={sel.has(id)} onChange={() => alternar(id)} disabled={!podeEditar} className="h-4 w-4 accent-[var(--primary)]" aria-label="Selecionar módulo" />
              <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{nomeModulo.get(id) ?? 'Módulo'}</span>
              {podeEditar && (
                <>
                  <IconBtn label="Subir" disabled={k === 0} onClick={() => moverDentro(d._key, id, -1)}><ChevronUp className="h-4 w-4" /></IconBtn>
                  <IconBtn label="Descer" disabled={k === idsValidos.length - 1} onClick={() => moverDentro(d._key, id, 1)}><ChevronDown className="h-4 w-4" /></IconBtn>
                  {opcoesDestino.length > 0 && (
                    <select aria-label="Mover para" value="" onChange={(e) => { if (e.target.value) moverModulos([id], e.target.value) }}
                      className="h-7 w-28 rounded-lg border bg-background px-1.5 text-xs outline-none">
                      <option value="">Mover…</option>
                      {opcoesDestino.map(([k2, l]) => <option key={k2} value={k2}>{l}</option>)}
                    </select>
                  )}
                </>
              )}
            </div>
          ))}
          {semSecao.length > 0 && (
            <>
              <div className="mt-1 border-t px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Sem seção · entram aqui na ordem do currículo</div>
              <ListaSoltos soltos={semSecao} sel={sel} setSel={setSel} podeEditar={podeEditar} arrastar={setArrasto} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ListaSoltos({ soltos, sel, setSel, podeEditar, arrastar }: { soltos: ModuloRef[]; sel: Set<string>; setSel: (s: Set<string>) => void; podeEditar: boolean; arrastar?: (id: string | null) => void }) {
  return (
    <div className="max-h-60 space-y-0.5 overflow-y-auto">
      {soltos.map((m) => (
        <label key={m.id} draggable={podeEditar && !!arrastar} onDragStart={() => arrastar?.(m.id)} onDragEnd={() => arrastar?.(null)}
          className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-muted/50">
          <input type="checkbox" checked={sel.has(m.id)} disabled={!podeEditar} className="h-4 w-4 accent-[var(--primary)]"
            onChange={() => { const n = new Set(sel); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); setSel(n) }} />
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{m.titulo}</span>
        </label>
      ))}
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-sm font-medium">{label}</span>{children}</label>
}

function Select({ value, onChange, opts, disabled }: { value: string; onChange: (v: string) => void; opts: [string, string][]; disabled?: boolean }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="h-8 w-full rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}

// Imagem da seção: envio do computador (ou URL) via <CampoImagem>. Antes era só um campo de URL.
function ImgField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <CampoImagem variant="linha" value={value} onChange={onChange} disabled={disabled} />
    </div>
  )
}

function IconBtn({ children, onClick, disabled, destrutivo, label }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; destrutivo?: boolean; label: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors disabled:opacity-40 ${destrutivo ? 'hover:bg-destructive/10 hover:text-destructive' : 'hover:bg-muted hover:text-foreground'}`}>
      {children}
    </button>
  )
}

function Seletor({ titulo, tipoItem, kind, selIds, nomes, addNomes, toggle, podeEditar, comArea }: {
  titulo: string; tipoItem: ItemTipo; kind: KindBusca; selIds: string[]
  nomes: Record<string, RecursoVitrine>; addNomes: (k: KindBusca, rs: RecursoVitrine[]) => void
  toggle: (t: ItemTipo, id: string) => void; podeEditar: boolean; comArea?: boolean
}) {
  const [q, setQ] = useState('')
  const [aberto, setAberto] = useState(false) // só busca depois que o usuário foca/digita
  const [rows, setRows] = useState<RecursoVitrine[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [buscando, setBuscando] = useState(false)
  const seq = useRef(0)
  const selSet = useMemo(() => new Set(selIds), [selIds])

  function buscar(pg: number, anexar: boolean) {
    const mine = ++seq.current
    setBuscando(true)
    buscarRecursosAction(kind, q, pg)
      .then((r) => {
        if (mine !== seq.current) return
        const novos = ('ok' in r ? r.rows : []) as RecursoVitrine[]
        addNomes(kind, novos)
        setRows((cur) => (anexar ? [...cur, ...novos] : novos)); setTotal('ok' in r ? r.total : 0); setPagina(pg)
      })
      .catch(() => { if (mine === seq.current) { setRows([]); setTotal(0) } })
      .finally(() => { if (mine === seq.current) setBuscando(false) })
  }
  useEffect(() => {
    if (!aberto) return
    const t = setTimeout(() => buscar(1, false), q ? 250 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, aberto])

  const linha = (id: string, nome: string, area?: string | null) => (
    <label key={id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/50">
      <input type="checkbox" checked={selSet.has(id)} onChange={() => toggle(tipoItem, id)} disabled={!podeEditar} className="h-4 w-4 accent-[var(--primary)]" />
      <span className="min-w-0 flex-1 truncate">{nome}</span>
      {comArea && area && <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{area}</span>}
    </label>
  )

  return (
    <div className="rounded-xl border bg-background">
      <div className="flex items-center justify-between gap-2 border-b p-2.5">
        <span className="flex items-center gap-1.5 text-sm font-semibold"><Boxes className="h-4 w-4 text-muted-foreground" />{titulo}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{selIds.length} selec.</span>
      </div>
      <div className="p-2.5">
        {selIds.length > 0 && (
          <div className="mb-2 max-h-28 space-y-0.5 overflow-y-auto border-b pb-2">
            {selIds.map((id) => { const r = nomes[kind + ':' + id]; return linha(id, r?.nome ?? 'Carregando…', r?.area) })}
          </div>
        )}
        {podeEditar && (
          <>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => { setQ(e.target.value); setAberto(true) }} onFocus={() => setAberto(true)} placeholder="Buscar para adicionar…" className="pl-8" />
            </div>
            {aberto && (
              <div className="max-h-56 space-y-0.5 overflow-y-auto">
                {buscando && rows.length === 0 ? <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Buscando…</div>
                  : rows.length === 0 ? <div className="py-4 text-center text-xs text-muted-foreground">Nada aqui.</div>
                  : rows.map((r) => linha(r.id, r.nome, r.area))}
                {rows.length < total && (
                  <button type="button" onClick={() => buscar(pagina + 1, true)} disabled={buscando} className="w-full rounded-lg py-1.5 text-xs font-medium text-primary hover:bg-muted/50 disabled:opacity-50">
                    {buscando ? 'Carregando…' : `Carregar mais (${rows.length} de ${total})`}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
