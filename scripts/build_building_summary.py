import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

def build_building_summary():
    with open(DATA_DIR / "energy_db.json", "r", encoding="utf-8") as f:
        energy_db = json.load(f)

    with open(DATA_DIR / "building_mapping.json", "r", encoding="utf-8") as f:
        mapping = json.load(f)

    weekly_consumption = energy_db.get("weekly_consumption", [])
    buildings = mapping.get("buildings", {})

    # Map meter_id to b_code from building_mapping
    meter_to_building = {}
    main_meters = set()
    for b_code, b_info in buildings.items():
        m_rule = b_info.get("metering", {})
        main_m = m_rule.get("main_meter_id")
        if main_m:
            main_meters.add(main_m)
            meter_to_building[main_m] = b_code
        for m_id in m_rule.get("all_main_meters", []):
            main_meters.add(m_id)
            meter_to_building[m_id] = b_code

    # Group weekly consumption by building and month/week
    # Notice: Each weekly row has: week_id, week_start_date, week_end_date, meter_id, kwh, b_code
    b_weekly = defaultdict(lambda: defaultdict(float))
    b_monthly = defaultdict(lambda: defaultdict(float))
    b_sub_monthly = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))

    # Track all available periods
    all_weeks = set()
    all_months = set()

    for row in weekly_consumption:
        m_id = row.get("meter_id")
        kwh = float(row.get("kwh", 0) or 0)
        w_id = row.get("week_id")
        w_end = row.get("week_end_date")
        month = w_end[:7] if w_end else ""

        if w_id:
            all_weeks.add(w_id)
        if month:
            all_months.add(month)

        # Check if this meter belongs to a building's main meter
        b_code = meter_to_building.get(m_id)
        if b_code and m_id in main_meters:
            if w_id:
                b_weekly[b_code][w_id] += kwh
            if month:
                b_monthly[b_code][month] += kwh

        # Also group submeters
        raw_b_code = row.get("b_code")
        if raw_b_code in buildings and m_id not in main_meters:
            if month:
                b_sub_monthly[raw_b_code][month][m_id] += kwh

    # Format result structure
    summary_by_building = {}
    for b_code, b_info in sorted(buildings.items()):
        m_monthly = {m: round(b_monthly[b_code].get(m, 0.0), 2) for m in sorted(all_months)}
        m_weekly = {w: round(b_weekly[b_code].get(w, 0.0), 2) for w in sorted(all_weeks)}

        # Annual totals
        years = sorted(list({m[:4] for m in all_months if m}))
        annual_totals = {}
        for y in years:
            y_months = [m for m in all_months if m.startswith(y)]
            annual_totals[y] = round(sum(m_monthly.get(m, 0.0) for m in y_months), 2)

        summary_by_building[b_code] = {
            "b_code": b_code,
            "name": b_info.get("name"),
            "short_name": b_info.get("short_name"),
            "category": b_info.get("category"),
            "main_meter_id": b_info.get("metering", {}).get("main_meter_id"),
            "monthly_kwh": m_monthly,
            "weekly_kwh": m_weekly,
            "annual_totals": annual_totals,
            "sub_meters_monthly": {
                m: {sub_m: round(val, 2) for sub_m, val in sub_dict.items()}
                for m, sub_dict in b_sub_monthly[b_code].items()
            }
        }

    out_data = {
        "schema_version": "1.0.0",
        "generated_at": energy_db.get("meta", {}).get("generated_at"),
        "periods": {
            "months": sorted(all_months),
            "weeks": sorted(all_weeks),
            "years": sorted(list({m[:4] for m in all_months if m}))
        },
        "buildings": summary_by_building
    }

    out_file = DATA_DIR / "building_energy_summary.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(out_data, f, ensure_ascii=False, indent=2)

    print(f"Built {out_file} successfully! Buildings: {len(summary_by_building)}, Months: {len(all_months)}, Weeks: {len(all_weeks)}")

if __name__ == "__main__":
    build_building_summary()
