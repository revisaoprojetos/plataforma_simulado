'use client'

// "TEMAS DO DIA": lista de tópicos na barra de índice (acima do sumário). Número + nome + tags (selos)
// + nº de questões; clicar rola até o tópico e o atual fica destacado (scroll-spy via `ativo`).
// Compartilhado pelo leitor do aluno e pela prévia do admin.

import { SELOS } from '@/lib/leitura/selos'
import { TOPICO_DEFAULT, type TopicoBase, type TopicosConfig } from '@/lib/leitura/topicos'
import { cn } from '@/lib/utils'

// Tag = IMAGEM oficial do selo (variante compacta "-sm", feita p/ listas/filtros). Mantém o designer
// importado (ícone + rótulo + órgão + cores do JurisClub) em vez de um badge recriado.
function TagSelo({ slug }: { slug: string }) {
  const def = SELOS[slug]
  if (!def) return null
  return <img src={`/leitura/selos/${slug}-sm.png`} alt={def.nome} title={def.nome} draggable={false} className="h-[18px] w-auto max-w-full" />
}

export function TemasDoDia({ topicos, config, ativo, onIr, className }: {
  topicos: TopicoBase[]
  config: TopicosConfig
  ativo?: string | null
  onIr: (key: string) => void
  className?: string
}) {
  const visiveis = topicos.filter((t) => (config[t.key]?.incluido ?? true))
  if (!visiveis.length) return null
  return (
    <div className={cn('space-y-2', className)}>
      <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Temas do dia</p>
      <ol className="space-y-1.5">
        {visiveis.map((t, i) => {
          const c = config[t.key] ?? TOPICO_DEFAULT
          const on = ativo === t.key
          return (
            <li key={t.key}>
              <button
                onClick={() => onIr(t.key)}
                className={cn('flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition-colors',
                  on ? 'border-primary bg-primary/[0.05]' : 'border-transparent hover:bg-muted')}
              >
                <span className={cn('mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-bold',
                  on ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-snug text-foreground">{t.nome}</span>
                  {(c.tags.length > 0 || c.questoes > 0) && (
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      {c.tags.map((slug) => <TagSelo key={slug} slug={slug} />)}
                      {c.questoes > 0 && (
                        <span className="text-[11px] font-medium text-muted-foreground">{c.questoes} {c.questoes === 1 ? 'questão' : 'questões'}</span>
                      )}
                    </span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
