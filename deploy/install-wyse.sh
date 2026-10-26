#!/usr/bin/env bash
# Installazione sul Wyse (Linux con Node 22, nessun Docker). Eseguire dalla cartella del progetto.
# Uso: LAB_DATA=/mnt/ssd/lab ./deploy/install-wyse.sh      (NODE=/opt/node22/bin/node di default)
set -euo pipefail
NODE="${NODE:-/opt/node22/bin/node}"
NPM_DIR="$(dirname "$NODE")"
export PATH="$NPM_DIR:$PATH"
LAB_DATA="${LAB_DATA:-$HOME/lab-data}"
DIR="$(pwd)"

"$NODE" -v | grep -q '^v2[2-9]' || { echo "Serve Node 22 o successivo ($NODE)"; exit 1; }
echo "== 1/4 Dipendenze e build =="
npm ci
npm run build:web

echo "== 2/4 Dati e password =="
mkdir -p "$LAB_DATA"
if [ -z "${LAB_PASSWORD:-}" ]; then
  read -r -s -p "Scegli la password di accesso al lab (lunga): " LAB_PASSWORD; echo
fi
sudo install -m 600 /dev/null /etc/lab.env
sudo tee /etc/lab.env >/dev/null <<ENV
PORT=3000
LAB_HOST=127.0.0.1
LAB_DATA_DIR=$LAB_DATA
LAB_COURSE_FILE=$LAB_DATA/course/progress.json
LAB_TRUST_PROXY=1
LAB_PASSWORD=$LAB_PASSWORD
ENV

echo "== 3/4 Servizio =="
sed -e "s|__UTENTE__|$USER|" -e "s|__CARTELLA__|$DIR|" -e "s|__DATI__|$LAB_DATA|" -e "s|/opt/node22/bin/node|$NODE|" deploy/lab.service | sudo tee /etc/systemd/system/lab.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now lab

echo "== 4/4 Verifica =="
sleep 2
curl -fsS http://127.0.0.1:3000/api/health && echo
echo "Lab attivo su http://127.0.0.1:3000 (solo dal Wyse). Per raggiungerlo da fuori: docs/INSTALLAZIONE-WYSE.md (Tailscale)."
