'use client'

import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileJson, Upload, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SecaoHeader } from '@/components/admin/secao-header'
import { AlertBox } from '@/components/ui/alert-box'
import { Progress } from '@/components/ui/progress'
import {
  montarPrevia,
  validarCronogramas,
  validarLinks,
  validarMetas,
  type CronogramaImportado,
  type ErroLinha,
  type LinkImportado,
  type MetaImportada,
  type Previa,
} from '@/lib/cronograma/importar'
import { carregarEstadoAtual, finalizarImportacao, importarCronograma, importarLinks, type EstadoAtual } from './actions'

type Arquivos = {
  cronogramas: CronogramaImportado[] | null
  metas: MetaImportada[] | null
  links: LinkImportado[] | null
}

const nomeArquivo = {
  cronogramas: 'cronogramas.json',
  metas: 'atividades.json',
  links: 'aulas-links.json',
} as const

export function ImportarClient({ estado }: { estado: EstadoAtual }) {
  const [arquivos, setArquivos] = useState<Arquivos>({ cronogramas: null, metas: null, links: null })
  const [erros, setErros] = useState<ErroLinha[]>([])
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [importando, setImportando] = useState(false)
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0, atual: '' })
  const [resultado, setResultado] = useState<{ criados: number; atualizados: number; metas: number; links: number; falhas: string[] } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const estadoAtual = useMemo(
    () => ({ cronogramas: estado.cronogramas, linksChaves: new Set(estado.linksChaves) }),
    [estado],
  )

  /**
   * Lê e valida no NAVEGADOR. O módulo de importação é puro, então os 4 MB de
   * atividades.json não precisam subir para serem conferidos — só o que for gravar sobe.
   */
  async function carregar(lista: FileList | null) {
    if (!lista?.length) return
    const novos: Arquivos = { ...arquivos }
    const errosArquivo: ErroLinha[] = []

    for (const arq of Array.from(lista)) {
      let conteudo: unknown
      try {
        conteudo = JSON.parse(await arq.text())
      } catch {
        errosArquivo.push({ linha: 0, campo: arq.name, problema: 'não é um JSON válido' })
        continue
      }
      const n = arq.name.toLowerCase()
      if (n.includes('cronograma')) novos.cronogramas = conteudo as CronogramaImportado[]
      else if (n.includes('atividade') || n.includes('meta')) novos.metas = conteudo as MetaImportada[]
      else if (n.includes('link') || n.includes('aula')) novos.links = conteudo as LinkImportado[]
      else errosArquivo.push({ linha: 0, campo: arq.name, problema: 'nome não reconhecido — use cronogramas / atividades / aulas-links' })
    }

    // Guarda o conteúdo bruto e valida logo em seguida.
    const vc = validarCronogramas(novos.cronogramas ?? [])
    const mapa = new Map(vc.itens.map((c) => [c.slug, { total_semanas: c.total_semanas, dias_curso: c.dias_curso }]))
    // Cronogramas já no catálogo também valem como destino: dá para importar só metas.
    for (const c of estado.cronogramas) if (!mapa.has(c.slug)) mapa.set(c.slug, { total_semanas: 9999, dias_curso: [0, 1, 2, 3, 4, 5, 6] })
    const vm = validarMetas(novos.metas ?? [], mapa)
    const vl = validarLinks(novos.links ?? [])

    const todosErros = [...errosArquivo, ...vc.erros, ...vm.erros, ...vl.erros]
    setArquivos({ cronogramas: vc.itens, metas: vm.itens, links: vl.itens })
    setErros(todosErros)
    setPrevia(montarPrevia(vc.itens, vm.itens, vl.itens, estadoAtual, todosErros))
    setResultado(null)

    if (todosErros.length) toast.warning(`${todosErros.length} problema(s) encontrado(s) — confira antes de importar.`)
    else toast.success('Arquivos validados. Confira a prévia e confirme.')
  }

  async function confirmar() {
    if (!previa || !arquivos.cronogramas) return
    setImportando(true)
    setResultado(null)

    const metasPorSlug = new Map<string, MetaImportada[]>()
    for (const m of arquivos.metas ?? []) {
      const l = metasPorSlug.get(m.cronograma_slug)
      if (l) l.push(m)
      else metasPorSlug.set(m.cronograma_slug, [m])
    }

    const total = arquivos.cronogramas.length + ((arquivos.links ?? []).length ? 1 : 0)
    setProgresso({ feitos: 0, total, atual: '' })

    let criados = 0
    let atualizados = 0
    let metasTotal = 0
    let linksTotal = 0
    const falhas: string[] = []

    // Um cronograma por vez: payload pequeno, progresso visível, e uma falha no meio
    // não desfaz o que já entrou.
    for (const [i, c] of arquivos.cronogramas.entries()) {
      setProgresso({ feitos: i, total, atual: c.nome })
      const r = await importarCronograma(c, metasPorSlug.get(c.slug) ?? [])
      if (!r.ok) falhas.push(r.error ?? c.nome)
      else {
        if (r.criado) criados++
        else atualizados++
        metasTotal += r.depois ?? 0
      }
    }

    if ((arquivos.links ?? []).length) {
      setProgresso({ feitos: arquivos.cronogramas.length, total, atual: 'Links de aula' })
      const r = await importarLinks(arquivos.links ?? [])
      if (!r.ok) falhas.push(r.error ?? 'links')
      else {
        linksTotal = r.urls ?? 0
        if (r.plataformasNovas?.length) toast.info(`Plataforma(s) criada(s) automaticamente: ${r.plataformasNovas.join(', ')}`)
      }
    }

    await finalizarImportacao()
    setProgresso({ feitos: total, total, atual: '' })
    setImportando(false)
    setResultado({ criados, atualizados, metas: metasTotal, links: linksTotal, falhas })

    if (falhas.length) toast.error(`${falhas.length} item(ns) falharam. O restante foi importado.`)
    else toast.success('Importação concluída')
  }

  const prontoParaImportar = !!previa && (previa.cronogramas.length > 0 || (arquivos.links ?? []).length > 0)

  return (
    <>
      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader
          icon={Upload}
          titulo="Arquivos"
          subtitulo="Selecione os três de uma vez. A validação roda aqui no navegador, antes de qualquer gravação."
        />
        <div className="space-y-4 p-4">
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            multiple
            className="hidden"
            onChange={(e) => carregar(e.target.files)}
          />

          <button
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-10 transition hover:bg-muted/40"
          >
            <FileJson className="h-10 w-10 text-muted-foreground/50" />
            <span className="font-medium">Escolher arquivos JSON</span>
            <span className="text-xs text-muted-foreground">
              cronogramas.json · atividades.json · aulas-links.json
            </span>
          </button>

          <div className="grid gap-2 sm:grid-cols-3">
            {(['cronogramas', 'metas', 'links'] as const).map((k) => {
              const n = arquivos[k]?.length
              return (
                <div key={k} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  {n ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-muted-foreground/40" />}
                  <span className="flex-1 truncate">{nomeArquivo[k]}</span>
                  <span className="text-xs text-muted-foreground">{n ? `${n.toLocaleString('pt-BR')} linhas` : '—'}</span>
                </div>
              )
            })}
          </div>
        </div>
      </Card>

      {erros.length > 0 && (
        <AlertBox variante="perigo" titulo={`${erros.length} problema(s) nos arquivos`} icon={AlertTriangle}>
          <p className="text-sm">
            As linhas com problema <strong>não serão importadas</strong>. Corrija a origem e recarregue os
            arquivos, ou siga sabendo que elas ficam de fora.
          </p>
          <ul className="mt-2 ml-4 max-h-48 list-disc space-y-1 overflow-auto text-xs">
            {erros.slice(0, 40).map((e, i) => (
              <li key={i}>
                {e.linha > 0 && <span className="text-muted-foreground">linha {e.linha} · </span>}
                <span className="font-mono">{e.campo}</span>: {e.problema}
              </li>
            ))}
            {erros.length > 40 && <li className="text-muted-foreground">e mais {erros.length - 40}…</li>}
          </ul>
        </AlertBox>
      )}

      {previa && (
        <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
          <SecaoHeader
            icon={FileJson}
            titulo="Prévia"
            subtitulo="O que entra, o que muda e o que fica intocado — confira antes de confirmar."
            acao={
              <Button onClick={confirmar} disabled={importando || !prontoParaImportar}>
                {importando ? 'Importando…' : 'Confirmar importação'}
              </Button>
            }
          />

          <div className="grid grid-cols-2 gap-3 border-b p-4 sm:grid-cols-4">
            {[
              ['Cronogramas', previa.cronogramas.length],
              ['Metas', previa.totalMetas],
              ['Aulas com link', previa.totalLinks],
              ['Links novos', previa.linksNovos],
            ].map(([rotulo, valor]) => (
              <div key={rotulo as string}>
                <p className="text-2xl font-bold tabular-nums">{(valor as number).toLocaleString('pt-BR')}</p>
                <p className="text-xs text-muted-foreground">{rotulo}</p>
              </div>
            ))}
          </div>

          {previa.naoMencionados.length > 0 && (
            <div className="border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
              {previa.naoMencionados.length} cronograma(s) do catálogo não aparecem nos arquivos e ficam
              <strong> intocados</strong>: {previa.naoMencionados.slice(0, 5).join(', ')}
              {previa.naoMencionados.length > 5 && ` e mais ${previa.naoMencionados.length - 5}`}
            </div>
          )}

          {importando && (
            <div className="border-b px-4 py-3">
              <Progress value={(progresso.feitos / Math.max(progresso.total, 1)) * 100} />
              <p className="mt-1.5 text-xs text-muted-foreground">
                {progresso.feitos} de {progresso.total} · {progresso.atual}
              </p>
            </div>
          )}

          <div className="max-h-80 divide-y overflow-auto">
            {previa.cronogramas.map((c) => (
              <div key={c.slug} className="flex items-center gap-3 px-4 py-2 text-sm">
                <Badge
                  variant={c.situacao === 'novo' ? 'default' : c.situacao === 'atualiza' ? 'secondary' : 'outline'}
                  className="w-20 shrink-0 justify-center"
                >
                  {c.situacao === 'novo' ? 'novo' : c.situacao === 'atualiza' ? 'atualiza' : 'igual'}
                </Badge>
                <span className="min-w-0 flex-1 truncate">{c.nome}</span>
                {c.liberado && <Badge variant="outline">liberado</Badge>}
                <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                  {c.metasAtuais > 0 ? `${c.metasAtuais} → ` : ''}
                  {c.metasNovas} metas
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {resultado && (
        <AlertBox
          variante={resultado.falhas.length ? 'aviso' : 'sucesso'}
          titulo={resultado.falhas.length ? 'Importação concluída com falhas' : 'Importação concluída'}
          icon={resultado.falhas.length ? AlertTriangle : CheckCircle2}
        >
          <p className="text-sm">
            {resultado.criados} cronograma(s) criado(s), {resultado.atualizados} atualizado(s),{' '}
            {resultado.metas.toLocaleString('pt-BR')} meta(s) e {resultado.links.toLocaleString('pt-BR')} link(s)
            gravados.
          </p>
          {resultado.falhas.length > 0 && (
            <ul className="mt-2 ml-4 list-disc space-y-1 text-xs">
              {resultado.falhas.slice(0, 10).map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          )}
        </AlertBox>
      )}
    </>
  )
}
