from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class ChatRequest(BaseModel):
    message: str = Field(..., description="Poruka za agenta")
    agent: str = Field("executor", description="Tip agenta (executor, code, planner, data, debugger)")
    session_id: Optional[str] = Field(None, description="ID sesije (ako nastavak postojeće)")
    model: Optional[str] = Field("default", description="Model za korištenje")
    temperature: Optional[float] = Field(0.7, description="Temperatura za generisanje (0-1)")
    mcp_server: Optional[str] = Field("anthropic", description="MCP server za korištenje")

class AgentResult(BaseModel):
    response: str
    session_id: Optional[str] = None
    agent_used: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None