import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useEpic, useUpdateEpic, useDeleteEpic, useArchiveEpic, useUnarchiveEpic } from "@/hooks/queries/use-epics";
import { IssuesList } from "@/components/issues/issues-list";
import { FeatureForm } from "@/components/features/feature-form";
import { MarkdownRenderer } from "@/components/common/markdown-renderer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Plus, Trash2, Check, X, MoreHorizontal, ChevronDown, ChevronRight, Archive, ArchiveRestore, FileText, ExternalLink, AlertTriangle, Clock } from "lucide-react";
import { PlanView } from "@/components/execution-plan";
import { DetailTabs, TabsContent } from "@/components/detail-tabs/detail-tabs";
import { SessionMonitor } from "@/components/session";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function EpicDetailPage() {
  const { epicId } = useParams<{ epicId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: epic, isLoading } = useEpic(epicId ?? "");
  const updateEpic = useUpdateEpic();
  const deleteEpic = useDeleteEpic();
  const archiveEpic = useArchiveEpic();
  const unarchiveEpic = useUnarchiveEpic();

  const [isFeatureFormOpen, setIsFeatureFormOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  
  // Initialize active tab from URL params or default to 'overview'
  const initialTab = (searchParams.get('tab') as 'overview' | 'plan' | 'monitor') || 'overview';
  const [activeTab, setActiveTab] = useState<'overview' | 'plan' | 'monitor'>(initialTab);

  // Update URL when tab changes (for deep linking and persistence)
  useEffect(() => {
    const currentTab = searchParams.get('tab');
    if (currentTab !== activeTab) {
      const newParams = new URLSearchParams(searchParams);
      if (activeTab === 'overview') {
        // Remove tab param for overview (default)
        newParams.delete('tab');
      } else {
        newParams.set('tab', activeTab);
      }
      setSearchParams(newParams, { replace: true });
    }
  }, [activeTab, searchParams, setSearchParams]);

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-6 w-full animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (!epic) {
    return (
      <div className="p-4 md:p-6">
        <p className="text-muted-foreground">Epic not found</p>
        <Button variant="ghost" onClick={() => navigate("/epics")} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to epics
        </Button>
      </div>
    );
  }

  const handleNameSave = async () => {
    if (editedName.trim() && editedName !== epic.name) {
      await updateEpic.mutateAsync({
        id: epic.id,
        name: editedName.trim(),
      });
    }
    setIsEditingName(false);
  };

  const handleDelete = async () => {
    await deleteEpic.mutateAsync(epic.id);
    navigate("/epics");
  };

  const handleArchive = async () => {
    await archiveEpic.mutateAsync(epic.id);
    setShowArchiveDialog(false);
    navigate("/epics");
  };

  const handleUnarchive = async () => {
    await unarchiveEpic.mutateAsync(epic.id);
  };


  return (
    <div className="h-full flex flex-col">
      {/* Header - Clean top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-background">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/epics")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        
        <div className="flex-1 min-w-0">
          {isEditingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                className="text-lg font-semibold h-8"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleNameSave();
                  if (e.key === "Escape") setIsEditingName(false);
                }}
              />
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleNameSave}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setIsEditingName(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1
                className="text-lg font-semibold truncate cursor-pointer hover:text-muted-foreground transition-colors"
                onClick={() => {
                  if (!epic.isArchived) {
                    setEditedName(epic.name);
                    setIsEditingName(true);
                  }
                }}
              >
                {epic.name}
              </h1>
              {epic.isArchived && (
                <Badge variant="secondary" className="gap-1">
                  <Archive className="h-3 w-3" />
                  Archived
                </Badge>
              )}
              {/* Creator Attribution */}
              {epic.creator && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-2 pl-2 border-l">
                  <Avatar className="h-5 w-5">
                    <AvatarFallback className="text-[9px]">
                      {epic.creator.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate max-w-[120px]">{epic.creator.name}</span>
                  <span>•</span>
                  <span>{new Date(epic.createdAt).toLocaleDateString()}</span>
                </div>
              )}
              {/* Implementer Attribution */}
              {epic.implementer && epic.implementedDate && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-2 pl-2 border-l">
                  <Check className="h-3 w-3 text-green-500" />
                  <Avatar className="h-5 w-5">
                    <AvatarFallback className="text-[9px]">
                      {epic.implementer.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate max-w-[120px]">{epic.implementer.name}</span>
                  <span>•</span>
                  <span>{new Date(epic.implementedDate).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {epic.isArchived ? (
            <Button size="sm" variant="outline" onClick={handleUnarchive} disabled={unarchiveEpic.isPending}>
              <ArchiveRestore className="h-4 w-4 mr-1.5" />
              {unarchiveEpic.isPending ? "Restoring..." : "Restore Epic"}
            </Button>
          ) : import.meta.env.VITE_SHOW_CREATION_FORMS === 'true' ? (
            <Button size="sm" onClick={() => setIsFeatureFormOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              New Feature
            </Button>
          ) : null}
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {epic.isArchived ? (
                <>
                  <DropdownMenuItem onClick={handleUnarchive}>
                    <ArchiveRestore className="h-4 w-4 mr-2" />
                    Restore Epic
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Permanently
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  {import.meta.env.VITE_SHOW_CREATION_FORMS === 'true' && (
                    <DropdownMenuItem onClick={() => setIsFeatureFormOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      New Feature
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setShowArchiveDialog(true)}>
                    <Archive className="h-4 w-4 mr-2" />
                    Archive Epic
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Epic
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Collapsible Description Section */}
      {(epic.description || epic.structuredDesc) && (
        <div className="border-b bg-muted/30">
          <button
            className="flex items-center gap-2 w-full px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
          >
            {isDescriptionExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <span>Epic Description</span>
            {epic.structuredDesc?.riskLevel && (
              <Badge variant={epic.structuredDesc.riskLevel === "high" ? "destructive" : epic.structuredDesc.riskLevel === "medium" ? "secondary" : "outline"} className="ml-2 text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {epic.structuredDesc.riskLevel} risk
              </Badge>
            )}
            {epic.structuredDesc?.estimatedEffort && (
              <Badge variant="outline" className="ml-1 text-xs">
                <Clock className="h-3 w-3 mr-1" />
                {epic.structuredDesc.estimatedEffort}
              </Badge>
            )}
          </button>
          {!isDescriptionExpanded && epic.structuredDesc?.summary && (
            <div className="px-4 pb-3">
              <p className="text-sm text-muted-foreground line-clamp-2">{epic.structuredDesc.summary}</p>
            </div>
          )}
          {isDescriptionExpanded && (
            <div className="px-4 pb-4 space-y-3">
              {/* Description */}
              {epic.description && (
                <div className="bg-background rounded-lg border p-4">
                  <MarkdownRenderer
                    content={epic.description}
                    className="text-sm"
                  />
                </div>
              )}

              {/* Structured Summary (only if no description or different from description) */}
              {epic.structuredDesc?.summary && !epic.description && (
                <div className="bg-background rounded-lg border p-4">
                  <MarkdownRenderer
                    content={epic.structuredDesc.summary}
                    className="text-sm"
                  />
                </div>
              )}

              {/* AI Instructions */}
              {epic.structuredDesc?.aiInstructions && (
                <div className="bg-background rounded-lg border p-4">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">AI Instructions</h4>
                  <MarkdownRenderer content={epic.structuredDesc.aiInstructions} className="text-sm" />
                </div>
              )}

              {/* Acceptance Criteria */}
              {epic.structuredDesc?.acceptanceCriteria && epic.structuredDesc.acceptanceCriteria.length > 0 && (
                <div className="bg-background rounded-lg border p-4">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Acceptance Criteria</h4>
                  <ul className="space-y-1">
                    {epic.structuredDesc.acceptanceCriteria.map((criterion, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-muted-foreground mt-0.5">&#9744;</span>
                        <span>{criterion}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Files Involved */}
              {epic.structuredDesc?.filesInvolved && epic.structuredDesc.filesInvolved.length > 0 && (
                <div className="bg-background rounded-lg border p-4">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                    <FileText className="h-3 w-3 inline mr-1" />
                    Files Involved
                  </h4>
                  <ul className="space-y-0.5">
                    {epic.structuredDesc.filesInvolved.map((file, i) => (
                      <li key={i} className="text-sm font-mono text-muted-foreground">{file}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Technical Notes */}
              {epic.structuredDesc?.technicalNotes && (
                <div className="bg-background rounded-lg border p-4">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Technical Notes</h4>
                  <MarkdownRenderer content={epic.structuredDesc.technicalNotes} className="text-sm" />
                </div>
              )}

              {/* External Links */}
              {epic.structuredDesc?.externalLinks && epic.structuredDesc.externalLinks.length > 0 && (
                <div className="bg-background rounded-lg border p-4">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                    <ExternalLink className="h-3 w-3 inline mr-1" />
                    External Links
                  </h4>
                  <ul className="space-y-1">
                    {epic.structuredDesc.externalLinks.map((link, i) => (
                      <li key={i}>
                        <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                          {link.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab Navigation and Content */}
      <div className="flex-1 overflow-auto">
        <DetailTabs
          tabs={[
            { id: 'overview', label: 'Overview' },
            { id: 'plan', label: 'Plan' },
            { id: 'monitor', label: 'Session Monitor' }
          ]}
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab as 'overview' | 'plan' | 'monitor');
          }}
        >
          <TabsContent value="overview" className="h-full">
            {epicId && <IssuesList epicId={epicId} />}
          </TabsContent>
          
          <TabsContent value="plan" className="h-full">
            {epicId && <PlanView epicId={epicId} />}
          </TabsContent>

          <TabsContent value="monitor" className="h-full">
            {epicId && <SessionMonitor epicId={epicId} />}
          </TabsContent>
        </DetailTabs>
      </div>

      {/* Feature form */}
      {import.meta.env.VITE_SHOW_CREATION_FORMS === 'true' && epicId && (
        <FeatureForm
          open={isFeatureFormOpen}
          onOpenChange={setIsFeatureFormOpen}
          defaultEpicId={epicId}
        />
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Epic</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{epic.name}"? This will also
              delete all features in this epic. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowArchiveDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleArchive}
              disabled={archiveEpic.isPending}
            >
              {archiveEpic.isPending ? "Archiving..." : "Archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
