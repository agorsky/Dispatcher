import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface BlockingEpic {
  identifier: string;
  name: string;
}

interface DependencyOverrideDialogProps {
  epicId: string;
  blockingEpics: BlockingEpic[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<void>;
}

const MIN_REASON_LENGTH = 10;

export function DependencyOverrideDialog({
  blockingEpics,
  open,
  onOpenChange,
  onConfirm,
}: DependencyOverrideDialogProps) {
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const canConfirm = reason.trim().length >= MIN_REASON_LENGTH && !isLoading;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setIsLoading(true);
    try {
      await onConfirm(reason.trim());
      setReason("");
      onOpenChange(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-amber-500" />
            Override Dependency Block
          </DialogTitle>
          <DialogDescription>
            This epic is blocked by unresolved dependencies. Overriding will log a reason
            for compliance review. The blocking epics must be completed before dispatch
            under normal conditions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {blockingEpics.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Blocking epics:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                {blockingEpics.map((epic) => (
                  <li key={epic.identifier} className="flex items-center gap-1.5">
                    <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                      {epic.identifier}
                    </span>
                    <span>{epic.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Reason for override{" "}
              <span className="text-muted-foreground font-normal">
                (min {MIN_REASON_LENGTH} characters)
              </span>
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this dependency block is being overridden..."
              rows={3}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">
              {reason.trim().length}/{MIN_REASON_LENGTH} min
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleConfirm()}
            disabled={!canConfirm}
          >
            {isLoading ? "Recording..." : "Override & Proceed"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
