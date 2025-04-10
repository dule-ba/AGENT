import os
import sys
import json
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
        
        # Pripremi prompt za planera - pojednostavljeni prompt za brzi odgovor
        plan_prompt = f"""
Napravi plan izvršavanja za korisnikov zahtjev: "{message_content}"

Vrati ISKLJUČIVO JSON u sljedećem formatu, bez ikakvih dodatnih objašnjenja:

{{
  "title": "Naslov plana",
  "description": "Opis cilja i pristupa",
  "steps": [
    {{
      "title": "Prvi korak",
      "description": "Opis prvog koraka",
      "agent": "executor"
    }},
    {{
      "title": "Drugi korak",
      "description": "Opis drugog koraka",
      "agent": "code"
    }}
  ]
}}

Uključi 3-5 konkretnih koraka i obavezno koristi samo ove agente: "executor", "code", "planner", "debugger", "data".
"""
        
        # Dodaj prethodne poruke ako postoje
        messages = [{"role": "system", "content": "Kreiraj strukturirani plan izvršavanja u JSON formatu, bez dodatnog teksta."}]
        messages.append({"role": "user", "content": plan_prompt})
        
        # Kreiranje odgovora - s manjim brojem tokena za brži odgovor
        response = client.chat.completions.create(
            model=model,
            temperature=temperature,
            max_tokens=800,  # Smanjen broj tokena za brži odgovor
            messages=messages,
            response_format={"type": "json_object"}  # Zahtijevamo JSON odgovor
        )
        
        response_text = response.choices[0].message.content
        
        # Provjerimo je li response_text validan JSON, ako nije formatirajmo ga
        try:
            json_obj = json.loads(response_text)
            formatted_json = json.dumps(json_obj, ensure_ascii=False)
            final_response = formatted_json
        except json.JSONDecodeError:
            # Ako nije validan JSON, pokušamo izdvojiti JSON dio
            json_pattern = r'({.*})'
            import re
            match = re.search(json_pattern, response_text, re.DOTALL)
            if match:
                final_response = match.group(1)
            else:
                # Ako ne možemo izvući JSON, kreiramo minimalni plan
                default_plan = {
                    "title": "Plan izvršavanja za vaš zahtjev",
                    "description": f"Plan za: {message_content}",
                    "steps": [
                        {
                            "title": "Analiza zahtjeva",
                            "description": "Analiza korisničkog zahtjeva za utvrđivanje potrebnih akcija",
                            "agent": "executor"
                        },
                        {
                            "title": "Generiranje koda",
                            "description": "Kreiranje potrebnog koda za traženu funkcionalnost",
                            "agent": "code"
                        },
                        {
                            "title": "Testiranje i izvršavanje",
                            "description": "Provjera funkcionalnosti koda i otklanjanje grešaka",
                            "agent": "debugger"
                        }
                    ]
                }
                final_response = json.dumps(default_plan, ensure_ascii=False)
        
        return {
            "response": final_response,
            "flow": ["Planner"],
            "agents": ["Planner"],
            "type": "text"  # ovo frontend koristi da zna da nije code
        }
    except Exception as e:
        # Vrati default plan u slučaju greške
        default_plan = {
            "title": "Osnovni plan izvršavanja",
            "description": f"Plan za: {request.get('message', '') if isinstance(request, dict) else getattr(request, 'message', '')}",
            "steps": [
                {
                    "title": "Analiza zahtjeva",
                    "description": "Analiza korisničkog zahtjeva za utvrđivanje potrebnih akcija",
                    "agent": "executor"
                },
                {
                    "title": "Generiranje koda",
                    "description": "Kreiranje potrebnog koda za traženu funkcionalnost",
                    "agent": "code"
                },
                {
                    "title": "Testiranje i izvršavanje",
                    "description": "Provjera funkcionalnosti koda i otklanjanje grešaka",
                    "agent": "debugger"
                }
            ]
        }
        return {
            "response": json.dumps(default_plan, ensure_ascii=False),
            "flow": ["Planner"],
            "agents": ["Error: " + str(e)],
            "type": "text"
        }