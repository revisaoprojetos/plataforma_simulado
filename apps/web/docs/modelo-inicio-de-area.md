# Modelo de início de área (admin)

Referência: **Gerenciar produtos** (`/admin/conteudos/produtos`). Componente único: `components/admin/cabecalho-area.tsx` (`<CabecalhoArea>`).
`<EstudioHeader>` delega a ele (eyebrow padrão "Conteúdos" + `ConteudosTabs`). Nova tela de topo = `<CabecalhoArea>`; nada de `<h1>` solto.

## Anatomia (de cima para baixo, `flex flex-col gap-4`; `denso` = `gap-3`)

| Camada | Classes/tokens EXATOS |
|---|---|
| Linha título | `flex flex-wrap items-end justify-between gap-4`; ações: `ml-auto flex flex-wrap items-center gap-2` |
| Eyebrow | `text-[11px] font-extrabold uppercase tracking-[.2em]`, cor `var(--gold-ink, var(--pn-9a7400,#9A7400))` (dark: `--pn-f1c232`). Texto = **setor da sidebar** (`lib/admin/eyebrow-setor.ts` → `resolverRota().setor.label`: Início, Pedagógico, Alunos, Atendimento, Análise, Admin, Super Admin). `eyebrow="..."` sobrescreve; `eyebrow={null}` oculta. |
| H1 | `m-0 truncate text-[28px] sm:text-[36px] font-extrabold leading-[1.05] tracking-[-0.035em] text-foreground`; `denso`: `text-[24px] sm:text-[28px]` |
| Descrição (opcional) | `<p class="m-0 text-sm text-muted-foreground">` dentro da coluna do H1 (abaixo dele) |
| 1ª fileira | `<BarraSetorSlot/>` (BarraSetor: irmãos do cluster; `AbasLinha`, `mb-1`). `semBarraSetor` omite |
| 2ª fileira | prop `abas` (ex.: `ConteudosTabs`, `MateriaisTabs`, `AbasLinha`, `RevisaoAbas`) |
| Abas | `components/ui/abas-linha.tsx`: `border-b` na lista; item `border-b-2 pb-2.5 pt-1 text-[14px]`; ativa `border-primary font-extrabold text-foreground`, inativa `font-semibold text-muted-foreground`. Nunca pill. |

## De onde vêm as cores
- **H1 "roxo"**: não há cor própria. É `text-foreground` = `--foreground` redefinido em `.estudio-scope` (`app/admin/conteudos/estudio.css`) como `var(--pn-1d1933,#1D1933)` (roxo-escuro quase preto; dark `#FFFFFF`). O roxo da marca (`--primary`, abas ativas, botões) **não** é sobrescrito: herda o tenant.
- **Eyebrow dourado**: `--gold-ink` (`--pn-9a7400`; dark `--pn-f1c232`), também em `.estudio-scope`.
- **Fundo**: `--background: var(--pn-f4f2fa,#F4F2FA)` (dark `#18181D`) aplicado como `background` no próprio `.estudio-scope`. Outras superfícies do escopo: `--card #fff`, `--muted --pn-f6f4fc`, `--border --pn-eae6f4`, `--radius .7rem`.
- **White-label**: todos os valores vêm como `var(--pn-<hex6>, #hex)`; a paleta nova do tenant (`lib/brand/paleta-nova.ts`, link `paletaHref` no admin/layout) recolore cada hex por tenant. Verde/azul funcionam via `--pn-*`; só `--primary`/`--ring` seguem o tema legado do tenant.
- **Fonte**: Plus Jakarta Sans já é a `font-sans` GLOBAL (`next/font` em `app/layout.tsx`, `--font-plus-jakarta`). O `@import` do Google Fonts do estudio.css foi removido.

## Escopo visual (decisão implementada)
`.estudio-scope` agora é aplicado ao `<main>` de `app/admin/layout.tsx` em **todo o admin** (`main className="estudio-scope flex-1 overflow-y-auto p-4 sm:p-6"`), sem `-m-6`. O CSS é importado no layout do admin. Opt-out: `lib/admin/escopo-visual.ts` (`ROTAS_SEM_ESCOPO_VISUAL`: `/admin/teste`, `/admin/biblioteca/editar`, `/admin/cadernos-teste`). `app/admin/conteudos/layout.tsx` virou `w-full` simples. Não afeta `/super` (fora do /admin) nem iframes (documento próprio).
Efeitos: fundo lilás/escuro e cards brancos em todas as telas; `--radius` .7rem (rounded-* um pouco maior); portais (Dialog/Popover/Select em `body`) ficam FORA do escopo e usam os tokens padrão (igual já era em Conteúdos). Reverter = esvaziar `ROTAS...` não basta; basta remover a classe no `<main>`.

## Tabela: hoje × modelo

| Área / telas de topo | Hoje | Diferença |
|---|---|---|
| Conteúdos (produtos, grupos, ofertas, flashcards, trilhas, vídeos, classificação, materiais/*) | `EstudioHeader` | Já é o modelo |
| Segurança/Acessos/Equipe online/Auditoria-problemas/API Keys | `EstudioHeader semAbas` + eyebrow manual | Já usa; trocar para `CabecalhoArea` com eyebrow derivado |
| Revisão (`/admin/revisao/*`: cursos, simulados, membros, grupos, calendário, campanhas, avisos, duvidas, videoteca, atualizacoes, jurisclub, equipe, aparencia, relatorios, inicio, cronograma) | `RevisaoHead` (`components/admin/revisao/ui.tsx`): breadcrumb pequeno `secao / titulo`, `h1 text-2xl font-bold`, subtítulo `text-sm`, `mb-5`; `RevisaoAbas` | Sem eyebrow, H1 24px/bold; breadcrumb no lugar do eyebrow. Candidato: `RevisaoHead` delegar a `CabecalhoArea` (subtitulo→descricao) |
| Dashboard `/admin`, estudantes, simulados, questões, relatórios/*, matrículas, comentários, feedbacks, atendimento, gamificação, integrações, lixeira, lgpd, correção, modelos-caderno, auditoria, administradores, tenants, configuracoes/*, sistema, transcricao, compartilhar, ajuda, entrada | `div` + `<h1 class="text-2xl font-bold tracking-tight">` + `<p class="text-muted-foreground">` (sem eyebrow), `BarraSetorSlot` manual; alguns com ícone `text-primary` no h1 (lgpd, leitura, jurisprudencia, cadernos-teste, cronogramas/*, relatorios/engajamento, impersonation/config) | H1 24px/bold sem eyebrow; ícone no H1 deve sair |
| Cronogramas (`cronogramas/*`, `adaptativo/*` ~15 telas) | idem acima; títulos tipo "Cronograma adaptativo · X" | Idem + título longo repetindo o prefixo (avaliar eyebrow "Pedagógico" + título só "X") |
| Detalhes/dinâmicas (`estudantes/[id]`, `simulados/[id]`, `banco-questoes/[id]` banner colorido, `correcao/simulado/*`, `leitura/[id]/*`, `cronogramas/pacotes/[id]`, `administradores/permissoes/[id]`) | H1 próprio `text-2xl`/`sm:text-3xl`, hero/banner, voltar | Fora do 1º lote; decidir caso a caso (hero ≠ modelo) |
| Full-bleed/editores (`cronogramas/criar`, `simulados/criar`, `teste`, `biblioteca/editar`) | layout próprio (barra sticky) | Não migrar; `/teste`, `/biblioteca/editar` já fora do escopo visual |
| Biblioteca admin, produtos/extensivos, liberação, cronogramas-client | clients próprios com `BarraSetorSlot` | Cabeçalho dentro do client; trocar o bloco do título |
