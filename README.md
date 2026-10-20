# PixGYM

PWA do zapisywania treningów siłowych, liczenia 1RM i śledzenia postępów.
Specyfikacja: https://claude.ai/artifact/KfsaiKYBw9dFjWm7SG8c1J

## Uruchomienie

```bash
cp .env.example .env          # hasła: openssl rand -hex 24
docker-compose up -d          # Postgres 17, Redis 7, API
curl http://127.0.0.1:8000/api/v1/health
```

Przy starcie API wykonuje migracje (`alembic upgrade head`) i seed
(150 ćwiczeń, 8 reguł progresji, 6 szablonów planów). Seed można puszczać wielokrotnie.

## Testy

```bash
docker-compose run --rm api pytest
```

Testy tworzą osobną bazę `pixgym_test` na tym samym Postgresie.

## Baza danych

- **Dwie role.** `pixgym` jest właścicielem schematu (migracje, seed). API łączy się jako
  `pixgym_app`, która nie jest właścicielem tabel, więc obowiązuje ją Row-Level Security.
- **RLS.** Każda transakcja API zaczyna się od `set_config('app.user_id', ...)`
  (`pixgym.db.session.user_session`). Bez tego żadne dane użytkowników nie są widoczne.
  Ćwiczenia, reguły i plany z `owner_user_id = NULL` są wbudowane: wszyscy je czytają, nikt nie zmienia.
- **Złożone klucze obce.** `session_exercises` i `sets` mają zdenormalizowane `user_id`
  oraz klucz `(rodzic_id, user_id)`, więc nie da się podpiąć serii pod cudzy trening.
- **Synchronizacja.** ID nadaje klient (UUIDv7). Trigger `pixgym_touch` ustawia
  `server_version` z globalnej sekwencji i `updated_at` przy każdej zmianie. Usuwanie jest miękkie (`deleted_at`).

Nowa migracja po zmianie modeli:

```bash
docker-compose run --rm api alembic revision --autogenerate -m "opis"
```

## Struktura

```
apps/api/
  migrations/           0001 tabele, 0002 triggery, uprawnienia, RLS
  src/pixgym/
    core/               konfiguracja, UUIDv7
    db/                 baza modeli, sesja z kontekstem użytkownika
    models/             SQLAlchemy
    seed/               katalog ćwiczeń i szablony planów (*_data.py)
  tests/
infra/postgres/initdb/  tworzy rolę pixgym_app przy pierwszym starcie bazy
```
