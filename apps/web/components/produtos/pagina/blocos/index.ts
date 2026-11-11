// API pública dos renderers compartilhados da página do extensivo (admin + aluno).
export { BlocoRender, PaginaRender, type BlocoRenderProps, type PaginaRenderProps } from './pagina-render'
export { RENDERERS } from './registro-renderers'
export { EdicaoProvider, useEdicao, Editavel, type EditavelProps } from './edicao-ctx'
export { resolverLocal } from './resolver-local'
