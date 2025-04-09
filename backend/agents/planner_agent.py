import os
import sys
from openai import OpenAI

# Dodamo root direktorij projekta u sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config.config import AGENT_CONFIGS

async def handle(request, previous_messages=None):
    try:
        cfg = AGENT_CONFIGS["planner"]
        
        # Inicijalizacija OpenAI klijenta
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        
        # Provjeri je li request rječnik ili objekt
        if isinstance(request, dict):
            message_content = request["message"]
            model = request.get("model", cfg["model"])
            temperature = request.get("temperature", cfg["temperature"])
        else:
            message_content = request.message
            model = getattr(request, "model", cfg["model"])
            temperature = getattr(request, "temperature", cfg["temperature"])
        
        # Pripremi prompt za planera
        plan_prompt = f"""
Korisnik želi plan za: "{message_content}"

Kao planerski AI agent, napravi detaljan plan razvoja aplikacije. Uključi:
1. Korake razvoja (npr. dizajn UI, API, logika, testiranje...)
2. Tehnologije koje će se koristiti
3. Moguće izazove i rješenja

Plan napiši u jasan i uredan markdown format.

Počni odmah:
"""
        
        # Dodaj prethodne poruke ako postoje
        messages = [{"role": "system", "content": cfg["system_prompt"]}]
        
        if previous_messages:
            # Formatiramo poruke iz sesije u format pogodan za API
            for prev_msg in previous_messages:
                if "agent" in prev_msg and prev_msg["agent"] == "planner":
                    if "message" in prev_msg:
                        messages.append({"role": "user", "content": prev_msg["message"]})
                    if "response" in prev_msg and "response" in prev_msg["response"]:
                        messages.append({"role": "assistant", "content": prev_msg["response"]["response"]})
        
        # Dodaj plan prompt u poruke
        messages.append({"role": "user", "content": plan_prompt})
        
        # Kreiranje odgovora
        response = client.chat.completions.create(
            model=model,
            temperature=temperature,
            max_tokens=cfg["max_tokens"],
            messages=messages
        )
        
        response_text = response.choices[0].message.content
        
        return {
            "response": response_text,
            "flow": ["Planner"],
            "agents": [response_text],
            "type": "text"  # ovo frontend koristi da zna da nije code
        }
    except Exception as e:
        return {
            "response": f"Planner agent error: {str(e)}",
            "flow": ["Planner"],
            "agents": [f"Error: {str(e)}"],
            "type": "text"
        }