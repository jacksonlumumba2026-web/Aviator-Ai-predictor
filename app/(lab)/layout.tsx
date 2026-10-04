import { Shell } from "@/components/layout/shell";
import { getDataset } from "@/services/dataset";
import { getLiveStatus } from "@/services/live";
import { getRepository } from "@/services/repository";

export const dynamic = "force-dynamic";

export default async function LabLayout({ children }: { children: React.ReactNode }) {
  const repo = getRepository();
  const [dataset, real, demo, test, live] = await Promise.all([
    getDataset(),
    repo.countRounds("real"),
    repo.countRounds("demo"),
    repo.countRounds("test"),
    getLiveStatus(),
  ]);
  return (
    <Shell dataset={dataset} counts={{ real, demo, test }} storage={repo.kind} liveConnected={live.connected && dataset === "real"}>
      {children}
    </Shell>
  );
}
