import { Link } from "react-router-dom";
import { ArrowRight, Search, Scale, Sparkles, MessageSquareQuote, Bot, Shield, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SiteHeader } from "@/components/site-header";

const agents = [
  { icon: Search, name: "Product Search", desc: "Discover products that match your needs across categories." },
  { icon: Scale, name: "Price Comparison", desc: "Side-by-side comparison with realistic pricing & specs." },
  { icon: Sparkles, name: "Recommendations", desc: "Personalized picks ranked from best to budget." },
  { icon: MessageSquareQuote, name: "Review Analysis", desc: "What real reviewers love — and complain about." },
];

const features = [
  { icon: Bot, title: "Multi-agent reasoning", desc: "A LangGraph-style router dispatches your query to the right specialist agent." },
  { icon: Zap, title: "Instant product cards", desc: "Structured results with name, price, rating, pros & cons — not just a wall of text." },
  { icon: Shield, title: "Your data, secured", desc: "Per-user chat history with row-level security. Admins see analytics, never private content." },
];

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-hero">
        <div className="container relative py-24 md:py-36">
          <div className="mx-auto max-w-3xl text-center animate-fade-in-up">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-4 py-1.5 text-xs font-medium backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
              Powered by LangGraph-style multi-agent AI
            </div>

            <h1 className="mt-6 font-display text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl">
              Your AI shopping<br />
              <span className="text-gradient-primary">strategist.</span>
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
              Four specialist agents — search, compare, recommend, analyze reviews — collaborate to help you buy smarter. Just ask in plain English.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" asChild className="bg-gradient-primary border-0 shadow-glow hover:opacity-90 group">
                <Link to="/chat">
                  Start chatting <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/auth?mode=signup">Create account</Link>
              </Button>
            </div>

            <div className="mt-12 grid grid-cols-2 gap-3 text-left sm:grid-cols-4">
              {[
                "Find me best phones under 50k",
                "Compare iPhone vs Samsung",
                "Best laptop for video editing",
                "What do reviewers say about Sony WH-1000XM5",
              ].map((q, i) => (
                <Link
                  key={i}
                  to="/chat"
                  className="rounded-lg border border-border/60 bg-card/40 p-3 text-xs text-muted-foreground backdrop-blur transition-all hover:border-primary/40 hover:bg-card hover:text-foreground animate-fade-in-up"
                  style={{ animationDelay: `${200 + i * 80}ms` }}
                >
                  "{q}"
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Agents */}
      <section className="container py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">The agents</p>
          <h2 className="mt-2 font-display text-4xl font-bold tracking-tight md:text-5xl">
            Four minds working for you.
          </h2>
          <p className="mt-4 text-muted-foreground">
            A router agent reads your question and orchestrates the right specialist. No prompt engineering required.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {agents.map((a, i) => (
            <Card
              key={a.name}
              className="group relative overflow-hidden border-border/60 p-6 transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-elegant animate-fade-in-up"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gradient-primary opacity-0 blur-3xl transition-opacity group-hover:opacity-30" />
              <div className="relative">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary shadow-md">
                  <a.icon className="h-5 w-5 text-primary-foreground" />
                </div>
                <h3 className="mt-5 font-display text-lg font-semibold">{a.name}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{a.desc}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="border-y border-border/40 bg-gradient-mesh py-24">
        <div className="container">
          <div className="grid gap-12 lg:grid-cols-3">
            {features.map((f, i) => (
              <div key={f.title} className="animate-fade-in-up" style={{ animationDelay: `${i * 100}ms` }}>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border/60 bg-background">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mt-5 font-display text-xl font-semibold">{f.title}</h3>
                <p className="mt-2 text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container py-24 text-center">
        <h2 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
          Ready to shop <span className="text-gradient-primary">smarter</span>?
        </h2>
        <p className="mx-auto mt-4 max-w-md text-muted-foreground">
          Free to use. Sign up in seconds and ask your first question.
        </p>
        <Button size="lg" asChild className="mt-8 bg-gradient-primary border-0 shadow-glow hover:opacity-90">
          <Link to="/auth?mode=signup">
            Get started free <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </section>

      <footer className="border-t border-border/40 py-8">
        <div className="container text-center text-xs text-muted-foreground">
          ShopAI — Multi-Agent Shopping Assistant • Final Year Project
        </div>
      </footer>
    </div>
  );
};

export default Index;
