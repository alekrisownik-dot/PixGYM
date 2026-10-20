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
docker-compose run --rm api pytest      # backend, osobna baza pixgym_test
cd apps/web && npm install && npm test  # logika siłowa w TypeScript
```

## Logika siłowa

Liczona w dwóch miejscach: w telefonie (offline, od razu po zapisaniu serii) i na serwerze
(źródło prawdy). Obie wersje przechodzą te same przypadki z `packages/test-vectors`.

- **1RM:** Epley (domyślnie), Brzycki (do 10 powt.), tabela RTS przy metodzie `rpe` i podanym RPE/RIR.
  Powyżej 12 powtórzeń (`e1rm_max_reps`) brak wyniku. Rozgrzewki się nie liczą.
- **Rekordy:** prawdziwy 1RM, szacowany 1RM, nRM dla 2/3/5/8/10/12 (największy ciężar na co
  najmniej n powtórzeń), największa seria, powtórzenia bez obciążenia. Remis nie jest rekordem.
- **Objętość:** ciężka seria to robocza z RIR ≤ 4 (bez RPE/RIR też się liczy). Mięsień główny 1,
  pomocniczy 0,5. Tonaż tylko dla mięśni głównych.
- **Talerze i rozgrzewka:** dokładne dopasowanie z dostępnych talerzy (nie zachłanne);
  rozgrzewka gryf × 10, 40/60/80%, od 100 kg dodatkowo 90% × 1.
- **Podpowiedzi ciężaru:** podwójna progresja, liniowa z deloadem, RPE, 5/3/1, nSuns, GZCLP.

### Rangi i ranking

Cztery boje rankingowe: wyciskanie leżąc, podciąganie, pompki na poręczach, uginanie
w koncentracji (`pixgym.domain.ranks.RANKED_LIFTS`, lustro w `ranks.ts`). Ranga zależy od
szacowanego 1RM względem masy ciała (dla kobiet niższe progi):

Script Kiddie → Packet Sniffer → Firewall Breaker → Exploit Dev → Black Hat →
Root Access → Zero-Day → Kernel Panic

Ranking znajomych ma dwie zakładki: kg i DOTS. Widzi go i jest w nim tylko ten, kto włączy
`user_settings.leaderboard_opt_in`. Jedynym wyjątkiem od RLS jest funkcja
`leaderboard_entries` (SECURITY DEFINER), która zwraca tylko najlepszy szacowany 1RM.
Masy ciała API nie pokazuje innym, choć da się ją w przybliżeniu wyliczyć z DOTS.

### Zdjęcia postępu

`pixgym.services.photos`: przy zapisie usuwane są wszystkie metadane (także GPS z telefonu),
zdjęcie jest obracane według EXIF, zmniejszane do 2048 px, a pliki szyfrowane AES-256-GCM
(`PIXGYM_PHOTO_KEY`, wolumen `photos`). Dostęp ma tylko właściciel. Wymaga zgody na moduł
sylwetki. **Utrata klucza oznacza utratę zdjęć**, więc klucz trzeba trzymać w backupie osobno.

Po zapisie serii serwer woła `pixgym.services.strength.refresh_exercise`, które uzupełnia
`effective_kg`, `e1rm_kg` i historię rekordów. Zapisuje tylko zmiany, więc nie podbija
`server_version` bez potrzeby.

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
  migrations/           0001 tabele, 0002 triggery i RLS, 0003 miękkie usuwanie rekordów,
                        0004 ranking i zdjęcia postępu
  src/pixgym/
    core/               konfiguracja, UUIDv7
    db/                 baza modeli, sesja z kontekstem użytkownika, upsert
    domain/             logika siłowa (bez bazy)
    models/             SQLAlchemy
    seed/               katalog ćwiczeń i szablony planów (*_data.py)
    services/           przeliczanie serii i rekordów, ranking, zdjęcia
  tests/
apps/web/src/domain/    ta sama logika w TypeScript
packages/test-vectors/  wspólne przypadki testowe
infra/postgres/initdb/  tworzy rolę pixgym_app przy pierwszym starcie bazy
```
