import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

interface DependencyBadgeProps {
  epicIdentifier: string;
  epicName: string;
  status: string;
  epicId: string;
}

function statusColor(status: string): string {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-800 border-green-200";
    case "active":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "archived":
      return "bg-gray-100 text-gray-500 border-gray-200";
    default:
      return "bg-gray-100 text-gray-500 border-gray-200";
  }
}

export function DependencyBadge({
  epicIdentifier,
  epicName,
  status,
  epicId,
}: DependencyBadgeProps) {
  return (
    <Link to={`/epics/${epicId}`} className="no-underline">
      <Badge
        variant="outline"
        className={`gap-1 cursor-pointer hover:opacity-80 transition-opacity ${statusColor(status)}`}
      >
        <span className="font-mono text-xs font-semibold">{epicIdentifier}</span>
        <span className="max-w-[160px] truncate">{epicName}</span>
        <span className="capitalize text-xs opacity-70">({status})</span>
      </Badge>
    </Link>
  );
}
