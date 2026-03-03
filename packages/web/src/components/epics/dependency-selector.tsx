import { useState, useEffect } from "react";
import { Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { epicsApi } from "@/lib/api/epics";
import type { Epic } from "@/lib/api/types";

interface DependencySelectorProps {
  epicId: string;
  teamId: string;
  currentDependencies: string[];
  onDependenciesChange: (deps: string[]) => void;
}

export function DependencySelector({
  epicId,
  teamId,
  currentDependencies,
  onDependenciesChange,
}: DependencySelectorProps) {
  const [open, setOpen] = useState(false);
  const [epics, setEpics] = useState<Epic[]>([]);

  useEffect(() => {
    if (!open) return;
    epicsApi
      .list({ teamId, limit: 200 })
      .then((res) => {
        setEpics(
          res.data.filter((e) => e.id !== epicId && e.status !== "completed")
        );
      })
      .catch(() => setEpics([]));
  }, [teamId, epicId, open]);

  function toggle(id: string) {
    if (currentDependencies.includes(id)) {
      onDependenciesChange(currentDependencies.filter((d) => d !== id));
    } else {
      onDependenciesChange([...currentDependencies, id]);
    }
  }

  function remove(id: string) {
    onDependenciesChange(currentDependencies.filter((d) => d !== id));
  }

  const selectedEpics = epics.filter((e) => currentDependencies.includes(e.id));

  return (
    <div className="space-y-2">
      {selectedEpics.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedEpics.map((epic) => (
            <Badge key={epic.id} variant="secondary" className="gap-1 pr-1">
              <span className="font-mono text-xs">{epic.identifier}</span>
              <span className="max-w-[120px] truncate">{epic.name}</span>
              <button
                type="button"
                onClick={() => remove(epic.id)}
                className="ml-1 rounded-sm hover:bg-muted"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-3 w-3" />
        <span>Add dependency</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 gap-0 max-w-md">
          <DialogHeader className="px-4 pt-4 pb-0">
            <DialogTitle>Select dependencies</DialogTitle>
          </DialogHeader>
          <Command className="rounded-none border-0">
            <CommandInput placeholder="Search epics..." />
            <CommandList>
              <CommandEmpty>No epics found.</CommandEmpty>
              <CommandGroup>
                {epics.map((epic) => (
                  <CommandItem
                    key={epic.id}
                    value={`${epic.identifier} ${epic.name}`}
                    onSelect={() => toggle(epic.id)}
                  >
                    <Check
                      className={`mr-2 h-4 w-4 ${
                        currentDependencies.includes(epic.id)
                          ? "opacity-100"
                          : "opacity-0"
                      }`}
                    />
                    <span className="font-mono text-xs mr-2 text-muted-foreground">
                      {epic.identifier}
                    </span>
                    <span className="truncate">{epic.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
          <div className="px-4 pb-4 pt-2 flex justify-end">
            <Button size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
