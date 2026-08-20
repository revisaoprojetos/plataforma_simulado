/**
 * Flags de funcionalidade da plataforma.
 *
 * OCULTAR_DISCURSIVA: esconde da interface tudo que é da parte discursiva
 * (menu de correção, opção de tipo discursivo, modelos de caderno discursivo/redação,
 * simulados/questões discursivas nas listagens). Ainda em construção — ligar de volta
 * (false) quando a discursiva estiver pronta.
 */
export const OCULTAR_DISCURSIVA = true

/**
 * OCULTAR_ALUNO_EXTRAS: esconde da área do aluno os módulos Banco de Questões,
 * Favoritos e Cadernos (menu lateral + atalhos da home). Temporário — voltar
 * para false quando essas áreas forem liberadas para os alunos.
 */
export const OCULTAR_ALUNO_EXTRAS = true

// Rotas do aluno ocultas enquanto OCULTAR_ALUNO_EXTRAS estiver ligado.
// Banco de Questões reativado (área dedicada de prática com filtros + histórico).
export const ROTAS_ALUNO_OCULTAS = ['/aluno/favoritos', '/aluno/cadernos']

/**
 * OCULTAR_CRONOGRAMA: esconde o módulo Cronograma de Estudos (menu do admin + menu do
 * aluno) enquanto as telas estão em construção.
 *
 * O gate REAL de produção não é esta constante, e sim a coluna `ativo` de
 * `simulado_cronograma_config`, que liga o módulo por tenant. Esta flag existe só para
 * o período de desenvolvimento, em que nem as telas estão prontas. Ligar de volta
 * (false) quando o CRUD e a tela do aluno estiverem navegáveis.
 */
export const OCULTAR_CRONOGRAMA = true
