from typing import List, Dict, Any, Optional
import re
from .token_counter import num_tokens_from_string

class Chunk:
    """Klasa koja predstavlja chunk teksta."""
    
    def __init__(self, text: str, metadata: Optional[Dict[str, Any]] = None, chunk_id: Optional[str] = None):
        self.text = text
        self.metadata = metadata or {}
        self.chunk_id = chunk_id or f"chunk_{id(self)}"
        self.token_count = None
    
    def get_token_count(self, model: str = "gpt-4o") -> int:
        """Vraća broj tokena u chunka, s cachiranjem."""
        if self.token_count is None:
            self.token_count = num_tokens_from_string(self.text, model)
        return self.token_count
    
    def __str__(self) -> str:
        return f"Chunk({self.chunk_id}, {len(self.text)} chars, metadata: {self.metadata})"
    
    def to_dict(self) -> Dict[str, Any]:
        """Konvertira chunk u riječnik."""
        return {
            "chunk_id": self.chunk_id,
            "text": self.text,
            "metadata": self.metadata,
            "token_count": self.token_count
        }

def chunk_text_by_structure(text: str, max_tokens_per_chunk: int = 1500, model: str = "gpt-4o") -> List[Chunk]:
    """
    Dijeli tekst na smislene chunkove bazirano na strukturi.
    
    Args:
        text: Tekst za podjelu
        max_tokens_per_chunk: Maksimalni broj tokena po chunku
        model: Model za brojanje tokena
        
    Returns:
        Lista Chunk objekata
    """
    # Ako je tekst manji od maksimalnog broja tokena, vraćamo ga kao jedan chunk
    if num_tokens_from_string(text, model) <= max_tokens_per_chunk:
        return [Chunk(text)]
    
    # Inače, dijelimo tekst na logičke sekcije
    chunks = []
    
    # 1. Prvo pokušavamo podijeliti po većim strukturama (naslovi, paragrafi)
    sections = split_by_headers(text)
    
    for i, section in enumerate(sections):
        # Ako je sekcija manja od maksimalnog broja tokena, dodajemo je kao chunk
        if num_tokens_from_string(section, model) <= max_tokens_per_chunk:
            chunks.append(Chunk(
                text=section,
                metadata={"section_index": i, "type": "section"}
            ))
        else:
            # Ako je sekcija prevelika, dalje je dijelimo na paragrafe
            paragraphs = split_by_paragraphs(section)
            
            # Iteriramo kroz paragrafe i grupiramo ih da stanu u maksimalni broj tokena
            current_chunk_text = ""
            current_chunk_paragraphs = []
            
            for j, paragraph in enumerate(paragraphs):
                # Ako trenutni chunk + novi paragraf ne prelazi limit, dodajemo paragraf
                potential_chunk = current_chunk_text + paragraph + "\n\n"
                if num_tokens_from_string(potential_chunk, model) <= max_tokens_per_chunk:
                    current_chunk_text = potential_chunk
                    current_chunk_paragraphs.append(paragraph)
                else:
                    # Ako bi prelazio limit, prvo spremamo trenutni chunk
                    if current_chunk_text:
                        chunks.append(Chunk(
                            text=current_chunk_text.strip(),
                            metadata={"section_index": i, "paragraph_indices": list(range(j-len(current_chunk_paragraphs), j)), "type": "paragraphs"}
                        ))
                    
                    # Ako je sam paragraf prevelik, moramo ga dalje dijeliti na rečenice
                    if num_tokens_from_string(paragraph, model) > max_tokens_per_chunk:
                        sentence_chunks = chunk_by_sentences(paragraph, max_tokens_per_chunk, model)
                        for sc in sentence_chunks:
                            sc.metadata.update({
                                "section_index": i,
                                "paragraph_index": j,
                                "type": "sentences"
                            })
                            chunks.append(sc)
                        
                        # Resetiramo trenutni chunk
                        current_chunk_text = ""
                        current_chunk_paragraphs = []
                    else:
                        # Inače, započinjemo novi chunk s ovim paragrafom
                        current_chunk_text = paragraph + "\n\n"
                        current_chunk_paragraphs = [paragraph]
            
            # Dodajemo zadnji chunk ako postoji
            if current_chunk_text:
                chunks.append(Chunk(
                    text=current_chunk_text.strip(),
                    metadata={
                        "section_index": i,
                        "paragraph_indices": list(range(len(paragraphs)-len(current_chunk_paragraphs), len(paragraphs))),
                        "type": "paragraphs"
                    }
                ))
    
    # Dodjeljujemo konačne ID-ove
    for i, chunk in enumerate(chunks):
        chunk.chunk_id = f"chunk_{i+1}"
    
    return chunks

def split_by_headers(text: str) -> List[str]:
    """Dijeli tekst po naslovima (# za Markdown, <h1>-<h6> za HTML)."""
    # Markdown naslovi
    header_pattern = r'(?:^|\n)(#{1,6} .+)(?:\n|$)'
    
    # Pokušavamo pronaći naslove
    matches = list(re.finditer(header_pattern, text))
    
    if not matches:
        # Ako nema naslova, vraćamo cijeli tekst kao jednu sekciju
        return [text]
    
    sections = []
    start_pos = 0
    
    for match in matches:
        # Ako postoji tekst prije prvog naslova, dodajemo ga kao uvod
        if match.start() > start_pos and start_pos == 0:
            sections.append(text[start_pos:match.start()])
        
        # Tražimo kraj sekcije (početak sljedećeg naslova ili kraj teksta)
        header_end = match.end()
        next_header_start = None
        
        # Tražimo sljedeći naslov
        for m in matches:
            if m.start() > header_end:
                next_header_start = m.start()
                break
        
        # Ako nema sljedećeg naslova, sekcija ide do kraja teksta
        if next_header_start is None:
            next_header_start = len(text)
        
        # Dodajemo sekciju s naslovom
        section = text[match.start():next_header_start]
        sections.append(section)
        
        # Ažuriramo početnu poziciju za sljedeću iteraciju
        start_pos = next_header_start
    
    # Vraćamo samo neprazne sekcije
    return [s.strip() for s in sections if s.strip()]

def split_by_paragraphs(text: str) -> List[str]:
    """Dijeli tekst na paragrafe temeljene na praznim redovima."""
    # Dijelimo po dvostrukom novom redu (prazan red)
    paragraphs = re.split(r'\n\s*\n', text)
    
    # Filtriramo prazne paragrafe
    return [p.strip() for p in paragraphs if p.strip()]

def chunk_by_sentences(text: str, max_tokens: int, model: str) -> List[Chunk]:
    """Dijeli tekst na chunkove po rečenicama."""
    # Jednostavni regex za rečenice (završavaju s ., !, ili ?)
    sentence_pattern = r'[^.!?]*[.!?]'
    sentences = re.findall(sentence_pattern, text)
    
    chunks = []
    current_chunk_text = ""
    current_chunk_sentences = []
    
    for i, sentence in enumerate(sentences):
        # Ako je sama rečenica prevelika, moramo je skratiti
        if num_tokens_from_string(sentence, model) > max_tokens:
            if current_chunk_text:
                chunks.append(Chunk(
                    text=current_chunk_text.strip(),
                    metadata={"type": "sentences", "sentence_indices": list(range(i-len(current_chunk_sentences), i))}
                ))
            
            # Dijelimo rečenicu na manje dijelove
            words = sentence.split()
            current_part = ""
            
            for word in words:
                if num_tokens_from_string(current_part + " " + word, model) <= max_tokens:
                    current_part += " " + word if current_part else word
                else:
                    if current_part:
                        chunks.append(Chunk(
                            text=current_part.strip(),
                            metadata={"type": "sentence_part", "sentence_index": i}
                        ))
                    current_part = word
            
            if current_part:
                chunks.append(Chunk(
                    text=current_part.strip(),
                    metadata={"type": "sentence_part", "sentence_index": i}
                ))
            
            current_chunk_text = ""
            current_chunk_sentences = []
        else:
            # Ako trenutni chunk + nova rečenica ne prelazi limit
            potential_chunk = current_chunk_text + " " + sentence if current_chunk_text else sentence
            if num_tokens_from_string(potential_chunk, model) <= max_tokens:
                current_chunk_text = potential_chunk
                current_chunk_sentences.append(sentence)
            else:
                # Ako bi prelazio limit, spremamo trenutni chunk i započinjemo novi
                if current_chunk_text:
                    chunks.append(Chunk(
                        text=current_chunk_text.strip(),
                        metadata={"type": "sentences", "sentence_indices": list(range(i-len(current_chunk_sentences), i))}
                    ))
                current_chunk_text = sentence
                current_chunk_sentences = [sentence]
    
    # Dodajemo zadnji chunk ako postoji
    if current_chunk_text:
        chunks.append(Chunk(
            text=current_chunk_text.strip(),
            metadata={"type": "sentences", "sentence_indices": list(range(len(sentences)-len(current_chunk_sentences), len(sentences)))}
        ))
    
    return chunks

def merge_chunks(chunks: List[Chunk], max_tokens: int, model: str) -> List[Chunk]:
    """
    Pokušava spojiti susjedne chunkove ako zajedno ne prelaze maksimalni broj tokena.
    
    Args:
        chunks: Lista Chunk objekata za spajanje
        max_tokens: Maksimalni broj tokena po chunku
        model: Model za brojanje tokena
        
    Returns:
        Nova lista spojenih Chunk objekata
    """
    if not chunks:
        return []
    
    merged_chunks = []
    current_chunk = chunks[0]
    
    for next_chunk in chunks[1:]:
        # Provjeravamo možemo li spojiti trenutni i sljedeći chunk
        combined_text = current_chunk.text + "\n\n" + next_chunk.text
        if num_tokens_from_string(combined_text, model) <= max_tokens:
            # Možemo ih spojiti
            combined_metadata = {**current_chunk.metadata}
            # Ažuriramo metapodatke za spojeni chunk
            if "type" in current_chunk.metadata and "type" in next_chunk.metadata:
                if current_chunk.metadata["type"] == next_chunk.metadata["type"]:
                    combined_metadata["type"] = current_chunk.metadata["type"]
                else:
                    combined_metadata["type"] = "mixed"
            
            current_chunk = Chunk(
                text=combined_text,
                metadata=combined_metadata,
                chunk_id=current_chunk.chunk_id
            )
        else:
            # Ne možemo ih spojiti, dodajemo trenutni chunk i prelazimo na sljedeći
            merged_chunks.append(current_chunk)
            current_chunk = next_chunk
    
    # Dodajemo zadnji chunk
    merged_chunks.append(current_chunk)
    
    # Dodjeljujemo nove ID-ove
    for i, chunk in enumerate(merged_chunks):
        chunk.chunk_id = f"merged_chunk_{i+1}"
    
    return merged_chunks