# Leitor de Jurisprudência (redesign) — Plano da Fase 1 (base visual)

> Fonte de verdade visual: `C:\Users\joooa\Downloads\re-designer area de leitura\prototipo-leitor.html`
> Spec de regras: `ESPEC_REDESIGN_LEITOR.md` (mesma pasta).
> Decisões: ver memória `redesign-leitor-jurisprudencia`. Reusar HTML+motor atual; nova área separada do arcade; Jurisprudência primeiro; tudo configurável no editor.

## Objetivo da Fase 1
O "Dia 01" renderiza igual ao protótipo nos 4 temas, com: tokens+temas, folha, cabeçalho do dia, bloco do tema (pincel, tese fiel, tags, quadros de lei, conclusão, cartões de navegação). Conteúdo vem do HTML atual (reusar `carregarDocumentoAluno` + processamento). Sem marcação/caderno/folha-espelho ainda (fases 3–4).

## Arquitetura (reuso)
- **Dados:** `carregarDocumentoAluno(documentoId, estudanteId, tenantId)` (lib/leitura/acesso.ts) já devolve `DocumentoCarregado` (html, progresso, anotações, grifos, prefs, esp, grifoCores, blocos, topicos). Reusar.
- **Processamento do HTML:** reaproveitar `caixas.ts` (tese/quadros/caixas) e os helpers; o VISUAL novo vem do CSS tokenizado `.leitor-jus`.
- **Persistência:** tabelas `simulado_leitura_*` + `quiz_config` existentes.

## Entrada / wiring
- Nova aba "Leitura" no desafio de jurisprudência (DesafioJurisInterno) OU rota `/aluno/jurisprudencia/leitura/[dia]`. Decidir no início da implementação (preferir aba, convivendo com o arcade).
- Preserva contratos: `?desafio=`, destino de "Questões", dados salvos dos alunos.

## Arquivos a criar
```
components/aluno/leitor-jus/
  leitor-jus.tsx            # componente raiz (layout 3 colunas: sumário | folha | [caderno later])
  topbar.tsx                # TopBar (Voltar, caminho, Buscar[stub], Aparência[stub], Questões, fio progresso)
  sumario.tsx               # sumário 272px + mini-rail 52px (Fase 2 refina; aqui lista temas + progresso)
  folha.tsx                 # a "folha" (sheet) + cabeçalho do dia
  tema-bloco.tsx            # bloco do tema: pincel, tags, tese, corpo, conclusão, navegação
  pincel.tsx                # título com SVG pincel (box-decoration-break:clone)
  tese.tsx                  # caixa da tese fiel (Carlito, salmão/azul, citação negrito)
  quadro-lei.tsx            # quadro de lei quadrado
  tokens.css (ou bloco em globals.css)   # tokens + 4 temas via [data-reader-theme]
  parse-dia.ts              # adaptador: do HTML atual → estrutura {dia, temas[]} reaproveitando regras §8
```

## Passos (ordem)
1. **Tokens + 4 temas** (`[data-reader-theme=light|dark|sepia|night]` + Auto por prefers-color-scheme). Escopar sob `.leitor-jus` p/ não vazar. Mapear no Tailwind se for usar classes utilitárias; senão usar var() direto. (spec §4)
2. **Layout/grade** `.leitor-jus` fixed inset-0, grid-rows auto/1fr, grid-cols sumário/leitura/caderno. Só leitura rola. (spec §5)
3. **TopBar** (56px) + fio de progresso. Botões Buscar/Aparência/Foco/Folha/Caderno como stubs (fases seguintes); Voltar + caminho + Questões reais. (spec §6.1)
4. **Folha** + cabeçalho do dia (sobretítulo, título, metadados). (spec §6.5–6.6)
5. **parse-dia.ts**: adaptar o HTML processado às estruturas de tema (tese por fundo #FBE4D5/#DEEAF6, subtítulos, quadros por tabela sem cor, citação pelo último parêntese). Reusar o que `caixas.ts` já faz. (spec §8)
6. **Bloco do tema**: pincel (SVG §6.7.2), tags (§6.7.3 — vêm dos metadados por tema no editor + tribunal da cor da tese), tese fiel (§6.7.4), corpo (subtítulos h3 com filete, parágrafos, quadros de lei §6.7.5), conclusão (bloco `--law`), navegação (cartões próximo/anterior; último = primário "Ir para as questões"). (spec §6.7)
7. **Sumário** básico: lista de temas com número mono, título, % e tags compactas; item atual destacado; progresso geral. Mini-rail 52px. (spec §6.2 — refino na Fase 2)
8. **Editor (configuração)** — adicionar painéis para o que a Fase 1 expõe:
   - **Tags + tribunal por tema** (por tópico): STJ/STF/Modulação/Favorável-Desfavorável à Fazenda/Reafirmação/Consolidado. Salvar em `quiz_config.topicos[key]` (estender `TopicoConfig`).
   - **Título/sobretítulo do dia** (campo do dia).
   - **Tema/cores do leitor** (paleta base por tenant/doc) — opcional na Fase 1, pode ficar nos defaults.
   - Reusar os painéis já existentes (blocos, espaçamento, grifoCores, índice, metadados).

## Aceite (spec §14 Fase 1)
- Dia 01 igual ao protótipo nos 4 temas.
- Contagens §8.4: 7 temas, 29 subtítulos, 7 conclusões, 19 quadros de lei (33 citações ligadas = Fase 3).
- Pincel nunca vaza (2–3 linhas). Tese fiel (salmão STJ/azul STF, citação negrito). Tags acima da tese e no sumário. Quadros quadrados sem espaço entre linhas, rótulo negrito inline.
- Nenhum estado ativo preto no claro; scrollbars acompanham o tema.

## Fora da Fase 1 (fases seguintes)
Marcação (7 ferramentas×5 cores), barra de seleção, artigos clicáveis, busca-paleta, menu Aparência completo, caderno, folha espelho, Leitner, foco/régua/pomodoro/voz/meta.

## Regras do projeto
- Cores SEMPRE via token (nunca hex de marca fixo fora dos tokens do tema do leitor). Dark/light/sépia/noite completos.
- Área nova JÁ NASCE otimizada (dados server-side, sem fetchAll).
- NÃO commitar/push/gerar imagem sem pedido explícito.
- Consultar skills de design (design-ui) ao construir UI.
```
