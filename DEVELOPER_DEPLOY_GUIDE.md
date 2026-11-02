# คู่มือนักพัฒนาและการติดตั้งใช้งาน (Developer & Deploy Guide)
## Sainoi Energy Dashboard & 3D Building Digital Twin

---

### 1. สถาปัตยกรรมระบบ (System Architecture)
ระบบถูกออกแบบด้วยสถาปัตยกรรม **Serverless Static Web Application** ทำงานร่วมกับ Three.js และ GitHub Actions:

```text
┌─────────────────────────────────────────────────────────────┐
│                       Data Layer                            │
│  forms/*.csv  ──>  scripts/build_energy_db.py               │
│  data/*.csv   ──>  scripts/build_building_summary.py        │
│                    └─> data/energy_db.json                  │
│                    └─> data/building_energy_summary.json    │
│                    └─> data/building_mapping.json           │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    Calculation & Core                       │
│  scripts/energy-twin-core.js                                │
│  - Double Counting Protection (Main Meter isolation)        │
│  - MoM & YoY Percentage Calculation                         │
│  - Color Scale Transformation                               │
│  - Unified State Subscription & Reactive Sync               │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    Visualization Layer                      │
│  twin.html          ──  scripts/energy-twin-3d.js (Three.js)│
│  index.html         ──  Chart.js 4.4.1                      │
│  2D Campus Grid     ──  CSS Grid Responsive Fallback        │
└─────────────────────────────────────────────────────────────┘
```

---

### 2. โครงสร้างไฟล์และหน้าที่ (Repository Layout)
* `twin.html`: หน้าจอหลักของ 3D Building Digital Twin
* `index.html`: หน้าจอ Dashboard พลังงานไฟฟ้าเดิม (อัปเกรดปุ่มเชื่อมโยง)
* `scripts/energy-twin-core.js`: Core Data Engine, State Store, สูตรคำนวณ และการส่งออก CSV
* `scripts/energy-twin-3d.js`: Three.js Procedural Campus Engine, Controls, Lighting, Raycasting
* `scripts/build_energy_db.py`: ประมวลผล RAW Readings รายสัปดาห์
* `scripts/build_building_summary.py`: สรุปข้อมูลรายอาคารสำหรับ Digital Twin
* `data/building_mapping.json`: Mapping ความสัมพันธ์อาคาร มิเตอร์หลัก มิเตอร์ย่อย พิกัด และฝ่าย
* `data/building_energy_summary.json`: ข้อมูลสรุปรายเดือนและรายปีของ 29 อาคาร
* `.github/workflows/build-energy-db.yml`: GitHub Actions รันประมวลผลข้อมูลอัตโนมัติ

---

### 3. การทดสอบในเครื่องและคำสั่งประมวลผล (Local Development)
เมื่อมีการเพิ่มไฟล์จดมิเตอร์ใหม่ในโฟลเดอร์ `forms/` สามารถประมวลผลฐานข้อมูลในเครื่องได้โดย:

```bash
# 1. รันสร้างฐานข้อมูลไฟฟ้า
py scripts/build_energy_db.py

# 2. รันสรุปข้อมูลสำหรับ 3D Digital Twin
py scripts/build_building_summary.py

# 3. รันชุดแบบทดสอบอัตโนมัติ
py tests/verify_digital_twin.py
```

ทดสอบเปิดดูผ่านเบราว์เซอร์ในเครื่อง (Local Web Server):
```bash
py -m http.server 8080
# เปิดเบราว์เซอร์ไปที่: http://localhost:8080/twin.html หรือ http://localhost:8080/index.html
```

---

### 4. การเผยแพร่ขึ้น GitHub Pages (Deployment)
1. เมื่อทำการ Commit และ Push โค้ดขึ้นบน GitHub สาขา `main`:
   ```bash
   git add .
   git commit -m "feat: Sainoi Energy Dashboard & 3D Building Digital Twin"
   git push origin main
   ```
2. GitHub Actions จะรัน Workflow `.github/workflows/build-energy-db.yml` อัตโนมัติ เพื่อตรวจสอบและอัปเดตไฟล์ JSON
3. การตั้งค่า GitHub Pages:
   - ไปที่ **Settings** > **Pages**
   - Source: **Deploy from a branch**
   - Branch: **main** / **/(root)**
   - กด **Save**
4. การเข้าใช้งานผ่าน GitHub Pages:
   - Dashboard: `https://<organization>.github.io/Energy-Dashboard/index.html`
   - 3D Digital Twin: `https://<organization>.github.io/Energy-Dashboard/twin.html`

---

### 5. การกู้คืนระบบกรณีฉุกเฉิน (Disaster Recovery & Rollback)
หากเกิดข้อผิดพลาดและต้องการย้อนกลับสู่ระบบเดิมก่อนพัฒนา สามารถรัน:
```powershell
.\backup\restore.ps1
```
ระบบจะนำไฟล์สำรองทั้งหมดกลับคืนสู่โฟลเดอร์ Root ทันที
