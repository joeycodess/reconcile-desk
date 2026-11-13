import { exportCSV, money } from "./engine.mjs";
import { sample } from "./sample.mjs";

const byId = id => document.getElementById(id);
const invoices = byId("invoices"), payments = byId("payments");
const run = byId("run"), status = byId("status"), error = byId("error");
const report = byId("report"), empty = byId("empty"), filter = byId("exceptions");
const download = byId("export");
let rows = [], useSample = false;

function resetReport() {
  rows = [];
  report.hidden = true;
  empty.hidden = false;
  download.disabled = true;
  error.hidden = true;
  filter.checked = false;
}

function downloadURL(csv) {
  return URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
}

for (const type of ["invoices", "payments"]) {
  byId("sample-" + type).href = downloadURL(sample[type]);
}

byId("load").onclick = () => {
  invoices.value = payments.value = "";
  useSample = true;
  resetReport();
  status.textContent = "Sample loaded · 8 invoices and 8 payments";
};
for (const input of [invoices, payments]) input.onchange = () => {
  useSample = false;
  resetReport();
  status.textContent = "";
};

function render() {
  const shown = filter.checked ? rows.filter(row => row.status !== "Matched") : rows;
  const body = byId("rows");
  body.replaceChildren();
  for (const row of shown) {
    const tr = document.createElement("tr");
    for (const value of [row.reference, money(row.expected), money(row.received), row.status]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      tr.append(cell);
    }
    const details = document.createElement("details"), summary = document.createElement("summary");
    summary.textContent = row.reference;
    details.append(summary);
    for (const [label, records] of [["Invoices", row.invoices], ["Payments", row.payments]]) {
      const line = document.createElement("p");
      line.textContent = label + ": " + (records.map(record => record.id + " (" + money(record.cents) + ")").join(", ") || "None");
      details.append(line);
    }
    tr.firstChild.replaceChildren(details);
    tr.lastChild.dataset.status = row.status === "Matched" ? "matched" : "review";
    body.append(tr);
  }
  if (!shown.length) {
    const tr = document.createElement("tr"), cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "No exceptions in this run.";
    tr.append(cell);
    body.append(tr);
  }
}
filter.onchange = render;

run.onclick = async () => {
  resetReport();
  run.disabled = invoices.disabled = payments.disabled = byId("load").disabled = true;
  status.textContent = "Reading input files";
  let worker;
  try {
    const files = [invoices.files[0], payments.files[0]];
    if (!useSample && files.some(file => !file)) throw new Error("Choose both CSV files or load the sample data.");
    if (!useSample && files.some(file => file.size > 1_000_000)) throw new Error("Each CSV must be 1 MB or smaller.");
    const input = useSample ? sample : { invoices: await files[0].text(), payments: await files[1].text() };
    worker = new Worker(new URL("./worker.mjs", import.meta.url), { type: "module" });
    rows = await new Promise((resolve, reject) => {
      worker.onerror = () => reject(new Error("The worker could not start. Reload the page and try again."));
      worker.onmessage = ({ data }) => {
        if (data.error) reject(new Error(data.error));
        else {
          status.textContent = data.phase;
          if (data.rows) resolve(data.rows);
        }
      };
      worker.postMessage(input);
    });
    const matched = rows.filter(row => row.status === "Matched").length;
    byId("total").textContent = rows.length;
    byId("matched").textContent = matched;
    byId("review").textContent = rows.length - matched;
    render();
    empty.hidden = true;
    report.hidden = false;
    download.disabled = false;
  } catch (err) {
    status.textContent = "";
    error.textContent = err.message;
    error.hidden = false;
  } finally {
    worker?.terminate();
    run.disabled = invoices.disabled = payments.disabled = byId("load").disabled = false;
  }
};
download.onclick = () => {
  const link = document.createElement("a");
  link.href = downloadURL(exportCSV(rows));
  link.download = "reconciliation.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};
