#!/bin/bash
# Prepara il CLIENT: strumenti e variabili d'ambiente del laboratorio.
set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl jq netcat-openbsd dnsutils >/dev/null
cat > /etc/profile.d/taskflow-lab.sh <<'ENV'
export TASKFLOW_URL=http://server.lab:8080
export TASKFLOW_TOKEN=tf_lab_bob
ENV
grep -q 'server.lab' /etc/hosts || echo '192.168.50.10 server.lab server' >> /etc/hosts
