import json
import unittest

class TestMonthRangeFilter(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open('data/building_energy_summary.json', 'r', encoding='utf-8') as f:
            cls.summary = json.load(f)
        with open('data/building_mapping.json', 'r', encoding='utf-8') as f:
            cls.mapping = json.load(f)

    def test_campus_full_year_2026(self):
        with open('data/energy_db.json', 'r', encoding='utf-8') as f:
            energy_db = json.load(f)
        
        def valid_energy_row(r):
            kwh = float(r.get('kwh', 0) or 0)
            flags = r.get('flags') or r.get('source_flags') or []
            bad = any('SPIKE_SUSPECT' in str(flag) or 'NEGATIVE_DELTA_NOT_RESET' in str(flag) or 'NEGATIVE_DELTA_INVALID' in str(flag) for flag in flags)
            return (not bad) and (kwh <= 2000000)

        expected_2026 = sum(
            float(r.get('kwh', 0)) for r in energy_db.get('department_weekly', [])
            if str(r.get('week_end_date', '')).startswith('2026') and valid_energy_row(r)
        )

        totals = self.summary.get('campus_monthly_totals', {})
        total_2026 = sum(totals.get(f'2026-{m:02d}', 0.0) for m in range(1, 13))
        # Matches index.html allTotal() for 2026 strictly
        self.assertAlmostEqual(total_2026, expected_2026, delta=0.5)

    def test_campus_june_2026(self):
        totals = self.summary.get('campus_monthly_totals', {})
        total_june = totals.get('2026-06', 0.0)
        # Matches index.html calcKwhForPeriod(2026, 6, 6)
        self.assertAlmostEqual(total_june, 290059.09, delta=0.5)

    def test_campus_h1_2026(self):
        totals = self.summary.get('campus_monthly_totals', {})
        total_h1 = sum(totals.get(f'2026-{m:02d}', 0.0) for m in range(1, 7))
        # Matches index.html calcKwhForPeriod(2026, 1, 6)
        self.assertAlmostEqual(total_h1, 1721819.52, delta=0.5)

    def test_buildings_sum_equals_campus_total(self):
        buildings = self.summary.get('buildings', {})
        for ym in ['2026-06', '2026-05', '2026-01']:
            campus_val = self.summary['campus_monthly_totals'].get(ym, 0.0)
            bld_val = sum(b.get('monthly_kwh', {}).get(ym, 0.0) for b in buildings.values())
            self.assertAlmostEqual(campus_val, bld_val, delta=0.1, msg=f"Mismatch for month {ym}")

    def test_department_monthly_totals_consistency(self):
        dept_totals = self.summary.get('department_monthly_totals', {})
        for dept in ['สก.ชธธ.', 'อบค.', 'อบฟ.', 'อบย.', 'อรอ.', 'อคม.', 'อหข.']:
            self.assertIn(dept, dept_totals)
            # June 2026
            val = dept_totals[dept].get('2026-06', 0.0)
            self.assertGreater(val, 0.0)

    def test_target_rate_configuration(self):
        # Target for 2026 is 8%, 2025 is 5%
        prev_2025 = sum(self.summary['campus_monthly_totals'].get(f'2025-{m:02d}', 0.0) for m in range(1, 13))
        curr_2026 = sum(self.summary['campus_monthly_totals'].get(f'2026-{m:02d}', 0.0) for m in range(1, 13))
        diff_pct = ((curr_2026 - prev_2025) / prev_2025) * 100
        saved_pct = -diff_pct
        # Target is 8% reduction, saved_pct is ~16.3% -> achieved
        self.assertGreater(saved_pct, 8.0)

if __name__ == '__main__':
    unittest.main()
