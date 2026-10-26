#!/usr/bin/env bash
# Installazione ISOLATA del Learning Lab su Ubuntu (Wyse), accanto ad altri progetti (es. PersonalHub).
# Non tocca altri servizi, porte, utenti, Docker, nginx o la configurazione Tailscale esistente.
# Uso:  LAB_DATA=/mnt/data/learning-lab ./deploy/install-wyse.sh
# Solo rete di casa: LAB_HOST=<IP del Wyse> LAB_TRUST_PROXY=0 LAB_DATA=... ./deploy/install-wyse.sh
# Prima di modificare qualsiasi cosa esegue controlli e si ferma se qualcosa è già occupato.
set -euo pipefail

# Node 22: usa $NODE se indicato, altrimenti /opt/node22/bin/node, altrimenti il "node" di sistema se è la 22 o successiva.
if [ -z "${NODE:-}" ]; then
  if [ -x /opt/node22/bin/node ]; then NODE=/opt/node22/bin/node
  elif command -v node >/dev/null 2>&1; then NODE="$(command -v node)"
  else NODE=/opt/node22/bin/node; fi
fi
PORT="${LAB_PORT:-3100}"
HOST="${LAB_HOST:-127.0.0.1}"          # per la sola rete di casa: l'IP del Wyse (non 0.0.0.0)
TRUST_PROXY="${LAB_TRUST_PROXY:-1}"     # 1 solo dietro Tailscale/proxy; 0 con accesso diretto dalla LAN
SERVICE="learning-lab"
RUN_USER="learninglab"
LAB_DATA="${LAB_DATA:-/var/lib/learning-lab}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$(dirname "$NODE"):$PATH"

fail() { echo "STOP: $*" >&2; exit 1; }

echo "== Controlli preliminari (nessuna modifica) =="
"$NODE" -v | grep -q '^v2[2-9]' || fail "serve Node 22 o successivo ($NODE)"
[ -f "$DIR/package.json" ] || fail "esegui lo script dalla copia del progetto"
case "$DIR" in /home/*|/root/*) fail "il servizio ha ProtectHome=true e non vedrebbe $DIR: installa il progetto fuori da /home, per esempio in /opt/learning-lab";; esac
case "$DIR" in *personalhub*) fail "la cartella del lab non deve stare dentro PersonalHub";; esac
case "$LAB_DATA" in *personalhub*) fail "i dati del lab non devono stare dentro PersonalHub";; esac
[ ! -e "/etc/systemd/system/$SERVICE.service" ] || fail "il servizio $SERVICE esiste già (aggiornamento: vedi la guida)"
if ss -ltn "sport = :$PORT" | grep -q LISTEN; then fail "la porta $PORT è già in uso: scegline un'altra con LAB_PORT=..."; fi
if [ -d "$LAB_DATA" ] && [ -n "$(ls -A "$LAB_DATA" 2>/dev/null)" ] && [ ! -f "$LAB_DATA/.learning-lab" ]; then
  fail "$LAB_DATA non è vuota e non è del Learning Lab: usa una cartella nuova"
fi
if id "$RUN_USER" >/dev/null 2>&1 && [ "$(id -un)" != "$RUN_USER" ]; then echo "(utente $RUN_USER già presente: riuso)"; fi
echo "Porta $PORT libera, servizio e cartella dati dedicati: ok."
read -r -p "Procedere? [s/N] " ok; [ "$ok" = "s" ] || exit 0

echo "== 1/4 Build (nella cartella del progetto, senza installazioni globali) =="
( cd "$DIR" && npm ci && npm run build:web )

echo "== 2/4 Utente e dati dedicati =="
id "$RUN_USER" >/dev/null 2>&1 || sudo useradd --system --no-create-home --shell /usr/sbin/nologin "$RUN_USER"
sudo mkdir -p "$LAB_DATA"
sudo touch "$LAB_DATA/.learning-lab"
sudo chown -R "$RUN_USER:$RUN_USER" "$LAB_DATA"
sudo chmod 700 "$LAB_DATA"
# stato del corso: se esiste nel progetto lo si copia (una sola volta) tra i dati del lab
if [ -f "$DIR/course/progress.json" ] && [ ! -f "$LAB_DATA/course/progress.json" ]; then
  sudo install -d -m 700 -o "$RUN_USER" -g "$RUN_USER" "$LAB_DATA/course"
  sudo install -m 600 -o "$RUN_USER" -g "$RUN_USER" "$DIR/course/progress.json" "$LAB_DATA/course/progress.json"
fi
if [ -z "${LAB_PASSWORD:-}" ]; then read -r -s -p "Scegli la password di accesso al lab (lunga): " LAB_PASSWORD; echo; fi
sudo install -m 600 -o root -g root /dev/null "/etc/$SERVICE.env"
sudo tee "/etc/$SERVICE.env" >/dev/null <<ENV
PORT=$PORT
LAB_HOST=$HOST
LAB_DATA_DIR=$LAB_DATA
LAB_COURSE_FILE=$LAB_DATA/course/progress.json
LAB_TRUST_PROXY=$TRUST_PROXY
LAB_PASSWORD=$LAB_PASSWORD
ENV

echo "== 3/4 Servizio dedicato =="
sed -e "s|__CARTELLA__|$DIR|g" -e "s|__NODE__|$NODE|" -e "s|__DATI__|$LAB_DATA|" "$DIR/deploy/learning-lab.service" | sudo tee "/etc/systemd/system/$SERVICE.service" >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now "$SERVICE"

echo "== 4/4 Verifica =="
sleep 2
curl -fsS "http://$HOST:$PORT/api/health" && echo
echo "Learning Lab attivo su $HOST:$PORT. Per l'accesso da fuori: docs/INSTALLAZIONE-WYSE.md"
echo "Disinstallazione completa: ./deploy/uninstall-wyse.sh"
