#!/usr/bin/env bash
#
# Build script: gera os dois "outputs" a partir dos módulos em src/.
#
#   src/*.js              (ordem alfabética)
#     -> extension/page-script.js          (apenas IIFE, sem cabeçalho)
#     -> userscript/jira-localidade.user.js (IIFE + cabeçalho @UserScript do Tampermonkey)
#
# A versão (@version do userscript) é lida de extension/manifest.json.
# Para subir versão, edite somente extension/manifest.json e rode este script.
#
# Uso: ./build.sh
#
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[erro] Node nao encontrado. Necessario para validar a sintaxe do JS." >&2
  exit 1
fi

VERSION="$(python3 -c "import json; print(json.load(open('extension/manifest.json'))['version'])")"

SRC_DIR="src"
EXTENSION_OUT="extension/page-script.js"
USERSCRIPT_OUT="userscript/jira-localidade.user.js"

mkdir -p "$(dirname "$EXTENSION_OUT")" "$(dirname "$USERSCRIPT_OUT")"

# Concatena src/*.js em ordem alfabetica
TMP_DIR="$(mktemp -d)"
TMP_BUNDLE="$TMP_DIR/bundle.js"
trap 'rm -rf "$TMP_DIR"' EXIT

# shellcheck disable=SC2012
SRC_FILES=$(ls "$SRC_DIR"/*.js | sort)
if [ -z "$SRC_FILES" ]; then
  echo "[erro] Nenhum arquivo encontrado em $SRC_DIR/*.js" >&2
  exit 1
fi

: > "$TMP_BUNDLE"
for f in $SRC_FILES; do
  cat "$f" >> "$TMP_BUNDLE"
done

# Inline do scraper do Text Blaze: substitui o placeholder __TB_SCRAPER_ENCODED__
# pelo conteudo do tools/textblaze-scraper.bookmarklet.js URL-encoded.
# Isso permite o bookmarklet rodar 100% inline (sem precisar baixar nada),
# contornando CSPs estritas como a do dashboard.blaze.today.
TB_SCRAPER_FILE="tools/textblaze-scraper.bookmarklet.js"
if [ -f "$TB_SCRAPER_FILE" ]; then
  TB_ENCODED=$(python3 -c "
import urllib.parse, sys
with open('$TB_SCRAPER_FILE','r') as f:
    code = f.read()
# Encode mais agressivo (safe='') pra escapar tambem aspas/parenteses
print(urllib.parse.quote(code, safe=''))
")
  # Substituicao via python pra escapar adequadamente caracteres especiais
  python3 -c "
import sys
with open('$TMP_BUNDLE','r') as f:
    bundle = f.read()
encoded = '''$TB_ENCODED'''
bundle = bundle.replace('__TB_SCRAPER_ENCODED__', encoded)
with open('$TMP_BUNDLE','w') as f:
    f.write(bundle)
"
  echo "[info] inline do scraper TB ok (${#TB_ENCODED} chars encodados)"
fi

# Sanity check de sintaxe
if ! node --check "$TMP_BUNDLE" 2>/dev/null; then
  echo "[erro] Sintaxe invalida no bundle:" >&2
  node --check "$TMP_BUNDLE" || true
  exit 1
fi

# 1) extension/page-script.js  (so o bundle, IIFE puro)
cp "$TMP_BUNDLE" "$EXTENSION_OUT"

# 2) userscript/jira-localidade.user.js  (cabecalho Tampermonkey + bundle)
cat > "$USERSCRIPT_OUT" << USERSCRIPT_HEADER
// ==UserScript==
// @name         Jira Localidade
// @namespace    https://github.com/gunsouza/jira-localidade
// @version      ${VERSION}
// @description  Adiciona o botao flutuante "Localidade" aos tickets do Jira: lista duplicados pela mesma localidade (Assets / IS Ubicacion), permite vincular como duplicado, comentar como observacao interna em lote e derivar para outros times.
// @author       gunsouza
// @match        https://*.atlassian.net/*
// @run-at       document-idle
// @grant        none
// @noframes
// @updateURL    https://raw.githubusercontent.com/gunsouza/jira-localidade/main/userscript/jira-localidade.user.js
// @downloadURL  https://raw.githubusercontent.com/gunsouza/jira-localidade/main/userscript/jira-localidade.user.js
// @homepageURL  https://github.com/gunsouza/jira-localidade
// ==/UserScript==

USERSCRIPT_HEADER

cat "$TMP_BUNDLE" >> "$USERSCRIPT_OUT"

node --check "$EXTENSION_OUT" >/dev/null
node --check "$USERSCRIPT_OUT" >/dev/null

EXT_LINES=$(wc -l < "$EXTENSION_OUT" | tr -d ' ')
US_LINES=$(wc -l < "$USERSCRIPT_OUT" | tr -d ' ')

echo "Build OK (v${VERSION})"
echo "  $EXTENSION_OUT   (${EXT_LINES} linhas)"
echo "  $USERSCRIPT_OUT   (${US_LINES} linhas)"
echo ""
echo "Proximos passos:"
echo "  - Tampermonkey: abra $USERSCRIPT_OUT, copie tudo, cole no Tampermonkey, Cmd+S."
echo "  - Extensao:    chrome://extensions -> Compactar extensao -> aponte para ./extension."
