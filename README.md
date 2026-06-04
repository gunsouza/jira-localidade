# Jira Localidade

Helper para tickets do Jira (Mercado Livre) que adiciona um botão flutuante **Localidade** e injeta um modal com:

- **Duplicados**: lista tickets da mesma localidade (Assets / `IS Ubicación`), extrai IDs (IP, MAC, serial, ZEB/ZPL, quantidades), faz scoring de match, e permite **vincular como duplicado** + **comentar como observação interna** em lote.
- **Derivar**: derivação para outro time (allowlist) com comentário padrão, em 2 cliques. Quando deriva para a fila de SE (`IS-SHIP-SE-N2`), oferece um checkbox para **criar tarefa ISS de troubleshooting** acoplada.
- **Criar tarefa ISS** (integrado ao Derivar): cria uma `Tarefa` no projeto `ISS` com:
  - Resumo `Troubleshooting <key-original>`
  - Descrição copiada do ticket original (com fallback inteligente caso o plugin custom bloqueie ADF rico)
  - Mesma localidade (`IS Ubicación`)
  - Demanda = `Analisis`, Service = `CCTV`, Resolution Team = `IS-SHIP-NATS-N1`
  - Prioridade copiada do origem
  - Responsável = você (usuário logado)
  - Vinculada ao ticket original ("é vinculado pelo")
  - Anexos do ticket original copiados (opcional)
  - Comentário interno no ticket original mencionando a nova `ISS-XXXX`
- **Debug: capturar payloads** (modo dev): intercepta requests POST do Jira pra inspecionar/copiar bodies, útil pra entender o que a UI envia.

Funciona em qualquer `*.atlassian.net` e é injetado automaticamente em telas `/browse/...` e `/queues/issue/...`.

Atalhos de teclado padrão (todos abrem/fecham o modal): **`Alt+L`**, **`Cmd+Shift+L`** (Mac), **`Ctrl+Shift+L`** (Win/Linux). Suporta múltiplos atalhos, configurável.

---

## Caminhos de distribuição

Dois caminhos suportados, escolha o que a política da sua máquina permitir:

| Caminho | Quando usar | Auto-injeta? | Edição rápida? |
|---|---|---|---|
| **Userscript via Tampermonkey** ⭐ recomendado | Política bloqueia extensões locais mas permite extensões da Chrome Web Store | ✅ sim | ✅ edita no painel do Tampermonkey |
| Extensão Chrome MV3 (`.crx`) | Você consegue carregar `.crx` localmente ou TI colocou o ID na allowlist | ✅ sim | ❌ repack a cada mudança |

A fonte única de verdade é a pasta `src/`. O build script (`./build.sh`) gera os dois outputs a partir dela.

---

## Estrutura do projeto

```
.
├── src/                                # FONTE — editar aqui
│   ├── 00-iife-start.js               # abertura da IIFE
│   ├── 05-settings.js                 # storage (load/save/reset) — localStorage
│   ├── 10-config.js                   # defaults + merge com settings
│   ├── 20-utils.js                    # esc, getIssueKey, parseShortcuts, etc.
│   ├── 30-cache.js                    # cache em memória + sessionStorage
│   ├── 40-style.js                    # CSS de todos os modais
│   ├── 45-modal.js                    # modal base (Home) + helpers de abrir/fechar
│   ├── 50-jira-api.js                 # search, getIssue, addInternalComment, link
│   ├── 55-assets-api.js               # connected tickets (Assets API)
│   ├── 60-identifiers.js              # extração e match de IDs
│   ├── 70-derive.js                   # transitions + modal + execução (com checkbox ISS)
│   ├── 72-iss-task.js                 # criação de tarefa ISS (multi-fallback)
│   ├── 74-debug-capture.js            # modal debug pra capturar payloads POST
│   ├── 80-render-home.js              # Home com os cards
│   ├── 82-settings-ui.js              # modal de Configurações
│   ├── 85-duplicates-helpers.js       # computeCounts, applyFilter, renderIssueCard
│   ├── 90-render-duplicates.js        # Duplicados (render + interações)
│   ├── 95-runtime.js                  # botão flutuante, atalho(s), bootstrap
│   └── 99-iife-end.js                 # fechamento da IIFE
├── extension/
│   ├── manifest.json                  # MV3
│   └── page-script.js                 # GERADO por build.sh
├── userscript/
│   └── jira-localidade.user.js        # GERADO por build.sh
├── build.sh                           # bundle: src/*.js -> extension + userscript
├── pack.sh                            # opcional: empacota a extensão em .zip
├── dist/                              # ignorado pelo Git (.crx, .zip gerados)
└── README.md
```

---

## Como editar

1. Abra qualquer arquivo em `src/` e edite.
2. Suba a versão em `extension/manifest.json` (`"version": "1.2.1"` etc).
3. Rode:
   ```bash
   ./build.sh
   ```
4. Reinstale o output (veja "Como instalar" abaixo). No Tampermonkey, basta colar de novo. Na extensão, repack.

> ⚠️ **Nunca edite `extension/page-script.js` nem `userscript/jira-localidade.user.js` direto** — eles são regerados pelo `build.sh` e sua edição será perdida.

---

## Como instalar — Userscript (Tampermonkey) ⭐ recomendado

### Primeira instalação

1. **Instale o Tampermonkey** pela Chrome Web Store: <https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo>
2. Gere o userscript:
   ```bash
   ./build.sh
   ```
3. Abra `userscript/jira-localidade.user.js`, copie tudo, e cole em **Tampermonkey → + (Criar novo script)**. Salve com **Cmd+S** (ou Ctrl+S).
4. Abra qualquer ticket no Jira → o botão **Localidade** aparece no canto inferior direito em ~1s.
5. (Opcional) Use o atalho **`Alt+L`** (ou `Cmd+Shift+L` no Mac) para abrir/fechar o modal.

### Atualizações

- **Editou `src/`** → rode `./build.sh` → copie o arquivo `userscript/jira-localidade.user.js` e cole no Tampermonkey de novo.
- Se você publicou no GitHub (ver seção abaixo), o Tampermonkey checa atualizações via `@updateURL` periodicamente. Cole uma vez, atualizações chegam sozinhas.

---

## Configurações (UI in-app)

Tudo é configurável sem mexer no código:

1. Abra o modal **Localidade** (botão ou atalho).
2. Clique no ícone de **engrenagem** (canto superior direito do modal).
3. Edite e clique em **Salvar e recarregar página**.

O que você pode mudar:

| Seção | Campos |
|---|---|
| **Projetos & busca** | Projetos considerados, custom field IDs (Asset/Resolution Team), filtro de "em aberto" (JQL parcial), ordenação, esconder resolvidos |
| **Cache & paginação** | TTL do cache em minutos (0 desliga), tickets por página (Assets), max páginas, max issues no search |
| **Derivar** | Nome da transição, comentário padrão, allowlist de times |
| **Criar tarefa ISS** | Times que disparam o checkbox, projeto/issuetype, summary template, IDs dos customfields (Demanda/Service), valores padrão, Resolution Team, link type, issue modelo (opcional), copiar anexos |
| **Interface** | Atalhos de teclado (um por linha), comprimento do preview de descrição |

As configurações ficam em `localStorage` da origem do Jira (chave `ml_loc_settings_v1`). Botão **Resetar para padrão** apaga tudo.

---

## Criar tarefa ISS (detalhes técnicos)

A criação da tarefa ISS é robusta a validadores customizados do Jira (ex: o plugin "All fields are required to create the task" que existe na instância da Mercado Livre). Estratégia:

1. **Create otimizado**: cria a tarefa com `description` mínima (`Troubleshooting <key>`) — passa rápido em qualquer plugin.
2. **Enriquecimento via PUT**: imediatamente após o create, faz `PUT /issue/{key}` reaplicando a descrição original. Como validadores custom geralmente só rodam no CREATE, o PUT persiste a descrição completa.
3. **Cascata de formatos**: se o PUT com ADF original for rejeitado, tenta texto puro (achatado do ADF, sem mentions/panels/links). Último recurso: adiciona a descrição como **comentário** na nova tarefa.
4. **Asset, customfields e anexos**: copiados via formatos descobertos por capturas reais da UI do Jira (`?updateHistory=true&applyDefaultValues=false`).
5. **Comentário interno no original**: adiciona `Tarefa de troubleshooting criada e vinculada: ISS-XXXX (<link>)` no ticket que originou a derivação.

O alerta final informa exatamente em qual variante a descrição foi persistida, pra você saber se precisa editar manualmente algum detalhe.

---

## Debug: capturar payloads

Use quando suspeitar que o Jira está aceitando/rejeitando algo de forma silenciosa.

1. Abra o modal **Localidade** → card **Debug: capturar payloads**.
2. Interaja com o Jira (ex: crie uma tarefa pela UI). O modal vai listar todos os requests POST com URL, status, tamanho do body e timestamp.
3. Filtre por substring (URL ou conteúdo do body), ordene por tempo ou tamanho.
4. Click em **Ver** pra ver o body completo e a response (primeiros 600 chars).
5. **Copiar body** pra colar em qualquer lugar (chat, diff, etc.).

Sem precisar abrir DevTools/Network.

---

## Publicar no GitHub (auto-update + share fácil com o time)

A vantagem: depois que o `.user.js` está num raw URL do GitHub, qualquer colega que tenha Tampermonkey só precisa clicar no link uma vez para instalar — e o Tampermonkey vai puxar atualizações automaticamente via `@updateURL` toda vez que você commitar uma versão nova.

### Setup inicial (uma vez)

```bash
cd "~/Documents/Projetos/Bookmarklet Jira"
git init
git add -A
git commit -m "feat: extensão + userscript v1.7.x"
git remote add origin git@github.com:gunsouza/jira-localidade.git
git branch -M main
git push -u origin main
```

> Importante: o `.gitignore` já exclui `dist/`, `.crx` e `.pem`. **Não comite a chave privada.**

### Compartilhar com o time

Mande o link:

```
https://raw.githubusercontent.com/gunsouza/jira-localidade/main/userscript/jira-localidade.user.js
```

Com Tampermonkey instalado, clicar nesse link abre direto a tela de instalação do userscript. Um clique e está pronto.

### Publicar uma atualização

```bash
# 1) edite arquivos em src/
# 2) suba a versão em extension/manifest.json
# 3) rebuild + commit + push
./build.sh
git add -A
git commit -m "feat: descrição da mudança (vX.Y.Z)"
git push
```

Em ~1 dia o Tampermonkey detecta a nova versão e notifica seus colegas. Eles aceitam e está atualizado.

---

## Como instalar — Extensão Chrome (.crx)

Backup caso o Tampermonkey não funcione. Caminho mais frágil porque depende da política aceitar `.crx` não-Web-Store. No nosso caso a política da Mercado Livre bloqueou.

1. `chrome://extensions` → **Compactar extensão** → aponte para `./extension`.
2. Use a chave privada de `~/.keys/jira-localidade/extension.pem` para atualizações (mesmo ID).
3. Arraste o `.crx` para `chrome://extensions`.

---

## Atalhos & truques

- **`Alt+L`** / **`Cmd+Shift+L`** / **`Ctrl+Shift+L`** — abrem/fecham o modal de Localidade (configuráveis).
- **Click no ID** (chip) — filtra cards que contêm aquele ID.
- **Click no card** — seleciona/desseleciona (para ações em lote).
- **Ctrl/Cmd+Click no card** — abre o ticket em nova aba.
- **Click em "Detalhes"** — expande a descrição completa do ticket.
- **Derivar para `IS-SHIP-SE-N2`** — habilita o checkbox "Criar tarefa de troubleshooting (ISS)" automaticamente.

---

## Troubleshooting

| Problema | Causa provável | Solução |
|---|---|---|
| Botão "Localidade" não aparece | Tampermonkey desligado, ou regra `@match` não bateu | Confirme que o script aparece habilitado no Tampermonkey e que a URL é `*.atlassian.net` |
| Erro "customfield_18388 sem objectId" | Ticket sem IS Ubicación preenchido ou CF ID errado | Confira em Configurações → "Custom field IS Ubicacion" |
| Duplicados não acha nada | Asset sem tickets vinculados, ou todos resolvidos | Tente desligar "Esconder resolvidos" em Configurações |
| Atalho não funciona | Conflito com atalho do navegador/SO ou foco em campo de texto | Configurações → adicione/troque por outra combinação |
| "Falha ao comentar / vincular" | Permissão Jira ou sessão expirada | Recarregue a página e tente de novo |
| Tarefa ISS criada com descrição vazia | Plugin custom rejeitou ADF rico E texto puro | Veja o alerta — a descrição foi adicionada como comentário na nova tarefa, copie de lá |
| Tipo de link "vinculado pelo" errado | Auto-discovery achou outro link similar | Configurações → "Nome do link type" → cole o `name` exato (ex: `Relates pt`) |
| Erro "All fields are required to create the task" | Plugin custom bloqueando o create | Já tratado pela cascata interna. Se persistir, configure uma **Issue modelo** (ISS-XXXX existente e completa) em Configurações |
