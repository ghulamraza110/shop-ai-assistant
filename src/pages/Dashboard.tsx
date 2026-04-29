import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, MessageSquare, Users, Bot, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SiteHeader } from "@/components/site-header";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

interface MsgRow {
  id: string;
  conversation_id: string;
  user_id: string;
  role: string;
  content: string;
  agent: string | null;
  created_at: string;
}

const agentColor: Record<string, string> = {
  product_search: "bg-primary/15 text-primary border-primary/30",
  price_compare: "bg-accent/15 text-accent border-accent/30",
  recommend: "bg-primary/15 text-primary border-primary/30",
  review_analysis: "bg-accent/15 text-accent border-accent/30",
  chitchat: "bg-muted text-muted-foreground",
};

const Dashboard = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<MsgRow[]>([]);
  const [stats, setStats] = useState({ users: 0, conversations: 0, messages: 0 });

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/auth", { replace: true }); return; }
    if (!isAdmin) { navigate("/chat", { replace: true }); return; }

    (async () => {
      const [{ data: msgs }, { count: convCount }, { data: roles }] = await Promise.all([
        supabase.from("messages").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("conversations").select("*", { count: "exact", head: true }),
        supabase.from("user_roles").select("user_id"),
      ]);

      setMessages((msgs ?? []) as MsgRow[]);
      const uniqueUsers = new Set((roles ?? []).map((r: any) => r.user_id)).size;
      setStats({
        users: uniqueUsers,
        conversations: convCount ?? 0,
        messages: msgs?.length ?? 0,
      });
      setLoading(false);
    })();
  }, [authLoading, user, isAdmin, navigate]);

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const userQueries = messages.filter((m) => m.role === "user");
  const assistantMsgs = messages.filter((m) => m.role === "assistant");

  // Agent usage breakdown
  const agentCounts: Record<string, number> = {};
  for (const m of assistantMsgs) {
    if (m.agent) agentCounts[m.agent] = (agentCounts[m.agent] ?? 0) + 1;
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="container py-10">
        <div className="mb-8 animate-fade-in-up">
          <h1 className="font-display text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor user queries and agent performance across the platform.
          </p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4 animate-fade-in-up">
          <StatCard icon={Users} label="Users" value={stats.users} />
          <StatCard icon={MessageSquare} label="Conversations" value={stats.conversations} />
          <StatCard icon={Bot} label="Total messages" value={stats.messages} />
          <StatCard icon={TrendingUp} label="User queries" value={userQueries.length} />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {/* Agent breakdown */}
          <Card className="border-border/60 p-6 animate-fade-in-up" style={{ animationDelay: "100ms" }}>
            <h2 className="font-display text-lg font-semibold">Agent usage</h2>
            <p className="mt-1 text-xs text-muted-foreground">Last 200 messages</p>
            <div className="mt-5 space-y-3">
              {Object.entries(agentCounts).length === 0 ? (
                <p className="text-sm text-muted-foreground">No data yet.</p>
              ) : (
                Object.entries(agentCounts)
                  .sort(([, a], [, b]) => b - a)
                  .map(([agent, count]) => {
                    const max = Math.max(...Object.values(agentCounts));
                    const pct = (count / max) * 100;
                    return (
                      <div key={agent}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium">{agent.replace("_", " ")}</span>
                          <span className="text-muted-foreground">{count}</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-gradient-primary transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </Card>

          {/* Recent activity */}
          <Card className="border-border/60 p-6 lg:col-span-2 animate-fade-in-up" style={{ animationDelay: "200ms" }}>
            <h2 className="font-display text-lg font-semibold">Recent activity</h2>
            <p className="mt-1 text-xs text-muted-foreground">All users • newest first</p>
            <ScrollArea className="mt-4 h-[480px] pr-3">
              <div className="space-y-3">
                {messages.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">No messages yet.</p>
                )}
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-xl border border-border/60 bg-card/40 p-3 text-sm transition-colors hover:bg-card"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Badge variant={m.role === "user" ? "default" : "secondary"} className="capitalize">
                          {m.role}
                        </Badge>
                        {m.agent && (
                          <Badge variant="outline" className={cn("border", agentColor[m.agent])}>
                            {m.agent.replace("_", " ")}
                          </Badge>
                        )}
                      </div>
                      <span>{new Date(m.created_at).toLocaleString()}</span>
                    </div>
                    <p className="mt-2 line-clamp-3 text-foreground">{m.content}</p>
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                      user: {m.user_id.slice(0, 8)}…
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </Card>
        </div>
      </main>
    </div>
  );
};

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <Card className="border-border/60 p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </div>
      <p className="mt-3 font-display text-3xl font-bold">{value.toLocaleString()}</p>
    </Card>
  );
}

export default Dashboard;
