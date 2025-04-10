import os
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field

# Podržani modeli
DEFAULT_MODEL = "gpt-4o"
SUPPORTED_MODELS = [
    "gpt-4o",
    "gpt-4-turbo",
    "gpt-4-vision-preview",
    "gpt-4",
    "gpt-3.5-turbo",
    "gpt-3.5-turbo-1106"
]

@dataclass
class MCPConfig:
    """Konfiguracija za OpenAI MCP"""
    
    # API konfiguracija
    api_key: str = field(default_factory=lambda: os.environ.get("OPENAI_API_KEY", ""))
    base_url: str = "https://api.openai.com/v1"
    
    # Model konfiguracija
    default_model: str = DEFAULT_MODEL
    supported_models: List[str] = field(default_factory=lambda: SUPPORTED_MODELS)
    max_tokens: int = 4096
    
    # Timeout konfiguracija (u sekundama)
    timeout: int = 120
    
    # Keš konfiguracija
    cache_enabled: bool = True
    cache_ttl: int = 3600  # 1 sat
    
    # Token tracking
    token_tracking: bool = True
    
    # Konfiguracija ratelimiita
    rate_limit_enabled: bool = True
    rate_limit_requests: int = 20  # Zahtjeva po minuti
    
    def __post_init__(self):
        # Učitaj API ključ iz env varijable ako nije postavljen
        if not self.api_key:
            self.api_key = os.environ.get("OPENAI_API_KEY", "")
            if not self.api_key:
                raise ValueError("OpenAI API ključ nije postavljen. Postavite OPENAI_API_KEY env varijablu ili proslijedite api_key parametar.")
    
    def to_dict(self) -> Dict[str, Any]:
        """Konvertuje konfiguraciju u rječnik"""
        return {
            "api_key": "***REDACTED***" if self.api_key else None,
            "base_url": self.base_url,
            "default_model": self.default_model,
            "supported_models": self.supported_models,
            "max_tokens": self.max_tokens,
            "timeout": self.timeout,
            "cache_enabled": self.cache_enabled,
            "cache_ttl": self.cache_ttl,
            "token_tracking": self.token_tracking,
            "rate_limit_enabled": self.rate_limit_enabled,
            "rate_limit_requests": self.rate_limit_requests
        }
    
    @classmethod
    def from_dict(cls, config_dict: Dict[str, Any]) -> "MCPConfig":
        """Kreira konfiguraciju iz rječnika"""
        return cls(
            api_key=config_dict.get("api_key", ""),
            base_url=config_dict.get("base_url", "https://api.openai.com/v1"),
            default_model=config_dict.get("default_model", DEFAULT_MODEL),
            supported_models=config_dict.get("supported_models", SUPPORTED_MODELS),
            max_tokens=config_dict.get("max_tokens", 4096),
            timeout=config_dict.get("timeout", 120),
            cache_enabled=config_dict.get("cache_enabled", True),
            cache_ttl=config_dict.get("cache_ttl", 3600),
            token_tracking=config_dict.get("token_tracking", True),
            rate_limit_enabled=config_dict.get("rate_limit_enabled", True),
            rate_limit_requests=config_dict.get("rate_limit_requests", 20)
        ) 