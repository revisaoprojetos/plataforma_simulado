'use client'
// Canvas central: reaproveita EditorPagina (texto, TipTap) / CorpoFolha (folha livre) na variante OneNote.
// Suporta cor da página (fundo), linhas de régua/grade (só fundo), zoom e seções automáticas (somente leitura).
import dynamic from 'next/dynamic'
import { memo, useEffect, useMemo } from 'react'
import { FilePlus2 } from 'lucide-react'
import { ListaAuto } from './lista-auto'
import { atualizarDesenho } from './estado-desenho'
import { REGUAS_UI, tokenFundo, type OpcoesOneNote, type Pagina, type Selecao } from './tipos'

const Editor = dynamic(() => import('../editor-pagina'), { ssr: false, loading: () => <Carregando /> })

function Carregando() {
  return (
    <div aria-busy="true" aria-label="Carregando página" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[40, 100, 92, 80].map((w, i) => <div key={i} style={{ height: i ? 14 : 30, width: `${w}%`, borderRadius: 4, background: 'var(--surface2)' }} />)}
    </div>
  )
}

/** Fundo CSS das linhas de régua/grade (linhas finas na cor do texto com baixa opacidade). */
export function fundoRegua(chave?: string | null): string | undefined {
  const r = REGUAS_UI.find((x) => x.chave === chave)
  if (!r || !r.passo) return undefined
  const linha = 'color-mix(in srgb, var(--ink) 16%, transparent)'
  const h = `repeating-linear-gradient(to bottom, transparent 0, transparent ${r.passo - 1}px, ${linha} ${r.passo - 1}px, ${linha} ${r.passo}px)`
  if (!r.grade) return h
  return `${h}, repeating-linear-gradient(to right, transparent 0, transparent ${r.passo - 1}px, ${linha} ${r.passo - 1}px, ${linha} ${r.passo}px)`
}

export const CanvasPagina = memo(function CanvasPagina({ selecao, pagina, zoom, onTitulo, onSalvo, onNovaPagina, semPaginas, opcoes }: {
  selecao: Selecao; pagina: Pagina | null; zoom: number
  onTitulo: (id: string, t: string) => void; onSalvo?: (id: string, q: string) => void
  onNovaPagina: () => void; semPaginas: boolean
  opcoes: Pick<OpcoesOneNote, 'onEstado' | 'onEditor' | 'onAutosave'>
}) {
  const cor = tokenFundo(pagina?.fundo)
  const fundo = useMemo(() => fundoRegua(pagina?.regua), [pagina?.regua])
  // Folha livre: zoom e fundo são aplicados POR DENTRO da folha (o CSS `zoom` do contêiner desalinharia as coordenadas da tinta).
  const ehFolha = selecao?.tipo === 'pagina' && pagina?.tipo_pagina === 'folha_livre'
  useEffect(() => {
    atualizarDesenho({ pagina: { zoom: ehFolha ? zoom : 1, fundoCor: cor, fundoImg: fundo ?? null } })
  }, [ehFolha, zoom, cor, fundo])

  return (
    <section aria-label="Página" style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: ehFolha ? 'hidden' : 'auto', background: 'var(--surface)', color: 'var(--ink)' }}>
      <div style={ehFolha
        ? { height: '100%', width: '100%', backgroundColor: cor ?? undefined, padding: '12px 0 0', display: 'flex', flexDirection: 'column' }
        : { minHeight: '100%', width: '100%', backgroundColor: cor ?? undefined, backgroundImage: fundo, backgroundPosition: '0 8px', padding: '12px 36px 96px', zoom }}>
        {selecao?.tipo === 'pagina' && pagina ? (
          <Editor key={pagina.id} paginaId={pagina.id} onTitulo={onTitulo} onSalvo={onSalvo}
            variante="onenote" criadoEm={pagina.criado_em ?? pagina.atualizado_em ?? null} onEstado={opcoes.onEstado} onEditor={opcoes.onEditor} onAutosave={opcoes.onAutosave} />
        ) : selecao?.tipo === 'auto' ? (
          <ListaAuto key={selecao.auto} tipo={selecao.auto} />
        ) : (
          <div style={{ padding: 24, color: 'var(--muted)', fontSize: 14, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
            {semPaginas ? 'Esta seção ainda não tem páginas.' : 'Escolha uma página na lista à direita.'}
            <button type="button" onClick={onNovaPagina} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 36, padding: '0 14px', border: '1px solid var(--brandLine)', borderRadius: 6, background: 'var(--chip)', color: 'var(--brand)', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }}>
              <FilePlus2 size={16} aria-hidden />Adicionar página
            </button>
          </div>
        )}
      </div>
    </section>
  )
})
