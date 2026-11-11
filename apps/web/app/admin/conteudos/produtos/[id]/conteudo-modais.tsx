'use client'

// Modais do currículo (tela ProdutoConteudos): Editar módulo, Novo conteúdo, Editar aula (referência),
// Configurar disponibilidade, Mover aula, Duplicar aula, Alterar tipo da aula.
// Currículo LEVE POR REFERÊNCIA: a aula aponta a um recurso existente (FilePicker / seletor de simulado).

import { useEffect, useRef, useState, useTransition } from 'react'
import {
  Loader2, Save, Trash2, FolderOpen, FileText, Video, Link2, ClipboardList, Check, Info, ArrowRight, CalendarDays, Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CampoImagem } from '@/components/admin/campo-imagem'
import { confirmar } from '@/components/ui/confirm-dialog'
import { FilePicker } from '@/components/admin/file-picker'
import { cn } from '@/lib/utils'
import { buscarRecursosAction, nomesRecursosAction } from './lazy-actions'
import { aplicarCapaEmLoteAction } from '../actions'
import {
  SUBTIPOS, SUBTIPO_LABEL, TIPO_REF_LABEL, DISPONIBILIDADE_OPCOES, DISPONIBILIDADE_ANTES, DIAS_SEMANA,
  subtipoDef, resumoDisponibilidade,
  type ModuloRow, type ItemRow, type TipoRef, type Disponibilidade, type DisponibilidadeTipo,
} from '@/lib/produtos/curriculo'
import {
  salvarModuloAction, excluirModuloAction, criarItemAction, salvarItemAction,
  moverItemAction, duplicarItemAction, alterarTipoItemAction,
} from '../actions'

const uid = () => Math.random().toString(36).slice(2, 10)

// ═══════════════════════ Editar / novo módulo ═══════════════════════
export function ModuloDialog({ produtoId, modulo, paiId, modulosCount, aulasCount, onClose, onPronto, onSegmentos }: {
  produtoId: string; modulo: ModuloRow | null; paiId: string | null
  modulosCount?: number; aulasCount?: number; onClose: () => void; onPronto: () => void
  /** Abre o painel de Segmento (capa / liberação por segmento) deste módulo — só ao editar. */
  onSegmentos?: (aba: 'capa' | 'liberacao') => void
}) {
  const criando = !modulo
  const [titulo, setTitulo] = useState(modulo?.titulo ?? '')
  const [imagem, setImagem] = useState(modulo?.imagem_url ?? '')
  // Padrão: criando um módulo com imagem → título oculto (a arte já traz o texto); editando → o que está salvo.
  const [ocultarTitulo, setOcultarTitulo] = useState(modulo ? !!modulo.ocultar_titulo : true)
  const [descricao, setDescricao] = useState(modulo?.descricao ?? '')
  const [exibicao, setExibicao] = useState<'aberto' | 'recolhido'>(modulo?.exibicao ?? 'aberto')
  const [disp, setDisp] = useState<Disponibilidade>(modulo?.disponibilidade ?? { tipo: 'na_matricula', antes: 'bloqueado_cadeado' })
  const [editarDisp, setEditarDisp] = useState(false)
  const [paraSubs, setParaSubs] = useState(false) // aplicar esta capa também aos submódulos ao salvar
  const [pending, start] = useTransition()

  function salvar() {
    if (!titulo.trim()) { toast.error('Informe o título do módulo.'); return }
    start(async () => {
      const r = await salvarModuloAction(produtoId, { id: modulo?.id, pai_id: modulo?.pai_id ?? paiId, titulo, imagem_url: imagem || null, ocultar_titulo: ocultarTitulo, descricao: descricao || null, exibicao, disponibilidade: disp })
      if ('error' in r && r.error) { toast.error(r.error); return }
      if (!criando && paraSubs && imagem && modulo) {
        const c = await aplicarCapaEmLoteAction(produtoId, [modulo.id], { imagem_url: imagem, ocultar_titulo: ocultarTitulo, incluirSubmodulos: true })
        if ('error' in c && c.error) { toast.error(c.error); return }
        toast.success(`Capa aplicada em ${(c as { total: number }).total} módulo(s)/submódulo(s).`)
      }
      toast.success(criando ? 'Módulo criado.' : 'Módulo salvo.'); onPronto(); onClose()
    })
  }
  async function excluir() {
    if (!modulo) return
    if (!(await confirmar({ titulo: 'Excluir módulo', mensagem: `Excluir "${modulo.titulo}"? Os submódulos e aulas dentro dele vão para a Lixeira.`, confirmar: 'Excluir', destrutivo: true }))) return
    start(async () => {
      const r = await excluirModuloAction(modulo.id, produtoId)
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success('Módulo excluído.'); onPronto(); onClose()
    })
  }

  return (
    <>
      <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
        <DialogContent showCloseButton className="sm:max-w-2xl">
          <DialogTitle>{criando ? (paiId ? 'Novo submódulo' : 'Novo módulo') : 'Editar módulo'}</DialogTitle>
          <label className="block"><span className="mb-1 block text-sm font-medium">Título do módulo</span>
            <Input autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="block"><span className="mb-1 block text-sm font-medium">Imagem do módulo <span className="font-normal text-muted-foreground">· 16:9</span></span>
              <CampoImagem variant="linha" value={imagem} onChange={setImagem} />
              {imagem ? (
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={ocultarTitulo} onChange={(e) => setOcultarTitulo(e.target.checked)} className="h-4 w-4 accent-[var(--brand-primary,currentColor)]" />
                  <span>Ocultar o título da disciplina sobre a imagem</span>
                </label>
              ) : null}
              {!criando && imagem && (modulosCount ?? 0) > 0 && (
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={paraSubs} onChange={(e) => setParaSubs(e.target.checked)} className="h-4 w-4 accent-[var(--brand-primary,currentColor)]" /><span>Aplicar esta capa também aos {modulosCount} submódulo(s)</span></label>
              )}
              {!criando && onSegmentos && <button type="button" onClick={() => { onClose(); onSegmentos('capa') }} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"><Users className="h-3.5 w-3.5" />Imagem por segmento</button>}</div>
            <label className="block"><span className="mb-1 block text-sm font-medium">Descrição</span>
              <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} placeholder="Descrição curta do módulo (opcional)" className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><span className="mb-1 block text-sm font-medium">Exibição</span>
              <div className="flex gap-2">
                {(['aberto', 'recolhido'] as const).map((v) => (
                  <button key={v} type="button" onClick={() => setExibicao(v)} className={cn('flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize', exibicao === v ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>{v}</button>
                ))}
              </div>
            </div>
            <div><span className="mb-1 block text-sm font-medium">Disponibilidade</span>
              <button type="button" onClick={() => setEditarDisp(true)} className="flex h-9 w-full items-center justify-between rounded-lg border bg-background px-2.5 text-sm hover:bg-muted">
                <span className="capitalize">{resumoDisponibilidade(disp)}</span><ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
              {!criando && onSegmentos && <button type="button" onClick={() => { onClose(); onSegmentos('liberacao') }} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"><Users className="h-3.5 w-3.5" />Liberação por segmento</button>}
            </div>
          </div>
          {!criando && (modulosCount !== undefined || aulasCount !== undefined) && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg border bg-background px-3 py-2"><span className="text-muted-foreground">Submódulos</span><span className="float-right font-semibold">{modulosCount ?? 0}</span></div>
              <div className="rounded-lg border bg-background px-3 py-2"><span className="text-muted-foreground">Aulas</span><span className="float-right font-semibold">{aulasCount ?? 0}</span></div>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            {!criando ? <Button variant="ghost" className="text-destructive" onClick={excluir} disabled={pending}><Trash2 className="h-4 w-4" />Excluir módulo</Button> : <span />}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose} disabled={pending}>Cancelar</Button>
              <Button onClick={salvar} disabled={pending || !titulo.trim()}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar módulo</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {editarDisp && <DisponibilidadeDialog valor={disp} escopo="módulo" onClose={() => setEditarDisp(false)} onAplicar={(d) => { setDisp(d); setEditarDisp(false) }} />}
    </>
  )
}

// ═══════════════════════ Novo conteúdo (escolhe módulo + tipo) ═══════════════════════
export function NovoConteudoDialog({ modulos, moduloPadrao, tipoProduto, onClose, onContinuar }: {
  modulos: ModuloRow[]; moduloPadrao?: string | null; tipoProduto?: string
  onClose: () => void; onContinuar: (sel: { moduloId: string; subtipo: string; tipoRef: TipoRef; daBiblioteca: boolean }) => void
}) {
  const topo = modulos.filter((m) => !m.pai_id)
  const [moduloTopo, setModuloTopo] = useState<string>(() => {
    const d = moduloPadrao ? modulos.find((m) => m.id === moduloPadrao) : null
    return d ? (d.pai_id ?? d.id) : (topo[0]?.id ?? '')
  })
  const subs = modulos.filter((m) => m.pai_id === moduloTopo)
  const [submodulo, setSubmodulo] = useState<string>(() => (moduloPadrao && modulos.find((m) => m.id === moduloPadrao)?.pai_id ? moduloPadrao : ''))
  const [daBiblioteca, setDaBiblioteca] = useState(true)
  const [subtipo, setSubtipo] = useState<string>(tipoProduto === 'jurisclub' ? 'jurisclub' : 'pdfull')

  const moduloDestino = submodulo || moduloTopo
  function continuar() {
    if (!moduloDestino) { toast.error('Escolha o módulo.'); return }
    const def = subtipoDef(subtipo); if (!def) return
    onContinuar({ moduloId: moduloDestino, subtipo, tipoRef: def.tipoRef, daBiblioteca })
  }

  const grupos: ['revisao' | 'plataforma', string][] = [['revisao', 'Materiais do Revisão'], ['plataforma', 'Tipos da plataforma']]
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className="w-[min(900px,calc(100vw-2rem))] max-w-[min(900px,calc(100vw-2rem))] sm:max-w-[min(900px,calc(100vw-2rem))]">
        <DialogTitle>Novo conteúdo</DialogTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-sm font-medium">Módulo</span>
            <select value={moduloTopo} onChange={(e) => { setModuloTopo(e.target.value); setSubmodulo('') }} className="h-9 w-full rounded-lg border bg-background px-2.5 text-sm">
              {topo.length === 0 ? <option value="">— crie um módulo primeiro —</option> : topo.map((m) => <option key={m.id} value={m.id}>{m.titulo}</option>)}
            </select>
          </label>
          <label className="block"><span className="mb-1 block text-sm font-medium">Submódulo</span>
            <select value={submodulo} onChange={(e) => setSubmodulo(e.target.value)} className="h-9 w-full rounded-lg border bg-background px-2.5 text-sm" disabled={subs.length === 0}>
              <option value="">{subs.length ? 'Direto no módulo' : 'Sem submódulos'}</option>
              {subs.map((m) => <option key={m.id} value={m.id}>{m.titulo}</option>)}
            </select>
          </label>
        </div>

        <div className="flex gap-2">
          {([[true, 'Usar da biblioteca'], [false, 'Criar do zero']] as const).map(([v, label]) => (
            <button key={String(v)} type="button" onClick={() => setDaBiblioteca(v)} className={cn('rounded-lg border px-3 py-1.5 text-sm font-medium', daBiblioteca === v ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>{label}</button>
          ))}
        </div>

        <div className="max-h-[48vh] space-y-4 overflow-y-auto pr-1">
          {grupos.map(([g, label]) => (
            <div key={g}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {SUBTIPOS.filter((s) => s.grupo === g).map((s) => (
                  <button key={s.v} type="button" onClick={() => setSubtipo(s.v)} className={cn('flex items-start gap-2 rounded-xl border p-3 text-left transition-colors', subtipo === s.v ? 'border-primary bg-primary/5' : 'hover:bg-muted')}>
                    <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg', subtipo === s.v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{iconeTipoRef(s.tipoRef)}</span>
                    <span className="min-w-0"><span className="block text-sm font-semibold">{s.nome}</span><span className="block text-xs text-muted-foreground">{s.descricao}</span></span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={continuar} disabled={!moduloDestino}><ArrowRight className="h-4 w-4" />Continuar</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ═══════════════════════ Editar aula (referência) — create/edit ═══════════════════════
export function EditarItemDialog({ tenantId, produtoId, modulos, item, criar, onClose, onPronto }: {
  tenantId: string; produtoId: string; modulos: ModuloRow[]
  item: Partial<ItemRow> & { tipo_ref: TipoRef; subtipo?: string | null; modulo_id: string }
  criar: boolean; onClose: () => void; onPronto: () => void
}) {
  const [titulo, setTitulo] = useState(item.titulo ?? (item.subtipo ? SUBTIPO_LABEL[item.subtipo] ?? '' : ''))
  const [tipoRef] = useState<TipoRef>(item.tipo_ref)
  const [refId, setRefId] = useState<string | null>(item.ref_id ?? null)
  const [refUrl, setRefUrl] = useState<string | null>(item.ref_url ?? null)
  const [meta, setMeta] = useState<Record<string, unknown>>(item.meta ?? {})
  const [refLabel, setRefLabel] = useState<string>('')
  const [visibilidade, setVisibilidade] = useState<'privado' | 'publico'>(item.visibilidade ?? 'privado')
  const [situacao, setSituacao] = useState<'ativo' | 'rascunho'>(item.situacao ?? (criar ? 'ativo' : 'ativo'))
  const [disp, setDisp] = useState<Disponibilidade>(item.disponibilidade ?? { tipo: 'na_matricula', antes: 'bloqueado_cadeado' })
  const [editarDisp, setEditarDisp] = useState(false)
  const [picker, setPicker] = useState(false)
  const [pending, start] = useTransition()

  const precisaSimulado = tipoRef === 'simulado' || tipoRef === 'quiz'

  const ehCronograma = tipoRef === 'cronograma' // ref_id opcional (template do catálogo); o Adaptativo usa o plano do aluno
  const temRef = ehCronograma ? true : precisaSimulado ? !!refId : (tipoRef === 'documento_biblioteca' ? !!refId : !!refUrl)

  function salvar() {
    if (!titulo.trim()) { toast.error('Informe o título da aula.'); return }
    if (!temRef) { toast.error('Escolha o recurso que esta aula aponta.'); return }
    start(async () => {
      const payload = { modulo_id: item.modulo_id, tipo_ref: tipoRef, subtipo: item.subtipo ?? null, ref_id: refId, ref_url: refUrl, titulo: titulo.trim(), visibilidade, situacao, meta, disponibilidade: disp }
      const r = criar ? await criarItemAction(produtoId, payload) : await salvarItemAction(item.id!, produtoId, payload)
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success(criar ? 'Aula criada.' : 'Aula salva.'); onPronto(); onClose()
    })
  }

  return (
    <>
      <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
        <DialogContent showCloseButton className="sm:max-w-2xl">
          <DialogTitle>{criar ? 'Novo conteúdo' : 'Editar conteúdo'} · {TIPO_REF_LABEL[tipoRef]}</DialogTitle>
          <label className="block"><span className="mb-1 block text-sm font-medium">Título</span>
            <Input autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} /></label>

          {/* Referência (leve: aponta a um recurso existente) */}
          <div>
            <span className="mb-1 block text-sm font-medium">Recurso</span>
            {ehCronograma ? (
              <SimuladoBusca tipo="cronograma" valorId={refId} onChange={setRefId} />
            ) : precisaSimulado ? (
              <SimuladoBusca valorId={refId} onChange={setRefId} />
            ) : (
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 truncate rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">
                  {tipoRef === 'documento_biblioteca' ? (refId ? (refLabel || 'Documento ligado') : 'Nenhum documento ligado') : (refUrl || 'Nenhum link definido')}
                </div>
                <Button variant="outline" onClick={() => setPicker(true)}>{iconeTipoRef(tipoRef)}Escolher</Button>
              </div>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {ehCronograma
                ? <>No aluno aparece o card <strong>Plano de estudo</strong> (resumo do plano fixado dele + “Abrir cronograma”). Escolher um cronograma do catálogo é opcional — no tenant com Cronograma Adaptativo deixe em branco.</>
                : <>Currículo leve: a aula <strong>aponta</strong> para um recurso existente — não cria cópia nem hospeda vídeo.</>}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div><span className="mb-1 block text-sm font-medium">Visibilidade</span>
              <div className="flex gap-2">
                {(['privado', 'publico'] as const).map((v) => <button key={v} type="button" onClick={() => setVisibilidade(v)} className={cn('flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium capitalize', visibilidade === v ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>{v}</button>)}
              </div>
            </div>
            <div><span className="mb-1 block text-sm font-medium">Situação</span>
              <div className="flex gap-2">
                {(['ativo', 'rascunho'] as const).map((v) => <button key={v} type="button" onClick={() => setSituacao(v)} className={cn('flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium capitalize', situacao === v ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>{v}</button>)}
              </div>
            </div>
            <div><span className="mb-1 block text-sm font-medium">Disponibilidade</span>
              <button type="button" onClick={() => setEditarDisp(true)} className="flex h-9 w-full items-center justify-between rounded-lg border bg-background px-2.5 text-xs hover:bg-muted"><span className="truncate capitalize">{resumoDisponibilidade(disp)}</span><ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /></button>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={pending}>Cancelar</Button>
            <Button onClick={salvar} disabled={pending}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{criar ? 'Criar aula' : 'Salvar conteúdo'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {picker && (
        <FilePicker open onClose={() => setPicker(false)} tenantId={tenantId} categoria={item.subtipo === 'jurisclub' ? 'jurisclub' : 'conteudo'}
          abaInicial={tipoRef === 'video_url' ? 'video' : tipoRef === 'link' ? 'link' : 'biblioteca'}
          onSelecionar={(r) => {
            if (r.tipo === 'biblioteca' || r.tipo === 'upload') { setRefId(r.documentoId); setRefLabel(r.titulo ?? 'Documento'); if (!titulo.trim() && r.titulo) setTitulo(r.titulo) }
            else if (r.tipo === 'video') { setRefUrl(r.url); setMeta({ plataforma: r.plataforma, embedUrl: r.embedUrl ?? null }); if (!titulo.trim() && r.titulo) setTitulo(r.titulo) }
            else if (r.tipo === 'link') { setRefUrl(r.url); setMeta({ abrirDentro: r.abrirDentro }); if (!titulo.trim()) setTitulo(r.titulo) }
            setPicker(false)
          }} />
      )}
      {editarDisp && <DisponibilidadeDialog valor={disp} escopo="aula" onClose={() => setEditarDisp(false)} onAplicar={(d) => { setDisp(d); setEditarDisp(false) }} />}
    </>
  )
}

// Seletor de simulado com BUSCA no servidor (ilike + count + .range, 20 por vez) — sem baixar a lista de simulados.
function SimuladoBusca({ valorId, onChange, tipo = 'simulado' }: { valorId: string | null; onChange: (id: string | null) => void; tipo?: 'simulado' | 'cronograma' }) {
  const rotulo = tipo === 'cronograma' ? 'cronograma' : 'simulado'
  const [q, setQ] = useState('')
  const [aberto, setAberto] = useState(false)
  const [atual, setAtual] = useState<string>('')
  const [rows, setRows] = useState<{ id: string; nome: string }[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [buscando, setBuscando] = useState(false)
  const seq = useRef(0)

  // Nome do simulado já ligado (1 consulta por id; nada de lista).
  useEffect(() => {
    if (!valorId) { setAtual(''); return }
    nomesRecursosAction(tipo, [valorId]).then((r) => setAtual(r.ok ? (r.nomes[valorId]?.nome ?? '') : '')).catch(() => {})
  }, [valorId, tipo])

  function buscar(pg: number, anexar: boolean) {
    const mine = ++seq.current
    setBuscando(true)
    buscarRecursosAction(tipo, q, pg)
      .then((r) => {
        if (mine !== seq.current) return
        const novos = ('ok' in r ? r.rows : []) as { id: string; nome: string }[]
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

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 truncate rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">
          {valorId ? (atual || `${rotulo === 'simulado' ? 'Simulado' : 'Cronograma'} ligado`) : tipo === 'cronograma' ? 'Nenhum cronograma do catálogo (opcional)' : 'Nenhum simulado escolhido'}
        </div>
        {valorId && <Button variant="ghost" size="sm" onClick={() => onChange(null)}>Limpar</Button>}
      </div>
      <Input value={q} onChange={(e) => { setQ(e.target.value); setAberto(true) }} onFocus={() => setAberto(true)} placeholder={`Buscar ${rotulo} pelo ${tipo === 'cronograma' ? 'nome' : 'título'}…`} />
      {aberto && (
        <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border p-1">
          {buscando && rows.length === 0 ? <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Buscando…</div>
            : rows.length === 0 ? <div className="py-3 text-center text-xs text-muted-foreground">Nenhum {rotulo}.</div>
            : rows.map((r) => (
              <button key={r.id} type="button" onClick={() => { onChange(r.id); setAtual(r.nome); setAberto(false) }}
                className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted', r.id === valorId && 'bg-primary/10 text-primary')}>
                <span className="min-w-0 flex-1 truncate">{r.nome}</span>{r.id === valorId && <Check className="h-4 w-4 shrink-0" />}
              </button>
            ))}
          {rows.length < total && (
            <button type="button" onClick={() => buscar(pagina + 1, true)} disabled={buscando} className="w-full rounded-md py-1.5 text-xs font-medium text-primary hover:bg-muted disabled:opacity-50">
              {buscando ? 'Carregando…' : `Carregar mais (${rows.length} de ${total})`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════ Configurar disponibilidade ═══════════════════════
export function DisponibilidadeDialog({ valor, escopo, onClose, onAplicar }: {
  valor: Disponibilidade; escopo: 'módulo' | 'aula'; onClose: () => void; onAplicar: (d: Disponibilidade) => void
}) {
  const [tipo, setTipo] = useState<DisponibilidadeTipo>(valor.tipo)
  const [data, setData] = useState(valor.data ? valor.data.slice(0, 10) : '')
  const [dias, setDias] = useState<number | ''>(valor.dias ?? 7)
  const [diaSemana, setDiaSemana] = useState<number>(valor.diaSemana ?? 1)
  const [antes, setAntes] = useState(valor.antes ?? 'bloqueado_cadeado')

  const temDias = tipo === 'intervalo' || tipo === 'data_e_intervalo' || tipo === 'dia_semana_e_intervalo'
  const temData = tipo === 'data' || tipo === 'data_e_intervalo'

  function aplicar() {
    onAplicar({
      tipo, antes,
      data: temData && data ? new Date(`${data}T00:00:00-03:00`).toISOString() : null,
      dias: temDias ? (Number(dias) || 0) : null,
      diaSemana: tipo === 'dia_semana_e_intervalo' ? diaSemana : null,
    })
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className="sm:max-w-xl">
        <DialogTitle>Configurar disponibilidade</DialogTitle>
        <p className="-mt-2 text-sm text-muted-foreground">Quando este {escopo} fica disponível para o aluno.</p>
        <div className="space-y-2">
          {DISPONIBILIDADE_OPCOES.map((o) => (
            <label key={o.v} className={cn('flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2.5', tipo === o.v && 'border-primary bg-primary/5')}>
              <input type="radio" name="disp" checked={tipo === o.v} onChange={() => setTipo(o.v)} className="mt-0.5 h-4 w-4 accent-[var(--primary)]" />
              <span><span className="block text-sm font-medium">{o.titulo}</span><span className="block text-xs text-muted-foreground">{o.descricao}</span></span>
            </label>
          ))}
        </div>
        {(temData || temDias) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {temData && <label className="block"><span className="mb-1 block text-sm font-medium">Data</span><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></label>}
            {tipo === 'dia_semana_e_intervalo' && (
              <label className="block"><span className="mb-1 block text-sm font-medium">Dia da semana</span>
                <select value={diaSemana} onChange={(e) => setDiaSemana(Number(e.target.value))} className="h-9 w-full rounded-lg border bg-background px-2.5 text-sm">{DIAS_SEMANA.map((d, i) => <option key={i} value={i}>{d}</option>)}</select>
              </label>
            )}
            {temDias && <label className="block"><span className="mb-1 block text-sm font-medium">Dias após a matrícula</span><Input type="number" min={0} value={dias} onChange={(e) => setDias(e.target.value === '' ? '' : Number(e.target.value))} /></label>}
            <label className="block"><span className="mb-1 block text-sm font-medium">Antes de liberar, o aluno vê</span>
              <select value={antes} onChange={(e) => setAntes(e.target.value as any)} className="h-9 w-full rounded-lg border bg-background px-2.5 text-sm">{DISPONIBILIDADE_ANTES.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}</select>
            </label>
          </div>
        )}
        <div className="flex items-start gap-1.5 rounded-xl bg-primary/5 px-3 py-2 text-xs text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{resumoDisponibilidade({ tipo, data: temData && data ? new Date(`${data}T00:00:00-03:00`).toISOString() : null, dias: temDias ? Number(dias) || 0 : null, diaSemana })}</div>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={aplicar}><Check className="h-4 w-4" />Aplicar</Button></div>
      </DialogContent>
    </Dialog>
  )
}

// ═══════════════════════ Mover aula ═══════════════════════
export function MoverAulaDialog({ produtoId, item, modulos, onClose, onPronto }: {
  produtoId: string; item: ItemRow; modulos: ModuloRow[]; onClose: () => void; onPronto: () => void
}) {
  const [destino, setDestino] = useState(item.modulo_id)
  const [pending, start] = useTransition()
  function mover() {
    start(async () => {
      const r = await moverItemAction(item.id, produtoId, destino)
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success('Aula movida.'); onPronto(); onClose()
    })
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className="sm:max-w-md">
        <DialogTitle>Mover aula</DialogTitle>
        <div className="rounded-xl border bg-muted/40 px-3 py-2 text-sm font-medium">{item.titulo}</div>
        <label className="block"><span className="mb-1 block text-sm font-medium">Módulo / submódulo de destino</span>
          <select value={destino} onChange={(e) => setDestino(e.target.value)} className="h-9 w-full rounded-lg border bg-background px-2.5 text-sm">
            {modulos.map((m) => <option key={m.id} value={m.id}>{m.pai_id ? '— ' : ''}{m.titulo}</option>)}
          </select>
        </label>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose} disabled={pending}>Cancelar</Button><Button onClick={mover} disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Mover</Button></div>
      </DialogContent>
    </Dialog>
  )
}

// ═══════════════════════ Mover aulas (em lote) ═══════════════════════
export function MoverAulasLoteDialog({ quantidade, modulos, onClose, onConfirmar }: {
  quantidade: number; modulos: ModuloRow[]; onClose: () => void; onConfirmar: (moduloId: string) => void
}) {
  const [destino, setDestino] = useState(modulos[0]?.id ?? '')
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className="sm:max-w-md">
        <DialogTitle>Mover {quantidade} aula{quantidade === 1 ? '' : 's'}</DialogTitle>
        <label className="block"><span className="mb-1 block text-sm font-medium">Módulo / submódulo de destino</span>
          <select value={destino} onChange={(e) => setDestino(e.target.value)} className="h-9 w-full rounded-lg border bg-background px-2.5 text-sm">
            {modulos.map((m) => <option key={m.id} value={m.id}>{m.pai_id ? '— ' : ''}{m.titulo}</option>)}
          </select>
        </label>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={() => onConfirmar(destino)} disabled={!destino}>Mover</Button></div>
      </DialogContent>
    </Dialog>
  )
}

// ═══════════════════════ Duplicar aula ═══════════════════════
export function DuplicarAulaDialog({ produtoId, item, modulos, onClose, onPronto }: {
  produtoId: string; item: ItemRow; modulos: ModuloRow[]; onClose: () => void; onPronto: () => void
}) {
  const [titulo, setTitulo] = useState(`${item.titulo} (cópia)`)
  const [outro, setOutro] = useState(false)
  const [destino, setDestino] = useState(item.modulo_id)
  const [situacao, setSituacao] = useState<'ativo' | 'rascunho'>('rascunho')
  const [pending, start] = useTransition()
  function duplicar() {
    start(async () => {
      const r = await duplicarItemAction(item.id, produtoId, { titulo, moduloId: outro ? destino : item.modulo_id, situacao })
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success('Aula duplicada.'); onPronto(); onClose()
    })
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className="sm:max-w-md">
        <DialogTitle>Duplicar aula</DialogTitle>
        <label className="block"><span className="mb-1 block text-sm font-medium">Título da cópia</span><Input autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} /></label>
        <div className="space-y-2">
          <span className="block text-sm font-medium">Colocar a cópia em</span>
          <label className={cn('flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm', !outro && 'border-primary bg-primary/5')}><input type="radio" checked={!outro} onChange={() => setOutro(false)} className="h-4 w-4 accent-[var(--primary)]" />Logo abaixo da original (mesmo módulo)</label>
          <label className={cn('flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm', outro && 'border-primary bg-primary/5')}><input type="radio" checked={outro} onChange={() => setOutro(true)} className="h-4 w-4 accent-[var(--primary)]" />Outro módulo</label>
          {outro && <select value={destino} onChange={(e) => setDestino(e.target.value)} className="h-9 w-full rounded-lg border bg-background px-2.5 text-sm">{modulos.map((m) => <option key={m.id} value={m.id}>{m.pai_id ? '— ' : ''}{m.titulo}</option>)}</select>}
        </div>
        <div><span className="mb-1 block text-sm font-medium">Situação da cópia</span>
          <div className="flex gap-2">{(['rascunho', 'ativo'] as const).map((v) => <button key={v} type="button" onClick={() => setSituacao(v)} className={cn('rounded-lg border px-3 py-1.5 text-sm font-medium capitalize', situacao === v ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>{v}</button>)}</div>
        </div>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose} disabled={pending}>Cancelar</Button><Button onClick={duplicar} disabled={pending || !titulo.trim()}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Duplicar</Button></div>
      </DialogContent>
    </Dialog>
  )
}

// ═══════════════════════ Alterar tipo da aula ═══════════════════════
export function AlterarTipoDialog({ produtoId, item, onClose, onPronto }: {
  produtoId: string; item: ItemRow; onClose: () => void; onPronto: () => void
}) {
  const [subtipo, setSubtipo] = useState<string>(item.subtipo ?? 'documento')
  const [pending, start] = useTransition()
  function aplicar() {
    const def = subtipoDef(subtipo); if (!def) return
    start(async () => {
      const r = await alterarTipoItemAction(item.id, produtoId, subtipo, def.tipoRef)
      if ('error' in r && r.error) { toast.error(r.error); return }
      toast.success('Tipo alterado.'); onPronto(); onClose()
    })
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent showCloseButton className="sm:max-w-2xl">
        <DialogTitle>Alterar tipo da aula</DialogTitle>
        <div className="rounded-xl border bg-muted/40 px-3 py-2 text-sm"><span className="font-medium">{item.titulo}</span><span className="ml-1 text-xs text-muted-foreground">· tipo atual: {SUBTIPO_LABEL[item.subtipo ?? ''] ?? TIPO_REF_LABEL[item.tipo_ref]}</span></div>
        <div className="grid max-h-[50vh] gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
          {SUBTIPOS.map((s) => (
            <button key={s.v} type="button" onClick={() => setSubtipo(s.v)} className={cn('flex items-center gap-2 rounded-xl border p-3 text-left', subtipo === s.v ? 'border-primary bg-primary/5' : 'hover:bg-muted')}>
              <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg', subtipo === s.v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{iconeTipoRef(s.tipoRef)}</span>
              <span className="min-w-0"><span className="block text-sm font-medium">{s.nome}</span>{item.subtipo === s.v && <span className="text-[11px] text-primary">atual</span>}</span>
            </button>
          ))}
        </div>
        <p className="flex items-start gap-1.5 rounded-xl bg-primary/5 px-3 py-2 text-xs text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />O título, a disponibilidade e a visibilidade continuam. Se a base mudar (ex.: documento → vídeo), a referência é limpa — o material antigo continua na Biblioteca e pode ser religado.</p>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose} disabled={pending}>Cancelar</Button><Button onClick={aplicar} disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}Alterar e editar</Button></div>
      </DialogContent>
    </Dialog>
  )
}

// ── ícones por tipo_ref ──
export function iconeTipoRef(t: TipoRef) {
  if (t === 'documento_biblioteca') return <FileText className="h-4 w-4" />
  if (t === 'video_url') return <Video className="h-4 w-4" />
  if (t === 'simulado' || t === 'quiz') return <ClipboardList className="h-4 w-4" />
  if (t === 'link') return <Link2 className="h-4 w-4" />
  if (t === 'cronograma') return <CalendarDays className="h-4 w-4" />
  return <FolderOpen className="h-4 w-4" />
}

export { uid }
