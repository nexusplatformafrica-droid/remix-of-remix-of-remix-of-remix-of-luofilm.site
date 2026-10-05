import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const moneySchema = z.object({
  phone: z.string().min(6),
  amount: z.number().positive(),
  currency: z.string().length(3),
  reference: z.string().min(1),
  message: z.string().optional(),
});

export const pawaDeposit = createServerFn({ method: "POST" })
  .inputValidator((d) => moneySchema.parse(d))
  .handler(async ({ data }) => {
    const { deposit } = await import("./pawapay.server");
    try {
      return { ok: true as const, ...(await deposit(data)), message: "" };
    } catch (e) {
      return { ok: false as const, internal_reference: null, message: e instanceof Error ? e.message : "Payment failed" };
    }
  });

export const pawaPayout = createServerFn({ method: "POST" })
  .inputValidator((d) => moneySchema.parse(d))
  .handler(async ({ data }) => {
    const { payout } = await import("./pawapay.server");
    try {
      return { ok: true as const, ...(await payout(data)), message: "" };
    } catch (e) {
      return { ok: false as const, internal_reference: null, message: e instanceof Error ? e.message : "Payout failed" };
    }
  });

export const pawaStatus = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ kind: z.enum(["deposits", "payouts"]), id: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const { status } = await import("./pawapay.server");
    try {
      return await status(data.kind, data.id);
    } catch (e) {
      return { status: "pending", message: e instanceof Error ? e.message : "Waiting", authorizationUrl: null };
    }
  });

export const pawaBalances = createServerFn({ method: "GET" }).handler(async () => {
  const { balances } = await import("./pawapay.server");
  try {
    return { ok: true as const, balances: await balances() };
  } catch {
    return { ok: false as const, balances: [] as { country: string; currency: string; balance: number }[] };
  }
});

/** Detects the buyer's mobile-money network before a deposit is created. */
export const pawaPredictProvider = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ phone: z.string().min(6).max(20) }).parse(d))
  .handler(async ({ data }) => {
    const { predictProvider } = await import("./pawapay.server");
    try {
      return { ok: true as const, ...(await predictProvider(data.phone)), message: "" };
    } catch (e) {
      return {
        ok: false as const,
        provider: null,
        phoneNumber: null,
        country: null,
        message: e instanceof Error ? e.message : "Could not detect this network",
      };
    }
  });
