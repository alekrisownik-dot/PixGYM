# test-vectors

Wspólne przypadki testowe logiki siłowej. Muszą je przechodzić obie implementacje:

- Python: `apps/api/src/pixgym/domain`, test `apps/api/tests/test_domain_vectors.py`
- TypeScript: `apps/web/src/domain`, test `apps/web/src/domain/vectors.test.ts`

Format `strength.json`: `{ "<funkcja>": [{ "name", "args", "expected" }] }`.
Sekcja `rules` to parametry reguł progresji. Test Pythona pilnuje, że są identyczne z seedem.

Przy zmianie logiki: najpierw popraw lub dopisz przypadek tutaj (wynik sprawdzony ręcznie),
potem obie implementacje.
