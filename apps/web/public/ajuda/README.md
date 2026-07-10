# Capturas de tela dos tutoriais (Ajuda)

A página **Configuração → Ajuda** (`/admin/ajuda`) mostra os guias passo a passo.
Cada passo carrega automaticamente uma imagem por **convenção de nome**:

```
public/ajuda/<id-do-guia>-<numero-do-passo>.png
```

Basta salvar o print aqui com o nome certo e ele aparece no passo — sem mexer em código.
Enquanto o arquivo não existir, o passo mostra um placeholder com o nome exato esperado.

## IDs dos guias (ver apps/web/lib/ajuda/guias.ts)

- `criar-simulado` — Criar um simulado
- `simulado-requisitos` — O que um simulado precisa ter
- `conectar-banco` — Conectar o banco ao simulado
- `criar-questao` — Cadastrar uma questão
- `criar-banco` — Organizar o banco de questões
- `estudantes-grupos` — Cadastrar alunos e turmas
- `relatorios` — Ver relatórios e ranking
- `caderno-prova` — Montar um caderno de prova

## Exemplos

- `public/ajuda/criar-simulado-1.png` → captura do passo 1 de "Criar um simulado"
- `public/ajuda/conectar-banco-3.png` → captura do passo 3 de "Conectar o banco ao simulado"

Formato: **.png** (recomendado ~1200–1600px de largura).
