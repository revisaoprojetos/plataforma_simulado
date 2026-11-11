'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Loader2, Upload, Users, X, ArrowUp, ArrowDown } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { BLOCOS_HOME_PADRAO, MENU_ALUNO, contrasteHex, type AparenciaDados } from '@/lib/admin/revisao/aparencia-tipos'
import { salvarAparenciaRevisaoAction } from './actions'

// Tela "Aparência da plataforma": marca (logo/ícone/imagem de login + 2 cores), menu do aluno (liga/desliga por
// item) e ordem dos blocos da Início. Estado local até "Salvar aparência"; a prévia reage ao vivo.
// Upload via /api/admin/imagem (multipart) → só URLs vão para a server action.

function Imagem({ rotulo, dica, url, onUrl, escuro, cor }: { rotulo: string; dica: string; url: string | null; onUrl: (u: string | null) => void; escuro?: boolean; cor?: string | null }) {
  const [subindo, setSubindo] = useState(false)
  async function enviar(f: File | undefined) {
    if (!f) return
    setSubindo(true)
    try {
      const fd = new FormData(); fd.append('file', f)
      const r = await fetch('/api/admin/imagem', { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j?.url) throw new Error(j?.error || 'Falha no envio.')
      onUrl(j.url as string)
    } catch (e) { toast.error((e as Error).message || 'Não foi possível enviar a imagem.') }
    finally { setSubindo(false) }
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed p-2.5 text-center">
      <label className="relative block cursor-pointer">
        <input type="file" accept="image/*" hidden onChange={(e) => { void enviar(e.target.files?.[0]); e.target.value = '' }} />
        <span className={cn('flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-muted', escuro && 'bg-primary')} style={escuro && cor ? { background: cor } : undefined}>
          {subindo ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={url} alt={rotulo} className={cn('max-h-full max-w-[70%] object-contain', !escuro && 'max-w-full')} />
            : <Upload className="h-5 w-5 text-muted-foreground" />}
        </span>
      </label>
      <b className="text-xs">{rotulo}</b>
      <span className="text-[11px] text-muted-foreground">{dica}</span>
      {url && <button type="button" onClick={() => onUrl(null)} className="mx-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"><X className="h-3 w-3" />Remover</button>}
    </div>
  )
}

export function AparenciaForm({ inicial, podeEditar }: { inicial: AparenciaDados; podeEditar: boolean }) {
  const router = useRouter()
  const [pend, start] = useTransition()
  const [logo, setLogo] = useState(inicial.logoUrl)
  const [favicon, setFavicon] = useState(inicial.faviconUrl)
  const [login, setLogin] = useState(inicial.loginImagemUrl)
  const [c1, setC1] = useState(inicial.corPrimaria)
  const [c2, setC2] = useState(inicial.corAccent)
  const [ocultos, setOcultos] = useState<string[]>(inicial.ocultos)
  const [blocos, setBlocos] = useState<string[]>(inicial.blocos)

  const alternar = (href: string) => setOcultos((o) => (o.includes(href) ? o.filter((h) => h !== href) : [...o, href]))
  const mover = (i: number, d: -1 | 1) => setBlocos((b) => { const n = [...b]; const j = i + d; if (j < 0 || j >= n.length) return b; [n[i], n[j]] = [n[j], n[i]]; return n })
  const nomeBloco = (id: string) => BLOCOS_HOME_PADRAO.find((b) => b.id === id)?.nome ?? id

  function salvar() {
    start(async () => {
      const r = await salvarAparenciaRevisaoAction({ logoUrl: logo, faviconUrl: favicon, loginImagemUrl: login, corPrimaria: c1, corAccent: c2, ocultos, blocos })
      if (!r.ok) { toast.error(r.error ?? 'Erro ao salvar.'); return }
      toast.success('Alterações salvas')
      router.refresh()
    })
  }

  const fundoMenu = c1 ?? undefined
  const textoMenu = c1 ? contrasteHex(c1) : undefined
  const grupos: Record<string, string> = {}
  MENU_ALUNO.forEach((m, i) => { if (m.grupo && MENU_ALUNO[i - 1]?.grupo !== m.grupo) grupos[m.href] = m.grupo })

  return (
    <fieldset disabled={!podeEditar || pend} className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <section className="rounded-2xl border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Marca</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Imagem rotulo="Logo no menu" dica="PNG branco, fundo transparente" url={logo} onUrl={setLogo} escuro cor={c1} />
            <Imagem rotulo="Ícone do app" dica="512 × 512" url={favicon} onUrl={setFavicon} />
            <Imagem rotulo="Imagem de login" dica="1600 × 900" url={login} onUrl={setLogin} />
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="color" value={c1 ?? '#471e6c'} onChange={(e) => setC1(e.target.value)} className="h-8 w-10 cursor-pointer rounded-md border bg-background p-0.5" aria-label="Cor principal" />
              Roxo do menu e dos botões
              {c1 && <button type="button" onClick={() => setC1(null)} className="text-[11px] text-muted-foreground underline">usar padrão</button>}
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="color" value={c2 ?? '#d9a521'} onChange={(e) => setC2(e.target.value)} className="h-8 w-10 cursor-pointer rounded-md border bg-background p-0.5" aria-label="Cor de destaque" />
              Dourado dos ícones e do item ativo
              {c2 && <button type="button" onClick={() => setC2(null)} className="text-[11px] text-muted-foreground underline">usar padrão</button>}
            </label>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Fonte da marca: {inicial.fonte ?? 'Plus Jakarta Sans'}, nos títulos e nos textos.</p>
        </section>

        <section className="overflow-hidden rounded-2xl border bg-card">
          <div className="flex items-center gap-3 border-b px-4 py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-primary/10 text-primary"><Users className="h-4 w-4" /></span>
            <div><h2 className="text-sm font-semibold">Menu do aluno</h2><p className="text-[11px] text-muted-foreground">Desligue para esconder um item de todos os alunos</p></div>
          </div>
          <div className="divide-y px-4">
            {MENU_ALUNO.map((m) => {
              const on = !ocultos.includes(m.href)
              return (
                <label key={m.href} className="flex cursor-pointer items-center gap-3 py-2.5 text-sm">
                  <Switch checked={on} onCheckedChange={() => alternar(m.href)} aria-label={m.nome} />
                  <span>{m.nome}</span>
                  <span className="flex-1" />
                  {m.nome === 'Comunidade' && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">fora do lançamento</span>}
                </label>
              )
            })}
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-4">
          <h2 className="mb-1 text-sm font-semibold">Ordem dos blocos do Início</h2>
          <p className="mb-3 text-[11px] text-muted-foreground">A ordem fica salva na plataforma; a Início do aluno passa a seguir esta ordem quando for conectada.</p>
          <div className="space-y-2">
            {blocos.map((id, i) => (
              <div key={id} className="flex items-center gap-3 rounded-xl border bg-background py-2 pl-0 pr-3">
                <span className="ml-0 h-8 w-1.5 rounded-r bg-primary/30" />
                <b className="flex-1 text-sm">{i + 1}. {nomeBloco(id)}</b>
                <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir" className="inline-flex h-7 w-7 items-center justify-center rounded-lg border hover:bg-muted disabled:opacity-40"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => mover(i, 1)} disabled={i === blocos.length - 1} aria-label="Descer" className="inline-flex h-7 w-7 items-center justify-center rounded-lg border hover:bg-muted disabled:opacity-40"><ArrowDown className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        </section>

        <div>
          <button type="button" onClick={salvar} disabled={!podeEditar || pend} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50">
            {pend ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Salvar aparência
          </button>
          {!podeEditar && <p className="mt-2 text-xs text-muted-foreground">Você pode ver, mas não editar (precisa da permissão de gerenciar configurações).</p>}
        </div>
      </div>

      <aside className="min-w-0 xl:sticky xl:top-4 xl:self-start">
        <div className="mb-2 text-xs text-muted-foreground">Prévia do menu do aluno</div>
        <div className={cn('rounded-2xl p-3 shadow-sm', !fundoMenu && 'bg-primary text-primary-foreground')} style={fundoMenu ? { background: fundoMenu, color: textoMenu } : undefined}>
          {logo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={logo} alt="" className="mx-2 mb-3 mt-1 h-7 w-auto max-w-[80%] object-contain object-left" />
            : <div className="mx-2 mb-3 mt-1 text-sm font-bold">{inicial.nomeSite ?? 'Revisão'}</div>}
          {MENU_ALUNO.map((m) => (
            <div key={m.href}>
              {grupos[m.href] && <div className="mx-2 mb-1 mt-3 text-[9px] font-bold tracking-[0.14em] opacity-60">{grupos[m.href]}</div>}
              <div className={cn('rounded-lg px-2 py-1.5 text-[13px] font-semibold', ocultos.includes(m.href) && 'line-through opacity-40')}>{m.nome}</div>
            </div>
          ))}
        </div>
      </aside>
    </fieldset>
  )
}
