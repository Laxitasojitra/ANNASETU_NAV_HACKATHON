"""Conservative shelf-life model for cooked food.

Each dish category has a safe holding time. Storage changes it:
  - kept hot above 60°C: at least 6 h
  - refrigerated below 5°C: 24 h (salad 12 h)
  - room temperature: the category's base time, shorter above 30°C or in high humidity
A 20% safety margin is applied, then the time since cooking is subtracted.
"""
from .data import CATS

SAFETY_MARGIN = 0.8
OK_HOURS = 1.5       # at least this much left -> "ok"
URGENT_HOURS = 0.75  # between this and OK_HOURS -> "urgent", below -> "unsafe"


def shelf_life(category: str, form: dict) -> dict:
    cat = CATS.get(category, CATS["dal_curry"])
    storage = form.get("storage", "room")
    temp = float(form.get("temp", 25))
    humidity = float(form.get("humidity", 45))
    cooked_ago = float(form.get("cookedAgo", 0))

    if storage == "hot":
        window = max(cat["room"], 6)
    elif storage == "fridge":
        window = 12 if category == "salad_raw" else 24
    else:
        k = 1.0
        if temp > 30:
            k = max(0.5, 1 - 0.04 * (temp - 30))
        elif temp < 20:
            k = 1.25
        if humidity > 70:
            k *= 0.9
        window = cat["room"] * k

    safe_window = window * SAFETY_MARGIN
    remaining = safe_window - cooked_ago
    if remaining >= OK_HOURS:
        status = "ok"
    elif remaining >= URGENT_HOURS:
        status = "urgent"
    else:
        status = "unsafe"
    return {"window": window, "safeWindow": safe_window, "remaining": remaining, "status": status}


def with_life(dishes: list, form: dict) -> list:
    return [{**d, "life": shelf_life(d.get("category", "dal_curry"), form)} for d in dishes]
