import requests
import json
import logging
import os
import base64
from typing import Dict, List, Any, Optional, Union

# Postavljanje loggera
logger = logging.getLogger("github_mcp")

class MCPServer:
    """
    MCP server za interakciju s GitHub API-jem.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Inicijalizacija GitHub MCP servera.
        
        Args:
            config: Konfiguracija servera koja sadrži GitHub API ključ.
        """
        self.api_base = "https://api.github.com"
        self.token = config.get("api_key", os.environ.get("GITHUB_TOKEN", ""))
        
        self.headers = {
            "Accept": "application/vnd.github.v3+json",
            "Authorization": f"token {self.token}" if self.token else ""
        }
        self.use_cache = config.get("use_cache", True)
        self.cache = {}
        logger.info("GitHub MCP server inicijaliziran")
    
    def _get_request(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Izvršavanje GET zahtjeva prema GitHub API-ju.
        
        Args:
            endpoint: API endpoint za zahtjev.
            params: Parametri za zahtjev.
            
        Returns:
            Dict s rezultatom zahtjeva.
        """
        # Cache ključ za zahtjev
        cache_key = f"{endpoint}_{json.dumps(params or {})}"
        
        # Provjera cache-a
        if self.use_cache and cache_key in self.cache:
            logger.info(f"Koristeći cache za zahtjev: {endpoint}")
            return self.cache[cache_key]
        
        try:
            url = f"{self.api_base}/{endpoint.lstrip('/')}"
            response = requests.get(url, headers=self.headers, params=params)
            response.raise_for_status()
            
            result = response.json()
            
            # Spremi u cache ako je omogućen
            if self.use_cache:
                self.cache[cache_key] = result
                
            return result
        except requests.RequestException as e:
            logger.error(f"Greška pri GitHub API zahtjevu: {str(e)}")
            return {"error": str(e)}
    
    def search_repositories(self, query: str, sort: str = "stars", order: str = "desc", 
                           per_page: int = 10, page: int = 1) -> Dict[str, Any]:
        """
        Pretraživanje GitHub repozitorija.
        
        Args:
            query: Upit za pretraživanje.
            sort: Sortiranje rezultata (stars, forks, updated).
            order: Redoslijed (asc, desc).
            per_page: Broj rezultata po stranici.
            page: Broj stranice.
            
        Returns:
            Dict s rezultatima pretrage.
        """
        params = {
            "q": query,
            "sort": sort,
            "order": order,
            "per_page": per_page,
            "page": page
        }
        return self._get_request("search/repositories", params)
    
    def get_repository(self, owner: str, repo: str) -> Dict[str, Any]:
        """
        Dohvat informacija o repozitoriju.
        
        Args:
            owner: Vlasnik repozitorija.
            repo: Ime repozitorija.
            
        Returns:
            Dict s informacijama o repozitoriju.
        """
        return self._get_request(f"repos/{owner}/{repo}")
    
    def get_repository_files(self, owner: str, repo: str, path: str = "", 
                            ref: str = "main") -> List[Dict[str, Any]]:
        """
        Dohvat liste fajlova u repozitoriju.
        
        Args:
            owner: Vlasnik repozitorija.
            repo: Ime repozitorija.
            path: Putanja unutar repozitorija.
            ref: Referenca (grana, tag, commit).
            
        Returns:
            Lista fajlova i direktorija.
        """
        params = {"ref": ref}
        result = self._get_request(f"repos/{owner}/{repo}/contents/{path}", params)
        if "error" in result:
            return result
        
        # Ako nije lista, već pojedinačni fajl, vrati ga kao listu
        if not isinstance(result, list):
            return [result]
            
        return result
    
    def get_file_content(self, owner: str, repo: str, path: str, 
                        ref: str = "main") -> Dict[str, Any]:
        """
        Dohvat sadržaja fajla iz repozitorija.
        
        Args:
            owner: Vlasnik repozitorija.
            repo: Ime repozitorija.
            path: Putanja do fajla.
            ref: Referenca (grana, tag, commit).
            
        Returns:
            Dict sa sadržajem fajla.
        """
        params = {"ref": ref}
        result = self._get_request(f"repos/{owner}/{repo}/contents/{path}", params)
        
        if "error" in result:
            return result
        
        # Dekodiranje Base64 sadržaja
        if "content" in result and result.get("encoding") == "base64":
            try:
                content = base64.b64decode(result["content"].replace("\n", "")).decode("utf-8")
                result["decoded_content"] = content
            except Exception as e:
                logger.error(f"Greška pri dekodiranju sadržaja: {str(e)}")
                result["error_decoding"] = str(e)
                
        return result
    
    def get_repository_issues(self, owner: str, repo: str, state: str = "open", 
                             per_page: int = 10, page: int = 1) -> List[Dict[str, Any]]:
        """
        Dohvat issues za repozitorij.
        
        Args:
            owner: Vlasnik repozitorija.
            repo: Ime repozitorija.
            state: Status (open, closed, all).
            per_page: Broj rezultata po stranici.
            page: Broj stranice.
            
        Returns:
            Lista issues.
        """
        params = {
            "state": state,
            "per_page": per_page,
            "page": page
        }
        return self._get_request(f"repos/{owner}/{repo}/issues", params)
    
    def search_code(self, query: str, language: Optional[str] = None, 
                   repo: Optional[str] = None, per_page: int = 10, page: int = 1) -> Dict[str, Any]:
        """
        Pretraživanje koda na GitHub-u.
        
        Args:
            query: Upit za pretraživanje.
            language: Programski jezik za filter (npr. "python").
            repo: Repozitorij za pretraživanje (npr. "vlasnik/repo").
            per_page: Broj rezultata po stranici.
            page: Broj stranice.
            
        Returns:
            Dict s rezultatima pretrage.
        """
        # Kreiranje složenog upita
        search_query = query
        if language:
            search_query += f" language:{language}"
        if repo:
            search_query += f" repo:{repo}"
            
        params = {
            "q": search_query,
            "per_page": per_page,
            "page": page
        }
        return self._get_request("search/code", params)
    
    def get_repository_readme(self, owner: str, repo: str, ref: str = "main") -> Dict[str, Any]:
        """
        Dohvat README fajla repozitorija.
        
        Args:
            owner: Vlasnik repozitorija.
            repo: Ime repozitorija.
            ref: Referenca (grana, tag, commit).
            
        Returns:
            Dict sa sadržajem README fajla.
        """
        params = {"ref": ref}
        result = self._get_request(f"repos/{owner}/{repo}/readme", params)
        
        # Dekodiranje Base64 sadržaja
        if "content" in result and result.get("encoding") == "base64":
            try:
                content = base64.b64decode(result["content"].replace("\n", "")).decode("utf-8")
                result["decoded_content"] = content
            except Exception as e:
                logger.error(f"Greška pri dekodiranju README: {str(e)}")
                result["error_decoding"] = str(e)
                
        return result
    
    def get_repository_releases(self, owner: str, repo: str, 
                               per_page: int = 10, page: int = 1) -> List[Dict[str, Any]]:
        """
        Dohvat release-ova repozitorija.
        
        Args:
            owner: Vlasnik repozitorija.
            repo: Ime repozitorija.
            per_page: Broj rezultata po stranici.
            page: Broj stranice.
            
        Returns:
            Lista release-ova.
        """
        params = {
            "per_page": per_page,
            "page": page
        }
        return self._get_request(f"repos/{owner}/{repo}/releases", params)
    
    def get_user_info(self, username: str) -> Dict[str, Any]:
        """
        Dohvat informacija o korisniku.
        
        Args:
            username: GitHub korisničko ime.
            
        Returns:
            Dict s informacijama o korisniku.
        """
        return self._get_request(f"users/{username}")
    
    def get_user_repositories(self, username: str, sort: str = "updated", 
                             per_page: int = 10, page: int = 1) -> List[Dict[str, Any]]:
        """
        Dohvat repozitorija korisnika.
        
        Args:
            username: GitHub korisničko ime.
            sort: Sortiranje (created, updated, pushed, full_name).
            per_page: Broj rezultata po stranici.
            page: Broj stranice.
            
        Returns:
            Lista repozitorija.
        """
        params = {
            "sort": sort,
            "per_page": per_page,
            "page": page
        }
        return self._get_request(f"users/{username}/repos", params)
    
    def close(self) -> None:
        """
        Zatvaranje servera i oslobađanje resursa.
        """
        self.cache.clear()
        logger.info("GitHub MCP server zatvoren") 