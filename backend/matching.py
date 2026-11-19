"""Matching agent: scores NGOs, splits the food, picks a volunteer and plans the route."""
import hashlib
import math
import time

from .data import AREAS, NGOS, VOLS, KG_PER_MEAL
from .shelf_life import with_life

ROAD_FACTOR = 1.35   # roads are ~35% longer than straight-line distance
CITY_SPEED = 20      # km/h in city traffic
LOAD_MIN = 10        # minutes to pack food at the donor
STOP_MIN = 6         # minutes per NGO drop
MAX_STOPS = 3


def haversine(a, b):
    r = 6371
    lat1, lng1 = map(math.radians, a)
    lat2, lng2 = map(math.radians, b)
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def drive_min(km):
    return km * ROAD_FACTOR / CITY_SPEED * 60


def plan_rescue(analysis: dict, form: dict) -> dict:
    donor = list(AREAS.get(form["area"], AREAS["Malviya Nagar"]))
    dishes = with_life(analysis["dishes"], form)
    usable = [d for d in dishes if d["life"]["status"] != "unsafe"]

    servings = lambda ds: sum(int(d.get("est_servings") or 0) for d in ds)
    all_serv = servings(dishes) or 1
    use_serv = servings(usable)
    meals = round((analysis.get("total_meals") or 0) * use_serv / all_serv)
    nv_serv = servings([d for d in usable if not d.get("veg", True)])
    nv_meals = round(meals * nv_serv / use_serv) if use_serv else 0
    veg_meals = meals - nv_meals
    deadline_h = min(d["life"]["remaining"] for d in usable) if usable else 0

    now = int(time.time() * 1000)
    rid = "AS-" + hashlib.sha1(f"{form.get('donor')}{now}".encode()).hexdigest()[:6].upper()
    weight = analysis.get("est_weight_kg") or meals * KG_PER_MEAL
    base = {
        "id": rid, "created": now, "form": form, "donor": donor, "dishes": dishes,
        "meals": meals, "vegMeals": veg_meals, "nvMeals": nv_meals, "deadlineH": deadline_h,
        "weightKg": round(weight * use_serv / all_serv), "status": "matched",
    }
    if not usable:
        return {**base, "blocked": "No dish is within its safe window. Do not donate this food for eating; send it to a compost or biogas partner instead."}
    if meals < 1:
        return {**base, "blocked": "The AI estimated less than one meal in this photo, which is too little to send a volunteer. Increase the meal count on the Donate tab if there is more food than the photo shows."}

    # 1. Volunteer: nearest one whose vehicle fits all the meals
    vols = sorted(({**v, "km": haversine((v["lat"], v["lng"]), donor)} for v in VOLS), key=lambda v: v["km"])
    vol = next((v for v in vols if v["cap"] >= meals), None) or max(vols, key=lambda v: v["cap"])
    to_donor_min = drive_min(vol["km"]) + 5

    # 2. Score every NGO
    raw = []
    for n in NGOS:
        km = haversine(donor, (n["lat"], n["lng"]))
        eta = to_donor_min + LOAD_MIN + drive_min(km)
        open_need = max(0, n["need"] - n["received"])
        diet_fit = veg_meals / meals if (nv_meals > 0 and n["vegOnly"]) else 1
        raw.append({**n, "km": km, "eta": eta, "open": open_need, "dietFit": diet_fit})
    max_km = max(r["km"] for r in raw)

    scored = []
    for r in raw:
        proximity = 1 - r["km"] / (max_km * 1.05)
        need_fit = min(1, r["open"] / meals)
        fits = r["eta"] / 60 <= deadline_h - 0.5
        score = (0.4 * proximity + 0.3 * need_fit + 0.15 * r["dietFit"] + 0.15 * r["priority"]) if fits else 0
        reason = "Too far to arrive inside the safe window" if not fits else ("Already has enough food tonight" if r["open"] <= 0 else "")
        scored.append({**r, "proximity": proximity, "needFit": need_fit, "fits": fits, "score": score, "reason": reason})
    scored.sort(key=lambda r: r["score"], reverse=True)

    # 3. Split the food across the best NGOs (non-veg only to NGOs that accept it)
    rem_veg, rem_nv = veg_meals, nv_meals
    alloc = []
    for n in scored:
        if len(alloc) >= MAX_STOPS or rem_veg + rem_nv <= 0:
            break
        if not n["fits"] or n["open"] <= 0 or n["score"] <= 0:
            continue
        room, a_nv = n["open"], 0
        if not n["vegOnly"]:
            a_nv = min(rem_nv, room)
            room -= a_nv
        a_veg = min(rem_veg, room)
        if a_nv + a_veg < min(10, meals):
            continue
        rem_nv -= a_nv
        rem_veg -= a_veg
        alloc.append({**n, "aVeg": a_veg, "aNv": a_nv, "total": a_veg + a_nv})

    if not alloc:
        return {**base, "vol": vol, "blocked": "No NGO can be reached inside the safe window. Refrigerate the food now and retry, or send it to a compost partner."}

    # 4. Route: volunteer -> donor -> nearest NGO next; drop stops that land too close to the deadline
    safe_until = now + deadline_h * 3600000

    def build_route(stops_in):
        stops, cur, left = [], donor, list(stops_in)
        while left:
            left.sort(key=lambda a: haversine(cur, (a["lat"], a["lng"])))
            nxt = left.pop(0)
            stops.append(nxt)
            cur = (nxt["lat"], nxt["lng"])
        t = now + to_donor_min * 60000
        legs = [{"label": f"{vol['name']} reaches {form['donor']}", "at": t}]
        t += LOAD_MIN * 60000
        legs.append({"label": "Food packed and picked up", "at": t})
        prev, km = donor, vol["km"]
        for s in stops:
            d = haversine(prev, (s["lat"], s["lng"]))
            km += d
            t += (drive_min(d) + STOP_MIN) * 60000
            s["arrive"] = t
            legs.append({"label": f"Delivered {s['total']} meals to {s['name']}", "at": t, "ngo": s["id"]})
            prev = (s["lat"], s["lng"])
        return stops, legs, km, t

    stops, legs, km, finish = build_route(alloc)
    while len(stops) > 1 and finish > safe_until - 20 * 60000:
        dropped = stops[-1]
        rem_veg += dropped["aVeg"]
        rem_nv += dropped["aNv"]
        stops, legs, km, finish = build_route(stops[:-1])

    return {**base, "vol": vol, "toDonorMin": to_donor_min, "alloc": stops, "ranked": scored, "legs": legs,
            "totalKm": km * ROAD_FACTOR, "finishAt": finish, "unallocated": rem_veg + rem_nv, "safeUntil": safe_until}
