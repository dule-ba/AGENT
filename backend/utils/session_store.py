session_memory = {}

def save_to_session(session_id, agent, message, response):
    if session_id not in session_memory:
        session_memory[session_id] = []
    session_memory[session_id].append({"agent": agent, "message": message, "response": response})

def get_session(session_id):
    return session_memory.get(session_id, [])