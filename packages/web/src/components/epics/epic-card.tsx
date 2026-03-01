import { useState } from "react";
import { Link } from "react-router-dom";
import type { Epic } from "@/lib/api/types";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Folder, MoreVertical, Trash2, Pencil, Archive, ArchiveRestore } from "lucide-react";
import { useDeleteEpic, useArchiveEpic, useUnarchiveEpic } from "@/hooks/queries/use-epics";
import { ApiError } from "@/lib/api/client";
import { formatDistanceToNow } from "date-fns";

interface EpicCardProps {
  epic: Epic;
  onEdit?: (epic: Epic) => void;
}

/**
 * Get user initials for avatar fallback
 */
function getUserInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function EpicCard({ epic, onEdit }: EpicCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [error, setError] = useState("");
  const deleteEpic = useDeleteEpic();
  const archiveEpic = useArchiveEpic();
  const unarchiveEpic = useUnarchiveEpic();

  const handleDelete = async () => {
    setError("");
    try {
      await deleteEpic.mutateAsync(epic.id);
      setShowDeleteDialog(false);
    } catch (err: unknown) {
      console.error("Delete epic error:", err);
      if (err instanceof ApiError) {
        const data = err.data as { error?: { message?: string } } | undefined;
        setError(data?.error?.message || `Error ${err.response.status}: Failed to delete epic`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to delete epic");
      }
    }
  };

  const handleArchive = async () => {
    setError("");
    try {
      await archiveEpic.mutateAsync(epic.id);
      setShowArchiveDialog(false);
    } catch (err: unknown) {
      console.error("Archive epic error:", err);
      if (err instanceof ApiError) {
        const data = err.data as { error?: { message?: string } } | undefined;
        setError(data?.error?.message || `Error ${err.response.status}: Failed to archive epic`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to archive epic");
      }
    }
  };

  const handleUnarchive = async () => {
    setError("");
    try {
      await unarchiveEpic.mutateAsync(epic.id);
    } catch (err: unknown) {
      console.error("Unarchive epic error:", err);
    }
  };

  return (
    <>
      <Card className={`hover:bg-muted/50 transition-colors cursor-pointer group relative ${epic.isArchived ? 'opacity-60' : ''}`}>
        <Link to={`/epics/${epic.id}`}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Folder className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {epic.identifier && (
                    <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                      {epic.identifier}
                    </span>
                  )}
                  <CardTitle className="text-base truncate">{epic.name}</CardTitle>
                  {epic.isArchived && (
                    <Badge variant="secondary" className="gap-1 text-xs">
                      <Archive className="h-3 w-3" />
                      Archived
                    </Badge>
                  )}
                </div>
                {epic.description && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <CardDescription className="truncate cursor-help">
                        {epic.description}
                      </CardDescription>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="start">
                      <p className="max-w-sm">{epic.description}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                {/* Creator attribution and creation date */}
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  {epic.creator && (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-xs bg-muted">
                          {getUserInitials(epic.creator.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span>{epic.creator.name}</span>
                    </div>
                  )}
                  <span>
                    Created {formatDistanceToNow(new Date(epic.createdAt), { addSuffix: true })}
                  </span>
                </div>
              </div>
            </div>
          </CardHeader>
        </Link>
        
        {/* Actions dropdown */}
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {epic.isArchived ? (
                <>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleUnarchive();
                    }}
                  >
                    <ArchiveRestore className="h-4 w-4 mr-2" />
                    Restore
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDeleteDialog(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Permanently
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  {onEdit && (
                    <DropdownMenuItem 
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(epic);
                      }}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowArchiveDialog(true);
                    }}
                  >
                    <Archive className="h-4 w-4 mr-2" />
                    Archive
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDeleteDialog(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Epic</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{epic.name}"? This will also
              delete all features and tasks in this epic. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {error && <div className="text-sm text-destructive">{error}</div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleteEpic.isPending}
            >
              {deleteEpic.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive confirmation dialog */}
      <Dialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive Epic</DialogTitle>
            <DialogDescription>
              Are you sure you want to archive "{epic.name}"? The epic and its features
              will be hidden from the default view but can be restored later.
            </DialogDescription>
          </DialogHeader>
          {error && <div className="text-sm text-destructive">{error}</div>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowArchiveDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleArchive()}
              disabled={archiveEpic.isPending}
            >
              {archiveEpic.isPending ? "Archiving..." : "Archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
