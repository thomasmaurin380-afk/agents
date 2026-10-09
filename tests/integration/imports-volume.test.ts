// Volumétrie : FEC de 100 000 lignes (50 000 écritures), analysé et enregistré par le service réel.
import { afterAll, beforeAll, expect, it } from "vitest";
import { MemoryStorage, setStorageForTests } from "@/lib/storage";
import type { Actor } from "@/services/actor";
import { createWorld, ownerSql } from "./fixtures";

const sql = ownerSql();
afterAll(async () => {
  setStorageForTests(null);
  await sql.end();
});
beforeAll(() => setStorageForTests(new MemoryStorage()));

it("FEC de 100 000 lignes : import complet en moins de 30 s", async () => {
  const w = await createWorld(sql);
  const imports = await import("@/services/imports");
  const data = await import("@/services/company-data");
  const analyst: Actor = {
    userId: w.u.analyst1, email: "a@test.invalid", fullName: "a", aal: "aal2", hasVerifiedTotp: true,
    firms: [{ firmId: w.f1, role: "firm_analyst", firmName: "C" }], clientCompanies: [],
  };
  const fy = (await data.createFiscalYear(analyst, w.c.c1, { startDate: "2025-01-01", endDate: "2025-12-31" })).id;
  const head = "JournalCode\tJournalLib\tEcritureNum\tEcritureDate\tCompteNum\tCompteLib\tCompAuxNum\tCompAuxLib\tPieceRef\tPieceDate\tEcritureLib\tDebit\tCredit\tEcritureLet\tDateLet\tValidDate\tMontantdevise\tIdevise";
  const lines = [head];
  for (let i = 1; i <= 50_000; i++) {
    const day = String((i % 28) + 1).padStart(2, "0");
    const month = String((i % 12) + 1).padStart(2, "0");
    const amount = `${(i % 5000) + 1},${String(i % 100).padStart(2, "0")}`;
    const d = `2025${month}${day}`;
    lines.push(["AC", "Achats", `E${i}`, d, `60${i % 90 + 10}000`, "Achats", "", "", `P${i}`, d, `Achat ${i}`, amount, "0,00", "", "", "20251231", "", ""].join("\t"));
    lines.push(["AC", "Achats", `E${i}`, d, "401000", "Fournisseurs", "", "", `P${i}`, d, `Achat ${i}`, "0,00", amount, "", "", "20251231", "", ""].join("\t"));
  }
  const bytes = new TextEncoder().encode(lines.join("\n"));
  const t0 = performance.now();
  const { id } = await imports.uploadImport(analyst, w.c.c1, { kind: "fec", fiscalYearId: fy, file: { name: "FEC-volume.txt", type: "text/plain", bytes } });
  const t1 = performance.now();
  const ws = await imports.getImportWorkspace(analyst, w.c.c1, id);
  expect(ws.prepared!.blocking).toBe(false);
  const t2 = performance.now();
  await imports.commitImport(analyst, w.c.c1, id, {});
  const t3 = performance.now();
  const [{ n }] = await sql`select count(*)::int as n from app.accounting_entries where import_file_id = ${id}`;
  expect(n).toBe(100_000);
  console.log(`taille ${(bytes.length / 1e6).toFixed(1)} Mo — téléversement ${((t1 - t0) / 1000).toFixed(1)} s, analyse ${((t2 - t1) / 1000).toFixed(1)} s, validation ${((t3 - t2) / 1000).toFixed(1)} s`);
  expect(t3 - t0).toBeLessThan(30_000);
}, 120_000);
