import test from "node:test";
import assert from "node:assert/strict";
import { parseCSV, readRecords, reconcile, exportCSV } from "./engine.mjs";
import { sample } from "./sample.mjs";

test("sample exercises split payments and five exception classes", () => {
  const rows = reconcile(readRecords(sample.invoices, "invoice_id"), readRecords(sample.payments, "payment_id"));
  assert.equal(rows.length, 8);
  assert.equal(rows.filter(row => row.status === "Matched").length, 3);
  assert.equal(rows.find(row => row.reference === "INV-1043").payments.length, 2);
  for (const status of ["Duplicate reference", "Unlinked payment", "Missing payment", "Underpaid", "Overpaid"]) {
    assert.equal(rows.filter(row => row.status === status).length, 1);
  }
});

test("CSV handles escaped quotes, commas, newlines and CRLF", () => {
  assert.deepEqual(parseCSV('a,"b,""c""\nrow"\r\nd,e'), [["a", 'b,"c"\nrow'], ["d", "e"]]);
  assert.throws(() => parseCSV('a,"unfinished'), /Unclosed/);
});

test("validation rejects malformed amounts, repeated IDs and incompatible schemas", () => {
  const header = "invoice_id,reference,amount\n";
  for (const value of ["1.001", "-4", "1e3", "", "0x13"]) {
    assert.throws(() => readRecords(header + "A,R," + value, "invoice_id"), /Invalid record/);
  }
  assert.throws(() => readRecords(header + "A,R,1\nA,R,1", "invoice_id"), /repeated ID/);
  assert.throws(() => readRecords(header + "A,R,1", "payment_id"), /Expected columns/);
});

test("uses integer cents and case-insensitive references", () => {
  const a = readRecords("invoice_id,reference,amount\nA,r,0.30", "invoice_id");
  const b = readRecords("payment_id,reference,amount\nB,R,0.10\nC,R,0.20", "payment_id");
  assert.equal(reconcile(a,b)[0].status,"Matched");
});

test("export escapes formulas and embedded quotes", () => {
  assert.match(exportCSV([{reference:'=SUM("x")', status:"Matched", expected:1, received:1}]), /"'=SUM\(""x""\)"/);
});
