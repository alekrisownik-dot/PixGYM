#!/bin/sh
# Kopia zapasowa raz na dobę: zrzut bazy (pg_dump) i zaszyfrowane zdjęcia, do /backups.
# Co godzinę sprawdza, czy dzisiejsza kopia już jest, więc laptop uśpiony w nocy też ją zrobi.
# Starsze niż BACKUP_KEEP_DAYS dni są usuwane.
#
# Uwaga: zdjęcia są zaszyfrowane kluczem PIXGYM_PHOTO_KEY z .env. Bez tego klucza kopia zdjęć
# jest bezużyteczna, więc .env trzymaj osobno (np. w menedżerze haseł).
set -eu

DIR=/backups
KEEP=${BACKUP_KEEP_DAYS:-14}
export PGPASSWORD="$POSTGRES_PASSWORD"

backup() {
  day=$(date +%F)
  [ -f "$DIR/$day/OK" ] && return 0
  tmp="$DIR/.$day.tmp"
  rm -rf "$tmp"
  mkdir -p "$tmp"
  echo "$(date '+%F %T') kopia $day…"
  pg_dump -h db -U pixgym -d pixgym -Fc -f "$tmp/pixgym.dump"
  tar -czf "$tmp/photos.tar.gz" -C /data/photos .
  # Plik OK na końcu: katalog bez niego to kopia przerwana w połowie.
  printf '%s\n' "$(date -Iseconds)" > "$tmp/OK"
  rm -rf "${DIR:?}/$day"
  mv "$tmp" "$DIR/$day"
  find "$DIR" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +"$KEEP" -exec rm -rf {} +
  echo "$(date '+%F %T') gotowe: $(du -sh "$DIR/$day" | cut -f1)"
}

if [ "${1:-}" = "now" ]; then
  backup
  exit
fi

while true; do
  backup || echo "$(date '+%F %T') BŁĄD kopii, ponowię za godzinę"
  sleep 3600
done
