# Padrao de abas do admin

Referencia: "Gerenciar produtos" (`components/admin/conteudos-tabs.tsx`). Texto simples, sem icone/pill/fundo, UMA linha de base
(`border-b`), aba ativa com `border-b-2 border-primary` em negrito. Sem indicador deslizante, sem segunda borda, sem fileira duplicada.
Posicao: logo abaixo do titulo (gap-4 do `EstudioHeader`). Linha ocupa a largura do conteudo (sem `w-fit`, sem `max-w-*`).

## Classes (fonte unica: `apps/web/components/ui/abas-linha.tsx`)
- Lista `ABAS_LINHA_LISTA`: `flex flex-wrap items-center gap-x-7 gap-y-1 overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`
- Item `abasLinhaItem(ativo)`: `-mb-px shrink-0 whitespace-nowrap border-b-2 pb-2.5 pt-1 text-[14px] tracking-[-0.01em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40`
  - ativo: `border-primary font-extrabold text-foreground`
  - inativo: `border-transparent font-semibold text-muted-foreground hover:text-foreground`

## Como usar
- Navegacao (URL): `<AbasLinha ativo={key} itens={[{ key, label, href, badge? }]} />` (renderiza `<Link role=tab aria-current>`).
- Estado local: `<AbasLinha itens={[{ key, label, onClick }]} ativo={...} />` ou `<AbasLinhaControlada valor onChange itens={[{valor,label}]} />`.
- Abas com painel (base-ui): `components/ui/tabs.tsx` (`Tabs/TabsList/TabsTrigger/TabsContent`) usa o MESMO visual (indicador deslizante removido; cor do ativo via `--tab-active` no `border-color` do trigger, em globals.css). Nao passar `gap-*`, `px-*`, `rounded`, `bg-*` nem icone.
- Contador: `badge` (texto muted discreto), nunca pill colorida. Icones: remover.
- Seletores segmentados (pill) que NAO trocam de visao/painel podem ficar como controle; se trocam de "visao/aba", viram abas.

## Ja no padrao (nao migrar)
`conteudos-tabs.tsx`, `barra-setor.tsx`, `adaptativo-tabs.tsx`, `problemas/abas.tsx`, `administradores-tabs.tsx` (refatorados p/ AbasLinha);
`materiais-tabs.tsx:19`, `acessos/blocos.tsx:66-75`, `app/admin/api-keys/page.tsx:50` (classes ja quase identicas; opcional trocar por AbasLinha);
usos simples de `ui/tabs` (herdam o novo visual) — ver secao final.

## Fora do padrao (por area da sidebar) — `app/admin/...` salvo indicacao
Legenda: BORDA = border-b-2 manual com px/py/texto diferentes (padrao: `pb-2.5 pt-1 text-[14px]`, container `gap-x-7`, ativo `font-extrabold text-foreground`);
ICONE; PILL; LINHA2 = indicador deslizante proprio (linha dupla); GAP = container com gap-1/gap-4/gap-8; ATIVO-COR = ativo `text-primary` em vez de foreground.

### Inicio (2)
- revisao/inicio/page.tsx:135 — PILL (rounded-[10px] bg-primary) alternando modo.
- components/admin/dashboard-charts.tsx:128 — PILL segmentado de modo.

### Pedagogico: Cursos e Produtos (16)
- conteudos/classificacao/classificacao-client.tsx:295 — BORDA px-4 py-2.5 text-sm, ICONE.
- conteudos/grupos/[id]/grupo-editar-client.tsx:182 — BORDA px-1 py-2.5, ICONE; :206 cards de modo (avaliar).
- conteudos/grupos/[id]/vincular-grupo-modal.tsx:82 — PILL segmentado de filtro.
- conteudos/produtos/[id]/aba-regras.tsx:112-115 — GAP gap-4, BORDA px-1.
- conteudos/produtos/[id]/painel-edicao-regras.tsx:169-172 — GAP gap-4, px-4 no container, pt-2.
- conteudos/produtos/[id]/produto-estudio-client.tsx:257-260 — BORDA px-1, ICONE, contador PILL (rounded-full bg-primary).
- conteudos/produtos/[id]/segmentos-dialog.tsx:156-162 — nav com bg-muted, BORDA px-4 py-3, ICONE, contador PILL; :290, :521, :719 tablists PILL/segmentados (grid rounded-xl border).
- conteudos/produtos/[id]/aba-conteudos.tsx:465-466 — PILL vista cards/tabela.
- conteudos/trilhas/[id]/trilha-editor.tsx:132 — BORDA px-4, ICONE.
- conteudos/trilhas/trilhas-client.tsx:262 — botoes de visibilidade (avaliar).
- produtos/[id]/produto-editor.tsx:288 — BORDA px-1 pb-2 text-sm.
- liberacao/liberacao-client.tsx:108 — BORDA px-3 py-2.
- revisao/cursos/[id]/aba-*.tsx (10 arquivos) — conferir a navegacao de abas do shell do curso (nao localizada por grep; verificar a pagina que as monta).
- components/admin/estudio/adicionar-conteudo.tsx:158-161 — tablist ICONE px-3 py-2, gap-1.
- components/admin/biblioteca-client.tsx:41 — BORDA px-4 py-2.5, ICONE.
- components/admin/materiais-tabs.tsx:19 — ja identico (so trocar por AbasLinha).

### Pedagogico: Simulados (14)
- simulados/page.tsx:29 — BORDA px-4 py-2.5 text-sm font-semibold.
- simulados/[id]/page.tsx:206 — ui/tabs (herda); override `claro` (texto branco) mantido.
- simulados/[id]/ao-vivo/page.tsx:28 — ui/tabs (herda).
- components/admin/simulados-board.tsx:1134 — BORDA py-2.5 ICONE; :630 e :639 PILL segmentado (vista/modo).
- banco-questoes/[id]/page.tsx:184 + components/admin/banco-tabs-shell.tsx:37 — ui/tabs (herda; conferir classes locais).
- components/admin/adicionar-questoes-dialog.tsx:176, nova-questao-dialog.tsx:39 — PILL de modo.
- components/admin/correcao-sessao.tsx:723 (PILL filtro), :778-780 (PILL abas prova/espelho/transcricao, ICONE); correcao-cards.tsx:50 (PILL filtro).

### Pedagogico: Lei Seca e Jurisprudencia (6)
- leitura/analise/page.tsx:225 — BORDA px-3 py-2, ICONE, ATIVO-COR.
- components/admin/jurisprudencia-tabs.tsx:34-42 — LINHA2 (indicador absoluto), gap-8, ICONE, py-2.
- components/admin/modulo-tabs-bar.tsx:37-47 — LINHA2, gap-8, ICONE (variante `claro` border-white/20 deve ser mantida).
- components/admin/modulo-carimbos-form.tsx:352, modulo-pontuacao-form.tsx:61 — PILL segmentado.
- components/admin/maratona-ranking-admin.tsx:75 — PILL filtro.

### Pedagogico: Gerador de cronograma (8) — outra sessao edita cronogramas/*; coordenar
- components/admin/cronograma-tabs.tsx:44-64 — gap-1, rounded-t-lg, px-3 py-2, ICONE, contador PILL.
- revisao/cronograma/liberacao-aulas/index.tsx:56-59 — gap-x-5, px-1 pb-2.5 text-sm.
- revisao/cronograma/liberacao-aulas/importar-dialogo.tsx:94 e cronogramas/importar-trilhas-dialogo.tsx:109 — BORDA px-1 pb-2.
- cronogramas/cronogramas-client.tsx:604 — PILL filtro.
- cronogramas/criar/previa-viva.tsx:134-137 — PILL (rounded-md) modelo/datada.

### Pedagogico: Cronograma adaptativo (7) — outra sessao em adaptativo/
- cronogramas/adaptativo/downloads/downloads-client.tsx:114-117 — gap-1, px-4 py-2.
- .../fluxo/fluxo-client.tsx:167-172 — gap-1, rounded-t-lg, ICONE, px-3 py-2.
- .../analise/page.tsx:31 — rounded-t-lg px-3 py-2, ICONE.
- .../catalogo/catalogo-editor.tsx:204 — rounded-t-lg, ATIVO-COR.
- .../integridade/integridade-client.tsx:31 — rounded-t-lg text-[13px], ATIVO-COR.
- .../inteligencia/inteligencia-client.tsx:51 — rounded-t-lg, ATIVO-COR.
- .../rastro/page.tsx:72 — Link rounded-t-lg (mesmo padrao).

### Pedagogico: Biblioteca (11)
- biblioteca/biblioteca-client.tsx:638-649 (px-4 py-2, gap-1) e :1107 (ICONE px-3 py-2.5).
- biblioteca/conteudo/[id]/gerenciar/gerenciar-conteudo-client.tsx:227 (classes CSS proprias `.tabs/.tab`) e :540-543 (`.seg/.sg` PILL).
- biblioteca/editar/[versaoId]/previa-lab.tsx:151 — px-3 py-2.5 font-semibold.
- components/admin/biblioteca-doc-sidebar.tsx:141 — text-xs, ICONE.
- revisao/biblioteca/biblioteca-app.tsx:313-316 (ICONE px-3 py-2, gap-1) e :323-328 (sub-abas: fileira dupla de abas).
- revisao/biblioteca/gestao-ui.tsx:53-59 — componente compartilhado de abas (migrar 1x, todos herdam).
- revisao/biblioteca/questoes-etiquetas.tsx:425-428 — sem border-b proprio, ATIVO-COR.
- revisao/biblioteca/unificar-duplicadas.tsx:191-194 — flex-1 centralizado, text-xs.
- components/admin/revisao/ui.tsx:68-78 — abas do shell revisao (ICONE px-3 py-2, gap-1).

### Pedagogico: Questoes (1)
- questoes/page.tsx:150 — tabCls: ICONE, pb-2 px-1, ATIVO-COR.

### Pedagogico: Videoteca / Atualizacoes / Duvidas (1)
- revisao/videoteca/page.tsx:63 — PILL (rounded-lg border) filtro de visibilidade.
- Atualizacoes e Duvidas: nada encontrado por grep; reconferir ao migrar a tela.

### Alunos: Estudantes (4)
- components/admin/estudante-perfil-tabs.tsx:28-57 — container card `rounded-xl border bg-card p-1 shadow-sm` com PILL, ICONE, contador PILL (pior caso).
- components/admin/estudantes-lista.tsx:193 — PILL filtro rounded-full.
- revisao/membros/ficha-painel.tsx:141-144 — gap-1 px-2, px-3 py-2.5, ATIVO-COR.
- revisao/membros/membros-app.tsx:121-124 — gap-1, ICONE, px-3 py-2.

### Alunos: Grupos (0 proprios) — ver conteudos/grupos/* em Cursos e Produtos.

### Alunos: Comunicacao (1)
- components/admin/banners-manager.tsx:196-198 — PILL flex-1 rounded-xl + contador PILL.

### Alunos: Engajamento (2)
- gamificacao/gamificacao-tabs.tsx:30-31 — ui/tabs (herda; `flex-wrap` redundante).
- relatorios/ranking/ranking-view.tsx:84-85 — PILL rounded-lg (classificacao/criterios).

### Atendimento (1)
- atendimento/atendimento-client.tsx:133 — BORDA py-2.5 font-medium, ICONE.

### Analise: Relatorios / Alunos e engajamento (2)
- relatorios/simulados/relatorio-simulado-view.tsx:659 — ui/tabs (herda).
- components/admin/relatorios/viz.tsx:483 — PILL segmentado de modo.

### Admin: Equipe (0) — administradores-tabs migrado; acessos/blocos.tsx:66-75 identico (opcional).

### Admin: Configuracao (5)
- configuracoes/configuracoes-tabs.tsx:24-25 (ui/tabs, flex-wrap) e :58-59 (aninhada em card `rounded-xl bg-muted/20 p-4`, gap-4).
- configuracoes/menu-lateral-form.tsx:330-331 — idem card aninhado, gap-4.
- configuracoes/paleta-nova-form.tsx:224-225 — gap-4.
- components/admin/manutencao-sistema-form.tsx:97-98 — gap-4.
- components/admin/banco-hud-designer.tsx:161 — lista lateral com bg-primary (nao e aba horizontal; avaliar).

### Admin: Integracoes (7)
- components/admin/conexoes-tabs.tsx:19-32 — ui/tabs (herda; `variant="line"` aninhada).
- components/admin/integracao-curseduca-tabs.tsx:60, integracao-provider-client.tsx:94 — BORDA px-3 py-2, ICONE, sem -mb-px.
- components/admin/webhook-logs-saida.tsx:55 — PILL segmentado filtro.
- components/admin/curseduca-import.tsx:561-562, curseduca-auto-vinculo.tsx:99-103 — PILL/botoes de modo.
- api-keys/page.tsx:50 — quase identico (sem gap-x-7/focus ring).

### Admin: Auditoria (1)
- components/admin/seguranca/seguranca-ui.tsx:29-37 — rounded-t-lg px-3 py-2, ICONE (compartilhado). problemas/abas.tsx ja migrado.

### Admin: LGPD e lixeira (1)
- components/admin/lixeira-client.tsx:69 — PILL rounded-lg bg-primary.

### Super Admin (3)
- sistema/sistema-tabs.tsx:26-27 e :36-37 (ui/tabs; a segunda com `mb-4`).
- transcricao/transcricao-tabs.tsx:21-22 (ui/tabs).

### Compartilhados
- components/admin/file-picker.tsx:146-154 — tablist gap-1, ICONE px-3 py-2.
- components/admin/notification-bell.tsx:156-157 — PILL filtro (sino; nao e aba de pagina).

## ui/tabs (herdam o novo visual)
banco-questoes/[id], configuracoes (3), paleta-nova-form, manutencao-sistema-form, gamificacao-tabs, relatorio-simulado-view, simulados/[id] e ao-vivo, sistema-tabs (2), transcricao-tabs, conexoes-tabs (2), banco-tabs-shell. Remover apenas classes locais redundantes (`gap-4`, `mb-4`, icones nos triggers).

## Totais (itens fora do padrao, aprox.)
Inicio 2 | Cursos e Produtos 16 | Simulados 14 | Lei Seca/Juris 6 | Gerador 8 | Adaptativo 7 | Biblioteca 11 | Questoes 1 | Videoteca 1 | Estudantes 4 | Comunicacao 1 | Engajamento 2 | Atendimento 1 | Relatorios 2 | Configuracao 5 | Integracoes 7 | Auditoria 1 | LGPD/lixeira 1 | Super Admin 3 | Compartilhados 2.

## Cronogramas (admin): 5 abas + abas internas, sem 3ª fileira

O shell de Cronogramas tem NO MÁXIMO duas fileiras no cabeçalho: BarraSetor (Gerador | Adaptativo) e as 5 abas da modalidade (`CronogramasNav`). As telas de cada aba são abas INTERNAS (`AbasLinha`, componente `VistasCronograma`) logo após o cabeçalho, selecionadas por `?v=` (ou pela própria rota legada). Fonte única: `lib/admin/cronogramas-nav.ts`.
