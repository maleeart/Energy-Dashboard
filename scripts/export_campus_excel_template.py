"""
Export Campus Layout to Excel (.xlsx) and CSV Templates
Generates:
1. data/sainoi_campus_layout_template.xlsx (Visual 2D Grid Map sheet + Building Coordinates sheet + Landmarks sheet)
2. data/sainoi_campus_layout.csv (Coordinates table with UTF-8 BOM)
3. data/sainoi_campus_grid_map.csv (Visual 2D Matrix Grid Map)
"""

import json
import csv
import math
import os
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

def build_excel_and_csv():
    # 1. Load building mapping data
    mapping_file = os.path.join('data', 'building_mapping.json')
    with open(mapping_file, encoding='utf-8') as f:
        data = json.load(f)
    buildings = data['buildings']

    # 2. Define Zones for 29 buildings
    zone_lookup = {
        'T.0019': 'East (สำนักงาน & แล็บ)',
        'D.0019': 'East (สำนักงาน & แล็บ)',
        'T.0020': 'East (สำนักงาน & แล็บ)',
        'D.0025': 'East (สำนักงาน & แล็บ)',
        'T.0017': 'East (สำนักงาน & แล็บ)',
        'T.0018': 'East (สำนักงาน & แล็บ)',

        'T.0007': 'Central (โรงงาน & คลัง)',
        'T.0006': 'Central (โรงงาน & คลัง)',
        'T.0008': 'Central (โรงงาน & คลัง)',
        'T.0010': 'Central (โรงงาน & คลัง)',
        'T.0009': 'Central (โรงงาน & คลัง)',
        'T.0011': 'Central (โรงงาน & คลัง)',
        'T.0012': 'Central (โรงงาน & คลัง)',
        'D.0017': 'Central (โรงงาน & คลัง)',
        'D.0026': 'Central (โรงงาน & คลัง)',
        'T.0014': 'Central (โรงงาน & คลัง)',
        'T.0015': 'Central (โรงงาน & คลัง)',
        'T.0016': 'Central (โรงงาน & คลัง)',
        'T.0023': 'Central (โรงงาน & คลัง)',
        'T.0025': 'Central (โรงงาน & คลัง)',

        'D.0015': 'OHK (ศูนย์ขนส่ง อหข.)',
        'D.0031': 'OHK (ศูนย์ขนส่ง อหข.)',
        'D.0033': 'OHK (ศูนย์ขนส่ง อหข.)',
        'T.0026': 'OHK (ศูนย์ขนส่ง อหข.)',
        'T.0027': 'OHK (ศูนย์ขนส่ง อหข.)',
        'T.0028': 'OHK (ศูนย์ขนส่ง อหข.)',
        'T.0029': 'OHK (ศูนย์ขนส่ง อหข.)',

        'B.0001': 'West (บ้านพัก & ริมคลอง)',
        'T.0022': 'West (บ้านพัก & ริมคลอง)',
    }

    # 3. Define Landmarks & Environment Objects
    landmarks = [
        {
            'code': 'SW_YARD',
            'name': 'ลานสวิตช์ยาร์ด 500 kV (Switchyard)',
            'category': 'ระบบส่งไฟฟ้าแรงสูง',
            'zone': 'Southwest (ติดถนนใหญ่)',
            'x': -65.0, 'z': 85.0, 'y': 0.0,
            'width': 65.0, 'depth': 60.0, 'height': 16.0,
            'desc': 'โครงสร้างกานทรี เสาเหล็ก และหม้อแปลงไฟฟ้าแรงสูง 500kV'
        },
        {
            'code': 'FOOTBALL',
            'name': 'สนามฟุตบอลใหญ่ (Main Football Pitch)',
            'category': 'สันทนาการและกีฬา',
            'zone': 'East (คอร์ตกลางระหว่าง D.0019/D.0025)',
            'x': 80.0, 'z': -46.0, 'y': 0.0,
            'width': 22.0, 'depth': 34.0, 'height': 0.2,
            'desc': 'สนามฟุตบอลหญ้าจริงพร้อมเส้นสนามมาตรฐานและโกลฟุตบอล'
        },
        {
            'code': 'LAKE_PROMENADE',
            'name': 'สระน้ำและสะพานไม้ริมน้ำหลัง ท.0019',
            'category': 'ภูมิทัศน์และแหล่งน้ำ',
            'zone': 'East (หลังอาคาร ท.0019)',
            'x': 35.0, 'z': 24.0, 'y': 0.0,
            'width': 42.0, 'depth': 18.0, 'height': 0.5,
            'desc': 'สระน้ำพักผ่อนพร้อมสะพานไม้ข้าม 2 ฝั่ง'
        },
        {
            'code': 'TURBINE_SCULPTURE',
            'name': 'ลานปฏิมากรรมกังหันไอน้ำ (Steam Turbine Plaza)',
            'category': 'แลนด์มาร์คสำคัญ',
            'zone': 'East (หน้าอาคาร ท.0020)',
            'x': 35.0, 'z': 75.0, 'y': 0.0,
            'width': 21.0, 'depth': 21.0, 'height': 4.0,
            'desc': 'โรเตอร์กังหันไอน้ำโรงไฟฟ้าแท้ จัดวางบนแท่นคอนกรีตกลางวงเวียนทางเดิน'
        },
        {
            'code': 'SUNFLOWER_FIELD',
            'name': 'ทุ่งทานตะวัน (Sunflower Field)',
            'category': 'ภูมิทัศน์ธรรมชาติ',
            'zone': 'Front (หน้าสวิตช์ยาร์ดริมถนนใหญ่)',
            'x': -15.0, 'z': 110.0, 'y': 0.0,
            'width': 35.0, 'depth': 45.0, 'height': 1.6,
            'desc': 'แปลงทุ่งทานตะวันบานสะพรั่ง เอกลักษณ์ต้อนรับผู้มาเยือนไทรน้อย'
        },
        {
            'code': 'CAMPUS_SIGN',
            'name': 'ป้ายสัญลักษณ์ กฟผ. ไทรน้อย',
            'category': 'ป้ายแลนด์มาร์ค',
            'zone': 'Front (ทางเข้าหลัก)',
            'x': 4.0, 'z': 132.0, 'y': 0.0,
            'width': 16.0, 'depth': 3.2, 'height': 2.5,
            'desc': 'ป้ายหินอ่อนสีขาวพร้อมตัวอักษรสีทอง "กฟผ. ไทรน้อย"'
        },
        {
            'code': 'OHK_ROUNDABOUT',
            'name': 'วงเวียนใหญ่ศูนย์ขนส่ง อหข. (OHK Roundabout)',
            'category': 'ระบบการจราจร',
            'zone': 'Northwest (หน้า ท.0026/ท.0028)',
            'x': -135.0, 'z': -150.0, 'y': 0.0,
            'width': 32.0, 'depth': 32.0, 'height': 1.0,
            'desc': 'วงเวียนขนาดรัศมี 16 เมตร เกาะกลางปลูกต้นไม้และพุ่มเข็มชมพู'
        },
        {
            'code': 'OHK_RETENTION_POND',
            'name': 'สระน้ำชะลอน้ำ อหข. (Peanut Retention Pond)',
            'category': 'ระบบระบายน้ำและชะลอน้ำ',
            'zone': 'Northwest (ริมศาลาพักผ่อน อหข.)',
            'x': -171.0, 'z': -158.0, 'y': 0.0,
            'width': 22.0, 'depth': 38.0, 'height': 0.5,
            'desc': 'สระน้ำทรงถั่วสองตอนตามแบบก่อสร้างจริง As-Built WL +99.00'
        },
        {
            'code': 'OHK_GAZEBO',
            'name': 'ศาลาพักผ่อนริมน้ำ อหข. (Waterfront Gazebo)',
            'category': 'อาคารสันทนาการริมน้ำ',
            'zone': 'Northwest (ริมสระน้ำ อหข.)',
            'x': -162.0, 'z': -158.0, 'y': 0.0,
            'width': 6.0, 'depth': 6.0, 'height': 4.0,
            'desc': 'ศาลาทรงแปดเหลี่ยมเสาขาวหลังคาสีเทาเข้มพร้อมสะพานเทียบน้ำ'
        },
        {
            'code': 'EAST_ROUNDABOUT',
            'name': 'วงเวียนฝั่งตะวันออก (East Roundabout)',
            'category': 'ระบบการจราจร',
            'zone': 'East (หน้าศูนย์เชื่อม ท.0017 และ ท.0018)',
            'x': 125.0, 'z': -60.0, 'y': 0.0,
            'width': 24.0, 'depth': 24.0, 'height': 0.8,
            'desc': 'วงเวียนเชื่อมต่อไปยังศูนย์มาตรวิทยาและทดสอบ'
        },
        {
            'code': 'SHRINE_VISHNU',
            'name': 'ศาลพระวิษณุกรรม',
            'category': 'สถานที่ศักดิ์สิทธิ์ประจำสำนักงาน',
            'zone': 'East (ข้าง ท.0020 และ ท.0007)',
            'x': 40.0, 'z': 45.0, 'y': 0.0,
            'width': 4.0, 'depth': 4.0, 'height': 3.0,
            'desc': 'ศาลพระวิษณุกรรมองค์สีทองฐานหินอ่อนสีขาว'
        },
        {
            'code': 'SHRINE_SEVEN_KINGS',
            'name': 'ศาลหลวงพ่อเจ็ดกษัตริย์',
            'category': 'สถานที่ศักดิ์สิทธิ์ประจำสำนักงาน',
            'zone': 'Central (ข้างโรงอาหารหลัก ต.0017)',
            'x': 35.0, 'z': -90.0, 'y': 0.0,
            'width': 4.0, 'depth': 4.0, 'height': 3.0,
            'desc': 'ศาลหลวงพ่อเจ็ดกษัตริย์'
        },
        {
            'code': 'PARKING_SHED_16',
            'name': 'โรงจอดรถยนต์ ต.0016',
            'category': 'อาคารจอดรถ',
            'zone': 'Central (ระหว่าง ท.0008 และ ท.0011)',
            'x': 65.0, 'z': -45.0, 'y': 0.0,
            'width': 6.0, 'depth': 26.0, 'height': 3.5,
            'desc': 'โรงจอดรถหลังคาโค้งสีน้ำเงิน'
        },
        {
            'code': 'PARKING_SHED_18',
            'name': 'โรงจอดรถยนต์ ต.0018',
            'category': 'อาคารจอดรถ',
            'zone': 'Central (หน้า ท.0012)',
            'x': 15.0, 'z': -165.0, 'y': 0.0,
            'width': 30.0, 'depth': 7.0, 'height': 3.5,
            'desc': 'โรงจอดรถยนต์ยาว 30 เมตร'
        },
        {
            'code': 'WEST_CANAL',
            'name': 'คลองสงวน (West Perimeter Canal)',
            'category': 'แหล่งน้ำธรรมชาติแนวเขต',
            'zone': 'West (ขนานตลอดแนวทิศตะวันตก)',
            'x': -210.0, 'z': 0.0, 'y': 0.0,
            'width': 20.0, 'depth': 450.0, 'height': 1.0,
            'desc': 'คลองระบายน้ำธรรมชาติแนวเขตพื้นที่ กฟผ. ไทรน้อย'
        }
    ]

    # 4. Create Excel Workbook
    wb = openpyxl.Workbook()

    # Sheet styles
    font_title = Font(name='Sarabun', size=13, bold=True, color='0B1D51')
    font_subtitle = Font(name='Sarabun', size=10, italic=True, color='475569')
    font_hdr = Font(name='Sarabun', size=11, bold=True, color='FFFFFF')
    font_bold = Font(name='Sarabun', size=10, bold=True)
    font_normal = Font(name='Sarabun', size=10)
    font_mono = Font(name='Consolas', size=10)
    font_grid_hdr = Font(name='Consolas', size=9, bold=True, color='334155')
    font_grid_cell = Font(name='Consolas', size=9, bold=True)

    fill_hdr = PatternFill(start_color='0B1D51', end_color='0B1D51', fill_type='solid')
    fill_grid_hdr = PatternFill(start_color='E2E8F0', end_color='E2E8F0', fill_type='solid')

    # Color fills for zones & landmarks
    fill_east = PatternFill(start_color='BAE6FD', end_color='BAE6FD', fill_type='solid')     # Blue
    fill_central = PatternFill(start_color='FED7AA', end_color='FED7AA', fill_type='solid')  # Amber
    fill_ohk = PatternFill(start_color='E9D5FF', end_color='E9D5FF', fill_type='solid')      # Purple
    fill_west = PatternFill(start_color='FECDD3', end_color='FECDD3', fill_type='solid')     # Rose
    fill_water = PatternFill(start_color='7DD3FC', end_color='7DD3FC', fill_type='solid')    # Cyan
    fill_green = PatternFill(start_color='A7F3D0', end_color='A7F3D0', fill_type='solid')    # Emerald
    fill_yard = PatternFill(start_color='CBD5E1', end_color='CBD5E1', fill_type='solid')     # Slate
    fill_sculpt = PatternFill(start_color='FDE68A', end_color='FDE68A', fill_type='solid')   # Yellow
    fill_road = PatternFill(start_color='F1F5F9', end_color='F1F5F9', fill_type='solid')     # Gray

    thin_border = Border(
        left=Side(style='thin', color='CBD5E1'),
        right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'),
        bottom=Side(style='thin', color='CBD5E1')
    )
    grid_cell_border = Border(
        left=Side(style='thin', color='E2E8F0'),
        right=Side(style='thin', color='E2E8F0'),
        top=Side(style='thin', color='E2E8F0'),
        bottom=Side(style='thin', color='E2E8F0')
    )

    # ═══════════════════════════════════════════════════════════════════
    # SHEET 1: Campus_2D_Grid_Map (ผังจำลองตารางเซลล์ 2D)
    # ═══════════════════════════════════════════════════════════════════
    ws_grid = wb.active
    ws_grid.title = 'Campus_2D_Grid_Map'

    # Title & instructions
    ws_grid['A1'] = 'ผังจำลองตำแหน่งอาคารและวัตถุประกอบ 2D Campus Grid Map | การไฟฟ้าฝ่ายผลิตแห่งประเทศไทย สำนักงานไทรน้อย'
    ws_grid['A1'].font = font_title
    ws_grid['A2'] = '📐 มาตราส่วน: 1 ช่องเซลล์ = 10 x 10 เมตร | แกนแนวนอน (คอลัมน์) = พิกัด X (ตะวันตก - ตะวันออก) | แกนแนวตั้ง (แถว) = พิกัด Z (เหนือ - ใต้)'
    ws_grid['A2'].font = font_subtitle
    ws_grid['A3'] = '💡 วิธีแก้ไข: สามารถคัดลอก/ย้าย รหัสอาคาร (เช่น T.0019) ไปวางในช่องพิกัดที่ต้องการ หรือไปแก้ไขตัวเลขในแท็บ Building_Coordinates แล้วอัปโหลดกลับขึ้นระบบ 3D ได้ทันที'
    ws_grid['A3'].font = font_subtitle

    # Define Grid Parameters: step = 10 meters
    grid_step = 10
    x_min, x_max = -210, 180   # columns
    z_min, z_max = -220, 140   # rows

    x_values = list(range(x_min, x_max + 1, grid_step))
    z_values = list(range(z_min, z_max + 1, grid_step))

    header_row = 5
    first_data_row = 6

    ws_grid.cell(row=header_row, column=1, value='Z \\ X (m)').fill = fill_grid_hdr
    ws_grid.cell(row=header_row, column=1).font = font_grid_hdr
    ws_grid.cell(row=header_row, column=1).alignment = Alignment(horizontal='center', vertical='center')
    ws_grid.cell(row=header_row, column=1).border = thin_border
    ws_grid.column_dimensions['A'].width = 12

    for col_idx, xv in enumerate(x_values, start=2):
        col_letter = get_column_letter(col_idx)
        cell = ws_grid.cell(row=header_row, column=col_idx, value=f'X={xv}')
        cell.font = font_grid_hdr
        cell.fill = fill_grid_hdr
        cell.alignment = Alignment(horizontal='center', vertical='center')
        cell.border = thin_border
        ws_grid.column_dimensions[col_letter].width = 11

    # Map item positions to grid cell (nearest 10m grid)
    # item_grid[(grid_x, grid_z)] = { 'text': '...', 'fill': ..., 'name': '...' }
    item_grid = {}

    # Place landmarks first so buildings overwrite them if overlapping
    for lm in landmarks:
        gx = int(round(lm['x'] / grid_step) * grid_step)
        gz = int(round(lm['z'] / grid_step) * grid_step)
        c = lm['code']
        f = fill_road
        if 'YARD' in c: f = fill_yard
        elif 'FOOTBALL' in c: f = fill_green
        elif 'LAKE' in c or 'POND' in c or 'CANAL' in c: f = fill_water
        elif 'TURBINE' in c or 'SHRINE' in c or 'SUNFLOWER' in c: f = fill_sculpt

        # If landmark has dimension > 20m, occupy a block
        w_span = max(1, int(round(lm['width'] / (grid_step * 2))))
        d_span = max(1, int(round(lm['depth'] / (grid_step * 2))))
        for dx in range(-w_span + 1, w_span + 1):
            for dz in range(-d_span + 1, d_span + 1):
                item_grid[(gx + dx * grid_step, gz + dz * grid_step)] = {
                    'text': f"[{c[:10]}]",
                    'fill': f
                }
        item_grid[(gx, gz)] = { 'text': f"[{c}]", 'fill': f }

    # Place Buildings (Priority)
    for b_code, b in buildings.items():
        pos = b['layout_position']
        gx = int(round(pos['x'] / grid_step) * grid_step)
        gz = int(round(pos['z'] / grid_step) * grid_step)
        zn = zone_lookup.get(b_code, '')

        zf = fill_central
        if 'East' in zn: zf = fill_east
        elif 'OHK' in zn: zf = fill_ohk
        elif 'West' in zn: zf = fill_west

        item_grid[(gx, gz)] = {
            'text': b_code,
            'fill': zf
        }

    # Populate rows in Excel
    for r_idx, zv in enumerate(z_values, start=first_data_row):
        row_cell = ws_grid.cell(row=r_idx, column=1, value=f'Z={zv}')
        row_cell.font = font_grid_hdr
        row_cell.fill = fill_grid_hdr
        row_cell.alignment = Alignment(horizontal='center', vertical='center')
        row_cell.border = thin_border
        ws_grid.row_dimensions[r_idx].height = 20

        for col_idx, xv in enumerate(x_values, start=2):
            cell = ws_grid.cell(row=r_idx, column=col_idx)
            cell.border = grid_cell_border
            cell.alignment = Alignment(horizontal='center', vertical='center')

            key = (xv, zv)
            if key in item_grid:
                item = item_grid[key]
                cell.value = item['text']
                cell.fill = item['fill']
                cell.font = font_grid_cell

    # Freeze panes at (col=2, row=6)
    ws_grid.freeze_panes = 'B6'

    # ═══════════════════════════════════════════════════════════════════
    # SHEET 2: Building_Coordinates (ตารางพิกัดอาคารทั้ง 29 หลัง)
    # ═══════════════════════════════════════════════════════════════════
    ws_bld = wb.create_sheet(title='Building_Coordinates')

    bld_headers = [
        'Building_Code', 'Building_Name', 'Category', 'Zone',
        'X_Coord', 'Z_Coord', 'Y_Coord',
        'Width_m', 'Depth_m', 'Height_m',
        'Primary_Meter_ID'
    ]

    ws_bld.cell(row=1, column=1, value='ตารางพิกัดอาคาร 29 หลัง (Building Coordinates Table)').font = font_title
    ws_bld.cell(row=2, column=1, value='ท่านสามารถแก้ไขค่าตัวเลข X_Coord และ Z_Coord ในคอลัมน์ E และ F เพื่อกำหนดตำแหน่งใหม่ของอาคารได้โดยตรง').font = font_subtitle

    for c_idx, h in enumerate(bld_headers, start=1):
        cell = ws_bld.cell(row=4, column=c_idx, value=h)
        cell.font = font_hdr
        cell.fill = fill_hdr
        cell.alignment = Alignment(horizontal='center', vertical='center')
        cell.border = thin_border

    sorted_bld_items = sorted(buildings.items(), key=lambda kv: (zone_lookup.get(kv[0], ''), kv[0]))

    for r_idx, (b_code, b) in enumerate(sorted_bld_items, start=5):
        pos = b['layout_position']
        dim = b['dimensions']
        zn = zone_lookup.get(b_code, '-')

        row_vals = [
            b_code,
            b['name'],
            b.get('category_th', '-'),
            zn,
            pos['x'],
            pos['z'],
            pos['y'],
            dim['width'],
            dim['depth'],
            dim['height'],
            b.get('primary_meter', '-')
        ]

        for c_idx, val in enumerate(row_vals, start=1):
            cell = ws_bld.cell(row=r_idx, column=c_idx, value=val)
            cell.border = thin_border
            if c_idx == 1:
                cell.font = font_bold
                cell.alignment = Alignment(horizontal='center', vertical='center')
            elif c_idx in [5, 6]: # X, Z coordinates
                cell.font = font_bold
                cell.alignment = Alignment(horizontal='right', vertical='center')
                # Subtle highlight on editable coordinates
                cell.fill = PatternFill(start_color='FEF3C7', end_color='FEF3C7', fill_type='solid')
            elif c_idx in [7, 8, 9, 10]:
                cell.font = font_mono
                cell.alignment = Alignment(horizontal='right', vertical='center')
            elif c_idx == 11:
                cell.font = font_mono
                cell.alignment = Alignment(horizontal='left', vertical='center')
            else:
                cell.font = font_normal
                cell.alignment = Alignment(horizontal='left', vertical='center')

    # Auto-adjust column widths for Sheet 2
    for col in ws_bld.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws_bld.column_dimensions[col_letter].width = max(max_len + 3, 12)

    ws_bld.freeze_panes = 'A5'

    # ═══════════════════════════════════════════════════════════════════
    # SHEET 3: Landmarks_Environment (ตารางวัตถุประกอบรอบๆ ทั้งหมด)
    # ═══════════════════════════════════════════════════════════════════
    ws_lm = wb.create_sheet(title='Landmarks_Environment')

    lm_headers = [
        'Landmark_Code', 'Landmark_Name', 'Category', 'Zone',
        'X_Coord', 'Z_Coord', 'Y_Coord',
        'Width_m', 'Depth_m', 'Height_m',
        'Description'
    ]

    ws_lm.cell(row=1, column=1, value='ตารางวัตถุประกอบรอบๆ และสิ่งอำนวยความสะดวก (Landmarks & Infrastructure)').font = font_title
    ws_lm.cell(row=2, column=1, value='วัตถุประกอบภูมิทัศน์และสิ่งปลูกสร้างสำคัญรอบสำนักงานไทรน้อย').font = font_subtitle

    for c_idx, h in enumerate(lm_headers, start=1):
        cell = ws_lm.cell(row=4, column=c_idx, value=h)
        cell.font = font_hdr
        cell.fill = fill_hdr
        cell.alignment = Alignment(horizontal='center', vertical='center')
        cell.border = thin_border

    for r_idx, lm in enumerate(landmarks, start=5):
        row_vals = [
            lm['code'],
            lm['name'],
            lm['category'],
            lm['zone'],
            lm['x'],
            lm['z'],
            lm['y'],
            lm['width'],
            lm['depth'],
            lm['height'],
            lm['desc']
        ]

        for c_idx, val in enumerate(row_vals, start=1):
            cell = ws_lm.cell(row=r_idx, column=c_idx, value=val)
            cell.border = thin_border
            if c_idx == 1:
                cell.font = font_bold
                cell.alignment = Alignment(horizontal='center', vertical='center')
            elif c_idx in [5, 6, 7, 8, 9, 10]:
                cell.font = font_mono
                cell.alignment = Alignment(horizontal='right', vertical='center')
            else:
                cell.font = font_normal
                cell.alignment = Alignment(horizontal='left', vertical='center')

    for col in ws_lm.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws_lm.column_dimensions[col_letter].width = max(max_len + 3, 14)

    ws_lm.freeze_panes = 'A5'

    # Save Excel Workbook
    xlsx_path = os.path.join('data', 'sainoi_campus_layout_template.xlsx')
    wb.save(xlsx_path)
    print(f"[OK] Generated Excel Workbook: {xlsx_path}")

    # ═══════════════════════════════════════════════════════════════════
    # 5. Export Standard CSV: data/sainoi_campus_layout.csv (UTF-8 with BOM)
    # ═══════════════════════════════════════════════════════════════════
    csv_table_path = os.path.join('data', 'sainoi_campus_layout.csv')
    with open(csv_table_path, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f)
        writer.writerow([
            'Building_Code', 'Building_Name', 'Category', 'Zone',
            'X_Coord', 'Z_Coord', 'Y_Coord',
            'Width_m', 'Depth_m', 'Height_m',
            'Primary_Meter_ID'
        ])
        for b_code, b in sorted_bld_items:
            pos = b['layout_position']
            dim = b['dimensions']
            zn = zone_lookup.get(b_code, '-')
            writer.writerow([
                b_code,
                b['name'],
                b.get('category_th', '-'),
                zn,
                pos['x'],
                pos['z'],
                pos['y'],
                dim['width'],
                dim['depth'],
                dim['height'],
                b.get('primary_meter', '-')
            ])
    print(f"[OK] Generated CSV Coordinates Table: {csv_table_path}")

    # ═══════════════════════════════════════════════════════════════════
    # 6. Export Visual 2D Grid Map CSV: data/sainoi_campus_grid_map.csv
    # ═══════════════════════════════════════════════════════════════════
    csv_grid_path = os.path.join('data', 'sainoi_campus_grid_map.csv')
    with open(csv_grid_path, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f)
        # Header row
        writer.writerow(['Z \\ X (m)'] + [f'X={xv}' for xv in x_values])
        # Data rows
        for zv in z_values:
            row = [f'Z={zv}']
            for xv in x_values:
                key = (xv, zv)
                if key in item_grid:
                    row.append(item_grid[key]['text'])
                else:
                    row.append('')
            writer.writerow(row)
    print(f"[OK] Generated CSV 2D Grid Map: {csv_grid_path}")

if __name__ == '__main__':
    build_excel_and_csv()
