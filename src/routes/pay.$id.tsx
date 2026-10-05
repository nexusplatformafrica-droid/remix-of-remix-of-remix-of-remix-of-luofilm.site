import { useMomoNetwork } from "@/hooks/usePawaPredict";
import { MomoPayButton, momoFailState } from "@/components/auth/MomoPayButton";
import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, Loader2, ShieldCheck, Smartphone, Wallet } from "lucide-react";
import { getTx, startMobileMoney, syncTransaction, startCardSession, syncCardPayment, syncPayPalPayment } from "@/lib/payments";
import { formatMoney, isValidMsisdn } from "@/lib/relworx";
import { countryByCurrency } from "@/lib/countries";
import type { Row } from "@/lib/fdb";
import { PayPalButtons } from "@/components/auth/PayPalButtons";
import { lazy, Suspense } from "react";
const WhopEmbed = lazy(() => import("@/components/auth/WhopEmbed"));

export const Route = createFileRoute("/pay/$id")({
  head: () => ({
    meta: [
      { title: "Complete your payment — LUOFILM.SITE" },
      { name: "description", content: "Finish your LUOFILM membership payment with Mobile Money, card, Google Pay, Apple Pay or PayPal." },
      { property: "og:title", content: "Complete your payment — LUOFILM.SITE" },
      {
        property: "og:description",
        content: "Finish your LUOFILM membership payment with Mobile Money, card, Google Pay, Apple Pay or PayPal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PayPage,
});

type Method = "mobile_money" | "card" | "google_pay" | "apple_pay" | "paypal";

const METHODS: { id: Method; label: string; icon: typeof Smartphone }[] = [
  { id: "mobile_money", label: "Mobile Money", icon: Smartphone },
  { id: "card", label: "Card", icon: CreditCard },
  { id: "google_pay", label: "Google Pay", icon: Wallet },
  { id: "apple_pay", label: "Apple Pay", icon: Wallet },
  { id: "paypal", label: "PayPal", icon: Wallet },
];

function PayPage() {
  const { id } = Route.useParams();
  const [tx, setTx] = useState<Row | null>(null);
  const [method, setMethod] = useState<Method>("mobile_money");
  const [phone, setPhone] = useState("");
  const [phase, setPhase] = useState<"idle" | "waiting" | "done" | "failed">("idle");
  const [status, setStatus] = useState("");
  const [whopUrl, setWhopUrl] = useState<string | null>(null);
  const started = useRef(false);

  const [paypalBack, setPaypalBack] = useState(false);
  const country = countryByCurrency(String(tx?.currency ?? "UGX"));
  const network = useMomoNetwork(phone, country);
  const detected = network.name;

  useEffect(() => {
    void getTx(id).then((row) => {
      setTx(row);
      if (!row) setStatus("This payment link is not valid.");
    });
    const q = new URLSearchParams(window.location.search);
    if (q.get("paypal") === "return") {
      setMethod("paypal");
      setPaypalBack(true);
      setPhase("waiting");
      setStatus("Confirming your PayPal payment…");
    } else if (q.get("paypal") === "cancel") {
      setMethod("paypal");
      setStatus("PayPal payment was cancelled. No money was taken.");
    } else if (q.get("whop") === "return") {
      setMethod("card");
      setWhopUrl("return");
      setPhase("waiting");
      setStatus("Confirming your card payment…");
    }
  }, [id]);

  // PayPal: after the buyer approves, capture and activate.
  useEffect(() => {
    if (!paypalBack || phase === "done") return;
    const run = () =>
      void syncPayPalPayment(id).then((r) => {
        if (r.status === "completed") {
          setPhase("done");
          setStatus("Payment confirmed. Your membership is active on all your devices.");
        } else if (r.status === "failed") {
          setPhase("failed");
          setStatus(r.message);
        } else setStatus(r.message);
      });
    run();
    const timer = window.setInterval(run, 3000);
    return () => window.clearInterval(timer);
  }, [paypalBack, phase, id]);

  // Mobile money polling.
  useEffect(() => {
    if (phase !== "waiting" || method !== "mobile_money") return;
    const timer = window.setInterval(() => {
      void syncTransaction(id).then((r) => {
        if (r.status === "completed") {
          setPhase("done");
          setStatus("Payment confirmed. Your membership is active on all your devices.");
        } else if (r.status === "failed" || r.status === "expired") {
          setPhase("failed");
          setStatus(r.message);
        } else setStatus(r.message);
      });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [phase, id, method]);

  // Card / wallet polling while the embedded checkout is open.
  useEffect(() => {
    if (!whopUrl || phase === "done") return;
    const timer = window.setInterval(() => {
      void syncCardPayment(id).then((r) => {
        if (r.status === "completed") {
          setPhase("done");
          setStatus("Payment confirmed. Your membership is active on all your devices.");
        } else if (r.status === "failed") {
          setPhase("failed");
          setStatus(r.message);
        }
      });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [whopUrl, phase, id]);

  const sendMobileMoney = async () => {
    if (!tx || started.current) return;
    if (!isValidMsisdn(phone)) {
      setStatus("Enter a valid MTN or Airtel number, e.g. 770 123 456");
      return;
    }
    started.current = true;
    setPhase("waiting");
    setStatus("Sending the payment request to your phone…");
    try {
      await startMobileMoney(tx, phone, network.code);
      setStatus("Approve the prompt on your phone to finish.");
    } catch (err) {
      started.current = false;
      setPhase("failed");
      setStatus(err instanceof Error ? err.message : "Could not start the payment.");
    }
  };

  const openWhop = async () => {
    if (!tx || started.current) return;
    started.current = true;
    setPhase("waiting");
    setStatus("Loading the secure payment form…");
    try {
      setWhopUrl((await startCardSession(tx)).sessionId);
      setStatus("Complete the payment in the secure form below.");
    } catch (err) {
      started.current = false;
      setPhase("failed");
      setStatus(err instanceof Error ? err.message : "Could not start the card payment.");
    }
  };

  const isWallet = method === "card" || method === "google_pay" || method === "apple_pay";

  return (
    <main className="grid min-h-screen place-items-center bg-[linear-gradient(160deg,oklch(0.98_0.02_20),oklch(0.97_0.03_320)_45%,oklch(0.98_0.03_80))] px-4 py-10 text-[oklch(0.28_0.03_320)]">
      <section className="w-full max-w-[420px] rounded-[28px] bg-white/70 p-6 shadow-2xl ring-1 ring-black/5 backdrop-blur">
        <h1 className="text-[20px] font-black tracking-tight">Complete your payment</h1>
        <p className="mt-1 text-[12px] opacity-65">LUOFILM.SITE membership</p>

        {tx ? (
          <>
            <div className="mt-4 rounded-2xl bg-[linear-gradient(120deg,oklch(0.88_0.07_75),oklch(0.82_0.1_65))] p-4">
              <p className="text-[11px] opacity-70">Plan</p>
              <p className="text-[17px] font-black leading-tight">{String(tx.plan_name ?? "Membership")}</p>
              <p className="mt-2 text-[24px] font-black leading-none">
                {formatMoney(Number(tx.amount), String(tx.currency ?? "UGX"))}
              </p>
            </div>

            {phase !== "done" && !whopUrl && !paypalBack && (
              <div className="mt-4">
                <p className="text-[11px] font-semibold opacity-70">Payment method</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {METHODS.map((m) => {
                    const Icon = m.icon;
                    const active = method === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setMethod(m.id);
                          setStatus("");
                          setPhase("idle");
                          started.current = false;
                        }}
                        className={`flex h-11 items-center justify-center gap-2 rounded-2xl text-[12px] font-bold ring-1 transition ${
                          active
                            ? "bg-[linear-gradient(100deg,oklch(0.97_0.05_95),oklch(0.88_0.11_82))] text-[oklch(0.3_0.06_60)] ring-[oklch(0.82_0.1_65)]"
                            : "bg-white/60 text-[oklch(0.4_0.04_320)] ring-black/10 hover:ring-black/20"
                        }`}
                      >
                        <Icon className="size-4" />
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {phase !== "done" && method === "mobile_money" && (
              <div className="mt-4">
                <label className="text-[11px] font-semibold opacity-70">Mobile money number</label>
                <input
                  value={phone}
                  onChange={(e) => {
                    let d = e.target.value.replace(/[^0-9]/g, "");
                    if (d.startsWith(country.dial) && d.length > country.localLength) d = d.slice(country.dial.length);
                    setPhone(d.replace(/^0+/, "").slice(0, country.localLength));
                  }}
                  inputMode="tel"
                  placeholder="770 123 456"
                  disabled={phase === "waiting"}
                  className="mt-1 h-11 w-full rounded-2xl bg-white px-4 text-sm outline-none ring-1 ring-black/10 focus:ring-2 focus:ring-[oklch(0.82_0.1_65)]"
                />
              </div>
            )}

            {status && (
              <p className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed opacity-80">
                {phase === "waiting" && <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />}
                {phase === "done" && <ShieldCheck className="mt-0.5 size-4 shrink-0" />}
                {status}
              </p>
            )}

            {method === "mobile_money" && (
              <MomoPayButton
                className="mt-5"
                name={detected}
                logo={network.logo}
                checking={network.checking && phase !== "waiting"}
                state={phase === "waiting" ? "waiting" : phase === "done" ? "success" : phase === "failed" ? momoFailState(status) : "idle"}
                onClick={() => {
                  if (phase === "failed") started.current = false;
                  void sendMobileMoney();
                }}
              />
            )}

            {phase !== "done" && method === "paypal" && !paypalBack && tx && (
              <PayPalButtons
                tx={tx}
                onApproved={() => {
                  setPaypalBack(true);
                  setPhase("waiting");
                  setStatus("Confirming your PayPal payment…");
                }}
                onError={(m) => {
                  setPhase("failed");
                  setStatus(m);
                }}
              />
            )}

            {phase !== "done" && isWallet && !whopUrl && phase === "waiting" && (
              <div className="mt-5 flex h-12 w-full animate-pulse items-center justify-center gap-2 rounded-full bg-[oklch(0.92_0.04_80)]">
                <CreditCard className="size-4 opacity-40" />
                <div className="h-3 w-32 rounded-full bg-[oklch(0.85_0.06_75)]" />
              </div>
            )}

            {phase !== "done" && isWallet && !whopUrl && phase !== "waiting" && (
              <button
                type="button"
                onClick={() => void openWhop()}
                className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(100deg,oklch(0.97_0.05_95),oklch(0.88_0.11_82))] text-[15px] font-bold text-[oklch(0.3_0.06_60)] shadow-[0_12px_28px_-14px_oklch(0.8_0.12_75)] transition hover:brightness-105 disabled:opacity-60"
              >
                <CreditCard className="size-4" />
                {method === "google_pay"
                    ? "Pay with Google Pay"
                    : method === "apple_pay"
                      ? "Pay with Apple Pay"
                      : "Pay by card"}
              </button>
            )}

            {whopUrl && whopUrl !== "return" && phase !== "done" && (
<div className="mt-4 min-h-[420px] rounded-2xl bg-white ring-1 ring-black/10"><Suspense fallback={null}><WhopEmbed sessionId={whopUrl} /></Suspense></div>
            )}

            <a
              href="/"
              className="mt-3 block text-center text-[11px] font-semibold opacity-60 hover:opacity-100"
            >
              Back to LUOFILM
            </a>
          </>
        ) : (
          <p className="mt-6 text-[13px] opacity-70">{status || "Loading payment…"}</p>
        )}
      </section>
    </main>
  );
}
