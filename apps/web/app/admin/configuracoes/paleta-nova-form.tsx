'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, RotateCcw, Wand2, ShieldCheck, Users, Globe, PowerOff, AlertTriangle, CheckCircle2, Mail, Plus, X } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { confirmar } from '@/components/ui/confirm-dialog'
import {
  lerPaletaNova, padraoDoDesigner, auditarContraste, hexValido, textoSobre, PALETA_REVISAO, ROTULOS_CORES,
  type CoresPaleta, type ModoPaleta, type PaletaNova,
} from '@/lib/brand/paleta-nova'

type Tema = 'claro' | 'escuro'

const MODOS: Array<{ id: ModoPaleta; titulo: string; texto: string; icon: typeof PowerOff }> = [
  { id: 'desligada', titulo: 'Desligada', texto: 'Todos veem as cores atuais. Nada muda.', icon: PowerOff },
  { id: 'workspace', titulo: 'Só Workspace (teste)', texto: 'Só a equipe do Workspace vê a paleta nova — teste seguro antes de liberar.', icon: Users },
  { id: 'todos', titulo: 'Todos', texto: 'Admin e alunos veem a paleta nova. Para reverter, volte para “Desligada”.', icon: Globe },
]

const GRUPOS: Array<{ titulo: string; chaves: Array<keyof CoresPaleta> }> = [
  { titulo: 'Marca', chaves: ['roxo', 'onRoxo', 'dourado', 'lilas'] },
  { titulo: 'Superfícies', chaves: ['fundo', 'cartao', 'fundo2', 'alterado'] },
  { titulo: 'Texto e linhas', chaves: ['texto', 'apoio', 'linha'] },
  { titulo: 'Status', chaves: ['okTexto', 'okFundo', 'errTexto', 'errFundo', 'avisoTexto', 'avisoFundo', 'propTexto', 'propFundo'] },
]

// Módulo-level (não dentro do componente) para não remontar a cada tecla e perder o foco.
function CampoCor({ rotulo, valor, onChange }: { rotulo: string; valor: string; onChange: (v: string) => void }) {
  const valido = hexValido(valor)
  return (
    <label className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5">
      <input type="color" value={valido ? valor : '#000000'} onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="h-7 w-7 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0" aria-label={rotulo} />
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={rotulo}>{rotulo}</span>
      <input value={valor} onChange={(e) => onChange(e.target.value.toUpperCase())} maxLength={7} spellCheck={false}
        className={`w-[4.9rem] rounded-md border bg-background px-1.5 py-0.5 font-mono text-xs ${valido ? '' : 'border-destructive text-destructive'}`} />
    </label>
  )
}

function Chip({ t, f, txt }: { t: string; f: string; txt: string }) {
  return <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: t, background: f }}>{txt}</span>
}

/** Pré-visualização: aplica as cores direto (sem depender do css global) num mini painel. */
function Previa({ c }: { c: CoresPaleta }) {
  return (
    <div className="overflow-hidden rounded-xl border" style={{ background: c.fundo, borderColor: c.linha, color: c.texto }}>
      <div className="flex items-center justify-between px-3 py-2" style={{ background: c.roxo, color: c.onRoxo }}>
        <span className="text-xs font-bold tracking-wide">Revisão · Admin</span>
        <span className="rounded-md px-2 py-0.5 text-[11px] font-semibold" style={{ background: c.dourado, color: textoSobre(c.dourado, '#FFFFFF', c.roxo) }}>Aba ativa</span>
      </div>
      <div className="space-y-2.5 p-3">
        <div className="rounded-lg border p-3" style={{ background: c.cartao, borderColor: c.linha }}>
          <p className="text-sm font-bold">Catálogo de metas</p>
          <p className="mt-0.5 text-xs" style={{ color: c.apoio }}>Texto de apoio abaixo do título da seção.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-md px-2.5 py-1 text-xs font-semibold" style={{ background: c.lilas, color: textoSobre(c.lilas, '#FFFFFF', c.cartao) }}>Incluir material</span>
            <span className="text-xs font-semibold underline" style={{ color: c.lilas }}>Ver detalhes</span>
            <span className="rounded-md px-2 py-0.5 text-xs" style={{ background: c.alterado }}>Campo alterado</span>
          </div>
        </div>
        <div className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: c.fundo2, color: c.apoio }}>Cabeçalho de tabela</div>
        <div className="flex flex-wrap gap-1.5">
          <Chip t={c.okTexto} f={c.okFundo} txt="Cadastrado" />
          <Chip t={c.errTexto} f={c.errFundo} txt="Falta material" />
          <Chip t={c.avisoTexto} f={c.avisoFundo} txt="Confirmar" />
          <Chip t={c.propTexto} f={c.propFundo} txt="Proposta" />
        </div>
      </div>
    </div>
  )
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Lista de e-mails de teste (Workspace): mesmo campo `tema.testadores_globais` usado pelo Workspace do admin. Salva na hora. */
function EmailsTeste({ inicial, salvarTema }: { inicial: string[]; salvarTema: (t: Record<string, unknown>) => Promise<{ ok?: boolean } | void> }) {
  const [emails, setEmails] = useState<string[]>(inicial)
  const [novo, setNovo] = useState('')
  const [pending, start] = useTransition()

  function persistir(lista: string[], msg: string) {
    const anterior = emails
    setEmails(lista)
    start(async () => {
      try { await salvarTema({ testadores_globais: lista }); toast.success(msg) }
      catch (err) { setEmails(anterior); toast.error(err instanceof Error ? err.message : 'Erro ao salvar') }
    })
  }
  function adicionar() {
    // aceita vários de uma vez (vírgula, ponto e vírgula, espaço ou quebra de linha)
    const novos = novo.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean)
    if (!novos.length) return
    const invalidos = novos.filter((e) => !EMAIL_RE.test(e))
    if (invalidos.length) { toast.error(`E-mail inválido: ${invalidos[0]}`); return }
    const lista = [...new Set([...emails, ...novos])].sort()
    setNovo('')
    persistir(lista, novos.length > 1 ? `${novos.length} e-mails adicionados ao Workspace.` : 'E-mail adicionado ao Workspace.')
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold"><Users className="h-4 w-4" /> Quem testa (Workspace)</h3>
        <p className="text-xs text-muted-foreground">
          No modo “Só Workspace”, só estes e-mails veem a paleta nova (admin e aluno). É a mesma lista do Workspace em
          <span className="font-medium text-foreground"> Admin → Sistema → Workspace</span>, onde também dá para liberar por grupo. Quem está na lista também fica fora de ranking e estatística.
        </p>
      </div>
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionar() } }}
              placeholder="email@exemplo.com (pode colar vários, separados por vírgula)" aria-label="Adicionar e-mail ao Workspace"
              className="h-9 w-full rounded-lg border bg-background pl-8 pr-2 text-sm" />
          </div>
          <button type="button" onClick={adicionar} disabled={pending || !novo.trim()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar
          </button>
        </div>
        {emails.length === 0
          ? <p className="mt-3 rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">Nenhum e-mail ainda. Adicione o seu para testar a paleta no modo “Só Workspace”.</p>
          : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {emails.map((e) => (
                <li key={e} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 py-1 pl-3 pr-1 text-xs">
                  {e}
                  <button type="button" disabled={pending} onClick={() => persistir(emails.filter((x) => x !== e), 'E-mail removido do Workspace.')}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40" aria-label={`Remover ${e}`}><X className="h-3 w-3" /></button>
                </li>
              ))}
            </ul>
          )}
      </div>
    </section>
  )
}

export function PaletaNovaForm({ tema, salvarTema }: { tema: any; salvarTema: (t: Record<string, unknown>) => Promise<{ ok?: boolean } | void> }) {
  const inicial = useMemo(() => lerPaletaNova(tema), [tema])
  const [p, setP] = useState<PaletaNova>(inicial)
  const [salvo, setSalvo] = useState<PaletaNova>(inicial)
  const [vis, setVis] = useState<Tema>('claro')
  const [pending, start] = useTransition()
  const alterado = JSON.stringify([p.claro, p.escuro]) !== JSON.stringify([salvo.claro, salvo.escuro])
  const cores = p[vis]
  const auditoria = useMemo(() => auditarContraste(p).filter((a) => !a.ok), [p])
  const invalidas = [...Object.values(p.claro), ...Object.values(p.escuro)].some((v) => !hexValido(v))

  function setCor(k: keyof CoresPaleta, v: string) { setP((x) => ({ ...x, [vis]: { ...x[vis], [k]: v } })) }

  function persistir(proximo: PaletaNova, msg: string) {
    start(async () => {
      try {
        await salvarTema({ paleta_nova: { modo: proximo.modo, familia: proximo.familia, claro: proximo.claro, escuro: proximo.escuro } })
        setSalvo(proximo)
        toast.success(msg)
      } catch (err) { toast.error(err instanceof Error ? err.message : 'Erro ao salvar') }
    })
  }

  async function trocarModo(m: ModoPaleta) {
    if (m === p.modo) return
    if (alterado || invalidas) { toast.error('Salve (ou descarte) as cores antes de trocar o modo.'); return }
    if (m === 'todos') {
      const sim = await confirmar({ titulo: 'Liberar a paleta nova para todos?', mensagem: 'Admin e alunos passam a ver as novas cores (cache de até 1 min). Você pode voltar para “Desligada” a qualquer momento.', confirmar: 'Liberar para todos', destrutivo: false })
      if (!sim) return
    }
    const prox = { ...p, modo: m }
    setP(prox)
    persistir(prox, m === 'desligada' ? 'Paleta nova desligada — cores atuais restauradas.' : m === 'workspace' ? 'Paleta nova ativa só para o Workspace.' : 'Paleta nova liberada para todos.')
  }

  function aplicarRevisao() { setP((x) => ({ ...x, familia: PALETA_REVISAO.familia, claro: { ...PALETA_REVISAO.claro }, escuro: { ...PALETA_REVISAO.escuro } })) }
  function derivarDoDesigner() {
    const d = padraoDoDesigner({ cores: tema?.cores, cores_dark: tema?.cores_dark })
    setP((x) => ({ ...x, familia: d.familia, claro: d.claro, escuro: d.escuro }))
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Estado da paleta nova</h3>
          <p className="text-xs text-muted-foreground">
            Interruptor de segurança. “Só Workspace” usa a lista de e-mails e grupos de <span className="font-medium text-foreground">Admin → Sistema → Workspace</span>.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {MODOS.map((m) => {
            const ativo = p.modo === m.id
            return (
              <button key={m.id} type="button" disabled={pending} onClick={() => trocarModo(m.id)}
                className={`flex items-start gap-3 rounded-2xl border p-4 text-left shadow-sm transition-colors disabled:opacity-60 ${ativo ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card hover:bg-muted/40'}`}>
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${ativo ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}><m.icon className="h-4 w-4" /></span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">{m.titulo}{ativo && salvo.modo === m.id && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{m.texto}</span>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <EmailsTeste inicial={Array.isArray(tema?.testadores_globais) ? (tema.testadores_globais as string[]) : []} salvarTema={salvarTema} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Cores</h3>
            <p className="text-xs text-muted-foreground">Edite as duas paletas (claro e escuro). Tokens, status e componentes de admin e aluno seguem estes valores.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={aplicarRevisao} className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"><RotateCcw className="h-3.5 w-3.5" /> Paleta da planilha (Revisão)</button>
            <button type="button" onClick={derivarDoDesigner} className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"><Wand2 className="h-3.5 w-3.5" /> Derivar do designer atual</button>
          </div>
        </div>

        <Tabs value={vis} onValueChange={(v) => setVis(v as Tema)}>
          <TabsList variant="line" className="gap-4">
            <TabsTrigger value="claro">Tema claro</TabsTrigger>
            <TabsTrigger value="escuro">Tema escuro</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-4">
            {GRUPOS.map((g) => (
              <div key={g.titulo} className="rounded-2xl border bg-card p-4 shadow-sm">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.titulo}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {g.chaves.map((k) => <CampoCor key={k} rotulo={ROTULOS_CORES[k]} valor={cores[k]} onChange={(v) => setCor(k, v)} />)}
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
            <Previa c={cores} />
            <div className="rounded-2xl border bg-card p-3 text-xs shadow-sm">
              <p className="mb-1.5 flex items-center gap-1.5 font-semibold"><ShieldCheck className="h-3.5 w-3.5" /> Contraste (WCAG)</p>
              {auditoria.length === 0
                ? <p className="text-muted-foreground">Todos os pares críticos passam.</p>
                : auditoria.map((a) => (
                  <p key={a.tema + a.par} className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400"><AlertTriangle className="h-3 w-3 shrink-0" /> {a.tema === 'claro' ? 'Claro' : 'Escuro'} · {a.par}: {a.razao}:1</p>
                ))}
            </div>
          </div>
        </div>

        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/95 px-4 py-3 shadow-lg backdrop-blur">
          <span className="text-xs text-muted-foreground">{invalidas ? 'Há cores inválidas (use #RRGGBB).' : alterado ? 'Alterações não salvas.' : 'Paleta salva.'}</span>
          <div className="flex gap-2">
            <button type="button" disabled={!alterado || pending} onClick={() => setP({ ...salvo })} className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-40">Descartar</button>
            <button type="button" disabled={!alterado || invalidas || pending} onClick={() => persistir(p, 'Paleta salva. Vale conforme o modo escolhido.')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar paleta
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
