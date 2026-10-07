/* ============================================================
   parser.js — odczyt i parsowanie pliku CSV z Librus Synergia
   Format: eksport "Klasyfikacja" (śródroczna / roczna)
   Kodowanie: Windows-1250 (CP1250), separator: średnik
   ============================================================ */

/**
 * Dekoduje zawartość pliku (ArrayBuffer) do tekstu.
 * Preferuje Windows-1250 (taki generuje Librus), ale wykrywa UTF-8 BOM.
 */
function decodeLibrusFile(buffer) {
  const bytes = new Uint8Array(buffer);
  // UTF-8 BOM (EF BB BF)
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return new TextDecoder("utf-8").decode(buffer);
  }
  try {
    return new TextDecoder("windows-1250").decode(buffer);
  } catch (e) {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

/** Prosty parser CSV z obsługą pól w cudzysłowach i separatora średnika. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ';') {
        row.push(field); field = "";
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = "";
        rows.push(row); row = [];
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/** Pomocniczo: czy wartość jest liczbą całkowitą (nr ucznia). */
function isIntegerString(s) {
  return /^\d+$/.test(String(s).trim());
}

/**
 * Główna funkcja: parsuje surowy tekst CSV i zwraca model danych.
 */
function parseLibrusCSV(text) {
  const rows = parseCsv(text)
    .map(r => r.map(cell => cell.replace(/^\uFEFF/, "").trim()))
    .filter(r => r.some(cell => cell !== ""));

  if (rows.length === 0) {
    throw new Error("Plik jest pusty lub nie zawiera danych.");
  }

  // 1. Typ raportu (pierwsza niepusta linia)
  const type = (rows[0] && rows[0][0]) || "Klasyfikacja";

  // 2. Klasa i rok szkolny
  let klasa = "";
  let rokSzkolny = "";
  for (const r of rows) {
    const first = r[0] || "";
    if (/^Klasa/i.test(first)) klasa = first.replace(/^Klasa\s*/i, "").trim();
    if (/^Rok szkolny/i.test(first)) rokSzkolny = first.replace(/^Rok szkolny\s*/i, "").trim();
  }

  // 3. Znajdź nagłówek (linia zaczynająca się od "Nr")
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === "Nr") { headerIdx = i; break; }
  }
  if (headerIdx === -1) {
    throw new Error("Nie znaleziono nagłówka „Nr;Nazwisko i imię…”. Upewnij się, że to poprawny eksport „Klasyfikacja” z Librusa.");
  }

  const header1 = rows[headerIdx];
  const header2 = rows[headerIdx + 1];
  if (!header2 || header2.length < 14) {
    throw new Error("Nieprawidłowa struktura nagłówka (za mało kolumn).");
  }

  // Liczba przedmiotów (S). Struktura wiersza 2 nagłówka: [3]=pierwszy przedmiot,
  // potem oceny "6"…"1". Raporty śródroczne/roczne mają dodatkowo kolumny
  // frekwencji "usp."/"nieus."/"spóźn.", a końcowe ich nie mają.
  const hasAttendance = header2.some(c => /^usp\.?$|^nieus\.?$/i.test(c));
  const uspIdx = header2.findIndex(c => /^usp\.?$/i.test(c));
  let S = -1;
  if (uspIdx > 6) {
    S = uspIdx - 9; // uspIdx = 3 + S + 6  =>  S = uspIdx - 9
  } else {
    const firstStudentRow = rows[headerIdx + 2];
    if (firstStudentRow) S = firstStudentRow.length - (hasAttendance ? 13 : 10);
  }
  if (S < 1) {
    throw new Error("Nie można określić liczby przedmiotów z nagłówka.");
  }

  const subjects = header2.slice(3, 3 + S);

  const idx = {
    nr: 0,
    nazwisko: 1,
    zachowanie: 2,
    subjectsStart: 3,
    subjectsEnd: 3 + S,          // wyłączny
    gradesStart: 3 + S,          // 6,5,4,3,2,1
    grade1: 3 + S + 5,           // liczba ocen "1" (ndst)
    usp: hasAttendance ? 3 + S + 6 : null,
    nieus: hasAttendance ? 3 + S + 7 : null,
    spozn: hasAttendance ? 3 + S + 8 : null,
    srednia: 3 + S + (hasAttendance ? 9 : 6),
  };

  const students = [];
  for (let i = headerIdx + 2; i < rows.length; i++) {
    const r = rows[i];
    if (!isIntegerString(r[0])) break; // koniec listy uczniów (zaczynają się sumy)
    if (r[0] === "" || r[1] === "") continue;

    const oceny = {};
    for (let s = 0; s < S; s++) {
      const val = r[idx.subjectsStart + s] || "";
      if (val !== "") {
        oceny[subjects[s]] = val;
      }
    }

    students.push({
      nr: r[idx.nr],
      nazwiskoImie: r[idx.nazwisko],
      zachowanie: r[idx.zachowanie] || "",
      oceny,
      liczbaOcen: {
        6: r[idx.gradesStart + 0] || "0",
        5: r[idx.gradesStart + 1] || "0",
        4: r[idx.gradesStart + 2] || "0",
        3: r[idx.gradesStart + 3] || "0",
        2: r[idx.gradesStart + 4] || "0",
        1: r[idx.grade1] || "0",
      },
      usp: (idx.usp != null ? (r[idx.usp] || "0") : "0"),
      nieus: (idx.nieus != null ? (r[idx.nieus] || "0") : "0"),
      spozn: (idx.spozn != null ? (r[idx.spozn] || "0") : "0"),
      srednia: r[idx.srednia] || "",
    });
  }

  if (students.length === 0) {
    throw new Error("Nie znaleziono żadnych uczniów w pliku.");
  }

  return {
    type,
    klasa,
    rokSzkolny,
    subjects,
    students,
  };
}

/**
 * Wykrywa typ pliku tekstowego (CSV) po zawartości.
 * Zwraca "klasyfikacja", "frekwencja" lub "unknown".
 */
function detectFileType(text) {
  const head = (text || "").slice(0, 600);
  if (/^\s*Klasyfikacja\b/i.test(head)) return "klasyfikacja";
  if (/Procentowe zestawienie frekwencji|% obecno/i.test(head)) return "frekwencja";
  return "unknown";
}

/**
 * Parsuje raport „Procentowe zestawienie frekwencji” i zwraca podsumowanie klasy.
 * Kolumny wiersza RAZEM: 2=obecności, 3=nieob. uspr., 4=nieob. nieuspr.,
 * 5=nieob. razem, 6=razem godzin, 7=% obecności.
 */
function parseFrekwencjaCSV(text) {
  const rows = parseCsv(text)
    .map(r => r.map(c => c.replace(/^\uFEFF/, "").trim()))
    .filter(r => r.some(c => c !== ""));

  if (!rows.length) throw new Error("Plik frekwencji jest pusty.");

  let klasa = "";
  let rokSzkolny = "";
  let miesiac = "";
  for (const r of rows) {
    const first = (r[0] || "").trim();
    if (/^Klasa$/i.test(first)) klasa = (r[1] || "").trim();
    else if (/^Rok szkolny/i.test(first)) rokSzkolny = first.replace(/^Rok szkolny\s*/i, "").trim();
    else if (/^Miesi[iąą]c$/i.test(first)) miesiac = (r[1] || "").trim();
  }

  let razem = null;
  for (const r of rows) {
    if (/^RAZEM/i.test(r[0])) { razem = r; break; }
  }
  if (!razem) throw new Error("Brak wiersza „RAZEM” w pliku frekwencji.");

  const toInt = (v) => {
    const n = parseInt(String(v || "").replace(/\s/g, ""), 10);
    return Number.isNaN(n) ? 0 : n;
  };

  const obecnosci = toInt(razem[2]);
  const nieusprUsp = toInt(razem[3]);   // nieobecności usprawiedliwione
  const nieusprNieus = toInt(razem[4]); // nieobecności nieusprawiedliwione
  const opuszczone = razem[5] ? toInt(razem[5]) : (nieusprUsp + nieusprNieus);
  const razemGodz = razem[6] ? toInt(razem[6]) : (obecnosci + opuszczone);
  const procentObecnosci = (razem[7] || "").trim();

  return {
    klasa,
    rokSzkolny,
    miesiac,
    procentObecnosci,             // np. "92.25%"
    godzinyOpuszczone: opuszczone,           // nieobecności razem (usp. + nieusp.)
    godzinyNieusprawiedliwione: nieusprNieus, // nieobecności nieusprawiedliwione
    godzinyUsprawiedliwione: nieusprUsp,
    godzinyObowiazkowe: razemGodz,           // obecności + nieobecności (razem)
  };
}

/**
 * Przyporządkowuje sparsowane pliki frekwencji do kolumn „semestr” i „rok”.
 * Jeden plik = zestawienie semestralne. Dwa pliki = plik z większą liczbą
 * godzin obowiązkowych to cały rok szkolny.
 */
function classifyFrekwencja(files) {
  if (!files || !files.length) return { semestr: null, rok: null };

  if (files.length === 1) {
    return { semestr: files[0], rok: null };
  }

  const sorted = files.slice().sort((a, b) => b.godzinyObowiazkowe - a.godzinyObowiazkowe);
  let rok = sorted[0];
  let semestr = sorted[1];

  // Remis liczbowy — spróbuj po nazwie pliku.
  if (rok.godzinyObowiazkowe === semestr.godzinyObowiazkowe) {
    const byName = (re) => files.find(f => re.test(f.sourceName || ""));
    const rokByName = byName(/rocz|kocow|koncow|caly|calorocz/i);
    const semByName = byName(/semestr|srodrocz|r\u00f3drocz/i);
    if (rokByName && semByName) { rok = rokByName; semestr = semByName; }
  }

  return { semestr, rok };
}
