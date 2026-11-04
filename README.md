# SNAP — รายงานปริมาณการใช้พลังงานและทรัพยากร สำนักงานไทรน้อย กฟผ.
> **Sai Noi All-resource Platform (SNAP)**  
> ระบบรวบรวม วิเคราะห์ และแสดงผลข้อมูลการใช้พลังงานและทรัพยากร (ไฟฟ้า, น้ำมัน, น้ำประปา, ขยะ) สำนักงานไทรน้อย การไฟฟ้าฝ่ายผลิตแห่งประเทศไทย (กฟผ.)  
> ทำงานแบบ Serverless ร่วมกับ **GitHub Pages + GitHub Actions + Google Apps Script**

---

## 📌 เมนูและฟีเจอร์หลักของ Dashboard

1. **⚡ ไฟฟ้า (Energy Dashboard - `index.html`)**
   - แสดงยอดสะสมและเปรียบเทียบเป้าหมายการประหยัดพลังงาน (Target Comparison)
   - สัดส่วนการใช้ไฟฟ้าแยกตามฝ่าย (สก.ชธธ., อบค., อบฟ., อบย., อรอ., อคม., อหข.)
   - กราฟแท่งปริมาณการใช้ไฟฟ้ารายเดือน พร้อมเส้นประค่าเฉลี่ย และปุ่มเปิดเทียบกับบิล กฟน. (MEA)
   - กราฟเส้นเปรียบเทียบการใช้พลังงานรายเดือนในแต่ละปี พร้อมเส้นประเปรียบเทียบกับบิล กฟน.
   - จัดอันดับ Top อาคารที่ใช้ไฟฟ้าสูงสุด
   - ระบบบันทึกและแสดงเหตุการณ์พิเศษ (Special Events) ที่ส่งผลต่อการใช้พลังงาน
   - ดึงข้อมูลอุณหภูมิเฉลี่ยรายวันจาก Open-Meteo API เพื่อวิเคราะห์ความสัมพันธ์กับสภาพอากาศ

2. **🏢 แบบจำลองอาคาร 3 มิติ (Sainoi Energy Digital Twin - `twin.html`)**
   - **Three.js Campus Digital Twin:** แบบจำลอง 3D ความละเอียดสูง อิงตาม Master Plan และ As-Built 29 อาคาร ผังถนน คลอง คลองระบายน้ำ สนามฟุตบอล และสวิตช์ยาร์ด 500 kV
   - **3 โหมดการแสดงผล (Visual Modes):**
     * **🌡️ Heatmap:** สีอาคารสะท้อนผลเทียบเป้าหมายการประหยัดพลังงาน (เขียว=ผ่านเกณฑ์, แดง=เกินเป้า)
     * **📊 3D Bars:** แท่งพลังงาน 3 มิติพุ่งขึ้นเหนือหลังคาตามหน่วยการใช้ไฟฟ้าจริง (kWh) พร้อมป้ายตัวเลข
     * **⚡ Energy Flow:** เส้นพลังงานเรืองแสงเคลื่อนไหวจำลองการไหลของกระแสไฟฟ้าจากสวิตช์ยาร์ด 500 kV สู่อาคาร
   - **☀️/🌙 กลางวันและกลางคืน (Day/Night Theme):** บรรยากาศกลางคืนพร้อมหน้าต่างเรืองแสงและไฟวิทยาเขต
   - **📺 โหมด Kiosk (Auto-Orbit):** หมุนกล้องรอบวิทยาเขตและวนไฮไลต์อาคารที่ใช้ไฟฟ้าสูงสุด Top 5 สำหรับจอ TV Dashboard
   - **⚖️ จัดการสัดส่วนฝ่าย (Allocation Manager):** ตารางปรับสัดส่วน % พร้อมระบบตรวจผลรวม 100%, บันทึกลงเครื่อง (Apply) และส่งขึ้น GitHub ผ่าน REST API
   - **📉 วิเคราะห์บิล กฟน. & เหตุการณ์พิเศษ:** เปรียบเทียบมิเตอร์ภายใน vs บิล กฟน. หา Unaccounted Energy และไทม์ไลน์ผลกระทบ
   - **📑 รายงานสรุปประจำเดือน:** สร้างรายงานผู้บริหารอัตโนมัติพร้อมภาพ Snapshot 3D และพิมพ์เป็น PDF
   - **🚨 ศูนย์แจ้งเตือน (Alert Center):** เตือนอาคารใช้ไฟเกินเป้าและอัตราพุ่งสูงก้าวกระโดด (>15% MoM) พร้อมปุ่มคลิกโฟกัส 3D ทันที

3. **🛢️ น้ำมัน (`fuel.html`)**
   - ติดตามปริมาณการใช้น้ำมันเชื้อเพลิงของยานพาหนะและเครื่องจักรสำนักงานไทรน้อย

4. **💧 น้ำประปา (`water.html`)**
   - แสดงสถิติและแนวโน้มการใช้น้ำประปารายเดือน

5. **♻️ ขยะ (`garbage.html`)**
   - ติดตามปริมาณขยะและการคัดแยกทรัพยากรหมุนเวียน

---

## ⚙️ ระบบจัดการหลังบ้าน (Admin System)

เข้าใช้งานได้โดยคลิกที่ไอคอน **🔐** มุมขวาบน และกรอกรหัสผ่าน Admin เพื่อเปิดเมนู **⚙️ Admin**:

### 1. 🏢 จัดการสัดส่วน Allocation
* ปรับ % สัดส่วนการแบ่งหน่วยไฟฟ้าตามอาคารของแต่ละฝ่าย
* **✓ Apply**: บันทึกค่าลง `localStorage` เพื่อดูผลบนกราฟ Dashboard ได้ทันที
* **🚀 บันทึกถาวร**: อัปเดตไฟล์ `data/department_allocation_buildings.csv` ขึ้น GitHub ผ่าน GitHub REST API อัตโนมัติ พร้อมทริกเกอร์ให้ GitHub Actions ทำการ rebuild ฐานข้อมูล
* **📜 ประวัติ**: ดูประวัติ commit ของสัดส่วน Allocation ย้อนหลัง และเลือกสลับเวอร์ชันได้

### 2. ⚡ จัดการข้อมูลบิล กฟน. (MEA Data)
* เมนูเลือกปี (Dropdown) แสดงปี พ.ศ. และ ค.ศ. (เช่น ปี 2569 / 2026) พร้อมปุ่ม **"+ เพิ่มปีใหม่"**
* ตาราง 12 เดือน (ม.ค. – ธ.ค.) สำหรับกรอก/แก้ไขยอดหน่วยไฟฟ้าตามบิล กฟน. (kWh) โดยหากเดือนไหนยังไม่มีบิลสามารถเว้นว่าง (`null`) ไว้ได้
* สรุปตัวเลขสถิติสดขณะพิมพ์: **ยอดรวมทั้งปี (Total kWh)**, **ค่าเฉลี่ยต่อเดือน (Avg kWh)**, และ **จำนวนเดือนที่มีข้อมูล**
* **✓ Apply**: บันทึกดูผลเปรียบเทียบกับกราฟแท่งและกราฟเส้นได้ทันที
* **🚀 บันทึกถาวร**: ส่งชุดข้อมูลขึ้นไปบันทึกลงไฟล์ `data/mea_data.json` บน GitHub Repository ทันทีผ่าน GitHub REST API
* **↺ รีเซ็ตค่าเดิม**: ยกเลิกการแก้ไขเฉพาะหน้าเว็บและคืนค่าเดิมจากฐานข้อมูลกลาง

---

## 🔄 รอบการทำงานประจำสัปดาห์ (Weekly Meter Workflow)

ทุกเช้าวันศุกร์ (หรือเมื่อมีการจดมิเตอร์ประจำสัปดาห์):

### วิธีที่ 1: กรอกผ่านฟอร์มเว็บ (`docs/meter_form.html`)
1. เข้าใช้งานหน้าฟอร์มจดมิเตอร์ผ่านเว็บเบราว์เซอร์
2. เลือกสัปดาห์และกรอกค่า RAW Reading
3. ระบบจะบันทึกและส่งข้อมูลเข้า GitHub ผ่าน Google Apps Script อัตโนมัติ

### วิธีที่ 2: กรอกผ่านไฟล์ CSV ใน GitHub
1. ไปที่โฟลเดอร์ `forms/`
2. เปิดไฟล์ประจำสัปดาห์ เช่น `forms/2026-W34.csv`
3. กรอกเฉพาะคอลัมน์ `raw_reading`, ตรวจ `raw_unit`, ระบุ `reader` / `note` ตามต้องการ
4. Commit & Push ขึ้น GitHub

### การประมวลผลอัตโนมัติ (GitHub Actions)
เมื่อมีการ Push ข้อมูลในโฟลเดอร์ `forms/*.csv` หรือ `data/*.csv`:
* GitHub Actions จะรันสคริปต์ `scripts/build_energy_db.py`
* ระบบจะทำการตรวจสอบความถูกต้องและคำนวณหน่วย (Normalized kWh)
* อัปเดตไฟล์ผลลัพธ์อัตโนมัติ:
  - `data/weekly_readings.csv`: รวมข้อมูลดิบทั้งหมด
  - `data/energy_db.json`: ฐานข้อมูลสำหรับ Dashboard
  - `data/validation_report.json`: รายงานผลการตรวจสอบความผิดปกติของมิเตอร์

---

## 🛠️ คำสั่งสำหรับผู้ดูแลระบบ (Developer & Admin Scripts)

### การสร้าง Weekly Form ล่วงหน้าสำหรับสัปดาห์ถัดไป
```bash
python scripts/create_weekly_form.py 2026-06-05
```
จะได้ไฟล์เทมเพลตใหม่ในโฟลเดอร์ `forms/` เช่น `forms/2026-W23.csv`

### การ Rebuild ฐานข้อมูลด้วยตนเองในเครื่อง
```bash
python scripts/build_energy_db.py
python scripts/build_building_summary.py
```

### การทดสอบความถูกต้องของ Digital Twin
```bash
python tests/verify_digital_twin.py
```

---

## 📂 โครงสร้างโฟลเดอร์และไฟล์สำคัญ (Repository Structure)

```text
├── .github/workflows/
│   └── build-energy-db.yml         # GitHub Actions สำหรับ build ฐานข้อมูลอัตโนมัติ
├── data/
│   ├── building_alias.json          # แมปปิ้งชื่ออาคารและนามแฝง (Aliases)
│   ├── building_mapping.json        # พิกัดและสถาปัตยกรรมอาคาร 29 หลัง
│   ├── building_energy_summary.json # ยอดพลังงานรายอาคารและรายเดือน
│   ├── department_allocation_buildings.csv # สัดส่วน Allocation แยกตามอาคาร
│   ├── department_allocations.csv   # สัดส่วน Allocation ระดับฝ่าย
│   ├── energy_db.json              # ฐานข้อมูลหลักที่ Dashboard ใช้อ่าน
│   ├── event_logs.json             # ข้อมูลบันทึกเหตุการณ์พิเศษ
│   ├── mea_data.json               # ข้อมูลหน่วยบิลค่าไฟฟ้า กฟน. รายเดือน (2019-ปัจจุบัน)
│   ├── meter_master.csv            # มาสเตอร์มิเตอร์และตัวคูณ
│   ├── validation_report.json      # รายงานข้อผิดพลาด/เตือนการอ่านค่า
│   └── weekly_readings.csv         # รวม RAW readings ทุกสัปดาห์
├── docs/
│   └── meter_form.html             # เว็บฟอร์มสำหรับผู้จดมิเตอร์หน้างาน
├── forms/
│   └── 2026-Wxx.csv                # ไฟล์จดมิเตอร์รายสัปดาห์
├── scripts/
│   ├── energy-twin-core.js         # Core Data & State Management ของ Digital Twin
│   ├── energy-twin-3d.js           # Three.js 3D Campus Engine & Procedural Architecture
│   ├── build_energy_db.py          # สคริปต์ประมวลผลฐานข้อมูลไฟฟ้า
│   ├── build_building_summary.py   # สคริปต์ซิงค์ข้อมูลพลังงานเข้า 3D อาคาร
│   └── build_fuel_db.py            # สคริปต์ประมวลผลฐานข้อมูลน้ำมัน
├── index.html                      # หน้า Dashboard ไฟฟ้าหลัก
├── twin.html                       # หน้า 3D Building Digital Twin
├── fuel.html                       # หน้า Dashboard น้ำมัน
├── water.html                      # หน้า Dashboard น้ำประปา
├── garbage.html                    # หน้า Dashboard ขยะ
├── vercel.json                     # การตั้งค่าสำหรับ Vercel Deployment
└── tests/
    └── verify_digital_twin.py      # ชุดทดสอบความถูกต้องของระบบ
```

---

## 🚀 การ Deploy บน Vercel หรือ GitHub Pages

### Deploy บน Vercel
1. นำเข้า Repository https://github.com/maleeart/Energy-Dashboard เข้าสู่ Vercel
2. Framework Preset: **Other** (Static)
3. Build Command: เว้นว่าง (Static Site)
4. Output Directory: `.` (Root)
5. ไฟล์ `vercel.json` จะกำหนด Cache Headers และ CORS ให้อัตโนมัติ

### Deploy บน GitHub Pages
1. ไปที่แท็บ **Settings** ของ Repository
2. เลือกเมนู **Pages** (ทางซ้ายมือ)
3. ภายใต้ **Build and deployment**:
   * **Source**: `Deploy from a branch`
   * **Branch**: `main` / `/(root)`
4. กด **Save** ระบบจะแสดง URL สำหรับเข้าใช้งาน Dashboard
