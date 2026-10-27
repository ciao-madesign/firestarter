#!/bin/bash
# Porta il SERVER a uno scenario noto. Uso: sudo /opt/lab/scenario.sh ok|stopped|wrong_port|db_down|multi
# Gli scenari sono gli stessi del laboratorio simulato (M11). Ripristino completo = ./scenario.sh ok.
set -e
[ "$(id -u)" = 0 ] || { echo "Esegui con sudo." >&2; exit 1; }
scenario="${1:-ok}"
port=8080
case "$scenario" in
  ok|stopped|db_down) ;;
  wrong_port|multi) port=9090 ;;
  *) echo "Scenario sconosciuto: $scenario (ok, stopped, wrong_port, db_down, multi)" >&2; exit 1 ;;
esac
mkdir -p /etc/taskflow
printf '# TaskFlow (laboratorio): configurazione del servizio\nPORT=%s\nLOG_LEVEL=info\n' "$port" > /etc/taskflow/taskflow.env
systemctl daemon-reload
systemctl stop taskflow taskflow-db 2>/dev/null || true
case "$scenario" in
  ok)         systemctl start taskflow-db taskflow ;;
  wrong_port) systemctl start taskflow-db taskflow ;;
  stopped)    systemctl start taskflow-db ;;
  db_down)    systemctl start taskflow ;;
  multi)      ;;
esac
echo "Scenario '$scenario' applicato."
