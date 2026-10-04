import { Activity, BarChart3, Boxes, ClipboardCheck, Database, FlaskConical, LayoutDashboard, ListOrdered, Microscope, Settings } from "lucide-react";

export const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/live", label: "Live Analysis", icon: Activity },
  { href: "/predictions", label: "Predictions", icon: ListOrdered },
  { href: "/backtest", label: "Backtest", icon: FlaskConical },
  { href: "/data", label: "Data", icon: Database },
  { href: "/quality", label: "Data Quality", icon: Microscope },
  { href: "/validation", label: "Validation", icon: ClipboardCheck },
  { href: "/models", label: "Models", icon: Boxes },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export const LogoIcon = BarChart3;
