'use client'

// Painel do material (drawer POR CIMA) da Biblioteca do ALUNO — spec aluno §1.5.
// 4 abas sublinhadas: Visão geral · Histórico · Download e link · Detalhes (+ Relatar erro).
// SÓ o botão principal abre o visualizador (leitor existente). Tipos sem visualizador ainda
// (PPT/XLS/vídeo/áudio) mostram "Visualizador em breve" + download se permitido.
// Consome apenas o que o loader entrega hoje (sem campos novos). Backend de "Relatar erro"
// é religado por outro agente — aqui fica o acknowledgement local.

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, Download, Link2, Check, Clock3, FolderOpen, AlertTriangle, Send } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DrawerLateral } from '@/components/biblioteca/drawer-lateral'
import { SeloTipo } from '@/components/biblioteca/selo-tipo'
import { PermissaoQuadros } from '@/components/biblioteca/permissao-quadros'
import { tipoDe, type KindConteudo } from '@/lib/biblioteca/tipos-conteudo'
import type { DocAluno } from '@/lib/conteudo/leitor'

/** Rótulo do botão principal por tipo (adaptativo). */
function rotuloAbrir(kind: KindConteudo): string {
  switch (kind) {
    case 'pdf': return 'Abrir PDF'
    case 'pptx': return 'Ver os slides'
    case 'xlsx': return 'Abrir planilha'
    case 'video': return 'Assistir'
    case 'audio': return 'Ouvir'
    default: return 'Começar leitura'
  }
}

export function PainelMaterialAluno({
  doc,
  caminho,
  thumbUrl,
  aberto,
  onFechar,
}: {
  doc: DocAluno | null
  caminho: string
  thumbUrl?: string
  aberto: boolean
  onFechar: () => void
}) {
  const router = useRouter()
  const [copiado, setCopiado] = useState(false)
  const [relatarAberto, setRelatarAberto] = useState(false)
  const [relatoTexto, setRelatoTexto] = useState('')
  const [relatoEnviado, setRelatoEnviado] = useState(false)
  const copiaTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  if (!doc) return null
  const tipo = tipoDe(doc.tipo_origem)
  const kind = tipo.kind
  const temVisualizador = tipo.visualizador === 'leitor' || tipo.visualizador === 'pdf'
  const href = `/aluno/biblioteca/${doc.id}`
  const linkMaterial = typeof window !== 'undefined' ? `${window.location.origin}${href}` : href

  function abrirVisualizador() {
    onFechar()
    router.push(href)
  }

  function copiarLink() {
    try {
      navigator.clipboard?.writeText(linkMaterial)
      setCopiado(true)
      if (copiaTimer.current) clearTimeout(copiaTimer.current)
      copiaTimer.current = setTimeout(() => setCopiado(false), 1800)
    } catch { /* clipboard indisponível */ }
  }

  return (
    <DrawerLateral
      aberto={aberto}
      onFechar={onFechar}
      largura={400}
      titulo={
        <span className="flex items-center gap-2">
          <SeloTipo kind={kind} tamanho="sm" />
          <span className="truncate">{doc.titulo}</span>
        </span>
      }
      subtitulo={tipo.label}
    >
      <div className="flex flex-col gap-4 p-4">
        {/* Capa + botão principal */}
        <div className="overflow-hidden rounded-xl border bg-muted">
          <div className="relative aspect-[1/1.3] w-full">
            {thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbUrl} alt="" className="h-full w-full object-cover object-top" loading="lazy" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-primary/5">
                <SeloTipo kind={kind} />
              </div>
            )}
          </div>
        </div>

        {temVisualizador ? (
          <button
            type="button"
            onClick={abrirVisualizador}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <BookOpen className="h-4 w-4" />{rotuloAbrir(kind)}
          </button>
        ) : (
          <div className="rounded-xl border border-dashed bg-muted/40 px-4 py-3 text-center">
            <div className="flex items-center justify-center gap-2 text-sm font-semibold text-foreground">
              <Clock3 className="h-4 w-4 text-muted-foreground" />Visualizador em breve
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Este tipo de material ({tipo.label}) ainda não abre na plataforma. Baixe para estudar offline.
            </p>
          </div>
        )}

        {/* Abas */}
        <Tabs defaultValue="geral" className="gap-3">
          <TabsList variant="line">
            <TabsTrigger value="geral">Visão geral</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
            <TabsTrigger value="download">Download</TabsTrigger>
            <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
          </TabsList>

          {/* 1 · Visão geral */}
          <TabsContent value="geral" className="space-y-3 pt-1">
            <p className="text-sm text-muted-foreground">
              {temVisualizador
                ? 'Abra para ler na plataforma, grifar e salvar suas marcações — tudo fica guardado no seu perfil.'
                : 'Material disponível para download conforme as permissões abaixo.'}
            </p>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border bg-muted/30 px-3 py-2">
                <dt className="text-muted-foreground">Tipo</dt>
                <dd className="font-semibold text-foreground">{tipo.label}</dd>
              </div>
              <div className="rounded-lg border bg-muted/30 px-3 py-2">
                <dt className="text-muted-foreground">Local</dt>
                <dd className="truncate font-semibold text-foreground" title={caminho}>{caminho || 'Biblioteca'}</dd>
              </div>
            </dl>
          </TabsContent>

          {/* 2 · Histórico pessoal */}
          <TabsContent value="historico" className="pt-1">
            <div className="rounded-xl border border-dashed bg-muted/30 px-4 py-10 text-center text-sm text-muted-foreground">
              Seu histórico deste material aparece aqui depois do primeiro acesso — onde você parou e suas marcações.
            </div>
          </TabsContent>

          {/* 3 · Download e link */}
          <TabsContent value="download" className="space-y-3 pt-1">
            <a
              href={`/api/conteudo/baixar?doc=${encodeURIComponent(doc.id)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
            >
              <Download className="h-4 w-4" />Baixar material
            </a>
            <div className="rounded-xl border bg-muted/30 p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Link2 className="h-3.5 w-3.5" />Link do material
              </div>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={linkMaterial}
                  className="min-w-0 flex-1 truncate rounded-lg border bg-background px-2.5 py-1.5 text-xs text-muted-foreground outline-none"
                />
                <button
                  type="button"
                  onClick={copiarLink}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors hover:bg-muted"
                >
                  {copiado ? <><Check className="h-3.5 w-3.5 text-emerald-600" />Copiado</> : 'Copiar'}
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">Só funciona para quem tem acesso ao material.</p>
            </div>
          </TabsContent>

          {/* 4 · Detalhes + Relatar erro */}
          <TabsContent value="detalhes" className="space-y-3 pt-1">
            <dl className="divide-y rounded-xl border text-sm">
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <dt className="text-muted-foreground">Tipo</dt>
                <dd className="font-medium text-foreground">{tipo.label}</dd>
              </div>
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <dt className="flex items-center gap-1.5 text-muted-foreground"><FolderOpen className="h-3.5 w-3.5" />Pasta</dt>
                <dd className="max-w-[60%] truncate font-medium text-foreground" title={caminho}>{caminho || 'Biblioteca'}</dd>
              </div>
            </dl>

            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">O que você pode fazer</div>
              <PermissaoQuadros
                kind={kind}
                valor={{ ler: temVisualizador, baixar: true, grifar: temVisualizador }}
                somenteLeitura
              />
            </div>

            {/* Relatar erro */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
              {relatoEnviado ? (
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Check className="h-4 w-4 text-emerald-600" />Obrigado! Seu relato foi registrado.
                </div>
              ) : relatarAberto ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />Relatar erro neste material
                  </div>
                  <textarea
                    value={relatoTexto}
                    onChange={(e) => setRelatoTexto(e.target.value)}
                    rows={3}
                    placeholder="Descreva o que está errado (gabarito, página, conteúdo desatualizado…)."
                    className="w-full resize-none rounded-lg border bg-background px-2.5 py-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setRelatarAberto(false)} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">Cancelar</button>
                    <button
                      type="button"
                      disabled={!relatoTexto.trim()}
                      onClick={() => setRelatoEnviado(true)}
                      className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                      <Send className="h-3 w-3" />Enviar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setRelatarAberto(true)}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400"
                >
                  <AlertTriangle className="h-4 w-4" />Relatar erro
                </button>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DrawerLateral>
  )
}
