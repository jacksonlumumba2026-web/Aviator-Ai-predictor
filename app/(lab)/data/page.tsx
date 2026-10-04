import type { Metadata } from "next";
import { FlaskRound, Lock, ShieldCheck } from "lucide-react";
import { ActionButton } from "@/components/lab/action-button";
import { CsvImporter } from "@/components/lab/csv-importer";
import { ManualEntry } from "@/components/lab/manual-entry";
import { RoundsTable } from "@/components/lab/rounds-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Section, SectionTitle } from "@/components/ui/section";
import { authMode, isAdmin } from "@/lib/auth";
import { DEMO_LABEL } from "@/lib/constants";
import { getDataset } from "@/services/dataset";
import { getRepository } from "@/services/repository";

export const metadata: Metadata = { title: "Data" };

export default async function DataPage() {
  const repo = getRepository();
  const [dataset, admin, demoCount, sources] = await Promise.all([getDataset(), isAdmin(), repo.countRounds("demo"), repo.listDataSources()]);
  const mode = authMode();

  return (
    <>
      <PageHeader
        eyebrow="Data"
        title="Clean inputs, honest outputs."
        description="Import legitimately obtained historical results, add rounds by hand, and keep the dataset tidy. Every row is validated: multipliers must be ≥ 1.00, timestamps must parse, and duplicate rounds are detected."
      />

      {!admin && (
        <Section>
          <div className="flex items-center gap-3 rounded-2xl border border-line-strong bg-white/[0.03] px-5 py-4 text-sm text-ink-2">
            <Lock className="size-4 text-ink-3" aria-hidden />
            {mode === "locked"
              ? "Write access is disabled until ADMIN_PASSWORD is configured on the server."
              : "Read-only — sign in under Settings → Admin access to import, add or delete data."}
          </div>
        </Section>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <Section className="lg:col-span-3 !mb-0">
          <Card className="h-full">
            <CardHeader
              eyebrow="CSV import"
              title="Upload historical rounds"
              description="Rows are validated in your browser first, then again on the server. Imports always go into the real dataset."
              action={<Badge tone="brand">real dataset</Badge>}
            />
            <CardBody>
              <CsvImporter disabled={!admin} />
            </CardBody>
          </Card>
        </Section>
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Section className="!mb-0" delay={0.06}>
            <Card>
              <CardHeader eyebrow="Manual entry" title="Add a single round" />
              <CardBody>
                <ManualEntry disabled={!admin} />
              </CardBody>
            </Card>
          </Section>
          <Section className="!mb-0" delay={0.12}>
            <Card className="border-warn/25">
              <CardHeader
                eyebrow="Development only"
                title="Synthetic demo dataset"
                description={
                  <>
                    3,000 independent random rounds labelled <strong className="text-warn">{DEMO_LABEL}</strong>. Stored separately and never mixed with
                    real data. Because rounds are independent by construction, a sound pipeline should find no edge.
                  </>
                }
                action={<FlaskRound className="size-5 text-warn" aria-hidden />}
              />
              <CardBody className="flex flex-wrap gap-3 pt-0">
                {admin && (
                  <>
                    <ActionButton url="/api/demo" pendingLabel="Loading…">
                      {demoCount ? "Reload demo data" : "Load demo data"}
                    </ActionButton>
                    {demoCount > 0 && (
                      <ActionButton url="/api/demo" method="DELETE" variant="danger" confirm="Remove all demo rounds, demo models and demo predictions?">
                        Remove demo data
                      </ActionButton>
                    )}
                  </>
                )}
                <p className="w-full text-xs text-ink-3">{demoCount.toLocaleString("en-US")} demo rounds stored.</p>
              </CardBody>
            </Card>
          </Section>
        </div>
      </div>

      <SectionTitle hint={dataset === "demo" ? DEMO_LABEL : "Real dataset"}>Stored rounds</SectionTitle>
      <Section>
        <Card className="overflow-hidden">
          <RoundsTable canEdit={admin} sources={sources.map((s) => s.source_name)} />
        </Card>
      </Section>

      <Section>
        <div className="flex items-start gap-3 rounded-2xl border border-line bg-white/[0.015] p-5 text-xs leading-relaxed text-ink-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ink-2" aria-hidden />
          <p>
            Only use data you are entitled to use — your own records, exported history, or an officially provided results feed. This lab does not
            scrape, reverse-engineer, or connect to private betting-site APIs, WebSockets or authentication systems.
          </p>
        </div>
      </Section>
    </>
  );
}
