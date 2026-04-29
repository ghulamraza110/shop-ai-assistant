import re
from typing import Any, Optional
import os
import requests
from .models import Product
def extract_budget(query: str) -> Optional[float]:
    q = query.lower()
    patterns = [
        r"under\s*\$?\s*([\d,]+)(k)?",
        r"below\s*\$?\s*([\d,]+)(k)?",
        r"budget\s*\$?\s*([\d,]+)(k)?",
        r"under\s*rs\.?\s*([\d,]+)(k)?",
        r"under\s*pkr\s*([\d,]+)(k)?",
    ]
    for pattern in patterns:
        match = re.search(pattern, q)
        if match:
            val = float(match.group(1).replace(",", ""))
            if match.group(2) == 'k':
                val *= 1000
            return val
    return None
def parse_price_number(price: str) -> Optional[float]:
    match = re.search(r"([\d,]+(?:\.\d+)?)", price)
    if not match:
        return None
    return float(match.group(1).replace(",", ""))
def apply_budget_filter(products: list[Product], budget: Optional[float]) -> list[Product]:
    if budget is None:
        return products
    kept: list[Product] = []
    for product in products:
        value = parse_price_number(product.price)
        if value is None or value <= budget:
            kept.append(product)
    return kept
ALLOWED_DOMAINS = [
    "daraz.pk",
    "olx.com.pk",
    "priceoye.pk",
    "naheed.pk",
    "shophive.com",
    "homeshopping.pk",
    "telemart.pk",
    "ishopping.pk",
    "sapphireonline.pk",
    "goto.com.pk",
    "clicky.pk",
    "elo.pk"
]
def search_products_serpapi(query: str, limit: int = 8) -> list[Product]:
    api_key = os.getenv("SERPAPI_API_KEY")
    if not api_key:
        return []

    def do_search(q: str, engine: str = "google"):
        params = {
            "engine": engine,
            "q": q,
            "google_domain": "google.com.pk",
            "gl": "pk",
            "hl": "en",
            "api_key": api_key,
        }
        try:
            resp = requests.get(
                "https://serpapi.com/search.json",
                params=params,
                timeout=20,
            )
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException:
            return {}

    # 1. Try organic search on ALLOWED_DOMAINS
    site_filter = " OR ".join([f"site:{domain}" for domain in ALLOWED_DOMAINS])
    domain_query = f"{query} ({site_filter})"
    
    payload = do_search(domain_query, "google")
    results = payload.get("organic_results", [])
    
    # 2. If no results on allowed domains, try general web search
    if not results:
        payload = do_search(query, "google")
        results = payload.get("organic_results", [])

    normalized: list[Product] = []
    for item in results[:limit]:
        title = item.get("title")
        link = item.get("link")
        if not title or not link:
            continue
            
        snippet = item.get("snippet") or "Based on recent web search."
        thumbnail = item.get("thumbnail")
        
        # Try to find a price in rich snippets or text
        price = "Price unavailable"
        rich_snippet = item.get("rich_snippet", {})
        if "top" in rich_snippet and "extensions" in rich_snippet["top"]:
            exts = rich_snippet["top"]["extensions"]
            if exts and any(symbol in exts[0] for symbol in ["$", "Rs", "PKR", "£", "€"]):
                price = exts[0]

        normalized.append(
            Product(
                name=title,
                brand=item.get("source") or "Web Result",
                price=price,
                rating=4.5,
                summary=snippet,
                pros=[],
                cons=[],
                category=None,
                image_url=thumbnail,
                purchase_url=link,
            )
        )
    return normalized
