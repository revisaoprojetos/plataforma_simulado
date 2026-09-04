'use client'

// Espelho de alterações (antes/depois) — usado no admin (professor) e no leitor (aluno).
import type { BlocoDiff, DiffDoc, Token } from '@/lib/leitura/diff-tipos'

export function DiffEspelho({ diff }: { diff: DiffDoc }) {
  if (!diff.blocos.length) {
    return <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">Nenhuma diferença de texto entre estas versões.</p>
  }
  return (
    <div className="space-y-3">
      {diff.blocos.map((b, i) => <Bloco key={i} b={b} />)}
    </div>
  )
}

function Tokens({ tokens }: { tokens: Token[] }) {
  return (
    <>
      {tokens.map((t, i) =>
        t.t === 'ig' ? (
          <span key={i}>{t.s}</span>
        ) : t.t === 'add' ? (
          <span key={i} className="rounded bg-emerald-500/20 text-emerald-800 dark:text-emerald-200">{t.s}</span>
        ) : (
          <span key={i} className="rounded bg-rose-500/20 text-rose-800 line-through dark:text-rose-200">{t.s}</span>
        ),
      )}
    </>
  )
}

function Bloco({ b }: { b: BlocoDiff }) {
  const cor = b.estado === 'add' ? 'border-emerald-400/50' : b.estado === 'rem' ? 'border-rose-400/50' : 'border-amber-400/50'
  const rotuloEstado = b.estado === 'add' ? 'Adicionado' : b.estado === 'rem' ? 'Removido' : 'Alterado'
  const corBadge =
    b.estado === 'add' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
      : b.estado === 'rem' ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
        : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'

  return (
    <div className={`overflow-hidden rounded-2xl border bg-card shadow-sm ${cor}`}>
      <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${corBadge}`}>{rotuloEstado}</span>
        {b.rotulo && <span className="text-sm font-medium">{b.rotulo}</span>}
      </div>

      {b.estado === 'mod' ? (
        <div className="grid gap-px bg-border sm:grid-cols-2">
          <div className="bg-card p-4">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Antes</p>
            <p className="text-sm leading-relaxed"><Tokens tokens={b.antes} /></p>
          </div>
          <div className="bg-card p-4">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Depois</p>
            <p className="text-sm leading-relaxed"><Tokens tokens={b.depois} /></p>
          </div>
        </div>
      ) : (
        <div className={`leitura-prosa p-4 text-sm ${b.estado === 'rem' ? 'opacity-70' : ''}`} dangerouslySetInnerHTML={{ __html: b.html }} />
      )}
    </div>
  )
}
