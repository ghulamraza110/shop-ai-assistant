import sys
import os
sys.path.insert(0, os.path.abspath('backend/langgraph_backend'))
from app.graph import GraphState, route_node

state = {"query": "I need a phone", "history": []}
try:
    print(route_node(state))
except Exception as e:
    import traceback
    traceback.print_exc()
