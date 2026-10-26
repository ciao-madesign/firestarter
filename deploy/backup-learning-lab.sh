#!/usr/bin/env bash
# Backup del Learning Lab: archivio .tar.gz datato della cartella dati, verifica e rotazione.
# Legge solo LAB_DATA e scrive solo in BACKUP_DIR. Variabili: LAB_DATA, BACKUP_DIR, KEEP (default 8).
set -euo pipefail
LAB_DATA="${LAB_DATA:?manca LAB_DATA}"
BACKUP_DIR="${BACKUP_DIR:?manca BACKUP_DIR}"
KEEP="${KEEP:-8}"

[ -f "$LAB_DATA/.learning-lab" ] || { echo "STOP: $LAB_DATA non è una cartella dati del Learning Lab" >&2; exit 1; }
[ -d "$BACKUP_DIR" ] || { echo "STOP: $BACKUP_DIR non esiste" >&2; exit 1; }
case "$BACKUP_DIR" in "$LAB_DATA"|"$LAB_DATA"/*) echo "STOP: il backup non può stare dentro i dati" >&2; exit 1;; esac

name="learning-lab-$(date +%Y%m%d-%H%M%S).tar.gz"
tmp="$BACKUP_DIR/.$name.part"
trap 'rm -f "$tmp"' EXIT
# i file possono cambiare durante la copia (il lab è in uso): non è un errore
tar --warning=no-file-changed -czf "$tmp" -C "$LAB_DATA" . || [ $? -eq 1 ]
tar -tzf "$tmp" >/dev/null                 # verifica che l'archivio sia leggibile
tar -tzf "$tmp" | grep -q 'course/progress.json' || echo "ATTENZIONE: course/progress.json non è nell'archivio" >&2
mv "$tmp" "$BACKUP_DIR/$name"
trap - EXIT
echo "Creato $BACKUP_DIR/$name ($(du -h "$BACKUP_DIR/$name" | cut -f1))"

# rotazione: si tengono gli ultimi $KEEP archivi di questo tipo, nient'altro viene toccato
ls -1t "$BACKUP_DIR"/learning-lab-*.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  rm -f -- "$old" && echo "Rimosso il più vecchio: $old"
done
