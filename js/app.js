/* ============================================================
   app.js — obsługa UI: wgrywanie plików, podsumowanie, generowanie
   ============================================================ */

let currentModel = null;
let currentStats = null;
let currentFrekwencja = { semestr: null, rok: null };
let currentSrodrocznaSpoz = null; // suma spóźnień z I semestru (klasyfikacja śródroczna)

const $ = (id) => document.getElementById(id);

function setStatus(el, text, type) {
  el.textContent = text || "";
  el.className = "file-status" + (type ? " " + type : "");
}

function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

/** Zwraca wartości zaznaczonych checkboxów w kontenerze (id). */
function checkedValues(containerId) {
  const container = $(containerId);
  if (!container) return [];
  return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
}

function collectForm() {
  return {
    wychowawca: $("f-wychowawca").value.trim(),
    stanLiczba: $("f-stan-liczba").value.trim(),
    frekwProcentRok: $("f-frekw-proc-rok").value.trim(),
    frekwProcentSem: $("f-frekw-proc-sem").value.trim(),
    frekwOpRok: $("f-frekw-op-rok").value.trim(),
    frekwNieuspRok: $("f-frekw-nieusp-rok").value.trim(),
    frekwSpozRok: $("f-frekw-spoz-rok").value.trim(),
    frekwOpSem: $("f-frekw-op-sem").value.trim(),
    frekwNieuspSem: $("f-frekw-nieusp-sem").value.trim(),
    frekwSpozSem: $("f-frekw-spoz-sem").value.trim(),
    przyczynyNdst: $("f-przyczyny-ndst").value,
    osiagniecia: $("f-osiagniecia").value,
    przyczyny70h: $("f-przyczyny-70h").value,
    diagnoza: $("f-diagnoza").value,
    nieklasyfikowani: $("f-nieklasyfikowani").value,
    przerwali: $("f-przerwali").value,
    uzasWzorowaOptions: checkedValues("uzas-wzorowa-options"),
    uzasWzorowa: $("f-uzas-wzorowa").value,
    uzasNagannaOptions: checkedValues("uzas-naganna-options"),
    uzasNaganna: $("f-uzas-naganna").value,
  };
}

function renderSummary(model, stats, frekw) {
  const s = stats;
  const z = s.zachowanie;
  const rows = [
    ["Typ raportu", model.type],
    ["Klasa", model.klasa || "—"],
    ["Rok szkolny", model.rokSzkolny || "—"],
    ["Liczba uczniów", s.liczbaUczniow],
    ["Bez ocen ndst", s.bezNdst],
    ["Z 1 ndst", s.z1Ndst],
    ["Z 2 ndst", s.z2Ndst],
    ["Z 3+ ndst", s.z3Ndst],
    ["Oceny wzorowe", z.wzorowe],
    ["Oceny naganne", z.naganne],
    ["Godz. opuszczone", s.godzinyOpuszczone],
    ["Godz. nieuspraw.", s.godzinyNieusprawiedliwione],
    ["Spóźnienia", s.spoznienia],
  ];
  if (frekw && frekw.semestr) rows.push(["% frekwencji (semestr)", frekw.semestr.procentObecnosci || "—"]);
  if (frekw && frekw.rok) rows.push(["% frekwencji (rok)", frekw.rok.procentObecnosci || "—"]);

  const container = $("summary");
  container.innerHTML = "";
  rows.forEach(([k, v]) => {
    const d = document.createElement("div");
    d.className = "stat";
    const kk = document.createElement("span");
    kk.className = "k";
    kk.textContent = k;
    const vv = document.createElement("span");
    vv.className = "v";
    vv.textContent = v;
    d.appendChild(kk);
    d.appendChild(vv);
    container.appendChild(d);
  });
}

function applyModelToForm(model) {
  // nagłówek kolumny frekwencji: "Semestr I" (śródroczna) vs "II semestr" (roczna/końcowa)
  const semHead = $("frekw-sem-head");
  if (semHead) semHead.textContent = isAnnualType(model.type) ? "II semestr" : "Semestr I";
  // jeśli pole wychowawcy jest puste, a PDF zawiera wychowawcę — uzupełnij
  if (model.wychowawca && !$("f-wychowawca").value.trim()) {
    $("f-wychowawca").value = model.wychowawca;
    localStorage.setItem("wychowawca", model.wychowawca);
  }
}

function setVal(id, val) {
  const el = $(id);
  if (el) el.value = (val == null ? "" : String(val));
}

function fillFrekwencjaForm(model, stats, frekw, srodrocznaSpoz) {
  const isAnnual = isAnnualType(model.type);
  const sem = frekw.semestr;
  const rok = frekw.rok;

  // Kolumna „rok szkolny” widoczna tylko, gdy jest plik frekwencji "rok"
  // (2 pliki frekwencji = raport roczny). Przy 1 pliku frekwencji — ukryj.
  const rokCol = $("frekw-rok-col");
  if (rokCol) {
    if (rok) show(rokCol);
    else hide(rokCol);
  }

  // Kolumna „Semestr / I semestr”
  setVal("f-frekw-proc-sem", sem ? sem.procentObecnosci : "");
  if (isAnnual) {
    // dane II semestru pochodzą z pliku frekwencji "semestr"
    setVal("f-frekw-op-sem", sem ? sem.godzinyOpuszczone : "");
    setVal("f-frekw-nieusp-sem", sem ? sem.godzinyNieusprawiedliwione : "");
    // spóźnienia II sem. = cały rok − I semestr (z klasyfikacji śródrocznej)
    const semSpoz = (srodrocznaSpoz != null)
      ? Math.max(0, stats.spoznienia - srodrocznaSpoz)
      : "";
    setVal("f-frekw-spoz-sem", semSpoz);
  } else {
    // śródroczna: semestr liczony z klasyfikacji
    setVal("f-frekw-op-sem", stats.godzinyOpuszczone);
    setVal("f-frekw-nieusp-sem", stats.godzinyNieusprawiedliwione);
    setVal("f-frekw-spoz-sem", stats.spoznienia);
  }

  // Kolumna „rok szkolny”
  setVal("f-frekw-proc-rok", rok ? rok.procentObecnosci : "");
  if (rok) {
    setVal("f-frekw-op-rok", rok.godzinyOpuszczone);
    setVal("f-frekw-nieusp-rok", rok.godzinyNieusprawiedliwione);
    setVal("f-frekw-spoz-rok", isAnnual ? stats.spoznienia : "");
  } else if (isAnnual) {
    // brak pliku "rok" — fallback na klasyfikację roczną/końcową
    setVal("f-frekw-op-rok", stats.godzinyOpuszczone);
    setVal("f-frekw-nieusp-rok", stats.godzinyNieusprawiedliwione);
    setVal("f-frekw-spoz-rok", stats.spoznienia);
  } else {
    setVal("f-frekw-op-rok", "");
    setVal("f-frekw-nieusp-rok", "");
    setVal("f-frekw-spoz-rok", "");
  }
}

async function handleFiles(fileList) {
  const files = Array.from(fileList || []);
  const status = $("file-status");
  if (!files.length) return;

  let rocznaClassification = null;     // klasyfikacja roczna / końcowa
  let srodrocznaClassification = null; // klasyfikacja śródroczna (I semestr)
  const frekwencjaFiles = [];
  const warnings = [];
  let pdfjsLib = null;

  try {
    for (const file of files) {
      const name = file.name.toLowerCase();
      if (name.endsWith(".pdf")) {
        setStatus(status, "Wczytywanie PDF…");
        if (!pdfjsLib) {
          pdfjsLib = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs");
          pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
        }
        const m = await parseLibrusPdf(await file.arrayBuffer(), pdfjsLib);
        if (isAnnualType(m.type)) rocznaClassification = m;
        else srodrocznaClassification = m;
      } else {
        const buffer = await file.arrayBuffer();
        const text = decodeLibrusFile(buffer);
        const type = detectFileType(text);
        if (type === "klasyfikacja") {
          const m = parseLibrusCSV(text);
          if (isAnnualType(m.type)) rocznaClassification = m;
          else srodrocznaClassification = m;
        } else if (type === "frekwencja") {
          const f = parseFrekwencjaCSV(text);
          f.sourceName = file.name;
          frekwencjaFiles.push(f);
        } else {
          warnings.push(`„${file.name}” — nie rozpoznano typu pliku.`);
        }
      }
    }

    const classification = rocznaClassification || srodrocznaClassification;
    if (!classification) {
      throw new Error("Nie znaleziono pliku klasyfikacji („Klasyfikacja …”). Dodaj go razem z plikami frekwencji.");
    }

    currentModel = classification;
    currentStats = computeStats(currentModel);
    currentSrodrocznaSpoz = (rocznaClassification && srodrocznaClassification)
      ? computeStats(srodrocznaClassification).spoznienia
      : null;
    currentFrekwencja = classifyFrekwencja(frekwencjaFiles);

    renderSummary(currentModel, currentStats, currentFrekwencja);
    applyModelToForm(currentModel);
    fillFrekwencjaForm(currentModel, currentStats, currentFrekwencja, currentSrodrocznaSpoz);

    show($("summary-card"));
    show($("form-card"));
    show($("download-card"));

    const parts = [`Wczytano ${files.length} ${files.length === 1 ? "plik" : "pliki"}`];
    parts.push(`klasyfikacja: ${currentModel.students.length} uczniów`);
    if (currentSrodrocznaSpoz != null) parts.push("+ śródroczna (spóźnienia II sem.)");
    if (currentFrekwencja.semestr || currentFrekwencja.rok) {
      const labels = [];
      if (currentFrekwencja.semestr) labels.push("semestr");
      if (currentFrekwencja.rok) labels.push("rok");
      parts.push(`frekwencja: ${labels.join(" + ")}`);
    }
    if (warnings.length) parts.push(warnings.join(" "));
    setStatus(status, parts.join(" • ") + ".", warnings.length ? "warn" : "ok");
  } catch (err) {
    currentModel = null;
    currentStats = null;
    currentFrekwencja = { semestr: null, rok: null };
    currentSrodrocznaSpoz = null;
    hide($("summary-card"));
    hide($("form-card"));
    hide($("download-card"));
    setStatus(status, "Błąd: " + err.message, "err");
  }
}

async function generate() {
  if (!currentModel || !currentStats) {
    setStatus($("generate-status"), "Najpierw wgraj poprawny plik CSV.", "err");
    return;
  }
  const btn = $("btn-generate");
  btn.disabled = true;
  setStatus($("generate-status"), "Generowanie…");
  try {
    const doc = generujDocx(currentModel, currentStats, collectForm(), !!currentFrekwencja.rok);
    const blob = await docx.Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeClass = (currentModel.klasa || "klasa").replace(/[^\w\-]+/g, "_");
    a.href = url;
    a.download = `Sprawozdanie_wychowawcy_${safeClass}.docx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setStatus($("generate-status"), "Gotowe — plik został pobrany.", "ok");
  } catch (err) {
    console.error(err);
    setStatus($("generate-status"), "Błąd generowania: " + err.message, "err");
  } finally {
    btn.disabled = false;
  }
}

// ---- inicjalizacja ----
function init() {
  const dropzone = $("dropzone");
  const input = $("file-input");

  dropzone.addEventListener("click", () => input.click());
  input.addEventListener("change", () => { if (input.files.length) handleFiles(input.files); });

  ["dragenter", "dragover"].forEach(ev => dropzone.addEventListener(ev, e => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  }));
  ["dragleave", "drop"].forEach(ev => dropzone.addEventListener(ev, e => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
  }));
  dropzone.addEventListener("drop", e => {
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length) handleFiles(files);
  });

  $("btn-generate").addEventListener("click", generate);

  // zapamiętywanie wychowawcy w przeglądarce
  const w = $("f-wychowawca");
  const saved = localStorage.getItem("wychowawca");
  if (saved) w.value = saved;
  w.addEventListener("input", () => {
    localStorage.setItem("wychowawca", w.value);
  });
}

document.addEventListener("DOMContentLoaded", init);
