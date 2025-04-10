from fastapi import APIRouter, Depends, HTTPException, Request, File, UploadFile, Form
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
import os
import uuid
import shutil
from pathlib import Path

from utils.mcp_connector import get_mcp_connector

router = APIRouter(prefix="/api/openai", tags=["openai"])

class OpenAIRequest(BaseModel):
    prompt: str
    model: Optional[str] = Field(None, description="Model koji se koristi")
    max_tokens: Optional[int] = Field(None, description="Maksimalni broj tokena za odgovor")
    temperature: float = Field(0.7, description="Temperatura za generisanje teksta")
    system_prompt: Optional[str] = Field(None, description="Sistemski prompt za model")
    session_id: Optional[str] = Field(None, description="ID sesije za nastavak razgovora")

class ChatRequest(BaseModel):
    messages: List[Dict[str, str]] = Field(..., description="Lista poruka u formatu [{'role': 'user', 'content': 'text'}]")
    model: Optional[str] = Field(None, description="Model koji se koristi")
    max_tokens: Optional[int] = Field(None, description="Maksimalni broj tokena za odgovor")
    temperature: float = Field(0.7, description="Temperatura za generisanje teksta")
    system_prompt: Optional[str] = Field(None, description="Sistemski prompt za model")
    session_id: Optional[str] = Field(None, description="ID sesije za nastavak razgovora")

class SessionResponse(BaseModel):
    session_id: str
    metadata: Dict[str, Any] = {}

@router.post("/generate")
async def generate_text(request: OpenAIRequest):
    """
    Generiše tekst koristeći OpenAI model.
    """
    mcp_connector = get_mcp_connector()
    openai_server = mcp_connector.get_server("OpenAI")
    
    if not openai_server:
        raise HTTPException(status_code=503, detail="OpenAI MCP server nije dostupan")
    
    try:
        result = openai_server.generate_text(
            prompt=request.prompt,
            model=request.model,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            system_prompt=request.system_prompt,
            session_id=request.session_id
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Greška pri generisanju teksta: {str(e)}")

@router.post("/chat")
async def chat_completion(request: ChatRequest):
    """
    Generiše odgovor na chat poruke koristeći OpenAI model.
    """
    mcp_connector = get_mcp_connector()
    openai_server = mcp_connector.get_server("OpenAI")
    
    if not openai_server:
        raise HTTPException(status_code=503, detail="OpenAI MCP server nije dostupan")
    
    try:
        result = openai_server.chat_completion(
            messages=request.messages,
            model=request.model,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            system_prompt=request.system_prompt,
            session_id=request.session_id
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Greška pri generisanju odgovora: {str(e)}")

@router.get("/models")
async def get_available_models():
    """
    Vraća listu dostupnih modela.
    """
    mcp_connector = get_mcp_connector()
    openai_server = mcp_connector.get_server("OpenAI")
    
    if not openai_server:
        raise HTTPException(status_code=503, detail="OpenAI MCP server nije dostupan")
    
    try:
        return {"models": openai_server.get_models()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Greška pri dohvatu modela: {str(e)}")

@router.get("/token-usage/{session_id}")
async def get_token_usage(session_id: str):
    """
    Vraća statistiku korištenja tokena za sesiju.
    """
    mcp_connector = get_mcp_connector()
    openai_server = mcp_connector.get_server("OpenAI")
    
    if not openai_server:
        raise HTTPException(status_code=503, detail="OpenAI MCP server nije dostupan")
    
    try:
        usage = openai_server.get_token_usage(session_id)
        return {"session_id": session_id, "token_usage": usage}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Greška pri dohvatu korištenja tokena: {str(e)}")

@router.post("/sessions")
async def create_session(body: Dict[str, Any] = {}):
    """
    Kreira novu sesiju za razgovor.
    """
    mcp_connector = get_mcp_connector()
    openai_server = mcp_connector.get_server("OpenAI")
    
    if not openai_server:
        raise HTTPException(status_code=503, detail="OpenAI MCP server nije dostupan")
    
    try:
        result = openai_server.create_session(metadata=body.get("metadata", {}))
        return SessionResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Greška pri kreiranju sesije: {str(e)}")

@router.get("/sessions/{session_id}/history")
async def get_session_history(session_id: str, limit: Optional[int] = None):
    """
    Vraća istoriju poruka za sesiju.
    """
    mcp_connector = get_mcp_connector()
    openai_server = mcp_connector.get_server("OpenAI")
    
    if not openai_server:
        raise HTTPException(status_code=503, detail="OpenAI MCP server nije dostupan")
    
    try:
        messages = openai_server.get_session_history(session_id, limit)
        return {"session_id": session_id, "messages": messages}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Greška pri dohvatu istorije sesije: {str(e)}") 