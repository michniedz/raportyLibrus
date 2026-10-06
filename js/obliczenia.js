/* ============================================================
   obliczenia.js — przeliczanie danych CSV na statystyki
   potrzebne w sprawozdaniu wychowawcy
   ============================================================ */

/** Parsuje liczbę polską ("4,50", "5.5", "-", ""). */
function parseNumber(v) {
  if (v == null) return NaN;
  const s = String(v).trim().replace(/\s/g, "").replace(",", ".");
  if (s === "" || s === "-" || s === "—") return NaN;
  const n = parseFloat(s);
  return Number.isNaN(n) ? NaN : n;
}

/** Formatuje liczbę w stylu polskim (przecinek, 2 miejsca). */
function fmtNumber(n, decimals = 2) {
  if (n == null || Number.isNaN(n)) return "";
  return n.toFixed(decimals).replace(".", ",");
}

/** Wyciąga ocenę liczbową 1–6 z wartości ("5+", "5-", "5", "1" → int). */
function gradeInt(v) {
  if (v == null) return NaN;
  const m = String(v).trim().match(/\d+/);
  if (!m) return NaN;
  const n = parseInt(m[0], 10);
  return (n >= 1 && n <= 6) ? n : NaN;
}

const ZACHOWANIE_MAP = [
  { key: "wzorowe", test: /wzor/i },
  { key: "bardzoDobre", test: /bardzo\s*dobr|bdb|bdz/i },
  { key: "dobre", test: /dobr/i },
  { key: "poprawne", test: /popraw/i },
  { key: "nieodpowiednie", test: /nieodpowied|ndp/i },
  { key: "naganne", test: /nagann|ng/i },
];

/** Klasyfikuje tekst oceny z zachowania do jednego z 6 kluczy (lub null). */
function classifyBehavior(v) {
  const s = String(v || "").trim().toLowerCase();
  if (s === "") return null;
  for (const m of ZACHOWANIE_MAP) {
    if (m.test.test(s)) return m.key;
  }
  return null;
}

/** Główna funkcja obliczająca wszystkie statystyki. */
function computeStats(model) {
  const students = model.students;
  const n = students.length;

  // --- ndst (ocena "1") per uczeń ---
  const ndstPerStudent = students.map(st => {
    // Zaufaj kolumnie "1" z raportu, jeśli podana; w razie braku policz z ocen.
    let fromCol = parseNumber(st.liczbaOcen["1"]);
    if (Number.isNaN(fromCol)) fromCol = 0;
    // Policzenie z przedmiotów (które przedmioty mają "1")
    const ndstSubjects = [];
    for (const [subj, val] of Object.entries(st.oceny)) {
      if (gradeInt(val) === 1) ndstSubjects.push(subj);
    }
    // Jeśli kolumna z liczbą ndst jest 0, ale z przedmiotów wynika inaczej — użyj przedmiotów
    const fromSubjects = ndstSubjects.length;
    const total = Math.max(fromCol, fromSubjects);
    return { st, total, ndstSubjects };
  });

  const bezNdst = ndstPerStudent.filter(x => x.total === 0).length;
  const z1Ndst = ndstPerStudent.filter(x => x.total === 1).length;
  const z2Ndst = ndstPerStudent.filter(x => x.total === 2).length;
  const z3Ndst = ndstPerStudent.filter(x => x.total >= 3).length;

  // --- liczba ocen celujących (6) i dopuszczających (2) ---
  let ocenyCelujace = 0;
  let ocenyDopuszczajace = 0;
  for (const st of students) {
    ocenyCelujace += (parseNumber(st.liczbaOcen["6"]) || 0);
    ocenyDopuszczajace += (parseNumber(st.liczbaOcen["2"]) || 0);
  }

  // --- oceny z zachowania ---
  const zachowanie = { wzorowe: 0, bardzoDobre: 0, dobre: 0, poprawne: 0, nieodpowiednie: 0, naganne: 0 };
  const wzoroweList = [];
  const naganneList = [];
  for (const st of students) {
    const key = classifyBehavior(st.zachowanie);
    if (key) {
      zachowanie[key]++;
      if (key === "wzorowe") wzoroweList.push(st.nazwiskoImie);
      if (key === "naganne") naganneList.push(st.nazwiskoImie);
    }
  }

  // --- średnie przedmiotów (najwyższa / najniższa) ---
  const subjectAverages = [];
  for (const subj of model.subjects) {
    let sum = 0, cnt = 0;
    for (const st of students) {
      const g = gradeInt(st.oceny[subj]);
      if (!Number.isNaN(g)) { sum += g; cnt++; }
    }
    if (cnt > 0) subjectAverages.push({ przedmiot: subj, srednia: sum / cnt, liczba: cnt });
  }
  subjectAverages.sort((a, b) => b.srednia - a.srednia);
  const najwyzszaSrednia = subjectAverages.length ? subjectAverages[0] : null;
  const najnizszaSrednia = subjectAverages.length ? subjectAverages[subjectAverages.length - 1] : null;

  // --- frekwencja ---
  let godzinyOpuszczone = 0;
  let godzinyNieusprawiedliwione = 0;
  let spoznienia = 0;
  for (const st of students) {
    godzinyOpuszczone += (parseNumber(st.usp) || 0) + (parseNumber(st.nieus) || 0);
    godzinyNieusprawiedliwione += (parseNumber(st.nieus) || 0);
    spoznienia += (parseNumber(st.spozn) || 0);
  }

  // --- przedmioty z >3 ocen ndst ---
  const przedmiotyPonad3Ndst = [];
  for (const subj of model.subjects) {
    let cnt = 0;
    for (const st of students) {
      if (gradeInt(st.oceny[subj]) === 1) cnt++;
    }
    if (cnt > 3) przedmiotyPonad3Ndst.push({ przedmiot: subj, liczba: cnt });
  }

  // --- uczniowie z 3+ ndst, 1–2 ndst (egzamin poprawkowy), ≥4,5, >70h, 100% frekwencja ---
  const uczniowie3PlusNdst = [];
  const uczniowieEgzaminPoprawkowy = [];
  const uczniowieSrednia45 = [];
  const uczniowie70hNieusp = [];
  const uczniowie100Frekwencja = [];

  for (const x of ndstPerStudent) {
    const st = x.st;
    if (x.total >= 3) uczniowie3PlusNdst.push({ nazwisko: st.nazwiskoImie, liczbaNdst: x.total });
    else if (x.total === 1 || x.total === 2) {
      uczniowieEgzaminPoprawkowy.push({ nazwisko: st.nazwiskoImie, przedmioty: x.ndstSubjects.slice() });
    }
  }

  for (const st of students) {
    const srednia = parseNumber(st.srednia);
    if (!Number.isNaN(srednia) && srednia >= 4.5) {
      uczniowieSrednia45.push({ nazwisko: st.nazwiskoImie, srednia });
    }
    const nieusp = parseNumber(st.nieus) || 0;
    if (nieusp > 70) {
      uczniowie70hNieusp.push({ nazwisko: st.nazwiskoImie, godziny: nieusp });
    }
    const op = (parseNumber(st.usp) || 0) + (parseNumber(st.nieus) || 0);
    if (op === 0) {
      uczniowie100Frekwencja.push(st.nazwiskoImie);
    }
  }

  uczniowieSrednia45.sort((a, b) => b.srednia - a.srednia);
  uczniowie3PlusNdst.sort((a, b) => b.liczbaNdst - a.liczbaNdst);

  return {
    liczbaUczniow: n,
    klasyfikowani: n,
    bezNdst, z1Ndst, z2Ndst, z3Ndst,
    ocenyCelujace, ocenyDopuszczajace,
    zachowanie, wzoroweList, naganneList,
    najwyzszaSrednia, najnizszaSrednia,
    godzinyOpuszczone, godzinyNieusprawiedliwione, spoznienia,
    przedmiotyPonad3Ndst,
    uczniowie3PlusNdst, uczniowieEgzaminPoprawkowy,
    uczniowieSrednia45, uczniowie70hNieusp, uczniowie100Frekwencja,
  };
}
