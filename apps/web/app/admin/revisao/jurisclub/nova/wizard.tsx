'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, ClipboardList, FileText, Info, Plus, Send, Clock, Trash2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { FilePicker } from '@/components/admin/file-picker'
import { CampoImagem } from '@/components/admin/campo-imagem'
import { JcTicket } from '@/components/admin/revisao/jurisclub-cards'
import { cn } from '@/lib/utils'
import {
  JC_COR, JC_FILTROS_AUTO, JC_PASTAS, JC_SELOS, JC_SELO_GRUPOS, JC_STEPS, JC_VERSOES, inferirTribunal, jcPasta, jcVer,
  type JulgadoDraft, type QuestaoDraft, type NovaEdicaoInput,
} from '@/lib/revisao/jurisclub-tipos'
import { contarAlunosGrupos, contarAlunosJurisclub, criarEdicao, lerJulgadosDoDocumento } from '../actions'

// Passo a passo de 6 etapas (protótipo #jcnova, estado S.jw). Nada vai ao ar antes da etapa 6: o estado vive aqui
// (e em sessionStorage, para sobreviver a um F5) e só é gravado ao Publicar / Agendar / Salvar rascunho.

export interface WizardBase { id: string; titulo: string; cor: string; versao: 'ambos' | 'ess' | 'comp'; todos: boolean; grupoIds: string[]; filtrosAuto: Record<string, boolean> }
interface Props { pastaInicial: 'mensal' | '1a7d'; base: WizardBase | null; grupos: { id: string; nome: string }[]; disciplinas: string[]; totalTodos: number; tenantId: string; mesAtual: string; dataPadrao: string }

interface W {
  pasta: 'mensal' | '1a7d'; nome: string; mes: string; cor: string; imagem: string | null
  step: number; max: number
  documentoId: string | null; docNome: string; julgados: JulgadoDraft[]
  semQ: boolean; paraBanco: boolean; questoes: QuestaoDraft[]
  todos: boolean; grupoIds: string[]; versao: 'ambos' | 'ess' | 'comp'
  auto: Record<string, boolean>
  quando: 'agora' | 'agendar'; data: string; aviso: boolean; ini: boolean; email: boolean
}

const PAGE = 20
const letras = (s: string) => s.replace(/[^A-Za-zÀ-ú]/g, '').length

export function Wizard({ pastaInicial, base, grupos, disciplinas, totalTodos, tenantId, mesAtual, dataPadrao }: Props) {
  const router = useRouter()
  const [pend, start] = useTransition()
  const storeKey = `jc-wizard:${pastaInicial}:${base?.id ?? 'novo'}`
  const [w, setW] = useState<W>(() => {
    const p = jcPasta(pastaInicial)
    return {
      pasta: pastaInicial, nome: base ? `${base.titulo} (cópia)` : '', mes: mesAtual, cor: base?.cor ?? p.c1, imagem: null, step: 1, max: 1,
      documentoId: null, docNome: '', julgados: [], semQ: false, paraBanco: true, questoes: [],
      todos: base ? base.todos : pastaInicial === 'mensal', grupoIds: base?.grupoIds ?? [], versao: base?.versao ?? 'ambos',
      auto: base?.filtrosAuto ?? { tipo: true, tema: true, orgao: true, votacao: true, resultado: true, disp: true, faz: true },
      quando: 'agora', data: dataPadrao, aviso: true, ini: true, email: false,
    }
  })
  const hidratou = useRef(false)
  useEffect(() => {
    try { const s = sessionStorage.getItem(storeKey); if (s) setW((cur) => ({ ...cur, ...JSON.parse(s) })) } catch { /* ignora */ }
    hidratou.current = true
  }, [storeKey])
  useEffect(() => {
    if (!hidratou.current) return
    try { sessionStorage.setItem(storeKey, JSON.stringify(w)) } catch { /* ignora */ }
  }, [w, storeKey])

  const p = jcPasta(w.pasta)
  const st = JC_STEPS(p)
  const set = (patch: Partial<W>) => setW((c) => ({ ...c, ...patch }))
  const ok = [letras(w.nome) >= 3, w.julgados.length > 0, w.julgados.length > 0 && w.max >= 3, w.questoes.length > 0 || w.semQ, w.todos || w.grupoIds.length > 0]
  const dicas = [
    'Escolha a pasta e dê um nome com pelo menos 3 letras',
    `Suba o arquivo da ${p.un.toLowerCase()} (ou cole a lista) antes de avançar`,
    'Confira os selos antes de avançar',
    'Suba o caderno de questões ou marque “Publicar sem questões por enquanto”',
    'Libere para todos ou escolha ao menos um grupo',
  ]
  const ir = (i: number) => { if (i >= 1 && i <= w.max) { set({ step: i }); window.scrollTo({ top: 0, behavior: 'smooth' }) } }
  const avancar = () => {
    const i = w.step - 1
    if (i < 5 && !ok[i]) { toast.error(dicas[i]); return }
    set({ step: w.step + 1, max: Math.max(w.max, w.step + 1) })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function entrada(modo: 'publicar' | 'rascunho'): NovaEdicaoInput {
    return {
      pasta: w.pasta, titulo: w.nome, mes: w.mes, cor: w.cor, imagem: w.imagem, versao: w.versao, todos: w.todos, grupos: w.grupoIds,
      filtrosAuto: w.auto, documentoId: w.documentoId, questoesDocId: null, semQ: w.semQ, paraBanco: w.paraBanco,
      julgados: w.julgados, questoes: w.questoes, quando: modo === 'publicar' ? w.quando : 'agora', data: w.data, avisar: w.aviso, destaque: w.ini, email: w.email,
    }
  }
  function finalizar(modo: 'publicar' | 'rascunho') {
    if (modo === 'rascunho' && letras(w.nome) < 3) { set({ step: 1 }); toast.error('Dê um nome antes de salvar o rascunho'); return }
    start(async () => {
      const r = await criarEdicao(entrada(modo), modo)
      if (!r.ok) { toast.error(r.error); return }
      try { sessionStorage.removeItem(storeKey) } catch { /* ignora */ }
      toast.success(r.status === 'publicado' ? 'No ar para os alunos' : r.status === 'agendado' ? 'Publicação agendada' : 'Rascunho salvo. Os alunos ainda não veem')
      router.push(`/admin/revisao/jurisclub/${r.id}`)
    })
  }

  return (
    <>
      <section className="mb-4 rounded-2xl border bg-card p-4 shadow-sm">
        <div role="list" className="mb-3 flex flex-wrap items-center gap-1.5">
          {st.map((s, i) => {
            const on = w.step === i + 1
            const feito = !on && i < 5 && ok[i] && i + 1 <= w.max
            return (
              <span key={s} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-muted-foreground" aria-hidden>›</span>}
                <button type="button" disabled={i + 1 > w.max} onClick={() => ir(i + 1)}
                  className={cn('flex items-center gap-2 rounded-full border px-2.5 py-1 text-sm font-medium transition-colors disabled:opacity-50',
                    on ? 'border-primary bg-primary/10 text-primary' : feito ? 'border-emerald-600/40 text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground')}>
                  <span className={cn('grid size-5 place-items-center rounded-full text-[11px] font-bold', on ? 'bg-primary text-primary-foreground' : feito ? 'bg-emerald-600 text-white' : 'bg-muted')}>{feito ? '✓' : i + 1}</span>
                  {s}
                </button>
              </span>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={w.step <= 1} onClick={() => ir(w.step - 1)}>‹ Voltar</Button>
          {w.step < 6 && <Button size="sm" onClick={avancar}>Avançar ›</Button>}
          <span className="ml-1 text-xs text-muted-foreground">Etapa {w.step} de 6 · nada vai ao ar antes da etapa 6</span>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-4">
          {w.step === 1 && <Etapa1 w={w} set={set} p={p} />}
          {w.step === 2 && <Etapa2 w={w} set={set} p={p} tenantId={tenantId} disciplinas={disciplinas} />}
          {w.step === 3 && <Etapa3 w={w} set={set} p={p} />}
          {w.step === 4 && <Etapa4 w={w} set={set} p={p} />}
          {w.step === 5 && <Etapa5 w={w} set={set} p={p} grupos={grupos} totalTodos={totalTodos} />}
          {w.step === 6 && <Etapa6 w={w} set={set} p={p} ok={ok} st={st} grupos={grupos} pend={pend} finalizar={finalizar} ir={ir} />}
        </div>
        <aside className="space-y-2 xl:sticky xl:top-4 xl:self-start">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prévia do card</div>
          <JcTicket cor={w.cor} imagem={w.imagem} nome={w.nome} pasta={p} />
          <p className="text-xs text-muted-foreground">Como aparece na lista do aluno. A capa larga e o pôster vertical usam a mesma imagem.</p>
        </aside>
      </div>
    </>
  )
}

type EP = { w: W; set: (p: Partial<W>) => void; p: ReturnType<typeof jcPasta> }
const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => <section className={cn('space-y-4 rounded-2xl border bg-card p-4 shadow-sm', className)}>{children}</section>
const Campo = ({ rotulo, children, dica }: { rotulo: string; children: React.ReactNode; dica?: string }) => (
  <label className="block space-y-1.5"><span className="text-sm font-semibold">{rotulo}</span>{children}{dica && <small className="block text-xs text-muted-foreground">{dica}</small>}</label>
)
const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>{on && <Check className="size-3.5" />}{children}</button>
)
const Nota = ({ children, aviso }: { children: React.ReactNode; aviso?: boolean }) => (
  <div className={cn('flex items-start gap-2 rounded-xl border p-3 text-sm', aviso ? 'border-amber-500/40 bg-amber-500/10' : 'bg-muted/40')}>
    {aviso ? <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" /> : <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}<span>{children}</span>
  </div>
)
const Linha = ({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) => (
  <div className="flex items-center gap-3 text-sm"><Switch checked={on} onCheckedChange={onChange} />{children}</div>
)

/** Pequena paginação client-side p/ as tabelas de edição do passo a passo (buffer local, ainda não gravado). */
function usePag<T>(rows: T[], q: string, match: (r: T, q: string) => boolean) {
  const [pg, setPg] = useState(1)
  const f = useMemo(() => (q ? rows.filter((r) => match(r, q.toLowerCase())) : rows), [rows, q, match])
  const paginas = Math.max(1, Math.ceil(f.length / PAGE))
  const pagina = Math.min(pg, paginas)
  return { itens: f.slice((pagina - 1) * PAGE, pagina * PAGE), total: f.length, pagina, paginas, ini: (pagina - 1) * PAGE, setPg }
}
function Pager({ pagina, paginas, total, setPg }: { pagina: number; paginas: number; total: number; setPg: (n: number) => void }) {
  if (paginas <= 1) return <p className="px-1 pt-2 text-xs text-muted-foreground">{total} no total</p>
  return (
    <div className="flex items-center justify-end gap-2 pt-2 text-xs">
      <span className="text-muted-foreground">{total} no total · página {pagina} de {paginas}</span>
      <Button variant="outline" size="xs" disabled={pagina <= 1} onClick={() => setPg(pagina - 1)}>Anterior</Button>
      <Button variant="outline" size="xs" disabled={pagina >= paginas} onClick={() => setPg(pagina + 1)}>Próxima</Button>
    </div>
  )
}

function Etapa1({ w, set, p }: EP) {
  return (
    <Card>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <span className="text-sm font-semibold">Pasta</span>
          <div className="flex flex-wrap gap-2">
            {JC_PASTAS.filter((x) => !x.ext).map((x) => (
              <Chip key={x.id} on={w.pasta === x.id} onClick={() => set({ pasta: x.id as 'mensal' | '1a7d', cor: x.c1, ...(x.id === '1a7d' ? { todos: false } : {}) })}>{x.n}</Chip>
            ))}
          </div>
        </div>
        <Campo rotulo={p.id === '1a7d' ? 'Lançado em' : 'Mês de referência'}>
          <Input type="month" value={w.mes} onChange={(e) => set({ mes: e.target.value })} />
        </Campo>
      </div>
      <Campo rotulo={`Nome da ${p.un.toLowerCase()}`} dica="Mínimo de 3 letras. É o nome que o aluno vê no card.">
        <Input value={w.nome} onChange={(e) => set({ nome: e.target.value })} autoComplete="off" placeholder={p.id === '1a7d' ? 'Ex.: Dia 05 · Direito Tributário (2026)' : 'Ex.: Edição Novembro/2026'} />
      </Campo>
      <div className="space-y-1.5">
        <span className="text-sm font-semibold">Imagem do card (opcional)</span>
        <CampoImagem value={w.imagem} onChange={(u) => set({ imagem: u })} aspecto="21 / 5" compacto textoVazio="Adicionar imagem do card (opcional)" rotulo={`Sem imagem, o card usa a cor abaixo com o nome da ${p.un.toLowerCase()}. JPG, PNG ou WEBP.`} />
      </div>
      <div className="space-y-1.5">
        <span className="text-sm font-semibold">Cor</span>
        <div className="flex flex-wrap gap-2">
          {JC_COR.map((c) => (
            <button key={c} type="button" aria-label={`Cor ${c}`} onClick={() => set({ cor: c })} style={{ background: c }}
              className={cn('size-8 rounded-full border-2 border-transparent ring-offset-2 ring-offset-background', w.cor === c && 'ring-2 ring-primary')} />
          ))}
        </div>
      </div>
    </Card>
  )
}

const TRIBUNAIS = ['STF', 'STJ', 'TST', 'TSE', 'TCU']

function Etapa2({ w, set, p, tenantId, disciplinas }: EP & { tenantId: string; disciplinas: string[] }) {
  const [pick, setPick] = useState(false)
  const [lendo, setLendo] = useState(false)
  const [lista, setLista] = useState('')
  const [q, setQ] = useState('')
  const pag = usePag(w.julgados, q, (j: JulgadoDraft, t) => j.titulo.toLowerCase().includes(t))
  const item = p.id === '1a7d' ? 'tema' : 'julgado'
  const upd = (i: number, patch: Partial<JulgadoDraft>) => set({ julgados: w.julgados.map((j, k) => (k === i ? { ...j, ...patch } : j)) })

  async function lerDoc(documentoId: string, titulo?: string) {
    setLendo(true)
    const r = await lerJulgadosDoDocumento(documentoId)
    setLendo(false)
    if (!r.ok) { toast.error(r.error); return }
    set({ documentoId, docNome: titulo || r.titulo, julgados: r.julgados })
    toast.success(`${r.julgados.length} ${p.item} encontrados. Complete tribunal, órgão e disciplina e confira tudo.`)
  }
  function colar() {
    const novos: JulgadoDraft[] = lista.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [titulo, trib, org, disc] = l.split('|').map((x) => x.trim())
      return { titulo, tribunal: trib || inferirTribunal(titulo), orgao: org ?? '', disciplina: disc ?? '', selos: [], fazenda: false, conferido: false }
    }).filter((j) => j.titulo)
    if (!novos.length) { toast.error('Cole ao menos uma linha.'); return }
    set({ julgados: [...w.julgados, ...novos] }); setLista('')
    toast.success(`${novos.length} ${p.item} adicionados`)
  }
  const naoConf = w.julgados.filter((j) => !j.conferido).length

  return (
    <>
      <FilePicker open={pick} onClose={() => setPick(false)} tenantId={tenantId} categoria="jurisclub" abaInicial="upload"
        onSelecionar={(r) => { if (r.tipo === 'biblioteca' || r.tipo === 'upload') void lerDoc(r.documentoId, r.titulo) }} />
      {w.julgados.length === 0 && (
        <Card>
          <button type="button" onClick={() => setPick(true)} disabled={lendo}
            className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed p-8 text-center hover:bg-muted/40">
            <FileText className="size-6 text-primary" />
            <b className="text-sm">{lendo ? 'Lendo o documento…' : `Subir o ${p.id === '1a7d' ? 'material do dia' : 'caderno da edição'} (.docx ou .html) ou escolher da Biblioteca`}</b>
            <span className="text-xs text-muted-foreground">O arquivo vai para a Biblioteca do JurisClub e o sistema separa cada {item} pelos títulos do documento. Você confere tudo antes de publicar.</span>
          </button>
          <div className="space-y-2">
            <span className="text-sm font-semibold">Ou cole a lista (uma por linha)</span>
            <Textarea rows={4} value={lista} onChange={(e) => setLista(e.target.value)} placeholder={'Título do julgado | Tribunal | Órgão | Disciplina\nADI 7.886/GO · iniciativa de lei | STF | Plenário | Constitucional'} />
            <Button variant="outline" size="sm" onClick={colar}>Adicionar linhas</Button>
          </div>
        </Card>
      )}
      {w.julgados.length > 0 && (
        <>
          <div className="flex flex-wrap items-start gap-2 rounded-xl border border-emerald-600/30 bg-emerald-600/10 p-3 text-sm">
            <Check className="mt-0.5 size-4 text-emerald-600" />
            <span className="min-w-0 flex-1"><b>{w.docNome || 'Lista colada'}</b> lido. {w.julgados.length} {p.item} encontrados em {new Set(w.julgados.map((j) => j.disciplina).filter(Boolean)).size} disciplinas.</span>
            <Button variant="outline" size="xs" onClick={() => setPick(true)}>Trocar arquivo</Button>
            <Button variant="outline" size="xs" onClick={() => set({ julgados: [], documentoId: null, docNome: '' })}>Recomeçar</Button>
          </div>
          {naoConf > 0 && <Nota aviso>{naoConf} {p.item} ainda não conferidos. Confira e marque como revisado. Dá para publicar assim, mas o ideal é revisar todos.</Nota>}
          <Card className="space-y-2 p-2">
            <div className="flex flex-wrap gap-2 p-2">
              <Input className="max-w-xs" placeholder={`Buscar ${p.item}`} value={q} onChange={(e) => { setQ(e.target.value); pag.setPg(1) }} />
              <Button variant="outline" size="sm" onClick={() => set({ julgados: [...w.julgados, { titulo: `Novo ${item}`, tribunal: 'STF', orgao: '', disciplina: '', selos: [], fazenda: false, conferido: false }] })}><Plus />Adicionar {item}</Button>
              <Button variant="outline" size="sm" onClick={() => set({ julgados: w.julgados.map((j) => ({ ...j, conferido: true })) })}>Marcar todos como conferidos</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-2">#</th><th className="px-2">{p.id === '1a7d' ? 'Tema' : 'Julgado'}</th><th className="px-2">Tribunal</th><th className="px-2">Órgão</th><th className="px-2">Disciplina</th><th className="px-2">Conferido</th><th /></tr></thead>
                <tbody>
                  <datalist id="jc-wz-disc">{disciplinas.map((d) => <option key={d} value={d} />)}</datalist>
                  {pag.itens.map((j, k) => {
                    const i = pag.ini + k
                    const real = w.julgados.indexOf(j)
                    const idx = real >= 0 ? real : i
                    return (
                      <tr key={idx} className="border-b last:border-0">
                        <td className="px-2 py-1.5 tabular-nums">{idx + 1}</td>
                        <td className="min-w-72 px-2 py-1.5"><Input value={j.titulo} onChange={(e) => upd(idx, { titulo: e.target.value })} /></td>
                        <td className="px-2 py-1.5">
                          <select className="h-8 rounded-md border bg-background px-2 text-sm" value={j.tribunal} onChange={(e) => upd(idx, { tribunal: e.target.value })}>
                            {TRIBUNAIS.map((t) => <option key={t}>{t}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1.5"><Input value={j.orgao} onChange={(e) => upd(idx, { orgao: e.target.value })} placeholder="Plenário" /></td>
                        <td className="px-2 py-1.5"><Input list="jc-wz-disc" value={j.disciplina} onChange={(e) => upd(idx, { disciplina: e.target.value })} placeholder="Constitucional" /></td>
                        <td className="px-2 py-1.5"><Switch checked={j.conferido} onCheckedChange={(v) => upd(idx, { conferido: v })} aria-label="Conferido" /></td>
                        <td className="px-2 py-1.5"><Button variant="ghost" size="icon-sm" aria-label="Tirar" onClick={() => set({ julgados: w.julgados.filter((_, m) => m !== idx) })}><Trash2 /></Button></td>
                      </tr>
                    )
                  })}
                  {!pag.itens.length && <tr><td colSpan={7} className="px-2 py-6 text-center text-muted-foreground">Nada encontrado.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="px-2 pb-2"><Pager {...pag} /></div>
          </Card>
        </>
      )}
    </>
  )
}

function Etapa3({ w, set, p }: EP) {
  const [q, setQ] = useState('')
  const pag = usePag(w.julgados, q, (j: JulgadoDraft, t) => j.titulo.toLowerCase().includes(t))
  const nFaz = w.julgados.filter((j) => j.selos.includes('fav') || j.selos.includes('desf')).length
  const nRg = w.julgados.filter((j) => j.selos.includes('rg') || j.selos.includes('rep')).length
  const grupos = ['forca', 'sit', 'faz'] as const
  const alt = (i: number, k: string) => set({ julgados: w.julgados.map((j, m) => (m !== i ? j : { ...j, selos: j.selos.includes(k) ? j.selos.filter((x) => x !== k) : [...j.selos, k] })) })
  return (
    <>
      <Nota>Os selos vieram do documento. Clique para ligar ou desligar. Os filtros automáticos montam o painel de filtros que o aluno usa na lista.</Nota>
      <Card>
        <div><h2 className="text-base font-semibold">Filtros automáticos</h2><p className="text-sm text-muted-foreground">Gerados a partir do texto de cada {p.item.slice(0, -1)}</p></div>
        <div className="flex flex-wrap gap-2">
          {JC_FILTROS_AUTO.map((f) => <Chip key={f.k} on={!!w.auto[f.k]} onClick={() => set({ auto: { ...w.auto, [f.k]: !w.auto[f.k] } })}>{f.n}</Chip>)}
        </div>
        <p className="text-xs text-muted-foreground">{nFaz} {p.item} com interesse da Fazenda · {nRg} com repercussão geral ou repetitivo.</p>
      </Card>
      <Card className="space-y-2 p-2">
        <div className="p-2"><Input className="max-w-xs" placeholder={`Buscar ${p.item}`} value={q} onChange={(e) => { setQ(e.target.value); pag.setPg(1) }} /></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-2 py-2">{p.id === '1a7d' ? 'Tema' : 'Julgado'}</th>{grupos.map((g) => <th key={g} className="px-2">{JC_SELO_GRUPOS[g]}</th>)}</tr></thead>
            <tbody>
              {pag.itens.map((j) => {
                const idx = w.julgados.indexOf(j)
                return (
                  <tr key={idx} className="border-b align-top last:border-0">
                    <td className="min-w-56 px-2 py-2"><b>{j.titulo}</b><span className="block text-xs text-muted-foreground">{j.tribunal}{j.disciplina ? ` · ${j.disciplina}` : ''}</span></td>
                    {grupos.map((g) => (
                      <td key={g} className="px-2 py-2"><div className="flex flex-wrap gap-1">
                        {JC_SELOS.filter((s) => s.g === g).map((s) => {
                          const on = j.selos.includes(s.k)
                          return <button key={s.k} type="button" onClick={() => alt(idx, s.k)} aria-pressed={on} className={cn('rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-none transition-opacity', on ? s.cls : 'border-dashed opacity-50 hover:opacity-100')}>{s.n}</button>
                        })}
                      </div></td>
                    ))}
                  </tr>
                )
              })}
              {!pag.itens.length && <tr><td colSpan={4} className="px-2 py-6 text-center text-muted-foreground">Nada encontrado.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="px-2 pb-2"><Pager {...pag} /></div>
      </Card>
    </>
  )
}

function Etapa4({ w, set, p }: EP) {
  const [txt, setTxt] = useState('')
  const [q, setQ] = useState('')
  const pag = usePag(w.questoes, q, (x: QuestaoDraft, t) => x.enunciado.toLowerCase().includes(t))
  function colar() {
    const novas: QuestaoDraft[] = []
    for (const l of txt.split('\n').map((x) => x.trim()).filter(Boolean)) {
      const [g, enun, disc, ass, com, nj] = l.split('|').map((x) => x.trim())
      const gab = (g ?? '').toUpperCase().startsWith('C') ? 'C' : (g ?? '').toUpperCase().startsWith('E') ? 'E' : null
      if (!gab || !enun) continue
      const n = Number(nj)
      novas.push({ enunciado: enun, gabarito: gab, disciplina: disc ?? '', assunto: ass ?? '', comentario: com ?? '', julgadoIdx: Number.isInteger(n) && n > 0 && n <= w.julgados.length ? n - 1 : null })
    }
    if (!novas.length) { toast.error('Nenhuma linha válida. Use: C ou E | enunciado | disciplina | assunto | comentário'); return }
    set({ questoes: [...w.questoes, ...novas], semQ: false }); setTxt('')
    toast.success(`${novas.length} questões adicionadas`)
  }
  return (
    <>
      {w.questoes.length === 0 && (
        <Card>
          <div className="space-y-2">
            <span className="flex items-center gap-2 text-sm font-semibold"><ClipboardList className="size-4 text-primary" />Cole as questões Certo/Errado (uma por linha)</span>
            <Textarea rows={5} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder={'C ou E | enunciado | disciplina | assunto | comentário (opcional) | nº do julgado (opcional)'} />
            <p className="text-xs text-muted-foreground">Os campos são os mesmos do banco de Questões: disciplina e assunto. O nº do julgado (coluna # da etapa 2) liga a questão ao julgado de origem.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={colar}>Adicionar questões</Button>
              <Button variant={w.semQ ? 'default' : 'outline'} size="sm" onClick={() => set({ semQ: !w.semQ })}>{w.semQ && <Check />}Publicar sem questões por enquanto</Button>
            </div>
          </div>
          {w.semQ && <Nota>O aluno vê “Caderno de questões em breve” e a caixa “Teste o que leu” fica escondida até as questões entrarem.</Nota>}
        </Card>
      )}
      {w.questoes.length > 0 && (
        <>
          <div className="flex items-start gap-2 rounded-xl border border-emerald-600/30 bg-emerald-600/10 p-3 text-sm">
            <Check className="mt-0.5 size-4 text-emerald-600" />
            <span className="flex-1">{w.questoes.length} questões Certo/Errado, com gabarito{w.questoes.some((x) => x.comentario) ? ' e comentário' : ''}, ligadas ao {p.id === '1a7d' ? 'tema' : 'julgado'} desta {p.un.toLowerCase()}.</span>
            <Button variant="outline" size="xs" onClick={() => set({ questoes: [] })}>Recomeçar</Button>
          </div>
          <Card className="space-y-2 p-2">
            <div className="flex flex-wrap gap-2 p-2">
              <Input className="max-w-xs" placeholder="Buscar questão" value={q} onChange={(e) => { setQ(e.target.value); pag.setPg(1) }} />
              <Input className="min-w-64 flex-1" placeholder="Colar mais (C ou E | enunciado | disciplina | assunto | comentário | nº do julgado)" value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') colar() }} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-2 py-2">#</th><th className="px-2">Enunciado</th><th className="px-2">Tipo</th><th className="px-2">Gabarito</th><th className="px-2">Disciplina</th><th className="px-2">Assunto</th><th /></tr></thead>
                <tbody>
                  {pag.itens.map((x) => {
                    const idx = w.questoes.indexOf(x)
                    return (
                      <tr key={idx} className="border-b last:border-0">
                        <td className="px-2 py-2 tabular-nums">{idx + 1}</td>
                        <td className="min-w-72 px-2 py-2">{x.enunciado}</td>
                        <td className="px-2 py-2">C/E</td>
                        <td className="px-2 py-2"><span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', x.gabarito === 'C' ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-300' : 'bg-red-600/15 text-red-700 dark:text-red-300')}>{x.gabarito === 'C' ? 'Certo' : 'Errado'}</span></td>
                        <td className="px-2 py-2">{x.disciplina || '—'}</td>
                        <td className="px-2 py-2">{x.assunto || '—'}</td>
                        <td className="px-2 py-2"><Button variant="ghost" size="icon-sm" aria-label="Tirar" onClick={() => set({ questoes: w.questoes.filter((_, m) => m !== idx) })}><Trash2 /></Button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-2 pb-2"><Pager {...pag} /></div>
          </Card>
          <Linha on={w.paraBanco} onChange={(v) => set({ paraBanco: v })}>Mandar estas questões também ao banco de Questões do admin de simulados (para o Simulado Trimestral)</Linha>
        </>
      )}
    </>
  )
}

function Etapa5({ w, set, p, grupos, totalTodos }: EP & { grupos: { id: string; nome: string }[]; totalTodos: number }) {
  const [q, setQ] = useState('')
  const [alunos, setAlunos] = useState<number | null>(null)
  const chave = w.grupoIds.join(',')
  useEffect(() => {
    if (w.todos || !w.grupoIds.length) { setAlunos(null); return }
    const t = setTimeout(async () => { const r = await contarAlunosGrupos(w.grupoIds); if (r.ok) setAlunos(r.total) }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.todos, chave])
  const vis = q ? grupos.filter((g) => g.nome.toLowerCase().includes(q.toLowerCase())) : grupos
  return (
    <>
      <Card>
        <Linha on={w.todos} onChange={(v) => set({ todos: v })}><b>Liberar para todos os alunos com JurisClub</b></Linha>
        {!w.todos && (
          <div className="space-y-2">
            <span className="text-sm font-semibold">Ou só para estes grupos de acesso</span>
            <Input className="max-w-xs" placeholder="Buscar grupo" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="flex max-h-72 flex-wrap gap-2 overflow-y-auto">
              {vis.map((g) => <Chip key={g.id} on={w.grupoIds.includes(g.id)} onClick={() => set({ grupoIds: w.grupoIds.includes(g.id) ? w.grupoIds.filter((x) => x !== g.id) : [...w.grupoIds, g.id] })}>{g.nome}</Chip>)}
              {!vis.length && <span className="text-sm text-muted-foreground">Nenhum grupo encontrado.</span>}
            </div>
            <small className="text-xs text-muted-foreground">Os grupos são os mesmos do admin de simulados.</small>
          </div>
        )}
        <p className="text-xs text-muted-foreground">{w.todos ? `${totalTodos.toLocaleString('pt-BR')} alunos vão ver esta ${p.un.toLowerCase()}.` : alunos != null ? `${alunos.toLocaleString('pt-BR')} alunos vão ver esta ${p.un.toLowerCase()}.` : 'Escolha ao menos um grupo.'}</p>
      </Card>
      <Card>
        <h2 className="text-base font-semibold">Versão que o aluno vê</h2>
        <div className="flex flex-wrap gap-2">{JC_VERSOES.map((o) => <Chip key={o.v} on={w.versao === o.v} onClick={() => set({ versao: o.v })}>{o.n}</Chip>)}</div>
        <small className="text-xs text-muted-foreground">Essencial mostra tese, selos e conclusão. Completo mostra o {p.id === '1a7d' ? 'tema' : 'julgado'} inteiro, como no documento.</small>
      </Card>
    </>
  )
}

function Etapa6({ w, set, p, ok, st, grupos, pend, finalizar, ir }: EP & { ok: boolean[]; st: string[]; grupos: { id: string; nome: string }[]; pend: boolean; finalizar: (m: 'publicar' | 'rascunho') => void; ir: (i: number) => void }) {
  const pronto = ok.every(Boolean)
  const nomesGrupos = w.grupoIds.map((id) => grupos.find((g) => g.id === id)?.nome ?? '').filter(Boolean).join(', ')
  const resumo = [
    `${w.nome || 'sem nome'} · ${p.n}`,
    w.julgados.length ? `${w.julgados.length} ${p.item} · ${w.docNome || 'lista colada'}` : 'nenhum arquivo enviado',
    `${Object.values(w.auto).filter(Boolean).length} filtros automáticos · selos conferidos`,
    w.questoes.length ? `${w.questoes.length} questões${w.paraBanco ? ' · vão também ao banco do simulado' : ''}` : w.semQ ? 'sem questões por enquanto' : 'nenhum caderno enviado',
    `${w.todos ? 'todos os alunos com JurisClub' : nomesGrupos || 'nenhum grupo'} · ${jcVer(w.versao)}`,
  ]
  return (
    <>
      <Card>
        <h2 className="text-base font-semibold">Resumo</h2>
        <div className="divide-y">
          {st.slice(0, 5).map((x, i) => (
            <div key={x} className="flex items-center gap-3 py-2">
              <span className={cn('h-8 w-1 rounded-full', ok[i] ? 'bg-emerald-600' : 'bg-amber-500')} />
              <span className="min-w-0 flex-1"><b className="block text-sm">{i + 1}. {x}</b><small className="text-xs text-muted-foreground">{resumo[i]}</small></span>
              {ok[i] ? <span className="rounded-full bg-emerald-600/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">Pronto</span> : <Button variant="outline" size="sm" onClick={() => ir(i + 1)}>Resolver</Button>}
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <h2 className="text-base font-semibold">Quando vai ao ar</h2>
        <div className="flex gap-2"><Chip on={w.quando === 'agora'} onClick={() => set({ quando: 'agora' })}>Publicar agora</Chip><Chip on={w.quando === 'agendar'} onClick={() => set({ quando: 'agendar' })}>Agendar</Chip></div>
        {w.quando === 'agendar' && <Campo rotulo="Data e hora (horário de Brasília)"><Input className="max-w-72" type="datetime-local" value={w.data} onChange={(e) => set({ data: e.target.value })} /></Campo>}
        <Linha on={w.aviso} onChange={(v) => set({ aviso: v })}>Avisar os alunos na plataforma quando for ao ar</Linha>
        <Linha on={w.ini} onChange={(v) => set({ ini: v })}>Mostrar nos destaques do Início do aluno</Linha>
        <Linha on={w.email} onChange={(v) => set({ email: v })}>Preparar um e-mail em Disparo de Campanha (você revisa antes de enviar)</Linha>
      </Card>
      {!pronto && <Nota aviso>Falta concluir: {ok.map((v, i) => (v ? '' : st[i].toLowerCase())).filter(Boolean).join(', ')}.</Nota>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={!pronto || pend} onClick={() => finalizar('publicar')}>{w.quando === 'agendar' ? <Clock /> : <Send />}{w.quando === 'agendar' ? 'Agendar publicação' : 'Publicar agora'}</Button>
        <Button variant="outline" disabled={pend} onClick={() => finalizar('rascunho')}><Check />Salvar como rascunho</Button>
        <Link href="/admin/revisao/jurisclub" className="inline-flex h-8 items-center rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground">Cancelar</Link>
      </div>
    </>
  )
}
