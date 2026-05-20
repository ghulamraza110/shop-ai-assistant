import os
import re
import requests
from pathlib import Path
from typing import Annotated, Any, Literal, TypedDict, Optional
from urllib.parse import quote_plus
from concurrent.futures import ThreadPoolExecutor
from dotenv import load_dotenv
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.checkpoint.postgres import PostgresSaver
import psycopg
from psycopg.rows import dict_row
from .models import Product, ProductResponse, RouterDecision
from .tools import apply_budget_filter, extract_budget, search_products_serpapi

load_dotenv(Path(__file__).resolve().parent / ".env")


class GraphState(TypedDict, total=False):
    query: str
    history: list[dict[str, str]]
    messages: Annotated[list, add_messages]  # checkpointer accumulates messages
    mode: Literal[
        "product_search",
        "price_compare",
        "recommend",
        "review_analysis",
        "chitchat",
    ]
    content: str
    products: list[dict[str, Any]]
    search_context: str
    search_query: str  # standalone query formulated by router for SerpAPI


def _llm() -> ChatOpenAI:
    return ChatOpenAI(
        model=os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini"),
        api_key=os.getenv("OPENROUTER_API_KEY"),
        base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        temperature=0.2,
        max_tokens=4096,
    )


def _build_messages(state: GraphState, system_prompt: str):
    msgs = [SystemMessage(content=system_prompt)]
    # Prefer checkpointed messages (accumulated across turns by MemorySaver).
    checkpointed = state.get("messages", [])
    if len(checkpointed) > 1:
        msgs.extend(checkpointed[-20:])
    else:
        for item in state.get("history", [])[-10:]:
            if item["role"] == "assistant":
                msgs.append(AIMessage(content=item["content"]))
            else:
                msgs.append(HumanMessage(content=item["content"]))
        msgs.append(HumanMessage(content=state["query"]))
    return msgs


def _clean_markdown(text: str) -> str:
    """Strip markdown formatting so the chat bubble shows clean plain text."""
    text = re.sub(r'\*+', '', text)
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
    text = re.sub(r'#{1,6}\s*', '', text)
    text = re.sub(r'`', '', text)
    return text.strip()


# ─────────────────────────────────────────────────────────────────────────────
# Known e-commerce domains for Pakistan and global markets
# ─────────────────────────────────────────────────────────────────────────────
SHOP_DOMAINS = [
    "daraz.pk", "priceoye.pk", "mega.pk", "whatmobile.com.pk",
    "telemart.pk", "shophive.com", "ishopping.pk", "symbios.pk",
    "amazon.com", "ebay.com", "flipkart.com", "czone.com.pk",
]


def _is_shop_link(url: str) -> bool:
    return any(domain in url for domain in SHOP_DOMAINS)


def route_node(state: GraphState) -> GraphState:
    router = _llm().with_structured_output(RouterDecision)
    decision = router.invoke(
        _build_messages(
            state,
            """You are a shopping intent router.
Choose one mode:
- product_search: discover products
- price_compare: compare products directly
- recommend: best option for need/budget
- review_analysis: what reviewers say
- chitchat: greeting or unrelated chat

Formulate a standalone 'search_query' based on the latest message and history. If the user asks a follow-up, ensure 'search_query' includes the product context.
If the user mentions a specific site (like amazon, daraz, ebay, etc) or a URL, INCLUDE the store name explicitly in the 'search_query' (e.g., 'iphone 15 amazon' or 'laptop daraz').
Return only structured output.""",
        )
    )
    return {"mode": decision.mode, "search_query": decision.search_query}


def chitchat_node(state: GraphState) -> GraphState:
    reply = _llm().invoke(
        _build_messages(
            state,
            "You are a friendly shopping assistant. Keep it short and invite product queries.",
        )
    )
    return {
        "content": _clean_markdown(reply.content),
        "products": [],
        "messages": [AIMessage(content=reply.content)],
    }


def _resolve_product_link(product_name: str) -> dict:
    """Search for a specific product model and return the direct merchant
    product page link (e.g. Daraz, PriceOye, Mega.pk).

    Returns None for purchase_url if no direct link is found.
    Never returns a Google search page as a fallback URL.
    """
    api_key = os.getenv("SERPAPI_API_KEY")
    result = {"purchase_url": None, "image_url": None}

    if not api_key:
        return result

    # 1. Try Google Shopping — direct merchant links
    try:
        resp = requests.get(
            "https://serpapi.com/search.json",
            params={
                "engine": "google_shopping",
                "q": product_name,
                "gl": "pk",
                "hl": "en",
                "api_key": api_key,
            },
            timeout=12,
        )
        if resp.ok:
            for item in resp.json().get("shopping_results", [])[:5]:
                link = item.get("link")
                if link and link.startswith("http") and "google.com" not in link:
                    result["purchase_url"] = link
                    result["image_url"] = item.get("thumbnail")
                    return result
    except Exception as e:
        print(f"Shopping link resolve failed for '{product_name}': {e}")

    # 2. Fallback: Google organic — prefer known e-commerce domains
    try:
        resp = requests.get(
            "https://serpapi.com/search.json",
            params={
                "engine": "google",
                "q": f"{product_name} buy price pakistan",
                "gl": "pk",
                "hl": "en",
                "num": 10,
                "api_key": api_key,
            },
            timeout=12,
        )
        if resp.ok:
            organic = resp.json().get("organic_results", [])
            for item in organic:
                link = item.get("link", "")
                if _is_shop_link(link):
                    result["purchase_url"] = link
                    result["image_url"] = item.get("thumbnail")
                    return result
            for item in organic:
                link = item.get("link", "")
                if (
                    link.startswith("http")
                    and "google.com" not in link
                    and "youtube.com" not in link
                ):
                    result["purchase_url"] = link
                    result["image_url"] = item.get("thumbnail")
                    return result
    except Exception as e:
        print(f"Organic link resolve failed for '{product_name}': {e}")

    # Return None — frontend will hide the Buy button instead of showing a fake link
    return result


def products_node(state: GraphState) -> GraphState:
    """Core product node — SerpAPI-first architecture.

    Priority:
    1. SerpAPI Google Shopping → REAL direct merchant links + real images.
       These are already direct product page URLs (daraz.pk, amazon.com, etc.)
    2. LLM writes a short intro sentence.
    3. LLM enriches summaries for products that have none.
    4. If SerpAPI returns nothing at all, fall back to LLM-generated products
       and then run _resolve_product_link to find real direct links.

    The key insight: SerpAPI shopping_results[*].link is always a real merchant
    product page. We never use a Google search URL as a "purchase" link.
    """
    mode = state["mode"]
    search_term = state.get("search_query") or state.get("query", "")

    # ── 1. Fetch real products from SerpAPI (already have direct URLs) ────
    serp_products = search_products_serpapi(search_term, limit=8)

    # ── 2. Generate short intro via LLM ───────────────────────────────────
    mode_label = {
        "product_search": "search results",
        "price_compare": "price comparison",
        "recommend": "recommendations",
        "review_analysis": "review analysis",
    }.get(mode, "results")

    intro_text = f"Here are the top {mode_label} for your query."
    try:
        intro_reply = _llm().invoke([
            SystemMessage(content=(
                f'You are a friendly shopping assistant. Write ONE short sentence (max 20 words) '
                f'introducing the {mode_label} for: "{search_term}". '
                f'Do NOT list products. Plain text only. No markdown.'
            ))
        ])
        intro_text = _clean_markdown(intro_reply.content.strip())
    except Exception as e:
        print(f"Intro generation failed: {e}")

    # ── 3. Use SerpAPI products if available ──────────────────────────────
    if serp_products:
        final_products = list(serp_products)

        # Enrich missing summaries in a single LLM batch call
        products_no_summary = [p for p in final_products if not p.summary or len(p.summary) < 20]
        if products_no_summary:
            names = "\n".join(f"- {p.name}" for p in products_no_summary)
            try:
                enrich_reply = _llm().invoke([
                    SystemMessage(content=(
                        "For each product below, write ONE sentence summary (max 15 words each). "
                        "Plain text. No markdown. Respond as a numbered list matching the order.\n"
                        f"Products:\n{names}"
                    )),
                ])
                lines = [l.strip() for l in enrich_reply.content.strip().split("\n") if l.strip()]
                clean_lines = [re.sub(r"^\d+\.\s*", "", l) for l in lines]
                for i, p in enumerate(products_no_summary):
                    if i < len(clean_lines):
                        p.summary = _clean_markdown(clean_lines[i])
            except Exception as e:
                print(f"Summary enrichment failed: {e}")

        # Resolve links only for products still missing a direct URL
        # (SerpAPI shopping results normally already have them)
        products_needing_links = [
            p for p in final_products
            if not p.purchase_url or "google.com" in (p.purchase_url or "")
        ]
        if products_needing_links:
            try:
                with ThreadPoolExecutor(max_workers=min(len(products_needing_links), 4)) as executor:
                    futures = {
                        executor.submit(_resolve_product_link, p.name): p
                        for p in products_needing_links
                    }
                    for future, prod in futures.items():
                        res = future.result()
                        if res["purchase_url"]:
                            prod.purchase_url = res["purchase_url"]
                        if not prod.image_url and res.get("image_url"):
                            prod.image_url = res["image_url"]
            except Exception as e:
                print(f"Parallel link resolution failed: {e}")

    else:
        # ── 4. Fallback: LLM generates products when SerpAPI returns nothing ─
        print("SerpAPI returned no results — falling back to LLM product generation.")
        mode_prompt = {
            "product_search": "Return 6 to 8 specific product models that match the user's query.",
            "price_compare": "Return the specific products the user wants to compare. If they mention 2, return exactly 2. Otherwise return 4-6 alternatives.",
            "recommend": "Return 6 to 8 specific product models as ranked best-fit recommendations for the user's needs.",
            "review_analysis": "Return 4-6 specific product models with detailed reviewer sentiment in the summary field.",
        }[mode]

        system_prompt = (
            f"You are an expert shopping assistant for the Pakistani market. {mode_prompt}\n\n"
            "RULES:\n"
            "1. Use SPECIFIC real model names (e.g. 'Samsung Galaxy A54 5G', NOT 'Samsung phone').\n"
            "2. Set realistic prices in PKR/Rs format.\n"
            "3. Set realistic ratings between 3.5 and 4.9.\n"
            "4. Write a 1-2 sentence summary for each product.\n"
            "5. Plain text only, no markdown."
        )

        result = None
        try:
            structured = _llm().with_structured_output(ProductResponse)
            result = structured.invoke(_build_messages(state, system_prompt))
        except Exception as e:
            print(f"LLM fallback structured output failed: {e}")

        if result and result.products:
            final_products = list(result.products)
            if result.intro:
                intro_text = _clean_markdown(result.intro)
        else:
            final_products = []

        # Resolve direct links for LLM-generated products
        if final_products:
            try:
                with ThreadPoolExecutor(max_workers=min(len(final_products), 4)) as executor:
                    futures = {
                        executor.submit(_resolve_product_link, p.name): p
                        for p in final_products
                    }
                    for future, prod in futures.items():
                        res = future.result()
                        if not prod.purchase_url and res["purchase_url"]:
                            prod.purchase_url = res["purchase_url"]
                        if not prod.image_url and res.get("image_url"):
                            prod.image_url = res["image_url"]
            except Exception as e:
                print(f"LLM fallback link resolution failed: {e}")

    # ── 5. Final cleanup pass ──────────────────────────────────────────────
    for product in final_products:
        if not product.price or "unavailable" in product.price.lower():
            product.price = "See price"
        if not product.rating or product.rating <= 0:
            product.rating = round(4.0 + (len(product.name) % 8) * 0.1, 1)
        # Strip any lingering Google search page URLs — no link is better than a fake link
        if product.purchase_url and "google.com/search" in product.purchase_url:
            product.purchase_url = None

    search_context = "\n".join(
        f"{i + 1}. {p.name} | {p.price}" for i, p in enumerate(serp_products[:8])
    ) if serp_products else ""

    return {
        "content": intro_text,
        "products": [p.model_dump() for p in final_products],
        "search_context": search_context,
        "messages": [AIMessage(content=intro_text)],
    }


def budget_node(state: GraphState) -> GraphState:
    budget = extract_budget(state["query"])
    if not budget:
        return {}
    filtered = apply_budget_filter(
        [Product(**p) for p in state.get("products", [])],
        budget,
    )
    return {"products": [p.model_dump() for p in filtered]}


def should_chitchat(state: GraphState) -> str:
    return "chitchat" if state.get("mode") == "chitchat" else "products"


# Persistent PostgreSQL checkpointer using Supabase.
_db_url = os.getenv("DATABASE_URL", "")
if not _db_url:
    raise RuntimeError(
        "DATABASE_URL env var is required for persistent checkpointer. "
        "Set it to your Supabase Postgres connection string."
    )

try:
    _conn = psycopg.Connection.connect(
        _db_url,
        autocommit=True,
        row_factory=dict_row,
        prepare_threshold=None,  # Disable prepared statements (required for Supabase pooler)
    )
    checkpointer = PostgresSaver(conn=_conn)
    checkpointer.setup()
except Exception as exc:
    import traceback
    traceback.print_exc()
    print(f"⚠️  PostgresSaver init failed ({exc}). Falling back to in-memory checkpointer.")
    from langgraph.checkpoint.memory import MemorySaver
    checkpointer = MemorySaver()


def build_graph():
    graph = StateGraph(GraphState)
    graph.add_node("route", route_node)
    graph.add_node("chitchat", chitchat_node)
    graph.add_node("products", products_node)
    graph.add_node("budget", budget_node)
    graph.set_entry_point("route")
    graph.add_conditional_edges(
        "route",
        should_chitchat,
        {"chitchat": "chitchat", "products": "products"},
    )
    graph.add_edge("products", "budget")
    graph.add_edge("budget", END)
    graph.add_edge("chitchat", END)
    return graph.compile(checkpointer=checkpointer)


assistant_graph = build_graph()