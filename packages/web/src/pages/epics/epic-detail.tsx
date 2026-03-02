import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from '@tanstack/react-query';
import { sessionsApi } from "@/lib/api/sessions";
import { useEpic, useUpdateEpic, useDeleteEpic, useArchiveEpic, useUnarchiveEpic, useCompleteEpic, useReopenEpic, useDispatchEpic } from "@/hooks/queries/use-epics";
import { usePreflightCheck, useRecordOverride } from "@/hooks/queries/use-preflight";
import { PreflightBadge, PreflightDetailPanel, PreflightOverrideDialog } from "@/components/preflight";
import { useToast } from "@/hooks/useToast";
import { IssuesList } from "@/components/issues/issues-list";
import { FeatureForm } from "@/components/features/feature-form";
import { MarkdownRenderer } from "@/components/common/markdown-renderer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Rocket, Plus, Trash2, Check, X, MoreHorizontal, ChevronDown, ChevronRight, Archive, ArchiveRestore, FileText, ExternalLink, AlertTriangle, Clock, CheckCircle2, RotateCcw } from "lucide-react";
import { format } from "date-fns";
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
  const completeEpic = useCompleteEpic();
  const reopenEpic = useReopenEpic();
  const dispatchEpic = useDispatchEpic();
  const { toast } = useToast();
  const [optimisticDispatched, setOptimisticDispatched] = useState(false);

  // Derive dispatched state from active session — persists across navigation
  const { data: activeSessionData, refetch: refetchActiveSession } = useQuery({
    queryKey: ['activeSession', epicId],
    queryFn: async () => {
      if (!epicId) return null;
      try {
        const result = await sessionsApi.getActive(epicId);
        return result.data ?? null;
      } catch {
        return null; // 404 = no active session
      }
    },
    enabled: !!epicId,
    refetchInterval: 10000,
  });
  const { data: lastSessionData } = useQuery({
    queryKey: ['lastSession', epicId],
    queryFn: async () => {
      if (!epicId) return null;
      try {
        const result = await sessionsApi.getLast(epicId);
        return result.data ?? null;
      } catch {
        return null;
      }
    },
    enabled: !!epicId,
  });
  const dispatched = !!activeSessionData || optimisticDispatched;
  const hasRunBefore = !!lastSessionData;

  // Pre-flight gate state
  const { data: preflightData } = usePreflightCheck(epicId ?? "");
  const recordOverride = useRecordOverride();
  const [showPreflightPanel, setShowPreflightPanel] = useState(false);
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);

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

  const handleComplete = async () => {
    await completeEpic.mutateAsync(epic.id);
  };

  const handleReopen = async () => {
    await reopenEpic.mutateAsync(epic.id);
  };

  const doDispatch = async () => {
    try {
      const result = await dispatchEpic.mutateAsync(epic.id);
      setOptimisticDispatched(true);
      // Clear optimistic after 30s — server poll will have caught up by then
      setTimeout(() => setOptimisticDispatched(false), 30000);
      void refetchActiveSession();
      toast(result.data.message);
    } catch {
      toast("Dispatch failed — could not trigger implementation.");
    }
  };

  const handleDispatch = async () => {
    // If preflight data exists and failed, show the gate panel instead of dispatching
    if (preflightData && !preflightData.passed) {
      setShowPreflightPanel(true);
      return;
    }
    await doDispatch();
  };

  const handleOverrideConfirm = async (reason: string) => {
    if (!epicId || !preflightData) return;
    const failedCheckNames = preflightData.checks
      .filter((c) => !c.passed)
      .map((c) => c.checkName);
    try {
      await recordOverride.mutateAsync({ epicId, reason, issues: failedCheckNames });
      setShowOverrideDialog(false);
      setShowPreflightPanel(false);
      await doDispatch();
    } catch {
      toast("Override failed — could not record the override.");
    }
  };

  const isCompleted = epic.status === 'completed';


  return (
    <div className="h-full flex flex-col">
      {/* Completion Banner */}
      {isCompleted && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-green-50 dark:bg-green-950 border-b border-green-200 dark:border-green-800 text-green-800 dark:text-green-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium">
            Epic completed{epic.completedAt ? ` on ${format(new Date(epic.completedAt), 'MMM d, yyyy')}` : ''}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 text-green-800 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900"
            onClick={() => void handleReopen()}
            disabled={reopenEpic.isPending}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            {reopenEpic.isPending ? 'Reopening...' : 'Reopen'}
          </Button>
        </div>
      )}

      {/* Header - Clean top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-background overflow-hidden">
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
              {epic.identifier && (
                <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                  {epic.identifier}
                </span>
              )}
              <h1
                className={`text-lg font-semibold truncate transition-colors ${!epic.isArchived && !isCompleted ? 'cursor-pointer hover:text-muted-foreground' : 'cursor-default'}`}
                onClick={() => {
                  if (!epic.isArchived && !isCompleted) {
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
              {!epic.isArchived && isCompleted && (
                <Badge className="gap-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  <CheckCircle2 className="h-3 w-3" />
                  Completed
                </Badge>
              )}
              {/* Creator Attribution */}
              {epic.creator && (
                <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground ml-2 pl-2 border-l shrink-0">
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
                <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground ml-2 pl-2 border-l shrink-0">
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

        <div className="flex items-center gap-2 shrink-0">
          {epic.isArchived ? (
            <Button size="sm" variant="outline" onClick={handleUnarchive} disabled={unarchiveEpic.isPending}>
              <ArchiveRestore className="h-4 w-4 mr-1.5" />
              {unarchiveEpic.isPending ? "Restoring..." : "Restore Epic"}
            </Button>
          ) : !isCompleted ? (
            <div className="relative">
              <Button
                size="sm"
                onClick={() => void handleDispatch()}
                disabled={dispatchEpic.isPending || dispatched}
                className={dispatched ? "bg-blue-400 cursor-not-allowed text-white" : "bg-blue-600 hover:bg-blue-700 text-white"}
              >
                <Rocket className="h-4 w-4 mr-1.5" />
                {dispatchEpic.isPending ? "Dispatching..." : dispatched ? "Implementing..." : hasRunBefore ? "Resume Implementation" : "Start Implementation"}
              </Button>
              {preflightData && !preflightData.passed && (
                <PreflightBadge
                  issueCount={preflightData.checks.filter((c) => !c.passed).length}
                  onClick={() => setShowPreflightPanel((v) => !v)}
                />
              )}
            </div>
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
                  {!isCompleted && import.meta.env.VITE_SHOW_CREATION_FORMS === 'true' && (
                    <DropdownMenuItem onClick={() => setIsFeatureFormOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      New Feature
                    </DropdownMenuItem>
                  )}
                  {!isCompleted ? (
                    <DropdownMenuItem onClick={() => void handleComplete()}>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      {completeEpic.isPending ? 'Completing...' : 'Mark as Complete'}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={() => void handleReopen()}>
                      <RotateCcw className="h-4 w-4 mr-2" />
                      {reopenEpic.isPending ? 'Reopening...' : 'Reopen Epic'}
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

      {/* Pre-flight detail panel */}
      {showPreflightPanel && preflightData && !preflightData.passed && (
        <div className="px-4 pb-2">
          <PreflightDetailPanel
            checks={preflightData.checks}
            onOverride={() => {
              setShowPreflightPanel(false);
              setShowOverrideDialog(true);
            }}
            onDismiss={() => setShowPreflightPanel(false)}
          />
        </div>
      )}

      {/* Pre-flight override dialog */}
      <PreflightOverrideDialog
        open={showOverrideDialog}
        issues={preflightData?.checks.filter((c) => !c.passed).map((c) => c.checkName) ?? []}
        isLoading={recordOverride.isPending}
        onConfirm={(reason) => void handleOverrideConfirm(reason)}
        onCancel={() => setShowOverrideDialog(false)}
      />

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
