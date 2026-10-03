import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, UserPlus } from "lucide-react";
import { fdb, nowIso, uuid } from "@/lib/fdb";
import { Empty, Panel, goldBtn } from "./ui";

type Row = { id?: unknown; user_id?: unknown; email?: unknown; phone?: unknown; display_name?: unknown; name?: unknown; role?: unknown; [k: string]: unknown };

async function loadTeam() {
  const [{ data: roles }, { data: profiles }] = await Promise.all([
    fdb.from("user_roles").select("*").eq("role", "staff"),
    fdb.from("profiles").select("*"),
  ]);
  const byId = new Map((profiles ?? []).map((p: Row) => [String(p.id), p]));
  return (roles ?? []).map((r: Row) => ({ role: r, profile: byId.get(String(r.user_id)) }));
}

/** Main-admin only: grant or remove the limited "team admin" role. */
export function TeamTab() {
  const qc = useQueryClient();
  const [ident, setIdent] = useState("");
  const team = useQuery({ queryKey: ["admin-team"], queryFn: loadTeam });

  const add = useMutation({
    mutationFn: async () => {
      const v = ident.trim().toLowerCase();
      if (!v) throw new Error("Enter the user's email or phone");
      const digits = v.replace(/\D/g, "");
      const { data: profiles } = await fdb.from("profiles").select("*");
      const p = (profiles ?? []).find(
        (x: Row) =>
          String(x.email ?? "").toLowerCase() === v ||
          (digits.length > 6 && String(x.phone ?? "").replace(/\D/g, "").endsWith(digits.slice(-9))),
      );
      if (!p) throw new Error("No user found. They must sign up on the site first.");
      const { data: existing } = await fdb.from("user_roles").select("*").eq("user_id", String(p.id)).maybeSingle();
      if (existing?.role === "admin") throw new Error("That account is the main admin.");
      if (existing) await fdb.from("user_roles").update({ role: "staff" }).eq("id", String(existing.id));
      else await fdb.from("user_roles").insert({ id: uuid(), user_id: String(p.id), role: "staff", created_at: nowIso() });
    },
    onSuccess: () => {
      toast.success("Team admin added");
      setIdent("");
      void qc.invalidateQueries({ queryKey: ["admin-team"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await fdb.from("user_roles").update({ role: "user" }).eq("id", id);
    },
    onSuccess: () => {
      toast.success("Access removed");
      void qc.invalidateQueries({ queryKey: ["admin-team"] });
    },
  });

  return (
    <div className="space-y-5">
      <Panel title="Add a team admin">
        <p className="mb-3 text-[12px] opacity-65">
          Team admins can upload movies, series and episodes, add hero slides, view users, activate or
          deactivate plans, and see user activity. They cannot see the wallet, withdraw, see uploaded
          links, delete activity, change settings, or add other admins.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={ident}
            onChange={(e) => setIdent(e.target.value)}
            placeholder="User email or phone"
            className="min-w-[220px] flex-1 rounded-full bg-white/80 px-4 py-2 text-[13px] ring-1 ring-black/10 outline-none"
          />
          <button type="button" disabled={add.isPending} onClick={() => add.mutate()} className={`${goldBtn} inline-flex items-center gap-2`}>
            <UserPlus className="size-4" /> {add.isPending ? "Adding…" : "Add admin"}
          </button>
        </div>
      </Panel>

      <Panel title={`Team admins · ${team.data?.length ?? 0}`}>
        {team.isLoading ? (
          <Empty>Loading…</Empty>
        ) : (team.data?.length ?? 0) === 0 ? (
          <Empty>No team admins yet.</Empty>
        ) : (
          <ul className="space-y-2">
            {team.data!.map(({ role, profile }) => (
              <li key={String(role.id)} className="flex items-center justify-between gap-3 rounded-2xl bg-white/60 px-3 py-2 text-[13px]">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">
                    {String(profile?.display_name ?? profile?.name ?? profile?.email ?? "User")}
                  </span>
                  <span className="block truncate opacity-60">{String(profile?.email ?? profile?.phone ?? "")}</span>
                </span>
                <button
                  type="button"
                  onClick={() => confirm("Remove admin access?") && remove.mutate(String(role.id))}
                  className="flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 text-[12px] font-semibold text-red-600 ring-1 ring-red-500/20"
                >
                  <Trash2 className="size-3" /> Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
