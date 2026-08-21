/**
 * Flags de funcionalidade da plataforma.
 *
 * OCULTAR_DISCURSIVA: esconde da interface tudo que é da parte discursiva
 * (menu de correção, opção de tipo discursivo, modelos de caderno discursivo/redação,
 * simulados/questões discursivas nas listagens). É o DEFAULT GLOBAL por env (deploy):
 * defina NEXT_PUBLIC_DISCURSIVA_ATIVA=true para LIGAR a discursiva; sem o env, fica escondida.
 *
 * POR-TENANT: além deste env, a área "Correção discursiva" pode ser posta em MANUTENÇÃO no
 * admin (Configuração → Sistema → Páginas em manutenção). O valor efetivo é `env OU manutenção`
 * — ver `ocultarDiscursivaDe()` em `lib/sistema/manutencao-areas.ts` (server) e
 * `useOcultarDiscursiva()` em `components/auth/can-provider.tsx` (client).
 */
export const OCULTAR_DISCURSIVA = process.env.NEXT_PUBLIC_DISCURSIVA_ATIVA !== 'true'

/**
 * OCULTAR_ALUNO_EXTRAS: esconde da área do aluno os módulos Banco de Questões,
 * Favoritos e Cadernos (menu lateral + atalhos da home). Temporário — voltar
 * para false quando essas áreas forem liberadas para os alunos.
 */
export const OCULTAR_ALUNO_EXTRAS = true

// Rotas do aluno ocultas enquanto OCULTAR_ALUNO_EXTRAS estiver ligado.
// Banco de Questões reativado (área dedicada de prática com filtros + histórico).
export const ROTAS_ALUNO_OCULTAS = ['/aluno/favoritos', '/aluno/cadernos']
