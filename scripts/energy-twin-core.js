/**
 * Sainoi Energy Dashboard & 3D Building Digital Twin - Core Engine
 * Data Layer, Calculation Layer, State Management, and Color Mapping
 */

(function (window) {
  'use strict';

  // Defensive CSV Sanitizer against Formula Injection (CSV Injection)
  function sanitizeCsvValue(val) {
    if (val === null || val === undefined) return '';
    let str = String(val).replace(/"/g, '""');
    if (/^[=\+\-@\t\r]/.test(str)) {
      str = "'" + str;
    }
    return `"${str}"`;
  }

  // EnergyTwin Data and State Store
  const EnergyTwin = {
    // Loaded Raw Data
    mappingData: null,
    summaryData: null,
    validationData: null,
    fullEnergyDb: null,
    meaData: null,

    // Active State
    state: {
      year: '2026',
      month: '2026-06',
      week: '',
      department: 'ALL',
      colorMode: 'total_kwh', // total_kwh | mom_change | target_status | data_quality | energy_intensity
      selectedBuildingId: null,
      comparisonBuildings: [],
      qualityLevel: 'high', // high | medium | low
      showLabels: true,
      showShadows: true,
      isPlayingTimeline: false,
      viewMode: 'split' // '3d' | 'split' | '2d'
    },

    // Listeners for state change
    subscribers: [],

    subscribe(callback) {
      if (typeof callback === 'function') {
        this.subscribers.push(callback);
      }
    },

    notify(changeKey) {
      this.subscribers.forEach((cb) => {
        try {
          cb(this.state, changeKey);
        } catch (e) {
          console.error('Subscriber callback error:', e);
        }
      });
    },

    setState(updates) {
      const oldState = { ...this.state };
      Object.assign(this.state, updates);
      this.notify(updates);
    },

    // Initialization: Load datasets
    async init(basePath = '') {
      try {
        const cleanBase = basePath.endsWith('/') ? basePath : (basePath ? basePath + '/' : '');
        
        // Fetch building_mapping.json and building_energy_summary.json concurrently
        const [mappingRes, summaryRes] = await Promise.all([
          fetch(cleanBase + 'data/building_mapping.json').catch(() => null),
          fetch(cleanBase + 'data/building_energy_summary.json').catch(() => null)
        ]);

        if (mappingRes && mappingRes.ok) {
          this.mappingData = await mappingRes.json();
        }
        if (summaryRes && summaryRes.ok) {
          this.summaryData = await summaryRes.json();
        }

        // Fetch optional validation report & mea data
        try {
          const valRes = await fetch(cleanBase + 'data/validation_report.json');
          if (valRes.ok) this.validationData = await valRes.json();
        } catch (_) {}

        try {
          const meaRes = await fetch(cleanBase + 'data/mea_data.json');
          if (meaRes.ok) this.meaData = await meaRes.json();
        } catch (_) {}

        // Fallback default periods
        if (this.summaryData && this.summaryData.periods) {
          const months = this.summaryData.periods.months || [];
          if (months.length > 0) {
            // Default to latest available month
            const latestMonth = months[months.length - 1];
            this.state.month = latestMonth;
            this.state.year = latestMonth.substring(0, 4);
          }
        }

        return true;
      } catch (err) {
        console.error('Failed to initialize EnergyTwin Core:', err);
        return false;
      }
    },

    // Optional background loader for full energy_db.json (used for detailed sub-meter tables)
    async loadFullEnergyDb(basePath = '') {
      if (this.fullEnergyDb) return this.fullEnergyDb;
      try {
        const cleanBase = basePath.endsWith('/') ? basePath : (basePath ? basePath + '/' : '');
        const res = await fetch(cleanBase + 'data/energy_db.json');
        if (res.ok) {
          this.fullEnergyDb = await res.json();
          return this.fullEnergyDb;
        }
      } catch (e) {
        console.warn('Full energy_db load deferred or failed:', e);
      }
      return null;
    },

    // Get list of all buildings with current calculated metrics
    getBuildingsList() {
      if (!this.mappingData || !this.mappingData.buildings) return [];
      const mBuildings = this.mappingData.buildings;
      const sBuildings = (this.summaryData && this.summaryData.buildings) || {};

      const currentMonth = this.state.month;
      const currentYear = this.state.year;
      const selectedDept = this.state.department;

      const list = [];

      for (const [bCode, bMap] of Object.entries(mBuildings)) {
        // Department filter check
        if (selectedDept !== 'ALL') {
          const depts = bMap.departments || [];
          if (!depts.includes(selectedDept)) {
            continue; // Filtered out
          }
        }

        const bSum = sBuildings[bCode] || {};
        const monthlyKwh = (bSum.monthly_kwh && bSum.monthly_kwh[currentMonth]) !== undefined 
          ? bSum.monthly_kwh[currentMonth] 
          : null;

        // Calculate MoM (Month-over-Month change)
        let momChangePct = null;
        if (currentMonth) {
          const [yr, mo] = currentMonth.split('-').map(Number);
          const prevDate = new Date(yr, mo - 2, 1);
          const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
          const prevKwh = (bSum.monthly_kwh && bSum.monthly_kwh[prevMonth]) !== undefined 
            ? bSum.monthly_kwh[prevMonth] 
            : null;

          if (monthlyKwh !== null && prevKwh !== null && prevKwh > 0) {
            momChangePct = ((monthlyKwh - prevKwh) / prevKwh) * 100;
          }
        }

        // Calculate YoY (Year-over-Year change)
        let yoyChangePct = null;
        if (currentMonth) {
          const [yr, mo] = currentMonth.split('-').map(Number);
          const lastYearMonth = `${yr - 1}-${String(mo).padStart(2, '0')}`;
          const lastYearKwh = (bSum.monthly_kwh && bSum.monthly_kwh[lastYearMonth]) !== undefined 
            ? bSum.monthly_kwh[lastYearMonth] 
            : null;

          if (monthlyKwh !== null && lastYearKwh !== null && lastYearKwh > 0) {
            yoyChangePct = ((monthlyKwh - lastYearKwh) / lastYearKwh) * 100;
          }
        }

        // Annual Total YTD
        let annualTotal = null;
        if (bSum.annual_totals && bSum.annual_totals[currentYear] !== undefined) {
          annualTotal = bSum.annual_totals[currentYear];
        }

        // Target Status (Simulated target baseline: average of previous year, or -5% reduction target)
        // Note: Real baseline uses previous year average if available
        let targetKwh = null;
        let targetStatus = 'no_target'; // 'achieved' | 'exceeded' | 'no_target'
        let targetVariancePct = null;

        if (currentMonth) {
          const [yr, mo] = currentMonth.split('-').map(Number);
          const prevYearStr = String(yr - 1);
          const prevYearAnnual = bSum.annual_totals && bSum.annual_totals[prevYearStr];
          if (prevYearAnnual && prevYearAnnual > 0) {
            targetKwh = (prevYearAnnual / 12) * 0.95; // 5% energy conservation target
            if (monthlyKwh !== null) {
              targetVariancePct = ((monthlyKwh - targetKwh) / targetKwh) * 100;
              targetStatus = monthlyKwh <= targetKwh ? 'achieved' : 'exceeded';
            }
          }
        }

        // Data Quality Status check from validation report
        let qualityStatus = 'normal'; // 'normal' | 'warning' | 'missing'
        let qualityNotes = [];
        if (monthlyKwh === null || monthlyKwh === 0) {
          qualityStatus = 'missing';
          qualityNotes.push('ไม่มีข้อมูลการอ่านค่าในรอบนี้');
        }

        // Check if any meter associated with this building has validation warnings
        if (this.validationData && this.validationData.warnings) {
          const mainM = bMap.metering && bMap.metering.main_meter_id;
          const warnFound = this.validationData.warnings.find(w => w.meter_id === mainM);
          if (warnFound) {
            qualityStatus = qualityStatus === 'missing' ? 'missing' : 'warning';
            qualityNotes.push(`พบการแจ้งเตือนมิเตอร์: ${warnFound.warning || 'ตรวจสอบค่า'}`);
          }
        }

        list.push({
          b_code: bCode,
          building_id: bCode,
          name: bMap.name,
          short_name: bMap.short_name,
          category: bMap.category,
          category_th: bMap.category_th,
          floors: bMap.floors,
          description: bMap.description,
          dimensions: bMap.dimensions,
          layout_position: bMap.layout_position,
          departments: bMap.departments || [],
          department_shares: bMap.department_shares || {},
          metering: bMap.metering || {},
          color_base: bMap.color_base,
          roof_type: bMap.roof_type,
          area_m2: bMap.area_m2, // Null as per dataset truth
          
          // Current calculated metrics
          monthly_kwh: monthlyKwh,
          mom_change_pct: momChangePct,
          yoy_change_pct: yoyChangePct,
          annual_total: annualTotal,
          target_kwh: targetKwh,
          target_status: targetStatus,
          target_variance_pct: targetVariancePct,
          quality_status: qualityStatus,
          quality_notes: qualityNotes,
          raw_summary: bSum
        });
      }

      return list;
    },

    // Color Calculation for 3D model
    getColorForBuilding(building, mode = null) {
      const activeMode = mode || this.state.colorMode;
      const kwh = building.monthly_kwh;

      // Missing / No Data
      if (kwh === null || kwh === undefined) {
        return {
          hex: '#718096', // Neutral Cool Gray
          css: 'rgb(113, 128, 150)',
          label: 'ไม่มีข้อมูลในรอบนี้'
        };
      }

      if (activeMode === 'total_kwh') {
        // High consumption -> Warm Red/Orange, Low -> Emerald Green
        // Dynamically scaled based on Sai Noi building consumption bands
        if (kwh >= 50000) return { hex: '#E53E3E', css: 'rgb(229, 62, 62)', label: '≥ 50,000 kWh (สูงมาก)' };
        if (kwh >= 20000) return { hex: '#DD6B20', css: 'rgb(221, 107, 32)', label: '20,000 – 49,999 kWh (สูง)' };
        if (kwh >= 8000)  return { hex: '#D69E2E', css: 'rgb(214, 158, 46)', label: '8,000 – 19,999 kWh (ปานกลาง)' };
        if (kwh >= 2000)  return { hex: '#319795', css: 'rgb(49, 151, 149)', label: '2,000 – 7,999 kWh (ต่ำ)' };
        return { hex: '#38A169', css: 'rgb(56, 161, 105)', label: '< 2,000 kWh (ต่ำมาก)' };
      }

      if (activeMode === 'mom_change') {
        const change = building.mom_change_pct;
        if (change === null) return { hex: '#A0AEC0', css: 'rgb(160, 174, 192)', label: 'ไม่มีข้อมูลเปรียบเทียบ' };
        if (change > 15)   return { hex: '#E53E3E', css: 'rgb(229, 62, 62)', label: 'เพิ่มขึ้น > +15%' };
        if (change > 5)    return { hex: '#DD6B20', css: 'rgb(221, 107, 32)', label: 'เพิ่มขึ้น +5% ถึง +15%' };
        if (change >= -5)  return { hex: '#CBD5E0', css: 'rgb(203, 213, 224)', label: 'คงที่ (±5%)' };
        if (change >= -15) return { hex: '#48BB78', css: 'rgb(72, 187, 120)', label: 'ลดลง -5% ถึง -15%' };
        return { hex: '#2F855A', css: 'rgb(47, 133, 90)', label: 'ลดลง > -15% (ประหยัดดีเยี่ยม)' };
      }

      if (activeMode === 'target_status') {
        if (building.target_status === 'achieved') {
          return { hex: '#38A169', css: 'rgb(56, 161, 105)', label: 'บรรลุเป้าหมายประหยัดพลังงาน' };
        }
        if (building.target_status === 'exceeded') {
          return { hex: '#E53E3E', css: 'rgb(229, 62, 62)', label: 'เกินเป้าหมายการใช้พลังงาน' };
        }
        return { hex: '#A0AEC0', css: 'rgb(160, 174, 192)', label: 'ยังไม่มีเป้าหมายอ้างอิง' };
      }

      if (activeMode === 'data_quality') {
        if (building.quality_status === 'missing') {
          return { hex: '#E53E3E', css: 'rgb(229, 62, 62)', label: 'ข้อมูลขาดหาย/ไม่ได้อ่านค่า' };
        }
        if (building.quality_status === 'warning') {
          return { hex: '#D69E2E', css: 'rgb(214, 158, 46)', label: 'มีข้อสังเกตการคำนวณ/ซ่อมมิเตอร์' };
        }
        return { hex: '#38A169', css: 'rgb(56, 161, 105)', label: 'ข้อมูลวัดจริงครบถ้วนสมบูรณ์' };
      }

      if (activeMode === 'energy_intensity') {
        // EUI kWh/m2
        return {
          hex: '#718096',
          css: 'rgb(113, 128, 150)',
          label: 'ยังไม่มีข้อมูลพื้นที่อาคารอ้างอิง (แสดงสีมาตรฐาน)'
        };
      }

      return { hex: building.color_base || '#4A5568', css: building.color_base || 'rgb(74, 85, 104)', label: 'ปกติ' };
    },

    // Get Active Color Mode Legend Configuration
    getLegendConfig(mode = null) {
      const activeMode = mode || this.state.colorMode;
      if (activeMode === 'total_kwh') {
        return {
          title: 'การใช้ไฟฟ้ารวม (kWh) ประจำรอบ',
          note: 'คำนวณจากมิเตอร์ประธาน (Main Meter) ป้องกันการนับซ้ำ',
          items: [
            { color: '#E53E3E', label: '≥ 50,000 kWh' },
            { color: '#DD6B20', label: '20,000 – 49,999 kWh' },
            { color: '#D69E2E', label: '8,000 – 19,999 kWh' },
            { color: '#319795', label: '2,000 – 7,999 kWh' },
            { color: '#38A169', label: '< 2,000 kWh' },
            { color: '#718096', label: 'ไม่มีข้อมูลในรอบนี้' }
          ]
        };
      }

      if (activeMode === 'mom_change') {
        return {
          title: 'การเปลี่ยนแปลงเทียบเดือนก่อนหน้า (% MoM)',
          note: 'คำนวณจาก (เดือนปัจจุบัน − เดือนก่อน) ÷ เดือนก่อน × 100',
          items: [
            { color: '#E53E3E', label: 'เพิ่มขึ้น > +15%' },
            { color: '#DD6B20', label: 'เพิ่มขึ้น +5% ถึง +15%' },
            { color: '#CBD5E0', label: 'คงที่ (±5%)' },
            { color: '#48BB78', label: 'ลดลง -5% ถึง -15%' },
            { color: '#2F855A', label: 'ลดลง > -15% (ประหยัดพลังงาน)' },
            { color: '#A0AEC0', label: 'ไม่มีข้อมูลเปรียบเทียบ' }
          ]
        };
      }

      if (activeMode === 'target_status') {
        return {
          title: 'ผลการดำเนินงานเทียบเป้าหมายการประหยัด',
          note: 'เกณฑ์ประหยัด 5% เทียบจากฐานเฉลี่ยรายเดือนปีก่อนหน้า',
          items: [
            { color: '#38A169', label: 'บรรลุเป้าหมาย (ใช้ไม่เกินเป้า)' },
            { color: '#E53E3E', label: 'เกินเป้าหมาย' },
            { color: '#A0AEC0', label: 'ยังไม่มีเป้าหมายอ้างอิง' },
            { color: '#718096', label: 'ไม่มีข้อมูลในรอบนี้' }
          ]
        };
      }

      if (activeMode === 'data_quality') {
        return {
          title: 'สถานะความสมบูรณ์และคุณภาพข้อมูล (Data Quality)',
          note: 'ตรวจสอบจาก Weekly Meter Readings และ Validation Report',
          items: [
            { color: '#38A169', label: 'ข้อมูลวัดจริงครบถ้วนสมบูรณ์' },
            { color: '#D69E2E', label: 'มีข้อสังเกตการคำนวณ / ซ่อมมิเตอร์' },
            { color: '#E53E3E', label: 'ข้อมูลขาดหาย / ไม่ได้อ่านค่า' }
          ]
        };
      }

      return {
        title: 'ความเข้มการใช้พลังงาน (kWh/m²)',
        note: '⚠️ ในระยะนำร่อง ยังไม่มีข้อมูลรังวัดพื้นที่อาคารจริง จึงแสดงสีปกติและไม่คำนวณสถิติสมมติ',
        items: [
          { color: '#718096', label: 'ยังไม่มีข้อมูลพื้นที่อาคารอ้างอิง' }
        ]
      };
    },

    // Export current filtered buildings to CSV with formula injection protection
    exportToCsv() {
      const buildings = this.getBuildingsList();
      const currentMonth = this.state.month;
      const currentYear = this.state.year;
      const dept = this.state.department;

      const headers = [
        'รหัสอาคาร (b_code)',
        'ชื่ออาคาร',
        'ประเภท',
        'จำนวนชั้น',
        'มิเตอร์ประธาน (Main Meter)',
        'ฝ่ายที่รับผิดชอบ',
        `ปริมาณใช้ไฟฟ้า ${currentMonth} (kWh)`,
        `ยอดสะสมปี ${currentYear} (kWh)`,
        'เปลี่ยนแปลงเทียบเดือนก่อน (%)',
        'สถานะเป้าหมาย',
        'คุณภาพข้อมูล',
        'วิธีการรวมข้อมูล',
        'หมายเหตุ'
      ];

      const rows = [headers.map(sanitizeCsvValue).join(',')];

      buildings.forEach((b) => {
        const row = [
          b.b_code,
          b.name,
          b.category_th,
          b.floors,
          b.metering.main_meter_id || 'N/A',
          b.departments.join(', ') || '-',
          b.monthly_kwh !== null ? b.monthly_kwh.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'ไม่มีข้อมูล',
          b.annual_total !== null ? b.annual_total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'ไม่มีข้อมูล',
          b.mom_change_pct !== null ? b.mom_change_pct.toFixed(2) + '%' : 'ไม่สามารถคำนวณได้',
          b.target_status === 'achieved' ? 'บรรลุเป้าหมาย' : (b.target_status === 'exceeded' ? 'เกินเป้าหมาย' : 'ไม่มีเป้าหมาย'),
          b.quality_status === 'normal' ? 'สมบูรณ์' : (b.quality_status === 'warning' ? 'มีข้อสังเกต' : 'ขาดหาย'),
          'วัดโดยตรงจากมิเตอร์ประธาน',
          'ภาพจำลองเชิงสัญลักษณ์ระยะนำร่อง'
        ];
        rows.push(row.map(sanitizeCsvValue).join(','));
      });

      const csvContent = '\uFEFF' + rows.join('\r\n'); // UTF-8 BOM
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Sainoi_Energy_Report_${currentMonth}_${dept}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  // Expose to window
  window.EnergyTwin = EnergyTwin;

})(window);
