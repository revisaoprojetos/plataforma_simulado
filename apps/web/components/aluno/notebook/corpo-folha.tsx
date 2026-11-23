'use client'
// Página tipo "folha livre" do Caderno (beta): <FolhaLivre/> no lugar do TipTap, com o MESMO autosave das páginas de texto
// (useAutosave: debounce 1 s / maxWait 5 s, PATCH {versao, client_op_id, tinta}, 409, fila offline, flush em visibilitychange/pagehide).
// Carregado via next/dynamic (ssr:false) por editor-pagina.tsx.
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { criarFolhaVazia, validarFolha, type Folha } from '@/lib/aluno/notebook-folha'
import { FolhaLivre } from './folha-livre/folha-livre'
import { useAutosave } from './useAutosave'
import { useTituloPropagado } from './use-titulo-propagado'
import { carregarPagina } from './onenote/cliente-caderno'
import { IndicadorSalvo } from './indicador-salvo'
import { TituloOneNote } from './onenote/titulo-pagina'
import type { OpcoesOneNote } from './onenote/tipos'

export type PaginaFolha = { id: string; titulo: string; tinta: unknown; versao: number }
type Props = { pagina: PaginaFolha; onTitulo: (id: string, titulo: string) => void; onSalvo?: (id: string, quando: string) => void } & OpcoesOneNote

const btnTxt: React.CSSProperties = { minHeight: 44, padding: '0 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', fontWeight: 800, cursor: 'pointer' }
const folhaDe = (t: unknown): Folha => { const r = t ? validarFolha(t) : null; return r && r.ok ? r.folha : criarFolhaVazia() }

function CorpoFolha({ pagina, onTitulo, onSalvo, variante, criadoEm, onEstado, onEditor, onAutosave }: Props) {
  const onenote = variante === 'onenote'
  const [titulo, setTitulo] = useState(pagina.titulo ?? '')
  const [folha, setFolha] = useState<Folha>(() => folhaDe(pagina.tinta))
  const tituloRef = useRef(titulo); tituloRef.current = titulo
  const folhaRef = useRef(folha); folhaRef.current = folha

  const auto = useAutosave({
    paginaId: pagina.id,
    versaoInicial: pagina.versao,
    // só os campos SUJOS: título isolado => PATCH só com título; tinta isolada => sem título
    obter: (sujo) => ({ ...(sujo.corpo ? { tinta: folhaRef.current as unknown as Record<string, unknown> } : {}), ...(sujo.titulo ? { titulo: tituloRef.current } : {}) }),
    onSalvo: (_v, alt) => { onSalvo?.(pagina.id, new Date().toISOString()); if (alt.titulo !== undefined) onTitulo(pagina.id, alt.titulo) },
  })

  useEffect(() => {
    onEstado?.({ fase: auto.fase, online: auto.online, semPersistencia: auto.semPersistencia, retry: auto.tentarDeNovo })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto.fase, auto.online, auto.semPersistencia])

  // `auto` é um objeto novo a cada render: handlers passados à folha usam REF (identidade estável => a folha/caixas não re-renderizam à toa).
  const autoRef = useRef(auto); autoRef.current = auto
  const aoMudar = useCallback((nova: Folha) => { folhaRef.current = nova; setFolha(nova); autoRef.current.marcarSujo('corpo') }, [])
  useEffect(() => {
    onAutosave?.({ flush: () => autoRef.current.flush(), setVersaoBase: (v) => autoRef.current.setVersaoBase(v) })
    return () => onAutosave?.(null)
  }, [onAutosave])
  const { propagar } = useTituloPropagado(pagina.id, onTitulo)
  const aoTitulo = (v: string) => { const t = v.slice(0, 200); setTitulo(t); propagar(t); auto.marcarSujo('titulo') }

  const usarServidor = useCallback(async () => {
    let p = auto.paginaServidor as { titulo?: string; tinta?: unknown; versao: number } | null
    if (!p || !p.tinta) {
      p = (await carregarPagina(pagina.id)).dados?.pagina ?? null
    }
    if (!p) return
    const nova = folhaDe(p.tinta)
    folhaRef.current = nova; setFolha(nova)
    setTitulo(p.titulo ?? ''); onTitulo(pagina.id, p.titulo ?? '')
    auto.usarServidor(p.versao)
  }, [auto, pagina.id, onTitulo])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%', height: onenote ? '100%' : undefined }}>
      {auto.migracaoPendente ? <div role="status" style={{ padding: 12, color: 'var(--muted)', fontSize: 14 }}>Recurso em preparação, volte em breve.</div> : null}
      {auto.fase === 'conflito' ? (
        <div role="alert" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: '10px 14px', margin: '0 0 10px', borderRadius: 12, background: 'var(--dangerBg)', color: 'var(--danger)', fontSize: 13.5, fontWeight: 700 }}>
          <span style={{ flex: 1, minWidth: 180 }}>Esta página mudou em outro lugar.</span>
          <button type="button" onClick={usarServidor} style={btnTxt}>Usar a do servidor</button>
          <button type="button" onClick={auto.manterMinha} style={btnTxt}>Manter a minha</button>
        </div>
      ) : null}
      {auto.semPersistencia ? <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 8px' }}>O armazenamento do navegador está bloqueado aqui: se você ficar offline e recarregar, as últimas edições podem se perder.</p> : null}

      {onenote ? <div style={{ padding: '0 36px', flexShrink: 0 }}><TituloOneNote id="nb-titulo" valor={titulo} onChange={aoTitulo} criadoEm={criadoEm} /></div> : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '0 2px 8px' }}>
        <input id="nb-titulo" value={titulo} onChange={(e) => aoTitulo(e.target.value)} placeholder="Título da página" aria-label="Título da página" maxLength={200}
          style={{ flex: 1, minWidth: 200, background: 'transparent', border: 0, outline: 'none', fontSize: 24, fontWeight: 800, color: 'var(--ink)', minHeight: 44 }} />
        <IndicadorSalvo fase={auto.fase} online={auto.online} semPersistencia={auto.semPersistencia} onRetry={auto.tentarDeNovo} />
      </div>}

      <div style={onenote ? { flex: '1 1 0', minHeight: 320, width: '100%' } : { height: 'calc(100dvh - 260px)', minHeight: 480, width: '100%' }}>
        <FolhaLivre valor={folha} onChange={aoMudar} onenote={onenote} aoEditor={onenote ? onEditor : undefined} />
      </div>
    </div>
  )
}

export default memo(CorpoFolha)
