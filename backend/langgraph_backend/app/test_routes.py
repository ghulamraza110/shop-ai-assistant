"""
Verify all graph routes work properly.
Tests: product_search, price_compare, recommend, review_analysis, chitchat

Run:  python -m app.test_routes
"""
import os, sys, json

# Ensure we can import the app package
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/..")

from app.graph import assistant_graph, build_graph, GraphState
from app.tools import extract_budget, search_products_serpapi
from langchain_core.messages import HumanMessage

# ─── 1. Validate graph structure ───────────────────────────────────────────
print("=" * 60)
print("1. GRAPH STRUCTURE VALIDATION")
print("=" * 60)

graph = build_graph()
node_names = list(graph.get_graph().nodes.keys())
print(f"   Nodes: {node_names}")

expected_nodes = {"__start__", "route", "chitchat", "products", "budget", "__end__"}
missing = expected_nodes - set(node_names)
extra = set(node_names) - expected_nodes
if missing:
    print(f"   ❌ MISSING nodes: {missing}")
elif extra:
    print(f"   ⚠️  Extra nodes (not necessarily wrong): {extra}")
else:
    print("   ✅ All expected nodes present")

# Validate edges
edges = graph.get_graph().edges
print(f"   Edges: {[(e.source, e.target) for e in edges]}")

# ─── 2. Validate GraphState has search_query ───────────────────────────────
print("\n" + "=" * 60)
print("2. GRAPHSTATE KEYS VALIDATION")
print("=" * 60)
state_keys = list(GraphState.__annotations__.keys())
print(f"   State keys: {state_keys}")
if "search_query" in state_keys:
    print("   ✅ search_query is declared in GraphState")
else:
    print("   ❌ search_query MISSING from GraphState")

# ─── 3. Test budget extraction ─────────────────────────────────────────────
print("\n" + "=" * 60)
print("3. BUDGET EXTRACTION")
print("=" * 60)
budget_tests = [
    ("best phones under 50k", 50000.0),
    ("laptop below $1500", 1500.0),
    ("phones under Rs 100000", 100000.0),
    ("hello how are you", None),
]
for query, expected in budget_tests:
    result = extract_budget(query)
    status = "✅" if result == expected else "❌"
    print(f"   {status} '{query}' -> {result} (expected {expected})")

# ─── 4. Test SerpAPI connection ────────────────────────────────────────────
print("\n" + "=" * 60)
print("4. SERPAPI CONNECTION TEST")
print("=" * 60)
api_key = os.getenv("SERPAPI_API_KEY")
if not api_key:
    print("   ⚠️  SERPAPI_API_KEY not set, skipping")
else:
    try:
        results = search_products_serpapi("iphone 15", limit=3)
        print(f"   Got {len(results)} products")
        for p in results:
            has_img = "✅" if p.image_url else "❌"
            has_link = "✅" if p.purchase_url else "❌"
            has_price = "✅" if p.price != "Price unavailable" else "❌"
            print(f"   {has_img}img {has_link}link {has_price}price | {p.name[:50]}... | {p.price}")
    except Exception as e:
        print(f"   ❌ SerpAPI error: {e}")

# ─── 5. Test each route via graph invoke ───────────────────────────────────
print("\n" + "=" * 60)
print("5. ROUTE INVOCATION TESTS")
print("=" * 60)

test_queries = [
    ("hi there how are you", "chitchat"),
    ("best phones under 50k", "product_search"),
    ("compare iphone 15 vs samsung s24", "price_compare"),
    ("recommend me a good laptop for coding", "recommend"),
    ("what do reviews say about airpods pro", "review_analysis"),
]

for query, expected_mode in test_queries:
    print(f"\n   Testing: '{query}' (expect: {expected_mode})")
    try:
        import uuid
        result = assistant_graph.invoke(
            {
                "query": query,
                "history": [],
                "messages": [HumanMessage(content=query)],
            },
            config={"configurable": {"thread_id": f"test-{uuid.uuid4().hex[:8]}"}},
        )
        mode = result.get("mode", "???")
        content_preview = (result.get("content") or "")[:80]
        products = result.get("products", [])
        
        mode_ok = "✅" if mode == expected_mode else f"⚠️ got {mode}"
        print(f"   {mode_ok} mode={mode}")
        print(f"   📝 content: {content_preview}...")
        print(f"   📦 products: {len(products)}")
        
        if products:
            p = products[0]
            name = p.get("name", "?")
            img = "✅" if p.get("image_url") else "❌"
            link = "✅" if p.get("purchase_url") else "❌"
            print(f"   First product: {name[:40]} | img:{img} link:{link}")
    except Exception as e:
        print(f"   ❌ Error: {e}")

print("\n" + "=" * 60)
print("DONE — All route tests completed")
print("=" * 60)
