import os, sys
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path("langgraph_backend/app/.env"))

from langchain_openai import ChatOpenAI
from langgraph_backend.app.models import ProductResponse
from langchain_core.messages import SystemMessage, HumanMessage

llm = ChatOpenAI(
    model=os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini"),
    api_key=os.getenv("OPENROUTER_API_KEY"),
    base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
    temperature=0.2,
)

print("Testing structured output...")
s = llm.with_structured_output(ProductResponse)
r = s.invoke([
    SystemMessage(content="You are a shopping assistant. Return 6 specific products. Use real model names, PKR prices, ratings 3.5-4.9, and a short summary."),
    HumanMessage(content="best phone under 50k"),
])

print(f"INTRO: {r.intro}")
print(f"PRODUCTS COUNT: {len(r.products)}")
for p in r.products:
    print(f"  - {p.name} | {p.price} | {p.rating} | {p.summary[:50]}")
