# Shop-ai

Shop-ai is an AI shopping assistant designed to reduce decision fatigue in e-commerce.  
Instead of relying on static filters and keyword search, it uses a single supervisor agent with tool-based modes for search, recommendation, comparison, and review analysis to deliver practical product results with images, ratings, and purchase links.

## Introduction

E-commerce platforms often overwhelm users with too many options. Traditional systems are mostly static and do not reason across multiple constraints.  
Shop-ai addresses this by mimicking human-like decision-making with a structured, tool-driven agent workflow.

## Problem Statement

Users struggle to:
- Find relevant products quickly
- Compare multiple options efficiently
- Get personalized recommendations
- Stay within budget constraints

Existing systems commonly miss:
- Context awareness
- Intelligent reasoning
- Multi-step decision-making
- Visual and actionable results (images, ratings, links)

## Objectives

Shop-ai aims to:
- Build a tool-driven shopping assistant
- Use structured orchestration and shared state
- Provide product search via web APIs/scraping
- Generate smart recommendations
- Perform LLM-powered product comparison
- Offer budget-aware suggestions
- Return images, ratings, and purchase links in final responses

## Proposed Solution

The system uses a **single supervisor LLM agent** that always responds through a structured tool call:
- **Mode selection**: `product_search`, `price_compare`, `recommend`, `review_analysis`, or `chitchat`
- **Structured output**: intro text + normalized product cards
- **Product cards**: name, brand, price, rating, summary, pros, cons, category

This preserves specialization while simplifying runtime orchestration, since one agent chooses behavior and returns actionable output in one pass.

## System Architecture

- **Frontend (Next.js)**
  - Query input and chat interaction
  - Product cards with images, ratings, and links
  - Comparison view and chat history

- **Supervisor Agent Layer (Supabase Edge Function)**
  - Single LLM agent with tool-call output contract
  - Mode selection + response generation in one request
  - Conversation context handling from recent chat history

- **Tool Schema Layer**
  - `return_shopping_response` function tool
  - Enforces typed response (`mode`, `intro`, `products[]`)
  - Standardizes response payload for frontend rendering

- **Database Layer (Supabase)**
  - Product cache
  - Search history
  - User preferences

## Methodology

1. **User Input**  
   User submits query (example: "best mobile under 100k").

2. **Single-Agent Reasoning + Tool Call**  
   Supervisor agent chooses mode and returns structured output via function tool.

3. **Response Generation**  
   Final output includes:
   - Product images
   - Ratings
   - Purchase links
   - Comparison summary/table

## Tools and Technologies

- **Tool Calling (LLM Functions)**: Structured and typed assistant responses
- **LangChain**: LLM integration (OpenRouter, GPT-4o-mini)
- **Next.js**: Frontend user interface
- **Supabase**: Storage and caching
- **Python + Node.js**: Core backend and app logic
- **Web scraping / Product APIs**: External product data ingestion

## High-Level Flow

```text
User Interface (Next.js)
        |
Supabase Edge Function (chat-agents)
        |
Single Supervisor LLM Agent
        |
Function Tool: return_shopping_response
        |
Mode: search | compare | recommend | review | chitchat
        |
Structured Product Cards + Intro
        |
Supabase (Conversations, Messages, Product Payloads)
```

## Why This Design

A single-agent + tool-call architecture gives:
- Lower orchestration complexity
- Faster iteration and maintenance
- Consistent response format for UI cards
- Clear intent classification through `mode`
- Practical shopping outputs with explainable tradeoffs

## LangGraph Backend (New)

A standalone Python backend is now scaffolded in `backend/langgraph_backend` using:
- FastAPI for HTTP API
- LangGraph for workflow orchestration
- LangChain + OpenRouter-compatible chat model for LLM calls
- SerpAPI (Google Shopping) for live web product retrieval

### Backend Workflow

The LangGraph flow is:
1. `route` node -> decides mode (`product_search`, `price_compare`, `recommend`, `review_analysis`, `chitchat`)
2. Conditional branch:
   - `chitchat` -> short conversational response
   - `products` -> SerpAPI retrieval + structured products + intro
3. `budget` node -> optional budget filtering from query text (`under 500`, `under Rs 100000`, etc.)
4. Final response returned to API caller

### Run Locally

```bash
cd backend/langgraph_backend
python -m venv .venv
# Windows PowerShell
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Set your values in `.env`:
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL` (default: `openai/gpt-4o-mini`)
- `OPENROUTER_BASE_URL` (default: `https://openrouter.ai/api/v1`)
- `SERPAPI_API_KEY` (for live shopping search results)

Start server:

```bash
uvicorn app.main:app --reload --port 8000
```

### API Endpoints

- `GET /health` -> health check
- `POST /chat` -> invoke LangGraph assistant

`POST /chat` request body:

```json
{
  "message": "best phones under 100k",
  "history": [
    { "role": "user", "content": "hi" },
    { "role": "assistant", "content": "Hello! What products are you looking for?" }
  ]
}
```

Response shape:
- `mode`: chosen workflow mode
- `content`: assistant intro text
- `products`: normalized product card array

### Connect Supabase Function -> LangGraph

Your frontend already calls Supabase function `chat-agents`.  
That function is now wired to proxy requests to the LangGraph backend URL.

Set this Supabase function secret:

```bash
supabase secrets set LANGGRAPH_BACKEND_URL=http://localhost:8000
```

Then deploy/update the function:

```bash
supabase functions deploy chat-agents
```

For production, set `LANGGRAPH_BACKEND_URL` to your deployed backend domain instead of localhost.
