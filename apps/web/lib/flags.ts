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
 * EDITOR_CADERNO_NOVO: usa o novo editor unificado de cadernos (tela única com edição +
 * seleção de banco/questões + toda a configuração/aparência/material num só lugar). Em
 * construção — liga via env NEXT_PUBLIC_EDITOR_CADERNO_NOVO=1 (default: editor atual).
 */
export const EDITOR_CADERNO_NOVO = process.env.NEXT_PUBLIC_EDITOR_CADERNO_NOVO === '1'
