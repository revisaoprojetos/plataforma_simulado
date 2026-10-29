// "Voltar inteligente" por ORIGEM. O link que abre um curso/desafio carrega `?origem=<path>` indicando
// de onde veio (ex.: /aluno/nova/cursos). O botão "Voltar" lê esse param e volta pra lá; sem origem,
// cai no destino padrão (a lista do desafio). Guarda anti open-redirect: só caminho interno do aluno.
export function origemSegura(origem: string | null | undefined, fallback: string): string {
  if (!origem) return fallback
  try { origem = decodeURIComponent(origem) } catch { /* já decodificado */ }
  // Só caminhos internos do portal do aluno (bloqueia //host, http://, javascript:, etc.).
  if (/^\/aluno(\/|$|\?)/.test(origem) && !origem.startsWith('//')) return origem
  return fallback
}
