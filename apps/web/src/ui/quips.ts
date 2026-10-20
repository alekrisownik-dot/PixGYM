/**
 * Docinki złego Bita (motyw czerwony): czarny humor o „natty or not”. Żarty, nie porady:
 * bez nazw środków, dawek i zachęcania; część wręcz studzi zapał.
 */
export const EVIL_QUIPS = [
  "Natty? Jasne. A ja jestem white hatem.",
  "Twój testosteron działa w trybie read-only. Mój ma uprawnienia roota.",
  "Kompilujesz mięśnie bez flagi --enhanced? Szanuję. Trochę.",
  "Fake natty to tylko źle skonfigurowany firewall.",
  "Jedyny cykl, jaki zatwierdzam, to cykl treningowy. Reszta nie przeszła code review.",
  "Kreatyna to legalny payload. Wszystko dalej łamie regulamin siłowni i wątroby.",
  "Biceps rośnie? Pewnie przez „witaminy”. Albo przez to, że w końcu śpisz.",
  "Wątroba to też serwer. Nie wrzucaj jej podejrzanych pakietów.",
  "Mięśnie z apteki są jak cudzy kod: działa, dopóki nie przyjdzie audyt.",
  "Sterydy to skrót. Ja wolę brute force: ryż, kurczak i 5×5.",
  "Komisja antydopingowa? Spokojnie, tu jedyny doping to kawa przed treningiem.",
  "Kortyzol w górę, testosteron w dół. Śpij, bo zhakuję Ci regenerację.",
  "Prawdziwy „enhanced” to ktoś, kto nie opuścił dnia nóg.",
  "Natty limit to nie bug. To feature, który jeszcze nie wszedł do produkcji.",
] as const;

/** Żart dnia: stały przez cały dzień, inny jutro. */
export function quipOfDay(offset = 0): string {
  const d = new Date();
  const day = Math.floor((d.getTime() - d.getTimezoneOffset() * 60_000) / 86_400_000);
  return EVIL_QUIPS[(day + offset) % EVIL_QUIPS.length]!;
}
