'use client'

/**
 * Destino de uma meta do tipo Simulado.
 *
 * A meta pode apontar um simulado DESTA plataforma — e aí o aluno vai direto para a
 * prova, sujeito à matrícula dele — ou um simulado EXTERNO, com nome e link livres.
 * São modos excludentes: escolher um limpa o outro, para a meta nunca ficar com dois
 * destinos e o gerador ter de adivinhar qual usar.
 */

import { useMemo, useState } from 'react'
import { Check, ExternalLink, Search, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export type SimuladoOpcao = { id: string; titulo: string; status: string }

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

export function SimuladoPicker({
  simulados,
  simuladoId,
  externoNome,
  externoUrl,
  onChange,
}: {
  simulados: SimuladoOpcao[]
  simuladoId: string | null
  externoNome: string | null
  externoUrl: string | null
  onChange: (v: { simulado_id: string | null; simulado_externo_nome: string | null; simulado_externo_url: string | null }) => void
}) {
  const temExterno = !!(externoNome || externoUrl)
  const [modo, setModo] = useState<'interno' | 'externo'>(temExterno && !simuladoId ? 'externo' : 'interno')
  const [busca, setBusca] = useState('')

  const escolhido = useMemo(() => simulados.find((s) => s.id === simuladoId) ?? null, [simulados, simuladoId])

  const filtrados = useMemo(() => {
    const t = normalizar(busca)
    const base = t ? simulados.filter((s) => normalizar(s.titulo).includes(t)) : simulados
    return base.slice(0, 40)
  }, [simulados, busca])

  function trocarModo(novo: 'interno' | 'externo') {
    setModo(novo)
    // Trocar de modo limpa o outro destino — a meta tem um só.
    if (novo === 'interno') onChange({ simulado_id: simuladoId, simulado_externo_nome: null, simulado_externo_url: null })
    else onChange({ simulado_id: null, simulado_externo_nome: externoNome, simulado_externo_url: externoUrl })
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex overflow-hidden rounded-md border">
        {(
          [
            ['interno', 'Simulado da plataforma'],
            ['externo', 'Simulado externo'],
          ] as const
        ).map(([v, rotulo]) => (
          <button
            key={v}
            type="button"
            onClick={() => trocarModo(v)}
            className={cn('flex-1 px-3 py-1.5 text-sm transition', modo === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {modo === 'interno' ? (
        <div className="space-y-2">
          {escolhido ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
              <Check className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate text-sm">{escolhido.titulo}</span>
              <Badge variant="outline" className="shrink-0">
                {escolhido.status}
              </Badge>
              <button
                type="button"
                onClick={() => onChange({ simulado_id: null, simulado_externo_nome: null, simulado_externo_url: null })}
                title="Remover"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-md border px-3 py-1.5">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar simulado…"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>

              <div className="max-h-48 overflow-y-auto rounded-md border">
                {filtrados.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhum simulado encontrado.</p>
                ) : (
                  filtrados.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        onChange({ simulado_id: s.id, simulado_externo_nome: null, simulado_externo_url: null })
                      }
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition hover:bg-muted"
                    >
                      <span className="min-w-0 flex-1">{s.titulo}</span>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {s.status}
                      </Badge>
                    </button>
                  ))
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                O aluno vai direto para a prova. Quem não tiver matrícula nela vê a meta com aviso de sem
                acesso — a linha não some da grade.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Nome do simulado</Label>
            <Input
              value={externoNome ?? ''}
              onChange={(e) =>
                onChange({ simulado_id: null, simulado_externo_nome: e.target.value, simulado_externo_url: externoUrl })
              }
              placeholder="Simulado CEBRASPE — 2ª fase"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Link</Label>
            <Input
              value={externoUrl ?? ''}
              onChange={(e) =>
                onChange({ simulado_id: null, simulado_externo_nome: externoNome, simulado_externo_url: e.target.value })
              }
              placeholder="https://…"
            />
          </div>
          {externoUrl && (
            <a
              href={externoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Abrir link <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </div>
  )
}
