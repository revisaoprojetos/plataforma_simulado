import Link from 'next/link'
import { Boxes, ChevronRight } from 'lucide-react'
import { TesteEditoresClient } from './teste-client'

export const dynamic = 'force-dynamic'

// SPIKE (super-admin): área isolada pra testar os editores Office reais (Collabora / OnlyOffice) com .docx
// nativo — avaliar a migração do construtor de caderno. Não afeta o resto do sistema.
export default function TestePage() {
  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Teste · Editores Office</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Área de spike para avaliar um editor <b>Word/LibreOffice de verdade</b> dentro do sistema (docx nativo),
          no lugar do construtor de blocos HTML. Crie um documento e abra no editor — o cabeçalho/rodapé/paginação
          são nativos da engine. Requer os serviços locais rodando (ver instruções abaixo).
        </p>
      </div>
      <Link href="/admin/teste/agentes" className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm transition-colors hover:border-primary">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Boxes className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Pipeline de multi-agents · níveis</div>
          <div className="text-xs text-muted-foreground">Motor de IA em 3 níveis (Haiku → Sonnet → Opus) com visualização de tokens/custo por nível.</div>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      </Link>
      <TesteEditoresClient />
    </div>
  )
}
