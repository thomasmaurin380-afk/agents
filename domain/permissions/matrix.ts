/**
 * Matrice des permissions (docs/permissions.md). Données pures : la vérification effective
 * est faite côté serveur (services/authorize.ts) puis en base (RLS).
 */
export const COMPANY_ROLES = [
  "firm_admin",
  "firm_analyst",
  "client_owner",
  "client_member",
  "client_readonly",
] as const;
export type CompanyRole = (typeof COMPANY_ROLES)[number];

export const ACTIONS = ["read", "create", "update", "validate", "publish", "export", "admin"] as const;
export type Action = (typeof ACTIONS)[number];

export const RESOURCES = [
  "company",
  "client_members",
  "invitations",
  "imports",
  "accounting_data",
  "sig_rules",
  "sig",
  "kpi",
  "treasury",
  "instant_report",
  "validated_report",
  "recommendations",
  "actions",
  "internal_notes",
  "internal_documents",
  "client_documents",
  "audit_log",
] as const;
export type Resource = (typeof RESOURCES)[number];

type Grants = Partial<Record<Resource, readonly Action[]>>;

const ALL: readonly Action[] = ACTIONS;

/**
 * Pour les ressources « publiées » (SIG, KPI, rapports validés, recommandations), `read`
 * côté client signifie : uniquement les éléments publiés / marqués visibles (filtre appliqué
 * par le service concerné). Les mentions « si délégué » / « si module ouvert » de la
 * documentation ne sont pas accordées par défaut.
 */
const MATRIX: Record<CompanyRole, Grants> = {
  firm_admin: {
    company: ["read", "create", "update", "admin"],
    client_members: ["read", "create", "update", "admin"],
    invitations: ["read", "create", "update", "admin"],
    imports: ALL,
    accounting_data: ["read", "update", "validate"],
    sig_rules: ["read", "admin", "update", "create"],
    sig: ["read", "validate", "publish", "export"],
    kpi: ["read", "update", "publish", "export"],
    treasury: ["read", "update", "export"],
    instant_report: ["read", "create", "export"],
    validated_report: ["read", "create", "validate", "publish", "export"],
    recommendations: ALL,
    actions: ALL,
    internal_notes: ["read", "create", "update"],
    internal_documents: ALL,
    client_documents: ALL,
    audit_log: ["read"],
  },
  firm_analyst: {
    company: ["read"],
    client_members: ["read"],
    imports: ["read", "create", "update", "validate"],
    accounting_data: ["read", "update", "validate"],
    sig_rules: ["read"],
    sig: ["read", "validate", "export"],
    kpi: ["read", "update", "export"],
    treasury: ["read", "update", "export"],
    instant_report: ["read", "create", "export"],
    validated_report: ["read", "create", "validate", "export"],
    recommendations: ["read", "create", "update"],
    actions: ["read", "create", "update"],
    internal_notes: ["read", "create", "update"],
    internal_documents: ["read", "create", "update"],
    client_documents: ["read", "create", "update"],
    audit_log: ["read"],
  },
  client_owner: {
    company: ["read"],
    imports: ["create"],
    sig: ["read"],
    kpi: ["read"],
    treasury: ["read"],
    instant_report: ["read", "create", "export"],
    validated_report: ["read", "export"],
    recommendations: ["read"],
    actions: ["read", "update"],
    client_documents: ["read", "create"],
  },
  client_member: {
    company: ["read"],
    sig: ["read"],
    kpi: ["read"],
    treasury: ["read"],
    instant_report: ["read", "create", "export"],
    validated_report: ["read", "export"],
    recommendations: ["read"],
    actions: ["read", "update"],
    client_documents: ["read", "create"],
  },
  client_readonly: {
    company: ["read"],
    sig: ["read"],
    kpi: ["read"],
    treasury: ["read"],
    validated_report: ["read"],
    recommendations: ["read"],
    actions: ["read"],
    client_documents: ["read"],
  },
};

export function can(role: CompanyRole, resource: Resource, action: Action): boolean {
  return MATRIX[role][resource]?.includes(action) ?? false;
}

export function isFirmRole(role: CompanyRole): role is "firm_admin" | "firm_analyst" {
  return role === "firm_admin" || role === "firm_analyst";
}

/** Libellés français des rôles. */
export const ROLE_LABELS: Record<CompanyRole, string> = {
  firm_admin: "Administrateur DAF",
  firm_analyst: "Collaborateur DAF",
  client_owner: "Dirigeant",
  client_member: "Collaborateur client",
  client_readonly: "Lecture seule",
};

/** Ressources jamais accessibles à un rôle client, quelle que soit la configuration. */
export const NEVER_CLIENT: readonly Resource[] = [
  "internal_notes",
  "internal_documents",
  "audit_log",
  "sig_rules",
  "invitations",
];
