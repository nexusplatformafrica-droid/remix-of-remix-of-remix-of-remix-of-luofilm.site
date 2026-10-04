/**
 * Server-side PayPal (live) helper. The client ID is public; the secret is
 * read from the private PAYPAL_CLIENT_SECRET value inside each call so it is
 * never shipped to the browser.
 */
export const PAYPAL_CLIENT_ID =
  "BAA1V2BeV9eEaiwruLcISfdK1zxmx4PMVhKGFzdThPHBHHtMWH6DXBcnxaIpHu1smiJ_Xz39y27jT5-bwg";
const PAYPAL_API = "https://api-m.paypal.com";

// Currencies PayPal can charge in. Anything else is converted to USD.
const SUPPORTED = new Set([
  "AUD", "BRL", "CAD", "CNY", "CZK", "DKK", "EUR", "HKD", "ILS", "MYR", "MXN",
  "NZD", "NOK", "PHP", "PLN", "GBP", "SGD", "SEK", "CHF", "THB", "USD", "JPY",
]);
const ZERO_DECIMAL = new Set(["JPY"]);

async function token() {
  const secret = process.env["PAYPAL_CLIENT_SECRET"];
  if (!secret) throw new Error("PayPal is not configured yet.");
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${PAYPAL_CLIENT_ID}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string };
  if (!res.ok || !json.access_token) throw new Error("PayPal sign-in failed.");
  return json.access_token;
}

async function call<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(`${PAYPAL_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

type Order = {
  id: string;
  status?: string;
  links?: { href: string; rel: string }[];
  purchase_units?: {
    custom_id?: string;
    amount?: { value?: string; currency_code?: string };
    payments?: { captures?: { id: string; status?: string; amount?: { value?: string; currency_code?: string } }[] };
  }[];
  details?: { issue?: string; description?: string }[];
  message?: string;
};

/** Converts the buyer's local price into a currency PayPal accepts. */
async function chargeAmount(amount: number, currency: string) {
  const cur = currency.toUpperCase();
  if (SUPPORTED.has(cur)) {
    const v = ZERO_DECIMAL.has(cur) ? Math.round(amount).toString() : (Math.round(amount * 100) / 100).toFixed(2);
    return { currency: cur, value: v };
  }
  const { usdRate } = await import("./geo.server");
  const perUsd = await usdRate(cur);
  const usd = Math.max(1, Math.round((amount / (perUsd || 1)) * 100) / 100);
  return { currency: "USD", value: usd.toFixed(2) };
}

export async function createPayPalOrder(input: {
  txId: string;
  reference: string;
  planName: string;
  amount: number;
  currency: string;
  returnUrl: string;
  cancelUrl: string;
}) {
  const price = await chargeAmount(input.amount, input.currency);
  const res = await call<Order>("/v2/checkout/orders", {
    method: "POST",
    headers: { "PayPal-Request-Id": `luo-${input.txId}` },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.reference.slice(0, 120),
          custom_id: input.txId,
          description: `LUOFILM ${input.planName}`.slice(0, 120),
          amount: { currency_code: price.currency, value: price.value },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "LUOFILM",
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    }),
  });
  if (!res.ok || !res.data.id) {
    console.error("[paypal] create order failed", res.status, JSON.stringify(res.data).slice(0, 500));
    throw new Error(res.data.details?.[0]?.description ?? "PayPal could not start the payment.");
  }
  const approve = res.data.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
  if (!approve) throw new Error("PayPal did not return a payment page.");
  return { orderId: res.data.id, approveUrl: approve, charged: price };
}

export type PayPalState = { state: "paid" | "failed" | "pending"; captureId: string | null; message: string };

/**
 * Reads the order; captures it once the buyer approved. Only a COMPLETED
 * capture for this exact transaction counts as paid.
 */
export async function payPalOrderState(orderId: string, txId: string): Promise<PayPalState> {
  let res = await call<Order>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
  if (!res.ok) return { state: "pending", captureId: null, message: "Waiting for PayPal" };
  if (res.data.purchase_units?.[0]?.custom_id !== txId) {
    return { state: "failed", captureId: null, message: "This PayPal payment belongs to another order." };
  }
  if (res.data.status === "APPROVED") {
    res = await call<Order>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: "POST",
      headers: { "PayPal-Request-Id": `cap-${orderId}` },
      body: "{}",
    });
    if (!res.ok) {
      const issue = res.data.details?.[0]?.issue ?? "";
      if (issue === "ORDER_ALREADY_CAPTURED") return payPalOrderState(orderId, txId);
      if (issue === "INSTRUMENT_DECLINED") return { state: "failed", captureId: null, message: "PayPal declined the payment. No money was taken." };
      return { state: "pending", captureId: null, message: "Confirming with PayPal…" };
    }
  }
  const capture = res.data.purchase_units?.[0]?.payments?.captures?.[0];
  if (res.data.status === "COMPLETED" && capture && ["COMPLETED", "PENDING"].includes(String(capture.status))) {
    if (capture.status === "PENDING") return { state: "pending", captureId: null, message: "PayPal is reviewing the payment…" };
    return { state: "paid", captureId: capture.id, message: "Payment confirmed" };
  }
  if (res.data.status === "VOIDED") return { state: "failed", captureId: null, message: "PayPal payment was cancelled." };
  return { state: "pending", captureId: null, message: "Complete the payment in the PayPal window" };
}
