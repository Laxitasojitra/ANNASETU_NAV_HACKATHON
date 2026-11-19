"""AnnaSetu API server.

Run from the project folder:
    uvicorn backend.main:app --reload
Then open http://127.0.0.1:8000
"""
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

from fastapi import FastAPI, File, HTTPException, UploadFile  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from . import ai, db  # noqa: E402
from .data import AREAS, CATS, NGOS, SAMPLE_ANALYSIS  # noqa: E402
from .matching import plan_rescue  # noqa: E402
from .shelf_life import with_life  # noqa: E402

app = FastAPI(title="AnnaSetu API", version="1.0")
db.init_db()

MAX_IMAGE_BYTES = 8 * 1024 * 1024


class ShelfLifeIn(BaseModel):
    dishes: list[dict]
    form: dict


class PlanIn(BaseModel):
    analysis: dict
    form: dict


class MessagesIn(BaseModel):
    rescue: dict


class CompleteIn(BaseModel):
    id: str
    donor: str
    area: str
    meals: int
    kg: float
    ngos: list[str]


@app.get("/api/health")
def health():
    return {"ok": True, "ai": ai.ai_enabled(), "model": ai.model_name() if ai.ai_enabled() else None}


@app.get("/api/data")
def data():
    return {"areas": AREAS, "ngos": NGOS, "cats": CATS, "sample": SAMPLE_ANALYSIS}


@app.post("/api/analyze")
async def analyze(image: UploadFile = File(...)):
    content = await image.read()
    if not content:
        raise HTTPException(400, "The photo is empty.")
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "The photo is larger than 8 MB.")
    if image.content_type and not image.content_type.startswith("image/"):
        raise HTTPException(400, "Please upload an image file.")
    try:
        analysis, source = ai.analyze_image(content, image.content_type)
    except ai.AIError as e:
        raise HTTPException(502, str(e))
    return {"analysis": analysis, "source": source}


@app.post("/api/shelf-life")
def shelf_life(body: ShelfLifeIn):
    return {"dishes": with_life(body.dishes, body.form)}


@app.post("/api/plan")
def plan(body: PlanIn):
    if not body.analysis.get("dishes"):
        raise HTTPException(400, "Analyze a photo first.")
    rescue = plan_rescue(body.analysis, body.form)
    if not rescue.get("blocked"):
        rescue["msgs"] = ai.template_messages(rescue)  # instant; AI version comes from /api/messages
    return rescue


@app.post("/api/messages")
def messages(body: MessagesIn):
    return ai.agent_messages(body.rescue)


@app.post("/api/rescues/complete")
def complete(body: CompleteIn):
    return db.save_rescue(body.model_dump())


@app.get("/api/impact")
def impact():
    return db.impact()


# Serve the frontend (must be mounted last so /api routes win)
app.mount("/", StaticFiles(directory=ROOT / "frontend", html=True), name="frontend")
