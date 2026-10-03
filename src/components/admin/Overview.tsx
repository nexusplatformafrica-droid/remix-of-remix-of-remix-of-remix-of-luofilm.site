import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Crown, Wallet, Film, Tv, Activity, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { db as supabase } from "@/lib/db";
import { purgeTable } from "@/lib/fdb";
import { money, seriesByDay, timeAgo } from "@/lib/admin";
import { walletBalance } from "@/lib/relworx";
import { Empty, Panel, SoftArea, Stat } from "./ui";

export type AdminTab = "overview" | "users" | "content" | "notify" | "wallet" | "settings";

async function loadOverview() {
  const [profiles, subs, tx, withdrawals, titles, episodes, activities] = await Promise.all([
    supabase.from("profiles").select("id, created_at, display_name, email, phone, last_seen").order("created_at", { ascending: false }),
    supabase.from("luo_subscriptions").select("*").order("created_at", { ascending: false }),
    supabase.from("luo_transactions").select("*").order("created_at", { ascending: false }),
    supabase.from("luo_withdrawals").select("*").order("created_at", { ascending: false }),
    supabase.from("media").select("*"),
    supabase.from("episodes").select("*"),
    supabase.from("luo_activities").select("*").order("created_at", { ascending: false }),
  ]);
  return {
    profiles: profiles.data ?? [],
    subs: subs.data ?? [],
    tx: tx.data ?? [],
    withdrawals: withdrawals.data ?? [],
    titles: titles.data ?? [],
    episodes: episodes.data ?? [],
    activities: activities.data ?? [],
  };
}

export function Overview({ go }: { go: (t: AdminTab) => void }) {
  const q = useQuery({ queryKey: ["admin-overview"], queryFn: loadOverview });
  const d = q.data;
  const qc = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function clearActivities() {
    if (!window.confirm("Delete ALL activity records? This cannot be undone.")) return;
    setClearing(true);
    try {
      const removed = await purgeTable("luo_activities");
      toast.success(`Deleted ${removed.toLocaleString()} activity records`);
      await qc.invalidateQueries({ queryKey: ["admin-overview"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete activities");
    } finally {
      setClearing(false);
    }
  }

  // Real money sitting in the Relworx wallet, refreshed every half minute.
  const wallet = useQuery({
    queryKey: ["relworx-balance"],
    queryFn: () => walletBalance(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const now = Date.now();
  const activeSubs = (d?.subs ?? []).filter(
    (s) => s.status === "active" && (!s.expires_at || new Date(s.expires_at).getTime() > now),
  );
  const revenue = (d?.tx ?? [])
    .filter((t) => t.status === "success")
    .reduce((s, t) => s + Number(t.amount), 0);
  const paidOut = (d?.withdrawals ?? [])
    .filter((w) => w.status !== "rejected")
    .reduce((s, w) => s + Number(w.amount), 0);

  const revChart = seriesByDay(
    (d?.tx ?? []).filter((t) => t.status === "success"),
    14,
    (t) => Number(t.amount),
  );
  const userChart = seriesByDay(d?.profiles ?? [], 14);

  // Anyone whose profile pinged in the last 5 minutes counts as online now.
  const onlineNow = (d?.profiles ?? []).filter(
    (p) => p.last_seen && now - new Date(p.last_seen).getTime() < 5 * 60 * 1000,
  ).length;
  const activeToday = (d?.profiles ?? []).filter(
    (p) => p.last_seen && now - new Date(p.last_seen).getTime() < 24 * 60 * 60 * 1000,
  ).length;
  const profilesById = new Map((d?.profiles ?? []).map((profile) => [profile.id, profile]));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Total users"
          value={(d?.profiles.length ?? 0).toLocaleString()}
          sub={`${onlineNow.toLocaleString()} online now · ${activeToday.toLocaleString()} active today`}
          tone="violet"
          icon={<Users className="size-4" />}
          onClick={() => go("users")}
        />
        <Stat
          label="Active members"
          value={activeSubs.length.toLocaleString()}
          sub={`${d?.subs.length ?? 0} subscriptions · ${onlineNow.toLocaleString()} watching now`}
          tone="gold"
          icon={<Crown className="size-4" />}
          onClick={() => go("users")}
        />
        <Stat
          label="Wallet balance"
          value={
            wallet.isLoading
              ? "…"
              : wallet.data == null
                ? money(revenue - paidOut)
                : money(wallet.data)
          }
          sub={
            wallet.data == null
              ? `${money(revenue)} earned · ${money(paidOut)} out`
              : `Live Relworx wallet · ${money(revenue)} earned`
          }
          tone="mint"
          icon={<Wallet className="size-4" />}
          onClick={() => go("wallet")}
        />
        <Stat
          label="Library"
          value={`${d?.titles.length ?? 0}`}
          sub={`${d?.episodes.length ?? 0} episodes uploaded`}
          tone="rose"
          icon={<Film className="size-4" />}
          onClick={() => go("content")}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Revenue · last 14 days" action={<span className="text-[12px] opacity-60">{money(revenue)} lifetime</span>}>
          <SoftArea data={revChart} prefix="UGX " color="oklch(0.72 0.15 40)" />
        </Panel>
        <Panel title="New users · last 14 days">
          <SoftArea data={userChart} color="oklch(0.6 0.15 300)" height={220} />
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel
          title="Recent activity"
          action={
            <span className="flex items-center gap-2 text-[12px]">
              <span className="flex items-center gap-1 opacity-60">
                <Activity className="size-3.5" /> live
              </span>
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="rounded-full bg-white/70 px-2.5 py-1 font-semibold ring-1 ring-black/5 transition hover:bg-white"
              >
                {showAll ? "Show less" : `View all (${d?.activities.length ?? 0})`}
              </button>
              <button
                type="button"
                onClick={clearActivities}
                disabled={clearing}
                className="flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 font-semibold text-red-600 ring-1 ring-red-500/20 transition hover:bg-red-500/20 disabled:opacity-50"
              >
                <Trash2 className="size-3" /> {clearing ? "Deleting…" : "Delete all"}
              </button>
            </span>
          }
        >
          {q.isLoading ? (
            <Empty>Loading…</Empty>
          ) : (d?.activities.length ?? 0) === 0 ? (
            <Empty>No activity yet.</Empty>
          ) : (
            <ul className={`space-y-2 ${showAll ? "max-h-[480px] overflow-y-auto pr-1" : ""}`}>
              {(showAll ? d?.activities : d?.activities.slice(0, 12))?.map((a) => {
                const person = profilesById.get(a.user_id);
                return (
                  <li key={a.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/60 px-3 py-2">
                    <span className="min-w-0 text-[13px]">
                      <span className="block truncate font-semibold">{person?.display_name ?? person?.email ?? "Signed-in user"}</span>
                      <span className="block truncate opacity-70">
                        {person?.phone ? `${person.phone} · ` : ""}{a.action}{a.target ? ` · ${a.target}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] opacity-55">{timeAgo(a.created_at)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Shortcuts">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { t: "Upload a movie", i: Film, tab: "content" as AdminTab },
              { t: "Add episodes", i: Tv, tab: "content" as AdminTab },
              { t: "Users & subscriptions", i: Users, tab: "users" as AdminTab },
              { t: "Withdraw money", i: Wallet, tab: "wallet" as AdminTab },
            ].map((s) => (
              <button
                key={s.t}
                type="button"
                onClick={() => go(s.tab)}
                className="flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-3 text-left text-[13px] font-semibold ring-1 ring-black/5 transition hover:bg-white"
              >
                <span className="grid size-9 place-items-center rounded-2xl bg-[linear-gradient(120deg,oklch(0.95_0.06_90),oklch(0.9_0.1_60))]">
                  <s.i className="size-4" />
                </span>
                {s.t}
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
