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
install -d /opt/lab
install -m 755 /vagrant/provision/client/client-scenario.sh /opt/lab/
/opt/lab/client-scenario.sh ok
