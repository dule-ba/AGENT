import requests
import json
import logging
import os
from typing import Dict, List, Any, Optional, Union

# Postavljanje loggera
logger = logging.getLogger("huggingface_mcp")

class MCPServer:
    """
    MCP server za interakciju s HuggingFace API-jem.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Inicijalizacija HuggingFace MCP servera.
        
        Args:
            config: Konfiguracija servera.
        """
        self.api_base = "https://huggingface.co/api"
        self.inference_api_base = "https://api-inference.huggingface.co/models"
        self.token = config.get("api_key", os.environ.get("HUGGINGFACE_TOKEN", ""))
        
        self.headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        self.use_cache = config.get("use_cache", True)
        self.cache = {}
        logger.info("HuggingFace MCP server inicijaliziran")
    
    def _get_request(self, endpoint: str, params: Optional[Dict[str, Any]] = None, base_url: Optional[str] = None) -> Dict[str, Any]:
        """
        Izvršavanje GET zahtjeva prema HuggingFace API-ju.
        
        Args:
            endpoint: API endpoint za zahtjev.
            params: Parametri za zahtjev.
            base_url: Osnovna URL adresa za zahtjev.
            
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
            url = f"{base_url or self.api_base}/{endpoint.lstrip('/')}"
            response = requests.get(url, headers=self.headers, params=params)
            response.raise_for_status()
            
            # Pokušaj parsiranja kao JSON
            try:
                result = response.json()
            except json.JSONDecodeError:
                # Ako nije JSON, vrati sadržaj kao string
                result = {"content": response.text}
            
            # Spremi u cache ako je omogućen
            if self.use_cache:
                self.cache[cache_key] = result
                
            return result
        except requests.RequestException as e:
            logger.error(f"Greška pri HuggingFace API zahtjevu: {str(e)}")
            return {"error": str(e)}
    
    def _post_request(self, endpoint: str, data: Any, base_url: Optional[str] = None) -> Dict[str, Any]:
        """
        Izvršavanje POST zahtjeva prema HuggingFace API-ju.
        
        Args:
            endpoint: API endpoint za zahtjev.
            data: Podaci za zahtjev.
            base_url: Osnovna URL adresa za zahtjev.
            
        Returns:
            Dict s rezultatom zahtjeva.
        """
        try:
            url = f"{base_url or self.api_base}/{endpoint.lstrip('/')}"
            
            # Pripremi podatke ovisno o tipu
            if isinstance(data, dict):
                response = requests.post(url, json=data, headers=self.headers)
            elif isinstance(data, (str, bytes)):
                # Za binarne podatke kao što su slike
                if isinstance(data, str):
                    data = data.encode('utf-8')
                headers = self.headers.copy()
                headers["Content-Type"] = "application/octet-stream"
                response = requests.post(url, data=data, headers=headers)
            else:
                return {"error": f"Nepodržani tip podataka: {type(data)}"}
            
            response.raise_for_status()
            
            # Pokušaj parsiranja kao JSON
            try:
                return response.json()
            except json.JSONDecodeError:
                return {"content": response.text}
                
        except requests.RequestException as e:
            logger.error(f"Greška pri HuggingFace POST zahtjevu: {str(e)}")
            return {"error": str(e)}
    
    def search_models(self, query: str, filter: str = "all", sort: str = "downloads", direction: str = "desc", limit: int = 10) -> Dict[str, Any]:
        """
        Pretraživanje modela na HuggingFace-u.
        
        Args:
            query: Upit za pretraživanje.
            filter: Filter za tip modela.
            sort: Sortiranje (downloads, likes, date).
            direction: Redoslijed (asc, desc).
            limit: Broj rezultata.
            
        Returns:
            Dict s rezultatima pretrage.
        """
        params = {
            "search": query,
            "filter": filter,
            "sort": sort,
            "direction": direction,
            "limit": limit
        }
        return self._get_request("models", params)
    
    def get_model_info(self, model_id: str) -> Dict[str, Any]:
        """
        Dohvat informacija o modelu.
        
        Args:
            model_id: ID modela.
            
        Returns:
            Dict s informacijama o modelu.
        """
        return self._get_request(f"models/{model_id}")
    
    def search_datasets(self, query: str, limit: int = 10) -> Dict[str, Any]:
        """
        Pretraživanje skupova podataka na HuggingFace-u.
        
        Args:
            query: Upit za pretraživanje.
            limit: Broj rezultata.
            
        Returns:
            Dict s rezultatima pretrage.
        """
        params = {
            "search": query,
            "limit": limit
        }
        return self._get_request("datasets", params)
    
    def get_dataset_info(self, dataset_id: str) -> Dict[str, Any]:
        """
        Dohvat informacija o skupu podataka.
        
        Args:
            dataset_id: ID skupa podataka.
            
        Returns:
            Dict s informacijama o skupu podataka.
        """
        return self._get_request(f"datasets/{dataset_id}")
    
    def run_inference(self, model_id: str, inputs: Union[str, Dict[str, Any], bytes], 
                       task: Optional[str] = None, options: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Pokretanje zaključivanja (inference) na modelu.
        
        Args:
            model_id: ID modela.
            inputs: Ulazni podaci za model.
            task: Zadatak modela (ako je potrebno specificirati).
            options: Dodatne opcije za zaključivanje.
            
        Returns:
            Dict s rezultatom zaključivanja.
        """
        endpoint = model_id
        
        # Pripremanje podataka
        if isinstance(inputs, dict):
            payload = inputs
            if task:
                payload["task"] = task
            if options:
                payload.update(options)
        else:
            # Za tekstualne ili binarne inpute
            payload = inputs
        
        return self._post_request(endpoint, payload, self.inference_api_base)
    
    def text_generation(self, model_id: str, text: str, max_length: int = 100, 
                        temperature: float = 0.7, num_return_sequences: int = 1) -> Dict[str, Any]:
        """
        Generisanje teksta pomoću modela.
        
        Args:
            model_id: ID modela.
            text: Ulazni tekst.
            max_length: Maksimalna dužina izlaza.
            temperature: Temperatura za sampling.
            num_return_sequences: Broj sekvenci za generisanje.
            
        Returns:
            Dict s generisanim tekstom.
        """
        options = {
            "max_length": max_length,
            "temperature": temperature,
            "num_return_sequences": num_return_sequences,
            "return_full_text": False
        }
        return self.run_inference(model_id, text, "text-generation", options)
    
    def question_answering(self, model_id: str, question: str, context: str) -> Dict[str, Any]:
        """
        Odgovaranje na pitanje pomoću modela.
        
        Args:
            model_id: ID modela.
            question: Pitanje.
            context: Kontekst za pronalaženje odgovora.
            
        Returns:
            Dict s odgovorom.
        """
        payload = {
            "question": question,
            "context": context
        }
        return self.run_inference(model_id, payload, "question-answering")
    
    def image_classification(self, model_id: str, image_data: bytes) -> Dict[str, Any]:
        """
        Klasifikacija slike pomoću modela.
        
        Args:
            model_id: ID modela.
            image_data: Binarni podaci slike.
            
        Returns:
            Dict s rezultatima klasifikacije.
        """
        return self.run_inference(model_id, image_data, "image-classification")
    
    def text_to_image(self, model_id: str, prompt: str, negative_prompt: str = "", 
                     num_inference_steps: int = 50, guidance_scale: float = 7.5) -> Dict[str, Any]:
        """
        Generisanje slike iz teksta.
        
        Args:
            model_id: ID modela.
            prompt: Tekstualni opis slike.
            negative_prompt: Negativni opis (šta ne želimo da vidimo).
            num_inference_steps: Broj koraka zaključivanja.
            guidance_scale: Skala usmjeravanja.
            
        Returns:
            Dict s generisanom slikom.
        """
        payload = {
            "inputs": prompt,
            "negative_prompt": negative_prompt,
            "num_inference_steps": num_inference_steps,
            "guidance_scale": guidance_scale
        }
        return self.run_inference(model_id, payload, "text-to-image")
    
    def close(self) -> None:
        """
        Zatvaranje servera i oslobađanje resursa.
        """
        self.cache.clear()
        logger.info("HuggingFace MCP server zatvoren") 