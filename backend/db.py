"""SQLite storage for completed rescues and the impact dashboard."""
import hashlib
import json
import random
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

from .data import CO2_PER_KG, KG_PER_MEAL, RUPEES_PER_MEAL, SEED_DONORS
from .ai import IST

DB_PATH = Path(__file__).resolve().parent / "annasetu.db"


def _conn():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def init_db():
    with _conn() as con:
        con.execute("""CREATE TABLE IF NOT EXISTS rescues (
            id TEXT PRIMARY KEY, at INTEGER, donor TEXT, area TEXT,
            meals INTEGER, kg REAL, ngos TEXT, audit TEXT)""")


def save_rescue(rec: dict) -> dict:
    now = int(datetime.now(IST).timestamp() * 1000)
    row = {"id": rec["id"], "at": now, "donor": rec["donor"], "area": rec["area"],
           "meals": int(rec["meals"]), "kg": float(rec["kg"]), "ngos": rec["ngos"]}
    row["audit"] = f"{row['id']}-{hashlib.sha256(json.dumps(row, sort_keys=True).encode()).hexdigest()[:8].upper()}"
    with _conn() as con:
        con.execute("INSERT OR REPLACE INTO rescues VALUES (?,?,?,?,?,?,?,?)",
                    (row["id"], row["at"], row["donor"], row["area"], row["meals"], row["kg"], json.dumps(row["ngos"]), row["audit"]))
    return row


def _rows():
    with _conn() as con:
        rows = con.execute("SELECT * FROM rescues ORDER BY at DESC").fetchall()
    return [{**dict(r), "ngos": json.loads(r["ngos"])} for r in rows]


def impact() -> dict:
    rows = _rows()
    today = datetime.now(IST).replace(hour=0, minute=0, second=0, microsecond=0)
    rnd = random.Random(7)  # deterministic sample history

    daily = []
    for i in range(13, -1, -1):
        d = today - timedelta(days=i)
        weekend = 1.35 if d.weekday() >= 5 else 1
        daily.append({"date": d, "meals": round((260 + rnd.random() * 180) * weekend)})
    for r in rows:
        day = datetime.fromtimestamp(r["at"] / 1000, IST).date()
        for d in daily:
            if d["date"].date() == day:
                d["meals"] += r["meals"]

    meals = sum(d["meals"] for d in daily)
    kg = meals * KG_PER_MEAL

    # Forecast: last-week average, +35% on weekends, +25% in Nov-Dec wedding season
    last7 = daily[-7:]
    weekend_days = sum(1 for d in last7 if d["date"].weekday() >= 5)
    base = sum(d["meals"] for d in last7) / 7 / ((weekend_days * 0.35 + 7) / 7)
    forecast = []
    for i in range(1, 8):
        d = today + timedelta(days=i)
        v = base * (1.35 if d.weekday() >= 5 else 1) * (1.25 if d.month in (11, 12) else 1)
        forecast.append({"l": d.strftime("%a"), "v": round(v)})

    board = {n: m for n, m in SEED_DONORS}
    for r in rows:
        board[r["donor"]] = board.get(r["donor"], 0) + r["meals"]

    return {
        "totals": {"meals": meals, "kg": kg, "co2": kg * CO2_PER_KG, "value": meals * RUPEES_PER_MEAL, "mine": len(rows)},
        "daily": [{"l": f"{d['date'].day} {d['date'].strftime('%b')}", "v": d["meals"]} for d in daily],
        "forecast": forecast,
        "board": sorted(({"n": n, "m": m} for n, m in board.items()), key=lambda x: -x["m"])[:6],
        "last": ({**rows[0], "co2": round(rows[0]["kg"] * CO2_PER_KG)} if rows else None),
    }
