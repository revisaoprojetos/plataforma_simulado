# Assets do Desafio de Jurisprudência

Todos os elementos visuais da página, exportados a partir do próprio código. Abra `galeria.html` para ver tudo de uma vez. A `folha-de-assets.png` é a mesma visão em uma imagem.

## Pastas

| Pasta | O que tem | Formato |
| --- | --- | --- |
| `selos/` | Selo de cada matéria e Selo final, nas versões **bloqueado** e **conquistado** | PNG 512 px com fundo transparente |
| `selos/svg/` | Os mesmos selos em vetor | SVG |
| `selos/com-faixa/` | Versão do selo com faixa e texto (usada na tela de dia concluído) | PNG e SVG |
| `icones/svg/` | Ícones em pixel art (matérias, cadeado, check, play, estrela, coração, livro) | SVG branco, escalável |
| `icones/png-branco/` | Mesmos ícones em branco, mais a coroa dourada | PNG 32× |
| `icones/png-cor-da-materia/` e `svg-cor-da-materia/` | Ícone de cada matéria na cor dela | PNG e SVG |
| `personagens/mascote/` | Mascote em todos os estados: parado, passo 1 e 2, piscando, feliz, olhando para cima, Vade Mecum e perdendo vida, mais a folha de sprites | PNG 16× transparente |
| `personagens/podio/` | Mascote em ouro, prata e bronze (pódio do ranking) | PNG 16× |
| `armadilhas/` | Pegadinha, Súmula superada e Informativo esquecido: normal, vulnerável e vulnerável acabando | PNG 16× |
| `itens/` | Ponto dourado (tese) e Vade Mecum | PNG |
| `animacoes/` | GIFs do mascote (andando, piscando, feliz, Vade Mecum, perdendo vida), das armadilhas (comportamento e vulnerável), dos itens e das telas (abertura, jogo, ranking) | GIF em loop |
| `telas/` | Mapa do desafio | PNG |
| `logo/` | Logo DJ do desafio | PNG e SVG |
| `sprites.json` | Os desenhos em pixel como dados (linhas e paletas) | JSON |

## Como usar

- **PNG de pixel art**: foram ampliados sem suavização (16× ou 32×). Para reduzir no site, use `image-rendering: pixelated` no CSS, assim o pixel continua nítido.
- **SVG dos selos**: os textos usam as fontes Montserrat e VT323. O arquivo chama o Google Fonts sozinho, mas, se o projeto hospedar as fontes localmente, carregue essas duas famílias na página.
- **Animações no produto**: os GIFs servem de referência e de material de divulgação. Dentro do jogo, as animações são feitas por código (CSS e canvas), já documentadas no pacote para o Claude Code. Assim elas ficam mais leves e nítidas do que um GIF.
- **sprites.json**: cada letra das linhas é uma cor da paleta (`.` é transparente). É o mesmo formato que o jogo usa, então dá para gerar os sprites em qualquer tamanho.

## Paleta principal

| Uso | Cor |
| --- | --- |
| Fundo | `#040830` |
| Neon | `#8b5cf6` |
| Dourado (conquista) | `#ffc83d` |
| Ciano (Vade Mecum, você) | `#3fd5ff` |
| Rosa (vidas, Pegadinha) | `#ff4f9a` |
| Mascote | `#9b7bff` |
| Administrativo | `#a78bfa` |
| Civil e Empresarial | `#3fd5ff` |
| Constitucional | `#ff6fae` |
| Previdenciário | `#4ef0a0` |
| Processo Civil | `#ffa53d` |
| Trabalho | `#ff7a59` |
| Tributário | `#ffd84d` |
