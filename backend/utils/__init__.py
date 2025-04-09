# Inicijalizacijski fajl za utils paket 
# Eksportujemo važne module za lakši import

# Prvo importujemo osnovne module
from .session_store import save_to_session, get_session, session_memory
from .token_counter import (
    num_tokens_from_string, 
    count_message_tokens, 
    get_max_tokens,
    can_fit_in_context,
    truncate_text_to_fit
)

# Onda importujemo chunker koji koristi token_counter
from .chunker import chunk_text_by_structure, Chunk, merge_chunks

# Zatim memory_manager koji ne bi trebao biti cirkularno ovisan
from .memory_manager import memory_manager

# Na kraju importujemo context_compressor koji može koristiti memory_manager
from .context_compressor_agent import compress_context, create_compact_context, format_context_for_model

# Definiramo verziju modula
__version__ = "0.1.0" 