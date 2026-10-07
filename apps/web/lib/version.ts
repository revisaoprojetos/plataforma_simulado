// Versão do sistema (versionamento semântico MAJOR.MINOR.PATCH).
//
// REGRA (a partir de 2026-10-05): TODO push bumpa esta constante + registra o resumo em CHANGELOG.md,
// e ao gerar a imagem informamos qual versão é.
//   - PATCH (x.y.Z): ajuste pequeno / correção de bug.
//   - MINOR (x.Y.0): área ou funcionalidade nova.
//   - MAJOR (X.0.0): mudança grande (ex.: redesign geral do sistema).
//
// É exibida no rodapé esquerdo da tela de login (`v{APP_VERSION}`).
export const APP_VERSION = '3.3.1'
