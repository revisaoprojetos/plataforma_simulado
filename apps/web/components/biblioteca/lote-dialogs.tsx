'use client'

// Diálogo ÚNICO das ações em lote da Biblioteca (admin):
//  - ação avulsa sobre a seleção (mover, status, acesso, visibilidade, categoria, legenda, lixeira) e
//  - "Configurar pasta/seleção" (várias ações de uma vez, cada seção liga/desliga).
// Sempre mostra a PRÉVIA ("serão afetados N documentos") antes de confirmar e o RELATÓRIO por item depois.
// A escrita é toda no servidor (app/admin/biblioteca/lote-actions.ts).

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, X, FolderInput, CircleCheck, CircleAlert, ImageIcon, History } from 'lucide-react'
import { Overlay, MoverConteudoDialog } from '@/components/biblioteca/menus-drive'
import { CheckSelecao } from '@/components/biblioteca/selecao-lote'
import { confirmar } from '@/components/ui/confirm-dialog'
import { listarPastasConteudo, listarGruposBiblioteca } from '@/app/admin/biblioteca/actions'
import { previaLote, executarLote } from '@/app/admin/biblioteca/lote-actions'
import type { Categoria } from '@/app/admin/biblioteca/actions-tipos'
import type { AlvoLote, AcaoLote, PreviaLote, ResultadoLote, StatusLote, ModoAcessoLote } from '@/app/admin/biblioteca/lote-actions-tipos'

type Secao = AcaoLote['tipo']

export type InicialLote = Partial<{ status: StatusLote; acesso: ModoAcessoLote; oculto: boolean; categoria: Categoria }>

const SEL = 'h-9 w-full rounded-lg border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
const ROTULO_CATEGORIA: Record<Categoria, string> = { conteudo: 'Conteúdos', modelo_caderno: 'Modelos de caderno', jurisclub: 'JurisClub' }
const ROTULO_SECAO: Record<Secao, string> = {
  mover: 'Mover para a pasta', categoria: 'Categoria (coleção)', status: 'Status', acesso: 'Acesso dos alunos',
  visibilidade: 'Visibilidade', legenda: 'Legenda de grifos', lixeira: 'Enviar para a lixeira',
}

export function LoteDialog({ titulo, alvoBase, secoes, config, inicial, ehModelo, pausado, onFechar, onConcluido, onCapa, onAtualizacao }: {
  titulo: string
  alvoBase: AlvoLote
  secoes: Secao[]
  /** true = "Configurar": cada seção tem liga/desliga e várias ações rodam juntas. */
  config?: boolean
  inicial?: InicialLote
  ehModelo?: boolean
  /** true = há outro diálogo por cima (não fechar com Esc/fundo). */
  pausado?: boolean
  onFechar: () => void
  onConcluido: (r: ResultadoLote) => void
  /** "Configurar pasta": abre o editor de capa/página inicial da pasta (mecanismo de capa em lote existente). */
  onCapa?: () => void
  /** Abre "Registrar atualização" para todos os documentos do alvo. */
  onAtualizacao?: (alvo: AlvoLote) => void
}) {
  const temPastas = alvoBase.pastaIds.length > 0
  const [incluirSub, setIncluirSub] = useState(alvoBase.incluirSubpastas)
  const [ativos, setAtivos] = useState<Set<Secao>>(() => (config ? new Set<Secao>() : new Set(secoes)))
  const [destino, setDestino] = useState<string | null | undefined>(undefined)
  const [destinoNome, setDestinoNome] = useState('')
  const [moverAberto, setMoverAberto] = useState(false)
  const [pastas, setPastas] = useState<{ id: string; nome: string; pai_id: string | null }[] | null>(null)
  const [categoriaNova, setCategoriaNova] = useState<Categoria>(inicial?.categoria ?? 'conteudo')
  const [status, setStatus] = useState<StatusLote>(inicial?.status ?? 'publicado')
  const [acessoModo, setAcessoModo] = useState<ModoAcessoLote>(inicial?.acesso ?? 'todos')
  const [gruposModo, setGruposModo] = useState<'substituir' | 'adicionar'>('substituir')
  const [grupoSel, setGrupoSel] = useState<Set<string>>(() => new Set())
  const [grupos, setGrupos] = useState<{ id: string; nome: string }[] | null>(null)
  const [oculto, setOculto] = useState<boolean>(inicial?.oculto ?? false)
  const [legTabela, setLegTabela] = useState<'manter' | 'padrao' | 'ocultar' | 'mostrar'>('manter')
  const [legCat, setLegCat] = useState<'manter' | 'mostrar' | 'ocultar'>('manter')
  const [previa, setPrevia] = useState<PreviaLote | null>(null)
  const [fase, setFase] = useState<'form' | 'rodando' | 'resultado'>('form')
  const [resultado, setResultado] = useState<ResultadoLote | null>(null)

  const forcaSub = ativos.has('categoria')
  const subEfetivo = incluirSub || forcaSub
  const alvo: AlvoLote = useMemo(() => ({ ...alvoBase, incluirSubpastas: subEfetivo }), [alvoBase, subEfetivo])

  // Prévia (leitura pura) — recalcula quando muda o escopo.
  useEffect(() => {
    let vivo = true
    setPrevia(null)
    previaLote(alvo, { forcarSubpastas: forcaSub })
      .then((r) => { if (vivo) setPrevia(r) })
      .catch(() => { if (vivo) setPrevia({ ok: false, error: 'Falha ao calcular a prévia.', totalDocs: 0, totalPastas: 0, excedeu: false, amostra: [], docIds: [] }) })
    return () => { vivo = false }
  }, [alvo, forcaSub])

  useEffect(() => {
    if (ativos.has('mover') && !pastas) listarPastasConteudo(alvoBase.categoria).then(setPastas).catch(() => setPastas([]))
  }, [ativos, pastas, alvoBase.categoria])
  useEffect(() => {
    if (ativos.has('acesso') && acessoModo === 'restrito' && !grupos) {
      listarGruposBiblioteca()
        .then((r) => setGrupos(r.ok && r.grupos ? r.grupos.map((g) => ({ id: g.id, nome: g.nome })) : []))
        .catch(() => setGrupos([]))
    }
  }, [ativos, acessoModo, grupos])

  const alternarSecao = (s: Secao) => setAtivos((prev) => { const n = new Set(prev); if (n.has(s)) n.delete(s); else n.add(s); return n })
  const sp = (t: Secao) => ({ tipo: t, ligado: ativos.has(t), config: !!config, onToggle: () => alternarSecao(t) })

  const acoes: AcaoLote[] = []
  if (ativos.has('categoria')) acoes.push({ tipo: 'categoria', categoria: categoriaNova })
  if (ativos.has('mover') && destino !== undefined) acoes.push({ tipo: 'mover', destinoId: destino })
  if (ativos.has('status')) acoes.push({ tipo: 'status', status })
  if (ativos.has('acesso')) acoes.push({ tipo: 'acesso', modo: acessoModo, grupoIds: acessoModo === 'restrito' ? [...grupoSel] : undefined, gruposModo })
  if (ativos.has('visibilidade')) acoes.push({ tipo: 'visibilidade', oculto })
  if (ativos.has('legenda') && (legTabela !== 'manter' || legCat !== 'manter')) {
    const l: Extract<AcaoLote, { tipo: 'legenda' }> = { tipo: 'legenda' }
    if (legTabela !== 'manter') l.ocultarTabela = legTabela === 'padrao' ? null : legTabela === 'ocultar'
    if (legCat !== 'manter') l.categorias = legCat === 'mostrar'
    acoes.push(l)
  }
  if (ativos.has('lixeira')) acoes.push({ tipo: 'lixeira' })

  const faltaDestino = ativos.has('mover') && destino === undefined
  const faltaLegenda = ativos.has('legenda') && !acoes.some((a) => a.tipo === 'legenda')
  const podeAplicar = !!previa?.ok && !previa.excedeu && previa.totalDocs > 0 && acoes.length > 0 && !faltaDestino && !faltaLegenda && ativos.size === acoes.length

  async function aplicar() {
    if (!podeAplicar || !previa) return
    if (ativos.has('lixeira')) {
      const ok = await confirmar({
        titulo: `Enviar ${previa.totalDocs} ${previa.totalDocs === 1 ? 'documento' : 'documentos'} para a lixeira?`,
        mensagem: 'Ficam 30 dias na lixeira e podem ser restaurados antes do descarte automático.',
        confirmar: 'Enviar para a lixeira', destrutivo: true,
      })
      if (!ok) return
    }
    setFase('rodando')
    try {
      const r = await executarLote(alvo, acoes)
      if (!r.ok) { toast.error(r.error || 'Falha ao executar o lote.'); setFase('form'); return }
      setResultado(r); setFase('resultado')
    } catch (e: any) { toast.error(e?.message || 'Falha ao executar o lote.'); setFase('form') }
  }

  const mostrar = (s: Secao) => secoes.includes(s) && !(ehModelo && (s === 'acesso' || s === 'visibilidade' || s === 'legenda'))
  const nomeAlvo = [
    alvoBase.pastaIds.length ? `${alvoBase.pastaIds.length} ${alvoBase.pastaIds.length === 1 ? 'pasta' : 'pastas'}` : '',
    alvoBase.docIds.length ? `${alvoBase.docIds.length} ${alvoBase.docIds.length === 1 ? 'documento' : 'documentos'}` : '',
  ].filter(Boolean).join(' + ')

  return (
    <>
      <Overlay onFechar={pausado || moverAberto || fase === 'rodando' ? () => {} : onFechar} largura="max-w-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{titulo}</h2>
            <p className="text-xs text-muted-foreground">Seleção: {nomeAlvo}</p>
          </div>
          <button onClick={onFechar} disabled={fase === 'rodando'} aria-label="Fechar" className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-50"><X className="h-4 w-4" /></button>
        </div>

        {fase === 'resultado' && resultado ? (
          <Relatorio r={resultado} onFechar={() => onConcluido(resultado)} />
        ) : (
          <>
            {/* Escopo + PRÉVIA */}
            <div className="mb-3 space-y-2 rounded-xl border bg-muted/30 p-3 text-sm">
              {temPastas && (
                <div className="flex items-center gap-2.5">
                  <CheckSelecao marcado={subEfetivo} onToggle={() => { if (!forcaSub) setIncluirSub((v) => !v) }} rotulo="Incluir subpastas" className={forcaSub ? 'opacity-60' : ''} />
                  <span>Incluir subpastas{forcaSub && <span className="text-xs text-muted-foreground"> (obrigatório ao mudar a categoria)</span>}</span>
                </div>
              )}
              <div className="flex items-center gap-2" aria-live="polite">
                {!previa ? <><Loader2 className="h-4 w-4 animate-spin" /><span className="text-muted-foreground">Calculando…</span></>
                  : !previa.ok ? <><CircleAlert className="h-4 w-4 text-destructive" /><span className="text-destructive">{previa.error}</span></>
                  : previa.excedeu ? <><CircleAlert className="h-4 w-4 text-destructive" /><span className="text-destructive">A seleção tem mais de 1000 documentos — aplique por subpasta.</span></>
                  : <span>Serão afetados <strong>{previa.totalDocs}</strong> {previa.totalDocs === 1 ? 'documento' : 'documentos'}{previa.totalPastas > 0 && <> em {previa.totalPastas} {previa.totalPastas === 1 ? 'pasta' : 'pastas'}</>}.</span>}
              </div>
              {previa?.ok && previa.amostra.length > 0 && (
                <ul className="text-xs text-muted-foreground">
                  {previa.amostra.slice(0, 4).map((d) => <li key={d.id} className="truncate">• {d.titulo}</li>)}
                  {previa.totalDocs > 4 && <li>… e mais {previa.totalDocs - 4}</li>}
                </ul>
              )}
            </div>

            <div className="space-y-2.5">
              {mostrar('mover') && (
                <SecaoBox {...sp('mover')}>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setMoverAberto(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-muted"><FolderInput className="h-4 w-4" />Escolher pasta…</button>
                    <span className="min-w-0 truncate text-sm text-muted-foreground">{destino === undefined ? 'Nenhuma pasta escolhida' : destino === null ? 'Raiz (Início)' : destinoNome}</span>
                  </div>
                </SecaoBox>
              )}
              {mostrar('categoria') && (
                <SecaoBox {...sp('categoria')}>
                  <select value={categoriaNova} onChange={(e) => setCategoriaNova(e.target.value as Categoria)} aria-label="Categoria" className={SEL}>
                    {(Object.keys(ROTULO_CATEGORIA) as Categoria[]).map((c) => <option key={c} value={c}>{ROTULO_CATEGORIA[c]}</option>)}
                  </select>
                  <p className="text-xs text-muted-foreground">Documentos avulsos vão para a raiz da nova coleção; pastas selecionadas levam subpastas e documentos junto.</p>
                </SecaoBox>
              )}
              {mostrar('status') && (
                <SecaoBox {...sp('status')}>
                  <select value={status} onChange={(e) => setStatus(e.target.value as StatusLote)} aria-label="Status" className={SEL}>
                    <option value="publicado">Publicado</option>
                    <option value="rascunho">Rascunho</option>
                    <option value="arquivado">Arquivado</option>
                  </select>
                  {status === 'publicado' && <p className="text-xs text-muted-foreground">Documentos sem versão atual publicam a última versão; sem nenhuma versão, o item falha no relatório.</p>}
                </SecaoBox>
              )}
              {mostrar('acesso') && (
                <SecaoBox {...sp('acesso')}>
                  <select value={acessoModo} onChange={(e) => setAcessoModo(e.target.value as ModoAcessoLote)} aria-label="Modo de acesso" className={SEL}>
                    <option value="todos">Liberado a todos os alunos</option>
                    <option value="restrito">Restrito a grupos</option>
                    <option value="herdar">Herdar da pasta</option>
                    <option value="bloquear">Bloqueado (só equipe)</option>
                  </select>
                  {acessoModo === 'restrito' && (
                    <>
                      <select value={gruposModo} onChange={(e) => setGruposModo(e.target.value as 'substituir' | 'adicionar')} aria-label="Como aplicar os grupos" className={SEL}>
                        <option value="substituir">Substituir os grupos atuais pelos marcados</option>
                        <option value="adicionar">Adicionar os marcados aos grupos atuais</option>
                      </select>
                      <div className="max-h-44 overflow-auto rounded-lg border p-1">
                        {!grupos ? <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
                          : grupos.length === 0 ? <p className="p-3 text-center text-xs text-muted-foreground">Nenhum grupo cadastrado.</p>
                          : grupos.map((g) => (
                            <div key={g.id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                              <CheckSelecao marcado={grupoSel.has(g.id)} onToggle={() => setGrupoSel((p) => { const n = new Set(p); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n })} rotulo={`Grupo ${g.nome}`} />
                              <span className="truncate">{g.nome}</span>
                            </div>
                          ))}
                      </div>
                      <p className="text-xs text-muted-foreground">{grupoSel.size === 0 ? 'Nenhum grupo marcado = restrito sem ninguém (só a equipe vê).' : `${grupoSel.size} ${grupoSel.size === 1 ? 'grupo marcado' : 'grupos marcados'}.`}</p>
                    </>
                  )}
                </SecaoBox>
              )}
              {mostrar('visibilidade') && (
                <SecaoBox {...sp('visibilidade')}>
                  <select value={oculto ? 'oculto' : 'visivel'} onChange={(e) => setOculto(e.target.value === 'oculto')} aria-label="Visibilidade" className={SEL}>
                    <option value="visivel">Visível ao aluno</option>
                    <option value="oculto">Oculto do aluno</option>
                  </select>
                </SecaoBox>
              )}
              {mostrar('legenda') && (
                <SecaoBox {...sp('legenda')}>
                  <label className="block text-xs text-muted-foreground">Tabela de legenda do início (LegProc)
                    <select value={legTabela} onChange={(e) => setLegTabela(e.target.value as typeof legTabela)} className={`${SEL} mt-1`}>
                      <option value="manter">Não alterar</option>
                      <option value="padrao">Voltar ao padrão (oculta)</option>
                      <option value="ocultar">Ocultar para o aluno</option>
                      <option value="mostrar">Mostrar para o aluno</option>
                    </select>
                  </label>
                  <label className="block text-xs text-muted-foreground">Legenda de categorias no leitor
                    <select value={legCat} onChange={(e) => setLegCat(e.target.value as typeof legCat)} className={`${SEL} mt-1`}>
                      <option value="manter">Não alterar</option>
                      <option value="mostrar">Mostrar</option>
                      <option value="ocultar">Ocultar</option>
                    </select>
                  </label>
                  {faltaLegenda && <p className="text-xs text-amber-700 dark:text-amber-400">Escolha ao menos uma opção diferente de “Não alterar”.</p>}
                </SecaoBox>
              )}
              {mostrar('lixeira') && (
                <SecaoBox {...sp('lixeira')}>
                  <p className="text-sm text-muted-foreground">Os documentos saem da Biblioteca e ficam 30 dias na lixeira antes do descarte automático.</p>
                </SecaoBox>
              )}

              {/* Itens que abrem seus próprios editores (só no "Configurar") */}
              {config && onCapa && alvoBase.pastaIds.length === 1 && (
                <div className="flex items-center justify-between gap-2 rounded-xl border p-3">
                  <div className="min-w-0"><div className="text-sm font-semibold">Capa e página inicial</div><p className="text-xs text-muted-foreground">Vale para todos os documentos da pasta (modo “lote”), exceto os que têm capa própria.</p></div>
                  <button type="button" onClick={onCapa} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-muted"><ImageIcon className="h-4 w-4" />Abrir…</button>
                </div>
              )}
              {config && onAtualizacao && !ehModelo && (
                <div className="flex items-center justify-between gap-2 rounded-xl border p-3">
                  <div className="min-w-0"><div className="text-sm font-semibold">Registrar atualização</div><p className="text-xs text-muted-foreground">Registra a atualização para todos os documentos do escopo acima.</p></div>
                  <button type="button" disabled={!previa?.ok || previa.excedeu || previa.totalDocs === 0} onClick={() => onAtualizacao(alvo)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"><History className="h-4 w-4" />Registrar…</button>
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={onFechar} disabled={fase === 'rodando'} className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60">Cancelar</button>
              <button
                onClick={aplicar} disabled={!podeAplicar || fase === 'rodando'}
                className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50 ${ativos.has('lixeira') ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'}`}
              >
                {fase === 'rodando' && <Loader2 className="h-4 w-4 animate-spin" />}
                {fase === 'rodando' ? 'Aplicando…' : previa?.ok ? `Aplicar em ${previa.totalDocs} ${previa.totalDocs === 1 ? 'documento' : 'documentos'}` : 'Aplicar'}
              </button>
            </div>
          </>
        )}
      </Overlay>
      {moverAberto && (
        <MoverConteudoDialog
          titulo="Mover para…"
          subtitulo="Escolha a pasta de destino — entre nas pastas ou clique para selecionar"
          pastas={pastas}
          atualId={destino ?? null}
          onConfirm={(sel) => { setDestino(sel); setDestinoNome(sel ? (pastas?.find((p) => p.id === sel)?.nome ?? 'Pasta') : 'Raiz (Início)'); setMoverAberto(false) }}
          onClose={() => setMoverAberto(false)}
        />
      )}
    </>
  )
}

function SecaoBox({ tipo, ligado, config, onToggle, children }: { tipo: Secao; ligado: boolean; config: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border p-3 transition-colors ${ligado ? 'border-primary/40 bg-primary/5' : ''}`}>
      <div className="flex items-center gap-2.5">
        {config && <CheckSelecao marcado={ligado} onToggle={onToggle} rotulo={`Aplicar: ${ROTULO_SECAO[tipo]}`} />}
        <span className="text-sm font-semibold">{ROTULO_SECAO[tipo]}</span>
      </div>
      {ligado && <div className="mt-2.5 space-y-2">{children}</div>}
    </div>
  )
}

/** Relatório do lote: resumo + itens com falha (e o motivo). */
function Relatorio({ r, onFechar }: { r: ResultadoLote; onFechar: () => void }) {
  const falhos = r.itens.filter((i) => !i.ok)
  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-2.5 rounded-xl border p-3 text-sm ${r.falhas ? 'border-amber-500/40 bg-amber-500/10' : 'border-emerald-500/40 bg-emerald-500/10'}`} role="status">
        {r.falhas ? <CircleAlert className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" /> : <CircleCheck className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />}
        <div>
          <div className="font-semibold">{r.sucesso} de {r.total} {r.total === 1 ? 'documento atualizado' : 'documentos atualizados'}{r.falhas > 0 && ` — ${r.falhas} com erro`}</div>
          <div className="text-xs text-muted-foreground">{r.porAcao.map((a) => `${a.tipo}: ${a.ok} ok${a.falhas ? `, ${a.falhas} erro(s)` : ''}`).join(' · ')}</div>
        </div>
      </div>
      {falhos.length > 0 && (
        <div className="max-h-56 overflow-auto rounded-xl border">
          <ul className="divide-y text-sm">
            {falhos.map((i) => (
              <li key={i.id} className="px-3 py-2"><div className="truncate font-medium" title={i.titulo}>{i.titulo}</div><div className="text-xs text-destructive">{i.erro}</div></li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Registrado na auditoria (uma entrada-resumo com ids e estado anterior por item). Repetir a operação é seguro.</p>
      <div className="flex justify-end"><button onClick={onFechar} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">Concluir</button></div>
    </div>
  )
}
