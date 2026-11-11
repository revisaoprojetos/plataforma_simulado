'use client'

import { useMemo, useState } from 'react'
import { Check, Search, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { confirmar } from '@/components/ui/confirm-dialog'
import { CampoImagem } from '@/components/admin/campo-imagem'
import { POP_FREQ, POP_QUANDO } from '@/lib/revisao/cursos-defs'
import type { PopupRow } from '@/lib/revisao/cursos'
import { alternarPopupAction, criarPopupAction, excluirPopupAction } from '../actions'
import { Campo, inputCls, textareaCls, useAcao } from '../ui-cursos'

const brData = (d: string | null) => (d ? d.split('-').reverse().join('/') : '')

export function AbaPop({ cursoId, c1, c2, galeria, popups, podeEditar }: {
  cursoId: string; c1: string; c2: string; galeria: string[]; popups: PopupRow[]; podeEditar: boolean
}) {
  const [pendente, executar] = useAcao()
  const vazio = { titulo: '', texto: '', botao_texto: '', botao_link: '', quando: POP_QUANDO[0], frequencia: POP_FREQ[0], no_ar_de: '', no_ar_ate: '', imagem_url: '' }
  const [f, setF] = useState(vazio)
  const [q, setQ] = useState('')
  const [ordem, setOrdem] = useState<'recentes' | 'titulo'>('recentes')
  const [fAtivo, setFAtivo] = useState<'todos' | 'no_ar' | 'fora'>('todos')
  const lock = !podeEditar || pendente
  const set = (p: Partial<typeof vazio>) => setF((x) => ({ ...x, ...p }))

  // Filtro/ordenação sobre as ≤100 linhas já entregues pelo servidor (lista pequena por curso).
  const linhas = useMemo(() => {
    let l = popups.filter((p) => (!q.trim() || p.titulo.toLowerCase().includes(q.trim().toLowerCase())) && (fAtivo === 'todos' || (fAtivo === 'no_ar' ? p.ativo : !p.ativo)))
    if (ordem === 'titulo') l = [...l].sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'))
    return l
  }, [popups, q, ordem, fAtivo])

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-4">
        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm">
          <h2 className="text-sm font-semibold">Criar pop-up</h2>
          <Campo rotulo="Título"><input className={inputCls} value={f.titulo} onChange={(e) => set({ titulo: e.target.value })} placeholder="Ex.: Simulado de sábado aberto" maxLength={160} disabled={lock} /></Campo>
          <Campo rotulo="Texto"><textarea className={textareaCls} rows={3} value={f.texto} onChange={(e) => set({ texto: e.target.value })} placeholder="Escreva a mensagem" maxLength={1000} disabled={lock} /></Campo>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Texto do botão"><input className={inputCls} value={f.botao_texto} onChange={(e) => set({ botao_texto: e.target.value })} placeholder="Ex.: Fazer o simulado" disabled={lock} /></Campo>
            <Campo rotulo="Link do botão"><input className={inputCls} type="url" value={f.botao_link} onChange={(e) => set({ botao_link: e.target.value })} placeholder="https://" disabled={lock} /></Campo>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Quando aparece"><select className={inputCls} value={f.quando} onChange={(e) => set({ quando: e.target.value })} disabled={lock}>{POP_QUANDO.map((o) => <option key={o}>{o}</option>)}</select></Campo>
            <Campo rotulo="Quantas vezes"><select className={inputCls} value={f.frequencia} onChange={(e) => set({ frequencia: e.target.value })} disabled={lock}>{POP_FREQ.map((o) => <option key={o}>{o}</option>)}</select></Campo>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Fica no ar de"><input className={inputCls} type="date" value={f.no_ar_de} onChange={(e) => set({ no_ar_de: e.target.value })} disabled={lock} /></Campo>
            <Campo rotulo="até"><input className={inputCls} type="date" value={f.no_ar_ate} onChange={(e) => set({ no_ar_ate: e.target.value })} disabled={lock} /></Campo>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Imagem (opcional)</span>
            <CampoImagem variant="linha" value={f.imagem_url} onChange={(u) => set({ imagem_url: u })} disabled={lock} />
            <small className="text-xs text-muted-foreground">Ou escolha uma imagem da galeria do curso, em Imagens e cores.</small>
            {galeria.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {galeria.map((g, i) => (
                  <button key={g + i} type="button" aria-label={`Usar imagem ${i + 1}`} onClick={() => set({ imagem_url: g })} disabled={lock}
                    className={cn('size-14 rounded-lg border-2 bg-muted bg-cover bg-center', f.imagem_url === g ? 'border-primary' : 'border-transparent')} style={{ backgroundImage: `url('${g}')` }} />
                ))}
              </div>
            )}
          </div>
          <div><Button size="lg" disabled={lock} onClick={() => executar(() => criarPopupAction(cursoId, { ...f, imagem_url: f.imagem_url || null }), 'Pop-up publicado', () => setF(vazio))}><Check className="size-4" />Publicar pop-up</Button></div>
        </section>

        <section className="rounded-2xl border bg-card p-3 shadow-sm">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <label className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input className={cn(inputCls, 'w-52 pl-8')} placeholder="Buscar pop-up" value={q} onChange={(e) => setQ(e.target.value)} /></label>
            <select className={cn(inputCls, 'w-36')} value={fAtivo} onChange={(e) => setFAtivo(e.target.value as typeof fAtivo)} aria-label="Situação"><option value="todos">Todos</option><option value="no_ar">No ar</option><option value="fora">Fora do ar</option></select>
            <select className={cn(inputCls, 'w-40')} value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)} aria-label="Ordenar"><option value="recentes">Mais recentes</option><option value="titulo">Título (A–Z)</option></select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="px-3 py-2">Pop-up</th><th className="px-3 py-2">Quando aparece</th><th className="px-3 py-2">No ar</th><th className="px-3 py-2" /></tr></thead>
              <tbody>
                {linhas.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-3 py-2.5"><b>{p.titulo}</b><span className="block text-xs text-muted-foreground">{p.frequencia}{p.no_ar_ate ? ` · até ${brData(p.no_ar_ate)}` : ''}</span></td>
                    <td className="px-3 py-2.5">{p.quando}</td>
                    <td className="px-3 py-2.5"><Switch checked={p.ativo} disabled={lock} aria-label="No ar" onCheckedChange={(v) => executar(() => alternarPopupAction(cursoId, p.id, v), v ? 'Pop-up no ar' : 'Pop-up tirado do ar')} /></td>
                    <td className="px-3 py-2.5 text-right">
                      <Button variant="outline" size="icon" aria-label="Excluir pop-up" disabled={lock} onClick={async () => { if (await confirmar({ titulo: 'Excluir pop-up', mensagem: `Excluir “${p.titulo}”?`, confirmar: 'Excluir', destrutivo: true })) executar(() => excluirPopupAction(cursoId, p.id), 'Pop-up excluído') }}><Trash2 className="size-4" /></Button>
                    </td>
                  </tr>
                ))}
                {!linhas.length && <tr><td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhum pop-up neste curso.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <aside className="xl:sticky xl:top-4 xl:self-start">
        <div className="mb-2 text-xs font-semibold text-muted-foreground">Como o aluno vê</div>
        <div className="grid place-items-center rounded-2xl bg-foreground/50 p-6">
          <div className="w-full overflow-hidden rounded-xl bg-card shadow-lg">
            {f.imagem_url ? <div className="aspect-video bg-cover bg-center" style={{ backgroundImage: `url('${f.imagem_url}')` }} /> : <div className="aspect-video" style={{ background: `linear-gradient(165deg, ${c1}, color-mix(in srgb, ${c1} 55%, black))` }} />}
            <div className="p-4 text-sm">
              <b className="block text-base">{f.titulo || 'Título do pop-up'}</b>
              <p className="mt-1 text-muted-foreground">{f.texto || 'O texto do pop-up aparece aqui enquanto você escreve.'}</p>
              {f.botao_texto && <span className="mt-3 inline-block rounded-md px-3 py-1.5 text-xs font-bold text-black" style={{ background: c2 }}>{f.botao_texto}</span>}
              <span className="mt-3 block text-center text-xs text-muted-foreground">Fechar</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}
