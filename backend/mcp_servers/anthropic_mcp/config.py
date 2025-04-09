import os
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field

# Podržani modeli
DEFAULT_MODEL = "claude-3-5-sonnet-20240620"
SUPPORTED_MODELS = [
    "claude-3-5-sonnet-20240620",
    "claude-3-opus-20240229",
    "claude-3-sonnet-20240229",
    "claude-3-haiku-20240307",
    "claude-2.1",
    "claude-2.0"
]

@dataclass
class MCPConfig:
    """Konfiguracija za Anthropic MCP"""
    
    # API konfiguracija
    api_key: str = field(default_factory=lambda: os.environ.get("ANTHROPIC_API_KEY", ""))
    base_url: str = "https://api.anthropic.com"
    version: str = "2023-06-01"
    
    # Model konfiguracija
    default_model: str = DEFAULT_MODEL
    supported_models: List[str] = field(default_factory=lambda: SUPPORTED_MODELS)
    max_tokens: int = 4096
    
    # Timeout konfiguracija (u sekundama)
    timeout: int = 120
    
    # Keš konfiguracija
    cache_enabled: bool = True
    cache_ttl: int = 3600  # 1 sat
    
    # Konfiguracija ratelimiita
    rate_limit_enabled: bool = True
    rate_limit_requests: int = 10  # Zahtjeva po minuti
    
    def __post_init__(self):
        # Učitaj API ključ iz env varijable ako nije postavljen
        if not self.api_key:
            self.api_key = os.environ.get("ANTHROPIC_API_KEY", "")
            if not self.api_key:
                raise ValueError("Anthropic API ključ nije postavljen. Postavite ANTHROPIC_API_KEY env varijablu ili proslijedite api_key parametar.")
    
    def to_dict(self) -> Dict[str, Any]:
        """Konvertuje konfiguraciju u rječnik"""
        return {
            "api_key": "***REDACTED***" if self.api_key else None,
            "base_url": self.base_url,
            "version": self.version,
            "default_model": self.default_model,
            "supported_models": self.supported_models,
            "max_tokens": self.max_tokens,
            "timeout": self.timeout,
            "cache_enabled": self.cache_enabled,
            "cache_ttl": self.cache_ttl,
            "rate_limit_enabled": self.rate_limit_enabled,
            "rate_limit_requests": self.rate_limit_requests
        }
    
    @classmethod
    def from_dict(cls, config_dict: Dict[str, Any]) -> "MCPConfig":
        """Kreira konfiguraciju iz rječnika"""
        return cls(
            api_key=config_dict.get("api_key", ""),
            base_url=config_dict.get("base_url", "https://api.anthropic.com"),
            version=config_dict.get("version", "2023-06-01"),
            default_model=config_dict.get("default_model", DEFAULT_MODEL),
            supported_models=config_dict.get("supported_models", SUPPORTED_MODELS),
            max_tokens=config_dict.get("max_tokens", 4096),
            timeout=config_dict.get("timeout", 120),
            cache_enabled=config_dict.get("cache_enabled", True),
            cache_ttl=config_dict.get("cache_ttl", 3600),
            rate_limit_enabled=config_dict.get("rate_limit_enabled", True),
            rate_limit_requests=config_dict.get("rate_limit_requests", 10)
        ) 