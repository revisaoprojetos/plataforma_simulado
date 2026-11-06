// Leitura do aluno (JurisClub): cada TÍTULO de seção (h1) + tudo que vem abaixo dele até o próximo título vira uma
// ÁREA EXPANSIVA/RECOLHÍVEL que já vem RECOLHIDA (cartão do JurisClub: título em destaque + seta). O que vem antes do 1º título (nome do
// julgado, <tags>, quadro do entendimento) fica fora. Só manipula STRINGS de HTML (server) e MOVE os nós — a ordem do
// texto é a mesma, então grifos e anotações seguem ancorados (o h1 com data-uid vai inteiro dentro do <summary>).
// Estilo: `details.sec-tit` em public/leitura/leitor-jus.html. Ligado/desligado em Admin › Cronogramas › Metas &
// inteligência › Jurisprudência (jurisTitulosExpansivos).
const RE_H1 = /<h1\b[^>]*>[\s\S]*?<\/h1>/gi

export function envolverSecoesPorTitulo(html: string): string {
  if (!html || html.includes('class="sec-tit"')) return html
  const marcas = [...html.matchAll(RE_H1)]
  if (!marcas.length) return html
  let out = html.slice(0, marcas[0].index)
  marcas.forEach((m, i) => {
    const ini = (m.index ?? 0) + m[0].length
    const fim = i + 1 < marcas.length ? (marcas[i + 1].index ?? html.length) : html.length
    out += `<details class="sec-tit"><summary>${m[0]}</summary><div class="sec-corpo">${html.slice(ini, fim)}</div></details>`
  })
  return out
}
