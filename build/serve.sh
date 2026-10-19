#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Serve o site estatico para a rede local.
#
# Nao ha processo de build: public/ e o site. Qualquer servidor de arquivos
# estaticos serve -- este script usa o modulo http.server do Python so para
# evitar instalar mais uma coisa no cluster.
#
#   ./build/serve.sh [porta]     porta padrao: 8899
# ---------------------------------------------------------------------------
set -euo pipefail

PORT="${1:-8899}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/public"
PIDFILE="/tmp/integramar-site-${PORT}.pid"

# Mata apenas o processo registrado neste pidfile. Nunca `pkill -f python3`:
# a maquina e compartilhada e ja derrubamos servico de terceiros assim.
if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "derrubando instancia anterior (pid $(cat "$PIDFILE"))"
  kill "$(cat "$PIDFILE")"
  sleep 1
fi

cd "$ROOT"
setsid nohup python3 -m http.server "$PORT" --bind 0.0.0.0 \
  > "/tmp/integramar-site-${PORT}.log" 2>&1 &
echo $! > "$PIDFILE"
sleep 1

IP="$(hostname -I | awk '{print $1}')"
echo "servindo $ROOT"
echo "  local : http://127.0.0.1:${PORT}/"
echo "  rede  : http://${IP}:${PORT}/"
echo "  pid   : $(cat "$PIDFILE")   log: /tmp/integramar-site-${PORT}.log"
