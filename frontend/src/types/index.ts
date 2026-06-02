// ─── Auth ─────────────────────────────────────────────────────────────────────
export type Role = 'TDR' | 'ZBM' | 'HSD' | 'ASE' | 'DM';

export interface AuthUser {
  id:   string;
  name: string;
  role: Role;
  zone: string | null;
}

export interface AuthState {
  user:    AuthUser | null;
  token:   string | null;
  loading: boolean;
  error:   string | null;
}

// ─── Agent ────────────────────────────────────────────────────────────────────
export type AgentType = 'normal' | 'merchant';

export interface Agent {
  id:               string;
  tdrId:            string;
  tdrName:          string;
  zone:             string;
  zbmName:          string;
  agentName:        string;
  agentCode:        string;
  contactPhone:     string;
  type:             AgentType;
  merchantCategory?: string;
  initialFloat:     number;
  town:             string;
  address?:         string;
  cluster?:         string;
  market?:          string;
  latitude?:        number;
  longitude?:       number;
  notes?:           string;
  createdAt:        string;
  updatedAt:        string;
}

// ─── Visit ────────────────────────────────────────────────────────────────────
export interface Visit {
  id:           string;
  tdrId:        string;
  tdrName:      string;
  zone:         string;
  zbmName:      string;
  outletName:   string;
  agentCode:    string;
  contactPhone: string;
  town:         string;
  cluster?:     string;
  market?:      string;
  floatAmount:  number;
  latitude?:    number;
  longitude?:   number;
  notes?:       string;
  createdAt:    string;
  updatedAt:    string;
}

// ─── Float Issue ──────────────────────────────────────────────────────────────
export type IssueType   = 'low_float' | 'stuck_transaction' | 'system_error' | 'other';
export type IssueStatus = 'reported' | 'in_progress' | 'resolved';

export interface FloatIssue {
  id:              string;
  tdrId:           string;
  tdrName:         string;
  zone:            string;
  agentCode:       string;
  agentName:       string;
  contactPhone:    string;
  issueType:       IssueType;
  reportedFloat:   number;
  description:     string;
  status:          IssueStatus;
  resolvedAt?:     string;
  resolvedBy?:     string;
  resolutionNotes?: string;
  reportedAt:      string;
  updatedAt:       string;
}

// ─── Prospect ─────────────────────────────────────────────────────────────────
export type ProspectType   = 'agent' | 'merchant';
export type ProspectStatus = 'identified' | 'contacted' | 'interested' | 'converted' | 'rejected';

export interface Prospect {
  id:               string;
  tdrId:            string;
  tdrName:          string;
  zone:             string;
  prospectType:     ProspectType;
  businessName:     string;
  ownerName:        string;
  contactPhone:     string;
  town:             string;
  address?:         string;
  merchantCategory?: string;
  estimatedFloat?:  number;
  status:           ProspectStatus;
  notes?:           string;
  followUpDate?:    string;
  convertedAt?:     string;
  closedByTdr?:     boolean;
  zbmApprovalRequired?: boolean;
  createdAt:        string;
  updatedAt:        string;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export interface TDRDashboard {
  tdr: { id: string; name: string; zone: string | null };
  month: string;
  mtd?: { workingDaysElapsed: number; workingDaysTotal: number };
  stats: {
    agents:    { count: number; target: number };
    merchants: { count: number; target: number };
    visits:    { count: number; target: number };
  };
  today: {
    agents:    number;
    merchants: number;
    visits:    number;
    target:    number;  // 20 visits/day
  };
  floatIssues: { total: number; resolved: number; pending: number };
  prospects:   { total: number; converted: number; pending: number };
  recentActivity: { agents: Agent[]; visits: Visit[] };
}

export interface TDRStat {
  tdr:           AuthUser;
  agents:        number;
  merchants:     number;
  visits:        number;
  floatIssues:   number;
  reactivations?: number;
  pct:           number;
}

export interface ASEPerformanceEntry {
  id: string; name: string; zone: string | null; tdrCount: number;
  supervisionScore: number; finalScore: number;
  siteFocusScore?: number; siteFocusSites?: number;
  devices: { total: number; active: number; inactive: number; kycScore: number };
}

export interface ZBMDashboard {
  zbm:   { id: string; name: string; zone: string };
  month: string;
  zone: {
    totals:  { agents: number; merchants: number; visits: number; floatIssuesPending: number; reactivations?: number };
    targets: { agents: number; merchants: number; visits: number };
  };
  tdrStats: TDRStat[];
  prospectsBreakdown: Array<{ status: ProspectStatus; _count: number }>;
  asePerformance?: {
    totalASEs: number; totalDevices: number; activeDevices: number;
    activeDeviceRate: number; avgASEScore: number;
    ases: ASEPerformanceEntry[];
  };
}

export interface ZoneStat {
  zone:        string;
  zbm:         string;
  tdrs:        number;
  agents:      number;
  merchants:   number;
  visits:      number;
  floatIssues: number;
  pct:         number;
}

export interface HSDDashboard {
  period: string;
  kpis: {
    totalAgents:    number;
    totalMerchants: number;
    totalVisits:    number;
    openFloatIssues: number;
    conversionRate: number;
    agentPct?:      number;
    merchantPct?:   number;
    visitPct?:      number;
    nationalTargets?: { agents: number; merchants: number; visits: number };
  };
  ntBase?: {
    totalInactive:   number;
    totalReactivated: number;
    remaining:        number;
    pct:              number;
  };
  criticalAlerts: FloatIssue[];
  prospectsBreakdown: Array<{ status: ProspectStatus; _count: number }>;
}

// ─── Sales Target ─────────────────────────────────────────────────────────────
export interface SalesTarget {
  id:              string;
  zone:            string;
  period:          string;
  targetAgents:    number;
  targetMerchants: number;
  targetOutlets:   number;
  setByHsdId:      string;
}

// ─── TDR Flag ─────────────────────────────────────────────────────────────────
export interface TDRFlag {
  tdrId:   string;
  tdrName: string;
  zone:    string | null;
  aseId:   string | null;
  flags:   string[];
  severity: 'critical' | 'warning';
  daily:   { agents: number; merchants: number; visits: number; target: number };
  weekly:  { agents: number; merchants: number; visits: number };
  mtd:     { agents: number; agentTarget: number; merchants: number; merchantTarget: number; visits: number; visitTarget: number };
}

// ─── Misc ─────────────────────────────────────────────────────────────────────
export interface ApiError {
  error: string;
}

export const ZAMBIA_ZONES = [
  'Lusaka North', 'Lusaka South', 'Copperbelt', 'Northern', 'Eastern',
  'Southern', 'Western', 'Luapula', 'Muchinga', 'North-Western', 'Central',
] as const;

export type ZambiaZone = typeof ZAMBIA_ZONES[number];

export const MERCHANT_CATEGORIES = [
  'Salon', 'Grocery Store', 'Hardware', 'Pharmacy', 'Restaurant',
  'Clothing Store', 'Electronics', 'Fuel Station', 'School', 'Hotel',
  'Supermarket', 'Other',
] as const;

export const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  low_float:          'Low Float',
  stuck_transaction:  'Stuck Transaction',
  system_error:       'System Error',
  other:              'Other',
};

export const PROSPECT_STATUS_LABELS: Record<ProspectStatus, string> = {
  identified: 'Identified',
  contacted:  'Contacted',
  interested: 'Interested',
  converted:  'Converted',
  rejected:   'Rejected',
};

export const STATUS_COLORS: Record<IssueStatus, string> = {
  reported:    'bg-red-100 text-red-800',
  in_progress: 'bg-amber-100 text-amber-800',
  resolved:    'bg-green-100 text-green-800',
};
