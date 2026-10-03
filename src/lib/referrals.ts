/**
 * Referral program.
 * - Share link: https://luofilm.site/?ref=<referrerUid>
 * - A referral counts once per NEW account (doc id = referred uid, so it can
 *   never be counted twice), never for the referrer, and never when the new
 *   account was created on one of the referrer's own devices.
 * - Every 10 valid registrations: 1 free day for the referrer and for each of
 *   those 10 referred users (repeats for every further 10).
 * - When a referred user makes their first paid subscription: 7 free days for
 *   both that user and the referrer.
 * Rewards use deterministic ids so repeated checks never grant twice.
 */
import { fdb, nowIso } from "./fdb";
import { deviceId } from "./devices";

export const SITE_URL = "https://luofilm.site";
const PENDING_KEY = "luo_pending_ref";
const OWNED_KEY = "luo_owned_accounts";
const DAY = 86_400_000;

export const referralLink = (uid?: string | null) => (uid ? `${SITE_URL}/?ref=${uid}` : SITE_URL);

function read<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? "null") as T) ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

/** Accounts that have signed in on this browser. */
export const ownedAccounts = () => read<string[]>(OWNED_KEY, []);
export function rememberOwnedAccount(uid: string) {
  const list = ownedAccounts();
  if (!list.includes(uid)) write(OWNED_KEY, [...list, uid].slice(-20));
}

/**
 * Called on page load with the `ref` query value.
 * Returns "own" when this is the referrer's own device (just open their account),
 * or "stored" when it was saved for a future sign-up.
 */
export function captureReferral(ref: string, currentUid: string | null): "own" | "stored" | "ignored" {
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(ref)) return "ignored";
  if (ref === currentUid || ownedAccounts().includes(ref)) return "own";
  if (currentUid) return "ignored"; // already has an account here
  write(PENDING_KEY, { ref, at: Date.now() });
  return "stored";
}

/** Record the referral for a freshly created account, if valid. */
export async function claimPendingReferral(uid: string, profileCreatedAt?: string | null) {
  const pending = read<{ ref: string; at: number } | null>(PENDING_KEY, null);
  if (!pending) return;
  write(PENDING_KEY, null);
  const { ref } = pending;
  if (ref === uid || ownedAccounts().some((a) => a !== uid && a === ref)) return;
  // Only brand-new accounts count (created within 2 days).
  const created = profileCreatedAt ? new Date(profileCreatedAt).getTime() : Date.now();
  if (Date.now() - created > 2 * DAY) return;
  const dev = deviceId();
  // Same device as the referrer → not a real new person.
  const { data: refDevices } = await fdb.from("luo_devices").select("*").eq("user_id", ref);
  if ((refDevices ?? []).some((d: { device_id?: string }) => d.device_id === dev)) return;
  const { data: referrer } = await fdb.from("profiles").select("*").eq("id", ref).maybeSingle();
  if (!referrer) return;
  const { data: existing } = await fdb.from("luo_referrals").select("*").eq("id", uid).maybeSingle();
  if (existing) return;
  // One referral per device overall, so one phone cannot farm many accounts.
  const { data: sameDevice } = await fdb.from("luo_referrals").select("*").eq("device_id", dev);
  if ((sameDevice ?? []).length) return;
  await fdb.from("luo_referrals").insert({
    id: uid,
    referrer_id: ref,
    referred_id: uid,
    device_id: dev,
    created_at: nowIso(),
  });
}

async function grantDays(userId: string, grantId: string, days: number, label: string) {
  const { data: existing } = await fdb
    .from("luo_subscriptions")
    .select("*")
    .eq("transaction_id", grantId)
    .maybeSingle();
  if (existing) return false;
  const { data: subs } = await fdb.from("luo_subscriptions").select("*").eq("user_id", userId);
  const liveEnds = (subs ?? [])
    .filter((s: { status?: string }) => String(s.status).toLowerCase() === "active")
    .map((s: { expires_at?: string }) => (s.expires_at ? new Date(s.expires_at).getTime() : 0))
    .filter((t: number) => t > Date.now());
  const base = liveEnds.length ? Math.max(...liveEnds) : Date.now();
  await fdb.from("luo_subscriptions").insert({
    id: grantId,
    user_id: userId,
    transaction_id: grantId,
    plan_id: "referral",
    plan_name: label,
    tier: "vip",
    device_limit: 1,
    amount: 0,
    status: "active",
    starts_at: nowIso(),
    started_at: nowIso(),
    expires_at: new Date(base + days * DAY).toISOString(),
    source: "referral",
    created_at: nowIso(),
  });
  return true;
}

export type ReferralSummary = {
  total: number;
  towardNext: number;
  daysEarned: number;
  subscribed: number;
};

const isPaid = (s: { source?: string; amount?: number; status?: string }) =>
  s.source !== "referral" && s.source !== "admin" && Number(s.amount ?? 0) > 0;

/** Count referrals and grant any rewards that are due. Safe to call repeatedly. */
export async function syncReferrals(uid: string): Promise<ReferralSummary> {
  const { data: mine } = await fdb.from("luo_referrals").select("*").eq("referrer_id", uid);
  const list = [...(mine ?? [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  let granted = 0;
  const groups = Math.floor(list.length / 10);
  for (let g = 1; g <= groups; g++) {
    if (await grantDays(uid, `ref10_${uid}_${g}`, 1, "Referral reward · 10 friends")) granted++;
    for (const r of list.slice((g - 1) * 10, g * 10)) {
      await grantDays(r.referred_id, `ref10_${r.referred_id}_${uid}_${g}`, 1, "Referral reward · joined with friends");
    }
  }
  let subscribed = 0;
  if (list.length) {
    const { data: subs } = await fdb.from("luo_subscriptions").select("*");
    for (const r of list) {
      if (!(subs ?? []).some((s: { user_id?: string; source?: string; amount?: number }) => s.user_id === r.referred_id && isPaid(s))) continue;
      subscribed++;
      await grantDays(uid, `refsub_${uid}_${r.referred_id}`, 7, "Referral reward · friend subscribed");
      await grantDays(r.referred_id, `refsub_${r.referred_id}`, 7, "Referral reward · subscribed");
    }
  }
  // Referred users also collect their own rewards when they visit.
  const { data: me } = await fdb.from("luo_referrals").select("*").eq("id", uid).maybeSingle();
  if (me) {
    const { data: mySubs } = await fdb.from("luo_subscriptions").select("*").eq("user_id", uid);
    if ((mySubs ?? []).some(isPaid)) {
      await grantDays(uid, `refsub_${uid}`, 7, "Referral reward · subscribed");
      await grantDays(me.referrer_id, `refsub_${me.referrer_id}_${uid}`, 7, "Referral reward · friend subscribed");
    }
  }
  if (granted) window.dispatchEvent(new Event("luofilm:subscription-changed"));
  return {
    total: list.length,
    towardNext: list.length % 10,
    daysEarned: groups + subscribed * 7,
    subscribed,
  };
}
