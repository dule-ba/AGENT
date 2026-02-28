# 🧠 AI Agent Platform

Višenamjenska AI platforma inspirisana Manus.im, sa modularnim agentima, vizualnim prikazom toka rada i autonomnim sandbox izvršavanjem (kod + shell komande).

---

## ✅ Funkcionalnosti

- **Modularni backend agenti**: `Executor`, `Code`, `Planner`, `Data`, `Debugger`
- **Autonomni režim**: orkestracija `Executor -> Planner -> specijalizovani agenti -> Executor sažetak`
- **Sandbox izvršavanje koda** (Python/JavaScript) sa timeout i resource limitima
- **Sandbox shell komande** (`bash`) u izolovanom workspace-u
- **Persistent sandbox workspace** za višekoračne zadatke (build/test/fix ciklus)
- **OpenAI + Anthropic MCP podrška**
- **Vizualni prikaz toka rada agenata** pomoću `React Flow`
- **Radno okruženje** (terminal / code / web view) za prikaz rezultata
- **Session Explorer**: prikaz svih koraka agenata
- **Rerun + diff prikaz**: ponovi rad agenta, uređuj prompt i vidi razlike između odgovora

---

## 📁 Struktura projekta

```text
.
├── backend/
│   ├── agents/
│   ├── config/
│   ├── endpoints/
│   ├── schemas/
│   ├── utils/
│   └── main.py
├── frontend/
│   └── src/
│       ├── App.jsx
│       ├── api.js
│       └── components/
│           ├── ChatBox.jsx
│           ├── TaskFlow.jsx
│           ├── WorkEnvironment.jsx
│           └── SessionExplorer.jsx
└── README.md
```

---

## 🚀 Pokretanje sistema

### 1. Backend (FastAPI)

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8080
```

### 2. Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

Otvori: [http://localhost:5173](http://localhost:5173)

---

## 🔌 Glavni API endpointi

### Chat i workflow

- `POST /chat`
  - primjer body:

```json
{
  "message": "Napravi TODO app i pokreni testove",
  "agent": "executor",
  "auto_process": false,
  "model": "default",
  "temperature": 0.7,
  "mcp_server": "anthropic"
}
```

### Izvršavanje koda (sandbox)

- `POST /execute-code`
  - podržava `python`, `javascript`, `html`
  - opcije: `sandbox`, `timeout_seconds`, `auto_debug`

```json
{
  "code": "print('hello')",
  "language": "python",
  "mode": "script",
  "sandbox": true,
  "timeout_seconds": 8,
  "auto_debug": true
}
```

### Izvršavanje shell komandi u sandboxu

- `POST /execute-command-sandbox`
  - izvršava komandu preko `bash -lc` u izolovanom direktoriju
  - podržava:
    - `files` (pre-populate fajlova)
    - `persist_workspace` + `workspace_id` (nastavak rada kroz više komandi)

```json
{
  "command": "npm test",
  "timeout_seconds": 20,
  "sandbox": true,
  "persist_workspace": true,
  "workspace_id": null,
  "files": {
    "package.json": "{\"name\":\"demo\",\"scripts\":{\"test\":\"echo ok\"}}"
  }
}
```

- `DELETE /sandbox-workspace/{workspace_id}`
  - ručno čišćenje persistent workspace-a

---

## 🤖 Autonomni režim (frontend)

U `ChatBox` postoji toggle **Autonomni režim**:

1. korisnik pošalje cilj
2. `Executor` interpretira zadatak
3. `Planner` generiše korake
4. `Code/Data` agenti rješavaju korake
5. ako odgovor sadrži fenced shell blok (```bash ... ```), komanda se izvršava u sandboxu
6. `Executor` vrati završni sažetak

Napomena: autonomni workflow automatski clean-up-a workspace na kraju toka.

---

## 🔒 Sigurnosne napomene

- Sandbox ovdje je **lightweight process isolation** (timeout + rlimits + temp workspace), nije full VM-level izolacija.
- Za produkciju preporučeno:
  - odvojeni worker/container runtime
  - network egress restrikcije
  - seccomp/apparmor profile
  - per-user quota i audit log

---

## 📦 Roadmap

- Session-bound persistent workspace kroz cijelu korisničku sesiju
- Snapshot/restore sandbox stanja
- Vizualni prikaz shell koraka i izlaza u TaskFlow
- Sigurnosna politika po tenant-u (RBAC + resource budget)

---

## 🧠 Vizija

> “Ne pravimo samo chat — pravimo alat koji radi s tobom, izvršava korake autonomno i pouzdano u izolovanom okruženju.”
