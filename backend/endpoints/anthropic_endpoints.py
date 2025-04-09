from fastapi import APIRouter, Depends, HTTPException, Request, File, UploadFile, Form
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
import os
import uuid
import shutil
from pathlib import Path

from utils.mcp_connector import get_mcp_connector

router = APIRouter(prefix="/api/anthropic", tags=["anthropic"])

class AnthropicRequest(BaseModel):
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
async def generate_text(request: AnthropicRequest):
    """
    Generiše tekst koristeći Anthropic model.
    """
    mcp_connector = get_mcp_connector()
    anthropic_server = mcp_connector.get_server("Anthropic")
    
    if not anthropic_server:
        raise HTTPException(status_code=503, detail="Anthropic MCP server nije dostupan")
    
    try:
        result = anthropic_server.generate_text(
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
    Generiše odgovor na chat poruke koristeći Anthropic model.
    """
    mcp_connector = get_mcp_connector()
    anthropic_server = mcp_connector.get_server("Anthropic")
    
    if not anthropic_server:
        raise HTTPException(status_code=503, detail="Anthropic MCP server nije dostupan")
    
    try:
        result = anthropic_server.chat_completion(
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
    anthropic_server = mcp_connector.get_server("Anthropic")
    
    if not anthropic_server:
        raise HTTPException(status_code=503, detail="Anthropic MCP server nije dostupan")
    
    try:
        return {"models": anthropic_server.get_models()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Greška pri dohvatu modela: {str(e)}")

@router.post("/sessions")
async def create_session(body: Dict[str, Any] = {}):
    """
    Kreira novu sesiju za razgovor.
    """
    mcp_connector = get_mcp_connector()
    anthropic_server = mcp_connector.get_server("Anthropic")
    
    if not anthropic_server:
        raise HTTPException(status_code=503, detail="Anthropic MCP server nije dostupan")
    
    try:
        result = anthropic_server.create_session(metadata=body.get("metadata", {}))
        return SessionResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Greška pri kreiranju sesije: {str(e)}")

@router.get("/sessions/{session_id}/history")
async def get_session_history(session_id: str, limit: Optional[int] = None):
    """
    Vraća istoriju poruka za sesiju.
    """
    mcp_connector = get_mcp_connector()
    anthropic_server = mcp_connector.get_server("Anthropic")
    
    if not anthropic_server:
        raise HTTPException(status_code=503, detail="Anthropic MCP server nije dostupan")
    
    try:
        messages = anthropic_server.get_session_history(session_id, limit)
        return {"session_id": session_id, "messages": messages}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Greška pri dohvatu istorije sesije: {str(e)}")

@router.post("/upload-file")
async def upload_file(
    file: UploadFile = File(...),
    session_id: Optional[str] = Form(None),
    model: Optional[str] = Form(None)
):
    """
    Omogućuje upload fajla za obradu pomoću Anthropic modela.
    """
    mcp_connector = get_mcp_connector()
    anthropic_server = mcp_connector.get_server("Anthropic")
    
    if not anthropic_server:
        raise HTTPException(status_code=503, detail="Anthropic MCP server nije dostupan")
    
    # Kreiraj direktorij za fajlove ako ne postoji
    upload_dir = Path("./uploads")
    upload_dir.mkdir(exist_ok=True)
    
    # Generiši jedinstveno ime fajla
    file_extension = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = upload_dir / unique_filename
    
    # Sačuvaj fajl
    try:
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Greška pri uploadu fajla: {str(e)}")
    finally:
        file.file.close()
    
    # Obradi fajl sa modelom ako je potrebno
    try:
        if anthropic_server.can_process_file():
            result = anthropic_server.process_file(
                file_path=str(file_path),
                original_filename=file.filename,
                model=model,
                session_id=session_id
            )
            return {
                "success": True,
                "file_id": unique_filename,
                "original_filename": file.filename,
                "result": result
            }
        else:
            # Ako server ne može obraditi fajl, samo vrati informacije o uploadu
            return {
                "success": True,
                "file_id": unique_filename,
                "original_filename": file.filename,
                "message": "Fajl je uspješno uploadovan, ali server ne podržava direktnu obradu fajlova."
            }
    except Exception as e:
        # Ukloni fajl u slučaju greške
        if file_path.exists():
            file_path.unlink()
        raise HTTPException(status_code=500, detail=f"Greška pri obradi fajla: {str(e)}")

@router.post("/upload-image")
async def upload_image(
    image: UploadFile = File(...),
    prompt: str = Form(...),
    session_id: Optional[str] = Form(None),
    model: Optional[str] = Form(None)
):
    """
    Omogućuje upload slike za obradu sa promptom pomoću Anthropic Claude modela.
    """
    mcp_connector = get_mcp_connector()
    anthropic_server = mcp_connector.get_server("Anthropic")
    
    if not anthropic_server:
        raise HTTPException(status_code=503, detail="Anthropic MCP server nije dostupan")
    
    # Provjeri da li server može obraditi slike
    if not hasattr(anthropic_server, 'process_image') or not callable(getattr(anthropic_server, 'process_image')):
        raise HTTPException(status_code=400, detail="Server ne podržava obradu slika")
    
    # Provjeri tip fajla
    if not image.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="Uploadovani fajl nije slika")
    
    # Kreiraj direktorij za slike ako ne postoji
    upload_dir = Path("./uploads/images")
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    # Generiši jedinstveno ime fajla
    file_extension = os.path.splitext(image.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = upload_dir / unique_filename
    
    # Sačuvaj sliku
    try:
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Greška pri uploadu slike: {str(e)}")
    finally:
        image.file.close()
    
    # Obradi sliku sa modelom
    try:
        result = anthropic_server.process_image(
            image_path=str(file_path),
            prompt=prompt,
            model=model,
            session_id=session_id
        )
        return {
            "success": True,
            "image_id": unique_filename,
            "original_filename": image.filename,
            "result": result
        }
    except Exception as e:
        # Ukloni sliku u slučaju greške
        if file_path.exists():
            file_path.unlink()
        raise HTTPException(status_code=500, detail=f"Greška pri obradi slike: {str(e)}") 