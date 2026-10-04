import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BadgeCheck,
  Ban,
  CreditCard,
  Crown,
  Gem,
  Loader2,
  MonitorPlay,
  QrCode,
  Smartphone,
  Sparkles,
  Wallet,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DEFAULT_PLANS, getPlans } from "@/lib/admin";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import {
  createPaymentIntent,
  expireTx,
  startMobileMoney,
  syncTransaction,
  type PayPlan,
  startCardCheckout,
  syncCardPayment,
  syncPayPalPayment,
} from "@/lib/payments";
import {
  convertPrice,
  hasMobileMoney,
  resolveCountry,
  flagUrl,
  formatAmount,
  isValidFor,
  phoneFormat,
  priceNotice,
} from "@/lib/countries";
import type { Row } from "@/lib/fdb";
import { PaymentFailedModal } from "@/components/auth/PaymentFailedModal";
import { detectVisitorGeo } from "@/lib/geo.functions";
import { PayPalButtons } from "@/components/auth/PayPalButtons";
import { ApplePayLogo, CardLogo, GooglePayLogo, MobileMoneyLogo, PayPalLogo } from "@/components/auth/PaymentLogos";

const TAGS: Record<string, string> = { daily: "Try it", "s-monthly": "Popular" };


const PERKS = [
  { icon: Sparkles, label: "Premium contents" },
  { icon: MonitorPlay, label: "720P / 1080P / 4K quality" },
  { icon: Ban, label: "No ads" },
];

type Phase = "idle" | "phone" | "card" | "waiting" | "done" | "failed";

type ModalMethod = "mobile_money" | "card" | "google_pay" | "apple_pay" | "paypal";

const METHODS: Array<{ id: ModalMethod; label: string }> = [
  { id: "mobile_money", label: "Mobile Money" },
  { id: "card", label: "Card" },
  { id: "google_pay", label: "Google Pay" },
  { id: "apple_pay", label: "Apple Pay" },
  { id: "paypal", label: "PayPal" },
];


export function SubscribeModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user, profile } = useAuth();
  const { refreshSubscription } = useSubscription();
  const [tier, setTier] = useState<"vip" | "svip">("vip");
  const [selected, setSelected] = useState("monthly");
  const [phase, setPhase] = useState<Phase>("idle");
  const [paypalTx, setPaypalTx] = useState<Row | null>(null);
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("");
  const [qr, setQr] = useState("");
  const [showScan, setShowScan] = useState(false);
  const [method, setMethod] = useState<ModalMethod>("mobile_money");
  const [whopUrl, setWhopUrl] = useState("");
  const geoQ = useQuery({
    queryKey: ["visitor-geo"],
    queryFn: () => detectVisitorGeo(),
    staleTime: 3_600_000,
  });
  const geo = geoQ.data?.geo ?? null;
  const ipCode = geo?.code ?? "UG";
  const country = resolveCountry(ipCode, geo, geoQ.data?.rates ?? null);
  const momo = hasMobileMoney(country.code);
  const methods = METHODS.filter((m) => momo || m.id !== "mobile_money");
  const settings = useQuery({ queryKey: ["plans"], queryFn: getPlans });
  const source = settings.data ?? DEFAULT_PLANS;

  const liveTx = useRef<Row | null>(null);
  const linkTx = useRef<Row | null>(null);

  const TIERS = {
    vip: { label: "VIP Member", blurb: "Phones, tablets and computers", icon: Gem, plans: source.vip },
    svip: {
      label: "SVIP Member",
      blurb: "Everything in VIP + TV viewing + SVIP theater",
      icon: Crown,
      plans: source.svip,
    },
  };

  const active = TIERS[tier];
  const raw = active.plans.find((p) => p.id === selected) ?? active.plans[0]!;
  const plan: PayPlan = {
    id: raw.id,
    name: raw.name,
    price: raw.price,
    days: raw.days,
    tier,
    devices: Number(raw.devices ?? 1) || 1,
  };
  /** Same plan, priced in the buyer's own currency. */
  const localPrice = convertPrice(plan.price, country);
  const notice = priceNotice(localPrice, country);
  const [failOpen, setFailOpen] = useState(false);

  useEffect(() => {
    if (!momo && method === "mobile_money") setMethod("card");
  }, [momo, method]);

  useEffect(() => {
    if (!profile?.phone || phone) return;
    setPhone(String(profile.phone));
  }, [profile, phone]);

  /** Mints a scannable pay-on-another-device link for the selected plan. */
  const mintLink = useCallback(async () => {
    if (!user || !open) return;
    try {
      if (linkTx.current) await expireTx(String(linkTx.current.id)).catch(() => {});
      const tx = await createPaymentIntent({
        userId: user.id,
        plan,
        method: "link",
        currency: country.currency,
        amount: localPrice,
      });
      linkTx.current = tx;
      const url = `${window.location.origin}/pay/${tx.id}`;
      const QRCode = (await import("qrcode")).default;
      setQr(await QRCode.toDataURL(url, { margin: 1, width: 240 }));
    } catch {
      setQr("");
    }
    // plan identity is what matters, not the object reference
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, open, plan.id, plan.price, country.currency, localPrice]);


  useEffect(() => {
    if (open && phase === "idle") void mintLink();
  }, [open, phase, mintLink]);

  useEffect(() => {
    if (!open) {
      setPhase("idle");
      setStatus("");
      setWhopUrl("");
      setPaypalTx(null);
      liveTx.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open || !user || method !== "paypal" || phase !== "idle" || paypalTx) return;
    let cancelled = false;
    setStatus("Loading the secure PayPal button…");
    void createPaymentIntent({
      userId: user.id,
      plan,
      method: "paypal",
      currency: country.currency,
      amount: localPrice,
    })
      .then((tx) => {
        if (cancelled) return;
        setPaypalTx(tx);
        setPhase("card");
        setStatus("Pay securely with the PayPal button below.");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPhase("failed");
        setStatus(err instanceof Error ? err.message : "Could not start PayPal.");
      });
    return () => {
      cancelled = true;
    };
    // Create one pending transaction for the selected PayPal plan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id, method, phase, paypalTx, plan.id, country.currency, localPrice]);

  /** One-second poll so paying on a second device also completes here. */
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => {
      void (async () => {
        const tx = liveTx.current ?? linkTx.current;
        if (!tx) return;
        const result =
          method === "mobile_money"
            ? await syncTransaction(String(tx.id)).catch(() => null)
            : method === "paypal" && liveTx.current
              ? await syncPayPalPayment(String(tx.id)).catch(() => null)
              : await syncCardPayment(String(tx.id)).catch(() => null);
        if (!result) return;
        if (result.status === "completed") {
          setPhase("done");
          setStatus("Payment confirmed — enjoy your membership.");
          refreshSubscription();
          toast.success("Membership activated");
          window.setTimeout(() => onOpenChange(false), 1600);
        } else if (result.status === "failed") {
          setPhase("failed");
          setStatus(result.message);
          setFailOpen(true);
        } else if (phase === "waiting") {
          setStatus(result.message);
        }
      })();
    }, 1000);
    return () => window.clearInterval(id);
  }, [open, phase, method, onOpenChange, refreshSubscription]);

  const pay = async () => {
    if (!user) return;
    if (!isValidFor(phone, country)) {
      toast.error(`Enter a valid ${country.name} mobile money number`);
      return;
    }
    if (notice) {
      toast.error(
        notice === "low"
          ? `This plan is below the ${country.currency} minimum of ${country.min.toLocaleString()}`
          : `This plan is above the ${country.currency} maximum of ${country.max.toLocaleString()}`,
      );
      return;
    }
    setPhase("waiting");
    setStatus("Sending the payment request to your phone…");
    try {
      const tx = await createPaymentIntent({
        userId: user.id,
        plan,
        method: "mobile_money",
        currency: country.currency,
        amount: localPrice,
      });
      liveTx.current = await startMobileMoney(tx, phone);
      setStatus("Approve the prompt on your phone to finish.");

    } catch (err) {
      setPhase("failed");
      setStatus(err instanceof Error ? err.message : "Could not start the payment.");
      setFailOpen(true);
    }
  };

  /** Starts a Whop one-click checkout and opens it in a new tab. */
  const payCard = async () => {
    if (!user) return;
    setPhase("waiting");
    setStatus("Preparing the secure payment page…");
    if (method === "paypal") {
      try {
        const tx = await createPaymentIntent({ userId: user.id, plan, method, currency: country.currency, amount: localPrice });
        setPaypalTx(tx);
        setPhase("card");
        setStatus("Tap the PayPal button below to pay — you stay on this page.");
      } catch (err) {
        setPhase("failed");
        setStatus(err instanceof Error ? err.message : "Could not start PayPal.");
        setFailOpen(true);
      }
      return;
    }
    // Open the tab right away so pop-up blockers allow it.
    const win = window.open("about:blank", "_blank");
    try {
      const tx = await createPaymentIntent({
        userId: user.id,
        plan,
        method,
        currency: country.currency,
        amount: localPrice,
      });
      liveTx.current = tx;
      const url = await startCardCheckout(tx);
      if (win) win.location.href = url;
      else window.open(url, "_blank");
      setWhopUrl(url);
      setPhase("card");
      setStatus("Finish the payment in the new tab — this page updates automatically once it's confirmed.");
    } catch (err) {
      setPhase("failed");
      win?.close();
      setStatus(err instanceof Error ? err.message : "Could not start the card payment.");
      setFailOpen(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] w-[calc(100vw-1.25rem)] max-w-[350px] overflow-hidden rounded-[22px] border-0 bg-[linear-gradient(160deg,oklch(0.98_0.02_20),oklch(0.97_0.03_320)_45%,oklch(0.98_0.03_80))] p-0 text-[oklch(0.28_0.03_320)] shadow-2xl sm:max-w-[760px] sm:rounded-lg">
        <DialogHeader className="sr-only">
          <DialogTitle>Choose your membership</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2.5 bg-[linear-gradient(100deg,oklch(0.95_0.05_10),oklch(0.95_0.05_320))] px-4 py-2.5 sm:gap-3 sm:px-5 sm:py-4">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-white/70 text-[oklch(0.6_0.16_20)] shadow-inner sm:size-10">
            <Crown className="size-4 sm:size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-bold sm:text-[15px]">Membership</p>
            <p className="truncate text-[11px] opacity-70 sm:text-[12px]">
              Unlock every movie, series and episode.
            </p>
          </div>
        </div>

        <div className="grid min-w-0 gap-0 overflow-hidden md:max-h-[calc(88vh-72px)] md:grid-cols-[1fr_260px] md:overflow-y-auto">
          <div className="min-w-0 p-3 sm:p-5">

            <div className="grid grid-cols-2 overflow-hidden rounded-2xl bg-white/60 p-1 shadow-sm">
              {(Object.keys(TIERS) as Array<"vip" | "svip">).map((k) => {
                const T = TIERS[k];
                const Icon = T.icon;
                const on = tier === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setTier(k);
                      setSelected(TIERS[k].plans[0]!.id);
                      setPhase("idle");
                      setPaypalTx(null);
                    }}
                    className={`rounded-xl px-3 py-2 text-left transition ${
                      on ? "bg-white shadow-[0_6px_18px_-10px_rgba(0,0,0,0.4)]" : "opacity-60 hover:opacity-90"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-[14px] font-bold">
                      <Icon
                        className={`size-4 ${k === "svip" ? "text-[oklch(0.6_0.2_300)]" : "text-[oklch(0.7_0.15_30)]"}`}
                      />
                      {T.label}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] opacity-70">{T.blurb}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 sm:mt-4 sm:gap-3">
              {active.plans.map((p) => {
                const on = selected === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelected(p.id);
                      setPhase("idle");
                      setPaypalTx(null);
                    }}
                    className={`relative min-w-0 rounded-xl px-1 pb-2 pt-5 text-center transition sm:rounded-2xl sm:px-3 sm:pb-4 sm:pt-6 ${
                      on
                        ? "bg-[linear-gradient(170deg,oklch(0.97_0.05_60),oklch(0.93_0.08_35))] ring-2 ring-[oklch(0.8_0.13_50)]"
                        : "bg-white/70 ring-1 ring-black/5 hover:bg-white"
                    }`}
                  >
                    {TAGS[p.id] && (
                      <span className="absolute left-0 top-0 rounded-br-xl rounded-tl-xl bg-[linear-gradient(100deg,oklch(0.72_0.19_25),oklch(0.75_0.17_40))] px-1.5 py-0.5 text-[9px] font-bold text-white sm:rounded-br-2xl sm:rounded-tl-2xl sm:px-2 sm:py-1 sm:text-[10px]">
                        {TAGS[p.id]}
                      </span>
                    )}
                    <p className="truncate text-[10px] font-semibold leading-tight sm:text-[13px]">{p.name}</p>
                    <p className="mt-1 text-[13px] font-black leading-none sm:mt-2 sm:text-[22px]">
                      <span className="text-[9px] font-bold sm:text-[13px]">{country.currency} </span>
                      {formatAmount(convertPrice(p.price, country), "").trim()}
                    </p>

                    <p className="mt-0.5 text-[10px] opacity-70 sm:mt-1 sm:text-[11px]">
                      {p.days === 1 ? "24 hours" : `${p.days} days`}
                    </p>
                    <p className="mt-1 hidden text-[11px] leading-snug opacity-60 sm:mt-2 sm:block">{p.note}</p>
                    <p className="mt-0.5 text-[9px] font-semibold opacity-70 sm:mt-1 sm:text-[10px]">
                      {Number(p.devices ?? 1)} {Number(p.devices ?? 1) === 1 ? "device" : "devices"}
                    </p>

                  </button>
                );
              })}
            </div>


            <div className="mt-3 sm:mt-4">
              <p className="text-[11px] font-semibold opacity-70">
                Payment method
                <span className="ml-1 font-normal opacity-70">
                  · {country.name} ({country.currency})
                </span>
              </p>
              <div className={`mt-1.5 grid gap-1.5 sm:gap-2 ${methods.length >= 4 ? "grid-cols-3 sm:grid-cols-5" : "grid-cols-3"}`}>
                {methods.map((m) => {
                  const on = method === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={phase === "waiting" || phase === "done"}
                      onClick={() => {
                        setMethod(m.id);
                        setPhase("idle");
                        setStatus("");
                        setPaypalTx(null);
                      }}
                      className={`flex h-[52px] flex-col items-center justify-center gap-1 rounded-xl bg-white px-1.5 transition ${
                        on
                          ? "ring-2 ring-[oklch(0.8_0.13_50)] shadow-[0_6px_16px_-10px_rgba(0,0,0,0.5)]"
                          : "opacity-75 ring-1 ring-black/10 hover:opacity-100"
                      }`}
                    >
                      {m.id === "mobile_money" ? (
                        <MobileMoneyLogo providers={country.providers} />
                      ) : m.id === "card" ? (
                        <CardLogo />
                      ) : m.id === "google_pay" ? (
                        <GooglePayLogo />
                      ) : m.id === "paypal" ? (
                        <PayPalLogo />
                      ) : (
                        <ApplePayLogo />
                      )}
                      <span className="text-[9.5px] font-bold leading-none opacity-70">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 hidden rounded-2xl bg-[linear-gradient(120deg,oklch(0.88_0.07_75),oklch(0.82_0.1_65))] p-4 shadow-[0_14px_30px_-18px_rgba(0,0,0,0.6)] sm:mt-4 sm:block">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] opacity-70">Selected Plan</p>
                  <p className="text-[18px] font-black leading-tight">{plan.name}</p>
                </div>
                <div className="grid size-9 place-items-center rounded-xl bg-[oklch(0.35_0.05_70)] text-[oklch(0.88_0.13_85)]">
                  <BadgeCheck className="size-5" />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                {PERKS.map((perk) => (
                  <span key={perk.label} className="flex items-center gap-1.5 text-[12px] font-medium">
                    <span className="grid size-5 place-items-center rounded-full bg-[oklch(0.3_0.04_70)] text-[oklch(0.9_0.12_85)]">
                      <perk.icon className="size-3" />
                    </span>
                    {perk.label}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-black/10 pt-3 text-[12px]">
                <span className="flex items-center gap-1.5 font-semibold">
                  <img
                    src={flagUrl(country)}
                    alt=""
                    className="h-[13px] w-[20px] rounded-[2px] object-cover ring-1 ring-black/10"
                  />
                  {country.name} · {formatAmount(localPrice, country.currency)}
                </span>
                {momo && (
                  <span className="opacity-70">
                    Number format: <span className="font-semibold">{phoneFormat(country)}</span>
                  </span>
                )}
                <span className="opacity-70">{country.providers.join(" · ")}</span>
              </div>
            </div>
          </div>

          <aside className="flex min-w-0 flex-col justify-between border-black/5 bg-white/50 px-3 pb-3 pt-1 sm:p-5 md:border-l">
            <div className="min-w-0">
              <p className="text-[11px] opacity-70 sm:text-[12px]">Payment</p>
              <p className="text-[20px] font-black leading-none sm:text-[30px]">
                {formatAmount(localPrice, country.currency)}
              </p>

              <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold opacity-70">
                <img
                  src={flagUrl(country)}
                  alt=""
                  className="h-[12px] w-[18px] rounded-[2px] object-cover ring-1 ring-black/10"
                />
                {country.name} · {country.currency}
              </p>

              {notice && (
                <p className="mt-2 text-[10.5px] font-semibold leading-snug text-[oklch(0.55_0.18_25)]">
                  {notice === "low"
                    ? `This amount is below the ${country.currency} minimum (${country.min.toLocaleString()}). Pick a longer plan.`
                    : `This amount is above the ${country.currency} maximum (${country.max.toLocaleString()}). Pick a shorter plan.`}
                </p>
              )}

              {phase === "card" && whopUrl && method !== "card" && (
                <div className="mt-3 rounded-2xl bg-white/80 p-4 text-center ring-1 ring-black/10">
                  <Loader2 className="mx-auto size-5 animate-spin opacity-60" />
                  <p className="mt-2 text-[12px] font-semibold">Waiting for your payment…</p>
                  <a
                    href={whopUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block rounded-full bg-[oklch(0.88_0.11_82)] px-4 py-2 text-[11px] font-bold text-[oklch(0.3_0.06_60)]"
                  >
                    Reopen the payment page
                  </a>
                </div>
              )}

              {qr && (phase === "idle" || (phase === "card" && method === "paypal")) && (
                <>
                  <div className="mt-4 hidden rounded-2xl bg-white/80 p-3 text-center ring-1 ring-black/5 md:block">
                    <img src={qr} alt="Scan to pay on your phone" className="mx-auto size-[150px]" />
                    <p className="mt-2 text-[10px] opacity-60">Scan to pay from another device</p>
                  </div>

                  {/* Mobile: the scan code stays collapsed so the sheet keeps its size. */}
                  <button
                    type="button"
                    onClick={() => setShowScan((v) => !v)}
                    className="mt-2 flex w-full items-center justify-between rounded-full bg-white/70 px-3 py-2 text-[11px] font-semibold ring-1 ring-black/5 md:hidden"
                  >
                    <span className="flex items-center gap-1.5">
                      <QrCode className="size-3.5" />
                      {showScan ? "Hide scan code" : "Show scan code"}
                    </span>
                    <span className="opacity-60">{formatAmount(localPrice, country.currency)}</span>
                  </button>
                  {showScan && (
                    <div className="mt-2 rounded-2xl bg-white/80 p-3 text-center ring-1 ring-black/5 md:hidden">
                      <img src={qr} alt="Scan to pay on your phone" className="mx-auto size-[130px]" />
                      <p className="mt-1 text-[10px] opacity-60">
                        {plan.name} · {formatAmount(localPrice, country.currency)}
                      </p>
                    </div>
                  )}
                </>
              )}


              {phase === "phone" && (
                <div className="mt-2 sm:mt-4">
                  <label className="text-[11px] font-semibold opacity-70">
                    <img
                      src={flagUrl(country)}
                      alt=""
                      className="mr-1 inline-block h-[12px] w-[18px] rounded-[2px] object-cover align-[-1px] ring-1 ring-black/10"
                    />
                    {country.name} mobile money number
                  </label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="tel"
                    placeholder={`+${country.dial} …`}
                    className="mt-1 h-10 w-full rounded-2xl bg-white px-4 text-sm outline-none ring-1 ring-black/10 focus:ring-2 focus:ring-[oklch(0.82_0.1_65)] sm:h-11"
                  />
                </div>
              )}

              {(phase === "waiting" || phase === "done" || phase === "failed") && (
                <p className="mt-2 flex items-start gap-2 text-[11.5px] leading-relaxed opacity-75 sm:mt-4 sm:text-[12px]">
                  {phase === "waiting" && <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />}
                  {status}
                </p>
              )}

              {phase === "idle" && (
                <p className="mt-2 text-[10.5px] leading-snug opacity-65 sm:mt-4 sm:text-[11px]">
                  {method === "mobile_money"
                    ? `Pay with ${country.providers.join(", ")}. Your membership starts the moment payment is confirmed.`
                    : "Pay securely with your card or wallet. Your membership starts the moment payment is confirmed."}
                </p>
              )}
            </div>


            <div className="mt-3 sm:mt-6">
              {method === "paypal" && paypalTx && phase !== "done" && (
                <PayPalButtons
                  tx={paypalTx}
                  onApproved={() => {
                    liveTx.current = paypalTx;
                    setPhase("waiting");
                    setStatus("Confirming your PayPal payment…");
                  }}
                  onError={(m) => {
                    setPhase("failed");
                    setStatus(m);
                  }}
                />
              )}
              {method === "card" && cardSession && phase === "card" && (
                <Suspense fallback={<Loader2 className="mx-auto size-5 animate-spin opacity-60" />}>
                  <div className="overflow-hidden rounded-xl">
                    <WhopEmbed
                      sessionId={cardSession}
                      onDone={() => {
                        setPhase("waiting");
                        setStatus("Confirming your card payment…");
                      }}
                    />
                  </div>
                </Suspense>
              )}
              {method !== "paypal" && !(method === "card" && phase === "card") && <button
                type="button"
                disabled={phase === "waiting" || phase === "done"}
                onClick={() => {
                  if (phase === "idle" || phase === "failed") {
                    if (method === "mobile_money") setPhase("phone");
                    else void payCard();
                  } else if (phase === "phone") void pay();
                }}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(100deg,oklch(0.97_0.05_95),oklch(0.88_0.11_82))] text-[14px] font-bold text-[oklch(0.3_0.06_60)] shadow-[0_12px_28px_-14px_oklch(0.8_0.12_75)] transition hover:brightness-105 disabled:opacity-60 sm:h-12 sm:text-[15px]"
              >
                {phase === "phone" && <Smartphone className="size-4" />}
                {phase === "waiting"
                  ? "Waiting for payment…"
                  : phase === "done"
                    ? "Activated"
                    : phase === "card"
                      ? "Waiting for card payment…"
                      : phase === "phone"
                        ? "Send payment request"
                        : phase === "failed"
                          ? "Try again"
                          : method === "mobile_money"
                            ? "Continue to Pay"
                            : `Pay with ${METHODS.find((m) => m.id === method)?.label}`}
              </button>}
              <p className="mt-2 text-center text-[9.5px] opacity-55 sm:mt-3 sm:text-[10px]">
                By continuing you agree to the Membership Agreement.
              </p>
            </div>

          </aside>
        </div>
      </DialogContent>

      <PaymentFailedModal
        open={failOpen}
        onOpenChange={setFailOpen}
        message={status}
        onRetry={() => {
          setFailOpen(false);
          setPhase("phone");
          setStatus("");
        }}
      />
    </Dialog>
  );
}
