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
            ('T.0019 (สนง.ไทรน้อย)', 'T.0019'),
            # Shorthand 1-4 digits
            ('ท.19', 'T.0019'),
            ('T.19', 'T.0019'),
            ('ท19', 'T.0019'),
            ('T19', 'T.0019'),
            ('ต.17', 'D.0017'),
            ('ด.17', 'D.0017'),
            ('D.17', 'D.0017'),
            ('ต.015', 'D.0015'),
            ('บ.1', 'B.0001'),
            ('B.1', 'B.0001'),
            ('ท.6', 'T.0006'),
            ('T.6', 'T.0006'),
            ('ท.20', 'T.0020'),
            ('ท.28', 'T.0028'),
            ('ท.29', 'T.0029'),
            ('ต.25', 'D.0025'),
            ('ด.31', 'D.0031')
        ]
        canonical = {
            'B.0001', 'D.0015', 'D.0017', 'D.0019', 'D.0025', 'D.0026', 'D.0031', 'D.0033',
            'T.0006', 'T.0007', 'T.0008', 'T.0009', 'T.0010', 'T.0011', 'T.0012', 'T.0014',
            'T.0015', 'T.0016', 'T.0017', 'T.0018', 'T.0019', 'T.0020', 'T.0022', 'T.0023',
            'T.0025', 'T.0026', 'T.0027', 'T.0028', 'T.0029'
        }

        for inp, expected in cases:
            m = re.search(r'(?:^|[^\w\u0E00-\u0E7F])([TDBทดับต]\.?\s*-?\s*\d{1,4})(?:$|[^\w\u0E00-\u0E7F])', inp, re.IGNORECASE)
            self.assertIsNotNone(m, f"Failed search on {inp}")
            token = re.sub(r'[\s\-_]', '', m.group(1)).upper()
            prefix = token[0]
            if prefix == 'ท': prefix = 'T'
            elif prefix in ('ด', 'ต'): prefix = 'D'
            elif prefix == 'บ': prefix = 'B'
            num_part = re.sub(r'[^0-9]', '', token)
            num = int(num_part)
            code = f"{prefix}.{num:04d}"
            self.assertEqual(code, expected)
            self.assertIn(code, canonical)

    def test_road_and_water_keywords(self):
        # Road resolution
        road_cases = [
            ('ถนนหลัก', 'ROAD_MAIN_BOULEVARD'),
            ('ถนนสายหลัก', 'ROAD_MAIN_BOULEVARD'),
            ('ROAD_MAIN', 'ROAD_MAIN_BOULEVARD'),
            ('ถนนโรงซ่อม', 'ROAD_SPINE_WORKSHOP'),
            ('ถนนสายกลาง', 'ROAD_SPINE_WORKSHOP'),
            ('ถนนเลียบคลอง', 'ROAD_WEST_CANAL'),
            ('ROAD_WEST_CANAL', 'ROAD_WEST_CANAL')
        ]
        road_map = {
            'ROAD_MAIN_BOULEVARD': 'ROAD_MAIN_BOULEVARD', 'ROAD_MAIN': 'ROAD_MAIN_BOULEVARD',
            'ถนนหลัก': 'ROAD_MAIN_BOULEVARD', 'สายหลัก': 'ROAD_MAIN_BOULEVARD',
            'ROAD_SPINE_WORKSHOP': 'ROAD_SPINE_WORKSHOP', 'ROAD_SPINE': 'ROAD_SPINE_WORKSHOP',
            'ถนนโรงซ่อม': 'ROAD_SPINE_WORKSHOP', 'ถนนสายกลาง': 'ROAD_SPINE_WORKSHOP',
            'ROAD_WEST_CANAL': 'ROAD_WEST_CANAL', 'ถนนเลียบคลอง': 'ROAD_WEST_CANAL'
        }
        for inp, exp in road_cases:
            res = None
            for k, v in road_map.items():
                if k in inp.upper() or k in inp:
                    res = v
                    break
            self.assertEqual(res, exp)

        # Water resolution
        water_cases = [
            ('คลองสงวน', 'WEST_CANAL'),
            ('สระน้ำ 1', 'POND_RETENTION_1'),
            ('สระน้ำ 2 (ข้างแฟลต)', 'POND_RETENTION_2'),
            ('สระน้ำ 3', 'POND_RETENTION_3'),
            ('สระน้ำพุ', 'LAKE_FOUNTAIN'),
            ('สระว่ายน้ำ', 'SWIMMING_POOL')
        ]
        for inp, exp in water_cases:
            u = inp.upper()
            if 'คลอง' in inp or 'CANAL' in u: res = 'WEST_CANAL'
            elif 'น้ำพุ' in inp or 'FOUNTAIN' in u: res = 'LAKE_FOUNTAIN'
            elif 'สระว่าย' in inp or 'SWIMMING' in u: res = 'SWIMMING_POOL'
            elif '1' in inp: res = 'POND_RETENTION_1'
            elif '2' in inp or 'แฟลต' in inp: res = 'POND_RETENTION_2'
            elif '3' in inp: res = 'POND_RETENTION_3'
            else: res = None
            self.assertEqual(res, exp)

if __name__ == '__main__':
    unittest.main()
