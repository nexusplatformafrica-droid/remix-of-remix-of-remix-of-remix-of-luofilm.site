import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { captureReferral, claimPendingReferral, rememberOwnedAccount, syncReferrals } from "@/lib/referrals";

/** Reads ?ref= links, records valid referrals and grants due rewards. */
export function ReferralTracker() {
  const { user, profile, loading } = useAuth();
  const { refreshSubscription } = useSubscription();
  const handled = useRef(false);

  useEffect(() => {
    if (loading || handled.current) return;
    handled.current = true;
    const url = new URL(window.location.href);
    const ref = url.searchParams.get("ref");
    if (!ref) return;
    url.searchParams.delete("ref");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    const result = captureReferral(ref, user?.id ?? null);
    // The referrer's own link on their own device just opens their account.
    if (result === "own" && !user) window.dispatchEvent(new Event("luofilm:open-auth"));
  }, [loading, user]);

  useEffect(() => {
    if (!user || !profile) return;
    rememberOwnedAccount(user.id);
    void (async () => {
      await claimPendingReferral(user.id, (profile as { created_at?: string }).created_at ?? null);
      await syncReferrals(user.id);
      refreshSubscription();
    })().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, !!profile]);

  useEffect(() => {
    const onReward = () => toast.success("Referral reward added to your account!");
    window.addEventListener("luofilm:referral-reward", onReward);
    return () => window.removeEventListener("luofilm:referral-reward", onReward);
  }, []);

  return null;
}
