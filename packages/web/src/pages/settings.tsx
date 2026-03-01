import { useState } from "react";
import { Plus } from "lucide-react";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/hooks/use-theme";
import { useTokens, useRevokeToken } from "@/hooks/queries/use-tokens";
import { usersApi } from "@/lib/api/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiKeyList } from "@/components/settings/api-key-list";
import { CreateApiKeyDialog } from "@/components/settings/create-api-key-dialog";

/** Common IANA timezone identifiers. Uses the runtime's full list when available. */
const TIMEZONE_OPTIONS: string[] =
  typeof (Intl as Record<string, unknown>).supportedValuesOf === "function"
    ? (Intl as unknown as { supportedValuesOf(key: string): string[] }).supportedValuesOf("timeZone")
    : [
        "UTC",
        "America/New_York",
        "America/Chicago",
        "America/Denver",
        "America/Los_Angeles",
        "America/Anchorage",
        "Pacific/Honolulu",
        "Europe/London",
        "Europe/Berlin",
        "Europe/Paris",
        "Asia/Tokyo",
        "Asia/Shanghai",
        "Asia/Kolkata",
        "Australia/Sydney",
      ];

const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function SettingsPage() {
  const { data: currentUser } = useCurrentUser();
  const user = currentUser?.data;
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();
  const [name, setName] = useState(user?.name ?? "");
  const [timeZone, setTimeZone] = useState(user?.timeZone ?? browserTimeZone);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreateKeyDialogOpen, setIsCreateKeyDialogOpen] = useState(false);

  // API Keys
  const { data: tokens, isLoading: isLoadingTokens } = useTokens();
  const revokeToken = useRevokeToken();

  const handleSaveProfile = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      await usersApi.update(user.id, { name, timeZone });
      await queryClient.invalidateQueries({ queryKey: ["current-user"] });
    } catch (e) {
      console.error("Failed to save profile:", e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl">
      <h1 className="text-xl md:text-2xl font-semibold mb-6">Settings</h1>

      {/* Profile Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Manage your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={user?.email ?? ""} disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Display Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => { setName(e.target.value); }}
            />
          </div>
          <Button onClick={() => { handleSaveProfile(); }} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </CardContent>
      </Card>

      {/* Preferences Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>Customize your experience</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Dark Mode</div>
              <div className="text-sm text-muted-foreground">
                Use dark theme
              </div>
            </div>
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Timezone</div>
              <div className="text-sm text-muted-foreground">
                Used for activity dashboard and date display
              </div>
            </div>
            <Select value={timeZone} onValueChange={setTimeZone}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {TIMEZONE_OPTIONS.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => { handleSaveProfile(); }} disabled={isSaving} size="sm">
            {isSaving ? "Saving..." : "Save Preferences"}
          </Button>
        </CardContent>
      </Card>

      {/* Personal API Keys Section */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Personal API keys</CardTitle>
              <CardDescription>
                Use Dispatcher's API to build your own integrations
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() => { setIsCreateKeyDialogOpen(true); }}
            >
              <Plus className="h-4 w-4 mr-1" />
              New API key
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingTokens ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              Loading API keys...
            </div>
          ) : (
            <>
              {tokens && tokens.length > 0 && (
                <div className="text-sm text-muted-foreground mb-4">
                  {tokens.length} API {tokens.length === 1 ? "key" : "keys"}
                </div>
              )}
              <ApiKeyList
                tokens={tokens ?? []}
                onRevoke={(id) => { revokeToken.mutate(id); }}
                isRevoking={revokeToken.isPending}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Create API Key Dialog */}
      <CreateApiKeyDialog
        open={isCreateKeyDialogOpen}
        onOpenChange={setIsCreateKeyDialogOpen}
      />


    </div>
  );
}
