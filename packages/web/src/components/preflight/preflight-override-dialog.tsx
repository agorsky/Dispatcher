import { useState } from "react";
import { AlertTriangle } from "lucide-react";
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

interface PreflightOverrideDialogProps {
  open: boolean;
  issues: string[];
  isLoading?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

const MIN_REASON_LENGTH = 10;

export function PreflightOverrideDialog({
  open,
  issues,
  isLoading,
  onConfirm,
  onCancel,
}: PreflightOverrideDialogProps) {
  const [reason, setReason] = useState("");
  const canConfirm = reason.trim().length >= MIN_REASON_LENGTH;

  const handleConfirm = () => {
    if (canConfirm) {
      onConfirm(reason.trim());
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Override Pre-Flight Gate
          </DialogTitle>
          <DialogDescription>
            You are about to override failed pre-flight checks and proceed with dispatch.
            This override will be logged for compliance review.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {issues.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-1">Issues being overridden:</p>
              <ul className="text-sm text-muted-foreground space-y-0.5">
                {issues.map((issue, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <span className="text-amber-500">•</span>
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <label className="text-sm font-medium block mb-1.5">
              Reason for override{" "}
              <span className="text-muted-foreground font-normal">
                (minimum {MIN_REASON_LENGTH} characters)
              </span>
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why you are proceeding despite failing pre-flight checks..."
              rows={4}
              className={reason.length > 0 && !canConfirm ? "border-red-400" : ""}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {reason.length}/{MIN_REASON_LENGTH} minimum characters
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!canConfirm || isLoading}
          >
            {isLoading ? "Overriding..." : "Confirm Override & Dispatch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
