import { CabecalhoArea } from '@/components/admin/cabecalho-area'
import { AbasLinha } from '@/components/ui/abas-linha'
import { cn } from '@/lib/utils'
import { BarraSetorSlot } from '@/components/admin/barra-setor-slot'

// Primitivas compartilhadas das telas "Plataforma Revisão" (protótipo admin-plataforma-revisao).
// Cabeçalho = caminho + título + subtítulo + ações (como `head()` do protótipo); abas = sublinhado (border-b-2).
// Só apresentação: nenhum cálculo aqui — as páginas só LÊEM dados prontos do servidor.

export function RevisaoHead({
  secao,
  titulo,
  subtitulo,
  acoes,
  abas,
}: {
  secao?: string
  titulo: string
  subtitulo?: string
  acoes?: React.ReactNode
  /** Abas próprias da área (2ª fileira), repassadas ao CabecalhoArea. */
  abas?: React.ReactNode
}) {
  return (
    <CabecalhoArea
      eyebrow={secao}
      titulo={titulo}
      descricao={subtitulo}
      acoes={acoes}
      abas={abas}
      className="mb-5"
    />
  )
}

export type AbaRevisao = { id: string; titulo: string; contagem?: number; /** Aba que NAVEGA para outra tela (link direto, nunca fica ativa). */ href?: string }

/** Abas de LINHA (sublinhado), navegação por `?<param>=<id>` — estado na URL, página renderiza no servidor. */
export function RevisaoAbas({
  abas,
  atual,
  base,
  param = 'aba',
  extra,
}: {
  abas: AbaRevisao[]
  atual: string
  base: string // ex.: '/admin/revisao/cursos/abc'
  param?: string
  extra?: Record<string, string | undefined> // outros params a preservar
}) {
  const href = (id: string) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(extra ?? {})) if (v) q.set(k, v)
    q.set(param, id)
    return `${base}?${q.toString()}`
  }
  return (
    <>
    {/* Sem RevisaoHead na página, a barra do setor entra aqui, acima destas abas (dedup: aparece 1x). */}
    <BarraSetorSlot />
    <AbasLinha className="mb-4" ativo={atual} itens={abas.map((a) => ({ key: a.id, label: a.titulo, badge: a.contagem != null && a.contagem > 0 ? a.contagem : undefined, href: a.href ?? href(a.id) }))} />
    </>
  )
}

export function RevisaoCard({ titulo, children, className }: { titulo?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border bg-card p-4 shadow-sm', className)}>
      {titulo && <h2 className="mb-3 text-sm font-semibold">{titulo}</h2>}
      {children}
    </section>
  )
}
