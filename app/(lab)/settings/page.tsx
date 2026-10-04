import type { Metadata } from "next";
import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { AdminAccess } from "@/components/lab/admin-access";
import { DataSources } from "@/components/lab/data-sources";
import { DatasetSwitcher } from "@/components/layout/dataset-switcher";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Section, SectionTitle } from "@/components/ui/section";
import { authMode, isAdmin } from "@/lib/auth";
import { DISCLAIMER } from "@/lib/constants";
import { env, mlConfigured, realtimeConfigured, supabaseConfigured } from "@/lib/env";
import { getDataset } from "@/services/dataset";
import { mlHealth } from "@/services/ml-client";
import { getRepository } from "@/services/repository";

export const metadata: Metadata = { title: "Settings" };

function StatusRow({ label, state, detail }: { label: string; state: "ok" | "warn" | "off"; detail: string }) {
  const Icon = state === "ok" ? CheckCircle2 : state === "warn" ? CircleDashed : XCircle;
  const color = state === "ok" ? "text-good-ink" : state === "warn" ? "text-warn" : "text-bad-ink";
  return (
    <li className="flex items-start gap-3 px-5 py-4">
      <Icon className={`mt-0.5 size-4 shrink-0 ${color}`} aria-hidden />
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="mt-0.5 text-xs text-ink-3">{detail}</p>
      </div>
    </li>
  );
}

export default async function SettingsPage() {
  const repo = getRepository();
  const [dataset, admin, sources, real, demo, test, ml] = await Promise.all([
    getDataset(),
    isAdmin(),
    repo.listDataSources(),
    repo.countRounds("real"),
    repo.countRounds("demo"),
    repo.countRounds("test"),
    mlConfigured() ? mlHealth().then(() => true).catch(() => false) : Promise.resolve(null),
  ]);
  const mode = authMode();

  return (
    <>
      <PageHeader eyebrow="Settings" title="Configuration & access." description="Choose the dataset under analysis, sign in for write access, and manage authorised data sources." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Section className="!mb-0">
          <Card className="h-full">
            <CardHeader eyebrow="Dataset" title="What is being analysed" description="Real and demo data are kept strictly separate. Every page, model and metric uses only the selected dataset." />
            <CardBody>
              <DatasetSwitcher dataset={dataset} counts={{ real, demo, test }} />
            </CardBody>
          </Card>
        </Section>
        <Section className="!mb-0" delay={0.06}>
          <Card className="h-full">
            <CardHeader eyebrow="Admin access" title="Write permissions" description="Imports, deletions, training and estimates require an admin session (HTTP-only, SameSite=strict cookie)." />
            <CardBody>
              <AdminAccess mode={mode} signedIn={admin} />
            </CardBody>
          </Card>
        </Section>
      </div>

      <SectionTitle>System status</SectionTitle>
      <Section>
        <Card>
          <ul className="divide-y divide-line">
            <StatusRow
              label="Storage"
              state={supabaseConfigured() ? "ok" : "warn"}
              detail={supabaseConfigured() ? "Supabase (service-role key held server-side only)" : "Local JSON dev store in ./.data — configure Supabase for production."}
            />
            <StatusRow
              label="Realtime"
              state={realtimeConfigured() ? "ok" : "warn"}
              detail={realtimeConfigured() ? "Supabase Realtime via read-only anon key" : "Not configured — Live page polls the server instead."}
            />
            <StatusRow
              label="ML service"
              state={ml === true ? "ok" : ml === false ? "off" : "warn"}
              detail={ml === true ? `Reachable at ${env.mlServiceUrl}` : ml === false ? `Unreachable at ${env.mlServiceUrl}` : "ML_SERVICE_URL not set"}
            />
            <StatusRow
              label="Authorised ingestion endpoint"
              state={env.ingestApiKey ? "ok" : "warn"}
              detail={env.ingestApiKey ? "POST /api/ingest enabled (bearer INGEST_API_KEY)" : "Disabled — set INGEST_API_KEY to accept rounds from an authorised source."}
            />
            <StatusRow label="Auto-estimate on new rounds" state={env.autoPredict ? "ok" : "warn"} detail={env.autoPredict ? "On" : "Off (AUTO_PREDICT=false)"} />
          </ul>
        </Card>
      </Section>

      <SectionTitle hint="manual · csv · api · live_feed · demo">Data sources</SectionTitle>
      <Section>
        <DataSources sources={sources} canEdit={admin} />
      </Section>

      <SectionTitle>Connecting an authorised live source</SectionTitle>
      <Section>
        <Card>
          <CardBody className="space-y-4 text-sm text-ink-2">
            <p>
              Push results server-to-server from a source you are permitted to use. The browser never calls third-party APIs, and the lab does not
              support scraping or private endpoints.
            </p>
            <pre className="overflow-x-auto rounded-xl border border-line bg-black/40 p-4 font-mono text-xs leading-relaxed text-ink-2 scrollbar-thin">
{`curl -X POST https://<your-app>/api/ingest \\
  -H "Authorization: Bearer $INGEST_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"source_name":"official_results_api",
       "rounds":[{"multiplier":1.84,"round_time":"2026-10-04T10:00:01Z"}]}'`}
            </pre>
            <p className="text-xs text-ink-3">Flow: source → /api/ingest → validation → storage → pending estimates scored → new estimate → Realtime → Live page.</p>
          </CardBody>
        </Card>
      </Section>

      <Section>
        <p className="text-xs text-ink-3">{DISCLAIMER}</p>
      </Section>
    </>
  );
}
