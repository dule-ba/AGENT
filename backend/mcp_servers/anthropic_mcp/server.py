import logging
from typing import Dict, List, Any, Optional, Union, Tuple
import os

from .anthropic_mcp import AnthropicMCP
from .config import MCPConfig

logger = logging.getLogger("anthropic_mcp")

class MCPServer:
    """
    MCP server za interakciju sa Anthropic API-jem.
    Implementira standardni MCP server interfejs.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Inicijalizacija Anthropic MCP servera.
        
        Args:
            config: Konfiguracija servera
        """
        # Učitaj API ključ iz konfiguracije ili env varijable
        api_key = config.get("api_key", os.environ.get("ANTHROPIC_API_KEY", ""))
        
        # Kreiraj MCPConfig instancu
        mcp_config = MCPConfig(
            api_key=api_key,
            base_url=config.get("base_url", "https://api.anthropic.com"),
            version=config.get("version", "2023-06-01"),
            default_model=config.get("default_model", "claude-3-5-sonnet-20240620"),
            max_tokens=config.get("max_tokens", 4096),
            timeout=config.get("timeout", 120),
            cache_enabled=config.get("cache_enabled", True),
            cache_ttl=config.get("cache_ttl", 3600),
            rate_limit_enabled=config.get("rate_limit_enabled", True),
            rate_limit_requests=config.get("rate_limit_requests", 10)
        )
        
        # Kreiraj AnthropicMCP instancu
        self.client = AnthropicMCP(config=mcp_config)
        logger.info("Anthropic MCP server inicijaliziran")
    
    def get_models(self) -> List[str]:
        """
        Vraća listu dostupnih modela.
        
        Returns:
            Lista modela
        """
        return self.client.config.supported_models
    
    def generate_text(self, 
                     prompt: str, 
                     model: Optional[str] = None,
                     max_tokens: Optional[int] = None,
                     temperature: float = 0.7,
                     system_prompt: Optional[str] = None,
                     session_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Generiše tekst koristeći Anthropic model.
        
        Args:
            prompt: Tekst prompta
            model: Model za korištenje
            max_tokens: Maksimalni broj tokena za odgovor
            temperature: Temperatura za generisanje (0-1)
            system_prompt: Sistemski prompt za model
            session_id: ID sesije
            
        Returns:
            Dict sa generisanim tekstom i metapodacima
        """
        result = self.client.generate_response(
            prompt=prompt,
            model=model,
            system_prompt=system_prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            session_id=session_id
        )
        
        return result
    
    def chat_completion(self, 
                       messages: List[Dict[str, str]],
                       model: Optional[str] = None,
                       max_tokens: Optional[int] = None,
                       temperature: float = 0.7,
                       system_prompt: Optional[str] = None,
                       session_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Generiše odgovor na chat poruku.
        
        Args:
            messages: Lista poruka u formatu [{"role": "user"/"assistant", "content": "text"}]
            model: Model za korištenje
            max_tokens: Maksimalni broj tokena za odgovor
            temperature: Temperatura za generisanje (0-1)
            system_prompt: Sistemski prompt za model
            session_id: ID sesije
            
        Returns:
            Dict sa generisanim odgovorom i metapodacima
        """
        # Za sada, samo uzimamo zadnju user poruku kao prompt
        # U budućoj implementaciji, trebamo podržati pravi chat interfejs
        user_messages = [m for m in messages if m.get("role") == "user"]
        if not user_messages:
            raise ValueError("Nedostaju korisničke poruke")
        
        last_message = user_messages[-1]["content"]
        
        return self.generate_text(
            prompt=last_message,
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            system_prompt=system_prompt,
            session_id=session_id
        )
    
    def get_session_history(self, session_id: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Vraća istoriju sesije.
        
        Args:
            session_id: ID sesije
            limit: Maksimalni broj poruka za vraćanje
            
        Returns:
            Lista poruka u sesiji
        """
        return self.client.get_session_history(session_id, limit)
    
    def create_session(self, metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Kreira novu sesiju.
        
        Args:
            metadata: Metapodaci za sesiju
            
        Returns:
            Dict sa informacijama o sesiji
        """
        session_id = self.client.session_manager.create_session(metadata=metadata or {})
        return {"session_id": session_id, "metadata": metadata or {}}
    
    def close(self) -> None:
        """
        Zatvara server i oslobađa resurse.
        """
        self.client.close()
        logger.info("Anthropic MCP server zatvoren") 