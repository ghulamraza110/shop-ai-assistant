import { Link, useNavigate } from "react-router-dom";
import { Sparkles, LogOut, LayoutDashboard, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export function SiteHeader() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/70 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary shadow-glow transition-transform group-hover:scale-110">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight">
            Shop<span className="text-gradient-primary">AI</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          {user ? (
            <>
              <Button variant="ghost" size="sm" asChild className="px-2 sm:px-3">
                <Link to="/chat" className="flex items-center gap-1.5" aria-label="Chat">
                  <MessageSquare className="h-4 w-4" />
                  <span className="hidden sm:inline">Chat</span>
                </Link>
              </Button>
              {isAdmin && (
                <Button variant="ghost" size="sm" asChild className="px-2 sm:px-3">
                  <Link to="/dashboard" className="flex items-center gap-1.5" aria-label="Admin Dashboard">
                    <LayoutDashboard className="h-4 w-4" />
                    <span className="hidden sm:inline">Admin</span>
                  </Link>
                </Button>
              )}
              <ThemeToggle />
              <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out" className="h-8 w-8 sm:h-9 sm:w-9">
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <ThemeToggle />
              <Button variant="ghost" size="sm" asChild className="px-2 sm:px-3">
                <Link to="/auth">Sign in</Link>
              </Button>
              <Button size="sm" asChild className="bg-gradient-primary hover:opacity-90 border-0 px-3 sm:px-4">
                <Link to="/auth?mode=signup">Get started</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
