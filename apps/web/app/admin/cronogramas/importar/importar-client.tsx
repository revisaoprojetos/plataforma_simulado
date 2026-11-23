'use client'

import { lerXlsx, ErroLeituraXlsx } from '@/lib/cronograma/ler-xlsx'
import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Info, Loader2, Upload } from 'lucide-react'
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
import { abasXlsxParaListas, lerCsv, planilhaAchatadaParaListas } from '@/lib/cronograma/importar-planilha'
import type { EstadoAtual } from './actions-tipos'
import {finalizarImportacao, importarCronograma, importarLinks} from './actions'

type Lido = {
  arquivo: string
  cronogramas: CronogramaImportado[]
  metas: MetaImportada[]
  links: LinkImportado[]
}

export function ImportarClient({ estado }: { estado: EstadoAtual }) {
  const [lido, setLido] = useState<Lido | null>(null)
  const [erros, setErros] = useState<ErroLinha[]>([])
  const [avisosArquivo, setAvisosArquivo] = useState<string[]>([])
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [lendo, setLendo] = useState(false)
  const [importando, setImportando] = useState(false)
  const [baixandoModelo, setBaixandoModelo] = useState(false)
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0, atual: '' })
  const [resultado, setResultado] = useState<{ criados: number; atualizados: number; metas: number; links: number; falhas: string[] } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const estadoAtual = useMemo(
    () => ({ cronogramas: estado.cronogramas, linksChaves: new Set(estado.linksChaves) }),
    [estado],
  )

  /**
   * Lê e valida NO NAVEGADOR — o arquivo de metas tem ~7 MB, e não faz sentido subir isso
   * só para ser conferido. Só o que vai gravar trafega, e em blocos por cronograma.
   */
  async function carregar(arquivo: File | null | undefined) {
    if (!arquivo) return
    setLendo(true)
    try {
      const nome = arquivo.name.toLowerCase()
      let listas

      if (nome.endsWith('.xlsx') || nome.endsWith('.xlsm')) {
        // exceljs é pesado (~1 MB) e só é preciso aqui — carregado sob demanda, como o
        // resto do admin já faz para exportar planilha.
        const ExcelJS = (await import('exceljs')).default
        const abas = await lerXlsx(await arquivo.arrayBuffer(), ExcelJS)
        listas = abasXlsxParaListas(abas)
      } else if (nome.endsWith('.csv')) {
        const { cabecalho, linhas } = lerCsv(await arquivo.text())
        listas = planilhaAchatadaParaListas(cabecalho, linhas)
      } else {
        toast.error(nome.endsWith('.xls') ? 'Formato .xls antigo não é suportado. Abra no Excel e salve como .xlsx.' : 'Formato não reconhecido. Envie a planilha .xlsx ou o CSV achatado.')
        setLendo(false)
        return
      }

      // Validação: as mesmas regras da spec §9, agora sobre o que veio da planilha.
      const vc = validarCronogramas(listas.cronogramas)
      const mapa = new Map(vc.itens.map((c) => [c.slug, { total_semanas: c.total_semanas, dias_curso: c.dias_curso }]))
      // Cronogramas já no catálogo também valem como destino — dá para importar só metas.
      for (const c of estado.cronogramas) {
        if (!mapa.has(c.slug)) mapa.set(c.slug, { total_semanas: 9999, dias_curso: [0, 1, 2, 3, 4, 5, 6] })
      }
      const vm = validarMetas(listas.metas, mapa, new Set(estado.tiposMeta))
      const vl = validarLinks(listas.links)

      const todosErros = [...vc.erros, ...vm.erros, ...vl.erros]
      setLido({ arquivo: arquivo.name, cronogramas: vc.itens, metas: vm.itens, links: vl.itens })
      setErros(todosErros)
      setAvisosArquivo(listas.avisos)
      setPrevia(montarPrevia(vc.itens, vm.itens, vl.itens, estadoAtual, todosErros))
      setResultado(null)

      if (todosErros.length) toast.warning(`${todosErros.length} problema(s) encontrado(s) — confira antes de importar.`)
      else toast.success('Planilha validada. Confira a prévia e confirme.')
    } catch (e) {
      toast.error(e instanceof ErroLeituraXlsx ? e.message : `Não foi possível ler o arquivo: ${(e as Error).message}`)
    } finally {
      setLendo(false)
    }
  }

  /** Gera o modelo no navegador (mesmo exceljs da leitura): abas e colunas exatamente como o importador espera. */
  async function baixarModelo() {
    setBaixandoModelo(true)
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      const tipos = estado.tiposMeta.length ? estado.tiposMeta : ['pdfull']
      const tipo = (i: number) => tipos[i % tipos.length]

      const aba = (nome: string, colunas: { h: string; w: number; texto?: boolean }[], linhas: (string | number)[][]) => {
        const ws = wb.addWorksheet(nome)
        ws.columns = colunas.map((c) => ({ header: c.h, width: c.w, style: c.texto ? { numFmt: '@' } : {} }))
        ws.getRow(1).font = { bold: true }
        ws.views = [{ state: 'frozen', ySplit: 1 }]
        linhas.forEach((l) => ws.addRow(l))
        return ws
      }

      aba(
        'Cronogramas',
        [
          { h: 'slug', w: 28 }, { h: 'nome', w: 34 }, { h: 'subtitulo', w: 28 }, { h: 'total_semanas', w: 14 },
          { h: 'dias_curso', w: 14 }, { h: 'dias_nome', w: 30 }, { h: 'semanas_revisao', w: 16 },
          { h: 'carga_horaria', w: 14 }, { h: 'categoria', w: 18 }, { h: 'ordem', w: 8 },
        ],
        [['exemplo-apagar', 'Exemplo — Direito Constitucional', 'Modelo de planilha', 4, '1,3,5', 'Segunda, Quarta, Sexta', '4', 40, 'Exemplo', 1]],
      )
      aba(
        'Atividades',
        [
          { h: 'cronograma_slug', w: 22 }, { h: 'semana', w: 9 }, { h: 'dia', w: 6 }, { h: 'tipo', w: 14 },
          { h: 'disciplina', w: 28 }, { h: 'aula', w: 8, texto: true }, { h: 'conteudo', w: 40 },
          { h: 'duracao', w: 10 }, { h: 'ordem', w: 8 },
        ],
        [
          ['exemplo-apagar', 1, 0, tipo(0), 'Direito Constitucional', '01', 'Constitucionalismo e Poder Constituinte', '02:00', 1],
          ['exemplo-apagar', 1, 1, tipo(0), 'Direito Constitucional', '02', 'Princípios fundamentais', '02:00', 2],
          ['exemplo-apagar', 1, 2, tipo(1), 'Direito Constitucional', '02', 'Revisão da aula 02', '01:00', 3],
        ],
      )
      aba(
        'Links',
        [{ h: 'disciplina', w: 28 }, { h: 'aula', w: 8, texto: true }, { h: 'tema', w: 36 }, { h: 'url_qc', w: 40 }, { h: 'url_tec', w: 40 }],
        [['Direito Constitucional', '01', 'Constitucionalismo e Poder Constituinte', 'https://exemplo.com/qc/01', 'https://exemplo.com/tec/01']],
      )

      const ins = wb.addWorksheet('Instruções')
      ins.getColumn(1).width = 120
      ;[
        'COMO PREENCHER (esta aba não é importada)',
        '1. Apague a linha de exemplo ("exemplo-apagar") nas três abas antes de importar.',
        '2. Mantenha os nomes das abas: Cronogramas, Atividades e Links.',
        '3. slug: identificador único do cronograma, sem espaços (ex.: revisao-pge-2027). Reimportar o mesmo slug substitui as metas dele.',
        '4. dias_curso: dias da semana em número, separados por vírgula (0=domingo, 1=segunda … 6=sábado). dias_nome: os mesmos dias por extenso, na mesma ordem e quantidade.',
        '5. Atividades › dia: NÃO é o dia da semana, é a POSIÇÃO dentro de dias_curso (começa em 0). Com dias_curso "1,3,5": 0=segunda, 1=quarta, 2=sexta.',
        '6. Atividades › semana: de 1 até total_semanas.',
        '7. Atividades › tipo: use exatamente um dos tipos cadastrados (veja a aba "Tipos válidos").',
        '8. Atividades › aula e Links › aula: são TEXTO. "01", "1" e "1.1" são aulas diferentes. Não deixe o Excel transformar "01" em 1.',
        '9. A disciplina deve ter a mesma grafia nas abas Atividades e Links; é ela que liga a meta ao link.',
        '10. duracao: formato hh:mm (ex.: 02:00). semanas_revisao: números separados por vírgula, dentro de 1 a total_semanas (pode ficar vazio).',
        '11. carga_horaria: obrigatória e maior que zero.',
      ].forEach((t, i) => {
        const r = ins.addRow([t])
        if (i === 0) r.font = { bold: true }
      })
      const tv = wb.addWorksheet('Tipos válidos')
      tv.getColumn(1).width = 30
      tv.addRow(['tipo (use exatamente assim)']).font = { bold: true }
      tipos.forEach((t) => tv.addRow([t]))

      const buf = await wb.xlsx.writeBuffer()
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'modelo-importar-cronogramas.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast.error(`Não foi possível gerar o modelo: ${(e as Error).message}`)
    } finally {
      setBaixandoModelo(false)
    }
  }

  async function confirmar() {
    if (!previa || !lido) return
    setImportando(true)
    setResultado(null)

    const metasPorSlug = new Map<string, MetaImportada[]>()
    for (const m of lido.metas) {
      const l = metasPorSlug.get(m.cronograma_slug)
      if (l) l.push(m)
      else metasPorSlug.set(m.cronograma_slug, [m])
    }

    const total = lido.cronogramas.length + (lido.links.length ? 1 : 0)
    setProgresso({ feitos: 0, total, atual: '' })

    let criados = 0
    let atualizados = 0
    let metasTotal = 0
    let linksTotal = 0
    const falhas: string[] = []

    // Um cronograma por vez: payload pequeno, progresso visível, e uma falha no meio não
    // desfaz o que já entrou.
    for (const [i, c] of lido.cronogramas.entries()) {
      setProgresso({ feitos: i, total, atual: c.nome })
      const r = await importarCronograma(c, metasPorSlug.get(c.slug) ?? [])
      if (!r.ok) falhas.push(r.error ?? c.nome)
      else {
        if (r.criado) criados++
        else atualizados++
        metasTotal += r.depois ?? 0
      }
    }

    if (lido.links.length) {
      setProgresso({ feitos: lido.cronogramas.length, total, atual: 'Links de aula' })
      const r = await importarLinks(lido.links)
      if (!r.ok) falhas.push(r.error ?? 'links')
      else {
        linksTotal = r.urls ?? 0
        if (r.plataformasNovas?.length) toast.info(`Plataforma(s) criada(s): ${r.plataformasNovas.join(', ')}`)
      }
    }

    await finalizarImportacao()
    setProgresso({ feitos: total, total, atual: '' })
    setImportando(false)
    setResultado({ criados, atualizados, metas: metasTotal, links: linksTotal, falhas })

    if (falhas.length) toast.error(`${falhas.length} item(ns) falharam. O restante foi importado.`)
    else toast.success('Importação concluída')
  }

  const pronto = !!previa && !!lido && (lido.cronogramas.length > 0 || lido.links.length > 0)

  return (
    <>
      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader
          icon={Upload}
          titulo="Planilha"
          subtitulo="A leitura e a validação rodam aqui no navegador, antes de qualquer gravação."
        />
        <div className="space-y-4 p-4">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xlsm,.csv"
            className="hidden"
            onChange={(e) => carregar(e.target.files?.[0])}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
            <p className="text-sm text-muted-foreground">Primeira vez? Baixe o modelo já com as abas, colunas, exemplo e instruções.</p>
            <Button type="button" variant="outline" size="sm" onClick={baixarModelo} disabled={baixandoModelo}>
              {baixandoModelo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Baixar modelo (.xlsx)
            </Button>
          </div>

          <button
            onClick={() => inputRef.current?.click()}
            disabled={lendo}
            className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-10 transition hover:bg-muted/40 disabled:opacity-60"
          >
            {lendo ? (
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground/50" />
            ) : (
              <FileSpreadsheet className="h-10 w-10 text-muted-foreground/50" />
            )}
            <span className="font-medium">{lendo ? 'Lendo a planilha…' : 'Escolher planilha'}</span>
            <span className="text-xs text-muted-foreground">
              .xlsx com as abas Cronogramas, Atividades e Links — ou o CSV achatado
            </span>
          </button>

          {lido && (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  ['Cronogramas', lido.cronogramas.length],
                  ['Metas', lido.metas.length],
                  ['Aulas com link', lido.links.length],
                ].map(([rotulo, n]) => (
                  <div key={rotulo as string} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span className="flex-1">{rotulo as string}</span>
                    <span className="tabular-nums text-xs text-muted-foreground">{(n as number).toLocaleString('pt-BR')}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Arquivo: {lido.arquivo}</p>
            </>
          )}
        </div>
      </Card>

      {avisosArquivo.length > 0 && (
        <AlertBox variante="info" titulo="Sobre este arquivo" icon={Info}>
          <ul className="ml-4 list-disc space-y-1 text-sm">
            {avisosArquivo.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </AlertBox>
      )}

      {erros.length > 0 && (
        <AlertBox variante="perigo" titulo={`${erros.length} problema(s) na planilha`} icon={AlertTriangle}>
          <p className="text-sm">
            As linhas com problema <strong>não serão importadas</strong>. Corrija a origem e recarregue, ou
            siga sabendo que elas ficam de fora.
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
            icon={FileSpreadsheet}
            titulo="Prévia"
            subtitulo="O que entra, o que muda e o que fica intocado — confira antes de confirmar."
            acao={
              <Button onClick={confirmar} disabled={importando || !pronto}>
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
                <p className="text-xs text-muted-foreground">{rotulo as string}</p>
              </div>
            ))}
          </div>

          {previa.naoMencionados.length > 0 && (
            <div className="border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
              {previa.naoMencionados.length} cronograma(s) do catálogo não aparecem na planilha e ficam
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
