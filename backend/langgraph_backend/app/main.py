from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uuid

from langchain_core.messages import HumanMessage

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
    # Use provided thread_id (conversation ID) or create a one-off thread.
    thread_id = payload.thread_id or str(uuid.uuid4())

    state = assistant_graph.invoke(
        {
            "query": payload.message,
            "history": [m.model_dump() for m in payload.history],
            "messages": [HumanMessage(content=payload.message)],
        },
        config={"configurable": {"thread_id": thread_id}},
    )
    return FinalResponse(
        mode=state.get("mode", "product_search"),
        content=state.get("content", "Here is what I found."),
        products=state.get("products", []),
    )

