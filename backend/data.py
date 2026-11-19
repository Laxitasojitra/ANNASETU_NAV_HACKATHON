"""Sample data for the Jaipur pilot: areas, NGOs, volunteers and dish categories.

Replace NGOS and VOLS with real partner data (or load them from a database)
when you move beyond the demo.
"""

# Pickup areas: name -> (latitude, longitude)
AREAS = {
    "Malviya Nagar": (26.8549, 75.8243),
    "Mansarovar": (26.8505, 75.7628),
    "Vaishali Nagar": (26.9116, 75.7430),
    "C-Scheme": (26.9124, 75.8016),
    "Raja Park": (26.8986, 75.8270),
    "Jhotwara": (26.9530, 75.7400),
    "Sitapura": (26.7790, 75.8460),
    "Sanganer": (26.8200, 75.7900),
    "Bani Park": (26.9300, 75.7950),
    "Jagatpura": (26.8250, 75.8650),
    "Tonk Road": (26.8700, 75.8000),
    "Johari Bazaar": (26.9196, 75.8270),
}

# need = meals wanted tonight, received = meals already received tonight
# priority: 1.0 for children / elderly / women's shelters, lower for general kitchens
NGOS = [
    {"id": "n1", "name": "Roti Ghar Community Kitchen", "area": "Jhotwara", "lat": 26.9480, "lng": 75.7480, "need": 220, "received": 40, "vegOnly": False, "priority": 0.7, "serves": "Daily-wage workers"},
    {"id": "n2", "name": "Asha Children's Home", "area": "Sanganer", "lat": 26.8240, "lng": 75.7960, "need": 90, "received": 0, "vegOnly": True, "priority": 1.0, "serves": "84 children"},
    {"id": "n3", "name": "Sewa Night Shelter", "area": "Sindhi Camp", "lat": 26.9220, "lng": 75.7870, "need": 160, "received": 30, "vegOnly": False, "priority": 0.85, "serves": "Homeless adults"},
    {"id": "n4", "name": "Vatsalya Old Age Home", "area": "Mansarovar", "lat": 26.8600, "lng": 75.7550, "need": 60, "received": 0, "vegOnly": True, "priority": 1.0, "serves": "58 elderly residents"},
    {"id": "n5", "name": "Jagatpura Basti Food Bank", "area": "Jagatpura", "lat": 26.8180, "lng": 75.8700, "need": 110, "received": 20, "vegOnly": False, "priority": 0.8, "serves": "Slum families"},
    {"id": "n6", "name": "Shanti Women's Shelter", "area": "Vaishali Nagar", "lat": 26.9050, "lng": 75.7350, "need": 50, "received": 0, "vegOnly": True, "priority": 0.95, "serves": "Women and infants"},
    {"id": "n7", "name": "Sitapura Workers' Canteen Trust", "area": "Sitapura", "lat": 26.7750, "lng": 75.8400, "need": 300, "received": 120, "vegOnly": False, "priority": 0.6, "serves": "Industrial workers"},
    {"id": "n8", "name": "Galta Gate Annakshetra", "area": "Galta Gate", "lat": 26.9230, "lng": 75.8500, "need": 200, "received": 60, "vegOnly": True, "priority": 0.7, "serves": "Pilgrims and needy"},
]

VOLS = [
    {"id": "v1", "name": "Rohit S.", "vehicle": "Bike", "cap": 60, "lat": 26.8600, "lng": 75.8150},
    {"id": "v2", "name": "Priya M.", "vehicle": "Auto", "cap": 160, "lat": 26.8700, "lng": 75.8100},
    {"id": "v3", "name": "Aman K.", "vehicle": "Cargo van", "cap": 500, "lat": 26.8950, "lng": 75.7900},
    {"id": "v4", "name": "Neha J.", "vehicle": "Auto", "cap": 160, "lat": 26.9150, "lng": 75.7550},
    {"id": "v5", "name": "Imran A.", "vehicle": "Bike", "cap": 60, "lat": 26.8300, "lng": 75.8500},
    {"id": "v6", "name": "Kavya R.", "vehicle": "Cargo van", "cap": 500, "lat": 26.8400, "lng": 75.7800},
]

# room = safe holding hours at room temperature (conservative)
CATS = {
    "rice_grains": {"label": "Rice & grains", "room": 2},
    "dal_curry": {"label": "Dal & curries", "room": 3},
    "dry_sabzi": {"label": "Dry sabzi", "room": 4},
    "roti_bread": {"label": "Roti & breads", "room": 8},
    "fried_snacks": {"label": "Fried snacks", "room": 10},
    "dairy_sweets": {"label": "Milk-based sweets", "room": 3},
    "non_veg": {"label": "Non-veg", "room": 2},
    "salad_raw": {"label": "Salad & raw", "room": 2},
    "dessert_other": {"label": "Dry sweets", "room": 6},
}

SAMPLE_ANALYSIS = {
    "is_food": True,
    "dishes": [
        {"name": "Veg pulao", "hindi_name": "वेज पुलाव", "category": "rice_grains", "veg": True, "est_servings": 70, "confidence": 0.86},
        {"name": "Dal makhani", "hindi_name": "दाल मखनी", "category": "dal_curry", "veg": True, "est_servings": 55, "confidence": 0.82},
        {"name": "Paneer butter masala", "hindi_name": "पनीर बटर मसाला", "category": "dal_curry", "veg": True, "est_servings": 40, "confidence": 0.8},
        {"name": "Butter naan", "hindi_name": "बटर नान", "category": "roti_bread", "veg": True, "est_servings": 90, "confidence": 0.77},
        {"name": "Gulab jamun", "hindi_name": "गुलाब जामुन", "category": "dairy_sweets", "veg": True, "est_servings": 60, "confidence": 0.9},
    ],
    "total_meals": 150,
    "est_weight_kg": 46,
    "quality_flags": [
        "Food is covered in chafing dishes, which keeps it hot and clean",
        "Naan will turn chewy after about 3 hours, so deliver it first",
        "Gulab jamun is milk-based, so keep it separate from hot curries",
    ],
    "summary": "Untouched buffet surplus from a wedding: five vegetarian dishes, enough for about 150 full meals.",
}

KG_PER_MEAL = 0.31
CO2_PER_KG = 2.5
RUPEES_PER_MEAL = 60

SEED_DONORS = [
    ("Shubh Vivah Banquet Hall", 1240),
    ("Rajputana Palace Hotel", 980),
    ("MNIT Hostel Mess", 860),
    ("Tech Park Cafeteria, Sitapura", 610),
    ("Laxmi Mishthan Restaurant", 420),
]
