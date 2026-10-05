import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const moneySchema = z.object({
  phone: z.string().min(6),
  amount: z.number().positive(),
  currency: z.string().length(3),
  reference: z.string().min(1),
  message: z.string().optional(),
  provider: z.string().regex(/^[A-Z0-9_]{3,40}$/).optional(),
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

export const pawaPredict = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ phone: z.string().min(8).max(20) }).parse(d))
  .handler(async ({ data }) => {
    const { predictProvider } = await import("./pawapay.server");
    try {
      return { ok: true as const, ...(await predictProvider(data.phone)) };
    } catch {
      return { ok: false as const, provider: "", phoneNumber: "", country: "" };
    }
  });

export const pawaProviders = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ country: z.string().regex(/^[A-Z]{3}$/) }).parse(d))
  .handler(async ({ data }) => {
    const { activeProviders } = await import("./pawapay.server");
    try {
      return await activeProviders(data.country);
    } catch {
      return [] as { provider: string; displayName: string; logo: string }[];
    }
  });

export const pawaCountries = createServerFn({ method: "GET" }).handler(async () => {
  const { activeCountries } = await import("./pawapay.server");
  try {
    return { ok: true as const, countries: await activeCountries() };
  } catch {
    return { ok: false as const, countries: {} as Record<string, { provider: string; displayName: string; logo: string }[]> };
  }
});
