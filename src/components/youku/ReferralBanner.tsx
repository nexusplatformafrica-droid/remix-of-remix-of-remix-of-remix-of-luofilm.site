import { useEffect, useState } from "react";
import { Gift, Share2, X, Copy, Check, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { WHATSAPP_PROMPT_CLOSED_EVENT } from "@/components/youku/WhatsAppPrompt";
import { Button } from "@/components/ui/button";
import { referralLink, syncReferrals, type ReferralSummary } from "@/lib/referrals";
import referralArtwork from "@/assets/referral-gold-artwork-natural.png";

const CLOSED_KEY = "luofilm:referral-banner-closed";

/** Floating "share with 10 friends" banner; collapses to an always-visible Share button. */
export function ReferralBanner() {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [ready, setReady] = useState(false);
  const [artworkReady, setArtworkReady] = useState(false);
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const image = new Image();
    image.src = referralArtwork;
    if (image.complete) setArtworkReady(true);
    else {
      image.onload = () => setArtworkReady(true);
      image.onerror = () => setArtworkReady(true);
    }
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    const showAfterWhatsApp = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setReady(true);
        try {
          setExpanded(sessionStorage.getItem(CLOSED_KEY) !== "1");
        } catch {
          setExpanded(true);
        }
      }, 10000);
    };
    window.addEventListener(WHATSAPP_PROMPT_CLOSED_EVENT, showAfterWhatsApp);
    let alreadyJoined = false;
    try {
      alreadyJoined = localStorage.getItem("luofilm:whatsapp-channel-joined") === "1";
    } catch {
      /* storage unavailable */
    }
    if (alreadyJoined) showAfterWhatsApp();
    return () => {
      window.removeEventListener(WHATSAPP_PROMPT_CLOSED_EVENT, showAfterWhatsApp);
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!user) return setSummary(null);
    let alive = true;
    void syncReferrals(user.id).then((s) => alive && setSummary(s)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [user]);

  const link = referralLink(user?.id);
  const message = `🎬 Watch & download free movies, series, Luo and Luganda translated movies on LUOFILM. Join with my link: ${link}`;

  const share = async () => {
    if (!user) {
      window.dispatchEvent(new Event("luofilm:open-auth"));
      toast.info("Sign in first so your friends are counted for you.");
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: "LUOFILM", text: message, url: link });
        return;
      } catch {
        /* cancelled — fall through to WhatsApp */
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener");
  };
  const whatsapp = () => {
    if (!user) return void share();
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener");
  };
  const copy = async () => {
    if (!user) return void share();
    await navigator.clipboard.writeText(link).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  const close = () => {
    setExpanded(false);
    try {
      sessionStorage.setItem(CLOSED_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  if (!ready || !artworkReady) return null;
  const count = summary?.towardNext ?? 0;

  if (!expanded) {
    return (
      <Button
        type="button"
        onClick={() => setExpanded(true)}
        className="fixed bottom-24 left-1/2 z-40 h-11 -translate-x-1/2 rounded-full bg-vip px-5 font-bold text-vip-foreground shadow-xl shadow-vip/25 transition hover:scale-105 hover:bg-vip lg:bottom-6 lg:left-[calc(50%+var(--sidebar-w)/2)]"
        aria-label="Share and get free access"
      >
        <Gift className="size-4" /> Share & earn free access
      </Button>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] grid place-items-center px-3 py-16 animate-in fade-in duration-500 sm:px-6">
      <div className="pointer-events-auto relative w-full max-w-4xl overflow-hidden rounded-lg border border-vip/55 bg-card shadow-2xl shadow-vip/20 animate-in zoom-in-95 duration-500">
        <img
          src={referralArtwork}
          alt="Friends sharing LUOFILM on a phone"
          className="absolute inset-0 size-full object-cover object-center"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/95 to-background/10 sm:via-background/80" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-vip to-transparent" />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={close}
          aria-label="Minimise referral offer"
          className="absolute right-3 top-3 z-20 rounded-full border border-vip/25 bg-background/55 text-foreground backdrop-blur hover:bg-background/80"
        >
          <X className="size-4" />
        </Button>

        <div className="relative z-10 flex min-h-[500px] w-full max-w-xl flex-col justify-center p-6 sm:min-h-[530px] sm:p-10 lg:p-12">
          <div className="mb-5 flex items-center gap-2 text-xs font-bold uppercase text-vip">
            <Sparkles className="size-4" /> LUOFILM rewards
          </div>
          <h2 className="max-w-md text-3xl font-black leading-tight text-foreground sm:text-5xl">
            Share movies.
            <span className="block text-vip">Unlock free access.</span>
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-foreground/80 sm:text-base">
            Invite 10 friends to register and you both receive <strong className="text-foreground">1 free day</strong>. If a friend subscribes, you both receive <strong className="text-vip">1 week free</strong>.
          </p>

          {user && (
            <div className="mt-6 max-w-md rounded-md border border-vip/20 bg-background/55 p-4 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-4 text-xs text-foreground/75">
                <span className="flex items-center gap-1.5 font-semibold"><Users className="size-4 text-vip" /> {count}/10 registered</span>
                <span>{summary?.total ?? 0} total · {summary?.daysEarned ?? 0} days earned</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-foreground/10">
                <div className="h-full rounded-full bg-vip transition-all" style={{ width: `${count * 10}%` }} />
              </div>
            </div>
          )}

          <div className="mt-6 flex max-w-md flex-wrap gap-2">
            <Button type="button" onClick={whatsapp} className="h-12 flex-1 bg-vip px-5 font-bold text-vip-foreground shadow-lg shadow-vip/20 hover:bg-vip/90">
              <WhatsAppIcon className="size-5" /> {user ? "Share on WhatsApp" : "Sign in to share"}
            </Button>
            <Button type="button" variant="outline" size="icon" onClick={() => void share()} aria-label="Share referral link" className="size-12 border-vip/25 bg-background/65 backdrop-blur">
              <Share2 className="size-5" />
            </Button>
            <Button type="button" variant="outline" size="icon" onClick={() => void copy()} aria-label="Copy referral link" className="size-12 border-vip/25 bg-background/65 backdrop-blur">
              {copied ? <Check className="size-5 text-vip" /> : <Copy className="size-5" />}
            </Button>
          </div>
          <p className="mt-4 max-w-md text-xs text-foreground/55">Rewards repeat every 10 successful registrations.</p>
        </div>
      </div>
    </div>
  );
}
