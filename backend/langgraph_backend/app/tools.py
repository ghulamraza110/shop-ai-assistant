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
            if match.group(2) == "k":
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


def _is_stable_image_url(url: Optional[str]) -> bool:
    """Return True only for publicly accessible, non-expiring image URLs.

    SerpAPI session-scoped cache URLs (serpapi.com/searches/.../images/...)
    expire within minutes once a search session is cleaned up, causing broken
    images on the client.  Google encrypted thumbnails (encrypted-tbn*.gstatic)
    are hotlink-protected and frequently fail when loaded cross-origin.
    We reject both and fall back to the original image URL from google_images.
    """
    if not url:
        return False
    # SerpAPI's own CDN cache — session-scoped, expires quickly
    if "serpapi.com/searches/" in url:
        return False
    # Google encrypted/thumbnail proxy — hotlink protected, breaks cross-origin
    if "encrypted-tbn" in url:
        return False
    return True


def search_products_serpapi(query: str, limit: int = 8) -> list[Product]:
    """Search for products using SerpAPI Google Shopping engine.

    Uses `engine=google_shopping` for structured product data with real
    merchant links, prices, ratings, and thumbnail images.  Falls back to
    organic Google search + a Google Images lookup for stable image URLs
    when Shopping returns no results.
    """
    api_key = os.getenv("SERPAPI_API_KEY")
    if not api_key:
        return []

    def _request(params: dict) -> dict:
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

    # ------------------------------------------------------------------ #
    # 1. Try Google Shopping — best source: structured price, link, image #
    # ------------------------------------------------------------------ #
    shopping_payload = _request(
        {
            "engine": "google_shopping",
            "q": query,
            "gl": "pk",
            "hl": "en",
            "api_key": api_key,
        }
    )
    shopping_results = shopping_payload.get("shopping_results", [])

    if shopping_results:
        normalized: list[Product] = []
        for item in shopping_results[:limit]:
            title = item.get("title")
            if not title:
                continue

            raw_price = item.get("extracted_price")
            price_str = item.get("price", "Price unavailable")
            if raw_price and "Rs" not in price_str and "PKR" not in price_str:
                price_str = price_str if price_str != "Price unavailable" else f"${raw_price}"

            rating = item.get("rating")
            reviews = item.get("reviews")

            # Shopping thumbnails come from Google's own CDN — stable links
            image_url: Optional[str] = item.get("thumbnail")

            normalized.append(
                Product(
                    name=title,
                    brand=item.get("source") or (item.get("seller") or {}).get("name") or None,
                    price=price_str,
                    rating=float(rating) if rating else 0.0,
                    summary=(
                        item.get("snippet")
                        or f"Available from {item.get('source', 'online retailer')}."
                        + (f" ({reviews} reviews)" if reviews else "")
                    ),
                    pros=[],
                    cons=[],
                    category=item.get("product_id"),
                    image_url=image_url,
                    purchase_url=item.get("link"),
                )
            )
        return normalized

    # ------------------------------------------------------------------ #
    # 2. Fallback: organic Google search for titles, links, snippets      #
    # ------------------------------------------------------------------ #
    organic_payload = _request(
        {
            "engine": "google",
            "q": query + " buy",
            "gl": "pk",
            "hl": "en",
            "api_key": api_key,
        }
    )
    results = organic_payload.get("organic_results", [])

    # ------------------------------------------------------------------ #
    # 3. Fetch stable product images via Google Images (one extra call)   #
    # "original" URLs point directly to the source site's image —        #
    # they are permanent and not session-scoped like SerpAPI's cache.    #
    # ------------------------------------------------------------------ #
    images_payload = _request(
        {
            "engine": "google_images",
            "q": query,
            "gl": "pk",
            "hl": "en",
            "api_key": api_key,
        }
    )
    image_items = images_payload.get("images_results", [])
    stable_images: list[str] = [
        img["original"]
        for img in image_items
        if img.get("original") and _is_stable_image_url(img.get("original"))
    ]

    normalized = []
    img_idx = 0
    for item in results[:limit]:
        title = item.get("title")
        link = item.get("link")
        if not title or not link:
            continue

        snippet = item.get("snippet") or "Based on web search."

        # Use organic thumbnail only when it is a stable public URL;
        # otherwise pull the next available image from the Images search.
        organic_thumb: Optional[str] = item.get("thumbnail")
        if _is_stable_image_url(organic_thumb):
            image_url = organic_thumb
        elif img_idx < len(stable_images):
            image_url = stable_images[img_idx]
            img_idx += 1
        else:
            image_url = None

        # Try to extract price from rich snippets
        price = "Price unavailable"
        rich_snippet = item.get("rich_snippet", {})
        if "top" in rich_snippet and "extensions" in rich_snippet["top"]:
            exts = rich_snippet["top"]["extensions"]
            if exts and any(sym in exts[0] for sym in ["$", "Rs", "PKR", "£", "€"]):
                price = exts[0]

        normalized.append(
            Product(
                name=title,
                brand=item.get("source") or "Web Result",
                price=price,
                rating=float(item.get("rating", 0)) if item.get("rating") else 0.0,
                summary=snippet,
                pros=[],
                cons=[],
                category=None,
                image_url=image_url,
                purchase_url=link,
            )
        )
    return normalized
