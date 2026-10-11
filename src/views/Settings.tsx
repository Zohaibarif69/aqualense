"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/hooks/queries";
import { simulate, config } from "@/services/config";
import { Button, Card, CardHeader, Field, Notice, PageHeader, inputCls, useToast } from "@/components/ui";

export default function Settings() {
  const { data: user } = useUser();
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(user?.displayName ?? "");
  const [sim, setSim] = useState({ ...simulate });
  const toggle = (k: keyof typeof simulate) => { simulate[k] = !simulate[k]; setSim({ ...simulate }); qc.invalidateQueries(); };
  return (
    <>
      <PageHeader title="Profile and Settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Profile" sub="Mock authentication — no real account security exists yet" />
          <form className="space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); toast("Profile updated"); }}>
            <div className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-full bg-navy font-semibold text-white">{name.split(" ").map((w) => w[0]).join("")}</span><p className="text-sm text-ink-2">Initials avatar · role: <strong className="capitalize text-ink">{user?.role}</strong></p></div>
            <Field id="dn" label="Display name"><input id="dn" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field id="em" label="Email" hint="Used only for notifications"><input id="em" className={inputCls} defaultValue={user?.email} type="email" /></Field>
            <Field id="lang" label="Preferred language"><select id="lang" className={inputCls}><option>English</option></select></Field>
            <Button type="submit">Save profile</Button>
          </form></Card>
        <div className="space-y-6">
          <Card><CardHeader title="Notifications" /><div className="space-y-3 p-5 text-sm">{["Review status changes", "More information requests", "Data-source issues (authorized users)"].map((l) => <label key={l} className="flex items-center gap-3"><input type="checkbox" defaultChecked className="size-4 accent-primary" />{l}</label>)}</div></Card>
          <Card><CardHeader title="Location and privacy" /><div className="space-y-3 p-5 text-sm text-ink"><p>AquaLens asks for your location only when you choose “Use My Location” while reporting. You can always pick a spot manually or share an approximate location.</p><label className="flex items-center gap-3"><input type="checkbox" className="size-4 accent-primary" />Default to approximate location</label><p className="text-ink-2">Your name is never shown on public observation pages.</p><Button variant="secondary" onClick={() => toast("Signed out (demo)", "info")}>Sign out</Button></div></Card>
          {config.useMockData && <Card><CardHeader title="Demo controls" sub="Simulate failures to test recovery states" /><div className="space-y-3 p-5 text-sm">
            {([["uploadError", "Fail observation submission / photo upload"], ["aiFailure", "Fail AI image analysis"], ["environmentError", "Fail environmental data requests"], ["slow", "Slow network (6× latency)"]] as const).map(([k, l]) => <label key={k} className="flex items-center gap-3"><input type="checkbox" className="size-4 accent-primary" checked={sim[k]} onChange={() => toggle(k)} />{l}</label>)}
            <Notice tone="info">These toggles affect only the in-browser mock services and reset on reload.</Notice>
          </div></Card>}
        </div>
      </div>
    </>
  );
}
