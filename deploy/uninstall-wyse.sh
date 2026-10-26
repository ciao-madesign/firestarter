#!/usr/bin/env bash
# Rimuove SOLO il Learning Lab (servizio, file di configurazione, utente). I dati si cancellano solo se lo chiedi.
set -euo pipefail
SERVICE="learning-lab"
sudo systemctl disable --now "$SERVICE" 2>/dev/null || true
sudo rm -f "/etc/systemd/system/$SERVICE.service" "/etc/$SERVICE.env"
sudo systemctl daemon-reload
id learninglab >/dev/null 2>&1 && sudo userdel learninglab || true
echo "Servizio rimosso. I dati restano dove sono (cancellali a mano se vuoi). Tailscale: rimuovi la sola regola del lab (vedi guida)."
