/* ============================================================
   app.js — obsługa UI: wgrywanie pliku, podsumowanie, generowanie
   ============================================================ */

let currentModel = null;
let currentStats = null;

const $ = (id) => document.getElementById(id);

function setStatus(el, text, type) {
  el.textContent = text || "";
  el.className = "file-status" + (type ? " " + type : "");
}

function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

function collectForm() {
  return {
    wychowawca: $("f-wychowawca").value.trim(),
    semestr: $("f-semestr").value,
    stanData: $("f-stan-data").value.trim(),
    stanLiczba: $("f-stan-liczba").value.trim(),
    frekwProcentRok: $("f-frekw-proc-rok").value.trim(),
    frekwProcentSem: $("f-frekw-proc-sem").value.trim(),
    frekwOpRok: $("f-frekw-op-rok").value.trim(),
    frekwNieuspRok: $("f-frekw-nieusp-rok").value.trim(),
    frekwSpozRok: $("f-frekw-spoz-rok").value.trim(),
    przyczynyNdst: $("f-przyczyny-ndst").value,
    osiagniecia: $("f-osiagniecia").value,
    przyczyny70h: $("f-przyczyny-70h").value,
    diagnoza: $("f-diagnoza").value,
    nieklasyfikowani: $("f-nieklasyfikowani").value,
    przerwali: $("f-przerwali").value,
    uzasWzorowa: $("f-uzas-wzorowa").value,
    uzasNaganna: $("f-uzas-naganna").value,
  };
}

function renderSummary(model, stats) {
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
  // ukryj pole "Semestr" dla raportu rocznego/końcowego
  const semestrField = $("semestr-field");
  if (semestrField) {
    if (isAnnualType(model.type)) hide(semestrField);
    else show(semestrField);
  }
  // jeśli pole wychowawcy jest puste, a PDF zawiera wychowawcę — uzupełnij
  if (model.wychowawca && !$("f-wychowawca").value.trim()) {
    $("f-wychowawca").value = model.wychowawca;
    localStorage.setItem("wychowawca", model.wychowawca);
  }
}

async function handleFile(file) {
  const status = $("file-status");
  try {
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const name = file.name.toLowerCase();

    if (name.endsWith(".pdf")) {
      setStatus(status, "Wczytywanie PDF…");
      const pdfjsLib = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
      currentModel = await parseLibrusPdf(buffer, pdfjsLib);
    } else {
      const text = decodeLibrusFile(buffer);
      currentModel = parseLibrusCSV(text);
    }

    currentStats = computeStats(currentModel);
    renderSummary(currentModel, currentStats);
    applyModelToForm(currentModel);
    show($("summary-card"));
    show($("form-card"));
    show($("download-card"));
    setStatus(status, `Wczytano „${file.name}" — ${currentModel.students.length} uczniów.`, "ok");
  } catch (err) {
    currentModel = null;
    currentStats = null;
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
    const doc = generujDocx(currentModel, currentStats, collectForm());
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
  input.addEventListener("change", () => { if (input.files[0]) handleFile(input.files[0]); });

  ["dragenter", "dragover"].forEach(ev => dropzone.addEventListener(ev, e => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  }));
  ["dragleave", "drop"].forEach(ev => dropzone.addEventListener(ev, e => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
  }));
  dropzone.addEventListener("drop", e => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
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
