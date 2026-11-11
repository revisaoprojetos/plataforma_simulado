'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Check, FileUp, Lock, KeyRound, Pencil, Plus, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { confirmar } from '@/components/ui/confirm-dialog'
import { FilePicker } from '@/components/admin/file-picker'
import { CampoImagem } from '@/components/admin/campo-imagem'
import { JcTicket } from '@/components/admin/revisao/jurisclub-cards'
import { cn } from '@/lib/utils'
import { JC_COR, JC_FILTROS_ALUNO, JC_ORDENS, JC_SELOS, JC_VERSOES, jcPasta, type JulgadoRow, type QuestaoDraft } from '@/lib/revisao/jurisclub-tipos'
import {
  adicionarQuestoes, alternarLiberacao, alternarPublicacao, conferirJulgado, contarAlunosGrupos, enviarQuestoesAoBanco, excluirJulgado, moverJulgado,
  registrarErrata, salvarConfiguracoes, salvarJulgado, salvarQuemVe, trocarDocumento, vincularDocumento,
} from '../actions'

// Ilhas interativas da página da edição. A página (server) só LÊ e passa dados prontos; aqui só disparam server actions
// e fazem router.refresh() para reler. Confirmações via confirmar() (mesma mecânica do resto do admin).

function useAcao() {
  const router = useRouter()
  const [pend, start] = useTransition()
  const rodar = (fn: () => Promise<{ ok: boolean; error?: string } & Record<string, any>>, okMsg: string | ((r: any) => string), depois?: () => void) =>
    start(async () => {
      const r = await fn()
      if (!r.ok) { toast.error(r.error ?? 'Não foi possível concluir.'); return }
      toast.success(typeof okMsg === 'function' ? okMsg(r) : okMsg)
      depois?.()
      router.refresh()
    })
  return { pend, rodar }
}

const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>{on && <Check className="size-3.5" />}{children}</button>
)

// ───────────── cabeçalho ─────────────
export function PublicarBtn({ id, status }: { id: string; status: string }) {
  const { pend, rodar } = useAcao()
  const noAr = status === 'publicado'
  async function clicar() {
    const okc = await confirmar(noAr
      ? { titulo: 'Tirar do ar?', mensagem: 'Os alunos deixam de ver. O progresso deles fica guardado.', confirmar: 'Tirar do ar', destrutivo: true }
      : { titulo: 'Publicar para os alunos?', mensagem: 'A edição aparece para quem tem acesso e os alunos são avisados na plataforma.', confirmar: 'Publicar' })
    if (okc) rodar(() => alternarPublicacao(id, true), noAr ? 'Tirado do ar. O progresso dos alunos fica guardado' : 'No ar para os alunos')
  }
  return noAr
    ? <Button variant="outline" disabled={pend} onClick={clicar}><Lock />Tirar do ar</Button>
    : <Button disabled={pend} onClick={clicar}><Send />Publicar</Button>
}

// ───────────── visão geral: liberações ─────────────
export function LiberacaoBtn({ id, parte, nome, liberado }: { id: string; parte: 'leitura' | 'vf' | 'pdf' | 'cad' | 'gab'; nome: string; liberado: boolean }) {
  const { pend, rodar } = useAcao()
  async function clicar() {
    if (await confirmar({ titulo: `${liberado ? 'Bloquear' : 'Liberar'} “${nome}”?`, mensagem: liberado ? 'O aluno deixa de acessar esta parte.' : 'O aluno passa a acessar esta parte.', confirmar: liberado ? 'Bloquear' : 'Liberar', destrutivo: liberado }))
      rodar(() => alternarLiberacao(id, parte), (r) => (r.liberado ? 'Liberado para os alunos' : 'Bloqueado para os alunos'))
  }
  return <Button variant="outline" size="sm" disabled={pend} onClick={clicar}>{liberado ? <Lock /> : <KeyRound />}{liberado ? 'Bloquear' : 'Liberar'}</Button>
}

// ───────────── julgados ─────────────
export function OrdemBtns({ edicaoId, id, ativo, primeiro, ultimo }: { edicaoId: string; id: string; ativo: boolean; primeiro: boolean; ultimo: boolean }) {
  const { pend, rodar } = useAcao()
  return (
    <span className="mr-1 inline-flex flex-col">
      <button type="button" disabled={!ativo || pend || primeiro} onClick={() => rodar(() => moverJulgado(edicaoId, id, -1), 'Ordem atualizada')} aria-label="Subir" className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
      <button type="button" disabled={!ativo || pend || ultimo} onClick={() => rodar(() => moverJulgado(edicaoId, id, 1), 'Ordem atualizada')} aria-label="Descer" className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
    </span>
  )
}

export function JulgadoLinhaAcoes({ edicaoId, j, item, disciplinas }: { edicaoId: string; j: JulgadoRow; item: string; disciplinas: string[] }) {
  const { pend, rodar } = useAcao()
  const [edit, setEdit] = useState(false)
  async function tirar() {
    if (await confirmar({ titulo: 'Tirar da edição?', mensagem: j.titulo, confirmar: 'Tirar', destrutivo: true })) rodar(() => excluirJulgado(edicaoId, j.id), 'Tirado da edição')
  }
  return (
    <>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={() => setEdit(true)}><Pencil />Editar</Button>
        <Button variant="ghost" size="icon-sm" aria-label="Tirar da edição" disabled={pend} onClick={tirar}><Trash2 /></Button>
      </div>
      {edit && <JulgadoDialog edicaoId={edicaoId} julgado={j} item={item} disciplinas={disciplinas} onClose={() => setEdit(false)} />}
    </>
  )
}

export function ConferidoSwitch({ edicaoId, id, conferido }: { edicaoId: string; id: string; conferido: boolean }) {
  const { pend, rodar } = useAcao()
  return <Switch checked={conferido} disabled={pend} aria-label="Conferido" onCheckedChange={(v) => rodar(() => conferirJulgado(edicaoId, id, v), v ? 'Marcado como conferido' : 'Marcado como não conferido')} />
}

export function JulgadoDialog({ edicaoId, julgado, item, disciplinas, onClose }: { edicaoId: string; julgado?: JulgadoRow; item: string; disciplinas: string[]; onClose: () => void }) {
  const { pend, rodar } = useAcao()
  const [t, setT] = useState(julgado?.titulo ?? '')
  const [trib, setTrib] = useState(julgado?.tribunal ?? 'STF')
  const [org, setOrg] = useState(julgado?.orgao ?? '')
  const [disc, setDisc] = useState(julgado?.disciplina ?? '')
  const [selos, setSelos] = useState<string[]>(julgado?.selos ?? [])
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{julgado ? `Editar ${item}` : `Adicionar ${item}`}</DialogTitle></DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          <label className="block space-y-1 text-sm font-medium">Título<Textarea rows={2} value={t} onChange={(e) => setT(e.target.value)} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1 text-sm font-medium">Tribunal
              <select className="h-8 w-full rounded-md border bg-background px-2 text-sm" value={trib} onChange={(e) => setTrib(e.target.value)}>{['STF', 'STJ', 'TST', 'TSE', 'TCU'].map((x) => <option key={x}>{x}</option>)}</select>
            </label>
            <label className="block space-y-1 text-sm font-medium">Órgão<Input value={org} onChange={(e) => setOrg(e.target.value)} placeholder="Plenário" /></label>
          </div>
          <label className="block space-y-1 text-sm font-medium">Disciplina<Input list="jc-disc-lista" value={disc} onChange={(e) => setDisc(e.target.value)} /><datalist id="jc-disc-lista">{disciplinas.map((d) => <option key={d} value={d} />)}</datalist></label>
          <div className="space-y-1"><span className="text-sm font-medium">Selos</span>
            <div className="flex flex-wrap gap-1.5">
              {JC_SELOS.map((s) => {
                const on = selos.includes(s.k)
                return <button key={s.k} type="button" aria-pressed={on} onClick={() => setSelos(on ? selos.filter((x) => x !== s.k) : [...selos, s.k])} className={cn('rounded-md border px-1.5 py-0.5 text-[10px] font-semibold', on ? s.cls : 'border-dashed opacity-60')}>{s.n}</button>
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={pend} onClick={() => rodar(() => salvarJulgado(edicaoId, julgado?.id ?? null, { titulo: t, tribunal: trib, orgao: org, disciplina: disc, selos }), 'Salvo', onClose)}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AdicionarJulgadoBtn({ edicaoId, item, disciplinas }: { edicaoId: string; item: string; disciplinas: string[] }) {
  const [on, setOn] = useState(false)
  return <><Button size="sm" onClick={() => setOn(true)}><Plus />Adicionar {item}</Button>{on && <JulgadoDialog edicaoId={edicaoId} item={item} disciplinas={disciplinas} onClose={() => setOn(false)} />}</>
}

/** "Trocar o .docx" (aba Julgados) e vínculos de material (aba Material): escolhe/sobe pelo seletor da Biblioteca JurisClub. */
export function DocumentoBtn({ edicaoId, tenantId, modo, rotulo, categoria = 'jurisclub', variante = 'outline', icone = 'upload' }: {
  edicaoId: string; tenantId: string; modo: 'trocar' | 'leitura' | 'pdf' | 'questoes'; rotulo: string; categoria?: 'jurisclub' | 'conteudo'; variante?: 'outline' | 'default'; icone?: 'editar' | 'upload'
}) {
  const { pend, rodar } = useAcao()
  const [on, setOn] = useState(false)
  return (
    <>
      <Button variant={variante} size="sm" disabled={pend} onClick={() => setOn(true)}>{icone === 'editar' ? <Pencil /> : <FileUp />}{rotulo}</Button>
      <FilePicker open={on} onClose={() => setOn(false)} tenantId={tenantId} categoria={categoria} abaInicial="upload"
        onSelecionar={(r) => {
          if (r.tipo !== 'biblioteca' && r.tipo !== 'upload') return
          if (modo === 'trocar') rodar(() => trocarDocumento(edicaoId, r.documentoId), (x) => `Documento lido. ${x.novos} novos entram como não conferidos`)
          else rodar(() => vincularDocumento(edicaoId, modo, r.documentoId), 'Material atualizado')
        }} />
    </>
  )
}

// ───────────── questões ─────────────
export function QuestoesAcoes({ edicaoId, temQuestoes }: { edicaoId: string; temQuestoes: boolean }) {
  const { pend, rodar } = useAcao()
  const [on, setOn] = useState(false)
  const [txt, setTxt] = useState('')
  function enviar() {
    const qs: QuestaoDraft[] = []
    for (const l of txt.split('\n').map((x) => x.trim()).filter(Boolean)) {
      const [g, enun, disc, ass, com, nj] = l.split('|').map((x) => x.trim())
      const gab = (g ?? '').toUpperCase().startsWith('C') ? 'C' : (g ?? '').toUpperCase().startsWith('E') ? 'E' : null
      const n = Number(nj)
      if (gab && enun) qs.push({ enunciado: enun, gabarito: gab, disciplina: disc ?? '', assunto: ass ?? '', comentario: com ?? '', julgadoIdx: Number.isInteger(n) && n > 0 ? n : null })
    }
    if (!qs.length) { toast.error('Nenhuma linha válida. Use: C ou E | enunciado | disciplina | assunto | comentário'); return }
    rodar(() => adicionarQuestoes(edicaoId, qs), (r) => `${r.adicionadas} questões entraram`, () => { setOn(false); setTxt('') })
  }
  return (
    <>
      <div className="flex flex-wrap justify-end gap-2">
        {temQuestoes && <Button variant="outline" size="sm" disabled={pend} onClick={() => rodar(() => enviarQuestoesAoBanco(edicaoId), (r) => `Banco de Questões: ${r.criadas} criadas, ${r.jaExistiam} já existiam`)}>Mandar ao banco do simulado</Button>}
        <Button size="sm" onClick={() => setOn(true)}><Plus />{temQuestoes ? 'Adicionar questões' : 'Subir o caderno de questões'}</Button>
      </div>
      <Dialog open={on} onOpenChange={setOn}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Adicionar questões Certo/Errado</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Uma por linha: C ou E | enunciado | disciplina | assunto | comentário | nº do julgado (coluna Ordem, opcional)</p>
          <Textarea rows={8} value={txt} onChange={(e) => setTxt(e.target.value)} />
          <DialogFooter><Button variant="outline" onClick={() => setOn(false)}>Cancelar</Button><Button disabled={pend} onClick={enviar}>Adicionar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ───────────── estudantes ─────────────
export function EstudantesForm({ id, todos: t0, grupoIds: g0, grupos, pasta, totalTodos, alunosInicial }: { id: string; todos: boolean; grupoIds: string[]; grupos: { id: string; nome: string }[]; pasta: string; totalTodos: number; alunosInicial: number }) {
  const { pend, rodar } = useAcao()
  const [todos, setTodos] = useState(t0)
  const [sel, setSel] = useState<string[]>(g0)
  const [q, setQ] = useState('')
  const [alunos, setAlunos] = useState<number | null>(alunosInicial)
  const p = jcPasta(pasta)
  const vis = q ? grupos.filter((g) => g.nome.toLowerCase().includes(q.toLowerCase())) : grupos
  async function contar(ids: string[]) { if (!ids.length) { setAlunos(0); return } const r = await contarAlunosGrupos(ids); if (r.ok) setAlunos(r.total) }
  function alternar(gid: string) { const n = sel.includes(gid) ? sel.filter((x) => x !== gid) : [...sel, gid]; setSel(n); void contar(n) }
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3 text-sm"><Switch checked={todos} onCheckedChange={setTodos} aria-label="Todos com JurisClub" /><b>Liberar para todos os alunos com JurisClub</b></div>
      {!todos && (
        <div className="space-y-2">
          <span className="text-sm font-semibold">Grupos de acesso</span>
          <Input className="max-w-xs" placeholder="Buscar grupo" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex max-h-80 flex-wrap gap-2 overflow-y-auto">{vis.map((g) => <Chip key={g.id} on={sel.includes(g.id)} onClick={() => alternar(g.id)}>{g.nome}</Chip>)}</div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{`${(todos ? totalTodos : (alunos ?? 0)).toLocaleString('pt-BR')} alunos veem esta ${p.un.toLowerCase()}.`}</p>
      <Button disabled={pend} onClick={() => rodar(() => salvarQuemVe(id, todos, sel), 'Salvo. Vale a partir de agora')}><Check />Salvar quem vê</Button>
    </section>
  )
}

// ───────────── erratas ─────────────
export function ErrataForm({ edicaoId, julgados, item }: { edicaoId: string; julgados: { id: string; titulo: string }[]; item: string }) {
  const { pend, rodar } = useAcao()
  const [j, setJ] = useState(julgados[0]?.titulo ?? '')
  const [txt, setTxt] = useState('')
  const [avisar, setAvisar] = useState(true)
  return (
    <section className="space-y-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 shadow-sm">
      <h2 className="text-base font-semibold">Registrar errata</h2>
      <label className="block space-y-1 text-sm font-medium">{item === 'tema' ? 'Tema' : 'Julgado'}
        <select className="h-8 w-full rounded-md border bg-background px-2 text-sm" value={j} onChange={(e) => setJ(e.target.value)}>
          {julgados.map((x) => <option key={x.id} value={x.titulo}>{x.titulo}</option>)}
          <option value="">Edição inteira</option>
        </select>
      </label>
      <label className="block space-y-1 text-sm font-medium">O que mudou
        <Textarea rows={3} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Ex.: número do tema corrigido de 904 para 940" />
        <small className="block text-xs font-normal text-muted-foreground">Vai para a Central de Atualizações e aparece para o aluno em “Novidades da versão”.</small>
      </label>
      <div className="flex items-center gap-3 text-sm"><Switch checked={avisar} onCheckedChange={setAvisar} />Avisar quem já leu</div>
      <Button disabled={pend} onClick={() => { if (!txt.trim()) { toast.error('Escreva o que mudou'); return } rodar(() => registrarErrata(edicaoId, { julgadoTitulo: j, texto: txt, avisar }), avisar ? 'Errata publicada. Quem já leu foi avisado' : 'Errata publicada', () => setTxt('')) }}><Check />Publicar errata</Button>
    </section>
  )
}

// ───────────── configurações ─────────────
export function ConfigForm({ e }: { e: { id: string; pasta: string; titulo: string; cor: string; imagem_url: string | null; ordem_julgados: 'doc' | 'disc' | 'trib'; filtros: string[]; versao: 'ambos' | 'ess' | 'comp' } }) {
  const { pend, rodar } = useAcao()
  const router = useRouter()
  const [t, setT] = useState(e.titulo)
  const [cor, setCor] = useState(e.cor)
  const [img, setImg] = useState<string | null>(e.imagem_url)
  const [ord, setOrd] = useState(e.ordem_julgados)
  const [fil, setFil] = useState<string[]>(e.filtros)
  const [ver, setVer] = useState(e.versao)
  const p = jcPasta(e.pasta)
  const card = 'space-y-4 rounded-2xl border bg-card p-4 shadow-sm'
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0 space-y-4">
        <section className={card}>
          <h2 className="text-base font-semibold">Aparência do card</h2>
          <label className="block space-y-1 text-sm font-semibold">Nome<Input value={t} onChange={(x) => setT(x.target.value)} /></label>
          <div className="space-y-1.5"><span className="text-sm font-semibold">Cor</span>
            <div className="flex flex-wrap gap-2">{JC_COR.map((c) => <button key={c} type="button" aria-label={`Cor ${c}`} onClick={() => setCor(c)} style={{ background: c }} className={cn('size-8 rounded-full border-2 border-transparent ring-offset-2 ring-offset-background', cor === c && 'ring-2 ring-primary')} />)}</div>
          </div>
          <CampoImagem value={img} onChange={setImg} aspecto="21 / 5" compacto textoVazio="Trocar imagem do card" />
        </section>
        <section className={card}>
          <h2 className="text-base font-semibold">Como o aluno navega</h2>
          <div className="space-y-1.5"><span className="text-sm font-semibold">Ordem dos {p.item}</span><div className="flex flex-wrap gap-2">{JC_ORDENS.map((o) => <Chip key={o.v} on={ord === o.v} onClick={() => setOrd(o.v)}>{o.n}</Chip>)}</div></div>
          <div className="space-y-1.5"><span className="text-sm font-semibold">Filtros que aparecem para o aluno</span><div className="flex flex-wrap gap-2">{JC_FILTROS_ALUNO.map((f) => <Chip key={f} on={fil.includes(f)} onClick={() => setFil(fil.includes(f) ? fil.filter((x) => x !== f) : [...fil, f])}>{f}</Chip>)}</div></div>
          <div className="space-y-1.5"><span className="text-sm font-semibold">Versão</span><div className="flex flex-wrap gap-2">{JC_VERSOES.map((o) => <Chip key={o.v} on={ver === o.v} onClick={() => setVer(o.v)}>{o.n}</Chip>)}</div></div>
        </section>
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">Aqui nada é salvo sozinho. As mudanças só valem para os alunos depois de “Salvar alterações”.</div>
        <div className="flex gap-2">
          <Button disabled={pend} onClick={() => rodar(() => salvarConfiguracoes(e.id, { titulo: t, cor, imagem: img, ordem: ord, filtros: fil, versao: ver }), 'Alterações salvas')}><Check />Salvar alterações</Button>
          <Button variant="outline" onClick={() => { setT(e.titulo); setCor(e.cor); setImg(e.imagem_url); setOrd(e.ordem_julgados); setFil(e.filtros); setVer(e.versao); toast('Alterações descartadas'); router.refresh() }}>Descartar</Button>
        </div>
      </div>
      <aside className="space-y-2 xl:sticky xl:top-4 xl:self-start">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prévia do card</div>
        <JcTicket cor={cor} imagem={img} nome={t} pasta={p} />
      </aside>
    </div>
  )
}
