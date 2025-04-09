"""
MCP (Model Communication Protocol) serveri za komunikaciju s različitim API servisima.
"""

import importlib
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger("mcp_servers")

# Registar dostupnih MCP servera
SERVER_REGISTRY = {
    "github": "github_mcp.server",
    "twitter": "twitter_mcp.server",
    "anthropic": "anthropic_mcp.server",
    "huggingface": "huggingface_mcp.server",
    # Dodajte nove servere ovdje
}

def get_mcp_server(server_type: str, config: Optional[Dict[str, Any]] = None) -> Any:
    """
    Dohvaća instancu MCP servera na osnovu tipa.
    
    Args:
        server_type: Tip MCP servera (npr. 'github', 'twitter')
        config: Konfiguracija za server
        
    Returns:
        Instanca MCP servera ili None ako server ne postoji
    """
    if not config:
        config = {}
    
    if server_type not in SERVER_REGISTRY:
        logger.error(f"Nepoznat MCP server tip: {server_type}")
        return None
    
    try:
        # Dinamičko učitavanje modula za traženi server
        module_path = f"mcp_servers.{SERVER_REGISTRY[server_type]}"
        module = importlib.import_module(module_path)
        
        # Instanciranje MCP servera
        server = module.MCPServer(config)
        logger.info(f"MCP server '{server_type}' uspješno kreiran")
        return server
    except (ImportError, AttributeError) as e:
        logger.error(f"Greška pri učitavanju MCP servera '{server_type}': {str(e)}")
        return None

# Inicijalizacija mcp_servers paketa 

# Inicijalizacijski fajl za mcp_servers paket 