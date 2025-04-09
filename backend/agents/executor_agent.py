import os
import sys
import time
import json
import random
from typing import Dict, Any, List
from openai import OpenAI
import importlib

# Dodamo root direktorij projekta u sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config.config import AGENT_CONFIGS
from utils.anthropic_api import call_anthropic_api

# Inicijalizacija OpenAI klijenta
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

async def handle(request: Dict[str, Any], previous_messages: List[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Glavni Executor agent koji prima sve upite i odlučuje kako ih procesirati.
    
    Args:
        request: Zahtjev s porukom i drugim parametrima
        previous_messages: Prethodne poruke za kontekst
    
    Returns:
        Odgovor agenta
    """
    message = request.get("message", "")
    
    # Učitaj konfiguraciju za executor agenta
    executor_config = AGENT_CONFIGS.get("executor", {})
    
    # Poboljšana logika za model - zamijeni "default" sa gpt-4o ako je potrebno
    requested_model = request.get("model", "gpt-4o")
    if requested_model == "default":
        requested_model = "gpt-4o"  # Koristi gpt-4o kao fallback za "default"
    
    model = requested_model  # Koristi model iz zahtjeva ili default iz konfiguracije
    temperature = request.get("temperature", executor_config.get("temperature", 0.8))
    mcp_server = request.get("mcp_server", "anthropic")
    
    # Uzmi sažetak prethodne konverzacije ako postoji
    context_summary = request.get("context_summary", "")
    
    # Pripremi kontekst iz prethodnih poruka
    context = ""
    if previous_messages:
        context += "Prethodne poruke u razgovoru:\n"
        for i, msg in enumerate(previous_messages[-3:]):  # Uzimamo zadnje 3 poruke
            pm_user = msg.get("message", "")
            pm_response = ""
            if "response" in msg and isinstance(msg["response"], dict):
                pm_response = msg["response"].get("response", "")
            
            context += f"Poruka {i+1}:\nKorisnik: {pm_user}\nAgent: {pm_response}\n\n"
    
    # Ako imamo sažetak konteksta, dodajmo ga na početak
    if context_summary:
        context = f"SAŽETAK PRETHODNE KONVERZACIJE:\n{context_summary}\n\n" + context
    
    # Pripremi prompt koji potiče razumijevanje i akciju - koristi iz konfiguracije ako postoji
    system_prompt = executor_config.get("system_prompt", """
Ti si napredni izvršni agent AI Agent Platforme, na raspolaganju za pomoć korisnicima. Budi prijateljski, konverzacijski i prirodan.

KLJUČNI ZADACI:
1. RAZUMJETI korisničke upite i odgovoriti jasno, korisno i konverzacijski
2. IDENTIFICIRATI sljedeće korake ili agente kada korisnik traži specijalizirane zadatke
3. IZVRŠITI traženu akciju ili pružiti informaciju
4. PRATITI kontekst razgovora i prethodne poruke

VAŽNO: 
- UVIJEK budi konverzacijski i prijateljski - pozdravi korisnika i nastavi razgovor
- Na pozdrave i jednostavne upite odgovori prirodno i postavi pitanje poput "Kako vam mogu pomoći danas?"
- Budi proaktivan - ne samo da odgovaraš, već predlažeš rješenja i postavljaš follow-up pitanja
- Ako korisnik spominje kod, programiranje ili razvoj, razmisli o proslijeđivanju Code agentu
- Ako korisnik ima problem ili grešku, razmisli o proslijeđivanju Debugger agentu
- Ako korisnik treba planiranje ili organizaciju, razmisli o proslijeđivanju Planner agentu

Daj direktne i jasne odgovore. Ako ne znaš odgovor, priznaj to, ali ponudi alternativne pristupe.
Formatiranje: Koristi Markdown za bolje formatiranje kada je to potrebno.
""")

    # Stvaranje poruka za API poziv
    messages = [
        {"role": "system", "content": system_prompt},
    ]
    
    # Dodavanje konteksta ako postoji
    if context:
        messages.append({"role": "system", "content": f"KONTEKST RAZGOVORA:\n{context}"})
    
    # Dodavanje trenutnog upita korisnika
    messages.append({"role": "user", "content": message})
    
    try:
        if mcp_server == "anthropic":
            # Koristimo Anthropic API preko našeg wrappera
            response_text = await call_anthropic_api(
                messages=messages,
                max_tokens=1000
            )
        else:
            # Koristimo direktno OpenAI
            completion = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=1000
            )
            response_text = completion.choices[0].message.content
        
        # Pretvaraj response_text u zgodan output format za frontend
        result = {
            "response": response_text,
            "tokens_used": len(response_text.split()),  # Jednostavna aproksimacija tokena - broj riječi
            "model_used": "Claude-3 Opus" if mcp_server == "anthropic" else model,
            "time": time.time()
        }
        
        # Provjeri sadržaj poruke za preporuku agenta, ali ne pokazuj to u odgovoru
        lower_response = response_text.lower()
        
        # Provjeri sadrži li poruka korisnika neke ključne riječi koje bi mogle upućivati na potrebu za kodom
        code_indicators = ["programiranje", "kod", "funkcija", "aplikacija", "program", "napravi", "kreiraj", 
                          "html", "javascript", "python", "css", "stranicu", "web", "sql", "bazu", "```"]
        error_indicators = ["greška", "problem", "debugiranje", "debug", "popraviti", "ne radi", "pogreška"]
        plan_indicators = ["plan", "korak po korak", "organizirati", "strategija", "workflow", "procedura"]
        
        # Provjeri riječi u poruci korisnika
        user_msg_lower = message.lower()
        
        # Postavi suggested_agent na temelju sadržaja poruke korisnika, ne odgovora
        if any(indicator in user_msg_lower for indicator in code_indicators):
            result["suggested_agent"] = "code"
        elif any(indicator in user_msg_lower for indicator in error_indicators):
            result["suggested_agent"] = "debugger"
        elif any(indicator in user_msg_lower for indicator in plan_indicators):
            result["suggested_agent"] = "planner"
        
        # Ako nema jasne naznake u poruci korisnika, koristi sadržaj odgovora za preporuku
        if "suggested_agent" not in result:
            if any(indicator in lower_response for indicator in code_indicators) or "```" in response_text:
                result["suggested_agent"] = "code"
            elif any(indicator in lower_response for indicator in error_indicators):
                result["suggested_agent"] = "debugger"
            elif any(indicator in lower_response for indicator in plan_indicators):
                result["suggested_agent"] = "planner"
        
        return result
    
    except Exception as e:
        # Log grešku i vrati generički odgovor
        print(f"Greška u Executor agentu: {str(e)}")
        return {
            "response": f"Došlo je do greške pri obradi vašeg upita. Molimo pokušajte ponovno. (Greška: {str(e)})",
            "error": str(e),
            "time": time.time()
        }