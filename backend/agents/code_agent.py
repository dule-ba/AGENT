import os
import sys
from openai import OpenAI
import json

# Dodamo root direktorij projekta u sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config.config import AGENT_CONFIGS

async def handle(request, previous_messages=None):
    try:
        # Dobavljanje API ključa iz okoline
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return {
                "response": "Greška: OpenAI API ključ nije postavljen. Molimo postavite OPENAI_API_KEY u .env fajlu.",
                "error": "API key missing"
            }
            
        # Učitavanje konfiguracije za code agenta
        try:
            with open("config/agents_config.json", "r") as f:
                config = json.load(f).get("code", {})
        except (FileNotFoundError, json.JSONDecodeError) as e:
            config = {
                "model": "gpt-4",
                "temperature": 0.5,
                "max_tokens": 1500,
                "system_prompt": "You are a programming and coding assistant. You help user write, understand, and debug code."
            }
        
        # Inicijalizacija OpenAI klijenta
        client = OpenAI(api_key=api_key)
        
        # Priprema poruka za API poziv
        messages = [
            {"role": "system", "content": config.get("system_prompt", "You are a programming and coding assistant. You help user write, understand, and debug code.")}
        ]
        
        # Dodaj prethodne poruke ako postoje
        if previous_messages:
            # Formatiramo poruke iz sesije u format pogodan za API
            for prev_msg in previous_messages:
                if "agent" in prev_msg and prev_msg["agent"] == "code":
                    if "message" in prev_msg:
                        messages.append({"role": "user", "content": prev_msg["message"]})
                    if "response" in prev_msg and "response" in prev_msg["response"]:
                        messages.append({"role": "assistant", "content": prev_msg["response"]["response"]})
        
        # Dodaj trenutnu poruku
        if isinstance(request, dict):
            messages.append({"role": "user", "content": request["message"]})
        else:
            messages.append({"role": "user", "content": request.message})
        
        # Kreiranje odgovora
        response = client.chat.completions.create(
            model=config.get("model", "gpt-4"),
            temperature=config.get("temperature", 0.5),
            max_tokens=config.get("max_tokens", 1500),
            messages=messages
        )
        
        response_text = response.choices[0].message.content
        return {"response": response_text}
    except Exception as e:
        return {"response": f"Code agent greška: {str(e)}", "error": str(e)}