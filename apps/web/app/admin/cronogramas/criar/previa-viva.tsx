'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, LayoutGrid, Loader2, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { montarPorConteudos, semanasDeConteudo, type ConfigMontagem, type ConteudoMontagem } from '@/lib/cronograma/montador'
import { gerarGrade } from '@/lib/cronograma/gerador'
import { indexarLinks } from '@/lib/cronograma/formato-meta'
import { SLUG_VIDEO } from '@/lib/cronograma/tipos'
import type { Grade, LinkAula, MapaTipos, MetaFonte, Plataforma, TipoMetaDef } from '@/lib/cronograma/tipos'
import { GradeCronograma, ResumoGrade } from '@/components/cronograma/grade-cronograma'
import { useCriar } from './criar-context'
import { PreviaMontagem } from './previa-montagem'
import { dadosLinks, dadosMetas } from './dados'

type Aba = 'modelo' | 'datada'

/** Data civil de hoje (YYYY-MM-DD) — início padrão da prévia datada. */
function hojeISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function PreviaViva() {
  const { draft, montagem } = useCriar()
  const [aba, setAba] = useState<Aba>('modelo')
  const [expandido, setExpandido] = useState(false)
  const [tipos, setTipos] = useState<TipoMetaDef[]>([])
  const [plataformas, setPlataformas] = useState<Plataforma[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    Promise.all([dadosMetas(), dadosLinks()]).then(([tm, tl]) => {
      if (tm.ok) setTipos(tm.tipos ?? [])
      if (tl.ok) setPlataformas((tl.plataformas ?? []) as Plataforma[])
      setCarregando(false)
    })
  }, [])

  const rotuloTipo = (slug: string) => tipos.find((t) => t.slug === slug)?.nome ?? slug
  const usaLinksTipo = (slug: string) => montagem.linhas.find((l) => l.tipo === slug)?.usaLinks ?? false

  // ── MODELO: o revezamento como fica, ao vivo, a partir dos controles ──
  const modelo = useMemo(() => {
    const conteudos: ConteudoMontagem[] = montagem.selecionados.map((s) => {
      const dados: Record<string, Record<string, { aulaReal: string; conteudo: string | null; tema: string | null; urls: Record<string, string>; questaoIds: string[]; videoUrl: string | null }>> = {}
      for (const a of s.banco.aulas) {
        if (!a.chave) continue
        ;(dados[a.chave] ??= {})[a.tipo] = { aulaReal: a.aulaReal, conteudo: a.conteudo, tema: a.tema, urls: a.urls, questaoIds: a.questaoIds ?? [], videoUrl: a.videoUrl ?? null }
      }
      let chaves = [...new Set(s.banco.aulas.filter((a) => a.tipo === montagem.linhas[0]?.tipo).map((a) => a.chave).filter(Boolean))]
      if (!chaves.length) chaves = [...new Set(s.banco.aulas.map((a) => a.chave).filter(Boolean))]
      chaves.sort((x, y) => (Number(x) || 0) - (Number(y) || 0) || x.localeCompare(y))
      return { disciplina: s.disciplina, disciplina_id: s.disciplina_id, semInicio: s.semInicio, semFim: s.semFim, aulas: chaves, dados }
    })
    const config: ConfigMontagem = {
      totalSemanas: draft.totalSemanas,
      semanasRevisao: draft.semanasRevisao,
      diasCount: Math.max(1, draft.diasNome.length),
      aulasPorSemana: montagem.aulasPorSemana,
      linhas: montagem.linhas.map((l) => ({ tipo: l.tipo, duracao: l.duracao, offset: l.offset, continuacao: l.continuacao, usaLinks: l.usaLinks, somenteComDado: l.somenteComDado ?? l.tipo === 'legproc' })),
    }
    return { resultado: montarPorConteudos(config, conteudos), semanas: semanasDeConteudo(config.totalSemanas, config.semanasRevisao) }
  }, [montagem, draft.totalSemanas, draft.semanasRevisao, draft.diasNome.length])

  // ── DATADA: gerarGrade (puro) sobre as metas JÁ aplicadas no rascunho ──
  const datada = useMemo<{ grade: Grade | null; erro: string | null }>(() => {
    if (!draft.metas.length) return { grade: null, erro: 'Clique em “Aplicar ao rascunho” na seção Conteúdos para ver a grade datada.' }
    const mapaTipos: MapaTipos = new Map(tipos.map((t) => [t.slug, t]))
    const platPorSlug = new Map<string, Plataforma>(plataformas.map((p) => [p.slug, p]))
    if (!platPorSlug.has(SLUG_VIDEO)) platPorSlug.set(SLUG_VIDEO, { id: 'preview-video', nome: 'Vídeo', slug: SLUG_VIDEO, cor: null, ordem: 900 })
    const linkAulas: LinkAula[] = draft.links.map((l) => ({
      disciplina: l.disciplina,
      disciplina_id: l.disciplina_id,
      aula: l.aula,
      tema: l.tema,
      urls: Object.entries(l.urls).filter(([slug, url]) => platPorSlug.has(slug) && String(url).trim()).map(([slug, url]) => ({ plataforma: platPorSlug.get(slug)!, url: String(url) })),
    }))
    const links = indexarLinks(linkAulas)
    const metas: MetaFonte[] = draft.metas.map((m) => ({
      id: m.tmpId, semana: m.semana, dia: m.dia, tipo: m.tipo, disciplina: m.disciplina, disciplina_id: m.disciplina_id,
      aula: m.aula, conteudo: m.conteudo, duracao: m.duracao, ordem: m.ordem,
      simulado_id: null, simulado_externo_nome: null, simulado_externo_url: null,
    }))
    const r = gerarGrade(
      { id: 'preview', slug: 'preview', nome: draft.nome || 'Prévia', total_semanas: draft.totalSemanas, dias_curso: draft.diasCurso, dias_nome: draft.diasNome, semanas_revisao: draft.semanasRevisao, carga_horaria: draft.cargaHoraria },
      metas,
      mapaTipos,
      links,
      { inicio: hojeISO(), revisao: { ativo: false, cada: 4 }, recesso: { modo: 'nenhum' } },
    )
    if (!r.ok) return { grade: null, erro: r.erro }
    // Chip "N questões" a partir do rascunho (as metas ainda não estão no banco).
    const qtd = new Map(draft.metas.filter((m) => m.questaoIds?.length).map((m) => [m.tmpId, m.questaoIds!.length]))
    if (qtd.size) for (const s of r.grade.semanas) if (s.kind === 'conteudo') for (const m of s.metas) { const n = qtd.get(m.id); if (n) m.qtdQuestoes = n }
    return { grade: r.grade, erro: null }
  }, [draft, tipos, plataformas])

  const semMetas = !draft.metas.length
  const semModelo = !montagem.selecionados.length

  const conteudo = carregando ? (
    <p className="flex items-center justify-center gap-2 rounded-2xl border bg-card p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>
  ) : aba === 'modelo' ? (
    semModelo ? (
      <VazioPrevia texto="Adicione conteúdos do banco na seção “Conteúdos & linhas” — o revezamento aparece aqui ao vivo, sem datas." />
    ) : !modelo.resultado.metas.length ? (
      <VazioPrevia texto="Nenhuma meta gerada — confira a faixa de semanas dos conteúdos e as linhas da grade." />
    ) : (
      <div className="space-y-2">
        {modelo.resultado.avisos.map((a, i) => (
          <p key={i} className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">{a}</p>
        ))}
        <p className="text-[11px] text-muted-foreground">{modelo.resultado.metas.length.toLocaleString('pt-BR')} metas · {modelo.semanas.length} semanas de conteúdo · sem datas</p>
        <PreviaMontagem metas={modelo.resultado.metas} semanas={modelo.semanas} linhas={montagem.linhas} diasNome={draft.diasNome} rotuloTipo={rotuloTipo} usaLinksTipo={usaLinksTipo} />
      </div>
    )
  ) : semMetas ? (
    <VazioPrevia texto={datada.erro ?? 'Sem metas no rascunho ainda.'} />
  ) : datada.erro ? (
    <p className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{datada.erro}</p>
  ) : datada.grade ? (
    <div className="space-y-3">
      <ResumoGrade grade={datada.grade} />
      <p className="text-[11px] text-muted-foreground">Grade datada a partir de hoje, sem revisão inserida — amostra do formato. O aluno escolhe início/revisão/recesso ao gerar.</p>
      <GradeCronograma grade={datada.grade} paletaSlug="padrao" titulo={draft.nome.trim() || undefined} />
    </div>
  ) : null

  const toggle = (
    <div className="flex rounded-lg border p-0.5">
      <button onClick={() => setAba('modelo')} className={cn('flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition', aba === 'modelo' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
        <LayoutGrid className="h-3.5 w-3.5" /> Modelo
      </button>
      <button onClick={() => setAba('datada')} className={cn('flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition', aba === 'datada' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
        <CalendarDays className="h-3.5 w-3.5" /> Datada
      </button>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Prévia ao vivo</h2>
        <div className="flex items-center gap-1.5">
          {toggle}
          <button onClick={() => setExpandido(true)} className="flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground" title="Abrir a prévia em tela grande">
            <Maximize2 className="h-3.5 w-3.5" /> Expandir
          </button>
        </div>
      </div>
      {!expandido && conteudo}

      <Dialog open={expandido} onOpenChange={setExpandido}>
        <DialogContent className="flex max-h-[92vh] w-full flex-col sm:max-w-[95vw]">
          <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0 pr-8">
            <DialogTitle>Prévia — {draft.nome.trim() || 'cronograma'}</DialogTitle>
            {toggle}
          </DialogHeader>
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">{conteudo}</div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function VazioPrevia({ texto }: { texto: string }) {
  return (
    <div className="rounded-2xl border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">{texto}</div>
  )
}
