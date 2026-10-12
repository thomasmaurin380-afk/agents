import { describe, expect, it } from "vitest";
import { compactEuros, euros, percent, points } from "@/components/finance/format";
import { DEMO_BALANCE, DEMO_MONTHLY_BALANCE, DEMO_TREASURY_MONTHS } from "@/features/design-preview/dashboard/data";
import { buildDashboardModel, isScope, toneOf } from "@/features/design-preview/dashboard/model";
import { decimalToCents } from "@/domain/sig/report";

const c = decimalToCents;

describe("maquette V4 : un seul modèle pour les deux modes", () => {
  const m = buildDashboardModel();

  it("bilan équilibré : actif = dettes + capitaux propres ; décembre = bilan", () => {
    expect(c(m.kpis.totalActifs.value)).toBe(c(m.kpis.totalPassifs.value) + c(m.kpis.capitauxPropres.value));
    expect(c(m.kpis.capitauxPropres.value)).toBe(c(m.balanceDetail.capitaux.total));
    expect(c(m.kpis.totalActifs.value)).toBe(c(DEMO_MONTHLY_BALANCE.actifs.at(-1)!));
    expect(c(m.kpis.totalPassifs.value)).toBe(c(DEMO_MONTHLY_BALANCE.passifs.at(-1)!));
    // Exercice précédent également équilibré.
    expect(c(m.balanceDetail.actifs.totalN1)).toBe(c(m.balanceDetail.passifs.totalN1) + c(m.balanceDetail.capitaux.totalN1));
  });

  it("valeurs de la référence (mode Analyse)", () => {
    expect(euros(m.kpis.totalActifs.value)).toBe("4 451 508 €");
    expect(euros(m.kpis.totalPassifs.value)).toBe("2 451 548 €");
    expect(euros(m.kpis.capitauxPropres.value)).toBe("1 999 960 €");
    expect(percent(m.kpis.ratioEndettement.value)).toBe("55,1 %");
    expect(compactEuros(m.assets.total)).toBe("4,45 M€");
    expect(m.assets.rows.map((r) => r.share)).toEqual(["38,0", "22,0", "18,0", "11,8", "10,2"]);
  });

  it("valeurs de la référence (mode Pilotage), issues des mêmes données", () => {
    const a = m.activity;
    expect(euros(a.tresorerie.value)).toBe("523 410 €");
    expect(c(a.tresorerie.value)).toBe(c(DEMO_BALANCE.actifs.find((l) => l.key === "tresorerie")!.n));
    expect(c(a.tresorerie.value)).toBe(c(DEMO_TREASURY_MONTHS.values.at(-1)!));
    expect(percent(a.tresorerie.variation!.percent, { signed: true })).toBe("+15,6 %");
    expect(euros(a.resultatNet.value)).toBe("186 540 €");
    expect(c(a.resultatNet.value)).toBe(c(DEMO_BALANCE.capitaux.find((l) => l.key === "resultat")!.n));
    expect(a.resultatNet.monthVariation!.percent).toBe("8,2");
    expect(a.resultatNet.marge).toBe("14,9");
    expect(points(a.resultatNet.margeDeltaPoints)).toBe("+2,1 pts");
    expect(a.resultatNet.targetProgress).toBe("74,6");
    expect(euros(a.chiffreAffaires.value)).toBe("1 248 320 €");
    expect(euros(a.charges.value)).toBe("1 018 670 €");
    expect(a.chargesBreakdown.rows.map((r) => r.share)).toEqual(["38,0", "26,0", "18,0", "12,0", "6,0"]);
    // Créances clients et dettes fournisseurs : lignes du bilan du mode Analyse.
    expect(euros(a.creancesClients.value)).toBe("312 690 €");
    expect(euros(a.dettesFournisseurs.value)).toBe("228 450 €");
  });

  it("le sens économique fixe la tonalité, jamais le signe seul", () => {
    expect(m.kpis.totalPassifs.tone).toBe("defavorable"); // dettes en hausse
    expect(m.kpis.capitauxPropres.tone).toBe("favorable");
    expect(m.kpis.ratioEndettement.tone).toBe("favorable"); // ratio en baisse
    expect(m.activity.charges.tone).toBe("defavorable");
    expect(toneOf("neutral", "12.00")).toBe("neutre");
    expect(toneOf("higher_is_better", "0.00")).toBe("neutre");
  });

  it("périmètre entité : indicateurs propres, données consolidées inchangées", () => {
    expect(isScope("belgique")).toBe(true);
    expect(isScope("inconnue")).toBe(false);
    const b = buildDashboardModel("belgique");
    expect(euros(b.kpis.totalActifs.value)).toBe("612 800 €");
    expect(b.kpis.totalActifs.series).toBeNull();
    expect(b.activity).toEqual(m.activity);
    expect(b.assets).toEqual(m.assets);
  });

  it("formats d'affichage : vrai signe moins, pluriel des points, arrondi demi à l'écart de zéro", () => {
    expect(euros("-8940")).toBe("−8 940 €");
    expect(euros("0.50")).toBe("1 €");
    expect(euros("-0.50")).toBe("−1 €");
    expect(euros("24600", { signed: true })).toBe("+24 600 €");
    expect(points("-0,4")).toBe("−0,4 pt");
    expect(points("0,0")).toBe("0,0 pt");
    expect(percent("-0,0", { signed: true })).toBe("0,0 %");
    expect(compactEuros("1018670")).toBe("1,02 M€");
    expect(compactEuros("523410")).toBe("523 k€");
  });
});
