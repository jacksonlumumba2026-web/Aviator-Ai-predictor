"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { Dataset } from "@/types";
import { DISCLAIMER } from "@/lib/constants";
import { ProvenanceBar } from "./provenance";
import { cn } from "../ui/cn";
import { DatasetSwitcher } from "./dataset-switcher";
import { LogoIcon, NAV } from "./nav-items";

export interface ShellProps {
  dataset: Dataset;
  counts: Record<Dataset, number>;
  storage: "supabase" | "local";
  liveConnected: boolean;
  storageUnconfigured?: boolean;
  children: React.ReactNode;
}

function Brand() {
  return (
    <Link href="/dashboard" className="group flex items-center gap-3">
      <span className="relative grid size-9 place-items-center rounded-xl bg-gradient-to-br from-brand to-brand-2 shadow-[0_8px_24px_-8px_rgb(123_140_255/0.7)]">
        <LogoIcon className="size-4.5 text-[#0b0d12]" strokeWidth={2.4} />
      </span>
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold tracking-tight text-ink">Aviator AI Lab</span>
        <span className="block text-[10px] font-medium tracking-[0.16em] text-ink-3 uppercase">Signal research</span>
      </span>
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = path === href || path.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
              active ? "bg-white/[0.06] text-ink" : "text-ink-2 hover:bg-white/[0.03] hover:text-ink",
            )}
          >
            {active && <motion.span layoutId="nav-active" className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand" />}
            <Icon className={cn("size-4", active ? "text-brand" : "text-ink-3 group-hover:text-ink-2")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter({ dataset, counts, storage, liveConnected }: Omit<ShellProps, "children">) {
  return (
    <div className="mt-auto flex flex-col gap-4">
      <DatasetSwitcher dataset={dataset} counts={counts} />
      <div className="flex flex-col gap-2 px-1 text-[11px] text-ink-3">
        <span className="flex items-center gap-2">
          <span className={cn("size-1.5 rounded-full", liveConnected ? "bg-good animate-pulse-soft" : "bg-ink-3")} />
          {liveConnected ? "Live feed connected" : "Live feed not connected"}
        </span>
        <span className="flex items-center gap-2">
          <span className={cn("size-1.5 rounded-full", storage === "supabase" ? "bg-series-1" : "bg-warn")} />
          {storage === "supabase" ? "Supabase storage" : "Local dev store"}
        </span>
      </div>
    </div>
  );
}

export function Shell(props: ShellProps) {
  const [open, setOpen] = useState(false);
  const { dataset, children } = props;

  return (
    <div className="min-h-dvh lg:pl-[264px]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col gap-8 border-r border-line bg-surface/70 px-5 py-6 backdrop-blur-xl lg:flex">
        <Brand />
        <NavList />
        <SidebarFooter {...props} />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/80 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Brand />
        <button
          onClick={() => setOpen(true)}
          className="grid size-10 place-items-center rounded-xl border border-line-strong text-ink-2"
          aria-label="Open navigation"
        >
          <Menu className="size-5" />
        </button>
      </header>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 right-0 z-50 flex w-[86%] max-w-xs flex-col gap-8 border-l border-line bg-surface px-5 py-6 lg:hidden"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
            >
              <div className="flex items-center justify-between">
                <Brand />
                <button onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-xl text-ink-2" aria-label="Close navigation">
                  <X className="size-5" />
                </button>
              </div>
              <NavList onNavigate={() => setOpen(false)} />
              <SidebarFooter {...props} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {props.storageUnconfigured && (
        <div role="alert" className="border-b border-bad/40 bg-bad/[0.1] px-4 py-2 text-center text-xs font-semibold text-bad-ink">
          Storage not configured — this deployment is read-only and empty. Set the Supabase environment variables (see README → Deployment).
        </div>
      )}
      <div className="sticky top-[65px] z-20 bg-bg/90 backdrop-blur-xl lg:top-0">
        <ProvenanceBar dataset={dataset} rounds={props.counts[dataset]} />
      </div>

      <main className="mx-auto max-w-[1240px] px-4 pt-10 pb-16 sm:px-6 md:pt-16 lg:px-10 lg:pt-20">{children}</main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-3 px-4 py-8 text-xs text-ink-3 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-10">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-px size-3.5 shrink-0 text-warn" aria-hidden />
            <span>{DISCLAIMER}</span>
          </p>
          <p>Aviator AI Lab · research tool · not affiliated with Spribe or Betika</p>
        </div>
      </footer>
    </div>
  );
}
