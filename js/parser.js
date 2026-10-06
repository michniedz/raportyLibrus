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

  // Liczba przedmiotów (S). Najbardziej wiarygodna jest struktura wiersza 2
  // nagłówka: [3]=pierwszy przedmiot, potem oceny "6"…"1", potem "usp."/"nieus.".
  let S = -1;
  const uspIdx = header2.findIndex(c => /^usp\.?$/i.test(c));
  if (uspIdx > 6) {
    S = uspIdx - 9; // uspIdx = 3 + S + 6  =>  S = uspIdx - 9
  } else {
    const firstStudentRow = rows[headerIdx + 2];
    if (firstStudentRow) S = firstStudentRow.length - 13;
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
    usp: 3 + S + 6,
    nieus: 3 + S + 7,
    spozn: 3 + S + 8,
    srednia: 3 + S + 9,
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
      usp: r[idx.usp] || "0",
      nieus: r[idx.nieus] || "0",
      spozn: r[idx.spozn] || "0",
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
