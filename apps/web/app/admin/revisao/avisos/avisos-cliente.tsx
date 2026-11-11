'use client'
import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Check, Info, Plus, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { DataTable, type DataTableColumn } from '@/components/admin/data-table'
import { RevisaoHead } from '@/components/admin/revisao/ui'
import { CampoCs, FormCs, INPUT_CS, NotaCs } from '@/components/admin/revisao/cs-ui'
import { formatBrt } from '@/lib/brt'
import { AVISO_LOCAIS, type AvisoLinha, type GrupoOpcao } from '@/lib/admin-revisao/cs-tipos'
import { alternarAvisoAction, criarAvisoAction, excluirAvisoAction } from './actions'

const ROTULO = Object.fromEntries(AVISO_LOCAIS.map((l) => [l.k, l.rotulo]))

function FiltroLocal({ atual }: { atual: string }) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams()
  return (
    <select aria-label="Onde aparece" className="h-11 rounded-xl border bg-card px-3 text-[13.5px]" value={atual}
      onChange={(e) => { const p = new URLSearchParams(sp.toString()); e.target.value ? p.set('local', e.target.value) : p.delete('local'); p.delete('page'); router.push(`${pathname}?${p}`) }}>
      <option value="">Todos os lugares</option>
      {AVISO_LOCAIS.map((l) => <option key={l.k} value={l.k}>{l.rotulo}</option>)}
    </select>
  )
}

export function AvisosCliente({ rows, total, grupos, localAtual, podeEditar, migrado }: { rows: AvisoLinha[]; total: number; grupos: GrupoOpcao[]; localAtual: string; podeEditar: boolean; migrado: boolean }) {
  const router = useRouter()
  const [pend, start] = useTransition()
  const [novo, setNovo] = useState(false)
  const [titulo, setTitulo] = useState(''); const [local, setLocal] = useState<string>('faixa'); const [grupoId, setGrupoId] = useState(''); const [ate, setAte] = useState('')
  const [img, setImg] = useState<{ nome: string; data: string } | null>(null)
  const [apagar, setApagar] = useState<string | null>(null)
  const arq = useRef<HTMLInputElement>(null)

  const fechar = () => { setNovo(false); setTitulo(''); setAte(''); setImg(null); setGrupoId('') }
  const rodar = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, depois?: () => void) =>
    start(async () => { const r = await fn(); if (!r.ok) { toast.error(r.error ?? 'Não foi possível concluir.'); return } toast.success(ok); if (r.error) toast.message(r.error); depois?.(); router.refresh() })

  function escolherImagem(f?: File) {
    if (!f) return
    if (f.size > 2_000_000) { toast.error('Imagem maior que 2 MB.'); return }
    const rd = new FileReader(); rd.onload = () => setImg({ nome: f.name, data: String(rd.result) }); rd.readAsDataURL(f)
  }

  const colunas: DataTableColumn<AvisoLinha>[] = [
    { key: 'titulo', header: 'Aviso', sortable: true, truncate: false, render: (a) => (
      <div className="py-1"><b className="font-semibold">{a.titulo}</b>
        {(a.grupoNome || a.tem_imagem) && <div className="text-xs text-muted-foreground">{a.grupoNome ? `Para: ${a.grupoNome}` : ''}{a.grupoNome && a.tem_imagem ? ' · ' : ''}{a.tem_imagem ? 'com imagem' : ''}</div>}</div>
    ) },
    { key: 'onde', header: 'Onde aparece', width: '12rem', render: (a) => ROTULO[a.local] },
    { key: 'ate', header: 'Sai do ar', sortable: true, width: '8rem', render: (a) => <span className="tabular-nums">{a.ate ? formatBrt(a.ate)?.slice(0, 5) ?? '—' : '—'}</span> },
    { key: 'ativo', header: 'No ar', sortable: true, width: '6rem', render: (a) => <Switch checked={a.ativo} disabled={!podeEditar || pend} aria-label="No ar" onCheckedChange={(v) => rodar(() => alternarAvisoAction(a.id, v), v ? 'Aviso no ar' : 'Aviso tirado do ar')} /> },
    { key: 'acoes', header: '', width: '9rem', align: 'right', truncate: false, render: (a) => !podeEditar ? null : apagar === a.id ? (
      <span className="inline-flex items-center gap-1 text-xs">Apagar?
        <Button variant="destructive" size="xs" disabled={pend} onClick={() => rodar(() => excluirAvisoAction(a.id), 'Aviso apagado', () => setApagar(null))}>Sim</Button>
        <Button variant="ghost" size="xs" onClick={() => setApagar(null)}>Não</Button>
      </span>
    ) : <Button variant="ghost" size="icon-sm" aria-label="Apagar aviso" onClick={() => setApagar(a.id)}><Trash2 /></Button> },
  ]

  return (
    <>
      <RevisaoHead secao="CS" titulo="Avisos e pop-ups"
        subtitulo="O que aparece no Início de todos os alunos: faixa de avisos, banners, destaques da semana e pop-ups. Pop-ups de um curso só ficam em Montagem de curso › Pop-ups."
        acoes={podeEditar ? <Button size="lg" onClick={() => setNovo((v) => !v)}><Plus /> Criar aviso</Button> : undefined} />

      {!migrado && <div className="mb-4"><NotaCs tom="aviso">“Para quem” e “Sai do ar em” só valem após aplicar a migração <b>20261112040000</b>. Até lá o aviso é gravado sem esses campos.</NotaCs></div>}

      {novo && (
        <FormCs titulo="Criar aviso">
          <div className="grid gap-3 md:grid-cols-2">
            <CampoCs rotulo="Texto ou título"><input className={INPUT_CS} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Inscrições abertas para a Prova Oral PGE/AL" maxLength={200} /></CampoCs>
            <CampoCs rotulo="Onde aparece"><select className={INPUT_CS} value={local} onChange={(e) => setLocal(e.target.value)}>{AVISO_LOCAIS.map((l) => <option key={l.k} value={l.k}>{l.rotulo}</option>)}</select></CampoCs>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <CampoCs rotulo="Para quem"><select className={INPUT_CS} value={grupoId} onChange={(e) => setGrupoId(e.target.value)}><option value="">Todos</option>{grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}</select></CampoCs>
            <CampoCs rotulo="Sai do ar em" dica="Vazio = sem data para sair."><input className={INPUT_CS} type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></CampoCs>
          </div>
          <button type="button" onClick={() => arq.current?.click()} className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed p-3.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted">
            <Upload className="h-4 w-4" /> {img ? img.nome : 'Imagem do banner (opcional)'}
          </button>
          <input ref={arq} type="file" accept="image/*" hidden onChange={(e) => { escolherImagem(e.target.files?.[0]); e.target.value = '' }} />
          <div className="flex gap-2">
            <Button size="lg" disabled={pend || !titulo.trim()} onClick={() => rodar(() => criarAvisoAction({ titulo, local, grupoId: grupoId || null, ate: ate || null, imagem: img?.data ?? null }), 'Aviso publicado', fechar)}><Check /> Publicar aviso</Button>
            <Button size="lg" variant="ghost" onClick={fechar}>Cancelar</Button>
          </div>
        </FormCs>
      )}

      <DataTable<AvisoLinha> rows={rows} total={total} columns={colunas} getRowId={(a) => a.id} selectable={false}
        searchable searchPlaceholder="Buscar aviso pelo título" filters={<FiltroLocal atual={localAtual} />}
        defaultSort={{ key: 'criado', dir: 'desc' }} nomeSingular="aviso" nomePlural="avisos" empty={<span>Nenhum aviso por aqui.</span>} />

      <div className="mt-4 grid gap-2">
        <NotaCs><Info className="mt-0.5 h-4 w-4 shrink-0" /><span>A ordem dos blocos do Início (faixa, calendário, destaques, vitrine de cursos) é ajustada em <Link href="/admin/configuracoes" className="font-medium text-primary underline underline-offset-2">Aparência da plataforma</Link>.</span></NotaCs>
        <NotaCs><Info className="mt-0.5 h-4 w-4 shrink-0" /><span>Recorte de imagem, degradê, estilo do pop-up e agenda detalhada: <Link href="/admin/configuracoes/banners" className="font-medium text-primary underline underline-offset-2">editor completo de banners e pop-ups</Link>.</span></NotaCs>
      </div>
    </>
  )
}
