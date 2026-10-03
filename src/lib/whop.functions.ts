import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createWhopCheckout, whopPaymentState } from "./whop.server";

const startSchema = z.object({
  txId: z.string().min(1),
  reference: z.string().min(1),
  planName: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().min(3).max(3),
});

/** Starts a Whop card / Apple Pay / Google Pay checkout for a transaction. */
export const startWhopCheckout = createServerFn({ method: "POST" })
  .inputValidator((data) => startSchema.parse(data))
  .handler(async ({ data }) => {
    const origin = process.env["SITE_URL"] ?? "https://luofilm.site";
    try {
      const session = await createWhopCheckout({
        ...data,
        redirectUrl: `${origin}/pay/${data.txId}?whop=return`,
      });
      return {
        ok: true as const,
        sessionId: session.id,
        purchaseUrl: session.purchase_url ?? null,
        message: "",
      };
    } catch (err) {
      console.error("[whop] checkout failed", err);
      return {
        ok: false as const,
        sessionId: "",
        purchaseUrl: null,
        message: err instanceof Error ? err.message : "Card payment could not start.",
      };
    }
  });

/** Asks Whop whether this transaction has been paid. */
export const checkWhopPayment = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ txId: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    try {
      const r = await whopPaymentState(data.txId);
      return { paid: r.state === "paid", failed: r.state === "failed", paymentId: r.paymentId, message: r.message };
    } catch (err) {
      console.error("[whop] payment check failed", err);
      return { paid: false, failed: false, paymentId: null, message: "Waiting for payment" };
    }
  });
