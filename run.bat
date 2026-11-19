@echo off
cd /d "%~dp0"
if not exist .venv (
  echo Creating virtual environment...
  python -m venv .venv || (echo Python not found. Install Python 3.10+ and tick "Add to PATH". & pause & exit /b 1)
)
call .venv\Scripts\activate
echo Installing packages (first run takes a minute)...
pip install -q -r requirements.txt
if not exist .env copy .env.example .env >nul
echo.
echo AnnaSetu is starting. Open http://127.0.0.1:8000 in your browser.
echo Press Ctrl+C to stop.
start "" http://127.0.0.1:8000
uvicorn backend.main:app --reload
pause
