#!/bin/bash
# Porta il SERVER a uno scenario noto. Uso: sudo /opt/lab/scenario.sh ok|stopped|wrong_port|db_down|multi|firewall|multi2
# Gli scenari sono gli stessi del laboratorio simulato (M11). Ripristino completo = ./scenario.sh ok.
set -e
[ "$(id -u)" = 0 ] || { echo "Esegui con sudo." >&2; exit 1; }
scenario="${1:-ok}"
port=8080
case "$scenario" in
  ok|stopped|db_down|firewall|multi2) ;;
  wrong_port|multi) port=9090 ;;
  *) echo "Scenario sconosciuto: $scenario (ok, stopped, wrong_port, db_down, multi, firewall, multi2)" >&2; exit 1 ;;
esac
mkdir -p /etc/taskflow
printf '# TaskFlow (laboratorio): configurazione del servizio\nPORT=%s\nLOG_LEVEL=info\n' "$port" > /etc/taskflow/taskflow.env
systemctl daemon-reload
systemctl stop taskflow taskflow-db 2>/dev/null || true
# firewall: ufw attivo con SSH sempre ammesso; la porta del servizio è ammessa (DENY nei soli scenari firewall e multi2)
ufw --force reset >/dev/null
ufw allow 22/tcp >/dev/null
case "$scenario" in
  firewall|multi2) ufw deny 8080/tcp >/dev/null ;;
  *)               ufw allow 8080/tcp >/dev/null ;;
esac
ufw --force enable >/dev/null
case "$scenario" in
  ok|wrong_port|firewall) systemctl start taskflow-db taskflow ;;
  stopped)    systemctl start taskflow-db ;;
  db_down|multi2) systemctl start taskflow ;;
  multi)      ;;
esac
echo "Scenario '$scenario' applicato."
