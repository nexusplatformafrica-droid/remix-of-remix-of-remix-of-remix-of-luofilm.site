/** PawaPay Merchant API v2 — server only. Token stays in PAWAPAY_API_TOKEN. */
function base() {
  const env = (process.env["PAWAPAY_ENV"] ?? "production").toLowerCase();
  return env === "sandbox" ? "https://api.sandbox.pawapay.io" : "https://api.pawapay.io";
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function call(path: string, init?: RequestInit): Promise<any> {
  const token = process.env["PAWAPAY_API_TOKEN"];
  if (!token) throw new Error("Mobile money is not configured yet (PAWAPAY_API_TOKEN missing).");
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = { message: text };
  }
  if (!res.ok) {
    const msg = body?.failureReason?.failureMessage ?? body?.message ?? `PawaPay error (${res.status})`;
    throw new Error(String(msg));
  }
  return body;
}

export async function predictProvider(phone: string) {
  const r = await call("/v2/predict-provider", {
    method: "POST",
    body: JSON.stringify({ phoneNumber: phone.replace(/[^0-9]/g, "") }),
  });
  if (!r?.provider) throw new Error("Could not recognise this mobile money number.");
  return { provider: String(r.provider), phoneNumber: String(r.phoneNumber), country: String(r.country ?? "") };
}

const cleanMessage = (s: string) => {
  const t = (s || "LUOFILM").replace(/[^a-zA-Z0-9 ]/g, "").trim().slice(0, 22);
  return t.length >= 4 ? t : "LUOFILM";
};
const amountStr = (n: number) => String(Math.round(Number(n)));

function reject(r: any) {
  if (r?.status === "REJECTED")
    throw new Error(String(r?.failureReason?.failureMessage ?? "Payment was rejected"));
}

/** Uses the network the customer confirmed; otherwise asks PawaPay to predict it. */
async function resolveProvider(phone: string, provider?: string | undefined) {
  if (provider && /^[A-Z0-9_]{3,40}$/.test(provider)) return { provider, phoneNumber: phone.replace(/[^0-9]/g, "") };
  return predictProvider(phone);
}

export async function activeProviders(country: string): Promise<{ provider: string; displayName: string; logo: string }[]> {
  const r = await call(`/v2/active-conf?country=${encodeURIComponent(country)}&operationType=DEPOSIT`);
  const c = (r?.countries ?? []).find((x: any) => x?.country === country);
  return (c?.providers ?? []).map((p: any) => ({ provider: String(p.provider), displayName: String(p.displayName ?? p.provider), logo: p.logo ? String(p.logo) : "" }));
}

export async function deposit(input: { phone: string; amount: number; currency: string; reference: string; message?: string | undefined; provider?: string | undefined }) {
  const p = await resolveProvider(input.phone, input.provider);
  const depositId = crypto.randomUUID();
  const r = await call("/v2/deposits", {
    method: "POST",
    body: JSON.stringify({
      depositId,
      amount: amountStr(input.amount),
      currency: input.currency,
      payer: { type: "MMO", accountDetails: { phoneNumber: p.phoneNumber, provider: p.provider } },
      clientReferenceId: input.reference.slice(0, 50),
      customerMessage: cleanMessage(input.message ?? "LUOFILM membership"),
    }),
  });
  reject(r);
  return { internal_reference: depositId, provider: p.provider, authorizationUrl: r?.authorizationUrl ?? null };
}

export async function payout(input: { phone: string; amount: number; currency: string; reference: string; message?: string | undefined; provider?: string | undefined }) {
  const p = await resolveProvider(input.phone, input.provider);
  const payoutId = crypto.randomUUID();
  const r = await call("/v2/payouts", {
    method: "POST",
    body: JSON.stringify({
      payoutId,
      amount: amountStr(input.amount),
      currency: input.currency,
      recipient: { type: "MMO", accountDetails: { phoneNumber: p.phoneNumber, provider: p.provider } },
      clientReferenceId: input.reference.slice(0, 50),
      customerMessage: cleanMessage(input.message ?? "LUOFILM payout"),
    }),
  });
  reject(r);
  return { internal_reference: payoutId, provider: p.provider };
}

/** Turns PawaPay failure codes into plain words the customer understands. */
function failText(f: any): string {
  const code = String(f?.failureCode ?? "").toUpperCase();
  const map: Record<string, string> = {
    INSUFFICIENT_BALANCE: "Not enough money on your mobile money account.",
    PAYER_LIMIT_REACHED: "Your mobile money limit was reached.",
    PAYMENT_NOT_APPROVED: "The payment was not approved on your phone.",
    PAYER_NOT_FOUND: "This number isn't registered for mobile money on that network.",
    UNSPECIFIED_FAILURE: "The network declined the payment.",
    WALLET_LIMIT_REACHED: "Your mobile money limit was reached.",
  };
  return map[code] ?? String(f?.failureMessage ?? "Payment failed");
}

export async function status(kind: "deposits" | "payouts", id: string) {
  const r = await call(`/v2/${kind}/${encodeURIComponent(id)}`);
  if (r?.status === "NOT_FOUND") return { status: "pending", message: "Waiting for confirmation", authorizationUrl: null };
  const d = r?.data ?? {};
  const s = String(d.status ?? "").toUpperCase();
  if (s === "COMPLETED") return { status: "success", message: "Payment received", authorizationUrl: null };
  if (s === "FAILED")
    return { status: "failed", message: failText(d.failureReason), authorizationUrl: null };
  return { status: "pending", message: "Approve the prompt on your phone", authorizationUrl: d.authorizationUrl ?? null };
}

export async function balances() {
  const r = await call("/v2/wallet-balances");
  return (Array.isArray(r?.balances) ? r.balances : []).map((b: any) => ({
    country: String(b.country ?? ""),
    currency: String(b.currency ?? ""),
    balance: Number(b.balance),
  }));
}

/** Every country (ISO3) enabled on this PawaPay account, with its live networks and logos. */
export async function activeCountries(): Promise<Record<string, { provider: string; displayName: string; logo: string }[]>> {
  const r = await call(`/v2/active-conf?operationType=DEPOSIT`);
  const out: Record<string, { provider: string; displayName: string; logo: string }[]> = {};
  for (const c of r?.countries ?? []) {
    const list = (c?.providers ?? []).map((p: any) => ({ provider: String(p.provider), displayName: String(p.displayName ?? p.provider), logo: p.logo ? String(p.logo) : "" }));
    if (c?.country && list.length) out[String(c.country)] = list;
  }
  return out;
}
