'use client'

import { TrilhaSistema, type Trilha } from '@/components/aluno/trilha-simulados'
import type { TrilhaSimbolos } from '@/lib/gamificacao/trilha-simbolos'
import type { TrilhaFormato } from '@/lib/gamificacao/trilha-formato'

// Trilha de EXEMPLO (dados fictícios) — só p/ a prévia da Aparência. Os nós cobrem os 3 estados
// (concluído / em andamento / disponível) + um "bloqueado" (sem href) p/ demonstrar todos os balões.
const MOCK: Trilha = {
  id: 'preview', nome: 'Semana 1 — Exemplo', cor: null, total: 4, done: 1, trilhaXp: 100, bauResgatado: false,
  nodes: [
    { id: 'p1', titulo: 'Dia 01 — Introdução', quando: 'Concluído', estado: 'concluido', acerto: 80, nota: 8, tentativas: 1, statusLabel: 'Concluído · 8/10 · +40 XP', questoes: 10, xp: 40, href: '#', acao: 'Reler', capa: null, capaBanner: null, cadernoUrl: null },
    { id: 'p2', titulo: 'Dia 02 — Conteúdo', quando: 'Em andamento · 12 min', estado: 'atual', acerto: null, nota: null, tentativas: 0, statusLabel: 'Leitura em andamento', questoes: 10, xp: 40, href: '#', acao: 'Continuar', capa: null, capaBanner: null, cadernoUrl: null },
    { id: 'p3', titulo: 'Dia 03 — Prática', quando: 'Disponível', estado: 'disponivel', acerto: null, nota: null, tentativas: 0, statusLabel: 'Disponível', questoes: 10, xp: 40, href: '#', acao: 'Começar', capa: null, capaBanner: null, cadernoUrl: null },
    { id: 'p4', titulo: 'Dia 04 — Revisão', quando: null, estado: 'disponivel', acerto: null, nota: null, tentativas: 0, statusLabel: 'Conclua a aula anterior', questoes: 10, xp: 40, href: null, acao: 'Bloqueada', capa: null, capaBanner: null, cadernoUrl: null },
  ],
}

/**
 * Prévia AO VIVO do formato: renderiza a trilha de exemplo no formato selecionado, com os balões/cards
 * reais (o nó "em andamento" abre o balão sozinho). Muda na hora ao trocar o formato ou os símbolos.
 */
export function TrilhaFormatoPreview({ formato, simbolos }: { formato: TrilhaFormato; simbolos: TrilhaSimbolos }) {
  return (
    <div className="rounded-2xl border bg-muted/30 p-4">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prévia do formato — exemplo</p>
      <p className="mb-3 text-[11px] text-muted-foreground">Trilha fictícia só para demonstração. Clique nos nós para ver os balões.</p>
      <div className="max-h-[520px] overflow-auto rounded-xl border bg-background p-4">
        <TrilhaSistema trilhas={[MOCK]} gamAtivo simbolos={simbolos} formato={formato} semFundo />
      </div>
    </div>
  )
}
