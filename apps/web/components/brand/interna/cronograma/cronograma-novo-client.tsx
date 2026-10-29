'use client'

// Wrapper CLIENT do novo Cronograma (design novo + DADOS REAIS). Liga os handlers:
//  • marcar meta → POST /api/aluno/cronograma/check (otimista; o design já atualiza o estado na hora)
//  • gerar → POST /api/aluno/cronograma/gerar → navega pra emissão criada
// Backend-first: a página server só LÊ o snapshot (carregarCronogramaData) e passa pra cá.
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CronogramaData } from '@/lib/cronograma/nova-tipos'
import type { InternaTheme } from '../interna-tokens'
import { useIsMobile } from '../perfil/use-is-mobile'
import { CronogramaRevisao } from './cronograma-revisao'

export function CronogramaNovoClient({ data, theme, tab }: { data: CronogramaData; theme: InternaTheme; tab?: string }) {
  const mobile = useIsMobile()
  const router = useRouter()
  const [gerando, setGerando] = useState(false)

  // metaId → {data,titulo} p/ enriquecer o check (referência na tabela).
  const metaInfo = useMemo(() => {
    const m = new Map<string, { data?: string; titulo?: string }>()
    for (const s of data.plano?.semanas ?? []) for (const mt of s.metas) m.set(mt.id, { titulo: mt.title })
    return m
  }, [data])

  const onToggle = (metaId: string, done: boolean) => {
    const emissaoId = data.plano?.emissaoId
    if (!emissaoId) return
    const info = metaInfo.get(metaId)
    void fetch('/api/aluno/cronograma/check', {
      method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ emissaoId, metaId, marcar: done, titulo: info?.titulo }),
    }).catch(() => {}) // otimista: o design já refletiu; falha silenciosa não trava o aluno
  }

  const onGerar = (baseId: string) => {
    if (!baseId || gerando) return
    setGerando(true)
    void fetch('/api/aluno/cronograma/gerar', {
      method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ cronogramaId: baseId }),
    })
      .then((r) => r.json())
      .then((j) => { if (j?.ok && j.emissaoId) { router.push(`/aluno/cronograma?emissao=${j.emissaoId}`); router.refresh() } })
      .catch(() => {})
      .finally(() => setGerando(false))
  }

  return <CronogramaRevisao theme={theme} tab={tab} mobile={mobile} data={data} onToggle={onToggle} onGerar={onGerar} generating={gerando} />
}
