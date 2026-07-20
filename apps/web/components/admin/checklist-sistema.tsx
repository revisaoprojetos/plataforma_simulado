import { CheckCircle2, CircleDashed, Circle, ShieldCheck, ServerCog, BookOpen, Database, MessageSquare, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

type Status = 'pronto' | 'parcial' | 'pendente'
type Item = { nome: string; status: Status; desc: string }
type Grupo = { titulo: string; icon: any; itens: Item[] }

const GRUPOS: Grupo[] = [
  {
    titulo: 'Segurança & Acesso', icon: ShieldCheck, itens: [
      { nome: 'RBAC (perfis × permissões)', status: 'pronto', desc: 'Papéis e permissões por módulo, com enforcement no servidor.' },
      { nome: 'Auditoria completa', status: 'pronto', desc: 'Quem fez o quê, com antes/depois, IP e dispositivo.' },
      { nome: 'Rate limit + lockout no login', status: 'pronto', desc: 'Proteção contra força-bruta no acesso.' },
      { nome: 'Consentimento LGPD', status: 'parcial', desc: 'Modelo previsto; falta o fluxo obrigatório no 1º acesso.' },
      { nome: 'Direitos do titular (exportar/excluir dados)', status: 'pendente', desc: 'Portabilidade e exclusão sob solicitação (LGPD).' },
      { nome: '2FA/MFA para administradores', status: 'pendente', desc: 'Segundo fator para contas do painel.' },
    ],
  },
  {
    titulo: 'Operação & Disponibilidade', icon: ServerCog, itens: [
      { nome: 'Manutenção da plataforma', status: 'pronto', desc: 'Bloqueio do portal com aviso e avisos prévios (esta área).' },
      { nome: 'Auto-encerramento de simulados', status: 'pronto', desc: 'Fecha sessões por janela/tempo automaticamente.' },
      { nome: 'Monitor de jobs & filas', status: 'parcial', desc: 'Fila BullMQ funcionando; falta painel de visibilidade dos jobs.' },
      { nome: 'Health check / status', status: 'parcial', desc: '/api/health existe; falta página de status agregada.' },
      { nome: 'Backup automático do banco', status: 'pendente', desc: 'Rotina de backup + restauração testada.' },
    ],
  },
  {
    titulo: 'Conteúdo & Avaliação', icon: BookOpen, itens: [
      { nome: 'Banco de questões + taxonomia', status: 'pronto', desc: 'Bancas, disciplinas, assuntos, dificuldade, etiquetas.' },
      { nome: 'Simulados (janela/prazo/aberto)', status: 'pronto', desc: 'Modos de aplicação, embaralhamento, retentativas.' },
      { nome: 'Re-correção / anulação', status: 'pronto', desc: 'Recalcula notas e ranking, com relatório antes/depois.' },
      { nome: 'PDF (caderno/relatório) via worker', status: 'pronto', desc: 'Geração assíncrona pelo Gotenberg.' },
      { nome: 'Correção de discursivas', status: 'pendente', desc: 'Canvas/anotações/lock e competências (fase posterior).' },
    ],
  },
  {
    titulo: 'Dados & Integrações', icon: Database, itens: [
      { nome: 'Exportação Excel/CSV das tabelas', status: 'pronto', desc: 'Estudantes, Questões e Matrículas (estender às demais).' },
      { nome: 'Importação Curseduca / Guru', status: 'pronto', desc: 'Alunos, grupos e liberação de acesso por compra.' },
      { nome: 'Dedupe por external_id', status: 'pronto', desc: 'Ingestão idempotente na importação.' },
      { nome: 'API pública + webhooks (HMAC)', status: 'parcial', desc: 'Webhooks de entrada ok; falta API versionada + docs.' },
    ],
  },
  {
    titulo: 'Comunicação', icon: MessageSquare, itens: [
      { nome: 'Mensagens/bloqueios por tenant', status: 'pronto', desc: 'Templates de bloqueio/liberação/alerta com variáveis.' },
      { nome: 'Central de notificações in-app', status: 'pendente', desc: 'Caixa de avisos do aluno/admin dentro do sistema.' },
      { nome: 'E-mail / WhatsApp', status: 'pendente', desc: 'Envio transacional (via N8N) para eventos-chave.' },
    ],
  },
  {
    titulo: 'Experiência', icon: Sparkles, itens: [
      { nome: 'White-label (tema por tenant)', status: 'pronto', desc: 'Marca, cores, logos, claro/escuro.' },
      { nome: 'Aparência (hub tabs/sub-tabs)', status: 'pronto', desc: 'Identidade, cores, carregamento organizados.' },
      { nome: 'Portal do aluno + área embedável', status: 'pronto', desc: 'Login leve e widget para iframe.' },
      { nome: 'Busca global (command palette)', status: 'pendente', desc: 'Atalho ⌘K para navegar/pesquisar em tudo.' },
    ],
  },
]

const STATUS_CFG: Record<Status, { label: string; icon: any; cls: string }> = {
  pronto: { label: 'Pronto', icon: CheckCircle2, cls: 'text-emerald-600 dark:text-emerald-400' },
  parcial: { label: 'Parcial', icon: CircleDashed, cls: 'text-amber-600 dark:text-amber-400' },
  pendente: { label: 'Pendente', icon: Circle, cls: 'text-muted-foreground' },
}

export function ChecklistSistema() {
  const todos = GRUPOS.flatMap((g) => g.itens)
  const prontos = todos.filter((i) => i.status === 'pronto').length
  const parciais = todos.filter((i) => i.status === 'parcial').length
  const pct = Math.round((prontos / todos.length) * 100)

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Prontidão do sistema</h3>
            <p className="text-sm text-muted-foreground">{prontos} prontos · {parciais} parciais · {todos.length - prontos - parciais} pendentes de {todos.length} funções essenciais.</p>
          </div>
          <span className="text-2xl font-bold tabular-nums text-primary">{pct}%</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {GRUPOS.map((g) => {
          const Icon = g.icon
          const ok = g.itens.filter((i) => i.status === 'pronto').length
          return (
            <div key={g.titulo} className="overflow-hidden rounded-xl border bg-card">
              <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2.5">
                <span className="flex items-center gap-2 font-semibold"><Icon className="h-4 w-4 text-primary" /> {g.titulo}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{ok}/{g.itens.length}</span>
              </div>
              <ul className="divide-y">
                {g.itens.map((it) => {
                  const s = STATUS_CFG[it.status]
                  const SIcon = s.icon
                  return (
                    <li key={it.nome} className="flex items-start gap-3 px-4 py-2.5">
                      <SIcon className={cn('mt-0.5 h-4 w-4 shrink-0', s.cls)} />
                      <div className="min-w-0">
                        <p className={cn('text-sm font-medium', it.status === 'pendente' && 'text-muted-foreground')}>{it.nome}</p>
                        <p className="text-xs text-muted-foreground">{it.desc}</p>
                      </div>
                      <span className={cn('ml-auto shrink-0 self-center text-[11px] font-semibold uppercase', s.cls)}>{s.label}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
