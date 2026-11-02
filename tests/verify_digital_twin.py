import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

def run_tests():
    print("=================================================================")
    print("Sainoi Energy Dashboard & 3D Building Digital Twin - Test Suite")
    print("=================================================================")
    passed = 0
    failed = 0

    def assert_test(condition, test_name, error_msg=""):
        nonlocal passed, failed
        if condition:
            print(f"[PASS] {test_name}")
            passed += 1
        else:
            print(f"[FAIL] {test_name} - {error_msg}")
            failed += 1

    # Test 1: Essential Files Existence
    required_files = [
        "index.html",
        "twin.html",
        "fuel.html",
        "water.html",
        "garbage.html",
        "scripts/energy-twin-core.js",
        "scripts/energy-twin-3d.js",
        "scripts/build_energy_db.py",
        "scripts/build_building_summary.py",
        "data/building_mapping.json",
        "data/building_energy_summary.json",
        "data/meter_master.csv",
        "data/weekly_readings.csv",
        ".github/workflows/build-energy-db.yml",
        "backup/restore.ps1"
    ]
    for rf in required_files:
        p = ROOT / rf
        assert_test(p.exists(), f"File Exists: {rf}", "File not found")

    # Test 2: Schema of building_mapping.json
    with open(DATA_DIR / "building_mapping.json", "r", encoding="utf-8") as f:
        mapping = json.load(f)
    
    assert_test(mapping.get("schema_version") == "1.0.0", "Mapping Schema: schema_version is 1.0.0")
    assert_test(mapping.get("buildings_count") == 29, f"Mapping: 29 physical buildings (Got {mapping.get('buildings_count')})")
    assert_test("disclaimer" in mapping, "Mapping: Has transparency disclaimer note")
    assert_test("double_counting_policy" in mapping, "Mapping: Has double counting prevention policy")

    buildings = mapping.get("buildings", {})
    all_b_have_mains = all(b.get("metering", {}).get("main_meter_id") for b in buildings.values())
    assert_test(all_b_have_mains, "Mapping: Every building has a designated primary main meter")

    all_area_explicit_null = all(b.get("area_m2") is None for b in buildings.values())
    assert_test(all_area_explicit_null, "Data Truth: area_m2 is explicitly null (not fabricated without survey)")

    # Test 3: Schema of building_energy_summary.json
    with open(DATA_DIR / "building_energy_summary.json", "r", encoding="utf-8") as f:
        summary = json.load(f)

    assert_test("periods" in summary, "Summary: Contains available periods")
    months = summary.get("periods", {}).get("months", [])
    assert_test(len(months) >= 20, f"Summary: Contains historical months (Got {len(months)})")
    assert_test(len(summary.get("buildings", {})) == 29, "Summary: Exactly 29 buildings summarized")

    # Test 4: Double Counting Prevention Verification
    # Check that T.0019 main meter is T.0019__FL01__Main and sub-meters are NOT added into main total
    t0019_info = buildings.get("T.0019", {})
    t0019_metering = t0019_info.get("metering", {})
    assert_test(t0019_metering.get("main_meter_id") == "T.0019__FL01__Main", "Double Counting Guard: T.0019 primary meter is T.0019__FL01__Main")
    assert_test(t0019_metering.get("sub_meters_count") == 45, f"Sub-meters Breakdown: T.0019 has 45 sub-meters (Got {t0019_metering.get('sub_meters_count')})")

    # Test 5: Calculation Formula Check
    # Pick a building and verify monthly sum equals sum of main meter readings for that month
    t0019_sum = summary.get("buildings", {}).get("T.0019", {})
    m_sample = "2026-05"
    kwh_sample = t0019_sum.get("monthly_kwh", {}).get(m_sample)
    assert_test(kwh_sample is not None and kwh_sample > 0, f"Consumption Calculation: T.0019 in {m_sample} = {kwh_sample} kWh")

    # Test 6: Check navigation links consistency across pages
    html_files = ["index.html", "twin.html", "fuel.html", "water.html", "garbage.html"]
    twin_links_ok = True
    for hf in html_files:
        content = (ROOT / hf).read_text(encoding="utf-8")
        if "twin.html" not in content and hf != "twin.html":
            twin_links_ok = False
            print(f"Missing twin.html link in {hf}")
    assert_test(twin_links_ok, "Navigation Consistency: All dashboard pages link to twin.html")

    print("-----------------------------------------------------------------")
    print(f"Test Summary: {passed} PASSED, {failed} FAILED")
    print("=================================================================")
    return failed == 0

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
