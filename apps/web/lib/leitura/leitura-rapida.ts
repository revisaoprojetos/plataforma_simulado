// CONTRATO da "Leitura rápida": o HTML (página enxuta com leitura + questões) roda num IFRAME sandbox
// isolado — a plataforma NÃO lê o DOM dele. Para registrar as respostas e concluir o desafio, o HTML
// AVISA o pai (a plataforma) via window.parent.postMessage(...). A plataforma escuta, PERSISTE cada
// resposta (para o aluno poder sair e voltar) e, quando TODAS forem respondidas, grava a conclusão
// (mesmo motor do desafio: XP + sequência + ranking + medalhas). Ver app/api/leitura/rapida/route.ts.
//
// Comunicação em 2 vias (sempre targetOrigin '*', pois o iframe é sandbox sem same-origin):
//   iframe → plataforma (window.parent):
//     { source:'leitura-rapida', tipo:'resposta',  questao, alternativa, correta }   // a cada resposta
//     { source:'leitura-rapida', tipo:'progresso', respondidas, total, acertos }      // opcional (HUD)
//     { source:'leitura-rapida', tipo:'concluido', acertos, total }                   // quando TODAS respondidas
//     { source:'leitura-rapida', tipo:'pronto' }                                      // carregou; pede restauração
//   plataforma → iframe (window):
//     { source:'leitura-rapida-host', tipo:'restaurar', respostas:{ '<questao>':'C', ... } } // retoma marcações

export type EventoLeituraRapida =
  | { source: 'leitura-rapida'; tipo: 'resposta'; questao: string | number; alternativa?: string; correta: boolean }
  | { source: 'leitura-rapida'; tipo: 'progresso'; respondidas: number; total: number; acertos: number }
  | { source: 'leitura-rapida'; tipo: 'concluido'; acertos: number; total: number }
  | { source: 'leitura-rapida'; tipo: 'pronto' }

/** Resposta persistida por questão (p/ retomar e pontuar). */
export type RespostaRapida = { alternativa?: string; correta: boolean }

/** Valida/normaliza uma mensagem recebida do iframe. Retorna null se não for um evento nosso. */
export function parseEventoLeituraRapida(data: unknown): EventoLeituraRapida | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (d.source !== 'leitura-rapida') return null
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0)
  if (d.tipo === 'resposta') {
    return { source: 'leitura-rapida', tipo: 'resposta', questao: (typeof d.questao === 'string' || typeof d.questao === 'number') ? d.questao : '', alternativa: typeof d.alternativa === 'string' ? d.alternativa : undefined, correta: d.correta === true }
  }
  if (d.tipo === 'progresso') {
    return { source: 'leitura-rapida', tipo: 'progresso', respondidas: num(d.respondidas), total: num(d.total), acertos: num(d.acertos) }
  }
  if (d.tipo === 'concluido') {
    return { source: 'leitura-rapida', tipo: 'concluido', acertos: num(d.acertos), total: num(d.total) }
  }
  if (d.tipo === 'pronto') return { source: 'leitura-rapida', tipo: 'pronto' }
  return null
}

/** Mensagem que a PLATAFORMA envia ao iframe para restaurar as marcações salvas (retomar). */
export function montarRestauracaoLeituraRapida(respostas: Record<string, RespostaRapida>) {
  const simples: Record<string, string> = {}
  for (const [q, r] of Object.entries(respostas || {})) if (r?.alternativa) simples[q] = r.alternativa
  return { source: 'leitura-rapida-host' as const, tipo: 'restaurar' as const, respostas: simples }
}

/** Snippet (JS) que o HTML deve incluir p/ falar com a plataforma (avisar respostas + retomar). */
export const SNIPPET_LEITURA_RAPIDA = `// ===== Integração "Leitura rápida" (cole no HTML) =====
function lrAvisar(msg){ try{ if(window.parent && window.parent!==window) window.parent.postMessage({ source:'leitura-rapida', ...msg }, '*'); }catch(e){} }

// 1) Avise a plataforma a cada marcação / progresso / conclusão:
//    lrAvisar({ tipo:'resposta', questao: id, alternativa:'C', correta:true })
//    lrAvisar({ tipo:'progresso', respondidas:n, total:10, acertos:a })   // opcional (barra)
//    lrAvisar({ tipo:'concluido', acertos:a, total:10 })                  // quando TODAS respondidas

// 2) RETOMAR (aluno saiu e voltou): avise que carregou e aplique as respostas que a plataforma devolver.
window.addEventListener('message', function(e){
  var d = e && e.data;
  if(!d || d.source!=='leitura-rapida-host' || d.tipo!=='restaurar') return;
  // d.respostas = { '<questao>':'C', ... } → re-selecione cada alternativa salva no seu estado/UI:
  // Object.keys(d.respostas).forEach(function(q){ aplicarResposta(q, d.respostas[q]); });
});
lrAvisar({ tipo:'pronto' }); // dispara a restauração assim que o HTML monta`
