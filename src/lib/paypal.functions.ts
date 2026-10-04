import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createPayPalOrder, payPalOrderState } from "./paypal.server";

const startSchema = z.object({
  txId: z.string().min(1).max(80),
  reference: z.string().min(1).max(120),
  planName: z.string().min(1).max(80),
  amount: z.number().positive(),
  currency: z.string().length(3),
  origin: z.string().url().max(200),
});

/** Starts a PayPal checkout for a pending transaction. */
export const startPayPalCheckout = createServerFn({ method: "POST" })
  .inputValidator((d) => startSchema.parse(d))
  .handler(async ({ data }) => {
    // Only send the buyer back to an https site (or the local preview).
    const o = new URL(data.origin);
    const origin =
      o.protocol === "https:" || o.hostname === "localhost"
        ? o.origin
        : (process.env["SITE_URL"] ?? "https://luofilm.site");
    try {
      const r = await createPayPalOrder({
        ...data,
        returnUrl: `${origin}/pay/${data.txId}?paypal=return`,
        cancelUrl: `${origin}/pay/${data.txId}?paypal=cancel`,
      });
      return { ok: true as const, orderId: r.orderId, url: r.approveUrl, currency: r.charged.currency, message: "" };
    } catch (err) {
      console.error("[paypal] checkout failed", err);
      return {
        ok: false as const,
        orderId: "",
        url: "",
        currency: "USD",
        message: err instanceof Error ? err.message : "PayPal could not start.",
      };
    }
  });

/** Checks (and captures once approved) the PayPal order for a transaction. */
export const checkPayPalPayment = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ txId: z.string().min(1).max(80), orderId: z.string().min(5).max(64) }).parse(d))
  .handler(async ({ data }) => {
    try {
      const r = await payPalOrderState(data.orderId, data.txId);
      return { paid: r.state === "paid", failed: r.state === "failed", captureId: r.captureId, message: r.message };
    } catch (err) {
      console.error("[paypal] check failed", err);
      return { paid: false, failed: false, captureId: null, message: "Waiting for PayPal" };
    }
  });
