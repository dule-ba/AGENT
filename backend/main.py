import uuid
import sys
import os
from fastapi import FastAPI, Depends, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
import openai
from openai import OpenAI
from dotenv import load_dotenv
import io
import contextlib
import traceback
import subprocess
import tempfile
import base64
from typing import Optional, Dict, Any
from pydantic import BaseModel

# Dodaj glavni direktorij u sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from schemas.chat import ChatRequest
# Uvezi agente pojedinačno
from agents.executor_agent import handle as executor_agent
from agents.code_agent import handle as code_agent
from agents.planner_agent import handle as planner_agent
from agents.data_agent import handle as data_agent
from agents.debugger_agent import handle as debugger_agent
from agents.mcp_router_agent import handle as mcp_router_agent
# Uvezi utils module
from utils.session_store import save_to_session, get_session, session_memory
# Import novih modula za upravljanje memorijom
from utils.memory_manager import memory_manager
from utils.token_counter import num_tokens_from_string, count_message_tokens
from utils.chunker import chunk_text_by_structure
from utils.context_compressor_agent import compress_context, create_compact_context
# Izmjeni na direktni import
from endpoints.anthropic_endpoints import router as anthropic_router

# Učitaj .env fajl
load_dotenv()

# Postavi OpenAI API ključ
# openai.api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

app = FastAPI(title="AI Agent Platform")

# Dodaj CORS middleware za pristup frontendu
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8080", "http://127.0.0.1:8080", "http://localhost:8000", "http://127.0.0.1:8000"],  # Dodate domene za frontend i API
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Uključi anthropic_endpoints router
app.include_router(anthropic_router)

# Mapiraj agente za direktno usmjeravanje
agent_map = {
    "executor": executor_agent,
    "code": code_agent,
    "planner": planner_agent,
    "data": data_agent,
    "debugger": debugger_agent,
    "mcp_router": mcp_router_agent
}

# Prošireni model za izvršavanje koda s auto_debug
class CodeExecutionRequest(BaseModel):
    code: str
    language: str = "python"
    mode: str = "script"  # "script", "gui", "terminal", "web"
    sessionId: Optional[str] = None
    auto_debug: Optional[bool] = False
    mcp_server: Optional[str] = "anthropic"
    auto_model_selection: Optional[bool] = False

class CodeExecutionResponse(BaseModel):
    output: str
    error: Optional[str] = None
    imageBase64: Optional[str] = None
    status: str

# Prošireni model za chat upit s auto_process
class ChatRequestExtended(ChatRequest):
    auto_process: Optional[bool] = False
    model: Optional[str] = "default"
    temperature: Optional[float] = 0.7
    mcp_server: Optional[str] = "anthropic"
    auto_model_selection: Optional[bool] = False

@app.post("/chat")
async def chat_endpoint(request: ChatRequestExtended):
    # Koristi postojeći session_id iz zahtjeva ili generiraj novi
    session_id = request.session_id if request.session_id else str(uuid.uuid4())
    
    # Provjeri da li je agent validan
    if request.agent not in agent_map:
        raise HTTPException(status_code=400, detail=f"Agent '{request.agent}' nije podržan")
    
    # Dobavi prethodne poruke sesije za kontekst
    previous_messages = []
    
    # Koristimo memory_manager umjesto session_memory
    recent_context = memory_manager.get_recent_context(session_id)
    summary = recent_context.get('summary', '')
    previous_messages = recent_context.get('recent_messages', [])
    
    # Kreiraj kopiju zahtjeva za daljnju obradu
    request_dict = request.dict()
    
    # Provjeri da li treba automatski odabrati model
    if request.auto_model_selection and request.model == "default":
        # Koristi MCP router agent za odabir modela
        router_result = await mcp_router_agent(request.dict())
        
        # Ažuriraj zahtjev s preporučenim modelom i temperaturom
        model_rec = router_result.get("model_recommendation", {})
        request_dict["model"] = model_rec.get("model", request.model)
        request_dict["temperature"] = model_rec.get("temperature", request.temperature)
        
        # Zabilježi analizu zadatka u dodatne metapodatke
        request_dict["task_analysis"] = router_result.get("task_analysis", {})
        
        print(f"Automatski odabran model: {request_dict['model']} (temp: {request_dict['temperature']})")
    
    # Dodaj sažetak prethodne konverzacije u poruku ako postoji
    if summary:
        request_dict["context_summary"] = summary
    
    # Usmjeri zahtjev na odgovarajućeg agenta i dodaj kontekst
    agent = agent_map[request.agent]
    
    # Dodajemo prethodne poruke u zahtjev za kontekst
    response = await agent(request_dict, previous_messages)

    # Automatsko procesiranje kroz više agenata
    if request.auto_process and request.agent == "executor":
        # Ako je rezultat izvršnog agenta sadržavao uputu za preusmjeravanje na kod/debugger/itd.
        # Ovdje možemo automatski to preusmjeriti na prikladnog agenta
        result_lower = response["response"].lower()
        
        # Ako odgovor sadrži kod ili programiranje, proslijedi code agentu
        if "kod" in result_lower or "programiranje" in result_lower or "```" in response["response"]:
            # Kreiraj novu poruku koja eksplicitno traži izmjenu na osnovu historije
            modification_request_message = f"""Originalni zahtjev korisnika: '{request.message}'
Prethodni odgovor Executor agenta: 
{response['response']}

Molim te, koristi historiju razgovora (posebno prethodni kod koji si možda generisao) i primijeni tražene izmjene iz originalnog zahtjeva korisnika na taj kod. Vrati kompletan, ažurirani kod."""

            # Već imamo kod, samo dodamo tag da ide na code agenta
            code_request = ChatRequestExtended(
                message=modification_request_message, # Koristi novu, kontekstualnu poruku
                agent="code", 
                auto_process=False,
                session_id=session_id,
                model=request_dict.get("model", request.model),
                temperature=request_dict.get("temperature", request.temperature),
                mcp_server=request.mcp_server,
                auto_model_selection=False  # Isključimo auto_model_selection jer smo već odabrali model
            )
            code_response = await code_agent(code_request.dict(), previous_messages)
            
            # Dodamo i originalni odgovor za kontekst
            response["executor_response"] = response["response"]
            response["response"] = code_response["response"]
            response["flow"] = ["Executor", "Code"]
            response["agents"] = ["Executor preusmjeren na Code agenta", code_response["response"]]
        
        # Ako odgovor sadrži problem ili grešku, proslijedi debugger agentu
        elif "problem" in result_lower or "greška" in result_lower or "ne radi" in result_lower:
            # Kreiraj poruku za debugger koja uključuje originalni zahtjev i grešku/problem
            debug_request_message = f"""Originalni zahtjev korisnika: '{request.message}'
Odgovor Executor agenta koji ukazuje na problem:
{response['response']}

Molim te, analiziraj problem opisan u odgovoru Executora i originalni zahtjev korisnika. Ako je problem u kodu iz historije razgovora, pokušaj ga ispraviti. Koristi historiju za kontekst."""

            debug_request = ChatRequestExtended(
                message=debug_request_message, # Koristi novu, kontekstualnu poruku
                agent="debugger", 
                auto_process=False,
                session_id=session_id,
                model=request_dict.get("model", request.model),
                temperature=request_dict.get("temperature", request.temperature),
                mcp_server=request.mcp_server,
                auto_model_selection=False
            )
            debug_response = await debugger_agent(debug_request.dict(), previous_messages)
            
            # Dodamo i originalni odgovor za kontekst
            response["executor_response"] = response["response"]
            response["response"] = debug_response["response"]
            response["flow"] = ["Executor", "Debugger"]
            response["agents"] = ["Executor preusmjeren na Debugger agenta", debug_response["response"]]
    
    # Sačuvaj rezultat u memory manager umjesto session_memory
    memory_manager.save_to_session(session_id, request.agent, request.message, response)
    
    # Izračunaj broj tokena u odgovoru i dodaj u rezultat
    try:
        tokens_in_response = num_tokens_from_string(response["response"], request_dict.get("model", "gpt-4o"))
        response["token_count"] = tokens_in_response
    except Exception as e:
        print(f"Greška pri brojanju tokena: {e}")
    
    # Ako je bio automatski odabir modela, dodajmo tu informaciju u odgovor
    if request.auto_model_selection and request.model == "default":
        response["selected_model"] = request_dict.get("model", "default")
        response["selected_temperature"] = request_dict.get("temperature", 0.7)
        response["task_analysis"] = request_dict.get("task_analysis", {})
    
    # Dodaj session_id u odgovor
    response["session_id"] = session_id
    return response

# Dodavanje novih endpointa za upravljanje sesijama
@app.get("/memory/sessions")
async def list_memory_sessions():
    """Dohvaća listu svih dostupnih sesija iz memory managera."""
    return {"sessions": memory_manager.list_sessions()}

@app.get("/memory/session/{session_id}")
async def get_memory_session(session_id: str):
    """Dohvaća detalje određene sesije iz memory managera."""
    messages = memory_manager.get_session_messages(session_id)
    summary = memory_manager.get_session_summary(session_id)
    return {
        "session_id": session_id,
        "summary": summary,
        "messages": messages
    }

@app.delete("/memory/session/{session_id}")
async def delete_memory_session(session_id: str):
    """Briše određenu sesiju iz memory managera."""
    success = memory_manager.delete_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Sesija sa ID-om {session_id} nije pronađena")
    return {"status": "success", "message": f"Sesija {session_id} je uspješno obrisana"}

@app.post("/execute-code")
async def execute_code(request: CodeExecutionRequest):
    """
    Izvršava kod u sigurnom sandbox okruženju.
    Podržava Python, JavaScript i HTML.
    """
    try:
        # Kreiranje privremenog direktorija za izvršavanje koda
        temp_dir = tempfile.mkdtemp()
        
        # Generiranje jedinstvenog imena datoteke
        file_id = str(uuid.uuid4())
        
        if request.language == "python":
            file_path = os.path.join(temp_dir, f"code_{file_id}.py")
            
            # Zapisivanje koda u datoteku
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(request.code)
            
            # Izvršavanje Python koda
            try:
                process = subprocess.run(
                    ["python", file_path],
                    capture_output=True,
                    text=True,
                    timeout=10  # Ograničenje na 10 sekundi
                )
                
                return {
                    "output": process.stdout,
                    "error": process.stderr,
                    "status": "success" if process.returncode == 0 else "error"
                }
            except subprocess.TimeoutExpired:
                return {
                    "output": "",
                    "error": "Izvršavanje koda je prekoračilo vremensko ograničenje (10 sekundi)",
                    "status": "timeout"
                }
            
        elif request.language == "javascript":
            # Za JavaScript možemo koristiti Node.js
            file_path = os.path.join(temp_dir, f"code_{file_id}.js")
            
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(request.code)
            
            try:
                process = subprocess.run(
                    ["node", file_path],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                
                return {
                    "output": process.stdout,
                    "error": process.stderr,
                    "status": "success" if process.returncode == 0 else "error"
                }
            except subprocess.TimeoutExpired:
                return {
                    "output": "",
                    "error": "Izvršavanje koda je prekoračilo vremensko ograničenje (10 sekundi)",
                    "status": "timeout"
                }
        elif request.language == "html":
            # Za HTML vraćamo base64 enkodiran sadržaj koji se može prikazati u iframe
            file_path = os.path.join(temp_dir, f"code_{file_id}.html")
            
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(request.code)
            
            # Enkodiramo HTML za siguran prikaz
            html_content = base64.b64encode(request.code.encode('utf-8')).decode('utf-8')
            
            return {
                "output": "HTML sadržaj uspješno generiran.",
                "error": None,
                "imageBase64": html_content,
                "status": "success"
            }
        else:
            return {
                "output": "",
                "error": f"Jezik '{request.language}' nije podržan",
                "status": "error"
            }
    except Exception as e:
        traceback_str = traceback.format_exc()
        return {
            "output": "",
            "error": f"Greška prilikom izvršavanja koda: {str(e)}\n{traceback_str}",
            "status": "error"
        }

# Endpoint za dobijanje svih sesija (backcompatibility)
@app.get("/sessions")
async def list_sessions():
    # Usmjeri na novi endpoint za listu sesija
    return await list_memory_sessions()

# Endpoint za dobijanje sesije po ID-u (backcompat)
@app.get("/session/{session_id}")
async def get_session_by_id(session_id: str):
    # Usmjeri na novi endpoint za dohvat sesije
    return await get_memory_session(session_id)

# Root endpoint
@app.get("/")
def read_root():
    return {"message": "Dobrodošli na AI Agent Platform API"}

# Endpoint za dohvat tokena u tekstu
@app.post("/count-tokens")
async def count_tokens(request: dict = Body(...)):
    """Broji tokene u tekstu."""
    text = request.get("text", "")
    model = request.get("model", "gpt-4o")
    
    if not text:
        raise HTTPException(status_code=400, detail="Tekst je obavezan")
    
    token_count = num_tokens_from_string(text, model)
    return {
        "text": text[:100] + "..." if len(text) > 100 else text,
        "tokens": token_count,
        "model": model
    }

# Endpoint za čankovanje teksta
@app.post("/chunk-text")
async def chunk_text_endpoint(request: dict = Body(...)):
    """Dijeli tekst na smislene chunkove po strukturi."""
    text = request.get("text", "")
    max_tokens = request.get("max_tokens", 1500)
    model = request.get("model", "gpt-4o")
    
    if not text:
        raise HTTPException(status_code=400, detail="Tekst je obavezan")
    
    chunks = chunk_text_by_structure(text, max_tokens, model)
    
    # Konvertiraj chunkove u rječnike
    return {
        "chunks": [chunk.to_dict() for chunk in chunks],
        "chunk_count": len(chunks),
        "model": model,
        "max_tokens_per_chunk": max_tokens
    }

if __name__ == "__main__":
    import uvicorn
    # Pokreni server direktno s app objektom, a ne sa stringom
    print("Pokretanje AI Agent Platform servera...")
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True) 