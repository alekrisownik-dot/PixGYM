<div align="center">

<img src="docs/bit/bit-flex.svg" width="160" alt="Bit, maskotka PixGYM, napina biceps">

# PixGYM

**Dziennik treningu siłowego w stylu terminala.**
Zapisujesz serie, Bit liczy 1RM, pilnuje rekordów i awansuje Cię od *Script Kiddie* do *Kernel Panic*.

![PWA](https://img.shields.io/badge/PWA-offline--first-5cf2a0?style=flat-square&labelColor=06140d)
![React](https://img.shields.io/badge/React_19-TypeScript-5cf2a0?style=flat-square&labelColor=06140d&logo=react&logoColor=5cf2a0)
![FastAPI](https://img.shields.io/badge/FastAPI-Python-5cf2a0?style=flat-square&labelColor=06140d&logo=fastapi&logoColor=5cf2a0)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL_17-RLS-5cf2a0?style=flat-square&labelColor=06140d&logo=postgresql&logoColor=5cf2a0)
![Docker](https://img.shields.io/badge/Docker-Compose-5cf2a0?style=flat-square&labelColor=06140d&logo=docker&logoColor=5cf2a0)

</div>

---

## Co potrafi

| | |
|---|---|
| 🏋️ **Trening** | serie, ciężar, RPE/RIR, przerwy z minutnikiem, podsumowanie po treningu |
| 📈 **1RM i rekordy** | Epley, Brzycki, tabela RTS; rekordy 1RM, nRM, największa seria |
| 🗓️ **Plany** | 6 gotowych szablonów, własny edytor, plan na stałe dni albo „po kolei” |
| 🎯 **Podpowiedź ciężaru** | podwójna progresja, liniowa z deloadem, RPE, 5/3/1, nSuns, GZCLP |
| 🧠 **Mapa mięśni** | objętość tygodniowa na każdą partię |
| 🏆 **Rangi i odznaki** | 8 rang, 12 odznak, ranking znajomych w kg i DOTS |
| 📸 **Sylwetka** | zdjęcia postępu szyfrowane AES-256, bez metadanych i GPS |
| 🔔 **Powiadomienia** | przypomnienia dzień wcześniej, Bit pyta, czy idziesz na trening |
| 📴 **Offline** | działa w piwnicy siłowni, synchronizuje się, gdy wróci zasięg |
| 🔴 **Red Team** | czerwony motyw ze złym Bitem |

## Poznaj Bita

Bit to piksel-artowy robot z głową-monitorem. Cieszy się z rekordów, śpi w dni wolne
i nosi koronę, gdy na nią zasłużysz.

<div align="center">

| idle | flex | lift | sleep |
|:---:|:---:|:---:|:---:|
| <img src="docs/bit/bit-idle.svg" width="90" alt="Bit spokojny"> | <img src="docs/bit/bit-flex.svg" width="90" alt="Bit napina biceps"> | <img src="docs/bit/bit-lift.svg" width="90" alt="Bit podnosi sztangę"> | <img src="docs/bit/bit-sleep.svg" width="90" alt="Bit śpi"> |

| zły Bit | zły flex | korona i łańcuch | słuchawki |
|:---:|:---:|:---:|:---:|
| <img src="docs/bit/bit-evil.svg" width="90" alt="Zły Bit z rogami"> | <img src="docs/bit/bit-evil-flex.svg" width="90" alt="Zły Bit napina biceps"> | <img src="docs/bit/bit-gear-crown-shades-chain.svg" width="90" alt="Bit w koronie, okularach i łańcuchu"> | <img src="docs/bit/bit-gear-headphones.svg" width="90" alt="Bit w słuchawkach"> |

</div>

Chcesz Bita we własnym projekcie? Komponent React, CSS i gotowe SVG są w [`docs/bit/`](docs/bit/BIT.md).

## Rangi

Ranga zależy od szacowanego 1RM względem masy ciała w czterech bojach: wyciskanie leżąc,
podciąganie, pompki na poręczach, uginanie w koncentracji.

```
Script Kiddie → Packet Sniffer → Firewall Breaker → Exploit Dev
             → Black Hat → Root Access → Zero-Day → Kernel Panic
```

<details>
<summary><b>Odznaki</b></summary>

| Odznaka | Za co |
|---|---|
| First Blood | pierwszy trening |
| Buffer Overflow | pierwszy pobity rekord |
| Exploit Chain | 5 serii z nowym rekordem na jednym treningu |
| Brute Force | 100 ciężkich serii w miesiącu |
| DDoS | 20 ton w tygodniu |
| Uptime 30d / 180d | treningi bez przerwy dłuższej niż tydzień |
| Privilege Escalation | pierwszy awans rangi |
| sudo su | Root Access w dowolnym boju |
| Full Stack | Exploit Dev we wszystkich bojach rankingowych |
| Snapshot | pierwsze zdjęcie postępu |
| git diff | zdjęcia w tej samej pozie w odstępie 12 tygodni |

Odznaki liczone są na żądanie, więc usunięcie treningu może odebrać odznakę.
Historia awansów zapamiętuje, kiedy pierwszy raz zdobyto każdą rangę.

</details>

## Uruchomienie

PixGYM jest pomyślany jako aplikacja dla siebie i kilku znajomych, hostowana na własnym komputerze.
Konta zakłada się tylko z kodu zaproszenia.

```bash
cp .env.example .env                       # uzupełnij hasła i klucze (instrukcje w pliku)
cd apps/web && npm install && npm run build && cd ../..
docker-compose up -d                       # Postgres 17, Redis 7, API + front
curl http://127.0.0.1:8000/api/v1/health
```

Pierwsze konto (administrator), hasło wpisuje się z klawiatury:

```bash
docker-compose exec api python -m pixgym.admin create-admin TWOJ@EMAIL Imię
```

Przy starcie API wykonuje migracje i seed (150 ćwiczeń, 8 reguł progresji, 6 szablonów planów).

<details>
<summary><b>Telefon przez Tailscale (HTTPS)</b></summary>

API słucha tylko na `127.0.0.1:8000`. Do telefonu wystawia je `tailscale serve` z certyfikatem
`*.ts.net` (PWA wymaga HTTPS). Raz: w panelu Tailscale (DNS) włącz MagicDNS i HTTPS Certificates.

```bash
sudo tailscale serve --bg 8000     # https://<komputer>.<tailnet>.ts.net
tailscale serve status
```

Znajomi muszą być w tej samej sieci Tailscale (albo dostać udostępnione urządzenie).

</details>

<details>
<summary><b>Znajomi, hasła, powiadomienia</b></summary>

- Kod zaproszenia: w aplikacji „Ja” → „Nowy kod” albo `python -m pixgym.admin invite TWOJ@EMAIL`.
- Reset hasła: `python -m pixgym.admin set-password EMAIL`.
- Powiadomienia wymagają HTTPS i klucza `PIXGYM_VAPID_PRIVATE_KEY` w `.env`
  (`docker-compose run --rm api python -m pixgym.services.push`). Włącza się je na telefonie:
  „Ja” → „Ustawienia” → „Powiadomienia”.

</details>

<details>
<summary><b>Kopia zapasowa</b></summary>

Kontener `backup` raz na dobę zapisuje do `backups/RRRR-MM-DD/` zrzut bazy (`pixgym.dump`)
i zaszyfrowane zdjęcia (`photos.tar.gz`); trzyma 14 dni (`BACKUP_KEEP_DAYS`). Stan widać
w aplikacji: „Ja” → „Ustawienia” → „Kopia zapasowa” (admin).

```bash
docker-compose run --rm backup now              # kopia od razu (np. przed aktualizacją)
sh infra/backup/restore.sh backups/2026-10-21   # odtworzenie (nadpisuje bazę i zdjęcia)
```

Kopia leży na tym samym dysku, więc folder `backups/` warto kopiować dalej. Zdjęcia są
zaszyfrowane kluczem `PIXGYM_PHOTO_KEY`, a `.env` nie trafia do kopii: trzymaj go osobno
(np. w menedżerze haseł). **Utrata klucza oznacza utratę zdjęć.**

</details>

## Pod maską

```
apps/api/               FastAPI, SQLAlchemy, Alembic
  src/pixgym/domain/    logika siłowa (czyste funkcje, bez bazy)
  src/pixgym/services/  rekordy, ranking, odznaki, zdjęcia, push
apps/web/               React 19 + Vite + Tailwind, PWA z IndexedDB i kolejką offline
packages/test-vectors/  wspólne przypadki testowe dla Pythona i TypeScriptu
infra/                  rola bazy, skrypty kopii zapasowej
docs/bit/               maskotka do wzięcia
```

<details>
<summary><b>Logika siłowa</b></summary>

Liczona w dwóch miejscach: w telefonie (offline, od razu po zapisaniu serii) i na serwerze
(źródło prawdy). Obie wersje przechodzą te same przypadki z `packages/test-vectors`.

- **1RM:** Epley (domyślnie), Brzycki (do 10 powt.), tabela RTS przy podanym RPE/RIR.
  Powyżej 12 powtórzeń brak wyniku. Rozgrzewki się nie liczą.
- **Rekordy:** prawdziwy 1RM, szacowany 1RM, nRM dla 2/3/5/8/10/12, największa seria,
  powtórzenia bez obciążenia. Remis nie jest rekordem.
- **Objętość:** ciężka seria to robocza z RIR ≤ 4. Mięsień główny 1, pomocniczy 0,5.
- **Talerze i rozgrzewka:** dokładne dopasowanie z dostępnych talerzy (nie zachłanne);
  rozgrzewka gryf × 10, 40/60/80%, od 100 kg dodatkowo 90% × 1.

</details>

<details>
<summary><b>Baza danych i prywatność</b></summary>

- **Row-Level Security.** API łączy się jako `pixgym_app`, która nie jest właścicielem tabel.
  Każda transakcja zaczyna się od `set_config('app.user_id', ...)`, bez tego żadne dane
  użytkowników nie są widoczne.
- **Złożone klucze obce.** Nie da się podpiąć serii pod cudzy trening.
- **Synchronizacja.** ID nadaje klient (UUIDv7), serwer jest idempotentny, usuwanie miękkie.
- **Ranking.** Jedynym wyjątkiem od RLS jest `leaderboard_entries` (SECURITY DEFINER), który
  zwraca tylko najlepszy szacowany 1RM. Z rankingu można się ukryć.
- **Zdjęcia.** Usuwane metadane (także GPS), zmniejszane do 2048 px, szyfrowane AES-256-GCM.
  Dostęp ma tylko właściciel.
- **Logowanie.** argon2, JWT w ciasteczku HttpOnly, rotowany refresh token z wykrywaniem
  ponownego użycia, CSRF double-submit, limit prób logowania.

</details>

## Testy

```bash
docker-compose run --rm api pytest      # backend, osobna baza pixgym_test
cd apps/web && npm install && npm test  # logika siłowa w TypeScript
```

Praca nad frontem: `cd apps/web && npm run dev` (http://localhost:5173, `/api` idzie do Dockera).

<div align="center">
<br>
<img src="docs/bit/bit-sleep.svg" width="72" alt="Bit śpi">
<br>
<sub>Bit idzie spać. Ty idź na trening.</sub>
</div>
