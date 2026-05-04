import "https://deno.land/x/xhr@0.1.0/mod.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LANGGRAPH_BACKEND_URL = Deno.env.get("LANGGRAPH_BACKEND_URL");
if (!LANGGRAPH_BACKEND_URL) {
  console.warn("LANGGRAPH_BACKEND_URL is not configured for chat-agents.");
}
const MODE_LABELS: Record<
  "product_search" | "price_compare" | "recommend" | "review_analysis" | "chitchat",
  string
> = {
  product_search: "Product Search",
  price_compare: "Price Comparison",
  recommend: "Recommendation",
  review_analysis: "Review Analysis",
  chitchat: "Chitchat",
};
async function callLangGraph(
  message: string,
  history: Array<{ role: string; content: string }>,
  thread_id?: string,
) {
  if (!LANGGRAPH_BACKEND_URL) throw new Error("LANGGRAPH_URL_NOT_CONFIGURED");
  const base = LANGGRAPH_BACKEND_URL.replace(/\/+$/, "");
  let response: Response;
  try {
    response = await fetch(`${base}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true"
      },
      body: JSON.stringify({ message, history, thread_id }),
    });
  } catch (_err) {
    throw new Error("LANGGRAPH_UNREACHABLE");
  }
  if (!response.ok) {
    const text = await response.text();
    if (response.status === 429) throw new Error("RATE_LIMIT");
    throw new Error(`LANGGRAPH_BACKEND_ERROR:${response.status}:${text}`);
  }
  return await response.json();
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    // --- Auth ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { conversationId, message, history = [] } = await req.json();
    if (!message || typeof message !== "string" || message.length > 2000) {
      return new Response(JSON.stringify({ error: "Invalid message" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // --- Ensure conversation exists ---
    let convId = conversationId as string | undefined;
    if (!convId) {
      const title = message.slice(0, 60);
      const { data: conv, error } = await supabase
        .from("conversations")
        .insert({ user_id: user.id, title })
        .select("id")
        .single();
      if (error) throw error;
      convId = conv.id;
    }
    // --- Persist user message ---
    await supabase.from("messages").insert({
      conversation_id: convId,
      user_id: user.id,
      role: "user",
      content: message,
    });
    // --- Build conversation context ---
    const context = history.slice(-10).map((m: any) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));
    // --- LANGGRAPH BACKEND CALL ---
    const result = await callLangGraph(message, context, convId);
    const content = result.content ?? "Here's what I found:";
    const agentKey = (result.mode ??
      "product_search") as keyof typeof MODE_LABELS;
    const products = result.products ?? [];
    const agentLabel = MODE_LABELS[agentKey] ?? "Shopping Assistant";
    await supabase.from("messages").insert({
      conversation_id: convId,
      user_id: user.id,
      role: "assistant",
      content,
      agent: agentKey,
      products,
    });
    return new Response(
      JSON.stringify({ conversationId: convId, agent: agentKey, agentLabel, content, products }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("chat-agents error:", e);
    const msg = e?.message ?? "Unknown error";
    if (msg === "LANGGRAPH_URL_NOT_CONFIGURED") {
      return new Response(
        JSON.stringify({ error: "Backend URL not configured. Set LANGGRAPH_BACKEND_URL in Supabase secrets." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (msg === "LANGGRAPH_UNREACHABLE") {
      return new Response(
        JSON.stringify({
          error:
            "LangGraph backend is unreachable from Supabase. Do not use localhost/127.0.0.1 in LANGGRAPH_BACKEND_URL for deployed functions; use a public HTTPS URL.",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (msg === "RATE_LIMIT") {
      return new Response(JSON.stringify({ error: "Rate limit reached. Try again in a minute." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}); 