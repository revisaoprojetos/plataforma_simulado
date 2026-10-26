'use client'
import { cn } from '@/lib/utils'
import { TIPOS_CONTEUDO, type KindConteudo } from '@/lib/biblioteca/tipos-conteudo'

// Quadradinhos de permissão (`.pp` da spec 01 §5): 3 chaves `ler` / `baixar` / `grifar`, com a LETRA e o
// rótulo variando por tipo. Ativo = marca; inativo = cinza. `somenteLeitura` (origem via-pacote) desabilita.

export type Permissoes = { ler: boolean; baixar: boolean; grifar: boolean }
type Chave = keyof Permissoes

export function PermissaoQuadros({
  kind,
  valor,
  onChange,
  somenteLeitura,
  className,
}: {
  kind: KindConteudo
  valor: Permissoes
  onChange?: (chave: Chave, ativo: boolean) => void
  somenteLeitura?: boolean
  className?: string
}) {
  const labels = TIPOS_CONTEUDO[kind].permissoes
  const chaves: Chave[] = ['ler', 'baixar', 'grifar']
  return (
    <div className={cn('inline-flex gap-1.5', className)} role="group" aria-label="Permissões do aluno">
      {chaves.map((ch) => {
        const ativo = !!valor[ch]
        const info = labels[ch]
        const interativo = !!onChange && !somenteLeitura
        return (
          <button
            key={ch}
            type="button"
            disabled={!interativo}
            onClick={interativo ? () => onChange!(ch, !ativo) : undefined}
            title={`${info.rotulo}${somenteLeitura ? ' (definido no pacote)' : ''}`}
            aria-pressed={ativo}
            aria-label={info.rotulo}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg border text-sm font-bold transition-colors',
              ativo ? 'border-primary/30 bg-primary/12 text-primary' : 'border-border bg-muted text-muted-foreground',
              interativo ? 'cursor-pointer hover:border-primary/40' : 'cursor-default',
              somenteLeitura && 'opacity-80',
            )}
          >
            {info.letra}
          </button>
        )
      })}
    </div>
  )
}
