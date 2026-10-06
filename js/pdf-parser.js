/* ============================================================
   pdf-parser.js — odczyt raportu PDF z Librus Synergia
   („Statystyki - Klasyfikacja śródroczna/roczna/końcowa", format tabelaryczny)
   ============================================================ */

const ZACHOWANIE_WORDS = [
  "wzorowe", "bardzo dobre", "dobre", "poprawne", "nieodpowiednie", "naganne",
];

function pdfType(title) {
  const t = (title || "").toLowerCase();
  if (/ko\u0144cowa|kocowa/.test(t)) return "Klasyfikacja końcowa";
  if (/\u015br\u00f3droczna|srodroczna|r\u00f3droczna/.test(t)) return "Klasyfikacja śródroczna";
  if (/roczna/.test(t)) return "Klasyfikacja roczna";
  return title || "Klasyfikacja";
}

function isZachowanieWord(s) {
  return ZACHOWANIE_WORDS.includes(s.trim().toLowerCase());
}

async function parseLibrusPdf(data, pdfjsLib) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const doc = await pdfjsLib.getDocument({ data: bytes, useSystemFonts: true }).promise;

  // 1. Wyciągnij pozycje tekstu (transformacja viewport, offset strony, deduplikacja)
  const all = [];
  const seen = new Set();
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const yOff = (p - 1) * vp.height;
    for (const it of tc.items) {
      if (!it.str) continue;
      const t = pdfjsLib.Util.transform(vp.transform, it.transform);
      const x = Math.round(t[4]), y = Math.round(t[5]) + Math.round(yOff);
      const k = x + "|" + y + "|" + it.str;
      if (seen.has(k)) continue;
      seen.add(k);
      all.push({ x, y, s: it.str, page: p });
    }
  }
  await doc.destroy();

  // 2. Metadane
  function metaValue(label) {
    const li = all.find(i => i.s === label);
    if (!li) return "";
    return all
      .filter(i => Math.abs(i.y - li.y) <= 2 && i.x > li.x && i.x < 158 && i.s.trim())
      .sort((a, b) => a.x - b.x)
      .map(i => i.s)
      .join("");
  }
  let title = "";
  {
    const ti = all.find(i => /^Statystyki - Klasyfikacja/i.test(i.s));
    if (ti) {
      title = all
        .filter(i => Math.abs(i.y - ti.y) <= 2 && i.x < 300)
        .sort((a, b) => a.x - b.x)
        .map(i => i.s)
        .join("").trim();
    }
  }
  const klasa = metaValue("Klasa:");
  const rokSzkolny = metaValue("Rok szkolny:");
  const wychowawca = metaValue("Wychowawca:");

  // 3. Klasteryzacja wierszy (wszystkie elementy, tolerancja 1)
  const allSorted = all.slice().sort((a, b) => a.y - b.y);
  const rows = [];
  for (const it of allSorted) {
    let r = rows.find(rr => Math.abs(rr.y - it.y) <= 1);
    if (!r) { r = { y: it.y, items: [] }; rows.push(r); }
    r.items.push(it);
  }
  rows.sort((a, b) => a.y - b.y);
  for (const r of rows) r.items.sort((a, b) => a.x - b.x);

  const rowText = (r) => r.items.map(i => i.s).join("");

  // 4. Legenda przedmiotów (wiersze "id - nazwa", na końcu dokumentu)
  const subjectMap = {};
  for (const r of rows) {
    const txt = rowText(r);
    const m = txt.match(/^(\d+)\s*[-–—]\s*(.+)$/);
    if (m) {
      const id = m[1];
      const name = m[2].trim();
      if (name && !subjectMap[id]) subjectMap[id] = name;
    }
  }

  // 5. Wiersz nagłówka z ID przedmiotów (usp./nieus.)
  let headerRow = null;
  for (const r of rows) {
    const hasUsp = r.items.some(i => /^usp\.?$/i.test(i.s));
    const hasNieus = r.items.some(i => /^nieus\.?$/i.test(i.s));
    if (hasUsp && hasNieus) { headerRow = r; break; }
  }
  if (!headerRow) {
    throw new Error("Nie rozpoznano tabeli „Klasyfikacja” (brak kolumn usp./nieus.). Ten PDF to prawdopodobnie raport „Statystyki” — użyj raportu „Klasyfikacja” lub eksportu CSV.");
  }

  const hdrTokens = headerRow.items.filter(i => i.s.trim() !== "");
  const uspIdx = hdrTokens.findIndex(i => /^usp\.?$/i.test(i.s));
  if (uspIdx < 6) {
    throw new Error("Nie udało się rozpoznać kolumn ocen w nagłówku PDF.");
  }
  const subjectIds = hdrTokens.slice(0, uspIdx - 6).map(i => i.s).filter(s => /^\d+$/.test(s));
  const subjectCount = subjectIds.length;
  if (subjectCount === 0) {
    throw new Error("Nie wykryto kolumn przedmiotów w nagłówku PDF.");
  }
  const subjects = subjectIds.map(id => subjectMap[id] || ("Przedmiot " + id));

  const colX = {
    subjects: hdrTokens.slice(0, uspIdx - 6).map(i => i.x),
    grades: hdrTokens.slice(uspIdx - 6, uspIdx).map(i => i.x),
    usp: hdrTokens[uspIdx].x,
    nieus: hdrTokens[uspIdx + 1].x,
  };

  // 6. Parsowanie uczniów
  const students = [];
  let pendingSurname = "";
  let expectingGiven = false;

  function isHeaderRow(r) {
    const txt = rowText(r);
    return /Nazwy zaj|Zachowanie|usp\.|nieus\./.test(txt);
  }
  function nameFrag(items, maxX) {
    const frags = items.filter(i => i.x < maxX && i.s.trim() !== "" && !/^\d/.test(i.s) && !i.s.includes(":"));
    return frags.sort((a, b) => a.x - b.x).map(i => i.s).join("").trim();
  }

  for (const r of rows) {
    const txt = rowText(r);
    if (r.y < headerRow.y) continue; // tytuł/metadane/nagłówek (strona 1)
    if (isHeaderRow(r)) continue;    // powtórzony nagłówek (kolejne strony)
    // koniec listy uczniów = wiersz podsumowania (po pominięciu nagłówków)
    if (/Liczby ocen|celuj|nieklasyfik|dopuszczaj/.test(txt)) break;

    const items = r.items;
    const beh = items.find(i => i.x >= 70 && i.x < 200 && isZachowanieWord(i.s));
    const numeric = items.filter(i => i.x > 150 && /[\d,\.]/.test(i.s) && i.s.trim() !== "");

    if (beh && numeric.length > 0) {
      // imię i nazwisko: albo w tym samym wierszu (nowsze PDF), albo w wierszu powyżej
      const nameOnRow = nameFrag(items, beh.x);
      let fullName;
      if (nameOnRow) {
        fullName = nameOnRow;
        expectingGiven = false;
      } else {
        fullName = pendingSurname;
        expectingGiven = true;
      }
      pendingSurname = "";

      const pick = (cx) => {
        let best = null, bestD = 1e9;
        for (const it of numeric) {
          const d = Math.abs(it.x - cx);
          if (d < bestD) { bestD = d; best = it; }
        }
        return bestD < 12 ? best : null;
      };

      const oceny = {};
      for (let s = 0; s < subjectCount; s++) {
        const it = pick(colX.subjects[s]);
        if (it) oceny[subjects[s]] = it.s;
      }
      const liczbaOcen = { "6": "0", "5": "0", "4": "0", "3": "0", "2": "0", "1": "0" };
      const gradeLabels = ["6", "5", "4", "3", "2", "1"];
      for (let g = 0; g < 6; g++) {
        const it = pick(colX.grades[g]);
        if (it) liczbaOcen[gradeLabels[g]] = it.s;
      }
      const usp = pick(colX.usp);
      const nieus = pick(colX.nieus);

      const right = numeric.filter(i => i.x > colX.nieus + 15).sort((a, b) => a.x - b.x);
      const srednia = right.length ? right[right.length - 1].s : "";
      const spozn = right.length > 1 ? right[right.length - 2].s : "0";

      students.push({
        nr: String(students.length + 1),
        nazwiskoImie: fullName,
        zachowanie: beh.s.trim(),
        oceny,
        liczbaOcen,
        usp: usp ? usp.s : "0",
        nieus: nieus ? nieus.s : "0",
        spozn,
        srednia,
      });
    } else {
      const nf = nameFrag(items, 150);
      if (nf) {
        if (expectingGiven && students.length) {
          students[students.length - 1].nazwiskoImie += " " + nf;
          expectingGiven = false;
        } else {
          pendingSurname = nf;
        }
      }
    }
  }

  if (students.length === 0) {
    throw new Error("Nie znaleziono uczniów w pliku PDF.");
  }

  return {
    type: pdfType(title),
    klasa,
    rokSzkolny,
    wychowawca,
    subjects,
    students,
  };
}
