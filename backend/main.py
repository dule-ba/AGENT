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
# Izmjeni na direktni import
from endpoints.anthropic_endpoints import router as anthropic_router
from endpoints.openai_endpoints import router as openai_router

# Učitaj .env fajl
load_dotenv()

# Postavi OpenAI API ključ
# openai.api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Definiraj podrazumjevane postavke za modele - koristi se umjesto AGENT_CONFIGS
DEFAULT_MODELS = {
    "executor": "gpt-4o",
    "code": "gpt-4o",
    "planner": "gpt-4o",
    "data": "gpt-4o",
    "debugger": "gpt-4o"
}

app = FastAPI(title="AI Agent Platform")

# Dodaj CORS middleware za pristup frontendu
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:5174", "http://127.0.0.1:5174",
        "http://localhost:5175", "http://127.0.0.1:5175", 
        "http://localhost:5176", "http://127.0.0.1:5176",
        "http://localhost:5177", "http://127.0.0.1:5177",
        "http://localhost:5178", "http://127.0.0.1:5178",
        "http://localhost:5179", "http://127.0.0.1:5179",
        "http://localhost:5180", "http://127.0.0.1:5180",
        "http://localhost:8080", "http://127.0.0.1:8080",
        "*"  # Dozvoli sve izvore (oprezno u produkciji)
    ],  # Sve dev domene za frontend i API
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS", "PUT", "DELETE"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,  # Koliko dugo browser može keširati CORS response (u sekundama)
)

# Uključi anthropic_endpoints router
app.include_router(anthropic_router)

# Uključi openai_endpoints router
app.include_router(openai_router)

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
    language: str
    mode: str = "script"  # "script", "gui", "terminal", "web"
    sessionId: Optional[str] = None
    auto_debug: Optional[bool] = False
    mcp_server: Optional[str] = "anthropic"
    auto_model_selection: Optional[bool] = False
    sandbox: Optional[bool] = True
    timeout_seconds: Optional[int] = 8

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
    sandbox: Optional[bool] = True
    timeout_seconds: Optional[int] = 8

@app.post("/chat")
async def chat_endpoint(request: ChatRequestExtended):
    # Koristi postojeći session_id iz zahtjeva ili generiraj novi
    session_id = request.session_id if request.session_id else str(uuid.uuid4())
    
    # Provjeri da li je agent validan
    if request.agent not in agent_map:
        raise HTTPException(status_code=400, detail=f"Agent '{request.agent}' nije podržan")
    
    # Dobavi prethodne poruke sesije za kontekst
    previous_messages = []
    if session_id in session_memory:
        previous_messages = session_memory[session_id]
    
    # Kreiraj kopiju zahtjeva za daljnju obradu
    request_dict = request.dict()
    
    # Rukovanje s modelom "default" - zamijeni s realnim modelom
    if request_dict.get("model") == "default":
        # Umjesto korištenja AGENT_CONFIGS, postavimo direktno gpt-4o
        request_dict["model"] = DEFAULT_MODELS.get(request.agent, "gpt-4o")
        print(f"Model 'default' zamijenjen sa '{request_dict['model']}' za {request.agent} agenta")
    
    # Provjeri da li treba automatski odabrati model
    if request.auto_model_selection and request.model == "default":
        # Koristi MCP router agent za odabir modela
        router_result = await mcp_router_agent(request.dict())
        
        # Ažuriraj zahtjev s preporučenim modelom i temperaturom
        model_rec = router_result.get("model_recommendation", {})
        request_dict["model"] = model_rec.get("model", request_dict["model"])  # Koristi već postavljeni model kao fallback
        request_dict["temperature"] = model_rec.get("temperature", request.temperature)
        
        # Zabilježi analizu zadatka u dodatne metapodatke
        request_dict["task_analysis"] = router_result.get("task_analysis", {})
        
        print(f"Automatski odabran model: {request_dict['model']} (temp: {request_dict['temperature']})")
    
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
            # Već imamo kod, samo dodamo tag da ide na code agenta
            code_request = ChatRequestExtended(
                message=request.message, 
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
            
        # Slično možemo dodati za debug, data, planner, itd.
    
    # Sačuvaj rezultat u memoriju sesije
    save_to_session(session_id, request.agent, request.message, response)
    
    # Ako je bio automatski odabir modela, dodajmo tu informaciju u odgovor
    if request.auto_model_selection and request.model == "default":
        response["selected_model"] = request_dict.get("model", "default")
        response["selected_temperature"] = request_dict.get("temperature", 0.7)
        response["task_analysis"] = request_dict.get("task_analysis", {})
    
    # Dodaj session_id u odgovor
    response["session_id"] = session_id
    return response

@app.post("/execute-code", response_model=CodeExecutionResponse)
async def execute_code(request: CodeExecutionRequest):
    """
    Izvršava kod u izoliranom privremenom direktoriju (sandbox-lite) i vraća rezultat.
    Podržava Python, JavaScript i HTML.
    """

    result = {
        "output": "",
        "error": None,
        "imageBase64": None,
        "status": "success"
    }

    mcp_server = request.mcp_server
    auto_model_selection = request.auto_model_selection
    timeout_seconds = max(1, min(request.timeout_seconds, 30))

    def _sandbox_preexec():
        if os.name != "posix":
            return
        try:
            import resource
            resource.setrlimit(resource.RLIMIT_CPU, (timeout_seconds, timeout_seconds + 1))
            resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))
            resource.setrlimit(resource.RLIMIT_FSIZE, (5 * 1024 * 1024, 5 * 1024 * 1024))
            resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
            resource.setrlimit(resource.RLIMIT_NPROC, (32, 32))
        except Exception:
            pass

    def _run_code_subprocess(code: str, command: list[str], suffix: str):
        with tempfile.TemporaryDirectory(prefix="agent_sandbox_") as sandbox_dir:
            file_path = os.path.join(sandbox_dir, f"main{suffix}")
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(code)

            env = {
                "PATH": os.environ.get("PATH", ""),
                "PYTHONNOUSERSITE": "1",
                "PYTHONDONTWRITEBYTECODE": "1",
                "HOME": sandbox_dir,
                "TMPDIR": sandbox_dir
            }

            completed = subprocess.run(
                command + [file_path],
                capture_output=True,
                text=True,
                cwd=sandbox_dir,
                timeout=timeout_seconds,
                env=env,
                preexec_fn=_sandbox_preexec if request.sandbox else None
            )
            return completed

    async def _attach_debug_suggestion(lang_label: str):
        debug_message = f"""Debug ovaj {lang_label} kod i ispravi greške:
```{request.language}
{request.code}
```

GREŠKA:
{result['error']}"""

        debug_request_data = {
            "message": debug_message,
            "agent": "debugger",
            "auto_process": False,
            "mcp_server": mcp_server
        }

        if auto_model_selection:
            router_result = await mcp_router_agent(debug_request_data)
            model_rec = router_result.get("model_recommendation", {})
            debug_request_data["model"] = model_rec.get("model", "default")
            debug_request_data["temperature"] = model_rec.get("temperature", 0.2)

        debug_request = ChatRequestExtended(**debug_request_data)
        debug_response = await debugger_agent(debug_request.dict())
        result["debug_suggestion"] = debug_response["response"]
        if auto_model_selection:
            result["debug_model_used"] = debug_request_data.get("model", "default")

    try:
        if request.language.lower() in ["python", "py"]:
            if request.mode == "script":
                try:
                    process = _run_code_subprocess(request.code, ["python"], ".py")
                    result["output"] = process.stdout
                    if process.stderr:
                        result["error"] = process.stderr
                        result["status"] = "error" if process.returncode != 0 else "success"
                        if request.auto_debug and process.returncode != 0:
                            await _attach_debug_suggestion("Python")
                except subprocess.TimeoutExpired:
                    result["error"] = f"Execution timeout after {timeout_seconds}s"
                    result["status"] = "error"
                except Exception as e:
                    result["error"] = str(e)
                    result["status"] = "error"

            elif request.mode == "gui":
                with tempfile.NamedTemporaryFile(suffix='.py', delete=False) as temp:
                    temp.write(request.code.encode())
                    temp_path = temp.name

                try:
                    process = subprocess.Popen(
                        ["python", temp_path],
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        text=True
                    )

                    import time
                    time.sleep(2)

                    try:
                        from PIL import ImageGrab
                        screenshot = ImageGrab.grab()
                        buffered = io.BytesIO()
                        screenshot.save(buffered, format="PNG")
                        result["imageBase64"] = base64.b64encode(buffered.getvalue()).decode()
                    except ImportError:
                        result["error"] = "Screenshot nije moguć - PIL/Pillow nije instaliran"
                    except Exception as e:
                        result["error"] = f"Problem sa screenshotom: {str(e)}"

                    stdout, stderr = process.communicate(timeout=5)
                    result["output"] = stdout
                    if stderr:
                        result["error"] = stderr

                    process.terminate()
                except Exception as e:
                    result["error"] = str(e)
                    result["status"] = "error"
                finally:
                    try:
                        os.unlink(temp_path)
                    except:
                        pass

        elif request.language.lower() in ["javascript", "js"]:
            try:
                process = _run_code_subprocess(request.code, ["node"], ".js")
                result["output"] = process.stdout
                if process.stderr:
                    result["error"] = process.stderr
                    if process.returncode != 0:
                        result["status"] = "error"
                        if request.auto_debug:
                            await _attach_debug_suggestion("JavaScript")
            except subprocess.TimeoutExpired:
                result["error"] = f"Execution timeout after {timeout_seconds}s"
                result["status"] = "error"
            except Exception as e:
                result["error"] = str(e)
                result["status"] = "error"

        elif request.language.lower() in ["html", "markup"]:
            result["output"] = request.code
    except Exception as e:
        result["error"] = str(e) + "\n" + traceback.format_exc()
        result["status"] = "error"

    return result

@app.get("/sessions")
async def list_sessions():
    # Pristup direktno session_memory dictionary-ju umjesto get_session funkciji
    return {"sessions": list(session_memory.keys())}

@app.get("/session/{session_id}")
async def get_session_by_id(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session sa ID {session_id} nije pronađen")
    return session

@app.get("/")
def read_root():
    return {"message": "AI Agent Platform API", "version": "0.1.0"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=True)