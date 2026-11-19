# AnnaSetu: AI food rescue

Snap a photo of surplus food → AI identifies the dishes and meals → the shelf-life model checks safety → the matching agent picks NGOs and a volunteer → live pickup tracking → a CSR/ESG impact certificate.

## Tech stack
| Layer | Tech |
|---|---|
| Frontend | HTML, CSS, vanilla JavaScript (`frontend/`) |
| Backend | Python, FastAPI, Uvicorn (`backend/`) |
| Vision + language AI | Google Gemini via the `google-genai` SDK |
| Shelf-life model | Rule-based safety model (`backend/shelf_life.py`) |
| Matching agent | Weighted scoring, food splitting and route planning (`backend/matching.py`) |
| Database | SQLite (created automatically) |

## Folder structure
```
AnnaSetu/
├── backend/
│   ├── main.py         API routes + serves the frontend
│   ├── ai.py           Gemini vision + agent messages (falls back to templates)
│   ├── matching.py     NGO scoring, allocation, volunteer, route
│   ├── shelf_life.py   food-safety window per dish
│   ├── data.py         sample Jaipur NGOs, volunteers, areas
│   └── db.py           SQLite: completed rescues + impact stats
├── frontend/
│   ├── index.html      layout and styles
│   └── app.js          UI logic, calls /api/*
├── requirements.txt
├── .env.example
├── run.bat             one-click start (Windows)
└── run.sh              one-click start (Mac/Linux)
```

## Step-by-step setup

### 1. Install Python
Install **Python 3.10 or newer** from https://www.python.org/downloads/
On Windows, tick **"Add Python to PATH"** in the installer.
Check it: `python --version` (Windows) or `python3 --version` (Mac/Linux).

### 2. Get a free Gemini API key
1. Go to https://aistudio.google.com/apikey and sign in with Google.
2. Click **Create API key** and copy it.

You can skip this step: without a key, the app runs in sample mode and every screen still works, but photos are not really analyzed.

### 3. Add the key
Open the `.env` file in the project folder and paste your key:
```
GEMINI_API_KEY=paste-your-key-here
GEMINI_MODEL=gemini-flash-latest
```
Never share this file or push it to GitHub (`.gitignore` already excludes it).

### 4. Install and run

**Easiest:** double-click `run.bat` (Windows) or run `bash run.sh` (Mac/Linux).

**Or manually**, in a terminal inside the `AnnaSetu` folder:

Windows (PowerShell or CMD):
```
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn backend.main:app --reload
```
Mac / Linux:
```
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

### 5. Open the app
Go to **http://127.0.0.1:8000** in Chrome.
The badge at the top right says **"AI on"** when your key works.
API docs (useful to show judges): **http://127.0.0.1:8000/docs**




## API endpoints
| Method | Path | What it does |
|---|---|---|
| GET | `/api/health` | Whether AI is on, and which model |
| GET | `/api/data` | Areas, NGOs, categories, sample analysis |
| POST | `/api/analyze` | Upload a photo (`image` field) → dishes, meals, flags |
| POST | `/api/shelf-life` | Dishes + pickup details → safe time left per dish |
| POST | `/api/plan` | Analysis + pickup details → full rescue plan |
| POST | `/api/messages` | Rescue plan → AI explanation and WhatsApp texts (Hindi/English) |
| POST | `/api/rescues/complete` | Saves a delivered rescue, returns its audit ID |
| GET | `/api/impact` | Dashboard numbers, forecast, leaderboard, latest certificate |

## What to build next 
- Real NGO and volunteer sign-up, stored in PostgreSQL with PostGIS
- WhatsApp Business API (e.g. via Twilio) to send the alerts for real
- Google Maps for real roads and live GPS tracking
- Fine-tune YOLOv8 on Indian food photos for faster on-device detection
- IoT temperature sensors in pickup boxes

> Note: NGOs, volunteers and the history before your first rescue are sample data for Jaipur. Shelf-life estimates are conservative guidance for the demo, not a food-safety certification.
