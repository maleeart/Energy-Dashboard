import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

with open(DATA_DIR / "energy_db.json", "r", encoding="utf-8") as f:
    energy_db = json.load(f)

with open(DATA_DIR / "building_mapping.json", "r", encoding="utf-8") as f:
    mapping = json.load(f)

dept_weekly = energy_db.get("department_weekly", [])
weekly_consumption = energy_db.get("weekly_consumption", [])
buildings = mapping.get("buildings", {})

DEPT = ["สก.ชธธ.", "อบค.", "อบฟ.", "อบย.", "อรอ.", "อคม.", "อหข.", "อสร."]

def ymd_year(d): return int(str(d)[:4])
def ymd_month(d): return int(str(d)[5:7])

def valid_energy_row(r):
    kwh = float(r.get("kwh", 0) or 0)
    flags = r.get("flags") or r.get("source_flags") or []
    bad = any("SPIKE_SUSPECT" in str(f) or "NEGATIVE_DELTA_NOT_RESET" in str(f) or "NEGATIVE_DELTA_INVALID" in str(f) for f in flags)
    return (not bad) and (kwh <= 2000000)

# 1. Aggregate department_weekly by building, month, and department
b_monthly_allocated = defaultdict(lambda: defaultdict(float))
b_monthly_by_dept = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))
dept_monthly_totals = defaultdict(lambda: defaultdict(float))
campus_monthly_totals = defaultdict(float)

all_months = set()

for r in dept_weekly:
    w_end = r.get("week_end_date", "")
    if not w_end or not valid_energy_row(r):
        continue

    month = w_end[:7]
    all_months.add(month)

    kwh = float(r.get("kwh", 0) or 0)
    dept = r.get("department")
    b_code = r.get("b_code")

    if b_code in buildings:
        b_monthly_allocated[b_code][month] += kwh
        if dept:
            b_monthly_by_dept[b_code][month][dept] += kwh

    if dept:
        dept_monthly_totals[dept][month] += kwh
    campus_monthly_totals[month] += kwh

# 2. Sub-meters monthly breakdown
b_sub_monthly = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))
for r in weekly_consumption:
    w_end = r.get("week_end_date", "")
    if not w_end or not valid_energy_row(r):
        continue
    month = w_end[:7]
    b_code = r.get("b_code")
    m_id = r.get("meter_id")
    is_main = r.get("is_main_meter", False)
    kwh = float(r.get("kwh", 0) or 0)

    if b_code in buildings and not is_main and m_id:
        b_sub_monthly[b_code][month][m_id] += kwh

# 3. Build summary dictionary
years = sorted(list({m[:4] for m in all_months if m}))

summary_by_building = {}
for b_code, b_info in sorted(buildings.items()):
    m_monthly = {m: round(b_monthly_allocated[b_code].get(m, 0.0), 2) for m in sorted(all_months)}
    
    annual_totals = {}
    for y in years:
        y_months = [m for m in all_months if m.startswith(y)]
        annual_totals[y] = round(sum(m_monthly.get(m, 0.0) for m in y_months), 2)

    by_dept_formatted = {}
    for m in sorted(all_months):
        by_dept_formatted[m] = {
            d: round(b_monthly_by_dept[b_code][m].get(d, 0.0), 2)
            for d in DEPT if b_monthly_by_dept[b_code][m].get(d, 0.0) > 0
        }

    summary_by_building[b_code] = {
        "b_code": b_code,
        "name": b_info.get("name"),
        "short_name": b_info.get("short_name"),
        "category": b_info.get("category"),
        "category_th": b_info.get("category_th"),
        "main_meter_id": b_info.get("metering", {}).get("main_meter_id"),
        "monthly_kwh": m_monthly,
        "monthly_by_dept": by_dept_formatted,
        "annual_totals": annual_totals,
        "sub_meters_monthly": {
            m: {sub_m: round(val, 2) for sub_m, val in sub_dict.items()}
            for m, sub_dict in b_sub_monthly[b_code].items()
        }
    }

out_data = {
    "schema_version": "2.0.0",
    "description": "Pre-aggregated building and department energy consumption strictly synced with index.html formulas and allocations",
    "periods": {
        "months": sorted(all_months),
        "years": years
    },
    "campus_monthly_totals": {m: round(campus_monthly_totals[m], 2) for m in sorted(all_months)},
    "department_monthly_totals": {
        d: {m: round(dept_monthly_totals[d].get(m, 0.0), 2) for m in sorted(all_months)}
        for d in DEPT
    },
    "buildings": summary_by_building
}

out_file = DATA_DIR / "building_energy_summary.json"
with open(out_file, "w", encoding="utf-8") as f:
    json.dump(out_data, f, ensure_ascii=False, indent=2)

print(f"Successfully generated {out_file}!")
print(f"Months: {len(all_months)}, Buildings: {len(summary_by_building)}")
print(f"June 2026 Campus Total: {out_data['campus_monthly_totals'].get('2026-06'):,.2f} kWh")
print(f"2026 Full Year Total: {sum(v for m, v in out_data['campus_monthly_totals'].items() if m.startswith('2026')):,.2f} kWh")
