export function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false, closed = false;
  const pushField = () => { row.push(field.trim()); field = ""; closed = false; };
  const pushRow = () => { pushField(); if (row.some(Boolean)) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') { field += '"'; i++; }
      else { quoted = false; closed = true; }
    } else if (c === '"') {
      if (field || closed) throw new Error("Unexpected quote in CSV.");
      quoted = true;
    } else if (c === ",") pushField();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      pushRow();
    } else {
      if (closed) throw new Error("Expected a delimiter after a quoted field.");
      field += c;
    }
  }
  if (quoted) throw new Error("Unclosed quoted field in CSV.");
  pushRow();
  return rows;
}

export function readRecords(text, idName) {
  const [header, ...rows] = parseCSV(text.replace(/^\uFEFF/, ""));
  if (header?.join(",") !== `${idName},reference,amount`) {
    throw new Error(`Expected columns: ${idName},reference,amount.`);
  }
  if (!rows.length || rows.length > 5000) throw new Error("Each CSV must have 1 to 5,000 records.");
  const ids = new Set();
  return rows.map(([id, reference, amount, ...extra], index) => {
    if (!id || !reference || extra.length || ids.has(id) || !/^\d{1,10}(?:\.\d{1,2})?$/.test(amount)) {
      throw new Error(`Invalid record or repeated ID at record ${index + 1} (${idName}).`);
    }
    ids.add(id);
    const [whole, fraction = ""] = amount.split(".");
    return { id, reference: reference.toUpperCase(), cents: Number(whole) * 100 + Number(fraction.padEnd(2, "0")) };
  });
}

export function reconcile(invoices, payments) {
  const groups = new Map();
  for (const [side, records] of [["invoices", invoices], ["payments", payments]]) {
    for (const record of records) {
      if (!groups.has(record.reference)) groups.set(record.reference, { invoices: [], payments: [] });
      groups.get(record.reference)[side].push(record);
    }
  }
  return Array.from(groups, ([reference, { invoices, payments }]) => {
    const expected = invoices.reduce((sum, row) => sum + row.cents, 0);
    const received = payments.reduce((sum, row) => sum + row.cents, 0);
    let status = "Matched";
    if (invoices.length > 1) status = "Duplicate reference";
    else if (!invoices.length) status = "Unlinked payment";
    else if (!payments.length) status = "Missing payment";
    else if (received < expected) status = "Underpaid";
    else if (received > expected) status = "Overpaid";
    return { reference, expected, received, status, invoices, payments };
  });
}

export const money = cents => (cents / 100).toFixed(2);
export function exportCSV(rows) {
  const cell = value => {
    const str = String(value);
    return '"' + (/^[=+@\-\t\r\n]/.test(str) ? "'" : "") + str.replaceAll('"', '""') + '"';
  };
  return ["reference,status,expected,received", ...rows.map(row =>
    [row.reference, row.status, money(row.expected), money(row.received)].map(cell).join(","))].join("\r\n");
}
