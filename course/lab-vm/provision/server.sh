#!/bin/bash
# Prepara il SERVER (eseguito da Vagrant al primo avvio).
set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq python3 curl jq ufw >/dev/null
install -d /opt/lab /etc/taskflow
install -m 755 /vagrant/provision/server/taskflow.py /vagrant/provision/server/taskflow-db.py /vagrant/provision/server/scenario.sh /opt/lab/
install -m 644 /vagrant/provision/server/taskflow.service /vagrant/provision/server/taskflow-db.service /etc/systemd/system/
/opt/lab/scenario.sh ok
