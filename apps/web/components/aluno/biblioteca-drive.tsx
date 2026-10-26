'use client'

// Biblioteca do ALUNO — re-design visual com os primitivos do redrive (CardPasta/CardConteudo/SeloTipo/
// BuscaDrive/DrawerLateral). PRESERVA: navegação por pastas (server action, gate no servidor), breadcrumb/
// voltar, abertura do leitor existente (/aluno/biblioteca/[id] → iframe), grifos/progresso, gate de acesso.
// Clique no CARD abre o painel do material (drawer, 4 abas); só o botão principal do painel abre o leitor.
// Busca estilo Drive escopada ao que o aluno já recebe (nível atual, já filtrado por acesso — não vaza).
// Largura cheia; grid adaptativo ao container (iframe-safe).

import { useCallback, useMemo, useState } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, Home, Loader2, FolderOpen } from 'lucide-react'
import { navegarBibliotecaAluno } from '@/app/aluno/(portal)/biblioteca/actions'
import { CardPasta } from '@/components/biblioteca/card-pasta'
import { CardConteudo } from '@/components/biblioteca/card-conteudo'
import { BuscaDrive, ResultadosBusca, type SugestaoBusca, type ResultadoBusca } from '@/components/biblioteca/busca-drive'
import { PainelMaterialAluno } from '@/components/aluno/painel-material-aluno'
import { cardGrid, FOLDER_MIN, POSTER_MIN } from '@/components/aluno/card-grid'
import { tipoDe } from '@/lib/biblioteca/tipos-conteudo'
import type { ArvoreAluno, DocAluno } from '@/lib/conteudo/leitor'

function normaliza(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function BibliotecaDrive({ inicial }: { inicial: ArvoreAluno }) {
  const [arvore, setArvore] = useState<ArvoreAluno>(inicial)
  const [carregando, setCarregando] = useState(false)
  const [valor, setValor] = useState('')
  const [termo, setTermo] = useState('') // termo confirmado (Enter) → mostra resultados
  const [selId, setSelId] = useState<string | null>(null)

  const ir = useCallback(async (pastaId: string | null) => {
    setCarregando(true)
    try {
      const r = await navegarBibliotecaAluno(pastaId)
      if (r) { setArvore(r); setValor(''); setTermo(''); setSelId(null) }
    } finally { setCarregando(false) }
  }, [])

  const bc = arvore.breadcrumb
  const naRaiz = arvore.pastaAtual == null
  const caminhoAtual = bc.map((p) => p.nome).join(' › ')
  const buscando = termo.trim().length > 0

  // Filtro client-side do NÍVEL ATUAL (já filtrado por acesso no servidor → nunca vaza).
  const q = normaliza(valor.trim())
  const pastasFiltradas = useMemo(
    () => (q ? arvore.pastas.filter((p) => normaliza(p.nome).includes(q)) : arvore.pastas),
    [arvore.pastas, q],
  )
  const docsFiltrados = useMemo(
    () => (q ? arvore.documentos.filter((d) => normaliza(d.titulo).includes(q)) : arvore.documentos),
    [arvore.documentos, q],
  )

  // Sugestões (ao vivo, no dropdown): documentos do nível atual que casam com o texto.
  const sugestoes: SugestaoBusca[] = useMemo(() => {
    if (!q) return []
    return arvore.documentos
      .filter((d) => normaliza(d.titulo).includes(q))
      .slice(0, 6)
      .map((d) => ({ id: d.id, kind: tipoDe(d.tipo_origem).kind, titulo: d.titulo, caminho: caminhoAtual || 'Biblioteca' }))
  }, [arvore.documentos, q, caminhoAtual])

  const resultados: ResultadoBusca[] = useMemo(
    () => docsFiltrados.map((d) => ({ id: d.id, kind: tipoDe(d.tipo_origem).kind, titulo: d.titulo, caminho: caminhoAtual || 'Biblioteca' })),
    [docsFiltrados, caminhoAtual],
  )

  const docSelecionado: DocAluno | null = selId ? arvore.documentos.find((d) => d.id === selId) ?? null : null

  function abrirSugestao(s: SugestaoBusca) { setSelId(s.id) }
  function limparBusca() { setValor(''); setTermo('') }

  return (
    <div className="animate-page w-full">
      {/* Cabeçalho */}
      <div className="mb-5 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary"><BookOpen className="h-6 w-6" /></span>
        {naRaiz ? (
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Biblioteca</h1>
            <p className="text-sm text-muted-foreground">Seus materiais — leia na plataforma e salve seus grifos.</p>
          </div>
        ) : (
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight text-primary" title={bc[bc.length - 1]?.nome}>{bc[bc.length - 1]?.nome}</h1>
            <p className="text-sm text-muted-foreground">
              {arvore.pastas.length} {arvore.pastas.length === 1 ? 'pasta' : 'pastas'} · {arvore.documentos.length} {arvore.documentos.length === 1 ? 'material' : 'materiais'}
            </p>
          </div>
        )}
      </div>

      {/* Breadcrumb + voltar (voltar redondo só dentro de pastas) */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {bc.length > 0 && (
          <button
            onClick={() => ir(bc.length >= 2 ? bc[bc.length - 2].id : null)}
            disabled={carregando}
            aria-label="Voltar"
            className="grid h-9 w-9 place-items-center rounded-full border text-muted-foreground transition hover:bg-muted disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-sm">
          <button onClick={() => ir(null)} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><Home className="h-4 w-4" />Início</button>
          {bc.map((p, i) => (
            <span key={p.id} className="flex shrink-0 items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
              <button onClick={() => ir(p.id)} className={`truncate rounded-md px-2 py-1 ${i === bc.length - 1 ? 'font-semibold text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`} title={p.nome}>{p.nome}</button>
            </span>
          ))}
        </nav>
      </div>

      {/* Busca estilo Drive */}
      <div className="mb-5">
        <BuscaDrive
          valor={valor}
          onValor={setValor}
          onSubmit={(t) => setTermo(t)}
          onLimpar={limparBusca}
          sugestoes={sugestoes}
          onAbrirSugestao={abrirSugestao}
          placeholder="Buscar nos seus materiais — títulos e pastas…"
          escopoLabel={naRaiz ? 'Toda a biblioteca' : 'Nesta pasta'}
        />
      </div>

      {/* Bloco de progresso / resumo — SÓ na raiz e FORA da busca */}
      {naRaiz && !buscando && !carregando && (arvore.pastas.length > 0 || arvore.documentos.length > 0) && (
        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border bg-primary/5 px-5 py-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><FolderOpen className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-base font-bold tracking-tight text-foreground">Tudo o que você tem disponível</div>
            <p className="text-sm text-muted-foreground">
              {arvore.pastas.length} {arvore.pastas.length === 1 ? 'pasta' : 'pastas'} e {arvore.documentos.length} {arvore.documentos.length === 1 ? 'material' : 'materiais'} para estudar. Abra um material para ler e salvar seus grifos.
            </p>
          </div>
        </div>
      )}

      {carregando ? (
        <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Carregando…</div>
      ) : buscando ? (
        <div className="space-y-5">
          {pastasFiltradas.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pastas</div>
              <div style={cardGrid(FOLDER_MIN)}>
                {pastasFiltradas.map((p) => (
                  <CardPasta key={p.id} nome={p.nome} cor={p.cor} contagem={`${p.totalDocs} ${p.totalDocs === 1 ? 'material' : 'materiais'}`} onClick={() => ir(p.id)} />
                ))}
              </div>
            </div>
          )}
          <ResultadosBusca
            termo={termo}
            resultados={resultados}
            onAbrir={(r) => setSelId(r.id)}
            onLimpar={limparBusca}
            voltarLabel={naRaiz ? undefined : bc[bc.length - 1]?.nome}
          />
        </div>
      ) : pastasFiltradas.length === 0 && docsFiltrados.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/30 px-6 py-20 text-center text-sm text-muted-foreground">
          {valor ? 'Nada encontrado para a busca.' : 'Nenhum material liberado aqui.'}
        </div>
      ) : (
        <div className="space-y-6">
          {pastasFiltradas.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pastas</div>
              <div style={cardGrid(FOLDER_MIN)}>
                {pastasFiltradas.map((p) => (
                  <CardPasta key={p.id} nome={p.nome} cor={p.cor} contagem={`${p.totalDocs} ${p.totalDocs === 1 ? 'material' : 'materiais'}`} onClick={() => ir(p.id)} />
                ))}
              </div>
            </div>
          )}

          {docsFiltrados.length > 0 && (
            <div className={pastasFiltradas.length > 0 ? 'border-t pt-6' : ''}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Documentos</div>
              <div style={cardGrid(POSTER_MIN)}>
                {docsFiltrados.map((d) => (
                  <CardConteudo
                    key={d.id}
                    kind={tipoDe(d.tipo_origem).kind}
                    titulo={d.titulo}
                    capaUrl={arvore.thumbs[d.id]}
                    onClick={() => setSelId(d.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Painel do material (drawer POR CIMA) */}
      <PainelMaterialAluno
        doc={docSelecionado}
        caminho={caminhoAtual}
        thumbUrl={docSelecionado ? arvore.thumbs[docSelecionado.id] : undefined}
        aberto={!!docSelecionado}
        onFechar={() => setSelId(null)}
      />
    </div>
  )
}
