# Fluxo de trabalho em branches (Git + CI/CD)

Guia oficial de como trabalhar em **branches** neste projeto: várias pessoas/máquinas
desenvolvendo em paralelo **sem perder trabalho, sem sobrepor** um ao outro, com **avisos e
travas automáticas**, e com **deploy por imagem** (GHCR → Portainer/Swarm).

> **Regra de ouro (decore isto):**
> ```bash
> git checkout main && git pull            # 1. parta sempre da main atualizada
> git checkout -b feat/nome-curto          # 2. crie sua branch
> # ... trabalhe, git add, git commit ...
> git push -u origin feat/nome-curto       # 3. pushe → CI builda a imagem da branch por SHA
> # ... de vez em quando: git merge main   # 4. traga a main pra dentro (conflitos cedo e pequenos)
> # abra um Pull Request → merge → a main deploya
> ```

---

## 1. Por que branch: isolamento é a proteção

Uma **branch é uma linha de trabalho separada**. Git branches **NÃO conversam em tempo real** — e
isso é de propósito: o trabalho-em-andamento de uma branch **nunca** aparece nem quebra a outra. Duas
pessoas em duas branches são dois universos paralelos; elas só "se encontram" quando uma **merge**
na outra (ou na main). Não existe (e seria perigoso) uma branch "enxergar" o código não-commitado da
outra.

**Consequência prática:** você e outra pessoa podem mexer no **mesmo arquivo**, na **mesma linha**, em
branches diferentes, ao mesmo tempo — e **nada se perde**. Cada branch guarda a sua versão. A decisão
de como unir só acontece no merge, com o git te avisando.

---

## 2. As 4 camadas que impedem perda e sobreposição

| # | Camada | O que faz | Quando age |
|---|--------|-----------|-----------|
| 1 | **Isolamento** | Cada branch é um ref separado; 2 branches nunca se sobrescrevem. | Sempre |
| 2 | **Rejeição de push (non-fast-forward)** | Se **2 pessoas mexem na MESMA branch**, o 2º `git push` é **RECUSADO** (`! [rejected] ... (fetch first)`) até fazer `git pull`. Git **se recusa a apagar** histórico do servidor. | Ao pushar |
| 3 | **Alerta de conflito no merge** | Quando mudanças divergentes se encontram, o git **PARA**, marca `CONFLICT`, e escreve **as duas versões** no arquivo (`<<<<<<<` / `=======` / `>>>>>>>`). Nada é sobreposto em silêncio. | No `git merge`/`pull` |
| 4 | **pr-check + GitHub** | No Pull Request, o GitHub mostra "this branch has conflicts" e o CI `integrar` roda **tsc + build da branch já mesclada com a main** → pega conflito e erro de montagem **antes** de entrar na main. | No PR |

### Prova (foi validado localmente)
Simulação de 2 usuários em 2 branches mexendo na mesma linha:
- Cada branch manteve **a sua** versão (isolamento) — um não apagou o outro.
- Ao juntar, o git parou com `CONFLICT (add/add)` e escreveu **as duas versões** no arquivo.
- Nada foi perdido; o merge foi abortado sem estrago.

---

## 3. Fluxo do dia a dia (passo a passo)

```bash
# 1) Comece SEMPRE da main atualizada
git checkout main
git pull

# 2) Crie a branch (nome curto e descritivo; prefixos ajudam: feat/ fix/ chore/ test/)
git checkout -b feat/construtor-cadernos

# 3) Trabalhe. Commite em pedaços lógicos (mensagem clara no imperativo)
git add -A
git commit -m "Construtor: card de disciplina individual"

# 4) Traga a main pra dentro de vez em quando (conflitos aparecem CEDO e pequenos)
git fetch origin
git merge origin/main          # resolva conflitos aqui, se houver (ver seção 4)

# 5) Pushe a branch → o CI builda a imagem dela por SHA (testável no Portainer)
git push -u origin feat/construtor-cadernos

# 6) Abra um Pull Request no GitHub (base: main). O pr-check roda sozinho.
#    Quando estiver verde e revisado → Merge. A main então builda :latest (e deploya).
```

**Nomes de branch (convenção):**
- `feat/...` — funcionalidade nova
- `fix/...` — correção de bug
- `chore/...` — infra/CI/deps/refactor sem mudança de comportamento
- `test/...` — experimento descartável

---

## 4. Resolvendo um conflito (sem medo)

Conflito **não é erro** — é o git te mostrando que dois lados mudaram a mesma coisa e pedindo sua
decisão. Passo a passo:

```bash
git merge origin/main
# CONFLICT (content): Merge conflict in caminho/arquivo.tsx
```

1. Abra o(s) arquivo(s) marcado(s). Você verá:
   ```
   <<<<<<< HEAD
   (o SEU código, da sua branch)
   =======
   (o código que veio da main)
   >>>>>>> origin/main
   ```
2. Edite deixando o resultado **correto** (fica com um, com o outro, ou combine os dois). **Apague as
   linhas de marcação** `<<<<<<<`, `=======`, `>>>>>>>`.
3. Marque como resolvido e finalize:
   ```bash
   git add caminho/arquivo.tsx
   git commit                      # conclui o merge
   ```
4. Se se atrapalhar, **desfaça tudo** sem perder nada: `git merge --abort`.

> **Dica:** merge a main **com frequência** (passo 4 do fluxo). Muitos conflitos pequenos e cedo são
> triviais; um conflito gigante de 2 semanas é sofrimento.

---

## 5. CI/CD — o que roda automaticamente

Dois workflows em `.github/workflows/`:

### `docker-publish.yml` — build da imagem
- **Dispara em push de QUALQUER branch** (`branches: ['**']`).
- Sempre publica a imagem com a **tag por SHA** (é o que você cola no Portainer):
  - Web: `ghcr.io/revisaoprojetos/plataforma_simulado:<SHA>`
  - Worker: `ghcr.io/revisaoprojetos/plataforma_simulado-worker:<SHA>`
  - API (fase 3, `continue-on-error`): `...-api:<SHA>`
- **Só na `main`** atualiza a tag **`:latest`** e dispara o **redeploy** (produção). Branches
  **nunca** mexem no `latest` nem deployam sozinhas.

### `pr-check.yml` — trava de integração (job `integrar`)
- Dispara em **Pull Request para a main**.
- Faz checkout da branch **já mesclada com a main** e roda **`tsc --noEmit` + `next build`**.
- Se o merge quebrar código ou build, o check **falha** e você vê **antes** de mergear.

> **Regra:** só cole um `<SHA>` no Portainer **depois** que o run desse SHA ficar **VERDE** em
> **Actions** (confira os *steps*, não só a conclusão). Colar antes = imagem ainda não existe no GHCR
> → o Portainer não consegue dar *pull* → **Traefik responde `404 page not found`** (sem backend).

---

## 6. Deploy: testar uma branch vs. produção

### Testar uma branch (sem tocar produção)
1. Pushe a branch e espere o build ficar **verde** em Actions.
2. Pegue o SHA do commit: `git rev-parse HEAD` (40 chars — o curto **não existe** no GHCR).
3. No **Portainer**, aponte um **serviço/stack de TESTE** para:
   ```
   ghcr.io/revisaoprojetos/plataforma_simulado:<SHA_da_branch>
   ```
   marque **Re-pull image / Force update**.
4. ⚠️ **Nunca** cole o SHA de uma branch no serviço de **produção** — isso sobe a branch pra
   produção (e derruba se a imagem ainda não existir).

### Produção
Produção roda a `main`. Ou **manual** (cola o `<SHA>` da main / `:latest` no serviço web), ou
**automática** (seção 7).

---

## 7. Auto-deploy da produção (webhook do Portainer)

Para a main deployar **sozinha** (sem colar SHA na mão), a lógica é: serviço numa **tag móvel**
(`:latest`, que o CI da main atualiza) + um **gatilho** que faz o Portainer **re-pull + reiniciar**.

**Configuração única:**
1. **Serviço na tag móvel** — no Portainer, aponte o serviço **web** para
   `ghcr.io/revisaoprojetos/plataforma_simulado:latest` (num SHA fixo, o re-pull não traz nada novo).
2. **Criar o webhook** — Portainer → **Services → web → Service webhooks → Add** → copie a URL
   (`https://SEU-PORTAINER/api/webhooks/<uuid>`).
3. **Salvar no GitHub** — repo → **Settings → Secrets and variables → Actions → New repository
   secret** → nome **`PORTAINER_WEBHOOK`**, valor = a URL do webhook.

**Como fica:** merge na `main` → CI builda `:latest` → chama o webhook → Portainer re-pulla e reinicia
= **deploy automático**. O passo já existe no `docker-publish.yml` (roda **só na main**; é no-op se o
secret não existir). Para o **worker** auto-atualizar, crie um webhook do serviço worker + um `curl`
a mais no CI.

> Alternativa sem CI: **Watchtower** (container que vigia a `:latest` e atualiza sozinho) — mas com
> GHCR **privado** precisa das credenciais do registry; o webhook é mais simples e preciso.

---

## 8. Deixar a main "inteligente" (branch protection)

No GitHub → **Settings → Branches → Add branch ruleset** (ou "Add rule") para `main`, marque:
- ☑ **Require a pull request before merging** — ninguém commita direto na main.
- ☑ **Require status checks to pass** → selecione **`integrar`** (o pr-check).
- ☑ **Require branches to be up to date before merging** ← **o "cérebro"**: se a main andar depois, o
  PR **re-valida** contra a main mais nova antes de deixar mergear.
- (opcional) ☑ **Require approvals** — exige revisão de outra pessoa.

Com isso é **impossível** entrar código quebrado ou conflitante na main.

> Enquanto o push direto na `main` **não** estiver bloqueado, evite-o mesmo assim: ele pula o PR/CI.
> (Neste ambiente o assistente já é impedido de pushar direto na main.)

---

## 9. Colaboração em equipe (cenários)

- **Você e outra pessoa, branches diferentes:** trabalho 100% isolado. Cada um pusha a sua branch;
  ninguém sobrescreve ninguém. Conflito só possível quando **as duas** mergearem na main mexendo na
  mesma coisa — e aí o **2º PR** acusa conflito (camada 4).
- **Duas pessoas, MESMA branch:** o 2º `git push` é **recusado** até `git pull`. Sempre `git pull`
  antes de pushar numa branch compartilhada.
- **Sua branch ficou velha (a main andou muito):** `git merge origin/main` na sua branch para
  atualizar. Com a proteção "up to date before merging", o GitHub obriga isso antes do merge.

---

## 10. Recuperação de incidente — produção mostrando `404 page not found`

Esse 404 (tela escura, texto puro) é do **Traefik**: **nenhum container saudável** atende o host →
a imagem apontada **não subiu** (não existe no GHCR ou não deu *pull*).

**Restaurar AGORA:** no Portainer → **Services → web → Image** → aponte para a última main boa e
marque **Re-pull / Force update**:
```
ghcr.io/revisaoprojetos/plataforma_simulado:latest
# ou o SHA explícito da última main pushada, se o :latest não resolver
```
Aguarde ~30–60s (o Swarm precisa dar *pull* e subir o task) e recarregue.

**Se ainda ficar 404:** não é a imagem, é o serviço não subindo. Portainer →
**Services → web → (o task) → Logs**: procure `pulling`, `no such manifest`, ou crash. `manifest
unknown` até no `:latest` = problema de **auth do GHCR no VPS** (o serviço não consegue baixar do
registry). Confira também se há **1 réplica rodando** (verde), não 0/1.

**Causa comum:** colar o SHA de uma **branch** (ou um SHA cujo build **ainda não terminou/falhou**)
no serviço de **produção**. Prevenção: só deploye SHA **verde** em Actions; branch só em **stack de
teste**.

---

## 11. Referência rápida (cheat sheet)

```bash
# Começar
git checkout main && git pull
git checkout -b feat/x

# Salvar/enviar
git add -A && git commit -m "msg"
git push -u origin feat/x

# Sincronizar com a main
git fetch origin && git merge origin/main

# Ver estado
git status
git branch -a
git log --oneline -10

# SHA para o Portainer (40 chars)
git rev-parse HEAD

# Desfazer um merge com conflito (sem perder nada)
git merge --abort

# Trocar de branch com trabalho pendente sem perder (guardar temporariamente)
git stash            # guarda
git stash pop        # devolve
```

**Imagens (Portainer):**
```
WEB    ghcr.io/revisaoprojetos/plataforma_simulado:<SHA>
WORKER ghcr.io/revisaoprojetos/plataforma_simulado-worker:<SHA>
```
Tag = **SHA completo (40 chars)** — o curto dá 404. Produção usa `:latest` (main).

---

## 12. Erros comuns (e o que fazer)

| Sintoma | Causa provável | Solução |
|---|---|---|
| `404 page not found` (tela escura) no site | Imagem apontada não existe/não subiu | Voltar serviço p/ `:latest` ou SHA da main; esperar CI verde antes de deployar |
| `! [rejected] ... (fetch first)` no push | Alguém pushou a MESMA branch antes | `git pull` (resolver conflito se houver) e pushar de novo |
| `CONFLICT (...)` no merge | Duas linhas de trabalho mudaram a mesma coisa | Seção 4 (editar, `git add`, `git commit`) |
| Deploy "não pegou" no Portainer | Editou `IMAGE_TAG` do stack em vez do serviço | Atualizar por **Services → web → Image**, não pelo env do stack |
| PR não roda o `integrar` | Workflow ainda não está na `main` | Mergear o PR que traz `pr-check.yml` para a main |
```
