import {
  FolderOpen, BookOpen, Scale, Gavel, Landmark, GraduationCap, FileText, Brain, Library, Star, Target, ListChecks,
} from 'lucide-react'

/** Paleta e ícones para personalização visual dos bancos (pastas). */
export const BANCO_CORES = ['#6d28d9', '#8b5cf6', '#4f7fff', '#0ea5e9', '#06b6d4', '#10b981', '#84cc16', '#f59e0b', '#ef4444', '#f43f7f', '#ec4899', '#64748b']

export const BANCO_ICONES: Record<string, React.ComponentType<{ className?: string }>> = {
  folder: FolderOpen, livro: BookOpen, balanca: Scale, martelo: Gavel, predio: Landmark,
  formatura: GraduationCap, arquivo: FileText, cerebro: Brain, biblioteca: Library,
  estrela: Star, alvo: Target, lista: ListChecks,
}

// Ícones de banco/pasta REMOVIDOS — retorna um componente vazio (não renderiza nada) para
// zerar a "utilidade" dos ícones em todo o app sem precisar editar cada consumidor.
const SemIcone: React.ComponentType<{ className?: string }> = () => null
export function iconeBanco(_icone?: string | null): React.ComponentType<{ className?: string }> {
  return SemIcone
}
