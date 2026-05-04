#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

npm install
npm run compile
npx @vscode/vsce package
rm -f ../curator/extension/*.vsix
mv -- *.vsix ../curator/extension

