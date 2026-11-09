#!/usr/bin/env bash
# Copia la lógica pura de src/core a la Edge Function "schedule", para que
# el servidor use exactamente el mismo algoritmo probado. Correr antes de desplegar.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p supabase/functions/schedule/core
for f in dates recurrence effort rotation; do
  { echo "// COPIA AUTOMÁTICA de src/core/$f.ts (scripts/sync-core.sh). No editar aquí."; cat "src/core/$f.ts"; } > "supabase/functions/schedule/core/$f.ts"
done
echo "Core copiado a supabase/functions/schedule/core"
