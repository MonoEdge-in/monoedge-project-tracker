#!/bin/sh
cd "$(dirname "$0")/.."
if [ ! -f dist/server.cjs ]; then
  echo "monoedge-tracker: dist/server.cjs is missing." >&2
  exit 1
fi
exec node dist/server.cjs
