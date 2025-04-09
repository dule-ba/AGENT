import json
import importlib
import os
import logging
from typing import Dict, List, Any, Optional

# Postavljanje loggera
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("mcp_connector")

class MCPConnector:
    """
    Klasa za upravljanje MCP serverima i komunikaciju s njima.
    """
    
    def __init__(self, config_path: str = "config/mcp_config.json"):
        """
        Inicijalizacija MCP konektora.
        
        Args:
            config_path: Putanja do konfiguracijske datoteke za MCP servere.
        """
        self.config_path = config_path
        self.config = self._load_config()
        self.mcp_servers = {}
        self.active_sessions = {}
        self.initialize_servers()
    
    def _load_config(self) -> Dict[str, Any]:
        """
        Učitavanje konfiguracije iz datoteke.
        
        Returns:
            Dict s konfiguracijom.
        """
        try:
            with open(self.config_path, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, FileNotFoundError) as e:
            logger.error(f"Greška pri učitavanju konfiguracije: {str(e)}")
            return {"mcp_servers": [], "mcp_settings": {}}
    
    def initialize_servers(self) -> None:
        """
        Inicijalizacija svih omogućenih MCP servera iz konfiguracije.
        """
        for server_config in self.config.get("mcp_servers", []):
            if server_config.get("enabled", False):
                self._initialize_server(server_config)
    
    def _initialize_server(self, server_config: Dict[str, Any]) -> None:
        """
        Inicijalizacija pojedinačnog MCP servera.
        
        Args:
            server_config: Konfiguracija servera.
        """
        server_name = server_config.get("name")
        module_name = server_config.get("module")
        
        if not server_name or not module_name:
            logger.warning(f"Nepotpuna konfiguracija za server: {server_name}")
            return
        
        try:
            # Pokušaj importa modula
            module_path = f"mcp_servers.{module_name}.server"
            server_module = importlib.import_module(module_path)
            
            # Inicijalizacija servera
            server_instance = server_module.MCPServer(server_config.get("config", {}))
            self.mcp_servers[server_name] = server_instance
            logger.info(f"MCP server inicijaliziran: {server_name}")
        except ImportError as e:
            logger.error(f"Greška pri importu MCP servera {server_name}: {str(e)}")
        except Exception as e:
            logger.error(f"Greška pri inicijalizaciji MCP servera {server_name}: {str(e)}")
    
    def get_server(self, server_name: str):
        """
        Dohvat instance MCP servera po imenu.
        
        Args:
            server_name: Ime servera za dohvat.
            
        Returns:
            Instanca MCP servera ili None ako server nije pronađen.
        """
        return self.mcp_servers.get(server_name)
    
    def get_available_servers(self) -> List[str]:
        """
        Dohvat liste dostupnih MCP servera.
        
        Returns:
            Lista imena dostupnih servera.
        """
        return list(self.mcp_servers.keys())
    
    def execute_mcp_call(self, server_name: str, method_name: str, 
                        parameters: Dict[str, Any], session_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Izvršavanje poziva prema MCP serveru.
        
        Args:
            server_name: Ime servera za poziv.
            method_name: Ime metode koja se poziva.
            parameters: Parametri za metodu.
            session_id: ID sesije (opcionalno).
            
        Returns:
            Rezultat poziva kao Dict.
        """
        server = self.get_server(server_name)
        if not server:
            return {"status": "error", "message": f"MCP server '{server_name}' nije pronađen"}
        
        try:
            # Provjera ima li server traženu metodu
            if not hasattr(server, method_name):
                return {"status": "error", "message": f"Metoda '{method_name}' nije dostupna na serveru '{server_name}'"}
            
            # Izvršavanje metode
            method = getattr(server, method_name)
            result = method(**parameters)
            
            # Zapisivanje sesije ako je potrebno
            if session_id and server_name not in self.active_sessions:
                self.active_sessions[server_name] = session_id
            
            return {"status": "success", "result": result}
        except Exception as e:
            logger.error(f"Greška pri izvršavanju MCP poziva na {server_name}.{method_name}: {str(e)}")
            return {"status": "error", "message": str(e)}
    
    def close_server(self, server_name: str) -> bool:
        """
        Zatvaranje servera i oslobađanje resursa.
        
        Args:
            server_name: Ime servera za zatvaranje.
            
        Returns:
            True ako je zatvaranje uspješno, inače False.
        """
        server = self.get_server(server_name)
        if not server:
            return False
        
        try:
            if hasattr(server, "close"):
                server.close()
            
            # Uklanjanje servera iz aktivnih
            self.mcp_servers.pop(server_name, None)
            self.active_sessions.pop(server_name, None)
            return True
        except Exception as e:
            logger.error(f"Greška pri zatvaranju MCP servera {server_name}: {str(e)}")
            return False
    
    def close_all_servers(self) -> None:
        """
        Zatvaranje svih MCP servera.
        """
        for server_name in list(self.mcp_servers.keys()):
            self.close_server(server_name)

# Instanca konektora za upotrebu u cijeloj aplikaciji
mcp_connector = MCPConnector()

def get_mcp_connector() -> MCPConnector:
    """
    Dohvat globalne instance MCP konektora.
    
    Returns:
        Instanca MCPConnector klase.
    """
    return mcp_connector 