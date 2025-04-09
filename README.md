# 🧠 AI Agent Platform

Višenamjenska AI platforma inspirisana Manus.im, sa modularnim agentima, vizualnim prikazom toka rada, i moćnim interaktivnim UI-jem.

---

## ✅ Funkcionalnosti

- **Modularni backend agenti**: `Executor`, `Code`, `Planner`, `Data`
- **OpenAI integracija**: koristi `gpt-4`, `temperature`, `max_tokens`, `system_prompt` konfiguraciju po agentu
- **Automatski chunking** velikih inputa
- **Vizualni prikaz toka rada agenata** pomoću `React Flow`
- **Radno okruženje** (terminal / code / web view) za prikaz rezultata
- **Session Explorer**: prikaz svih koraka agenata
- **Rerun + diff prikaz**: ponovi rad agenta, uređuj prompt i vidi razlike između odgovora

---

## 📁 Struktura projekta

```
.
├── backend/
│   ├── agents/
│   │   ├── executor_agent.py
│   │   ├── code_agent.py
│   │   ├── planner_agent.py
│   │   └── data_agent.py
│   ├── config/
│   │   └── agents_config.json
│   ├── utils/
│   │   ├── chunker.py
│   │   └── session_store.py
│   ├── schemas/
│   │   └── chat.py
│   └── .env
├── frontend/
│   └── src/
│       ├── App.jsx
│       ├── api.js
│       └── components/
│           ├── ChatBox.jsx
│           ├── Sidebar.jsx
│           ├── TaskFlow.jsx
│           ├── WorkEnvironment.jsx
│           └── SessionExplorer.jsx
└── requirements.txt
```

---

## 🚀 Pokretanje sistema

### 1. Backend (FastAPI)

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

- API endpoint: `POST /chat` prima `{"message": "...", "agent": "executor"}`

### 2. Frontend (React + Tailwind)

```bash
cd frontend
npm install
npm run dev
```

Otvorite [http://localhost:5173](http://localhost:5173)

---

## ⚙️ Konfiguracija agenata (`agents_config.json`)

```json
{
  "code": {
    "model": "gpt-4",
    "temperature": 0.5,
    "max_tokens": 1500,
    "system_prompt": "You are a coding assistant."
  },
  "planner": {
    "model": "gpt-4",
    "temperature": 0.7,
    "max_tokens": 1000,
    "system_prompt": "You are a planning assistant."
  },
  "data": {
    "model": "gpt-4",
    "temperature": 0.6,
    "max_tokens": 1200,
    "system_prompt": "You are a data assistant."
  }
}
```

---

## 🔁 Interaktivni tok rada

1. Unesi poruku u ChatBox
2. Executor delegira zadatak odgovarajućem agentu
3. Agent obradi i odgovori
4. TaskFlow prikazuje dijagram toka
5. Klikni na čvor → vidi odgovor + ponovi rad
6. Uredi prompt i uporedi razlike (diff)

---

## 📦 TODO / buduće opcije

- Upload CSV/PDF fajlova i vizualizacija
- RAG agent za rad sa dokumentima
- Višekorisnički sistem (login + tokeni)
- Export sesije u PDF/JSON
- Podrška za više različitih LLM pružalaca usluga (Claude, Mistral, Llama, itd.)
- Sistem za automatsko testiranje ponašanja agenata i validaciju rezultata
- Implementacija "pamćenja" agenata između sesija (kontinuitet razgovora)
- Metrike performansi agenata i vizualni dashboard za analitiku

---

## 🧠 Vizija

> “Ne pravimo samo chat — pravimo alat koji **radi s tobom**, razumije tok posla, pamti tvoje korake, i pomaže kao pravi digitalni inženjer.”

---

## 🧑‍💻 Autor: [Tvoj Projekat — Agent Sistem za Sve]

> Inspiriše te Manus? Onda je ovo tvoj prvi korak ka nečemu još moćnijem.