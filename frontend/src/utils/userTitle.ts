/**
 * Per-user title overrides.
 * Role stays as HSD/ZBM/TDR for system permissions.
 * Title is display-only — shown in header, badges, dashboards.
 */
const TITLE_OVERRIDES: Record<string, string> = {
  'hsd-sikalipa': 'Channels & Retail Manager',
};

const ROLE_LABELS: Record<string, string> = {
  HSD: 'Head of Sales',
  ZBM: 'Zone Business Manager',
  TDR: 'Territory Development Rep',
};

const SHORT_OVERRIDES: Record<string, string> = {
  'hsd-sikalipa': 'C&R Manager',
};

/** Full display title — used in header subtitle, profile sections */
export function getUserTitle(id: string, role: string): string {
  return TITLE_OVERRIDES[id] ?? ROLE_LABELS[role] ?? role;
}

/** Short badge label — used in chips, pills */
export function getShortTitle(id: string, role: string): string {
  return SHORT_OVERRIDES[id] ?? role;
}
