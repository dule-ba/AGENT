import json
import os

# Učitaj konfiguraciju agenata iz JSON fajla
config_path = os.path.join(os.path.dirname(__file__), "agents_config.json")
with open(config_path, "r") as f:
    AGENT_CONFIGS = json.load(f)