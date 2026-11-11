'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, NotebookPen } from 'lucide-react'
import { toast } from 'sonner'
import { NovaModal } from '@/components/nova/modal'
import type { MetaDatada } from '@/lib/cronograma/tipos'

/**
 * A anotação do aluno numa meta.
 *
 * O botão muda de cara conforme exista nota ou não — anotação que não se vê de fora é
 * anotação que se esquece, e o aluno precisa saber onde já escreveu antes de abrir.
 *
 * Salva ao fechar, e não a cada tecla: escrever é pensar, e um "salvo" piscando a cada
 * palavra atrapalha. O texto vazio apaga a nota, porque "sem anotação" e "anotação em branco"
 * são a mesma coisa para quem lê.
 */
export function NotaMeta({
  meta,
  emissaoId,
  nota,
  aoSalvar,
  compacto,
}: {
  meta: MetaDatada
  emissaoId: string
  nota: string | undefined
  aoSalvar: (metaId: string, texto: string) => void
  /** Na grade a linha é apertada: só o ícone. No diálogo do dia cabe o rótulo. */
  compacto?: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState(nota ?? '')
  const [salvando, setSalvando] = useState(false)

  // O texto do diálogo acompanha o que veio de fora enquanto ele está fechado.
  useEffect(() => {
    if (!aberto) setTexto(nota ?? '')
  }, [nota, aberto])

  const tem = !!(nota ?? '').trim()

  // onClose estável: o NovaModal refoca o painel quando a função muda, o que tiraria o foco do textarea a cada tecla.
  const gravarRef = useRef<() => Promise<void>>(async () => {})
  const aoFechar = useCallback(() => { void gravarRef.current() }, [])

  async function gravar() {
    const limpo = texto.trim()
    if (limpo === (nota ?? '').trim()) {
      setAberto(false)
      return
    }
    setSalvando(true)
    let r: { ok: boolean; error?: string }
    try {
      // Rota de API: server action não funciona em domínio custom / iframe Curseduca.
      const res = await fetch('/api/aluno/cronograma/nota', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emissaoId, metaId: meta.id, texto: limpo, data: meta.data, titulo: meta.titulo }) })
      r = await res.json()
    } catch { r = { ok: false, error: 'Sem conexão. Tente de novo.' } }
    setSalvando(false)
    if (!r.ok) {
      toast.error(r.error ?? 'Não foi possível salvar a anotação.')
      return
    }
    aoSalvar(meta.id, limpo)
    setAberto(false)
    toast.success(limpo ? 'Anotação salva' : 'Anotação removida', { duration: 1400 })
  }

  gravarRef.current = gravar

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setAberto(true)
        }}
        title={tem ? `Sua anotação: ${(nota ?? '').slice(0, 80)}` : 'Escrever uma anotação'}
        aria-label={tem ? 'Ver a anotação desta meta' : 'Anotar nesta meta'}
        className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-1 text-xs transition ${
          tem
            ? 'border-[var(--brand)] bg-[var(--chip)] text-[var(--brand)]'
            : 'border-transparent text-[var(--sub)] hover:border-[var(--line)] hover:text-[var(--ink)]'
        }`}
      >
        <NotebookPen className="h-3.5 w-3.5" />
        {!compacto && (tem ? 'anotação' : 'anotar')}
      </button>

      {aberto && (
        <div onClick={(e) => e.stopPropagation()}>
        <NovaModal
          w={560}
          onClose={aoFechar}
          titulo={<span className="flex items-center gap-2"><NotebookPen className="h-5 w-5" style={{ color: 'var(--brand)' }} />Sua anotação</span>}
        >
          {/* O modal fica dentro do mapa de tokens shadcn (--muted = fundo); aqui o texto de apoio usa --sub. */}
          <p className="text-[13px]" style={{ color: 'var(--sub)', margin: 0 }}>
            {meta.tipoDef.nome} · {meta.titulo}
            {meta.complemento && <span className="block text-xs">{meta.complemento}</span>}
          </p>

          <textarea
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--brand)]"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={7}
            maxLength={4000}
            autoFocus
            placeholder="O que você quer lembrar sobre esta meta — dúvidas, o que revisar, onde parou…"
            onKeyDown={(e) => {
              // Ctrl/Cmd+Enter grava sem tirar a mão do teclado.
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                void gravar()
              }
            }}
          />

          <p className="text-xs" style={{ color: 'var(--sub)', margin: 0 }}>
            Só você vê. Fica salva neste cronograma e aparece no PDF, se você exportar.{' '}
            <span className="opacity-70">Ctrl+Enter salva · apagar tudo remove a anotação.</span>
          </p>

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setAberto(false)} disabled={salvando} className="h-9 rounded-[11px] border border-[var(--line)] bg-[var(--surface)] px-3.5 text-[13px] font-bold text-[var(--ink)] disabled:opacity-60">
              Fechar sem salvar
            </button>
            <button type="button" onClick={gravar} disabled={salvando} className="inline-flex h-9 items-center gap-1.5 rounded-[11px] px-3.5 text-[13px] font-extrabold disabled:opacity-60" style={{ background: 'var(--btnPrimary)', color: 'var(--btnText, var(--pn-ffffff,#FFFFFF))' }}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </button>
          </div>
        </NovaModal>
        </div>
      )}
    </>
  )
}
