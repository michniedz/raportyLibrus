# Generator sprawozdania wychowawcy (Librus Synergia)

Aplikacja webowa, która z raportu **„Klasyfikacja"** z Librus Synergia (plik **CSV** lub **PDF**) tworzy gotowe **sprawozdanie wychowawcy klasy** w formacie Microsoft Word (`.docx`).

Całość działa **w 100% w przeglądarce** — żadne dane nie są wysyłane na serwer. Aplikacja to zwykła strona statyczna, więc można ją wrzucić na dowolny hosting (home.pl, Cloudflare Pages, GitHub Pages itp.).

---

## Co robi aplikacja

1. Wgrywasz plik CSV (eksport „Klasyfikacja śródroczna / roczna" z Librusa) **albo** zapisany PDF tego raportu.
2. Aplikacja rozpoznaje klasę, rok szkolny, przedmioty i wszystkich uczniów.
3. Automatycznie liczy:
   - liczbę uczniów klasyfikowanych,
   - oceny z zachowania (wzorowe / bardzo dobre / dobre / poprawne / nieodpowiednie / naganne),
   - uczniów bez ocen ndst, z 1 / 2 / 3+ ocen ndst,
   - liczbę ocen celujących i dopuszczających,
   - godziny opuszczone, nieusprawiedliwione i spóźnienia,
   - uczniów ze średnią ≥ 4,5, z oceną wzorową / naganną, ze 100% frekwencją,
   - uczniów z 1–2 ocen ndst (egzamin poprawkowy) i listę przedmiotów.
4. Uzupełniasz ręcznie tylko to, czego nie ma w raporcie (wychowawca, uzasadnienia, przyczyny itd.).
5. Klikasz **„Pobierz sprawozdanie (.docx)"** i dostajesz gotowy dokument Word.

---

## Struktura plików

```
index.html          — interfejs
style.css           — wygląd
js/parser.js        — parsowanie CSV (Windows-1250)
js/pdf-parser.js    — parsowanie PDF (pdf.js)
js/obliczenia.js    — obliczanie statystyk
js/generator.js     — budowanie dokumentu .docx (biblioteka docx)
js/app.js           — obsługa UI
```

Zależności ładowane z CDN (nie trzeba nic instalować):
- `docx` — generowanie pliku Word,
- `pdfjs-dist` — odczyt PDF.

---

## Jak uruchomić lokalnie

Wystarczy otworzyć `index.html` w przeglądarce (podwójne kliknięcie). Nie potrzeba serwera ani instalacji.

> Jeśli przeglądarka blokuje odczyt plików lokalnych, możesz odpalić prosty serwer, np.:
> `npx serve .` albo `python -m http.server`, i otworzyć `http://localhost:8000`.

---

## Jak wdrożyć

### GitHub Pages (rekomendowane, darmowe)
1. Utwórz repozytorium na GitHubie (np. `raportyLibrus`).
2. Wgraj zawartość tego katalogu (`index.html`, `style.css`, `js/`) do głównego katalogu repozytorium.
3. W repozytorium: **Settings → Pages → Source: `Deploy from a branch` → Branch: `main` / `/(root)`** → **Save**.
4. Po chwili strona będzie dostępna pod adresem `https://<twoja-nazwa>.github.io/raportyLibrus/`.

### Cloudflare Pages (darmowe)
1. Wejdź na https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → **Upload assets**.
2. Przeciągnij cały katalog projektu (plik `index.html`, `style.css` i folder `js`).
3. Kliknij **Deploy**. Gotowe — masz publiczny adres HTTPS.

### home.pl (zwykły hosting)
1. Zaloguj się do panelu i otwórz **Menedżer plików** (albo połącz się przez FTP).
2. Wgraj zawartość katalogu do `public_html` (lub podkatalogu `raporty`).
3. Otwórz adres swojej domeny w przeglądarce.

Nic więcej nie trzeba konfigurować — to są statyczne pliki, bez PHP i bazy danych.

---

## CSV czy PDF?

- **CSV (zalecane)** — najpewniejsze źródło. W Librusie raport „Klasyfikacja" ma przycisk eksportu do CSV.
- **PDF** — obsługiwany jako alternatywa (plik „Statystyki - Klasyfikacja śródroczna/roczna", format tabelaryczny). Parsowanie PDF jest bardziej podatne na błędy (Librus generuje je z obróconym tekstem i rozbitymi znakami), więc przy nietypowym układzie lepiej użyć CSV.

**Uwaga:** raporty „Statystyki - Klasyfikacja końcowa/roczna" (układ „Przedmioty wg liczby porządkowej") **nie zawierają** ocen z zachowania ani frekwencji — aplikacja ich nie przyjmie i pokaże komunikat, żeby użyć raportu „Klasyfikacja".

---

## Prywatność

Dane uczniów nigdy nie opuszczają przeglądarki. Nie ma backendu, bazy danych ani zapisu na serwerze.
