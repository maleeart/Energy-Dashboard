#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import csv
import json
import statistics
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
FORMS_DIR = ROOT / "forms"

METER_MASTER_FILE = DATA_DIR / "meter_master.csv"
DEPARTMENT_ALLOCATIONS_FILE = DATA_DIR / "department_allocations.csv"
BUILDING_ALLOCATIONS_FILE = DATA_DIR / "department_allocation_buildings.csv"

OUTPUT_WEEKLY_READINGS = DATA_DIR / "weekly_readings.csv"
OUTPUT_DB_JSON = DATA_DIR / "energy_db.json"
OUTPUT_VALIDATION = DATA_DIR / "validation_report.json"

MAIN_METER_CODES = {"MDB", "Main", "SCB21"}
DEPARTMENTS = ["สก.ชธธ.", "อบค.", "อบฟ.", "อบย.", "อรอ.", "อคม.", "อหข.", "อสร."]
AUTO_RESET_RATIO_THRESHOLD = 100


def read_csv(path):
    encodings = ["utf-8-sig", "utf-8", "cp874", "tis-620"]
    last_error = None
    for enc in encodings:
        try:
            with open(path, "r", encoding=enc, newline="") as f:
                rows = list(csv.DictReader(f))
                print(f"Read CSV OK: {path} encoding={enc}")
                return rows
        except FileNotFoundError:
            return []
        except Exception as e:
            last_error = e
    raise last_error


def write_csv(path, rows, fields):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def to_float(value):
    if value is None:
        return None
    text = str(value).strip().replace(",", "")
    if text == "":
        return None
    try:
        return float(text)
    except ValueError:
        return None


def parse_date(value):
    text = str(value or "").strip()
    if not text:
        raise ValueError("reading_date is blank")
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(text, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    raise ValueError(f"invalid date format: {text}")


def clean_unit(unit):
    u = str(unit or "").strip().lower()
    if u in {"mwh", "mwhr", "mwh.", "เมกะวัตต์ชั่วโมง"}:
        return "MWh"
    if u in {"kwh", "kwhr", "kwh.", "หน่วย", "ยูนิต"}:
        return "kWh"
    return ""


def is_yes(value):
    text = str(value or "").strip().lower()
    return text in {"y", "yes", "true", "1", "reset", "r", "ใช่", "รีเซ็ต"}


def get_col(row, *names):
    for name in names:
        if name in row:
            return row.get(name)
    normalized = {str(k).strip().lower().replace(" ", "").replace("_", ""): v for k, v in row.items()}
    for name in names:
        key = str(name).strip().lower().replace(" ", "").replace("_", "")
        if key in normalized:
            return normalized[key]
    return ""


def declared_to_kwh(raw_value, raw_unit, default_unit=""):
    unit = clean_unit(raw_unit) or clean_unit(default_unit) or "kWh"
    return raw_value * 1000 if unit == "MWh" else raw_value


def normalize_by_continuity(raw_value, raw_unit, previous_kwh, default_unit=""):
    flags = []
    declared = declared_to_kwh(raw_value, raw_unit, default_unit)
    unit = clean_unit(raw_unit) or clean_unit(default_unit) or "kWh"

    if previous_kwh is None:
        return round(declared, 3), flags

    # Narrow reset / negative guard before unit auto-correction.
    # If the declared value is lower than previous:
    # - huge collapse: meter reset, usage will be current - 0
    # - small decrease: keep declared value and let usage become 0 with warning
    # This prevents wrong auto-conversion such as 26,468 kWh -> 26,468,000 kWh.
    if declared < previous_kwh:
        ratio = previous_kwh / max(declared, 1)
        if ratio >= AUTO_RESET_RATIO_THRESHOLD:
            flags.append("METER_RESET_AUTO_DECLARED_VALUE_KEPT")
        else:
            flags.append("DECLARED_DECREASE_KEPT_NO_UNIT_AUTOCORRECT")
        return round(declared, 3), flags

    candidates = [("declared", declared), ("as_kwh", raw_value), ("as_mwh", raw_value * 1000)]
    unique = []
    seen = set()
    for label, value in candidates:
        key = round(value, 6)
        if key not in seen:
            seen.add(key)
            unique.append((label, value))

    scored = []
    for label, value in unique:
        delta = value - previous_kwh
        score = delta if delta >= 0 else abs(delta) * 1000 + 1_000_000_000
        scored.append((score, label, value))
    scored.sort(key=lambda x: x[0])
    _, chosen_label, chosen_value = scored[0]

    if chosen_label != "declared":
        flags.append("UNIT_SUSPECT_AUTO_CORRECTED")
    if chosen_label == "as_kwh" and unit == "MWh":
        flags.append("RAW_LOOKS_KWH_BUT_UNIT_SAYS_MWH")
    if chosen_label == "as_mwh" and unit == "kWh":
        flags.append("RAW_LOOKS_MWH_BUT_UNIT_SAYS_KWH")
    return round(chosen_value, 3), flags


def build_allocation_map(rows):
    """
    Correct allocation logic from MasterVer1(สัดส่วน) / MeterData2569รายเดือน(แยกฝ่าย):
    - Use column สัดส่วน / allocation_ratio as direct multiplier.
    - If หน่วยงาน/department is blank, fill down from the nearest department above.
    - Do not evaluate whether ratio totals exceed 100%; the table is authoritative.
    - Keep each meter/floor row separate; do not aggregate building before allocation.
    """
    allocations_by_meter = {}
    used_count = 0
    current_department = ""

    for row in rows:
        department_raw = str(get_col(row, "department", "หน่วยงาน", "ฝ่าย") or "").strip()
        if department_raw:
            current_department = department_raw
        department = current_department

        meter_id = str(get_col(row, "meter_id", "Meter ID", "มิเตอร์", "รหัสมิเตอร์") or "").strip()
        if meter_id == "" or department == "":
            continue

        ratio = to_float(get_col(row, "allocation_ratio", "ratio", "สัดส่วน"))
        if ratio is None:
            pct = to_float(get_col(row, "allocation_percent", "percent", "%"))
            ratio = pct / 100 if pct is not None else 0
        if ratio is None or ratio <= 0:
            continue

        allocations_by_meter.setdefault(meter_id, []).append({
            **row,
            "meter_id": meter_id,
            "department": department,
            "allocation_ratio": ratio,
        })
        used_count += 1
    return allocations_by_meter, used_count


def load_master():
    meter_master = read_csv(METER_MASTER_FILE)
    department_allocations = read_csv(DEPARTMENT_ALLOCATIONS_FILE)
    building_allocations = read_csv(BUILDING_ALLOCATIONS_FILE)

    meter_by_id = {}
    for row in meter_master:
        meter_id = str(row.get("meter_id", "")).strip()
        if meter_id:
            meter_by_id[meter_id] = row

    building_alloc_map, building_used = build_allocation_map(building_allocations)
    old_alloc_map, old_used = build_allocation_map(department_allocations)

    # Use the corrected building/floor allocation file if present.
    if building_used > 0:
        allocations_by_meter = building_alloc_map
        allocation_source = building_allocations
        allocation_mode = "building_floor_allocation_from_ratio_sheet"
    else:
        allocations_by_meter = old_alloc_map
        allocation_source = department_allocations
        allocation_mode = "fallback_old_department_allocations"
    return meter_master, allocation_source, meter_by_id, allocations_by_meter, building_used, old_used, allocation_mode


def collect_form_readings(meter_by_id, validation):
    form_files = sorted(p for p in FORMS_DIR.glob("*.csv") if not p.name.startswith("_"))
    readings = []
    seen = set()

    for form_path in form_files:
        rows = read_csv(form_path)
        for row_no, row in enumerate(rows, start=2):
            meter_id = str(row.get("meter_id", "")).strip()
            if meter_id == "":
                continue
            raw = to_float(row.get("raw_reading"))
            if raw is None:
                continue
            try:
                reading_date = parse_date(row.get("reading_date", ""))
            except Exception as e:
                validation["errors"].append({"file": str(form_path.relative_to(ROOT)), "row": row_no, "error": "INVALID_DATE", "detail": str(e), "meter_id": meter_id})
                continue
            if meter_id not in meter_by_id:
                validation["errors"].append({"file": str(form_path.relative_to(ROOT)), "row": row_no, "error": "UNKNOWN_METER_ID", "meter_id": meter_id})
                continue
            duplicate_key = (reading_date, meter_id)
            if duplicate_key in seen:
                validation["errors"].append({"file": str(form_path.relative_to(ROOT)), "row": row_no, "error": "DUPLICATE_READING_FOR_SAME_DATE_AND_METER", "meter_id": meter_id, "reading_date": reading_date})
                continue
            seen.add(duplicate_key)
            week_id = str(row.get("week_id", "")).strip()
            if week_id == "":
                iso = datetime.strptime(reading_date, "%Y-%m-%d").isocalendar()
                week_id = f"{iso.year}-W{iso.week:02d}"
            meter = meter_by_id[meter_id]
            readings.append({
                "source_form": str(form_path.relative_to(ROOT)),
                "reading_date": reading_date,
                "week_id": week_id,
                "meter_id": meter_id,
                "b_code": meter.get("b_code", ""),
                "floor": meter.get("floor", ""),
                "subb_code": str(meter.get("subb_code", "")).strip(),
                "building_name": meter.get("building_name", ""),
                "raw_reading": raw,
                "raw_unit": row.get("raw_unit", "") or meter.get("default_unit", "") or "kWh",
                "reset_flag": row.get("reset_flag", ""),
                "reader": row.get("reader", ""),
                "note": row.get("note", ""),
            })
    readings.sort(key=lambda x: (x["meter_id"], x["reading_date"]))
    return readings, form_files


def calculate_usage(raw_readings, meter_by_id):
    normalized_readings = []
    weekly_consumption = []
    readings_by_meter = {}
    for row in raw_readings:
        readings_by_meter.setdefault(row["meter_id"], []).append(row)

    for meter_id, rows in readings_by_meter.items():
        rows.sort(key=lambda x: x["reading_date"])
        previous_kwh = None
        previous_date = None
        recent_deltas = []
        meter = meter_by_id.get(meter_id, {})
        default_unit = meter.get("default_unit", "")

        for row in rows:
            manual_reset = is_yes(row.get("reset_flag"))
            if manual_reset:
                normalized_kwh = round(declared_to_kwh(row["raw_reading"], row.get("raw_unit", ""), default_unit), 3)
                flags = ["METER_RESET_MANUAL_DECLARED_VALUE_KEPT"]
            else:
                normalized_kwh, flags = normalize_by_continuity(row["raw_reading"], row.get("raw_unit", ""), previous_kwh, default_unit)

            subb_code = str(row.get("subb_code", "")).strip()
            is_main_meter = subb_code in MAIN_METER_CODES
            normalized_readings.append({**row, "normalized_kwh": normalized_kwh, "is_main_meter": is_main_meter, "flags": sorted(set(flags))})

            if previous_kwh is not None:
                week_flags = list(flags)
                raw_delta = normalized_kwh - previous_kwh
                if manual_reset:
                    usage_kwh = normalized_kwh
                    week_flags.append("METER_RESET_MANUAL_PREVIOUS_TREATED_AS_ZERO")
                elif "METER_RESET_AUTO_DECLARED_VALUE_KEPT" in flags:
                    usage_kwh = normalized_kwh
                    week_flags.append("METER_RESET_AUTO_PREVIOUS_TREATED_AS_ZERO")
                elif normalized_kwh < previous_kwh:
                    usage_kwh = 0
                    week_flags.append("NEGATIVE_DELTA_NOT_RESET_USAGE_ZERO")
                else:
                    usage_kwh = normalized_kwh - previous_kwh

                if len(recent_deltas) >= 3:
                    median_delta = statistics.median(recent_deltas[-8:])
                    if median_delta > 0 and usage_kwh > median_delta * 5:
                        week_flags.append("SPIKE_SUSPECT_OVER_5X_MEDIAN")
                if previous_date:
                    d0 = datetime.strptime(previous_date, "%Y-%m-%d")
                    d1 = datetime.strptime(row["reading_date"], "%Y-%m-%d")
                    gap = (d1 - d0).days
                    if gap < 5 or gap > 10:
                        week_flags.append(f"NON_WEEKLY_GAP_{gap}_DAYS")

                weekly_consumption.append({
                    "week_start_date": previous_date,
                    "week_end_date": row["reading_date"],
                    "week_id": row["week_id"],
                    "meter_id": meter_id,
                    "b_code": row.get("b_code", ""),
                    "floor": row.get("floor", ""),
                    "subb_code": subb_code,
                    "building_name": row.get("building_name", ""),
                    "is_main_meter": is_main_meter,
                    "kwh": round(max(usage_kwh, 0), 3),
                    "raw_delta_kwh": round(raw_delta, 3),
                    "previous_normalized_kwh": round(previous_kwh, 3),
                    "current_normalized_kwh": round(normalized_kwh, 3),
                    "reset_ratio": round(previous_kwh / max(normalized_kwh, 1), 3) if normalized_kwh < previous_kwh else "",
                    "flags": sorted(set(week_flags)),
                })
                if usage_kwh > 0:
                    recent_deltas.append(usage_kwh)
            previous_kwh = normalized_kwh
            previous_date = row["reading_date"]
    return normalized_readings, weekly_consumption


def allocate_to_department(weekly_consumption, allocations_by_meter, validation):
    department_weekly = []
    for week in weekly_consumption:
        meter_id = week["meter_id"]
        allocations = allocations_by_meter.get(meter_id, [])
        if not allocations:
            # This is only a warning. Meters not listed in the ratio sheet are intentionally excluded from department totals.
            validation["warnings"].append({"warning": "NO_ALLOCATION_FOR_METER", "meter_id": meter_id, "building_name": week.get("building_name", "")})
            continue
        for alloc in allocations:
            department = str(alloc.get("department", "")).strip()
            ratio = to_float(alloc.get("allocation_ratio")) or 0
            if department == "" or ratio <= 0:
                continue
            department_weekly.append({
                "week_start_date": week["week_start_date"],
                "week_end_date": week["week_end_date"],
                "week_id": week["week_id"],
                "department": department,
                "meter_id": meter_id,
                "b_code": week.get("b_code", ""),
                "floor": week.get("floor", ""),
                "subb_code": week.get("subb_code", ""),
                "building_name": week.get("building_name", ""),
                "allocation_ratio": ratio,
                "kwh": round(week["kwh"] * ratio, 3),
                "source_flags": week.get("flags", []),
            })
    return department_weekly


def build_monthly_by_department(department_weekly):
    monthly = {}
    for row in department_weekly:
        month = row["week_end_date"][:7]
        department = row["department"]
        monthly.setdefault(month, {})
        monthly[month][department] = round(monthly[month].get(department, 0) + row["kwh"], 3)
    return monthly


def build():
    validation = {"errors": [], "warnings": [], "stats": {}}
    meter_master, allocation_source, meter_by_id, allocations_by_meter, building_alloc_rows, old_alloc_rows, allocation_mode = load_master()
    raw_readings, form_files = collect_form_readings(meter_by_id, validation)
    normalized_readings, weekly_consumption = calculate_usage(raw_readings, meter_by_id)
    department_weekly = allocate_to_department(weekly_consumption, allocations_by_meter, validation)
    monthly_by_department = build_monthly_by_department(department_weekly)

    for row in normalized_readings:
        if row.get("flags"):
            validation["warnings"].append({"source_form": row.get("source_form"), "reading_date": row.get("reading_date"), "meter_id": row.get("meter_id"), "warning": ",".join(row.get("flags", []))})
    for row in weekly_consumption:
        if row.get("flags"):
            validation["warnings"].append({"week_end_date": row.get("week_end_date"), "meter_id": row.get("meter_id"), "warning": ",".join(row.get("flags", [])), "previous_normalized_kwh": row.get("previous_normalized_kwh"), "current_normalized_kwh": row.get("current_normalized_kwh"), "reset_ratio": row.get("reset_ratio"), "kwh": row.get("kwh")})

    validation["stats"] = {
        "meters": len(meter_master),
        "weekly_forms_rows_used": len(raw_readings),
        "normalized_readings": len(normalized_readings),
        "weekly_consumption_rows": len(weekly_consumption),
        "department_weekly_rows": len(department_weekly),
        "allocation_rows_used": sum(len(v) for v in allocations_by_meter.values()),
        "building_allocation_rows_used": building_alloc_rows,
        "fallback_allocation_rows_available": old_alloc_rows,
        "allocation_mode": allocation_mode,
        "main_meter_codes": sorted(MAIN_METER_CODES),
        "form_files_read": len(form_files),
        "auto_reset_ratio_threshold": AUTO_RESET_RATIO_THRESHOLD,
    }

    return {
        "meta": {
            "site": "กฟผ. สำนักงานไทรน้อย",
            "version": "energy-auto-db-final-v11-ratio-sheet-filldown",
            "base_unit": "kWh",
            "main_meter_codes": sorted(MAIN_METER_CODES),
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "reset_logic": f"If declared current collapses from previous by ratio >= {AUTO_RESET_RATIO_THRESHOLD}, previous is treated as 0 and usage=current.",
            "allocation_logic": "Use MeterData2569รายเดือน(แยกฝ่าย) ratio sheet. Blank department rows fill down from above. kWh = weekly_usage * สัดส่วน. No ratio-total validation is applied.",
        },
        "departments": DEPARTMENTS,
        "meters": meter_master,
        "allocation_source": allocation_source,
        "weekly_readings": raw_readings,
        "normalized_readings": normalized_readings,
        "weekly_consumption": weekly_consumption,
        "department_weekly": department_weekly,
        "monthly_by_department": monthly_by_department,
        "validation": validation,
    }


def write_outputs(db):
    weekly_fields = ["source_form", "reading_date", "week_id", "meter_id", "b_code", "floor", "subb_code", "building_name", "raw_reading", "raw_unit", "reset_flag", "reader", "note"]
    write_csv(OUTPUT_WEEKLY_READINGS, db["weekly_readings"], weekly_fields)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_DB_JSON, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
    print(f"Generated {OUTPUT_DB_JSON}")
    with open(OUTPUT_VALIDATION, "w", encoding="utf-8") as f:
        json.dump(db["validation"], f, ensure_ascii=False, indent=2)
    print(f"Generated {OUTPUT_VALIDATION}")


def main():
    db = build()
    write_outputs(db)
    print(json.dumps(db["validation"]["stats"], indent=2, ensure_ascii=False))
    if db["validation"]["errors"]:
        print(f"Validation found {len(db['validation']['errors'])} error(s). See data/validation_report.json")
    print("Build completed")


if __name__ == "__main__":
    main()
