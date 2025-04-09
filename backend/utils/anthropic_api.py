import os
import json
import httpx
from typing import List, Dict, Any, Optional
import asyncio

async def call_anthropic_api(
    messages: List[Dict[str, str]],
    model: str = "claude-3-opus-20240229",
    max_tokens: int = 1000,
    temperature: float = 0.7
) -> str:
    """
    Poziva Anthropic Claude API asinkrono.
    
    Args:
        messages: Lista poruka u formatu OpenAI (role, content)
        model: Koji Claude model koristiti
        max_tokens: Maksimalan broj tokena za odgovor
        temperature: Temperatura (kreativnost) za odgovor
        
    Returns:
        Tekst odgovora
    """
    # Dohvati API ključ iz environment varijable
    api_key = os.getenv("ANTHROPIC_API_KEY")
    
    if not api_key:
        return "Greška: ANTHROPIC_API_KEY nije postavljen. Potreban je za korištenje Claude modela."
    
    # Konvertuj OpenAI format poruka u Anthropic format
    anthropic_messages = convert_openai_to_anthropic_messages(messages)
    
    # Pripremi API zahtjev
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
    }
    
    data = {
        "model": model,
        "messages": anthropic_messages,
        "max_tokens": max_tokens,
        "temperature": temperature
    }
    
    # Pošalji zahtjev asinkrono
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers=headers,
                json=data
            )
            
            if response.status_code == 200:
                result = response.json()
                return result["content"][0]["text"]
            else:
                error_msg = f"Greška pri pozivu Anthropic API: {response.status_code} - {response.text}"
                print(error_msg)
                return f"Došlo je do greške: {error_msg}"
    
    except Exception as e:
        error_msg = f"Greška pri pozivu Anthropic API: {str(e)}"
        print(error_msg)
        return f"Došlo je do greške: {error_msg}"

def convert_openai_to_anthropic_messages(openai_messages: List[Dict[str, str]]) -> List[Dict[str, Any]]:
    """
    Konvertuje OpenAI format poruka u Anthropic format.
    
    OpenAI format: [{"role": "system/user/assistant", "content": "..."}]
    Anthropic format: [{"role": "user/assistant", "content": "..."}]
    
    Napomena: Anthropic ne koristi "system" role direktno, već stavlja system poruke
    u prvu user poruku.
    
    Args:
        openai_messages: Lista poruka u OpenAI formatu
        
    Returns:
        Lista poruka u Anthropic formatu
    """
    anthropic_messages = []
    system_content = ""
    
    # Prvo pronađi sve system poruke
    for msg in openai_messages:
        if msg["role"] == "system":
            system_content += msg["content"] + "\n\n"
    
    # Zatim dodaj ostale poruke
    for i, msg in enumerate(openai_messages):
        if msg["role"] == "system":
            continue  # Preskočimo system poruke, već smo ih procesirali
        
        content = msg["content"]
        role = msg["role"]
        
        # Ako je prva user poruka, dodaj system content na početak
        if role == "user" and not any(m["role"] == "user" for m in anthropic_messages) and system_content:
            content = system_content + "\n\n" + content
        
        # Anthropic podržava samo user i assistant role
        if role not in ["user", "assistant"]:
            role = "user"  # Fallback na user za ostale role
        
        anthropic_messages.append({"role": role, "content": content})
    
    # Ako nema user poruka, a imamo system content, dodajmo ga kao user poruku
    if system_content and not any(m["role"] == "user" for m in anthropic_messages):
        anthropic_messages.append({"role": "user", "content": system_content})
    
    # Anthropic zahtijeva da sekvenca započinje s user porukom
    if anthropic_messages and anthropic_messages[0]["role"] != "user":
        anthropic_messages.insert(0, {"role": "user", "content": "Započinjemo razgovor."})
    
    return anthropic_messages 