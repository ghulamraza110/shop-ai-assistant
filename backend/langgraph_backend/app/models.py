from typing import Literal, Optional
from pydantic import BaseModel, Field
Mode = Literal[
    "product_search",
    "price_compare",
    "recommend",
    "review_analysis",
    "chitchat",
]
class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: list[ChatMessage] = Field(default_factory=list)
    thread_id: Optional[str] = Field(
        default=None,
        description="Conversation thread ID for checkpointer memory. "
        "If provided, the graph will resume from the last checkpoint "
        "for this thread, enabling follow-up questions.",
    )
class Product(BaseModel):
    name: str
    brand: Optional[str] = None
    price: str
    rating: float
    summary: str
    pros: list[str] = Field(default_factory=list)
    cons: list[str] = Field(default_factory=list)
    category: Optional[str] = None
    image_url: Optional[str] = None
    purchase_url: Optional[str] = None
class RouterDecision(BaseModel):
    mode: Mode
    search_query: str = Field(description="A standalone search query formulated from the user's latest message and chat history. Used for searching products.")
class ProductResponse(BaseModel):
    intro: str
    products: list[Product] = Field(default_factory=list)
class FinalResponse(BaseModel):
    mode: Mode
    content: str
    products: list[Product] = Field(default_factory=list)