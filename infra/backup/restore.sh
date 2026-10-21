#!/bin/sh
# Odtworzenie z kopii (nadpisuje bieżącą bazę i zdjęcia!). Uruchamiać z katalogu projektu:
#   sh infra/backup/restore.sh backups/2026-10-21
# Potrzebny ten sam .env (hasła bazy i PIXGYM_PHOTO_KEY), co w chwili robienia kopii.
set -eu

SRC=${1:?podaj katalog kopii, np. backups/2026-10-21}
[ -f "$SRC/OK" ] || { echo "Brak $SRC/OK: kopia niepełna albo zła ścieżka." >&2; exit 1; }

printf 'Nadpisać bazę i zdjęcia kopią z %s? Wpisz TAK: ' "$SRC"
read -r answer
[ "$answer" = "TAK" ] || exit 1

docker-compose stop api
docker-compose run --rm -T -v "$(pwd)/$SRC:/restore:ro" --entrypoint \
  pg_restore backup -h db -U pixgym -d pixgym --clean --if-exists --no-owner /restore/pixgym.dump
# Zdjęcia przez kontener API: ma wolumen zdjęć do zapisu (kopia ma go tylko do odczytu).
docker-compose run --rm -T --no-deps -v "$(pwd)/$SRC:/restore:ro" --entrypoint sh api -c \
  'find /data/photos -mindepth 1 -delete && tar -xzf /restore/photos.tar.gz -C /data/photos'
docker-compose start api
echo "Odtworzone z $SRC."
