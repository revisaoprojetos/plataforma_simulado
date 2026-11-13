'use client'

// Campos "quando" + interruptores de exibição ao aluno + PRÉVIA ao vivo — compartilhado entre Registrar e Editar atualização.
// A prévia usa o MESMO helper das telas do aluno (montarTagAtualizacao/prefixarTag): "10/11/2026: texto".

import { EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { BRT_LABEL } from '@/lib/brt'
import { NOME_TIPO_ATUALIZACAO } from '@/lib/admin-revisao/biblioteca-tipos'
import { combinarDataHoraBrt, montarTagAtualizacao, type LinhaAtualizacao, type TipoAtualizacao } from '@/lib/conteudo/atualizacoes-tipos'

export interface ExibicaoState { data: string; hora: string; exibirData: boolean; exibirHora: boolean; exibirRotulo: boolean }

export function CamposQuando({ v, onChange, rotulo, tipo, texto, disponivel }: {
  v: ExibicaoState; onChange: (patch: Partial<ExibicaoState>) => void; rotulo: string; tipo: TipoAtualizacao; texto: string; disponivel: boolean
}) {
  const semHora = !v.hora.trim()
  const iso = combinarDataHoraBrt(v.data, v.hora)
  const t = montarTagAtualizacao({ ocorridaEm: iso, exibirData: v.exibirData, exibirHora: v.exibirHora && !semHora, exibirRotulo: v.exibirRotulo, rotulo })
  const corpo = texto.trim() || 'atualização disso e daquilo'
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Data <span className="font-normal text-muted-foreground">· {BRT_LABEL}</span></span>
          <Input type="date" value={v.data} onChange={(e) => onChange({ data: e.target.value })} />
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Hora <span className="font-normal text-muted-foreground">(opcional)</span></span>
          <Input type="time" value={v.hora} onChange={(e) => onChange({ hora: e.target.value })} />
        </label>
      </div>

      <div className="space-y-2 rounded-lg border p-3 text-sm">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">O que o aluno vê</div>
        <Linha titulo="Mostrar data" checked={v.exibirData} onChange={(c) => onChange({ exibirData: c })} disabled={!disponivel} />
        <Linha titulo="Mostrar hora" checked={v.exibirHora && !semHora} onChange={(c) => onChange({ exibirHora: c })} disabled={!disponivel || semHora} dica={semHora ? 'Informe uma hora para poder exibi-la.' : undefined} />
        <Linha titulo="Mostrar rótulo" checked={v.exibirRotulo} onChange={(c) => onChange({ exibirRotulo: c })} disabled={!disponivel} />
        {!disponivel && <p className="text-xs text-muted-foreground">Aplicar a migração 20261120010000 para ocultar data, hora ou rótulo (por enquanto tudo aparece ao aluno).</p>}
        <div className="rounded-md bg-muted/50 px-2.5 py-2 text-sm">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Prévia para o aluno</div>
          {v.exibirRotulo ? <div className="mb-0.5 font-semibold">{t.rotulo ?? NOME_TIPO_ATUALIZACAO[tipo]}</div> : null}
          <div className="break-words">{t.tag ? <><b>{t.tag}</b>{texto.trim() ? ': ' : ''}{texto.trim() ? corpo : ''}</> : corpo}</div>
        </div>
      </div>
    </div>
  )
}

function Linha({ titulo, checked, onChange, disabled, dica }: { titulo: string; checked: boolean; onChange: (c: boolean) => void; disabled?: boolean; dica?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0"><span className="font-medium">{titulo}</span>{dica ? <span className="ml-2 text-xs text-muted-foreground">{dica}</span> : null}</span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={titulo} />
    </div>
  )
}

/** Indicação discreta, nas listas do admin, do que está oculto ao aluno. */
export function OcultoAoAluno({ r }: { r: Pick<LinhaAtualizacao, 'exibirData' | 'exibirHora' | 'exibirRotulo'> }) {
  const o = [!r.exibirData && 'data', !r.exibirHora && 'hora', !r.exibirRotulo && 'rótulo'].filter(Boolean) as string[]
  if (!o.length) return null
  return <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" title={`Oculto ao aluno: ${o.join(', ')}`}><EyeOff className="h-3 w-3" />{o.join(', ')}</span>
}
