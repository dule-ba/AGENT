import os
import json
import time
from datetime import datetime
from typing import Dict, List, Any, Optional
import uuid

# Lokacija za čuvanje memorije
MEMORY_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "memory")

class MemoryManager:
    """
    Upravlja memorijom agenata i sesijama konverzacija.
    Ova klasa omogućava:
    - Pamćenje poruka i odgovora u sesijama
    - Sažimanje dugih sesija
    - Pristup povijesti konverzacija
    - Perzistentno čuvanje razgovora
    """
    
    def __init__(self):
        """Inicijalizira MemoryManager."""
        # Osiguraj da direktorij za memoriju postoji
        if not os.path.exists(MEMORY_DIR):
            os.makedirs(MEMORY_DIR)
        
        # Aktivne sesije u memoriji
        self.sessions = {}
        
        # Sažetci sesija
        self.session_summaries = {}
        
        # Učitaj postojeće sesije
        self._load_sessions()
    
    def _load_sessions(self):
        """Učitava postojeće sesije iz datoteka."""
        try:
            for filename in os.listdir(MEMORY_DIR):
                if filename.endswith(".json"):
                    session_id = filename.split(".")[0]
                    file_path = os.path.join(MEMORY_DIR, filename)
                    
                    with open(file_path, 'r', encoding='utf-8') as f:
                        session_data = json.load(f)
                        self.sessions[session_id] = session_data
                        
                        # Ako sesija ima sažetak, učitaj ga
                        if 'summary' in session_data:
                            self.session_summaries[session_id] = session_data['summary']
        except Exception as e:
            print(f"Greška pri učitavanju sesija: {e}")
    
    def save_to_session(self, session_id: str, agent: str, message: str, response: Dict[str, Any]) -> None:
        """
        Čuva poruku i odgovor u memoriji sesije.
        
        Args:
            session_id: ID sesije
            agent: Naziv agenta
            message: Poruka korisnika
            response: Odgovor agenta
        """
        if not session_id:
            session_id = str(uuid.uuid4())
        
        # Provjeri postoji li sesija, ako ne postoji, kreiraj novu
        if session_id not in self.sessions:
            self.sessions[session_id] = {
                'messages': [],
                'created_at': datetime.now().isoformat(),
                'agents_used': set(),
                'summary': "Nova sesija započeta."
            }
        
        # Dodaj agenta u set korištenih agenata
        if 'agents_used' in self.sessions[session_id]:
            if isinstance(self.sessions[session_id]['agents_used'], set):
                self.sessions[session_id]['agents_used'].add(agent)
            else:
                self.sessions[session_id]['agents_used'] = {agent}
        else:
            self.sessions[session_id]['agents_used'] = {agent}
        
        # Dodaj poruku u sesiju
        self.sessions[session_id]['messages'].append({
            'agent': agent,
            'message': message,
            'response': response,
            'timestamp': datetime.now().isoformat()
        })
        
        # Spremi sesiju u datoteku
        self._save_session(session_id)
        
        # Ako je sesija postala prevelika, napravi sažetak
        if len(self.sessions[session_id]['messages']) > 10:
            self._summarize_session(session_id)
    
    def _save_session(self, session_id: str) -> None:
        """Sprema sesiju u datoteku."""
        try:
            file_path = os.path.join(MEMORY_DIR, f"{session_id}.json")
            
            # Pretvorimo set u listu za json serijalizaciju
            session_data = self.sessions[session_id].copy()
            if 'agents_used' in session_data and isinstance(session_data['agents_used'], set):
                session_data['agents_used'] = list(session_data['agents_used'])
            
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(session_data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Greška pri spremanju sesije {session_id}: {e}")
    
    def _summarize_session(self, session_id: str) -> None:
        """
        Stvara sažetak sesije kada postane prevelika.
        Ovo je ključno za očuvanje konteksta bez prekoračenja limita tokena.
        """
        # Import ovdje da se izbjegne cirkularni import
        from .context_compressor_agent import compress_context
        
        if session_id not in self.sessions:
            return
        
        # Dohvati sve poruke sesije
        messages = self.sessions[session_id]['messages']
        
        # Pripremimo tekst za sažimanje
        conversation_text = "\n\n".join([
            f"USER: {msg['message']}\n"
            f"AGENT({msg['agent']}): {msg['response'].get('response', '')}"
            for msg in messages
        ])
        
        # Privremeni mock implementacija dok ne stvorimo pravi kompressor
        if 'compress_context' not in globals():
            # Ako funkcija compress_context još nije dostupna, koristimo jednostavni sažetak
            summary = f"Razgovor ima {len(messages)} poruka. Teme uključuju: {', '.join([msg['agent'] for msg in messages[:5]])}..."
        else:
            # Inače koristimo pravu implementaciju
            summary = compress_context(conversation_text)
        
        # Sažetak spremi u sesiju
        self.sessions[session_id]['summary'] = summary
        self.session_summaries[session_id] = summary
        
        # Također spremi i komprimirani set poruka (zadrži samo zadnjih 15)
        self.sessions[session_id]['messages'] = messages[-15:]
        
        # Spremi ažuriranu sesiju
        self._save_session(session_id)
    
    def get_session_messages(self, session_id: str) -> List[Dict[str, Any]]:
        """
        Dohvaća poruke iz sesije.
        
        Args:
            session_id: ID sesije
            
        Returns:
            Lista poruka u sesiji
        """
        if session_id in self.sessions and 'messages' in self.sessions[session_id]:
            return self.sessions[session_id]['messages']
        return []
    
    def get_session_summary(self, session_id: str) -> str:
        """
        Dohvaća sažetak sesije.
        
        Args:
            session_id: ID sesije
            
        Returns:
            Sažetak sesije ili prazan string ako sesija ne postoji
        """
        if session_id in self.sessions and 'summary' in self.sessions[session_id]:
            return self.sessions[session_id]['summary']
        return ""
    
    def get_recent_context(self, session_id: str, max_messages: int = 5) -> Dict[str, Any]:
        """
        Dohvaća kontekst za nastavak konverzacije:
        - Sažetak sesije
        - Nekoliko zadnjih poruka
        
        Args:
            session_id: ID sesije
            max_messages: Maksimalni broj poruka za uključivanje
            
        Returns:
            Rječnik s kontekstom koji sadrži sažetak i zadnje poruke
        """
        context = {
            'summary': self.get_session_summary(session_id),
            'recent_messages': []
        }
        
        if session_id in self.sessions and 'messages' in self.sessions[session_id]:
            # Uzmi zadnjih N poruka
            messages = self.sessions[session_id]['messages']
            context['recent_messages'] = messages[-max_messages:] if len(messages) > max_messages else messages
        
        return context
    
    def delete_session(self, session_id: str) -> bool:
        """
        Briše sesiju.
        
        Args:
            session_id: ID sesije
            
        Returns:
            True ako je sesija uspješno obrisana, False inače
        """
        if session_id in self.sessions:
            del self.sessions[session_id]
            
            if session_id in self.session_summaries:
                del self.session_summaries[session_id]
            
            # Obriši datoteku sesije
            file_path = os.path.join(MEMORY_DIR, f"{session_id}.json")
            if os.path.exists(file_path):
                os.remove(file_path)
            
            return True
        return False
    
    def list_sessions(self) -> List[Dict[str, Any]]:
        """
        Lista sve dostupne sesije s osnovnim informacijama.
        
        Returns:
            Lista sesija s njihovim osnovnim metapodacima
        """
        result = []
        
        for session_id, session_data in self.sessions.items():
            summary = session_data.get('summary', 'Nema sažetka')
            created_at = session_data.get('created_at', 'Nepoznato vrijeme')
            
            agents = []
            if 'agents_used' in session_data:
                agents = list(session_data['agents_used']) if isinstance(session_data['agents_used'], set) else session_data['agents_used']
            
            num_messages = len(session_data.get('messages', []))
            
            result.append({
                'session_id': session_id,
                'created_at': created_at,
                'summary': summary,
                'agents_used': agents,
                'message_count': num_messages
            })
        
        # Sortiraj po vremenu kreiranja (novije prvo)
        result.sort(key=lambda x: x['created_at'], reverse=True)
        
        return result

# Instanciraj globalni memory manager
memory_manager = MemoryManager() 