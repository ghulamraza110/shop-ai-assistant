from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .graph import assistant_graph
from .models import ChatRequest, FinalResponse

app = FastAPI(title="Assistiverse LangGraph Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
@app.get("/")
async def root():
    return {"message": "Backend is running!"}

@app.get("/health")
def health():
    return {"ok": True}


@app.post("/chat", response_model=FinalResponse)
def chat(payload: ChatRequest):
    state = assistant_graph.invoke(
        {
            "query": payload.message,
            "history": [m.model_dump() for m in payload.history],
        }
    )
    return FinalResponse(
        mode=state.get("mode", "product_search"),
        content=state.get("content", "Here is what I found."),
        products=state.get("products", []),
    )
