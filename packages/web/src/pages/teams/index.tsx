import { useState } from "react";
import { useTeams } from "@/hooks/queries/use-teams";
import { TeamCard } from "@/components/teams/team-card";
import { TeamForm } from "@/components/teams/team-form";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export function TeamsPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const { data, isLoading } = useTeams();

  const teams = data?.data ?? [];

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl md:text-2xl font-semibold">Teams</h1>
        <Button onClick={() => { setIsFormOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          New Team
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-lg bg-muted"
            />
          ))}
        </div>
      ) : teams.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">No teams yet</p>
          <Button onClick={() => { setIsFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Create your first team
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <TeamCard key={team.id} team={team} />
          ))}
        </div>
      )}

      <TeamForm open={isFormOpen} onOpenChange={setIsFormOpen} />
    </div>
  );
}
