import time
import json
import hashlib
from typing import Dict, Any, Optional, List, Tuple

class SessionManager:
    def __init__(self, cache_enabled: bool = True, cache_ttl: int = 3600):
        self.sessions: Dict[str, Dict[str, Any]] = {}
        self.cache: Dict[str, Tuple[float, Any]] = {}
        self.cache_enabled = cache_enabled
        self.cache_ttl = cache_ttl
    
    def create_session(self, session_id: str, metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Kreira novu sesiju s metapodacima"""
        if not metadata:
            metadata = {}
        
        self.sessions[session_id] = {
            "id": session_id,
            "created_at": time.time(),
            "last_used": time.time(),
            "messages": [],
            "metadata": metadata
        }
        return self.sessions[session_id]
    
    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Vraća postojeću sesiju ako postoji"""
        if session_id in self.sessions:
            self.sessions[session_id]["last_used"] = time.time()
            return self.sessions[session_id]
        return None
    
    def add_message(self, session_id: str, role: str, content: str, additional_data: Optional[Dict[str, Any]] = None) -> None:
        """Dodaje poruku u sesiju"""
        if session_id not in self.sessions:
            self.create_session(session_id)
            
        message = {
            "role": role,
            "content": content,
            "timestamp": time.time()
        }
        
        if additional_data:
            message.update(additional_data)
            
        self.sessions[session_id]["messages"].append(message)
        self.sessions[session_id]["last_used"] = time.time()
    
    def get_messages(self, session_id: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """Dohvaća poruke iz sesije"""
        if session_id not in self.sessions:
            return []
            
        messages = self.sessions[session_id]["messages"]
        if limit:
            return messages[-limit:]
        return messages
    
    def generate_cache_key(self, params: Dict[str, Any]) -> str:
        """Generira ključ za keš na osnovu parametara zahtjeva"""
        # Sortirani string predstavljanja parametara za konzistentnost
        param_str = json.dumps(params, sort_keys=True)
        return hashlib.md5(param_str.encode()).hexdigest()
    
    def get_from_cache(self, key: str) -> Optional[Any]:
        """Dohvaća rezultat iz keša ako postoji i nije istekao"""
        if not self.cache_enabled or key not in self.cache:
            return None
            
        timestamp, value = self.cache[key]
        if time.time() - timestamp > self.cache_ttl:
            # Keš je istekao
            del self.cache[key]
            return None
            
        return value
    
    def add_to_cache(self, key: str, value: Any) -> None:
        """Dodaje rezultat u keš"""
        if self.cache_enabled:
            self.cache[key] = (time.time(), value)
    
    def clear_cache(self) -> None:
        """Briše cijeli keš"""
        self.cache.clear()
    
    def cleanup_sessions(self, max_age: int = 86400) -> int:
        """Briše stare sesije koje nisu korištene određeno vrijeme"""
        current_time = time.time()
        expired_sessions = [
            session_id for session_id, session in self.sessions.items()
            if current_time - session["last_used"] > max_age
        ]
        
        for session_id in expired_sessions:
            del self.sessions[session_id]
            
        return len(expired_sessions) 