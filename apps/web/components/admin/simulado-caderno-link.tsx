'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Palette, Loader2, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { vincularCadernoSimulado } from '@/app/admin/simulados/actions'

/**
 * Vincula um caderno de design ao simulado — o tema/HUD (cores + estilos das páginas
 * de login, entrada, prova e prova encerrada) desse caderno passa a ser aplicado no simulado.
 */
export function SimuladoCadernoLink({ simuladoId, cadernos, atual }: {
  simuladoId: string
  cadernos: { id: string; nome: string }[]
  atual: string | null
}) {
  const [val, setVal] = useState(atual ?? '')
  const [pending, start] = useTransition()

  function salvar(v: string) {
    setVal(v)
    start(async () => {
      const r = await vincularCadernoSimulado(simuladoId, v || null)
      if (r?.error) toast.error(r.error)
      else toast.success(v ? 'Caderno vinculado — o tema será aplicado no simulado.' : 'Vínculo removido (voltou ao automático).')
    })
  }

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-1 flex items-center gap-2">
        <Palette className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Tema / HUD do simulado</h3>
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Escolha o caderno cujo tema (cores e estilos das páginas de login, entrada, prova e prova encerrada) será aplicado neste simulado.
        Em <strong>Automático</strong>, o tema é resolvido pelo banco das questões.
      </p>
      <div className="flex items-center gap-2">
        <select
          value={val}
          onChange={(e) => salvar(e.target.value)}
          disabled={pending}
          className="h-9 flex-1 rounded-md border bg-[var(--input-bg,transparent)] px-3 text-sm disabled:opacity-60"
        >
          <option value="">Automático (pelo banco das questões)</option>
          {cadernos.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
        {val && (
          <Link href={`/admin/cadernos/${val}`} target="_blank"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
            <ExternalLink className="h-3.5 w-3.5" /> Editar tema
          </Link>
        )}
      </div>
    </div>
  )
}
