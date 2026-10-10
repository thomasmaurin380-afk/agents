/**
 * Navigation des deux espaces. Les modules non encore livrés sont affichés désactivés avec
 * leur phase : aucune fonctionnalité n'est présentée comme opérationnelle avant d'avoir été
 * développée et testée.
 */
export type NavItem = {
  label: string;
  href?: string;
  /** Phase de livraison prévue si le module n'est pas encore disponible. */
  plannedPhase?: string;
  icon: NavIcon;
};

export type NavIcon =
  | "portfolio" | "missions" | "team" | "company" | "dashboard" | "kpi" | "sig" | "accounting"
  | "treasury" | "budget" | "profitability" | "businessplan" | "reports" | "recommendations"
  | "documents" | "automation" | "actions" | "meetings" | "settings";

export function dafGlobalNav(isAdmin: boolean): NavItem[] {
  return [
    { label: "Portefeuille clients", href: "/daf/portfolio", icon: "portfolio" },
    { label: "Référentiel SIG", href: "/daf/sig-rules", icon: "settings" },
    { label: "Missions", plannedPhase: "8", icon: "missions" },
    ...(isAdmin ? [{ label: "Équipe du cabinet", href: "/daf/team", icon: "team" as const }] : []),
  ];
}

export function dafCompanyNav(companyId: string): NavItem[] {
  const base = `/daf/c/${companyId}`;
  return [
    { label: "Fiche entreprise", href: base, icon: "company" },
    { label: "Tableau de bord", plannedPhase: "4", icon: "dashboard" },
    { label: "KPI", plannedPhase: "4", icon: "kpi" },
    { label: "SIG", href: `${base}/sig`, icon: "sig" },
    { label: "Données comptables", href: `${base}/data`, icon: "accounting" },
    { label: "Trésorerie", plannedPhase: "5b", icon: "treasury" },
    { label: "Budgets", plannedPhase: "7", icon: "budget" },
    { label: "Rentabilité", plannedPhase: "7", icon: "profitability" },
    { label: "Business plans", plannedPhase: "10", icon: "businessplan" },
    { label: "Rapports", plannedPhase: "5", icon: "reports" },
    { label: "Recommandations", plannedPhase: "5b", icon: "recommendations" },
    { label: "Documents", plannedPhase: "5b", icon: "documents" },
    { label: "Automatisations", plannedPhase: "9", icon: "automation" },
    { label: "Aperçu portail client", href: `/client/${companyId}`, icon: "dashboard" },
  ];
}

export function clientNav(companyId: string): NavItem[] {
  const base = `/client/${companyId}`;
  return [
    { label: "Tableau de bord", href: base, icon: "dashboard" },
    { label: "Mes KPI", plannedPhase: "4", icon: "kpi" },
    { label: "Mes SIG", href: `${base}/sig`, icon: "sig" },
    { label: "Ma trésorerie", plannedPhase: "5b", icon: "treasury" },
    { label: "Mon budget", plannedPhase: "7", icon: "budget" },
    { label: "Mes rapports", plannedPhase: "5", icon: "reports" },
    { label: "Recommandations", plannedPhase: "5b", icon: "recommendations" },
    { label: "Documents", plannedPhase: "5b", icon: "documents" },
    { label: "Actions", plannedPhase: "5b", icon: "actions" },
    { label: "Rendez-vous", plannedPhase: "8", icon: "meetings" },
  ];
}
