import tiktoken
from typing import Dict, List, Union, Optional

# Modelirani enkodera za različite modele
MODEL_MAX_TOKENS = {
    # OpenAI modeli
    "gpt-4o": 4096,
    "gpt-4o-16k": 16384,
    "gpt-4": 8192,
    "gpt-4-32k": 32768,
    "gpt-4o": 128000,
    
    # Anthropic modeli
    "claude-instant-1": 100000,
    "claude-1": 100000,
    "claude-2": 100000,
    "claude-3-opus-20240229": 200000,
    "claude-3-sonnet-20240229": 180000,
    "claude-3-haiku-20240307": 150000,
    
    # Google modeli
    "gemini-pro": 32768,
    "gemini-ultra": 32768,
    
    # Defaults za nepoznate modele
    "default-8k": 8192,
    "default-16k": 16384,
    "default-32k": 32768,
    "default": 4096
}

def num_tokens_from_string(text: str, model: str = "gpt-4o") -> int:
    """
    Vraća broj tokena u tekstu za zadani model.
    
    Args:
        text: Tekst za brojanje tokena
        model: Naziv modela za koji se broje tokeni
        
    Returns:
        Broj tokena u tekstu
    """
    try:
        # Prilagodi model na format za koji tiktoken ima enkoder
        encoding_name = get_encoding_name(model)
        
        # Dobavi enkoder
        encoder = tiktoken.encoding_for_model(encoding_name)
        
        # Izbroji tokene
        tokens = encoder.encode(text)
        return len(tokens)
    except Exception as e:
        # Fallback na procjenu: otprilike 4 karaktera = 1 token
        print(f"Greška pri brojanju tokena: {e}. Koristim aproksimaciju.")
        return len(text) // 4

def get_encoding_name(model: str) -> str:
    """
    Vraća naziv enkodiranja za tiktoken na temelju modela.
    
    Args:
        model: Naziv modela
        
    Returns:
        Naziv enkodiranja za tiktoken
    """
    # OpenAI modeli
    if "gpt-4" in model:
        return "gpt-4"
    if "gpt-3.5" in model:
        return "gpt-4o"
    
    # Anthropic modeli nemaju direktnu podršku u tiktoken, koristimo gpt-4
    if "claude" in model:
        return "gpt-4"
    
    # Google modeli također nemamo direktnu podršku, koristimo gpt-4
    if "gemini" in model:
        return "gpt-4"
    
    # Default enkoding
    return "gpt-4o"

def get_max_tokens(model: str) -> int:
    """
    Vraća maksimalni broj tokena koje model podržava.
    
    Args:
        model: Naziv modela
        
    Returns:
        Maksimalni broj tokena
    """
    return MODEL_MAX_TOKENS.get(model, MODEL_MAX_TOKENS["default"])

def count_message_tokens(messages: List[Dict[str, str]], model: str = "gpt-4o") -> int:
    """
    Broji tokene u formatu poruke za ChatGPT API.
    
    Args:
        messages: Lista poruka u formatu ChatGPT API
        model: Naziv modela
        
    Returns:
        Ukupan broj tokena u porukama
    """
    # Format poruka kao string za brojanje tokena
    text = ""
    for message in messages:
        role = message.get("role", "user")
        content = message.get("content", "")
        # Dodamo malo ekstra tokena za format poruke
        text += f"{role}: {content}\n\n"
    
    # Dodajemo mali overhead za format poruka
    overhead = 4 * len(messages)  # Otprilike 4 tokena po poruci za metapodatke
    
    return num_tokens_from_string(text, model) + overhead

def estimate_tokens_left(messages: List[Dict[str, str]], model: str = "gpt-4o") -> int:
    """
    Procjenjuje broj preostalih tokena za odgovor u modelu.
    
    Args:
        messages: Lista poruka u formatu ChatGPT API
        model: Naziv modela
        
    Returns:
        Procjena broja tokena koji su još dostupni za odgovor
    """
    max_tokens = get_max_tokens(model)
    used_tokens = count_message_tokens(messages, model)
    
    # Ostavljamo mali buffer od 50 tokena za sigurnost
    return max(0, max_tokens - used_tokens - 50)

def can_fit_in_context(text: str, current_messages: List[Dict[str, str]], model: str = "gpt-4o") -> bool:
    """
    Provjerava može li se tekst uklopiti u trenutni kontekst za model.
    
    Args:
        text: Tekst koji se želi dodati
        current_messages: Trenutne poruke u kontekstu
        model: Naziv modela
        
    Returns:
        True ako se tekst može uklopiti, False inače
    """
    text_tokens = num_tokens_from_string(text, model)
    tokens_left = estimate_tokens_left(current_messages, model)
    
    return text_tokens <= tokens_left

def truncate_text_to_fit(text: str, max_tokens: int, model: str = "gpt-4o") -> str:
    """
    Skraćuje tekst tako da stane u zadani broj tokena.
    
    Args:
        text: Tekst za skraćivanje
        max_tokens: Maksimalni broj tokena
        model: Naziv modela
        
    Returns:
        Skraćeni tekst koji stane u zadani broj tokena
    """
    if num_tokens_from_string(text, model) <= max_tokens:
        return text
    
    # Ako je prevelik, skraćujemo ga iterativno
    encoding_name = get_encoding_name(model)
    encoder = tiktoken.encoding_for_model(encoding_name)
    
    tokens = encoder.encode(text)
    truncated_tokens = tokens[:max_tokens]
    
    return encoder.decode(truncated_tokens) 