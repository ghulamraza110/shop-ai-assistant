import os
from typing import Any, Literal, TypedDict
from dotenv import load_dotenv
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from .models import Product, ProductResponse, RouterDecision
from .tools import apply_budget_filter, extract_budget, search_products_serpapi
load_dotenv()
class GraphState(TypedDict, total=False):
    query: str
    history: list[dict[str, str]]
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
def _llm() -> ChatOpenAI:
    return ChatOpenAI(
        model=os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini"),
        api_key=os.getenv("OPENROUTER_API_KEY"),
        base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        temperature=0.2,
    )
def _build_messages(state: GraphState, system_prompt: str):
    messages = [SystemMessage(content=system_prompt)]
    for item in state.get("history", [])[-10:]:
        if item["role"] == "assistant":
            messages.append(AIMessage(content=item["content"]))
        else:
            messages.append(HumanMessage(content=item["content"]))
    messages.append(HumanMessage(content=state["query"]))
    return messages
def _norm(text: str) -> str:
    return "".join(ch.lower() if ch.isalnum() or ch.isspace() else " " for ch in text)
def _token_overlap_score(a: str, b: str) -> float:
    a_tokens = {t for t in _norm(a).split() if t}
    b_tokens = {t for t in _norm(b).split() if t}
    if not a_tokens or not b_tokens:
        return 0.0
    overlap = len(a_tokens & b_tokens)
    return overlap / max(len(a_tokens), len(b_tokens))
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
    return {"content": reply.content, "products": []}
def products_node(state: GraphState) -> GraphState:
    mode = state["mode"]
    query_text = state.get("query", "")
    wants_link = any(
        token in query_text.lower()
        for token in ["buy", "link", "purchase", "where can i buy", "shop", "order"]
    )
    mode_prompt = {
        "product_search": "Return relevant products matching the user query. Respect the exact number of products if the user specifies one, otherwise return 3-6.",
        "price_compare": "Return products with summaries that compare tradeoffs. If the user asks to compare exactly 2 products, return exactly 2. Respect any specified count.",
        "recommend": "Return ranked best-fit recommendations. Respect the exact number of products if specified.",
        "review_analysis": "Return products with reviewer sentiment in summaries. Respect the exact number of products if specified.",
    }[mode]
    search_term = state.get("search_query") or state.get("query", "")
    serp_products = search_products_serpapi(search_term)
    search_context = ""
    if serp_products:
        lines = []
        for idx, p in enumerate(serp_products[:8], start=1):
            lines.append(
                f"{idx}. {p.name} | price={p.price} | rating={p.rating} | "
                f"brand={p.brand or 'unknown'} | link={p.purchase_url or 'n/a'} | "
                f"image={p.image_url or 'n/a'}"
            )
        search_context = "\n".join(lines)
    if wants_link and serp_products:
        # Deterministic "buy link" behavior: return real shopping results directly.
        actionable = [p for p in serp_products if p.purchase_url] or serp_products
        top = actionable[:5]
        intro_lines = ["Here are direct purchase options I found:"]
        for idx, product in enumerate(top, start=1):
            if product.purchase_url:
                intro_lines.append(f"{idx}. {product.name}: {product.purchase_url}")
        return {
            "content": "\n".join(intro_lines),
            "products": [p.model_dump() for p in top],
            "search_context": search_context,
        }
    structured = _llm().with_structured_output(ProductResponse)
    result = structured.invoke(
        _build_messages(
            state,
            f"""You are a shopping assistant.
{mode_prompt}
Use realistic prices and ratings.
If user mentions PKR/Rs/k use rupee format, otherwise use dollars.
Keep summary practical and concise.
Always return valid structured output.
Never say you cannot provide links. If shopping links are available, provide them through purchase_url.
If user asks to buy or asks for a link, prioritize products with valid purchase_url.
Web search evidence (SerpAPI Google Shopping), if present:
{search_context if search_context else "No live shopping results available; use best-effort product knowledge."}
When search evidence exists, prefer those products and preserve image_url/purchase_url from evidence where possible.""",
        )
    )
    # Backfill missing URLs/images from SerpAPI by exact name and fuzzy token overlap.
    serp_lookup = {p.name.strip().lower(): p for p in serp_products}
    final_products = []
    used_serp_indices: set[int] = set()
    for i, product in enumerate(result.products):
        key = product.name.strip().lower()
        source = serp_lookup.get(key)
        if source:
            source_index = next(
                (idx for idx, sp in enumerate(serp_products) if sp.name.strip().lower() == key),
                None,
            )
            if source_index is not None:
                used_serp_indices.add(source_index)
        else:
            best_idx = None
            best_score = 0.0
            for idx, candidate in enumerate(serp_products):
                if idx in used_serp_indices:
                    continue
                score = _token_overlap_score(product.name, candidate.name)
                if score > best_score:
                    best_score = score
                    best_idx = idx
            if best_idx is not None and best_score >= 0.35:
                source = serp_products[best_idx]
                used_serp_indices.add(best_idx)
            elif i < len(serp_products):
                # Final fallback keeps cards actionable even if names drift.
                source = serp_products[i]
                used_serp_indices.add(i)
        if source:
            if not product.purchase_url and source.purchase_url:
                product.purchase_url = source.purchase_url
            if not product.image_url and source.image_url:
                product.image_url = source.image_url
            if (not product.brand) and source.brand:
                product.brand = source.brand
        else:
            product.purchase_url = None
            product.image_url = None
        final_products.append(product)
    if wants_link:
        # Keep actionable products first when user explicitly asks to buy/link.
        final_products.sort(key=lambda p: (p.purchase_url is None, -(p.rating or 0)))
    content = result.intro
    if wants_link:
        first_link = next((p.purchase_url for p in final_products if p.purchase_url), None)
        if first_link:
            content = f"{result.intro}\n\nDirect buy link: {first_link}"
    return {
        "content": content,
        "products": [p.model_dump() for p in final_products],
        "search_context": search_context,
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
    return graph.compile()
assistant_graph = build_graph()