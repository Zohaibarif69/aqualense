"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, BookOpen, Camera, ChevronDown, ClipboardCheck, FileText, Gauge, HelpCircle, LineChart, List, Map, MapPin, Menu, Radio, Search, Settings, Sprout, User as UserIcon, X } from "lucide-react";
import { useNotifications, useObservations, useSites, useUser } from "@/hooks/queries";
import { useRoleSwitcher } from "./RoleSwitch";
import type { Role } from "@/types";
import Logo from "./Logo";
import { DemoBadge, cx } from "./ui";
import { config } from "@/services/config";

function NavLink({ href, end, className, onClick, children }: {
  href: string; end?: boolean; onClick?: () => void;
  className: string | ((s: { isActive: boolean }) => string);
  children: React.ReactNode | ((s: { isActive: boolean }) => React.ReactNode);
}) {
  const pathname = usePathname();
  const isActive = end ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  return (
    <Link href={href} onClick={onClick} aria-current={isActive ? "page" : undefined} className={typeof className === "function" ? className({ isActive }) : className}>
      {typeof children === "function" ? children({ isActive }) : children}
    </Link>
  );
}

type Item = { to: string; label: string; icon: typeof Map; roles?: Role[]; end?: boolean };
const NAV: { section: string; items: Item[] }[] = [
  { section: "Explore", items: [{ to: "/app", label: "Overview", icon: Gauge, end: true }, { to: "/app/map", label: "Live Map", icon: Map }, { to: "/app/sites", label: "Monitoring Sites", icon: MapPin }, { to: "/app/environment", label: "Environmental Outlook", icon: Sprout }, { to: "/app/sensors", label: "Sensors and Alerts", icon: Radio }] },
  { section: "Observations", items: [{ to: "/app/observations/new", label: "Report a Condition", icon: Camera }, { to: "/app/observations", label: "Observation Feed", icon: List, end: true }, { to: "/app/my-reports", label: "My Reports", icon: FileText }] },
  { section: "Review and Analysis", items: [{ to: "/app/review", label: "Expert Review", icon: ClipboardCheck, roles: ["expert", "admin"] }, { to: "/app/analytics", label: "Historical Trends", icon: LineChart }] },
  { section: "Account", items: [{ to: "/app/settings", label: "Profile and Settings", icon: Settings }, { to: "/about", label: "Help and About", icon: BookOpen }] },
];
const TITLES: [RegExp, string][] = [[/^\/app$/, "Overview"], [/map/, "Live Map"], [/sites/, "Monitoring Sites"], [/environment/, "Environmental Outlook"], [/sensors/, "Sensors and Alerts"], [/observations\/new/, "Report a Condition"], [/observations\/./, "Observation Details"], [/observations/, "Observation Feed"], [/my-reports/, "My Reports"], [/review/, "Expert Review"], [/analytics/, "Historical Trends"], [/notifications/, "Notifications"], [/settings/, "Profile and Settings"]];

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { data: user } = useUser();
  return (
    <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
      {NAV.map((g) => {
        const items = g.items.filter((i) => !i.roles || (user && i.roles.includes(user.role)));
        return items.length ? (
          <div key={g.section}>
            <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-white/45 uppercase">{g.section}</p>
            <ul className="space-y-0.5">{items.map(({ to, label, icon: I, end }) => (
              <li key={to}><NavLink href={to} end={end} onClick={onNavigate} className={({ isActive }) => cx("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors", isActive ? "bg-white/12 text-white" : "text-white/70 hover:bg-white/6 hover:text-white")}>
                {({ isActive }) => <><I size={17} className={isActive ? "text-[#5FD3D6]" : ""} aria-hidden />{label}</>}
              </NavLink></li>
            ))}</ul>
          </div>
        ) : null;
      })}
    </nav>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const nav = useRouter();
  const { data: obs = [] } = useObservations();
  const { data: sites = [] } = useSites();
  const results = useMemo(() => {
    const s = q.trim().toLowerCase(); if (s.length < 2) return [];
    return [
      ...sites.filter((x) => `${x.name} ${x.id} ${x.waterbodyName}`.toLowerCase().includes(s)).map((x) => ({ to: `/app/sites/${x.id}`, label: x.name, sub: `Site · ${x.id}` })),
      ...obs.filter((x) => `${x.id} ${x.location.placeName}`.toLowerCase().includes(s)).map((x) => ({ to: `/app/observations/${x.id}`, label: x.id, sub: `Observation · ${x.location.placeName}` })),
    ].slice(0, 7);
  }, [q, obs, sites]);
  return (
    <div className="relative hidden w-full max-w-sm md:block">
      <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-2" aria-hidden />
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder="Search sites, observation IDs, places" aria-label="Global search" className="h-9 w-full rounded-lg border border-line bg-muted pr-3 pl-9 text-sm focus:border-primary focus:bg-surface focus:outline-none" />
      {open && q.length >= 2 && (
        <div className="absolute top-11 z-[1500] w-full overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
          {results.length ? results.map((r) => <button key={r.to} onMouseDown={() => { nav.push(r.to); setQ(""); }} className="block w-full px-4 py-2.5 text-left hover:bg-muted"><p className="text-sm font-medium">{r.label}</p><p className="text-xs text-ink-2">{r.sub}</p></button>) : <p className="px-4 py-3 text-sm text-ink-2">No matches for “{q}”.</p>}
        </div>
      )}
    </div>
  );
}

function ProfileMenu() {
  const { data: user } = useUser();
  const nav = useRouter();
  const sw = useRoleSwitcher((r) => { if (r === "expert") nav.push("/app/review"); });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false); document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  if (!user) return null;
  const initials = user.displayName.split(" ").map((w) => w[0]).join("");
  return (
    <div className="relative" ref={ref}>
      {sw.dialog}
      <button onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} className="flex items-center gap-2 rounded-lg py-1 pr-2 pl-1 hover:bg-muted">
        <span className="grid size-8 place-items-center rounded-full bg-navy text-xs font-semibold text-white">{initials}</span>
        <span className="hidden text-left lg:block"><span className="block text-[13px] leading-tight font-semibold">{user.displayName}</span><span className="block text-[11px] leading-tight text-ink-2 capitalize">{user.role} (mock sign-in)</span></span>
        <ChevronDown size={14} className="text-ink-2" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-[1500] w-64 rounded-xl border border-line bg-surface p-2 shadow-lg">
          <p className="px-2 pt-1 pb-2 text-[11px] font-semibold tracking-wider text-ink-2 uppercase">Demo: switch role</p>
          {(["citizen", "expert", "researcher"] as Role[]).map((r) => (
            <button key={r} role="menuitemradio" aria-checked={user.role === r} onClick={() => { void sw.request(r); setOpen(false); }} className={cx("flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm capitalize hover:bg-muted", user.role === r && "font-semibold text-primary")}>{r}{user.role === r && <span className="text-xs">Active</span>}</button>
          ))}
          <div className="my-1 border-t border-line" />
          <Link role="menuitem" href="/app/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-muted"><UserIcon size={15} /> Profile and settings</Link>
          <Link role="menuitem" href="/" className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-muted">Sign out (demo)</Link>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  const { data: notes = [] } = useNotifications();
  const unread = notes.filter((n) => !n.read).length;
  const title = TITLES.find(([r]) => r.test(pathname))?.[1] ?? "AquaLens";
  useEffect(() => { setDrawer(false); window.scrollTo(0, 0); }, [pathname]);

  return (
    <div className="min-h-screen bg-bg">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[5000] focus:rounded focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col bg-navy lg:flex">
        <Link href="/" className="flex h-[68px] items-center px-6"><Logo light /></Link>
        <SidebarNav />
        {config.useMockData && <div className="m-3 rounded-lg bg-white/6 p-3 text-xs text-white/70"><DemoBadge className="mb-1.5" /><p>Monitoring sites and environmental screening are real (AquaConnect snapshot). Citizen reports, photos and reviews are demo content.</p></div>}
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-[1900] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-navy/50" onClick={() => setDrawer(false)} />
          <aside className="relative flex h-full w-[280px] flex-col bg-navy">
            <div className="flex h-16 items-center justify-between px-5"><Logo light /><button onClick={() => setDrawer(false)} aria-label="Close navigation" className="text-white/80"><X /></button></div>
            <SidebarNav onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}
      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur lg:h-[68px] lg:px-8">
          <button className="rounded-lg p-2 text-ink lg:hidden" onClick={() => setDrawer(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <div className="min-w-0 shrink-0"><p className="hidden text-xs text-ink-2 sm:block">AquaLens</p><p className="truncate text-[15px] font-semibold text-navy">{title}</p></div>
          <div className="flex flex-1 justify-center px-2"><GlobalSearch /></div>
          {config.useMockData && <DemoBadge className="hidden sm:inline-flex" />}
          <Link href="/app/notifications" className="relative rounded-lg p-2 text-ink-2 hover:bg-muted hover:text-ink" aria-label={`Notifications, ${unread} unread`}><Bell size={19} />{unread > 0 && <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unread}</span>}</Link>
          <Link href="/about" className="hidden rounded-lg p-2 text-ink-2 hover:bg-muted hover:text-ink sm:block" aria-label="Help"><HelpCircle size={19} /></Link>
          <ProfileMenu />
        </header>
        <main id="main" className="mx-auto max-w-[1440px] px-4 pt-6 pb-24 lg:px-8 lg:pb-10">{children}</main>
      </div>
      <nav aria-label="Quick actions" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface lg:hidden">
        {[{ to: "/app", l: "Overview", I: Gauge, end: true }, { to: "/app/map", l: "Map", I: Map }, { to: "/app/observations/new", l: "Report", I: Camera }, { to: "/app/my-reports", l: "My Reports", I: FileText }].map(({ to, l, I, end }) => (
          <NavLink key={to} href={to} end={end} className={({ isActive }) => cx("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", isActive ? "text-primary" : "text-ink-2")}><I size={20} aria-hidden />{l}</NavLink>
        ))}
      </nav>
    </div>
  );
}

export function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-[1000] border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/"><Logo /></Link>
          <nav className="flex items-center gap-1 text-sm font-medium" aria-label="Public">
            <Link href="/#how" className="hidden rounded-lg px-3 py-2 text-ink-2 hover:text-ink sm:block">How it works</Link>
            <Link href="/about" className="hidden rounded-lg px-3 py-2 text-ink-2 hover:text-ink sm:block">Methodology</Link>
            <Link href="/app" className="rounded-lg bg-navy px-4 py-2 text-white hover:bg-navy/90">Open app</Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className="border-t border-line bg-bg">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 sm:grid-cols-[1.5fr_1fr_1fr]">
          <div><Logo /><p className="mt-3 max-w-xs text-sm text-ink-2">An evidence and monitoring platform for freshwater observations. Not an automated water-safety diagnosis system.</p></div>
          <div><p className="mb-2 text-sm font-semibold text-navy">Platform</p><ul className="space-y-1.5 text-sm text-ink-2"><li><Link href="/about">About AquaLens</Link></li><li><Link href="/about#methodology">Data and methodology</Link></li><li><Link href="/about#help">Help and contact</Link></li></ul></div>
          <div><p className="mb-2 text-sm font-semibold text-navy">Policies</p><ul className="space-y-1.5 text-sm text-ink-2"><li><Link href="/privacy">Privacy</Link></li><li><Link href="/terms">Terms</Link></li><li><Link href="/about#accessibility">Accessibility statement</Link></li></ul></div>
        </div>
        <p className="border-t border-line py-4 text-center text-xs text-ink-2">Environmental data: AquaConnect / OneAquaHealth (screening only) · Map data © OpenStreetMap contributors · Photography via Unsplash</p>
      </footer>
    </div>
  );
}
