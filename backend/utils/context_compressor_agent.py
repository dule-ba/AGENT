import os
from typing import Dict, List, Any, Optional

def compress_context(conversation_text: str, max_tokens: int = 1500) -> str:
    """
    Komprimira kontekst konverzacije u sažetak korištenjem LLM-a.
    
    Args:
        conversation_text: Tekst konverzacije za sažimanje
        max_tokens: Maksimalni broj tokena za sažetak
        
    Returns:
        Sažetak konverzacije
    """
    # Provjeri da li je instaliran openai
    try:
        from openai import OpenAI
    except ImportError:
        return "Nije moguće stvoriti sažetak jer 'openai' paket nije instaliran."
    
    # Inicijalizacija OpenAI klijenta
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return "Kreiran jednostavan sažetak jer OPENAI_API_KEY nije postavljen."
    
    try:
        client = OpenAI(api_key=api_key)
        
        # Pripremi prompt za sažimanje
        compress_prompt = f"""
Sažmi sljedeću konverzaciju u SAŽET i INFORMATIVAN rezime.
Fokusiraj se na:
1. Glavne teme i pitanja korisnika
2. Ključne zaključke i odluke
3. Važne detalje o projektima, programskom kodu ili drugim tehničkim komponentama
4. Kontekst razgovora koji je važan za buduće reference

Izbjegavaj ponavljanja i nevažne detalje. Sažetak treba biti kratak, ali sadržajan.

KONVERZACIJA:
{conversation_text}

SAŽETAK:
"""
        
        # Poziv OpenAI API-ja za sažimanje
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",  # Možemo koristiti i drugi model
            messages=[
                {"role": "system", "content": "Ti si stručnjak za sažimanje kompleksnih konverzacija. Tvoj zadatak je napraviti koncizni sažetak koji zadržava sve ključne informacije."},
                {"role": "user", "content": compress_prompt}
            ],
            max_tokens=max_tokens,
            temperature=0.3,  # Niža temperatura za konzistentniji output
        )
        
        # Dohvati i vrati sažetak
        summary = response.choices[0].message.content.strip()
        return summary
    
    except Exception as e:
        print(f"Greška pri sažimanju konteksta: {e}")
        # Fallback na jednostavni sažetak
        # Analiziraj tekst da pronađeš ključne riječi
        words = conversation_text.split()
        top_words = set()
        
        # Uzmi 20 najdužih riječi kao ključne riječi (pojednostavljeno)
        for word in sorted(set(words), key=len, reverse=True)[:20]:
            if len(word) > 4:  # Ignoriraj kraće riječi
                top_words.add(word.lower())
        
        # Kreiraj jednostavan sažetak
        return f"Konverzacija sadrži ove ključne riječi: {', '.join(top_words)}. Razgovor ima otprilike {len(words)} riječi."

def create_compact_context(session_messages: List[Dict[str, Any]], max_messages: int = 5) -> Dict[str, Any]:
    """
    Stvara kompaktni kontekst koji uključuje:
    1. Sažetak starijih poruka
    2. Zadnjih nekoliko poruka u cijelosti
    
    Args:
        session_messages: Lista poruka iz sesije
        max_messages: Broj zadnjih poruka koje treba zadržati u cijelosti
        
    Returns:
        Rječnik s sažetkom starijih poruka i zadnjim porukama
    """
    if len(session_messages) <= max_messages:
        # Ako ima manje poruka od max_messages, vraćamo sve poruke bez sažimanja
        return {
            "summary": None,
            "recent_messages": session_messages
        }
    
    # Odvoji starije poruke za sažimanje
    older_messages = session_messages[:-max_messages]
    recent_messages = session_messages[-max_messages:]
    
    # Formatiraj starije poruke za sažimanje
    conversation_text = ""
    for msg in older_messages:
        agent_name = msg.get("agent", "Agent")
        message_text = msg.get("message", "")
        response_text = msg.get("response", {}).get("response", "")
        
        conversation_text += f"KORISNIK: {message_text}\n"
        conversation_text += f"{agent_name.upper()}: {response_text}\n\n"
    
    # Sažmi starije poruke
    summary = compress_context(conversation_text)
    
    return {
        "summary": summary,
        "recent_messages": recent_messages
    }

def format_context_for_model(context: Dict[str, Any], model_format: str = "openai") -> List[Dict[str, str]]:
    """
    Formatira kontekst za slanje LLM modelu.
    
    Args:
        context: Kontekst s sažetkom i zadnjim porukama
        model_format: Format modela ('openai', 'anthropic', 'google')
        
    Returns:
        Formatirani kontekst spreman za slanje modelu
    """
    formatted_messages = []
    
    # Dodaj sažetak kao system poruku
    if context.get("summary"):
        if model_format == "openai":
            formatted_messages.append({
                "role": "system", 
                "content": f"Sažetak prethodne konverzacije:\n{context['summary']}"
            })
        elif model_format == "anthropic":
            # Anthropic koristi drugačiji format
            formatted_messages.append({
                "role": "assistant", 
                "content": f"Sažetak prethodne konverzacije:\n{context['summary']}"
            })
    
    # Dodaj zadnje poruke
    for msg in context.get("recent_messages", []):
        user_message = msg.get("message", "")
        agent_response = msg.get("response", {}).get("response", "")
        
        formatted_messages.append({"role": "user", "content": user_message})
        formatted_messages.append({"role": "assistant", "content": agent_response})
    
    return formatted_messages 