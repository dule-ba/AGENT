import os
import sys
import json
import random
import re
import logging
from typing import Dict, List, Any, Union, Optional

# Dodamo root direktorij projekta u sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config.config import AGENT_CONFIGS

logger = logging.getLogger("mcp_router_agent")

# Definicije tipova zadataka i odgovarajućih modela
TASK_MODELS = {
    "code": {
        "complex": {
            "anthropic": "claude-3-opus-20240229",
            "openai": "gpt-4",
            "google": "gemini-ultra"
        },
        "medium": {
            "anthropic": "claude-3-sonnet-20240229",
            "openai": "gpt-4-turbo",
            "google": "gemini-pro"
        },
        "simple": {
            "anthropic": "claude-3-haiku-20240307",
            "openai": "gpt-3.5-turbo",
            "google": "gemini-pro"
        }
    },
    "reasoning": {
        "complex": {
            "anthropic": "claude-3-opus-20240229",
            "openai": "gpt-4",
            "google": "gemini-ultra"
        },
        "medium": {
            "anthropic": "claude-3-sonnet-20240229",
            "openai": "gpt-4-turbo",
            "google": "gemini-pro"
        },
        "simple": {
            "anthropic": "claude-3-haiku-20240307",
            "openai": "gpt-3.5-turbo",
            "google": "gemini-pro"
        }
    },
    "creative": {
        "complex": {
            "anthropic": "claude-3-opus-20240229",
            "openai": "gpt-4",
            "google": "gemini-ultra"
        },
        "medium": {
            "anthropic": "claude-3-5-sonnet-20240620",
            "openai": "gpt-4-turbo",
            "google": "gemini-pro"
        },
        "simple": {
            "anthropic": "claude-3-sonnet-20240229",
            "openai": "gpt-3.5-turbo",
            "google": "gemini-pro"
        }
    },
    "chat": {
        "complex": {
            "anthropic": "claude-3-sonnet-20240229",
            "openai": "gpt-4-turbo",
            "google": "gemini-pro"
        },
        "medium": {
            "anthropic": "claude-3-haiku-20240307",
            "openai": "gpt-3.5-turbo",
            "google": "gemini-pro"
        },
        "simple": {
            "anthropic": "claude-3-haiku-20240307",
            "openai": "gpt-3.5-turbo",
            "google": "gemini-pro"
        }
    }
}

# Signalne riječi za određene tipove zadataka
TASK_SIGNALS = {
    "code": [
        r"(?:napiši|generiši|kreiraj|implementiraj|napravi)\s+(?:kod|program|skriptu|funkciju|metodu|klasu)",
        r"javascript|python|java|typescript|c\+\+|ruby|php|html|css|sql|react|\.jsx|\.tsx|\.py",
        r"algoritam|funkcija|klasa|metoda|varijabla|objekat|lista|niz|petlja|rekurzija",
        r"debuguj|ispravi|refaktoriši|optimizuj|poboljšaj kod"
    ],
    "reasoning": [
        r"(?:objasni|analiziraj|razmisli o|procijeni|izračunaj)",
        r"kako (?:radi|funkcioniše|djeluje)",
        r"zašto (?:je|su|bi|ne)",
        r"logički|matematički|zaključi|razlog|uzrok|posljedica"
    ],
    "creative": [
        r"(?:napiši|kreiraj|izmisli|smisli)\s+(?:priču|pjesmu|scenario|tekst|blog|članak)",
        r"kreativno|originalno|inspirativno|maštovito",
        r"ideja za|prijedlog za|koncept za"
    ],
    "chat": [
        r"(?:zdravo|bok|hej|pozdrav|ćao|dobar dan)",
        r"kako si|šta ima|razgovor"
    ]
}

# Pokazatelji složenosti zadatka
COMPLEXITY_SIGNALS = {
    "complex": [
        r"kompleksn[aoi]|složen[aoi]|napredn[aoi]|detaljan|detaljn[aoi]",
        r"(?:višestruk|složen)[aoi]?\s+(?:zadatak|problem|implementacija)",
        r"vrlo\s+(?:teško|kompleksno|složeno)",
        r"optimiz(?:uj|iraj|irati)|poboljšaj\s+performanse"
    ],
    "simple": [
        r"jednostavn[aoi]|osnov(?:no|ni)|bazičn[aoi]|kratak|kratk[aoi]",
        r"početnički|za početnike|učim|učenje|demo"
    ]
}

async def identify_task_type(message: str) -> str:
    """Identificira tip zadatka na osnovu poruke."""
    message = message.lower()
    scores = {"code": 0, "reasoning": 0, "creative": 0, "chat": 0}
    
    # Prebroji signale po kategorijama
    for task_type, patterns in TASK_SIGNALS.items():
        for pattern in patterns:
            matches = re.findall(pattern, message, re.IGNORECASE)
            scores[task_type] += len(matches)
    
    # Pronađi tip s najviše signala
    max_score = 0
    task_type = "chat"  # Default ako nema drugih signala
    
    for t_type, score in scores.items():
        if score > max_score:
            max_score = score
            task_type = t_type
    
    return task_type

async def identify_complexity(message: str) -> str:
    """Procjenjuje složenost zadatka na osnovu poruke."""
    message = message.lower()
    
    # Provjeri signale za kompleksne zadatke
    for pattern in COMPLEXITY_SIGNALS["complex"]:
        if re.search(pattern, message, re.IGNORECASE):
            return "complex"
    
    # Provjeri signale za jednostavne zadatke
    for pattern in COMPLEXITY_SIGNALS["simple"]:
        if re.search(pattern, message, re.IGNORECASE):
            return "simple"
    
    # Podrazumijevano srednja složenost
    return "medium"

async def choose_best_model(message: str, provider: str = "anthropic") -> Dict[str, Any]:
    """
    Odabire najbolji model prema zadatku i složenosti.
    
    Args:
        message: Tekst poruke korisnika
        provider: Preferirani MCP provider
        
    Returns:
        Dict s informacijama o odabranom modelu i procjeni
    """
    task_type = await identify_task_type(message)
    complexity = await identify_complexity(message)
    
    # Uzmi model prema tipu zadatka, složenosti i provideru
    model = TASK_MODELS[task_type][complexity][provider]
    
    # Temperature preporuke prema tipu
    temperature = 0.7  # default
    if task_type == "creative":
        temperature = 0.8
    elif task_type == "code":
        temperature = 0.2
    elif task_type == "reasoning":
        temperature = 0.1
    
    logger.info(f"Router odabrao: {provider} model '{model}' (task: {task_type}, complexity: {complexity})")
    
    return {
        "model": model,
        "provider": provider,
        "task_type": task_type,
        "complexity": complexity,
        "temperature": temperature
    }

async def handle(request: Dict[str, Any], context: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    """
    Glavni handler za MCP router agenta.
    
    Args:
        request: Dict s "message" i drugim potrebnim podacima
        context: Opcioni kontekst razgovora
        
    Returns:
        Dict s odabranim modelom i parametrima
    """
    message = request.get("message", "")
    provider = request.get("mcp_server", "anthropic")
    
    # Odaberi najbolji model za dati zadatak
    model_selection = await choose_best_model(message, provider)
    
    # Vrati rezultat
    return {
        "response": f"Preporučujem {model_selection['provider']} model '{model_selection['model']}' za ovaj zadatak.",
        "task_analysis": {
            "task_type": model_selection["task_type"],
            "complexity": model_selection["complexity"]
        },
        "model_recommendation": {
            "provider": model_selection["provider"],
            "model": model_selection["model"],
            "temperature": model_selection["temperature"]
        }
    } 