import {
  BarChart3, Briefcase, Building2, Calculator, CalendarDays, CheckSquare, FileText,
  FolderOpen, Gauge, Landmark, Layers, LayoutDashboard, Lightbulb, PiggyBank, Settings,
  Users, Workflow, type LucideIcon,
} from "lucide-react";
import type { NavIcon as NavIconName } from "@/features/navigation/nav";

const ICONS: Record<NavIconName, LucideIcon> = {
  portfolio: Briefcase,
  missions: CheckSquare,
  team: Users,
  company: Building2,
  dashboard: LayoutDashboard,
  kpi: Gauge,
  sig: Layers,
  accounting: Calculator,
  treasury: Landmark,
  budget: PiggyBank,
  profitability: BarChart3,
  businessplan: FileText,
  reports: FileText,
  recommendations: Lightbulb,
  documents: FolderOpen,
  automation: Workflow,
  actions: CheckSquare,
  meetings: CalendarDays,
  settings: Settings,
};

export function NavIcon({ name }: { name: NavIconName }) {
  const Icon = ICONS[name];
  return <Icon className="size-4 shrink-0" aria-hidden />;
}
