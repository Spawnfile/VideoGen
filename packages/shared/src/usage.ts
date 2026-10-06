export interface UsageWindow { utilization: number | null; resetsAt: string | null }
export interface UsageSnapshot {
  source: 'get_usage' | 'rate_limit_event';
  fiveHour: UsageWindow | null;
  sevenDay: UsageWindow | null;
  status: 'allowed' | 'allowed_warning' | 'rejected' | null;
  subscriptionType: string | null;
  at: string;
}

type RawWindow = { utilization: number | null; resets_at: string | null } | null | undefined;
export interface GetUsageLike {
  subscription_type: string | null;
  rate_limits_available: boolean;
  rate_limits: { five_hour?: RawWindow; seven_day?: RawWindow } | null;
}
export interface RateLimitInfoLike {
  status?: 'allowed' | 'allowed_warning' | 'rejected';
  resetsAt?: number;
  rateLimitType?: string;
  utilization?: number;
  unifiedWindows?: Partial<Record<'five_hour' | 'seven_day', { utilization?: number; resetsAt?: number }>>;
}

/** Units differ per source (M0): get_usage reports percent (0..100), rate_limit_event fractions (0..1). Never guess by magnitude. */
function fromPercent(v: number | null | undefined): number | null {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  return v / 100;
}
function fromFraction(v: number | null | undefined): number | null {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  return v;
}

function iso(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  return new Date(typeof v === 'number' ? v * 1000 : v).toISOString();
}

export function fromGetUsage(r: GetUsageLike, at: Date = new Date()): UsageSnapshot {
  const w = (x: RawWindow): UsageWindow | null => (x ? { utilization: fromPercent(x.utilization), resetsAt: iso(x.resets_at) } : null);
  const ok = r.rate_limits_available && r.rate_limits;
  return {
    source: 'get_usage',
    fiveHour: ok ? w(r.rate_limits!.five_hour) : null,
    sevenDay: ok ? w(r.rate_limits!.seven_day) : null,
    status: null,
    subscriptionType: r.subscription_type ?? null,
    at: at.toISOString(),
  };
}

export function fromRateLimitEvent(info: RateLimitInfoLike, at: Date = new Date()): UsageSnapshot {
  const pick = (k: 'five_hour' | 'seven_day'): UsageWindow | null => {
    const u = info.unifiedWindows?.[k];
    if (u) return { utilization: fromFraction(u.utilization), resetsAt: iso(u.resetsAt) };
    if (info.rateLimitType === k) return { utilization: fromFraction(info.utilization), resetsAt: iso(info.resetsAt) };
    return null;
  };
  return { source: 'rate_limit_event', fiveHour: pick('five_hour'), sevenDay: pick('seven_day'), status: info.status ?? null, subscriptionType: null, at: at.toISOString() };
}

export function usageLevel(u: number | null): 'ok' | 'warn' | 'high' | 'unknown' {
  if (u === null) return 'unknown';
  return u >= 0.8 ? 'high' : u >= 0.5 ? 'warn' : 'ok';
}
