import os
import json
import httpx
import uuid
import logging
from typing import Dict, Any, List, Optional, Tuple, Union

from .config import MCPConfig, DEFAULT_MODEL, SUPPORTED_MODELS
from .session import SessionManager

logger = logging.getLogger(__name__)

class OpenAIMCP:
    def __init__(self, config: Optional[MCPConfig] = None):
        self.config = config or MCPConfig()
        self.session_manager = SessionManager(
            cache_enabled=self.config.cache_enabled,
            cache_ttl=self.config.cache_ttl
        )
        self.client = httpx.Client(
            base_url=self.config.base_url,
            timeout=self.config.timeout,
            headers={
                "Authorization": f"Bearer {self.config.api_key}",
                "Content-Type": "application/json"
            }
        )
    
    # Uklonjena tiktoken zavisnost
    def _estimate_tokens(self, text: str) -> int:
        """
        Jednostavna procjena broja tokena bazirana na dužini teksta.
        Aproksimacija: 1 token ≈ 4 karaktera za engleski jezik.
        """
        return len(text) // 4

    def generate_response(
        self,
        prompt: str,
        model: Optional[str] = None,
        system_prompt: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: float = 0.7,
        session_id: Optional[str] = None,
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[str] = None,
        use_cache: bool = True
    ) -> Dict[str, Any]:
        """
        Generiše odgovor koristeći OpenAI API
        """
        model = model or self.config.default_model
        max_tokens = max_tokens or self.config.max_tokens
        
        if model not in self.config.supported_models:
            raise ValueError(f"Model '{model}' nije podržan. Podržani modeli: {', '.join(self.config.supported_models)}")
        
        if not session_id:
            session_id = str(uuid.uuid4())
            
        session = self.session_manager.get_session(session_id) or self.session_manager.create_session(session_id)
        
        # Dodaj korisničku poruku u sesiju
        self.session_manager.add_message(session_id, "user", prompt)
        
        # Kreiraj zahtjev
        messages = []
        
        # Dodaj system prompt ako postoji
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        
        # Dodaj korisničku poruku
        messages.append({"role": "user", "content": prompt})
        
        request_data = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature
        }
        
        if tools:
            request_data["tools"] = tools
            
        if tool_choice:
            request_data["tool_choice"] = tool_choice
        
        # Provjeri keš ako je omogućen
        if use_cache and self.config.cache_enabled:
            cache_key = self.session_manager.generate_cache_key(request_data)
            cached_response = self.session_manager.get_from_cache(cache_key)
            if cached_response:
                logger.info(f"Pronađen keširani odgovor za {cache_key}")
                # Dodaj keširani odgovor u sesiju
                content = cached_response.get("content", "")
                self.session_manager.add_message(
                    session_id, "assistant", content, 
                    {"cached": True, "model": model}
                )
                return cached_response
        
        try:
            # Pošalji zahtjev
            response = self.client.post("/chat/completions", json=request_data)
            response.raise_for_status()
            response_data = response.json()
            
            # Izvuci sadržaj
            choice = response_data["choices"][0]
            assistant_response = choice["message"]["content"]
            
            # Pokupi tool pozive ako postoje
            tool_calls = choice["message"].get("tool_calls", [])
            
            # Kreiranje rezultata
            result = {
                "id": response_data.get("id"),
                "model": response_data.get("model"),
                "content": assistant_response,
                "tool_calls": tool_calls,
                "usage": response_data.get("usage", {}),
                "finish_reason": choice.get("finish_reason")
            }
            
            # Dodaj odgovor u keš
            if self.config.cache_enabled and use_cache:
                cache_key = self.session_manager.generate_cache_key(request_data)
                self.session_manager.add_to_cache(cache_key, result)
            
            # Dodaj odgovor u sesiju
            self.session_manager.add_message(
                session_id, "assistant", assistant_response,
                {
                    "model": model, 
                    "tool_calls": tool_calls,
                    "usage": response_data.get("usage", {})
                }
            )
            
            return result
            
        except httpx.HTTPStatusError as e:
            error_message = f"HTTP greška: {e.response.status_code} - {e.response.text}"
            logger.error(error_message)
            raise Exception(error_message)
        except Exception as e:
            logger.error(f"Neočekivana greška: {str(e)}")
            raise
    
    def get_session_history(self, session_id: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """Vraća istoriju sesije"""
        return self.session_manager.get_messages(session_id, limit)
    
    def get_token_usage(self, session_id: str) -> Dict[str, int]:
        """Vraća statistiku korištenja tokena za sesiju"""
        return self.session_manager.get_token_usage(session_id)
    
    def cleanup_sessions(self, max_age: int = 86400) -> int:
        """Briše stare sesije"""
        return self.session_manager.cleanup_sessions(max_age)
    
    def clear_cache(self) -> None:
        """Briše keš"""
        self.session_manager.clear_cache()
    
    def close(self) -> None:
        """Zatvara HTTP klijent"""
        self.client.close() 