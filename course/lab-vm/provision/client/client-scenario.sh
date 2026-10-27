#!/bin/bash
# Porta il CLIENT a uno scenario noto per la risoluzione dei nomi. Uso: sudo /opt/lab/client-scenario.sh ok|dns_wrong
# dns_wrong: /etc/hosts manda server.lab a un indirizzo sbagliato (192.168.50.11), come nello scenario simulato.
set -e
[ "$(id -u)" = 0 ] || { echo "Esegui con sudo." >&2; exit 1; }
sed -i '/server\.lab/d' /etc/hosts
case "${1:-ok}" in
  ok)        echo '192.168.50.10 server.lab server' >> /etc/hosts ;;
  dns_wrong) echo '192.168.50.11 server.lab' >> /etc/hosts ;;
  *) echo "Scenario sconosciuto: $1 (ok, dns_wrong)" >&2; exit 1 ;;
esac
echo "Client: scenario '${1:-ok}' applicato."
