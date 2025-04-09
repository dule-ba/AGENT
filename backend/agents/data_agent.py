import os
import sys
from openai import OpenAI

# Dodamo root direktorij projekta u sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config.config import AGENT_CONFIGS

async def handle(request, previous_messages=None):
    try:
        cfg = AGENT_CONFIGS["data"]
        
        # Inicijalizacija OpenAI klijenta
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        
        # Provjeri je li request rječnik ili objekt
        if isinstance(request, dict):
            message_content = request["message"]
        else:
            message_content = request.message
        
        # Dodaj prethodne poruke ako postoje
        messages = [{"role": "system", "content": cfg["system_prompt"]}]
        
        if previous_messages:
            # Formatiramo poruke iz sesije u format pogodan za API
            for prev_msg in previous_messages:
                if "agent" in prev_msg and prev_msg["agent"] == "data":
                    if "message" in prev_msg:
                        messages.append({"role": "user", "content": prev_msg["message"]})
                    if "response" in prev_msg and "response" in prev_msg["response"]:
                        messages.append({"role": "assistant", "content": prev_msg["response"]["response"]})
        
        # Dodaj trenutnu poruku
        messages.append({"role": "user", "content": message_content})
        
        res = client.chat.completions.create(
            model=cfg["model"],
            temperature=cfg["temperature"],
            max_tokens=cfg["max_tokens"],
            messages=messages
        )
        
        response_text = res.choices[0].message.content
        return {
            "response": response_text,
            "flow": ["Data"],
            "agents": [response_text]
        }
    except Exception as e:
        return {
            "response": f"Data agent error: {str(e)}",
            "flow": ["Data"],
            "agents": [f"Error: {str(e)}"]
        }