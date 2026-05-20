import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Send, Loader2, Plus, MessageSquare, Trash2, Sparkles, Bot, User as UserIcon,
  PanelLeftClose, PanelLeftOpen, Search, Scale, MessageSquareQuote, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ProductCard, type Product } from "@/components/product-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

interface Conversation { id: string; title: string; updated_at: string; }
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  agent?: string | null;
  products?: Product[] | null;
  created_at: string;
}

const SUGGESTIONS = [
  "Find me best phones under 50k",
  "Compare iPhone 15 vs Samsung S24",
  "Best laptop for video editing under $1500",
  "What do reviewers say about Sony WH-1000XM5?",
];

const agentMeta: Record<string, { label: string; icon: any; color: string }> = {
  product_search: { label: "Product Search", icon: Search, color: "text-primary" },
  price_compare: { label: "Price Comparison", icon: Scale, color: "text-accent" },
  recommend: { label: "Recommendation", icon: Sparkles, color: "text-primary" },
  review_analysis: { label: "Review Analysis", icon: MessageSquareQuote, color: "text-accent" },
  chitchat: { label: "Assistant", icon: Bot, color: "text-muted-foreground" },
};

const Chat = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth >= 1024;
    }
    return true;
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  const [sidebarWidth, setSidebarWidth] = useState(288);
  const [isResizing, setIsResizing] = useState(false);
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  useEffect(() => {
    setIsLargeScreen(window.innerWidth >= 1024);
    const handleResize = () => setIsLargeScreen(window.innerWidth >= 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const startResizing = (e: React.SyntheticEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing) {
        const newWidth = Math.max(200, Math.min(window.innerWidth * 0.85, e.clientX));
        setSidebarWidth(newWidth);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isResizing && e.touches[0]) {
        const newWidth = Math.max(200, Math.min(window.innerWidth * 0.85, e.touches[0].clientX));
        setSidebarWidth(newWidth);
      }
    };

    const handleStopResizing = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleStopResizing);
      window.addEventListener("touchmove", handleTouchMove, { passive: true });
      window.addEventListener("touchend", handleStopResizing);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleStopResizing);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleStopResizing);
    };
  }, [isResizing]);

  // Auth gate
  useEffect(() => {
    if (!authLoading && !user) navigate("/auth", { replace: true });
  }, [authLoading, user, navigate]);

  // Load conversation list
  const loadConversations = async () => {
    const { data } = await supabase
      .from("conversations")
      .select("id, title, updated_at")
      .order("updated_at", { ascending: false });
    setConversations(data ?? []);
  };

  useEffect(() => { if (user) loadConversations(); }, [user]);

  // Load messages for active conversation
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", activeId)
        .order("created_at");
      setMessages((data ?? []) as unknown as Message[]);
    })();
  }, [activeId]);

  // Autoscroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const newChat = () => { setActiveId(null); setMessages([]); setInput(""); };

  const deleteConv = async (id: string) => {
    await supabase.from("conversations").delete().eq("id", id);
    if (activeId === id) newChat();
    loadConversations();
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setSending(true);
    setInput("");

    // Optimistic user message
    const tempUser: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, tempUser]);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const { data, error } = await supabase.functions.invoke("chat-agents", {
        body: { conversationId: activeId, message: content, history },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const newConvId = data.conversationId as string;
      if (!activeId) setActiveId(newConvId);

      const assistantMsg: Message = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: data.content ?? "",
        agent: data.agent,
        products: data.products ?? [],
        created_at: new Date().toISOString(),
      };
      setMessages((m) => [...m, assistantMsg]);
      loadConversations();
    } catch (e: any) {
      let msg = e?.message ?? "Something went wrong";
      const raw = e?.context?.body;
      if (raw && typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.error) msg = parsed.error;
        } catch {
          // ignore parse errors and use generic message
        }
      }
      if (msg.includes("non-2xx")) {
        msg = "Edge function failed. Most likely LANGGRAPH_BACKEND_URL is not publicly reachable from Supabase.";
      }
      toast.error(msg.includes("429") ? "Rate limit reached, try again shortly." : msg);
      setMessages((m) => m.filter((x) => x.id !== tempUser.id));
    } finally {
      setSending(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Sidebar Overlay for Mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        style={sidebarOpen ? { width: `${sidebarWidth}px` } : undefined}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border/60 bg-sidebar lg:static lg:translate-x-0 lg:relative",
          !isResizing && "transition-transform duration-300 ease-in-out",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:w-0 lg:translate-x-0 overflow-hidden",
        )}
      >
        <div
          className={cn("flex flex-col h-full overflow-hidden w-full relative", !sidebarOpen && "pointer-events-none opacity-0 lg:pointer-events-auto lg:opacity-100")}
        >
          <div className="p-3">
            <div className="mb-3 flex items-center justify-between">
              <Link to="/" className="flex items-center gap-2 px-2 py-1">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary">
                  <Sparkles className="h-4 w-4 text-primary-foreground" />
                </div>
                <span className="font-display font-bold">
                  Shop<span className="text-gradient-primary">AI</span>
                </span>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 lg:hidden text-muted-foreground hover:text-foreground"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close sidebar"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </div>
            <Button onClick={() => { newChat(); if (window.innerWidth < 1024) setSidebarOpen(false); }} className="w-full justify-start gap-2 bg-gradient-primary border-0 hover:opacity-90">
              <Plus className="h-4 w-4" /> New chat
            </Button>
          </div>

          <ScrollArea className="flex-1 px-2">
            <div className="space-y-1 pb-4">
              {conversations.length === 0 && (
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                  No conversations yet.
                </p>
              )}
              {conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setActiveId(c.id); if (window.innerWidth < 1024) setSidebarOpen(false); }}
                  className={cn(
                    "group flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    activeId === c.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/60",
                  )}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />
                  <span className="flex-1 break-words text-left text-xs sm:text-sm leading-snug line-clamp-2" title={c.title}>
                    {c.title}
                  </span>
                  <Trash2
                    className="h-3.5 w-3.5 shrink-0 opacity-70 transition-opacity hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); deleteConv(c.id); }}
                  />
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
        {/* Sidebar drag handle */}
        <div
          onMouseDown={startResizing}
          onTouchStart={startResizing}
          className={cn(
            "absolute top-0 bottom-0 -right-3 w-6 cursor-col-resize z-50 flex items-center justify-center group"
          )}
        >
          {/* Centered grip indicator line (thin line on hover) */}
          <div className={cn(
            "absolute inset-y-0 left-1/2 -translate-x-1/2 w-[1px] bg-border transition-colors group-hover:bg-primary/50",
            isResizing && "bg-primary"
          )} />

          {/* Centered grip symbol */}
          <div className={cn(
            "relative h-10 w-4 rounded-full border border-border/80 bg-background shadow-md flex items-center justify-center transition-all group-hover:scale-110 group-hover:border-primary/50 group-hover:shadow-lg",
            isResizing && "scale-110 border-primary shadow-glow-sm"
          )}>
            <div className="flex flex-col gap-1">
              <span className="w-1 h-1 rounded-full bg-muted-foreground/60 transition-colors group-hover:bg-primary" />
              <span className="w-1 h-1 rounded-full bg-muted-foreground/60 transition-colors group-hover:bg-primary" />
              <span className="w-1 h-1 rounded-full bg-muted-foreground/60 transition-colors group-hover:bg-primary" />
              <span className="w-1 h-1 rounded-full bg-muted-foreground/60 transition-colors group-hover:bg-primary" />
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 items-center justify-between border-b border-border/60 px-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen((s) => !s)}>
              {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </Button>
            <span className="font-display text-sm font-medium text-muted-foreground">
              LangGraph Shopping Assistant
            </span>
          </div>
          <div className="flex items-center gap-1">
            {activeId && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => deleteConv(activeId)}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Delete chat
              </Button>
            )}
            <ThemeToggle />
            <Button variant="ghost" size="sm" asChild>
              <Link to="/">Home</Link>
            </Button>
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4">
              <div className="mx-auto max-w-2xl text-center animate-fade-in-up">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
                  <Sparkles className="h-7 w-7 text-primary-foreground" />
                </div>
                <h2 className="mt-6 font-display text-3xl font-bold">
                  How can I help you <span className="text-gradient-primary">shop</span> today?
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Ask anything — I will reason and respond with structured shopping results.
                </p>
                <div className="mt-8 grid gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-xl border border-border/60 bg-card/40 p-4 text-left text-sm transition-all hover:border-primary/40 hover:bg-card hover:shadow-md animate-fade-in-up"
                      style={{ animationDelay: `${i * 80}ms` }}
                    >
                      "{s}"
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              {sending && (
                <div className="flex items-start gap-3 animate-fade-in">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-primary">
                    <Bot className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Thinking with LangGraph...
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-border/60 bg-background/80 p-4 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask about products, comparisons, recommendations…"
              rows={1}
              className="min-h-[52px] max-h-32 resize-none rounded-xl border-border/60 bg-card text-sm focus-visible:ring-primary"
              disabled={sending}
            />
            <Button
              size="icon"
              onClick={() => send()}
              disabled={sending || !input.trim()}
              className="h-[52px] w-[52px] shrink-0 rounded-xl bg-gradient-primary border-0 hover:opacity-90"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="mx-auto mt-2 max-w-4xl text-center text-xs text-muted-foreground">
            ShopAI can make mistakes. Verify important details before purchasing.
          </p>
        </div>
      </main>
    </div>
  );
};

/** Strip markdown formatting characters from content text */
function cleanContent(text: string): string {
  return text
    .replace(/\*+/g, "")            // remove all asterisks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [text](url) -> text
    .replace(/#{1,6}\s*/g, "")       // remove heading markers
    .replace(/`/g, "")              // remove backticks
    .trim();
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const meta = message.agent ? agentMeta[message.agent] : null;
  const Icon = meta?.icon ?? Bot;

  // Filter products that have a valid purchase url
  const productsWithLinks = message.products?.filter(p => p.purchase_url && p.purchase_url.startsWith("http")) ?? [];

  // Clean the display content of any markdown symbols
  const displayContent = isUser ? message.content : cleanContent(message.content);

  return (
    <div className={cn("flex items-start gap-3 animate-fade-in", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          isUser ? "bg-secondary" : "bg-gradient-primary shadow-md",
        )}
      >
        {isUser ? (
          <UserIcon className="h-4 w-4 text-secondary-foreground" />
        ) : (
          <Icon className="h-4 w-4 text-primary-foreground" />
        )}
      </div>
      <div className={cn("flex-1 space-y-3", isUser && "flex flex-col items-end")}>
        {!isUser && meta && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span className={meta.color}>●</span> {meta.label} agent
          </div>
        )}

        {/* Instant Purchase Links — shown at top of assistant messages when real direct links are available */}
        {!isUser && productsWithLinks.length > 0 && (
          <div className="flex flex-col gap-2 rounded-2xl bg-primary/10 border border-primary/20 p-4 shadow-elegant animate-fade-in-up max-w-[85%]">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Direct Buy Links
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Tap any product to go directly to the merchant page — no scrolling needed:
            </p>
            <div className="flex flex-col gap-2 mt-1">
              {productsWithLinks.slice(0, 3).map((p, i) => (
                <Button
                  key={i}
                  asChild
                  className="w-full gap-2 justify-start bg-gradient-primary text-primary-foreground font-semibold hover:opacity-90 shadow-md transition-all duration-300 py-4"
                >
                  <a href={p.purchase_url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4 shrink-0" />
                    <span className="truncate flex-1 text-left text-sm">{p.name}</span>
                    <span className="ml-auto bg-primary-foreground/20 px-2.5 py-0.5 rounded text-xs shrink-0 font-bold whitespace-nowrap">
                      {p.price}
                    </span>
                  </a>
                </Button>
              ))}
            </div>
            {productsWithLinks.length > 3 && (
              <p className="text-xs text-muted-foreground text-center mt-1">
                +{productsWithLinks.length - 3} more below ↓
              </p>
            )}
          </div>
        )}

        <div
          className={cn(
            "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
            isUser
              ? "bg-gradient-primary text-primary-foreground"
              : "bg-muted text-foreground",
          )}
        >
          {displayContent}
        </div>
        {message.products && message.products.length > 0 && (
          <div className="grid w-full gap-3 grid-cols-1 sm:grid-cols-2">
            {message.products.map((p, i) => (
              <ProductCard key={i} product={p} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Chat;
