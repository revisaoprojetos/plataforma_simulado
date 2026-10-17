'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Plus, Loader2, FlaskConical, ExternalLink, Upload, Wand2, LayoutTemplate } from 'lucide-react'
import { cn } from '@/lib/utils'

type Engine = 'collabora' | 'onlyoffice'
type Doc = { id: string; atualizadoEm: number }
type Modelo = { key: string; nome: string; descricao: string }

const ENGINES: { key: Engine; nome: string; sub: string; destaque?: boolean }[] = [
  { key: 'collabora', nome: 'Collabora Online (CODE)', sub: 'LibreOffice real · mesma engine do PDF · licença MPL (grátis)', destaque: true },
  { key: 'onlyoffice', nome: 'OnlyOffice (Community)', sub: 'Maior fidelidade com MS Word · licença AGPL (grátis)' },
]

export function TesteEditoresClient() {
  const router = useRouter()
  const [docs, setDocs] = useState<Doc[]>([])
  const [pend, start] = useTransition()
  const [criandoEm, setCriandoEm] = useState<Engine | null>(null)
  const [importEngine, setImportEngine] = useState<Engine>('collabora')
  const [importErro, setImportErro] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [modelos, setModelos] = useState<Modelo[]>([])
  const [usandoModelo, setUsandoModelo] = useState<string | null>(null)
  const [modeloEngine, setModeloEngine] = useState<Engine>('onlyoffice')

  const carregar = () => fetch('/api/teste/docs').then((r) => r.json()).then((d) => setDocs(d.docs ?? [])).catch(() => {})
  useEffect(() => {
    carregar()
    fetch('/api/teste/modelos').then((r) => r.json()).then((d) => setModelos(d.modelos ?? [])).catch(() => {})
  }, [])

  const usarModelo = (key: string) => {
    setUsandoModelo(key)
    start(async () => {
      try {
        const r = await fetch('/api/teste/modelos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ modelo: key }) })
        const d = await r.json()
        if (d.id) router.push(`/admin/teste/${modeloEngine}/${d.id}`)
      } finally { setUsandoModelo(null) }
    })
  }

  const [merge, setMerge] = useState<{ template?: string; preenchido?: string; aluno?: string; disciplinas?: number; pilares?: number; error?: string } | null>(null)
  const [gerandoMerge, setGerandoMerge] = useState(false)
  const gerarMerge = () => {
    setGerandoMerge(true); setMerge(null)
    start(async () => {
      try {
        const r = await fetch('/api/teste/seed-merge', { method: 'POST' })
        setMerge(await r.json())
        carregar()
      } finally { setGerandoMerge(false) }
    })
  }

  const importar = (file: File) => {
    setImportErro(null)
    start(async () => {
      const fd = new FormData(); fd.append('file', file)
      const r = await fetch('/api/teste/docs/upload', { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setImportErro(d?.error ?? 'Falha ao importar.'); return }
      router.push(`/admin/teste/${importEngine}/${d.id}`)
    })
  }

  const criarEabrir = (engine: Engine) => {
    setCriandoEm(engine)
    start(async () => {
      try {
        const r = await fetch('/api/teste/docs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ titulo: 'Documento de teste' }) })
        const { id } = await r.json()
        router.push(`/admin/teste/${engine}/${id}`)
      } finally { setCriandoEm(null) }
    })
  }

  return (
    <div className="space-y-6">
      {/* Cards dos dois editores — criar documento → abre o editor */}
      <div className="grid gap-4 sm:grid-cols-2">
        {ENGINES.map((e) => (
          <div key={e.key} className={cn('flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm', e.destaque && 'border-primary/40 ring-1 ring-primary/20')}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><FlaskConical className="h-5 w-5" /></span>
                <div>
                  <p className="text-sm font-semibold leading-tight">{e.nome}</p>
                  <p className="text-xs text-muted-foreground">{e.sub}</p>
                </div>
              </div>
              {e.destaque && <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">RECOMENDADO</span>}
            </div>
            <button type="button" onClick={() => criarEabrir(e.key)} disabled={pend}
              className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60">
              {criandoEm === e.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar documento e abrir
            </button>
          </div>
        ))}
      </div>

      {/* Modelos prontos — design + variáveis já montados; clicar cria um doc e abre no editor */}
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold"><LayoutTemplate className="h-4 w-4 text-primary" /> Modelos prontos</p>
          <select value={modeloEngine} onChange={(e) => setModeloEngine(e.target.value as Engine)} className="h-9 rounded-lg border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
            <option value="onlyoffice">Abrir no OnlyOffice</option>
            <option value="collabora">Abrir no Collabora</option>
          </select>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">Blocos editáveis já com <b>design + variáveis</b> (e laços). O coordenador escolhe um modelo, ajusta o que quiser e no merge as tags viram os dados reais.</p>
        {modelos.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">Carregando modelos…</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {modelos.map((m) => (
              <div key={m.key} className="flex flex-col gap-2 rounded-xl border bg-background p-4">
                <p className="flex items-center gap-2 text-sm font-semibold"><LayoutTemplate className="h-4 w-4 text-primary" /> {m.nome}</p>
                <p className="flex-1 text-xs leading-snug text-muted-foreground">{m.descricao}</p>
                <button type="button" onClick={() => usarModelo(m.key)} disabled={pend}
                  className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60">
                  {usandoModelo === m.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Usar modelo
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Prova do MERGE: gera template (tags+laços) + preenchido com 1 aluno real do banco do Simulado 1 */}
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 shadow-sm">
        <p className="mb-1 flex items-center gap-2 text-sm font-semibold"><Wand2 className="h-4 w-4 text-primary" /> Prova do merge (variáveis + laços)</p>
        <p className="mb-3 text-xs text-muted-foreground">Cria um <b>template</b> com tags (<code>{'{acertos}'}</code>, <code>{'{#disciplinas}…{/disciplinas}'}</code>) e gera o <b>preenchido</b> com os dados reais de 1 aluno do Simulado 1. Abra os dois e compare.</p>
        <button type="button" onClick={gerarMerge} disabled={pend}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60">
          {gerandoMerge ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Gerar template + preenchido
        </button>
        {merge?.error && <p className="mt-2 text-xs text-destructive">{merge.error}</p>}
        {merge?.preenchido && (
          <div className="mt-3 space-y-2 text-xs">
            <p className="text-muted-foreground">Aluno: <b className="text-foreground">{merge.aluno}</b> · {merge.disciplinas} disciplinas · {merge.pilares} pilares</p>
            <div className="flex flex-wrap gap-2">
              <span className="font-medium">Template (com tags):</span>
              <a href={`/admin/teste/collabora/${merge.template}`} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 hover:bg-muted">Collabora <ExternalLink className="h-3 w-3" /></a>
              <a href={`/admin/teste/onlyoffice/${merge.template}`} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 hover:bg-muted">OnlyOffice <ExternalLink className="h-3 w-3" /></a>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="font-medium text-primary">Preenchido (dados reais):</span>
              <a href={`/admin/teste/collabora/${merge.preenchido}`} className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-2.5 py-1 hover:bg-primary/5">Collabora <ExternalLink className="h-3 w-3" /></a>
              <a href={`/admin/teste/onlyoffice/${merge.preenchido}`} className="inline-flex items-center gap-1 rounded-lg border border-primary/40 px-2.5 py-1 hover:bg-primary/5">OnlyOffice <ExternalLink className="h-3 w-3" /></a>
            </div>
          </div>
        )}
      </div>

      {/* Importar um .docx (Word) existente → abre no editor escolhido */}
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <p className="mb-1 flex items-center gap-2 text-sm font-semibold"><Upload className="h-4 w-4 text-primary" /> Importar documento (.docx)</p>
        <p className="mb-3 text-xs text-muted-foreground">Traga um Word real pra testar a fidelidade de import/export. PDF e .doc não entram (PDF não é editável como Word).</p>
        <div className="flex flex-wrap items-center gap-2">
          <select value={importEngine} onChange={(e) => setImportEngine(e.target.value as Engine)} className="h-9 rounded-lg border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
            <option value="collabora">Abrir no Collabora</option>
            <option value="onlyoffice">Abrir no OnlyOffice</option>
          </select>
          <input ref={fileRef} type="file" accept=".docx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importar(f); e.currentTarget.value = '' }} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={pend}
            className="inline-flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium shadow-sm transition hover:bg-muted disabled:opacity-60">
            {pend ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Escolher .docx e abrir
          </button>
        </div>
        {importErro && <p className="mt-2 text-xs text-destructive">{importErro}</p>}
      </div>

      {/* Documentos de teste existentes (abrir em qualquer engine) */}
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">Documentos de teste</p>
          <button type="button" onClick={carregar} className="text-xs text-primary hover:underline">Atualizar</button>
        </div>
        {docs.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">Nenhum documento ainda — crie um acima.</p>
        ) : (
          <ul className="divide-y">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono text-xs">{d.id}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <a href={`/admin/teste/collabora/${d.id}`} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition hover:bg-muted">Collabora <ExternalLink className="h-3 w-3" /></a>
                  <a href={`/admin/teste/onlyoffice/${d.id}`} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition hover:bg-muted">OnlyOffice <ExternalLink className="h-3 w-3" /></a>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Instruções de infra (spike local) */}
      <details className="rounded-2xl border bg-muted/30 p-4 text-sm">
        <summary className="cursor-pointer font-semibold">Como ligar os editores (Docker local)</summary>
        <div className="mt-3 space-y-2 text-xs text-muted-foreground">
          <p>Na raiz do repo: <code className="rounded bg-background px-1 py-0.5">docker compose -f docker-compose.teste.yml up -d</code></p>
          <p>No <code className="rounded bg-background px-1 py-0.5">apps/web/.env.local</code> adicione (valores padrão do compose):</p>
          <pre className="overflow-x-auto rounded-lg bg-background p-3">{`NEXT_PUBLIC_COLLABORA_URL=http://localhost:9980
NEXT_PUBLIC_ONLYOFFICE_URL=http://localhost:8082
TESTE_WOPI_HOST=http://host.docker.internal:3000`}</pre>
          <p>Reinicie o <code className="rounded bg-background px-1 py-0.5">pnpm dev</code> e clique em “Criar documento e abrir”.</p>
        </div>
      </details>
    </div>
  )
}
