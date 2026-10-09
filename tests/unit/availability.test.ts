import { describe, expect, it } from "vitest";
import { availability, HEADLINE_INDICATORS } from "@/domain/indicators/availability";
import { describeMissing, type DataSource } from "@/domain/shared/computation";

describe("Disponibilité des indicateurs (sources partielles)", () => {
  const req = (code: string) => HEADLINE_INDICATORS.find((i) => i.code === code)!.requires;

  it("sans aucune source, tout est « Données insuffisantes » avec la source manquante", () => {
    for (const ind of HEADLINE_INDICATORS) {
      const c = availability(ind.requires, new Set());
      expect(c.status).toBe("insufficient_data");
      if (c.status === "insufficient_data") expect(c.missing.length).toBeGreaterThan(0);
    }
    const ca = availability(req("revenue"), new Set());
    expect(ca.status === "insufficient_data" && describeMissing(ca)).toBe("Source manquante : Balance comptable");
  });

  it("la balance OU le FEC suffit pour le CA ; la banque ne suffit pas", () => {
    expect(availability(req("revenue"), new Set<DataSource>(["fec"])).status).toBe("ok");
    expect(availability(req("revenue"), new Set<DataSource>(["trial_balance"])).status).toBe("ok");
    expect(availability(req("revenue"), new Set<DataSource>(["bank_transactions"])).status).toBe("insufficient_data");
  });

  it("la trésorerie exige les transactions bancaires (pas la comptabilité)", () => {
    expect(availability(req("cash"), new Set<DataSource>(["trial_balance", "fec"])).status).toBe("insufficient_data");
    expect(availability(req("cash"), new Set<DataSource>(["bank_transactions"])).status).toBe("ok");
  });

  it("l'écart budgétaire exige budget ET comptabilité", () => {
    const partial = availability(req("budget_gap"), new Set<DataSource>(["trial_balance"]));
    expect(partial.status === "insufficient_data" && partial.missing).toEqual(["budget"]);
    expect(availability(req("budget_gap"), new Set<DataSource>(["budget", "fec"])).status).toBe("ok");
  });
});
