#!/usr/bin/env bash
# Installa il backup settimanale del Learning Lab (timer systemd dedicato). Non tocca altro.
# Uso:  LAB_DATA=/mnt/data/learning-lab BACKUP_DIR=/mnt/data/backup-learning-lab ./deploy/install-backup-wyse.sh
set -euo pipefail
LAB_DATA="${LAB_DATA:-/mnt/data/learning-lab}"
BACKUP_DIR="${BACKUP_DIR:-/mnt/data/backup-learning-lab}"
KEEP="${KEEP:-8}"
RUN_USER="learninglab"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
fail() { echo "STOP: $*" >&2; exit 1; }

echo "== Controlli preliminari (nessuna modifica) =="
# la cartella dati è 700 di learninglab: il controllo va fatto con sudo
sudo test -f "$LAB_DATA/.learning-lab" || fail "$LAB_DATA non è la cartella dati del Learning Lab"
id "$RUN_USER" >/dev/null 2>&1 || fail "l'utente $RUN_USER non esiste: installa prima il lab"
case "$DIR" in /home/*|/root/*) fail "il progetto deve stare fuori da /home";; esac
case "$BACKUP_DIR" in "$LAB_DATA"|"$LAB_DATA"/*) fail "BACKUP_DIR non può stare dentro i dati";; esac
if sudo test -e "$BACKUP_DIR" && [ -n "$(sudo ls -A "$BACKUP_DIR" 2>/dev/null)" ] && ! sudo test -f "$BACKUP_DIR/.learning-lab-backup"; then fail "$BACKUP_DIR non è vuota e non è dei backup del lab"; fi
for u in learning-lab-backup.service learning-lab-backup.timer; do [ ! -e "/etc/systemd/system/$u" ] || fail "$u esiste già"; done
echo "Dati: $LAB_DATA  ->  Backup: $BACKUP_DIR (ultime $KEEP copie, ogni domenica alle 03:30)"
read -r -p "Procedere? [s/N] " ok; [ "$ok" = "s" ] || exit 0

sudo install -d -m 700 -o "$RUN_USER" -g "$RUN_USER" "$BACKUP_DIR"
sudo -u "$RUN_USER" touch "$BACKUP_DIR/.learning-lab-backup"
chmod +x "$DIR/deploy/backup-learning-lab.sh"
for f in service timer; do
  sed -e "s|__CARTELLA__|$DIR|g" -e "s|__DATI__|$LAB_DATA|g" -e "s|__BACKUP__|$BACKUP_DIR|g" -e "s|__COPIE__|$KEEP|g" "$DIR/deploy/learning-lab-backup.$f" | sudo tee "/etc/systemd/system/learning-lab-backup.$f" >/dev/null
done
sudo systemctl daemon-reload
sudo systemctl enable --now learning-lab-backup.timer
echo "== Prima copia di prova =="
sudo systemctl start learning-lab-backup.service
sudo ls -lh "$BACKUP_DIR"
systemctl list-timers learning-lab-backup.timer --no-pager | head -3
echo "Ripristino: vedi docs/INSTALLAZIONE-WYSE.md. Rimozione: sudo systemctl disable --now learning-lab-backup.timer && sudo rm /etc/systemd/system/learning-lab-backup.*"
