import Link from 'next/link'
import { Boxes, ChevronRight, NotebookPen } from 'lucide-react'
import { TesteEditoresClient } from './teste-client'
import { BarraSetorSlot } from '@/components/admin/barra-setor-slot'

export const dynamic = 'force-dynamic'

// SPIKE (super-admin): área isolada pra testar os editores Office reais (Collabora / OnlyOffice) com .docx
// nativo — avaliar a migração do construtor de caderno. Não afeta o resto do sistema.
// Também dá acesso às áreas dedicadas dos editores de caderno do aluno (BookStack / AFFiNE).
const EDITORES_CADERNO = [
  { href: '/admin/teste/bookstack', nome: 'BookStack', sub: 'Notas open source: estante > livro > capítulo > página. Licença MIT.' },
  { href: '/admin/teste/affine', nome: 'AFFiNE', sub: 'Páginas + tela livre (edgeless). Backend com licença própria (EE).' },
]

export default function TestePage() {
  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Teste · Editores</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Área de spike para avaliar um editor <b>Word/LibreOffice de verdade</b> dentro do sistema (docx nativo),
          no lugar do construtor de blocos HTML. Crie um documento e abra no editor — o cabeçalho/rodapé/paginação
          são nativos da engine. Requer os serviços locais rodando (ver instruções abaixo).
        </p>
      </div>
      <BarraSetorSlot />
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Editores de caderno do aluno (estilo OneNote)</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {EDITORES_CADERNO.map((c) => (
            <Link key={c.href} href={c.href} className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm transition-colors hover:border-primary">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><NotebookPen className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{c.nome}</div>
                <div className="text-xs text-muted-foreground">{c.sub}</div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Acessar <ChevronRight className="h-4 w-4" /></span>
            </Link>
          ))}
        </div>
      </section>
      <Link href="/aluno/nova/cadernos/onenote" className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm transition-colors hover:border-primary">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><NotebookPen className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Caderno OneNote (interface própria do aluno)</div>
          <div className="text-xs text-muted-foreground">Abre a área em tela cheia com a conta de aluno ativa neste navegador (aluno testador do Workspace, ou &quot;Visualizar como aluno&quot; com permissão de agir). Sem sessão de aluno, pede o login do aluno.</div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Acessar <ChevronRight className="h-4 w-4" /></span>
      </Link>
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
