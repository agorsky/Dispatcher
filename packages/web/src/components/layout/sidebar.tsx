import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Folder, Settings, BarChart3, Lightbulb, Shield, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/epic-requests", label: "Epic Requests", icon: Lightbulb },
  { href: "/epics", label: "Epics", icon: Folder },
  { href: "/crew", label: "Crew", icon: Users },
  { href: "/compliance", label: "Compliance", icon: Shield },
  { href: "/settings", label: "Settings", icon: Settings },
];

const VERSION = "0.2.0";

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps = {}) {
  const location = useLocation();

  return (
    <div className="flex h-full w-64 flex-col border-r bg-muted/40">
      {/* Header */}
      <div className="flex h-14 items-center border-b px-4">
        <span className="font-semibold">Dispatcher</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              location.pathname === item.href ||
                location.pathname.startsWith(item.href + "/")
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Version Badge */}
      <div className="border-t p-3 flex justify-center">
        <Link to="/whats-new" onClick={onNavigate}>
          <Badge
            variant="secondary"
            className="text-xs cursor-pointer transition-colors hover:bg-secondary/80"
          >
            v{VERSION}
          </Badge>
        </Link>
      </div>
    </div>
  );
}
