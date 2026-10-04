import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import type { Confidence } from "@/types";
import { Badge } from "../ui/badge";

export function ConfidenceBadge({ level }: { level: Confidence }) {
  const map = {
    LOW: { tone: "warn" as const, icon: ShieldAlert },
    MEDIUM: { tone: "brand" as const, icon: ShieldQuestion },
    HIGH: { tone: "good" as const, icon: ShieldCheck },
  }[level];
  const Icon = map.icon;
  return (
    <Badge tone={map.tone} title="Derived only from out-of-sample backtest evidence. Never implies certainty.">
      <Icon className="size-3" aria-hidden />
      Confidence: {level}
    </Badge>
  );
}
