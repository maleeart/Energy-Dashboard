#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build data/energy_db.json for GitHub Actions / GitHub Pages.

Inputs:
- data/meter_master.csv
- data/department_allocations.csv
- data/weekly_readings.csv

Outputs:
- data/energy_db.json
- data/validation_report.json

Main meter rule for dashboard display:
SubB.Code in {MDB, Main, SCB21}
"""
from __future__ import annotations

import csv
import json
import statistics
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"

MAIN_CODES = {"MDB", "Main", "SCB21"}
DEPARTMENTS = ["สก.ชธธ.", "อบค.", "อบฟ.", "อบย.", "อรอ.", "อคม.", "อหข."]


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        raise FileNotFoundError(f"Missing input file: {path}")
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def to_float(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).strip().replace(",", "")
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def clean_unit(unit: str | None) -> str:
    u = (unit or "").strip().lower()
    if u in {"mwh", "mwhr", "mwh."}:
        return "MWh"
    if u in {"kwh", "kwhr", "kwh."}:
        return "kWh"
    return "kWh"


def normalize_by_unit(raw_value: float, unit: str | None) -> float:
    return raw_value * 1000 if clean_unit(unit) == "MWh" else raw_value


def choose_by_continuity(raw_value: float, raw_unit: str | None, previous_kwh: float | None) -> tuple[float, list[str]]:
    """Normalize to kWh while guarding against mixed kWh/MWh entries.

    Sometimes the RAW value is entered as MWh while the UNIT column still says kWh.
    This function compares the declared-unit interpretation with both kWh and MWh
    interpretations and chooses the one that has the most plausible continuity.
    """
    flags: list[str] = []
    declared = normalize_by_unit(raw_value, raw_unit)
    candidates = [("declared_unit", declared), ("as_kwh", raw_value), ("as_mwh", raw_value * 1000)]

    # de-duplicate
    uniq: list[tuple[str, float]] = []
    seen: set[float] = set()
    for label, val in candidates:
        key = round(val, 6)
        if key not in seen:
            seen.add(key)
            uniq.append((label, val))

    if previous_kwh is None:
        chosen_label, chosen = uniq[0]
    else:
        scored: list[tuple[float, str, float]] = []
        for label, val in uniq:
            delta = val - previous_kwh
            score = abs(delta)
            if delta < 0:
                score += abs(delta) * 10 + 1_000_000
            # Very large jumps are not impossible, but suspicious for weekly data.
            if previous_kwh > 0 and delta > previous_kwh * 0.5:
                score += delta
            scored.append((score, label, val))
        scored.sort(key=lambda x: x[0])
        _, chosen_label, chosen = scored[0]

    if abs(chosen - declared) > max(1, abs(chosen) * 0.001):
        flags.append("UNIT_SUSPECT")
    if chosen_label == "as_mwh" and clean_unit(raw_unit) != "MWh":
        flags.append("AUTO_CONVERTED_MWH_TO_KWH")
    return chosen, sorted(set(flags))


def parse_date(value: str) -> str:
    text = (value or "").strip()
    if not text:
        raise ValueError("reading_date is blank")
    # Keep strict ISO date for GitHub/database stability.
    datetime.strptime(text, "%Y-%m-%d")
    return text


def build() -> dict[str, Any]:
    meters = read_csv(DATA_DIR / "meter_master.csv")
    allocations = read_csv(DATA_DIR / "department_allocations.csv")
    readings = read_csv(DATA_DIR / "weekly_readings.csv")

    meter_by_id = {m.get("meter_id", "").strip(): m for m in meters if m.get("meter_id")}
    validation: dict[str, Any] = {"errors": [], "warnings": [], "stats": {}}

    readings_by_meter: dict[str, list[dict[str, Any]]] = {}
    for row_no, r in enumerate(readings, start=2):
        meter_id = (r.get("meter_id") or "").strip()
        if not meter_id:
            continue
        if meter_id not in meter_by_id:
            validation["errors"].append({"row": row_no, "error": "UNKNOWN_METER_ID", "meter_id": meter_id})
            continue
        raw = to_float(r.get("raw_reading"))
        if raw is None:
            validation["warnings"].append({"row": row_no, "warning": "BLANK_OR_INVALID_READING", "meter_id": meter_id})
            continue
        try:
            reading_date = parse_date(r.get("reading_date", ""))
        except ValueError as exc:
            validation["errors"].append({"row": row_no, "error": "INVALID_DATE", "detail": str(exc), "meter_id": meter_id})
            continue
        m = meter_by_id[meter_id]
        readings_by_meter.setdefault(meter_id, []).append({
            "reading_date": reading_date,
            "meter_id": meter_id,
            "raw_reading": raw,
            "raw_unit": r.get("raw_unit") or m.get("default_unit") or "kWh",
            "reader": r.get("reader", ""),
            "note": r.get("note", ""),
        })

    normalized_readings: list[dict[str, Any]] = []
    weekly_consumption: list[dict[str, Any]] = []

    for meter_id, rows in readings_by_meter.items():
        rows.sort(key=lambda x: x["reading_date"])
        previous_kwh: float | None = None
        recent_deltas: list[float] = []
        seen_dates: set[str] = set()
        for r in rows:
            flags: list[str] = []
            if r["reading_date"] in seen_dates:
                flags.append("DUPLICATE_DATE_FOR_METER")
            seen_dates.add(r["reading_date"])

            kwh, unit_flags = choose_by_continuity(r["raw_reading"], r["raw_unit"], previous_kwh)
            flags.extend(unit_flags)
            delta: float | None = None if previous_kwh is None else kwh - previous_kwh
            if delta is not None:
                if delta < 0:
                    flags.append("NEGATIVE_DELTA")
                if len(recent_deltas) >= 4:
                    median_delta = statistics.median(recent_deltas[-8:])
                    if median_delta > 0 and delta > median_delta * 3:
                        flags.append("SPIKE_SUSPECT")

            m = meter_by_id[meter_id]
            subb_code = (m.get("subb_code") or "").strip()
            is_main = subb_code in MAIN_CODES or str(m.get("is_main", "")).strip().lower() == "true"

            normalized_readings.append({
                **r,
                "normalized_kwh": round(kwh, 3),
                "flags": sorted(set(flags)),
            })

            if delta is not None:
                weekly_consumption.append({
                    "week_end_date": r["reading_date"],
                    "meter_id": meter_id,
                    "b_code": m.get("b_code", ""),
                    "subb_code": subb_code,
                    "building_name": m.get("building_name", ""),
                    "is_main": is_main,
                    "kwh": round(max(delta, 0), 3),
                    "raw_delta_kwh": round(delta, 3),
                    "flags": sorted(set(flags)),
                })
                if delta >= 0:
                    recent_deltas.append(delta)
            previous_kwh = kwh

    allocation_rows: list[dict[str, Any]] = []
    for row_no, a in enumerate(allocations, start=2):
        meter_id = (a.get("meter_id") or "").strip()
        dept = (a.get("department") or "").strip()
        ratio = to_float(a.get("allocation_ratio")) or 0
        if not meter_id or ratio <= 0:
            continue
        if meter_id not in meter_by_id:
            validation["errors"].append({"row": row_no, "file": "department_allocations.csv", "error": "UNKNOWN_METER_ID", "meter_id": meter_id})
            continue
        if dept not in DEPARTMENTS:
            validation["warnings"].append({"row": row_no, "file": "department_allocations.csv", "warning": "UNKNOWN_DEPARTMENT", "department": dept})
            continue
        allocation_rows.append({**a, "meter_id": meter_id, "department": dept, "allocation_ratio": ratio})

    department_weekly: list[dict[str, Any]] = []
    for w in weekly_consumption:
        # Only main meters are used in the dashboard first, as requested.
        if not w["is_main"]:
            continue
        for a in allocation_rows:
            if a["meter_id"] != w["meter_id"]:
                continue
            department_weekly.append({
                "week_end_date": w["week_end_date"],
                "department": a["department"],
                "meter_id": w["meter_id"],
                "b_code": w["b_code"],
                "building_name": w["building_name"],
                "allocation_ratio": a["allocation_ratio"],
                "kwh": round(w["kwh"] * a["allocation_ratio"], 3),
                "source_flags": w["flags"],
            })

    validation["stats"] = {
        "meters": len(meters),
        "weekly_reading_rows_used": sum(len(v) for v in readings_by_meter.values()),
        "normalized_readings": len(normalized_readings),
        "weekly_consumption_rows": len(weekly_consumption),
        "department_weekly_rows": len(department_weekly),
        "main_meter_codes": sorted(MAIN_CODES),
    }

    out = {
        "meta": {
            "site": "กฟผ. สำนักงานไทรน้อย",
            "version": "energy-auto-db-github-v1",
            "base_unit": "kWh",
            "reading_cycle": "weekly Friday morning",
            "main_subb_codes": sorted(MAIN_CODES),
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "generated_from": ["data/meter_master.csv", "data/department_allocations.csv", "data/weekly_readings.csv"],
        },
        "departments": DEPARTMENTS,
        "meters": meters,
        "department_allocations": allocations,
        "normalized_readings": normalized_readings,
        "weekly_consumption": weekly_consumption,
        "department_weekly": department_weekly,
        "validation": validation,
    }
    return out


def main() -> None:
    db = build()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with (DATA_DIR / "energy_db.json").open("w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
    with (DATA_DIR / "validation_report.json").open("w", encoding="utf-8") as f:
        json.dump(db["validation"], f, ensure_ascii=False, indent=2)

    errors = db["validation"]["errors"]
    print("Generated data/energy_db.json")
    print("Generated data/validation_report.json")
    print(json.dumps(db["validation"]["stats"], ensure_ascii=False, indent=2))
    if errors:
        print(f"Validation failed with {len(errors)} error(s). See data/validation_report.json")
        raise SystemExit(1)


if __name__ == "__main__":
    main()
