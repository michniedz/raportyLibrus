/* ============================================================
   generator.js — budowanie dokumentu .docx (biblioteka `docx`)
   ============================================================ */

const BORDER = { style: docx.BorderStyle.SINGLE, size: 4, color: "000000" };
const NO_BORDER = { style: docx.BorderStyle.NONE, size: 0, color: "auto" };
const CENTER = docx.AlignmentType.CENTER;
const LEFT = docx.AlignmentType.LEFT;
const JUSTIFY = docx.AlignmentType.JUSTIFIED;

/** Akapit. text może być stringiem lub tablicą TextRun. */
function P(text, o = {}) {
  const runs = [];
  if (Array.isArray(text)) {
    runs.push(...text);
  } else if (text != null && text !== "") {
    runs.push(new docx.TextRun({
      text: String(text),
      bold: !!o.bold,
      italics: !!o.italics,
      ...(o.size ? { size: o.size } : {}),
      ...(o.underline ? { underline: {} } : {}),
    }));
  }
  return new docx.Paragraph({
    children: runs,
    ...(o.alignment ? { alignment: o.alignment } : {}),
    ...(o.spacing ? { spacing: o.spacing } : {}),
  });
}

/** Pozioma linia (do pól "----"). */
function hr() {
  return new docx.Paragraph({
    children: [],
    border: { bottom: { style: docx.BorderStyle.SINGLE, size: 6, color: "000000" } },
    spacing: { before: 40, after: 120 },
  });
}

/** Nagłówek sekcji ("6. Wyniki nauczania…"). */
function heading(text) {
  return new docx.Paragraph({
    children: [new docx.TextRun({ text, bold: true })],
    spacing: { before: 200, after: 80 },
  });
}

/** Komórka tabeli. */
function cell(content, o = {}) {
  const children = (Array.isArray(content) ? content : [content]).map(c =>
    typeof c === "string" ? P(c, { alignment: o.align || LEFT, bold: o.bold, italics: o.italics }) : c
  );
  return new docx.TableCell({
    children,
    borders: o.noBorder
      ? { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER }
      : { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
    ...(o.width ? { width: { size: o.width, type: docx.WidthType.PERCENTAGE } } : {}),
    ...(o.columnSpan ? { columnSpan: o.columnSpan } : {}),
    ...(o.shading ? { shading: { fill: o.shading, type: docx.ShadingType.CLEAR } } : {}),
    ...(o.valign ? { verticalAlign: o.valign } : {}),
  });
}

function row(cells) {
  return new docx.TableRow({ children: cells });
}

function table(rows) {
  return new docx.Table({
    width: { size: 100, type: docx.WidthType.PERCENTAGE },
    rows,
  });
}

/** Zamienia tekst wieloliniowy z kolumnami ";" na wiersze tabeli. */
function rowsFromText(text, cols, opts = {}) {
  const lines = String(text || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  return lines.map(line => {
    const parts = line.split(";").map(s => s.trim());
    const arr = new Array(cols).fill("");
    for (let i = 0; i < cols && i < parts.length; i++) arr[i] = parts[i];
    return arr;
  });
}

/** Łączy listę nazwisk w jeden akapit (pusty → "—"). */
function namesParagraph(list) {
  return P(list.length ? list.join(", ") : "—");
}

/** Czy typ raportu to klasyfikacja roczna/końcowa (a nie śródroczna). */
function isAnnualType(type) {
  const t = (type || "").toLowerCase();
  if (t.includes("śródroczna") || t.includes("srodroczna") || t.includes("ródroczna")) return false;
  return t.includes("roczna") || t.includes("końcowa") || t.includes("kocowa");
}

/**
 * Główna funkcja: generuje dokument Word na podstawie modelu, statystyk i formularza.
 */
function generujDocx(model, stats, form, hasRok) {
  const semestr = form.semestr === "I" ? "I" : "II";
  const rok = model.rokSzkolny || "…";
  const isAnnual = isAnnualType(model.type);
  const title = isAnnual
    ? `Sprawozdanie wychowawcy klasy za rok szkolny ${rok}`
    : `Sprawozdanie wychowawcy klasy za semestr ${semestr} roku szkolnego ${rok}`;
  const children = [];

  // ---- Tytuł ----
  children.push(P(title, { bold: true, alignment: CENTER, size: 26, spacing: { after: 120 } }));
  children.push(P(`Klasa: ${model.klasa || "…"}    Wychowawca: ${form.wychowawca || "…"}`, { bold: true, alignment: CENTER, spacing: { after: 200 } }));

  // ---- Pkt 4 i 5 ----
  // Data „stanu klasy” to zawsze 1.X (1 października) roku rozpoczęcia roku szkolnego.
  const startYear = (model.rokSzkolny || "").split(/[/\-–]/)[0].trim();
  const stanData = `1.X.${startYear || "…"}`;
  children.push(P(
    `4. Stan klasy na ${stanData}: ${form.stanLiczba || "…"}     5. Stan uczniów w dniu klasyfikacji: ${stats.klasyfikowani}`,
    { spacing: { after: 120 } }
  ));

  // ---- Pkt 6 ----
  children.push(heading("6. Wyniki nauczania i zachowania:"));
  const z = stats.zachowanie;
  children.push(table([
    row([
      cell("Liczba uczniów", { bold: true, width: 25, columnSpan: 2, align: CENTER, shading: "EEEEEE" }),
      cell("Liczba ocen z zachowania", { bold: true, width: 25, columnSpan: 2, align: CENTER, shading: "EEEEEE" }),
    ]),
    row([cell("klasyfikowanych", { width: 25 }), cell(String(stats.klasyfikowani), { width: 12, align: CENTER }), cell("wzorowych", { width: 25 }), cell(String(z.wzorowe), { width: 12, align: CENTER })]),
    row([cell("bez ocen ndst", { width: 25 }), cell(String(stats.bezNdst), { width: 12, align: CENTER }), cell("bardzo dobrych", { width: 25 }), cell(String(z.bardzoDobre), { width: 12, align: CENTER })]),
    row([cell("z 1 ndst", { width: 25 }), cell(String(stats.z1Ndst), { width: 12, align: CENTER }), cell("dobrych", { width: 25 }), cell(String(z.dobre), { width: 12, align: CENTER })]),
    row([cell("z 2 ndst", { width: 25 }), cell(String(stats.z2Ndst), { width: 12, align: CENTER }), cell("poprawnych", { width: 25 }), cell(String(z.poprawne), { width: 12, align: CENTER })]),
    row([cell("z 3 ndst i więcej", { width: 25 }), cell(String(stats.z3Ndst), { width: 12, align: CENTER }), cell("nieodpowiednich", { width: 25 }), cell(String(z.nieodpowiednie), { width: 12, align: CENTER })]),
    row([cell("liczba ocen celujących w klasie", { width: 25 }), cell(String(stats.ocenyCelujace), { width: 12, align: CENTER }), cell("nagannych", { width: 25 }), cell(String(z.naganne), { width: 12, align: CENTER })]),
    row([cell("liczba ocen dopuszczających w klasie", { width: 25 }), cell(String(stats.ocenyDopuszczajace), { width: 12, align: CENTER }), cell("", { width: 25 }), cell("", { width: 12 })]),
  ]));

  // ---- Pkt 7 ----
  children.push(heading("7. Najwyższa / najniższa średnia:"));
  const hi = stats.najwyzszaSrednia ? `${fmtNumber(stats.najwyzszaSrednia.srednia)} z przedmiotu: ${stats.najwyzszaSrednia.przedmiot}` : "—";
  const lo = stats.najnizszaSrednia ? `${fmtNumber(stats.najnizszaSrednia.srednia)} z przedmiotu: ${stats.najnizszaSrednia.przedmiot}` : "—";
  children.push(P(`Najwyższa średnia:  ${hi}`));
  children.push(P(`Najniższa średnia:  ${lo}`, { spacing: { after: 120 } }));

  // ---- Pkt 8 ----
  children.push(heading("8. Frekwencja:"));
  {
    const semColLabel = isAnnual ? "I semestr" : `Semestr ${semestr}`;
    const semProc = form.frekwProcentSem || "";
    const semOp   = form.frekwOpSem || "";
    const semNsp  = form.frekwNieuspSem || "";
    const semSpz  = form.frekwSpozSem || "";

    if (hasRok) {
      const rokProc = form.frekwProcentRok || "";
      const rokOp   = form.frekwOpRok || "";
      const rokNsp  = form.frekwNieuspRok || "";
      const rokSpz  = form.frekwSpozRok || "";
      children.push(table([
        row([
          cell("", { width: 40, shading: "EEEEEE" }),
          cell(semColLabel, { width: 30, align: CENTER, bold: true, shading: "EEEEEE" }),
          cell("rok szkolny", { width: 30, align: CENTER, bold: true, shading: "EEEEEE" }),
        ]),
        row([cell("Stan frekwencji w %", { width: 40 }), cell(semProc || "—", { width: 30, align: CENTER }), cell(rokProc || "—", { width: 30, align: CENTER })]),
        row([cell("Liczba godzin opuszczonych", { width: 40 }), cell(semOp || "—", { width: 30, align: CENTER }), cell(rokOp || "—", { width: 30, align: CENTER })]),
        row([cell("Liczba godzin nieusprawiedliwionych", { width: 40 }), cell(semNsp || "—", { width: 30, align: CENTER }), cell(rokNsp || "—", { width: 30, align: CENTER })]),
        row([cell("Liczba spóźnień w klasie", { width: 40 }), cell(semSpz || "—", { width: 30, align: CENTER }), cell(rokSpz || "—", { width: 30, align: CENTER })]),
      ]));
    } else {
      children.push(table([
        row([
          cell("", { width: 40, shading: "EEEEEE" }),
          cell(semColLabel, { width: 60, align: CENTER, bold: true, shading: "EEEEEE" }),
        ]),
        row([cell("Stan frekwencji w %", { width: 40 }), cell(semProc || "—", { width: 60, align: CENTER })]),
        row([cell("Liczba godzin opuszczonych", { width: 40 }), cell(semOp || "—", { width: 60, align: CENTER })]),
        row([cell("Liczba godzin nieusprawiedliwionych", { width: 40 }), cell(semNsp || "—", { width: 60, align: CENTER })]),
        row([cell("Liczba spóźnień w klasie", { width: 40 }), cell(semSpz || "—", { width: 60, align: CENTER })]),
      ]));
    }
  }

  // ---- Pkt 9 ----
  children.push(heading("9. Przedmioty, z których uzyskano więcej niż 3 oceny ndst (podać liczbę ocen):"));
  children.push(hr());
  if (stats.przedmiotyPonad3Ndst.length) {
    stats.przedmiotyPonad3Ndst.forEach(x => children.push(P(`${x.przedmiot} — ${x.liczba} ocen`)));
  }

  // ---- Pkt 10 ----
  children.push(heading("10. Uczniowie z 3 i więcej ocenami niedostatecznymi (wraz z uzasadnieniem przyczyn niepowodzenia):"));
  children.push(hr());
  if (stats.uczniowie3PlusNdst.length) {
    stats.uczniowie3PlusNdst.forEach(x => children.push(P(`${x.nazwisko} (${x.liczbaNdst} ocen ndst)`)));
  } else {
    children.push(P("—"));
  }
  if (form.przyczynyNdst) {
    children.push(P("Przyczyny niepowodzenia:", { bold: true, spacing: { before: 80 } }));
    String(form.przyczynyNdst).split(/\r?\n/).filter(Boolean).forEach(l => children.push(P(l)));
  }

  // ---- Pkt 11 ----
  children.push(heading("11. Uczniowie, którzy uzyskali średnią ocen 4,5 i większą (średnia bez religii lub etyki):"));
  if (stats.uczniowieSrednia45.length) {
    stats.uczniowieSrednia45.forEach(x => children.push(P(`${x.nazwisko}  ${fmtNumber(x.srednia)}`)));
  } else {
    children.push(P("—"));
  }

  // ---- Pkt 12 ----
  children.push(heading("12. Uczniowie, którzy uzyskali szczególne osiągnięcia (laureat lub finalista olimpiady bądź turnieju o zasięgu ogólnopolskim):"));
  if (form.osiagniecia) {
    String(form.osiagniecia).split(/\r?\n/).filter(Boolean).forEach(l => children.push(P(l)));
  } else {
    children.push(P("—"));
  }

  // ---- Pkt 13 ----
  children.push(heading("13. Uczniowie, którzy opuścili powyżej 70 godz. nieusprawiedliwionych (wraz z podaniem przyczyn nieobecności):"));
  const names70 = stats.uczniowie70hNieusp.map(x => x.nazwisko);
  const rows70 = [];
  const maxRows = Math.max(8, names70.length);
  for (let i = 0; i < maxRows; i++) {
    rows70.push(row([cell(names70[i] || "", { width: 50 }), cell("", { width: 50 })]));
  }
  children.push(table([
    row([cell("II semestr", { width: 50, align: CENTER, bold: true, shading: "EEEEEE" }), cell("Rok szkolny", { width: 50, align: CENTER, bold: true, shading: "EEEEEE" })]),
    ...rows70,
  ]));
  if (form.przyczyny70h) {
    children.push(P("Przyczyny nieobecności:", { bold: true, spacing: { before: 80 } }));
    String(form.przyczyny70h).split(/\r?\n/).filter(Boolean).forEach(l => children.push(P(l)));
  }

  // ---- Pkt 14 ----
  children.push(heading("14. Przedmioty, z których odbyły się diagnostyczne sprawdziany dyrektorskie lub matura próbna:"));
  children.push(hr());
  if (form.diagnoza) {
    String(form.diagnoza).split(/\r?\n/).filter(Boolean).forEach(l => children.push(P(l)));
  }

  // ---- Pkt 15 ----
  children.push(heading("15. Uczniowie z 1 i 2 ocenami ndst, którzy mogą przystąpić do egzaminu poprawkowego:"));
  const rows15 = stats.uczniowieEgzaminPoprawkowy.length
    ? stats.uczniowieEgzaminPoprawkowy.map(x => row([cell(x.nazwisko, { width: 50 }), cell(x.przedmioty.join(", "), { width: 50 })]))
    : [row([cell("", { width: 50 }), cell("", { width: 50 })])];
  children.push(table([
    row([cell("Nazwisko i Imię ucznia", { width: 50, align: CENTER, bold: true, shading: "EEEEEE" }), cell("Przedmioty", { width: 50, align: CENTER, bold: true, shading: "EEEEEE" })]),
    ...rows15,
  ]));

  // ---- Pkt 16 ----
  children.push(heading("16. Nieklasyfikowani:"));
  const rows16 = rowsFromText(form.nieklasyfikowani, 3);
  if (rows16.length === 0) rows16.push(["", "", ""]);
  children.push(table([
    row([
      cell("Nazwisko i imię ucznia", { width: 34, align: CENTER, bold: true, shading: "EEEEEE" }),
      cell("Przedmioty", { width: 33, align: CENTER, bold: true, shading: "EEEEEE" }),
      cell("Przedmioty z których decyzją RP wyznaczono egzamin klasyfikacyjny", { width: 33, align: CENTER, bold: true, shading: "EEEEEE" }),
    ]),
    ...rows16.map(r => row(r.map((c, i) => cell(c, { width: i === 0 ? 34 : (i === 1 ? 33 : 33) })))),
  ]));

  // ---- Pkt 17 ----
  children.push(heading("17. Uczniowie z oceną wzorową (uzasadnienie oceny):"));
  children.push(namesParagraph(stats.wzoroweList));
  if (form.uzasWzorowa) {
    String(form.uzasWzorowa).split(/\r?\n/).filter(Boolean).forEach(l => children.push(P(l, { italics: true })));
  }

  // ---- Pkt 18 ----
  children.push(heading("18. Uczniowie ze 100% frekwencją:"));
  children.push(namesParagraph(stats.uczniowie100Frekwencja));

  // ---- Pkt 19 ----
  children.push(heading("19. Uczniowie z oceną naganną (uzasadnienie oceny):"));
  children.push(namesParagraph(stats.naganneList));
  if (form.uzasNaganna) {
    String(form.uzasNaganna).split(/\r?\n/).filter(Boolean).forEach(l => children.push(P(l, { italics: true })));
  }

  // ---- Pkt 20 ----
  children.push(heading("20. Uczniowie, którzy przerwali naukę w klasie:"));
  const rows20 = rowsFromText(form.przerwali, 2);
  if (rows20.length === 0) rows20.push(["", ""]);
  children.push(table([
    row([
      cell("Nazwisko i imię uczniów, którzy przerwali naukę w klasie", { width: 50, align: CENTER, bold: true, shading: "EEEEEE" }),
      cell("Przyczyny", { width: 50, align: CENTER, bold: true, shading: "EEEEEE" }),
    ]),
    ...rows20.map(r => row([cell(r[0], { width: 50 }), cell(r[1], { width: 50 })])),
  ]));

  const doc = new docx.Document({
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } },
      },
    },
    sections: [{
      properties: {
        page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } },
      },
      children,
    }],
  });

  return doc;
}
