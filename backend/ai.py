"""AI layer: Gemini vision for food photos and Gemini text for the agent's messages.

Without GEMINI_API_KEY the app still runs: photo analysis returns the sample
buffet and messages use templates, so the demo never breaks.
"""
import json
import os
import re
from datetime import datetime
from zoneinfo import ZoneInfo

from .data import CATS, KG_PER_MEAL, NGOS, SAMPLE_ANALYSIS

IST = ZoneInfo("Asia/Kolkata")
_client = None


class AIError(Exception):
    pass


def model_name() -> str:
    return os.getenv("GEMINI_MODEL", "gemini-flash-latest")


def ai_enabled() -> bool:
    return bool(os.getenv("GEMINI_API_KEY"))


def _get_client():
    global _client
    if _client is None:
        from google import genai
        _client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    return _client


def _parse_json(text: str) -> dict:
    match = re.search(r"\{[\s\S]*\}", text or "")
    if not match:
        raise AIError("The AI did not return JSON.")
    return json.loads(match.group(0))


def _ask_json(contents) -> dict:
    from google.genai import types
    try:
        resp = _get_client().models.generate_content(
            model=model_name(),
            contents=contents,
            config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0.2),
        )
    except Exception as e:  # network, quota, wrong model name...
        raise AIError(f"Gemini request failed: {e}") from e
    return _parse_json(resp.text)


def clock(ms: float) -> str:
    return datetime.fromtimestamp(ms / 1000, IST).strftime("%I:%M %p").lstrip("0").lower()


# ---------- vision ----------
VISION_PROMPT = f"""You are the vision model inside AnnaSetu, an Indian food-rescue app. Look at the photo of surplus cooked food (from a wedding, hostel mess, restaurant or event) and estimate what is there.
Return ONLY a JSON object with exactly these keys:
{{"is_food": boolean,
 "dishes": [{{"name": string (English dish name), "hindi_name": string (Devanagari), "category": one of {", ".join('"' + k + '"' for k in CATS)}, "veg": boolean, "est_servings": integer (single-dish portions visible), "confidence": number 0-1}}],
 "total_meals": integer (how many full plates this could feed, combining dishes sensibly),
 "est_weight_kg": number,
 "quality_flags": [up to 3 short strings about hygiene, covering, spoilage signs, or handling tips],
 "summary": string (one sentence)}}
Estimate conservatively from container sizes and fill levels. Egg, chicken, mutton or fish dishes are veg:false. If the image is not food, set is_food false and dishes []."""


def analyze_image(image_bytes: bytes, mime: str) -> tuple[dict, str]:
    """Returns (analysis, source) where source is 'ai' or 'sample'."""
    if not ai_enabled():
        return json.loads(json.dumps(SAMPLE_ANALYSIS)), "sample"
    from google.genai import types
    out = _ask_json([types.Part.from_bytes(data=image_bytes, mime_type=mime or "image/jpeg"), VISION_PROMPT])

    dishes = []
    for d in (out.get("dishes") or [])[:8]:
        dishes.append({
            "name": str(d.get("name") or "Dish"),
            "hindi_name": str(d.get("hindi_name") or ""),
            "category": d.get("category") if d.get("category") in CATS else "dal_curry",
            "veg": d.get("veg") is not False,
            "est_servings": max(1, round(float(d.get("est_servings") or 10))),
            "confidence": min(1.0, max(0.0, float(d.get("confidence") or 0.6))),
        })
    total = out.get("total_meals") or sum(d["est_servings"] for d in dishes) / 2
    analysis = {
        "is_food": bool(out.get("is_food")) and bool(dishes),
        "dishes": dishes,
        "total_meals": max(1, round(float(total))) if dishes else 0,
        "est_weight_kg": float(out.get("est_weight_kg") or 0) or round(float(total) * KG_PER_MEAL, 1),
        "quality_flags": [str(q) for q in (out.get("quality_flags") or [])][:3],
        "summary": str(out.get("summary") or ""),
    }
    return analysis, "ai"


# ---------- agent messages ----------
def template_messages(r: dict) -> dict:
    ok = [d for d in r["dishes"] if d["life"]["status"] != "unsafe"]
    dishes = ", ".join(d["name"] for d in ok)
    dishes_hi = ", ".join(d.get("hindi_name") or d["name"] for d in ok)
    until = clock(r["safeUntil"])
    f, vol = r["form"], r["vol"]
    veg_word = "" if r["nvMeals"] > 0 else "vegetarian "
    n = len(r["alloc"])
    return {
        "src": "template",
        "rationale": (f"{n} NGO{'s' if n > 1 else ''} chosen from {len(NGOS)} by distance, unmet need tonight, diet rules and who they serve. "
                      f"{vol['name']} ({vol['vehicle']}) is the nearest volunteer with room for {r['meals']} meals, and every drop lands before the food's safe-until time of {until}."),
        "ngo": [{
            "id": a["id"],
            "en": f"AnnaSetu alert: {a['total']} fresh {veg_word}meals ({dishes}) from {f['donor']}, {f['area']}. Safe to serve until {until}. Volunteer {vol['name']} arrives about {clock(a['arrive'])}. Reply YES to confirm.",
            "hi": f"AnnaSetu सूचना: {f['donor']}, {f['area']} से {a['total']} ताज़ा भोजन ({dishes_hi})। {until} तक परोसना सुरक्षित है। स्वयंसेवक {vol['name']} लगभग {clock(a['arrive'])} तक पहुँचेंगे। पुष्टि के लिए YES भेजें।",
        } for a in r["alloc"]],
        "volunteer": {
            "en": f"Pickup: {r['meals']} meals at {f['donor']}, {f['area']}. Then {' → '.join(a['name'] for a in r['alloc'])}. Finish by {clock(r['finishAt'])}.",
            "hi": f"पिकअप: {f['donor']}, {f['area']} से {r['meals']} भोजन। फिर {' → '.join(a['name'] for a in r['alloc'])}। {clock(r['finishAt'])} तक पूरा करें।",
        },
    }


def agent_messages(r: dict) -> dict:
    fallback = template_messages(r)
    if not ai_enabled():
        return fallback
    chosen_ids = {a["id"] for a in r["alloc"]}
    brief = {
        "donor": r["form"]["donor"], "area": r["form"]["area"], "source": r["form"].get("type"),
        "meals": r["meals"], "veg_meals": r["vegMeals"], "nonveg_meals": r["nvMeals"],
        "dishes": [{"name": d["name"], "hindi": d.get("hindi_name"), "veg": d.get("veg"), "status": d["life"]["status"],
                    "safe_hours_left": round(d["life"]["remaining"], 1)} for d in r["dishes"]],
        "safe_until": clock(r["safeUntil"]),
        "volunteer": {"name": r["vol"]["name"], "vehicle": r["vol"]["vehicle"], "eta_to_donor_min": round(r["toDonorMin"])},
        "chosen": [{"id": a["id"], "name": a["name"], "serves": a["serves"], "km": round(a["km"], 1), "open_need": a["open"],
                    "veg_only": a["vegOnly"], "meals_given": a["total"], "arrives": clock(a["arrive"])} for a in r["alloc"]],
        "not_chosen": [{"name": n["name"], "why": n["reason"] or "lower score: farther or less need", "km": round(n["km"], 1)}
                       for n in r["ranked"] if n["id"] not in chosen_ids][:4],
        "unallocated_meals": r["unallocated"],
    }
    prompt = f"""You are the dispatch agent of AnnaSetu, a food-rescue service in Jaipur. The routing engine produced this plan (JSON):
{json.dumps(brief, ensure_ascii=False)}
Write the human-facing parts. Return ONLY JSON:
{{"rationale": string (2-3 plain sentences explaining why these NGOs and this volunteer were chosen and how the safe-until time is respected; mention one NGO that was not chosen and why),
 "ngo": [{{"id": string (same ids as chosen), "en": string (WhatsApp message to that NGO, under 45 words, include meal count, dishes, safe-until time, volunteer name and arrival, ask to reply YES), "hi": string (the same message in natural Hindi, Devanagari)}}],
 "volunteer": {{"en": string (pickup brief under 35 words), "hi": string (same in Hindi)}}}}"""
    try:
        out = _ask_json(prompt)
    except Exception:
        return fallback
    ngo = []
    for fb in fallback["ngo"]:
        m = next((x for x in out.get("ngo") or [] if x.get("id") == fb["id"]), {})
        ngo.append({"id": fb["id"], "en": str(m.get("en") or fb["en"]), "hi": str(m.get("hi") or fb["hi"])})
    vol = out.get("volunteer") or {}
    return {
        "src": "ai",
        "rationale": str(out.get("rationale") or fallback["rationale"]),
        "ngo": ngo,
        "volunteer": {"en": str(vol.get("en") or fallback["volunteer"]["en"]), "hi": str(vol.get("hi") or fallback["volunteer"]["hi"])},
    }
