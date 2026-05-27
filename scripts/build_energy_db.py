# Reconstructed build_energy_db.py

import csv
import json
from pathlib import Path
from datetime import datetime
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent
FORMS_DIR = ROOT / "forms"
DATA_DIR = ROOT / "data"
OUTPUT_JSON = ROOT / "energy_db.json"
VALIDATION_JSON = ROOT / "validation_report.json"

MAIN_CODES = {"MDB", "Main", "SCB21"}
EPSILON = 0.000001


def to_float(v):
    try:
        if v is None:
            return None
        t = str(v).strip().replace(",", "")
        if t == "":
            return None
        return float(t)
    except:
        return None


def parse_date(v):
    t = str(v).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(t, fmt).strftime("%Y-%m-%d")
        except:
            pass
    raise ValueError(f"invalid date: {v}")


def load_csv(path):
    with open(path, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


meter_master = load_csv(DATA_DIR / "meter_master.csv")
allocations = load_csv(DATA_DIR / "department_allocations.csv")

meters_by_id = {}
for r in meter_master:
    meter_id = r["meter_id"]
    meters_by_id[meter_id] = r

normalized_readings = []
weekly_consumption = []
department_weekly = []
validation = {
    "errors": [],
    "warnings": [],
    "stats": {}
}


# ------------------------------------------------------
# STEP 1: LOAD WEEKLY FORMS
# ------------------------------------------------------

raw_rows = []

for form in sorted(FORMS_DIR.glob("*.csv")):
    try:
        rows = load_csv(form)
    except Exception as e:
        validation["errors"].append({
            "file": str(form.name),
            "error": str(e)
        })
        continue

    for row in rows:
        meter_id = row.get("meter_id", "").strip()
        if meter_id not in meters_by_id:
            continue

        try:
            reading_date = parse_date(row.get("reading_date"))
        except:
            continue

        raw_value = to_float(row.get("raw_reading"))

        raw_rows.append({
            "meter_id": meter_id,
            "reading_date": reading_date,
            "raw_reading": raw_value
        })


# ------------------------------------------------------
# STEP 2: NORMALIZE + CALCULATE USAGE
# ------------------------------------------------------

rows_by_meter = defaultdict(list)
for r in raw_rows:
    rows_by_meter[r["meter_id"]].append(r)

for meter_id, rows in rows_by_meter.items():
    rows.sort(key=lambda x: x["reading_date"])

    meta = meters_by_id[meter_id]
    default_unit = meta.get("default_unit", "kWh")

    previous = None

    for r in rows:
        raw = r["raw_reading"]

        if default_unit == "MWh":
            normalized = (raw or 0) * 1000
        else:
            normalized = raw or 0

        # IMPORTANT FIX
        # blank or zero = not recorded
        if raw in (None, 0):
            if previous is not None:
                normalized = previous

        normalized_readings.append({
            "meter_id": meter_id,
            "reading_date": r["reading_date"],
            "normalized_kwh": normalized,
            "building_name": meta.get("building_name"),
            "b_code": meta.get("b_code"),
            "is_main_meter": meta.get("subb_code") in MAIN_CODES
        })

        usage = 0
        flags = []

        if previous is not None:
            usage = normalized - previous

            # SAME VALUE => 0
            if abs(normalized - previous) < EPSILON:
                usage = 0
                flags.append("UNCHANGED_READING_USAGE_ZERO")

            # RESET
            elif usage < 0:
                ratio = previous / max(normalized, 1)

                if ratio >= 100:
                    usage = normalized
                    flags.append("METER_RESET_DETECTED")
                else:
                    usage = 0
                    flags.append("NEGATIVE_DELTA_INVALID")

        if usage < 0:
            usage = 0

        weekly_consumption.append({
            "meter_id": meter_id,
            "reading_date": r["reading_date"],
            "kwh": round(usage, 2),
            "building_name": meta.get("building_name"),
            "b_code": meta.get("b_code"),
            "is_main_meter": meta.get("subb_code") in MAIN_CODES,
            "flags": flags,
            "previous_normalized_kwh": previous,
            "current_normalized_kwh": normalized
        })

        previous = normalized


# ------------------------------------------------------
# STEP 3: DEPARTMENT ALLOCATION
# ------------------------------------------------------

alloc_map = defaultdict(list)

for a in allocations:
    meter_id = a.get("meter_id", "").strip()
    alloc_map[meter_id].append(a)

for wc in weekly_consumption:
    meter_id = wc["meter_id"]

    for alloc in alloc_map.get(meter_id, []):
        ratio = to_float(alloc.get("allocation_ratio")) or 0

        if ratio <= 0:
            continue

        department_weekly.append({
            "department": alloc.get("department"),
            "meter_id": meter_id,
            "building_name": wc["building_name"],
            "reading_date": wc["reading_date"],
            "allocation_ratio": ratio,
            "kwh": round(wc["kwh"] * ratio, 2)
        })


# ------------------------------------------------------
# OUTPUT
# ------------------------------------------------------

output = {
    "meta": {
        "generated_at": datetime.now().isoformat(),
        "version": "reconstructed-fixed-version",
        "main_meter_codes": list(MAIN_CODES)
    },
    "meters": meter_master,
    "department_allocations": allocations,
    "normalized_readings": normalized_readings,
    "weekly_consumption": weekly_consumption,
    "department_weekly": department_weekly
}

validation["stats"] = {
    "meters": len(meter_master),
    "normalized_readings": len(normalized_readings),
    "weekly_consumption_rows": len(weekly_consumption),
    "department_weekly_rows": len(department_weekly)
}

with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

with open(VALIDATION_JSON, "w", encoding="utf-8") as f:
    json.dump(validation, f, ensure_ascii=False, indent=2)

print("DONE")


จุดสำคัญที่แก้ปัญหา ต.0015:


if raw in (None, 0):
    if previous is not None:
        normalized = previous


และ:


if abs(normalized - previous) < EPSILON:
    usage = 0


ดังนั้น:

```text
26864
26864
(blank)
```

จะได้:

```text
0 kWh
```

ไม่ใช่ 26864 หรือ 26 ล้านอีก
