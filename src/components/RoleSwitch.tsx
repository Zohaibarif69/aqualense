"use client";

import { useState } from "react";
import { useSwitchRole } from "@/hooks/queries";
import type { Role } from "@/types";
import { Button, Dialog, inputCls, useToast } from "./ui";

/**
 * Switches the demo role. When the server runs in secure mode (DEMO_ROLE_SWITCH=false), reviewer, researcher and admin
 * roles ask for a passcode first; the server checks it and issues the signed role cookie.
 */
export function useRoleSwitcher(onDone?: (role: Role) => void) {
  const sw = useSwitchRole(); const toast = useToast();
  const [pending, setPending] = useState<Role | null>(null); const [code, setCode] = useState("");
  const run = (role: Role, passcode?: string) => sw.mutate({ role, passcode }, {
    onSuccess: () => { setPending(null); setCode(""); onDone?.(role); },
    onError: (e) => toast((e as Error).message, "danger"),
  });
  const request = async (role: Role) => {
    if (role !== "citizen") {
      const need = await fetch("/api/session", { cache: "no-store" }).then((r) => r.json()).then((j: { passcodeRequired?: boolean }) => !!j.passcodeRequired).catch(() => false);
      if (need) { setPending(role); return; }
    }
    run(role);
  };
  const dialog = (
    <Dialog open={!!pending} onClose={() => { setPending(null); setCode(""); }} title={`Passcode for ${pending ?? ""} access`}
      footer={<><Button variant="secondary" onClick={() => { setPending(null); setCode(""); }}>Cancel</Button><Button disabled={!code || sw.isPending} onClick={() => pending && run(pending, code)}>Continue</Button></>}>
      <label htmlFor="role-pass" className="mb-1.5 block font-medium">Passcode</label>
      <input id="role-pass" type="password" autoComplete="off" className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && pending && code) run(pending, code); }} />
      <p className="mt-2 text-xs text-ink-2">Ask the administrator of this server for the passcode. Without it you can still use AquaLens as a citizen.</p>
    </Dialog>
  );
  return { request, dialog, isPending: sw.isPending };
}
