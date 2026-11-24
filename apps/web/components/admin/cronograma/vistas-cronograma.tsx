'use client'

import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { AbasLinha } from '@/components/ui/abas-linha'
import { useCan } from '@/components/auth/can-provider'
import { grupoDaRota, gruposVisiveis, hrefDaVista, mostraSubabas, modalidadePorId, rotaSemCabecalho } from '@/lib/admin/cronogramas-nav'

/** Badges das vistas do Adaptativo que o shell antigo mostrava (id da vista → campo do endpoint de contagens). */
const VISTAS_COM_CONTAGEM: Record<string, 'mat' | 'disc' | 'regras'> = { cobertura: 'mat', disciplinas: 'disc', regras: 'regras' }
type Contagens = Partial<Record<'mat' | 'disc' | 'regras', number | null>>

// Cache de módulo (remonta a cada página): 1 fetch por minuto, fora do caminho de render; falha = sem badge.
let cacheContagens: { em: number; dados: Contagens } | null = null
let emVoo: Promise<Contagens> | null = null
function carregarContagens(): Promise<Contagens> {
  if (cacheContagens && Date.now() - cacheContagens.em < 60_000) return Promise.resolve(cacheContagens.dados)
  emVoo ??= fetch('/api/admin/cronogramas/contagens', { credentials: 'same-origin' })
    .then((r) => (r.ok ? (r.json() as Promise<Contagens>) : {}))
    .catch(() => ({}) as Contagens)
    .then((dados) => { if (Object.keys(dados).length) cacheContagens = { em: Date.now(), dados }; emVoo = null; return dados })
  return emVoo
}

/**
 * Abas INTERNAS da aba ativa (as telas dela), no padrão AbasLinha, no início do CONTEÚDO (não é uma fileira do cabeçalho).
 * Só aparece com 2+ telas visíveis e fora das telas de edição. Cada vista é uma rota/`?v=`: só a ativa carrega dados.
 * Vistas com `carrega` (ex.: busca de aluno `q`) levam esses params ao trocar de vista.
 */
export function VistasCronograma() {
  const pathname = usePathname()
  const search = useSearchParams()
  const can = useCan()
  const rota = grupoDaRota(pathname, search)
  const visivel = !!rota && !rotaSemCabecalho(pathname)
  const precisaContagem = visivel && rota!.modalidade.id === 'adaptativo' && rota!.grupo.subs.some((s) => s.id in VISTAS_COM_CONTAGEM)
  const [contagens, setContagens] = useState<Contagens>(() => cacheContagens?.dados ?? {})
  useEffect(() => {
    if (!precisaContagem) return
    let vivo = true
    carregarContagens().then((d) => { if (vivo) setContagens(d) })
    return () => { vivo = false }
  }, [precisaContagem])
  if (!rota || !visivel) return null

  const ativo = gruposVisiveis(modalidadePorId(rota.modalidade.id), can).find((g) => g.id === rota.grupo.id)
  if (!ativo || !mostraSubabas(ativo)) return null

  const subAtiva = ativo.subs.find((s) => s.id === rota.subaba.id)
  return (
    <div className="mb-4">
    <AbasLinha
      className="mb-2"
      aria-label={`Telas de ${ativo.label}`}
      ativo={rota.subaba.id}
      itens={ativo.subs.map((s) => {
        const campo = VISTAS_COM_CONTAGEM[s.id]
        const n = rota.modalidade.id === 'adaptativo' && campo ? contagens[campo] : null
        return { key: s.id, label: s.label, href: hrefDaVista(s, search), title: s.dica, badge: typeof n === 'number' ? n.toLocaleString('pt-BR') : undefined }
      })}
    />
    {subAtiva?.dica && <p className="m-0 text-xs text-muted-foreground">{subAtiva.dica}</p>}
    </div>
  )
}
