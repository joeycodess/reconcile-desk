import { readRecords, reconcile } from "./engine.mjs";

self.onmessage = ({ data }) => {
  try {
    self.postMessage({ phase: "Validating CSV records" });
    const invoices = readRecords(data.invoices, "invoice_id");
    const payments = readRecords(data.payments, "payment_id");
    self.postMessage({ phase: "Matching references and comparing totals" });
    self.postMessage({ phase: "Reconciliation complete", rows: reconcile(invoices, payments) });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
