import { useState } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth-store";
import { Sidebar } from "./sidebar";
import { CommandPalette } from "@/components/common/command-palette";
import { LiveIndicator } from "@/components/live-indicator";
import { ToastContainer } from "@/components/toast-container";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";

export function AppLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop sidebar — hidden below md */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Mobile sidebar — Sheet drawer, below md only */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-64">
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <header className="flex items-center px-4 py-3 border-b border-border bg-background md:justify-end md:px-6">
          {/* Hamburger button — mobile only */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden mr-2"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* App name — mobile only */}
          <span className="font-semibold md:hidden flex-1">Dispatcher</span>

          {/* Live indicator */}
          <div className="hidden sm:flex">
            <LiveIndicator />
          </div>
        </header>

        {/* Main content area */}
        <main className="flex-1 overflow-auto min-w-0">
          <Outlet />
        </main>
      </div>

      <CommandPalette />
      <ToastContainer />
    </div>
  );
}
