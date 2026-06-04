#!/usr/bin/env bash
#
# Empacota a extensão em um .zip pronto para instalar.
# Uso:   ./pack.sh
# Saída: dist/jira-localidade-vX.Y.Z.zip
#
set -euo pipefail

cd "$(dirname "$0")"

VERSION="$(node -p "require('./extension/manifest.json').version" 2>/dev/null \
  || python3 -c "import json; print(json.load(open('extension/manifest.json'))['version'])")"

OUT_DIR="dist"
OUT_FILE="${OUT_DIR}/jira-localidade-v${VERSION}.zip"

mkdir -p "${OUT_DIR}"
rm -f "${OUT_FILE}"

cd extension
zip -r "../${OUT_FILE}" . \
  -x ".DS_Store" \
  -x "*/.DS_Store" \
  -x "._*"
cd ..

echo ""
echo "Pacote gerado:"
echo "  ${OUT_FILE}"
echo ""
echo "Para instalar:"
echo "  1) Abra chrome://extensions"
echo "  2) Ative 'Modo do desenvolvedor' (se conseguir) OU use o canal corporativo de instalação"
echo "  3) Arraste o .zip para a página de extensões"
echo "     (alternativa: chrome://extensions -> 'Carregar sem compactação' -> aponte para ./extension)"
