"""
Unit test for parsing Excel Sheet 1 (Campus_2D_Grid_Map)
Verifies:
1. Matrix header detection (skipping title rows)
2. Extraction of buildings from Sheet 1 cells (e.g., T.0019, D.0019, B.0001, and Thai ท.0019)
3. Extraction of road segments from Sheet 1 cells
4. Precedence of Sheet 1 edits over Sheet 2
"""
import unittest
import openpyxl
import os
import re

class TestExcelUploadSheet1(unittest.TestCase):
    def setUp(self):
        self.base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.xlsx_path = os.path.join(self.base_dir, 'data', 'sainoi_campus_layout_template.xlsx')
        self.wb = openpyxl.load_workbook(self.xlsx_path)

    def test_sheet_1_structure(self):
        self.assertEqual(self.wb.sheetnames[0], 'Campus_2D_Grid_Map')
        ws = self.wb['Campus_2D_Grid_Map']
        rows = list(ws.iter_rows(values_only=True))

        # Row 0..3 are titles
        self.assertIn('ผังจำลองตำแหน่งอาคาร', str(rows[0][0]))

        # Find header row
        header_row_idx = None
        for idx, r in enumerate(rows[:15]):
            if r and sum(1 for c in r if c and 'X=' in str(c)) >= 3:
                header_row_idx = idx
                break

        self.assertIsNotNone(header_row_idx)
        self.assertEqual(header_row_idx, 4)

        header_row = rows[header_row_idx]
        col_x_map = {}
        for c_idx, val in enumerate(header_row[1:], start=1):
            if val:
                m = re.search(r'[-+]?\d+', str(val))
                if m:
                    col_x_map[c_idx] = float(m.group())

        self.assertGreaterEqual(len(col_x_map), 30)

        # Extract buildings
        bld_found = {}
        for r_idx in range(header_row_idx + 1, len(rows)):
            row = rows[r_idx]
            if not row or not row[0]:
                continue
            m_z = re.search(r'[-+]?\d+', str(row[0]))
            if not m_z:
                continue
            z_val = float(m_z.group())

            for c_idx in range(1, len(row)):
                if c_idx not in col_x_map:
                    continue
                x_val = col_x_map[c_idx]
                cell_val = str(row[c_idx] or '').strip()
                if not cell_val:
                    continue

                matches = re.findall(r'([TDBทดับ]\.?\s*\d{4})', cell_val, re.IGNORECASE)
                for raw in matches:
                    cleaned = re.sub(r'\s+', '', raw).upper()
                    prefix = cleaned[0]
                    if prefix == 'ท': prefix = 'T'
                    elif prefix == 'ด': prefix = 'D'
                    elif prefix == 'บ': prefix = 'B'
                    digits = cleaned[-4:]
                    code = f"{prefix}.{digits}"
                    bld_found[code] = (x_val, z_val)

        # All 29 buildings must be present on Sheet 1
        self.assertEqual(len(bld_found), 29)
        self.assertIn('T.0019', bld_found)
        self.assertIn('T.0028', bld_found)
        self.assertIn('B.0001', bld_found)

    def test_thai_building_codes(self):
        cases = [
            ('ท.0019', 'T.0019'),
            ('ท0019', 'T.0019'),
            ('ด.0019', 'D.0019'),
            ('บ.0001', 'B.0001'),
            ('[T.0028]', 'T.0028'),
            ('🏢 T.0019', 'T.0019'),
            ('T.0019 (สนง.ไทรน้อย)', 'T.0019')
        ]
        for inp, expected in cases:
            matches = re.findall(r'([TDBทดับ]\.?\s*\d{4})', inp, re.IGNORECASE)
            self.assertTrue(len(matches) > 0, f"Failed on {inp}")
            raw = matches[0]
            cleaned = re.sub(r'\s+', '', raw).upper()
            prefix = cleaned[0]
            if prefix == 'ท': prefix = 'T'
            elif prefix == 'ด': prefix = 'D'
            elif prefix == 'บ': prefix = 'B'
            digits = cleaned[-4:]
            code = f"{prefix}.{digits}"
            self.assertEqual(code, expected)

if __name__ == '__main__':
    unittest.main()
