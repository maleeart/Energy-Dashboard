/**
 * Sainoi Energy Dashboard & 3D Building Digital Twin - Core Engine
 * Data Layer, Calculation Layer, State Management, Allocation Manager, and Analytics
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
    // Loaded Raw Datasets
    mappingData: null,
    summaryData: null,
    validationData: null,
    fullEnergyDb: null,
    meaData: null,
    aliasData: null,
    eventLogs: [],
    allocationRows: [],
    customAllocations: null, // from localStorage

    // Active State
    state: {
      year: '2026',
      monthFrom: 1,           // 1-12
      monthTo: 12,           // 1-12 (defaults to full year matching index.html)
      month: '2026-06',      // backwards-compatibility
      week: '',
      department: 'ALL',
      colorMode: 'total_kwh', // total_kwh | mom_change | target_status | data_quality | energy_intensity
      visualMode: 'heatmap',  // heatmap | bars | flow
      theme: 'day',           // day | night
      selectedBuildingId: null,
      comparisonBuildings: [],
      qualityLevel: 'high',   // high | medium | low
      showLabels: true,
      showShadows: true,
      isPlayingTimeline: false,
      isKioskMode: false,
      viewMode: 'split'       // '3d' | 'split' | '2d'
    },

    // Listeners for state change
    subscribers: [],

    subscribe(callback) {
      if (typeof callback === 'function') {
        this.subscribers.push(callback);
      }
    },

    addListener(callback) {
      this.subscribe(callback);
    },

    get allocationData() {
      return this.customAllocations || this.allocationRows || [];
    },

    get currentBuildings() {
      return this.getBuildingsList();
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
      Object.assign(this.state, updates);
      if (updates.monthFrom !== undefined || updates.monthTo !== undefined || updates.year !== undefined) {
        const to = updates.monthTo !== undefined ? updates.monthTo : this.state.monthTo;
        const y = updates.year !== undefined ? updates.year : this.state.year;
        this.state.month = `${y}-${String(to).padStart(2, '0')}`;
      }
      this.notify(updates);
    },

    // Return list of active month strings 'YYYY-MM' within the selected range
    getActiveMonths() {
      const y = this.state.year || '2026';
      const from = Math.min(Math.max(Number(this.state.monthFrom) || 1, 1), 12);
      const to = Math.min(Math.max(Number(this.state.monthTo) || from, 1), 12);
      const start = Math.min(from, to);
      const end = Math.max(from, to);
      const months = [];
      for (let m = start; m <= end; m++) {
        months.push(`${y}-${String(m).padStart(2, '0')}`);
      }
      return months;
    },

    // Return list of previous year month strings 'YYYY-MM' for exact YoY comparison
    getPrevPeriodMonths() {
      const prevYear = String((Number(this.state.year) || 2026) - 1);
      const from = Math.min(Math.max(Number(this.state.monthFrom) || 1, 1), 12);
      const to = Math.min(Math.max(Number(this.state.monthTo) || from, 1), 12);
      const start = Math.min(from, to);
      const end = Math.max(from, to);
      const months = [];
      for (let m = start; m <= end; m++) {
        months.push(`${prevYear}-${String(m).padStart(2, '0')}`);
      }
      return months;
    },

    // Return formatted Thai period label
    getPeriodLabel() {
      const y = Number(this.state.year) || 2026;
      const yThai = y + 543;
      const from = Math.min(Math.max(Number(this.state.monthFrom) || 1, 1), 12);
      const to = Math.min(Math.max(Number(this.state.monthTo) || from, 1), 12);
      const start = Math.min(from, to);
      const end = Math.max(from, to);
      const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

      if (start === 1 && end === 12) {
        return `ทั้งปี ${yThai}`;
      }
      if (start === end) {
        return `${TH_MONTHS[start - 1]} ${yThai}`;
      }
      return `${TH_MONTHS[start - 1]} – ${TH_MONTHS[end - 1]} ${yThai}`;
    },

    // Grand Total and Target comparison strictly synchronized with index.html
    getCampusTotal() {
      const activeMonths = this.getActiveMonths();
      const prevMonths = this.getPrevPeriodMonths();
      const y = Number(this.state.year) || 2026;
      const selectedDept = this.state.department;

      let totalKwh = 0;
      let prevTotalKwh = 0;

      if (selectedDept === 'ALL' && this.summaryData && this.summaryData.campus_monthly_totals) {
        activeMonths.forEach(m => {
          totalKwh += (this.summaryData.campus_monthly_totals[m] || 0);
        });
        prevMonths.forEach(pm => {
          prevTotalKwh += (this.summaryData.campus_monthly_totals[pm] || 0);
        });
      } else if (selectedDept !== 'ALL' && this.summaryData && this.summaryData.department_monthly_totals && this.summaryData.department_monthly_totals[selectedDept]) {
        activeMonths.forEach(m => {
          totalKwh += (this.summaryData.department_monthly_totals[selectedDept][m] || 0);
        });
        prevMonths.forEach(pm => {
          prevTotalKwh += (this.summaryData.department_monthly_totals[selectedDept][pm] || 0);
        });
      } else {
        const buildings = this.getBuildingsList();
        buildings.forEach(b => {
          if (b.monthly_kwh !== null) totalKwh += b.monthly_kwh;
          if (b.prev_kwh !== null) prevTotalKwh += b.prev_kwh;
        });
      }

      const targetRate = (y === 2026 ? 8 : (y === 2025 ? 5 : 0));
      let diffPct = null;
      let savedPct = null;
      let targetStatus = 'no_target';

      if (prevTotalKwh > 0 && totalKwh > 0) {
        diffPct = ((totalKwh - prevTotalKwh) / prevTotalKwh) * 100;
        savedPct = -diffPct;
        targetStatus = (savedPct >= targetRate) ? 'achieved' : (savedPct >= 0 ? 'reduced_below_target' : 'exceeded');
      }

      return {
        totalKwh,
        prevTotalKwh,
        diffPct,
        savedPct,
        targetRate,
        targetStatus,
        periodLabel: this.getPeriodLabel(),
        monthsCount: activeMonths.length,
        activeMonths,
        year: y
      };
    },

    // Initialization: Load datasets concurrently
    async init(basePath = '') {
      try {
        const cleanBase = basePath.endsWith('/') ? basePath : (basePath ? basePath + '/' : '');

        // Fetch essential datasets in parallel
        const [mappingRes, summaryRes, aliasRes, eventRes, meaRes, allocRes, valRes] = await Promise.all([
          fetch(cleanBase + 'data/building_mapping.json').catch(() => null),
          fetch(cleanBase + 'data/building_energy_summary.json').catch(() => null),
          fetch(cleanBase + 'data/building_alias.json').catch(() => null),
          fetch(cleanBase + 'data/event_logs.json').catch(() => null),
          fetch(cleanBase + 'data/mea_data.json').catch(() => null),
          fetch(cleanBase + 'data/department_allocation_buildings.csv').catch(() => null),
          fetch(cleanBase + 'data/validation_report.json').catch(() => null)
        ]);

        if (mappingRes && mappingRes.ok) this.mappingData = await mappingRes.json();
        if (summaryRes && summaryRes.ok) this.summaryData = await summaryRes.json();
        if (aliasRes && aliasRes.ok) this.aliasData = await aliasRes.json();
        if (eventRes && eventRes.ok) this.eventLogs = await eventRes.json();
        if (meaRes && meaRes.ok) this.meaData = await meaRes.json();
        if (valRes && valRes.ok) this.validationData = await valRes.json();

        // Robust fallback: if fetch failed (e.g. CORS on file:///), use pre-bundled global
        if (!this.mappingData && window.SAINOI_BUILDING_MAPPING) {
          this.mappingData = window.SAINOI_BUILDING_MAPPING;
        }

        // Parse allocation CSV
        if (allocRes && allocRes.ok) {
          const csvText = await allocRes.text();
          this.parseAllocationCsv(csvText);
        }

        // Check for saved custom allocations in localStorage
        this.loadCustomAllocations();

        // Default year and month range (default to full year matching index.html)
        if (this.summaryData && this.summaryData.periods) {
          const months = this.summaryData.periods.months || [];
          if (months.length > 0) {
            const latestMonth = months[months.length - 1];
            this.state.year = latestMonth.substring(0, 4);
            this.state.monthFrom = 1;
            this.state.monthTo = 12;
            this.state.month = latestMonth;
          }
        }

        return true;
      } catch (err) {
        console.error('Failed to initialize EnergyTwin Core:', err);
        // Even if error, fallback to pre-bundled
        if (!this.mappingData && window.SAINOI_BUILDING_MAPPING) {
          this.mappingData = window.SAINOI_BUILDING_MAPPING;
        }
        return false;
      }
    },

    // Parse CSV Allocation data
    parseAllocationCsv(csvText) {
      this.allocationRows = [];
      const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length <= 1) return;

      const header = lines[0].split(',').map(h => h.trim());
      for (let i = 1; i < lines.length; i++) {
        // Handle quotes in CSV
        const row = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || lines[i].split(',');
        const cleanRow = row.map(cell => cell.replace(/^"(.*)"$/, '$1').trim());
        
        if (cleanRow.length >= 5) {
          this.allocationRows.push({
            source_row: cleanRow[0] || i,
            department: cleanRow[1] || '',
            allocation_ratio: parseFloat(cleanRow[2]) || 0,
            meter_id: cleanRow[3] || '',
            b_code: cleanRow[4] || '',
            floor: cleanRow[5] || '',
            subb_code: cleanRow[6] || '',
            building_name: cleanRow[7] || '',
            allocation_building_name: cleanRow[8] || cleanRow[7] || ''
          });
        }
      }
    },

    // Load custom allocations from localStorage and merge into mappingData
    loadCustomAllocations() {
      try {
        const saved = localStorage.getItem('sainoi_custom_allocations');
        if (saved) {
          this.customAllocations = JSON.parse(saved);
          this.applyAllocationsToMapping(this.customAllocations);
        }
      } catch (e) {
        console.warn('Could not load custom allocations from localStorage:', e);
      }
    },

    // Apply allocation rows into mappingData department_shares
    applyAllocationsToMapping(rows) {
      if (!this.mappingData || !this.mappingData.buildings) return;
      
      // Group by b_code
      const sharesByBuilding = {};
      rows.forEach(r => {
        if (!sharesByBuilding[r.b_code]) sharesByBuilding[r.b_code] = {};
        if (r.department && r.allocation_ratio > 0) {
          sharesByBuilding[r.b_code][r.department] = (sharesByBuilding[r.b_code][r.department] || 0) + r.allocation_ratio;
        }
      });

      for (const [bCode, shares] of Object.entries(sharesByBuilding)) {
        if (this.mappingData.buildings[bCode]) {
          this.mappingData.buildings[bCode].department_shares = shares;
          this.mappingData.buildings[bCode].departments = Object.keys(shares);
        }
      }
    },

    // Save custom allocations to localStorage
    saveCustomAllocations(updatedRows) {
      try {
        localStorage.setItem('sainoi_custom_allocations', JSON.stringify(updatedRows));
        this.customAllocations = updatedRows;
        this.applyAllocationsToMapping(updatedRows);
        this.notify('allocation_change');
        return true;
      } catch (e) {
        console.error('Failed to save allocations to localStorage:', e);
        return false;
      }
    },

    // Reset custom allocations to default CSV
    resetCustomAllocations() {
      localStorage.removeItem('sainoi_custom_allocations');
      this.customAllocations = null;
      if (this.allocationRows.length > 0) {
        this.applyAllocationsToMapping(this.allocationRows);
      }
      this.notify('allocation_change');
    },

    // Commit allocation CSV to GitHub repository via GitHub REST API
    async commitAllocationsToGithub(pat, commitMessage = 'Update department allocations via Allocation Manager') {
      if (!pat) throw new Error('กรุณาระบุ GitHub Personal Access Token (PAT)');
      const repo = 'maleeart/Energy-Dashboard';
      const path = 'data/department_allocation_buildings.csv';
      const apiUrl = `https://api.github.com/repos/${repo}/contents/${path}`;

      // 1. Get current file SHA
      const getRes = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${pat}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!getRes.ok) {
        throw new Error(`ไม่สามารถเข้าถึงไฟล์บน GitHub ได้ (HTTP ${getRes.status}) ตรวจสอบสิทธิ์ของ Token`);
      }

      const fileData = await getRes.json();
      const currentSha = fileData.sha;

      // 2. Generate new CSV text from current customAllocations or allocationRows
      const rows = this.customAllocations || this.allocationRows;
      const headers = ['source_row','department','allocation_ratio','meter_id','b_code','floor','subb_code','building_name','allocation_building_name'];
      const csvLines = [headers.join(',')];
      rows.forEach(r => {
        csvLines.push([
          r.source_row,
          sanitizeCsvValue(r.department),
          r.allocation_ratio,
          r.meter_id,
          r.b_code,
          r.floor,
          r.subb_code,
          sanitizeCsvValue(r.building_name),
          sanitizeCsvValue(r.allocation_building_name)
        ].join(','));
      });
      const newCsvContent = '\uFEFF' + csvLines.join('\r\n');

      // Base64 encode UTF-8
      const encodedContent = btoa(unescape(encodeURIComponent(newCsvContent)));

      // 3. Put commit
      const putRes = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${pat}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: commitMessage,
          content: encodedContent,
          sha: currentSha,
          branch: 'main'
        })
      });

      if (!putRes.ok) {
        const errJson = await putRes.json().catch(() => ({}));
        throw new Error(`การบันทึกขึ้น GitHub ล้มเหลว: ${errJson.message || putRes.statusText}`);
      }

      // 4. Trigger GitHub Actions workflow dispatch if available
      try {
        await fetch(`https://api.github.com/repos/${repo}/actions/workflows/build-energy-db.yml/dispatches`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${pat}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ ref: 'main' })
        });
      } catch (_) {
        // Dispatch is secondary; file commit already triggers push event
      }

      return await putRes.json();
    },

    // Fetch commit history for allocation CSV
    async fetchAllocationCommitHistory(pat = '') {
      const repo = 'maleeart/Energy-Dashboard';
      const path = 'data/department_allocation_buildings.csv';
      const url = `https://api.github.com/repos/${repo}/commits?path=${path}&per_page=10`;
      const headers = { 'Accept': 'application/vnd.github.v3+json' };
      if (pat) headers['Authorization'] = `Bearer ${pat}`;

      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error('ไม่สามารถดึงประวัติ Commit ได้');
      return await res.json();
    },

    // Background loader for full energy_db.json
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

    // Get list of all buildings with current calculated metrics for the selected period
    getBuildingsList() {
      if (!this.mappingData || !this.mappingData.buildings) return [];
      const mBuildings = this.mappingData.buildings;
      const sBuildings = (this.summaryData && this.summaryData.buildings) || {};

      const activeMonths = this.getActiveMonths();
      const prevMonths = this.getPrevPeriodMonths();
      const currentYear = this.state.year || '2026';
      const currentYearNum = parseInt(currentYear, 10) || 2026;
      const selectedDept = this.state.department;
      const targetRate = (currentYearNum === 2026 ? 8 : (currentYearNum === 2025 ? 5 : 0));

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
        let deptShareRatio = 1.0;
        if (selectedDept !== 'ALL' && bMap.department_shares && bMap.department_shares[selectedDept]) {
          deptShareRatio = bMap.department_shares[selectedDept];
        }

        // 1. Current Period kWh
        let periodKwh = 0;
        let hasPeriodData = false;
        activeMonths.forEach(m => {
          if (selectedDept === 'ALL') {
            if (bSum.monthly_kwh && bSum.monthly_kwh[m] !== undefined) {
              periodKwh += bSum.monthly_kwh[m];
              hasPeriodData = true;
            }
          } else {
            if (bSum.monthly_by_dept && bSum.monthly_by_dept[m] && bSum.monthly_by_dept[m][selectedDept] !== undefined) {
              periodKwh += bSum.monthly_by_dept[m][selectedDept];
              hasPeriodData = true;
            } else if (bSum.monthly_kwh && bSum.monthly_kwh[m] !== undefined && deptShareRatio > 0) {
              periodKwh += bSum.monthly_kwh[m] * deptShareRatio;
              hasPeriodData = true;
            }
          }
        });
        if (!hasPeriodData) periodKwh = null;

        // 2. Previous Period kWh (YoY baseline)
        let prevPeriodKwh = 0;
        let hasPrevData = false;
        prevMonths.forEach(pm => {
          if (selectedDept === 'ALL') {
            if (bSum.monthly_kwh && bSum.monthly_kwh[pm] !== undefined) {
              prevPeriodKwh += bSum.monthly_kwh[pm];
              hasPrevData = true;
            }
          } else {
            if (bSum.monthly_by_dept && bSum.monthly_by_dept[pm] && bSum.monthly_by_dept[pm][selectedDept] !== undefined) {
              prevPeriodKwh += bSum.monthly_by_dept[pm][selectedDept];
              hasPrevData = true;
            } else if (bSum.monthly_kwh && bSum.monthly_kwh[pm] !== undefined && deptShareRatio > 0) {
              prevPeriodKwh += bSum.monthly_kwh[pm] * deptShareRatio;
              hasPrevData = true;
            }
          }
        });
        if (!hasPrevData) prevPeriodKwh = null;

        // 3. YoY Change %
        let yoyChangePct = null;
        if (periodKwh !== null && prevPeriodKwh !== null && prevPeriodKwh > 0) {
          yoyChangePct = ((periodKwh - prevPeriodKwh) / prevPeriodKwh) * 100;
        }

        // 4. MoM / Immediate Preceding Period Change %
        let momChangePct = null;
        if (activeMonths.length === 1) {
          // Single month: MoM comparison vs prior month
          const [yr, mo] = activeMonths[0].split('-').map(Number);
          const prevDate = new Date(yr, mo - 2, 1);
          const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
          let prevMonthKwh = null;
          if (selectedDept === 'ALL') {
            if (bSum.monthly_kwh && bSum.monthly_kwh[prevMonth] !== undefined) prevMonthKwh = bSum.monthly_kwh[prevMonth];
          } else {
            if (bSum.monthly_by_dept && bSum.monthly_by_dept[prevMonth] && bSum.monthly_by_dept[prevMonth][selectedDept] !== undefined) {
              prevMonthKwh = bSum.monthly_by_dept[prevMonth][selectedDept];
            } else if (bSum.monthly_kwh && bSum.monthly_kwh[prevMonth] !== undefined) {
              prevMonthKwh = bSum.monthly_kwh[prevMonth] * deptShareRatio;
            }
          }
          if (periodKwh !== null && prevMonthKwh !== null && prevMonthKwh > 0) {
            momChangePct = ((periodKwh - prevMonthKwh) / prevMonthKwh) * 100;
          }
        } else {
          // Range mode: use YoY change % as representative trend
          momChangePct = yoyChangePct;
        }

        // 5. Annual Total
        let annualTotal = null;
        if (selectedDept === 'ALL') {
          if (bSum.annual_totals && bSum.annual_totals[currentYear] !== undefined) {
            annualTotal = bSum.annual_totals[currentYear];
          }
        } else {
          let deptAnn = 0;
          let hasAnn = false;
          for (let m = 1; m <= 12; m++) {
            const ym = `${currentYear}-${String(m).padStart(2, '0')}`;
            if (bSum.monthly_by_dept && bSum.monthly_by_dept[ym] && bSum.monthly_by_dept[ym][selectedDept] !== undefined) {
              deptAnn += bSum.monthly_by_dept[ym][selectedDept];
              hasAnn = true;
            } else if (bSum.monthly_kwh && bSum.monthly_kwh[ym] !== undefined && deptShareRatio > 0) {
              deptAnn += bSum.monthly_kwh[ym] * deptShareRatio;
              hasAnn = true;
            }
          }
          if (hasAnn) annualTotal = deptAnn;
        }

        // 6. Target Status (Reduction target: -8% in 2026, -5% in 2025)
        let targetKwh = null;
        let targetStatus = 'no_target'; // 'achieved' | 'exceeded' | 'no_target'
        let targetVariancePct = null;

        if (prevPeriodKwh !== null && prevPeriodKwh > 0) {
          targetKwh = prevPeriodKwh * (1 - targetRate / 100);
          if (periodKwh !== null) {
            targetVariancePct = ((periodKwh - targetKwh) / targetKwh) * 100;
            targetStatus = periodKwh <= targetKwh ? 'achieved' : 'exceeded';
          }
        }

        // 7. Data Quality Status
        let qualityStatus = 'normal'; // 'normal' | 'warning' | 'missing'
        let qualityNotes = [];
        if (periodKwh === null || periodKwh === 0) {
          qualityStatus = 'missing';
          qualityNotes.push('ไม่มีข้อมูลการอ่านค่าในช่วงนี้');
        }

        if (this.validationData && this.validationData.warnings) {
          const mainM = bMap.metering && bMap.metering.main_meter_id;
          const warnFound = this.validationData.warnings.find(w => w.meter_id === mainM);
          if (warnFound) {
            qualityStatus = qualityStatus === 'missing' ? 'missing' : 'warning';
            qualityNotes.push(`ข้อสังเกตมิเตอร์: ${warnFound.warning || 'ตรวจสอบค่า'}`);
          }
        }

        // Look up building aliases
        const aliases = this.getBuildingAliases(bCode);

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
          rotation_y: bMap.rotation_y || 0,
          departments: bMap.departments || [],
          department_shares: bMap.department_shares || {},
          metering: bMap.metering || {},
          color_base: bMap.color_base,
          roof_type: bMap.roof_type,
          area_m2: bMap.area_m2,
          aliases: aliases,
          
          // Current calculated metrics
          monthly_kwh: periodKwh,
          prev_kwh: prevPeriodKwh,
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

    // Get aliases for a building from building_alias.json
    getBuildingAliases(bCode) {
      if (!this.aliasData) return [];
      const aliases = new Set();
      const codePattern = new RegExp(`\\b${bCode.replace('.', '\\.')}\\b`, 'i');
      
      for (const [aliasKey, aliasVal] of Object.entries(this.aliasData)) {
        if (codePattern.test(aliasKey) || codePattern.test(aliasVal)) {
          if (aliasKey.trim() !== aliasVal.trim()) {
            aliases.add(aliasKey.trim());
          }
          aliases.add(aliasVal.trim());
        }
      }
      return Array.from(aliases);
    },

    // Get event logs relevant to active period
    getEventLogs(periodStr = null) {
      if (!this.eventLogs || this.eventLogs.length === 0) return [];
      if (!periodStr) return this.eventLogs;

      // Filter events by year-month
      return this.eventLogs.filter(e => e.date && e.date.startsWith(periodStr.substring(0, 7)));
    },

    // Compare Internal Meter Sum vs MEA Monthly Bills (data/mea_data.json)
    getMeaComparison(periodStr = null) {
      if (!this.meaData) return null;

      const activeMonths = periodStr ? [periodStr] : this.getActiveMonths();
      if (activeMonths.length === 0) return null;

      // 1. Calculate campus total from internal primary main meters
      const buildings = this.getBuildingsList();
      let campusTotalKwh = 0;
      buildings.forEach(b => {
        if (b.monthly_kwh) campusTotalKwh += b.monthly_kwh;
      });

      // 2. Lookup MEA bill for the active months
      let totalMeaKwh = 0;
      let hasMea = false;
      activeMonths.forEach(m => {
        const [yr, mo] = m.split('-').map(Number);
        const yearStr = String(yr);
        const monthIdx = mo - 1;
        if (this.meaData[yearStr] && this.meaData[yearStr][monthIdx] !== undefined && this.meaData[yearStr][monthIdx] !== null) {
          totalMeaKwh += this.meaData[yearStr][monthIdx];
          hasMea = true;
        }
      });

      if (!hasMea || totalMeaKwh === 0) {
        return {
          month: this.getPeriodLabel(),
          campusTotalKwh,
          meaKwh: null,
          unaccountedKwh: null,
          unaccountedPct: null,
          status: 'no_mea_data'
        };
      }

      const unaccountedKwh = totalMeaKwh - campusTotalKwh;
      const unaccountedPct = (unaccountedKwh / totalMeaKwh) * 100;
      const status = Math.abs(unaccountedPct) <= 5.0 ? 'balanced' : (unaccountedPct > 5.0 ? 'loss_warning' : 'meter_discrepancy');

      return {
        month: this.getPeriodLabel(),
        campusTotalKwh,
        meaKwh: totalMeaKwh,
        unaccountedKwh,
        unaccountedPct,
        status
      };
    },

    // Active alert calculation (Over-target, MoM surge, missing data)
    getActiveAlerts() {
      const buildings = this.getBuildingsList();
      const alerts = [];

      buildings.forEach(b => {
        // Critical: Exceeded target by > 10%
        if (b.target_status === 'exceeded' && b.target_variance_pct !== null && b.target_variance_pct > 10) {
          alerts.push({
            id: `alert-target-${b.b_code}`,
            b_code: b.b_code,
            b_name: b.name,
            type: 'critical',
            icon: '🚨',
            title: `${b.short_name} ใช้ไฟเกินเป้าหมาย ${b.target_variance_pct.toFixed(1)}%`,
            message: `การใช้ไฟจริง ${b.monthly_kwh.toLocaleString('th-TH', {maximumFractionDigits:1})} kWh (เป้าหมาย ${b.target_kwh.toLocaleString('th-TH', {maximumFractionDigits:1})} kWh)`,
            value: b.target_variance_pct
          });
        }

        // Warning: Month-over-Month surge > 20%
        if (b.mom_change_pct !== null && b.mom_change_pct > 20) {
          alerts.push({
            id: `alert-surge-${b.b_code}`,
            b_code: b.b_code,
            b_name: b.name,
            type: 'warning',
            icon: '⚠️',
            title: `${b.short_name} อัตราการใช้ไฟพุ่งสูงขึ้น +${b.mom_change_pct.toFixed(1)}% MoM`,
            message: `เทียบกับเดือนก่อนหน้า ควรตรวจสอบอุปกรณ์ปรับอากาศหรือเครื่องจักรทำงานต่อเนื่อง`,
            value: b.mom_change_pct
          });
        }

        // Info: Missing / zero reading
        if (b.quality_status === 'missing') {
          alerts.push({
            id: `alert-missing-${b.b_code}`,
            b_code: b.b_code,
            b_name: b.name,
            type: 'info',
            icon: 'ℹ️',
            title: `${b.short_name} ยังไม่มีข้อมูลการอ่านค่า`,
            message: `มิเตอร์ประธาน ${b.metering.main_meter_id || '-'} ไม่พบรายการบันทึกในรอบนี้`,
            value: 0
          });
        }
      });

      return alerts;
    },

    // Get color code and hex for a building according to active colorMode
    getColorForBuilding(bData) {
      const mode = this.state.colorMode;
      const count = this.getActiveMonths().length || 1;

      if (mode === 'total_kwh') {
        const val = bData.monthly_kwh;
        if (val === null || val === undefined) return { hex: '#94A3B8', label: 'ไม่มีข้อมูล' };
        if (val > 50000 * count) return { hex: '#EF4444', label: `> ${(50000 * count).toLocaleString()} kWh` };
        if (val > 25000 * count) return { hex: '#F97316', label: `${(25000 * count).toLocaleString()} - ${(50000 * count).toLocaleString()} kWh` };
        if (val > 10000 * count) return { hex: '#F59E0B', label: `${(10000 * count).toLocaleString()} - ${(25000 * count).toLocaleString()} kWh` };
        if (val > 3000 * count)  return { hex: '#10B981', label: `${(3000 * count).toLocaleString()} - ${(10000 * count).toLocaleString()} kWh` };
        return { hex: '#3B82F6', label: `< ${(3000 * count).toLocaleString()} kWh` };
      }

      if (mode === 'mom_change') {
        const mom = bData.mom_change_pct;
        if (mom === null || mom === undefined) return { hex: '#94A3B8', label: 'ไม่สามารถคำนวณ' };
        if (mom > 15)  return { hex: '#EF4444', label: 'เพิ่มขึ้น > 15%' };
        if (mom > 5)   return { hex: '#F59E0B', label: 'เพิ่มขึ้น 5% ถึง 15%' };
        if (mom >= -5) return { hex: '#3B82F6', label: 'คงที่ (±5%)' };
        return { hex: '#10B981', label: 'ลดลง > 5%' };
      }

      if (mode === 'target_status') {
        const st = bData.target_status;
        if (st === 'achieved') return { hex: '#10B981', label: 'บรรลุเป้าหมายการประหยัด' };
        if (st === 'exceeded') return { hex: '#EF4444', label: 'ใช้ไฟเกินเป้าหมาย' };
        return { hex: '#94A3B8', label: 'ไม่มีข้อมูลอ้างอิงปีก่อน' };
      }

      if (mode === 'data_quality') {
        const q = bData.quality_status;
        if (q === 'normal')  return { hex: '#10B981', label: 'ข้อมูลสมบูรณ์' };
        if (q === 'warning') return { hex: '#F59E0B', label: 'มีข้อสังเกต' };
        return { hex: '#EF4444', label: 'ข้อมูลขาดหาย' };
      }

      return { hex: '#64748B', label: 'ค่าปกติ' };
    },

    // Legend definitions
    getLegendConfig() {
      const mode = this.state.colorMode;
      const count = this.getActiveMonths().length || 1;
      const periodLabel = this.getPeriodLabel();

      if (mode === 'total_kwh') {
        const note = count > 1 
          ? `แสดงผลรวม ${count} เดือน (เกณฑ์สัดส่วนเทียบเคียง > ${(50000).toLocaleString()} kWh/เดือน)`
          : 'คำนวณจากมิเตอร์ประธานและสัดส่วนจัดสรร';
        return {
          title: `การใช้ไฟฟ้ารวม (${periodLabel})`,
          note: note,
          items: [
            { color: '#EF4444', label: `> ${(50000 * count).toLocaleString()} kWh` },
            { color: '#F97316', label: `${(25000 * count).toLocaleString()} - ${(50000 * count).toLocaleString()} kWh` },
            { color: '#F59E0B', label: `${(10000 * count).toLocaleString()} - ${(25000 * count).toLocaleString()} kWh` },
            { color: '#10B981', label: `${(3000 * count).toLocaleString()} - ${(10000 * count).toLocaleString()} kWh` },
            { color: '#3B82F6', label: `< ${(3000 * count).toLocaleString()} kWh` },
            { color: '#94A3B8', label: 'ไม่มีข้อมูลการอ่านค่า' }
          ]
        };
      }
      if (mode === 'mom_change') {
        const isRange = count > 1;
        return {
          title: isRange ? 'การเปลี่ยนแปลงเทียบช่วงเดียวกันปีก่อน (% YoY)' : 'การเปลี่ยนแปลงเทียบเดือนก่อน (% MoM)',
          note: isRange ? 'เปรียบเทียบปริมาณการใช้ไฟฟ้ากับช่วงเดียวกันของปีก่อนหน้า' : 'เทียบกับปริมาณการใช้ไฟฟ้าในเดือนก่อนหน้า',
          items: [
            { color: '#EF4444', label: 'เพิ่มขึ้น > +15%' },
            { color: '#F59E0B', label: 'เพิ่มขึ้น +5% ถึง +15%' },
            { color: '#3B82F6', label: 'คงที่ (±5%)' },
            { color: '#10B981', label: 'ประหยัดลง > -5%' }
          ]
        };
      }
      if (mode === 'target_status') {
        const currentYearNum = parseInt(this.state.year, 10) || 2026;
        const targetRate = currentYearNum === 2026 ? 8 : (currentYearNum === 2025 ? 5 : 0);
        return {
          title: `สถานะเทียบเป้าหมายการประหยัด (Target ${targetRate}%)`,
          note: `เปรียบเทียบกับเกณฑ์เป้าหมายลดลง ${targetRate}% เทียบช่วงเดียวกันปีก่อน`,
          items: [
            { color: '#10B981', label: `บรรลุเป้าหมาย (ลดลงตามเป้า)` },
            { color: '#EF4444', label: 'เกินเป้าหมาย (ใช้สูงกว่าเป้า)' },
            { color: '#94A3B8', label: 'ไม่มีข้อมูลเปรียบเทียบปีก่อนหน้า' }
          ]
        };
      }
      if (mode === 'data_quality') {
        return {
          title: 'สถานะคุณภาพข้อมูล (Data Quality)',
          note: 'ตรวจสอบจากตาราง Weekly Readings & Validation',
          items: [
            { color: '#10B981', label: 'ข้อมูลวัดจริงครบถ้วนสมบูรณ์' },
            { color: '#F59E0B', label: 'มีข้อสังเกตการคำนวณ / ตรวจสอบ' },
            { color: '#EF4444', label: 'ข้อมูลขาดหาย / ไม่ได้อ่านค่า' }
          ]
        };
      }
      return {
        title: 'ความเข้มการใช้พลังงาน (kWh/m²)',
        note: '⚠️ อยู่ระหว่างการสำรวจรังวัดพื้นที่อาคารจริง',
        items: [{ color: '#64748B', label: 'ยังไม่มีข้อมูลพื้นที่อาคารอ้างอิง' }]
      };
    },

    // Generate monthly executive report data
    generateMonthlyReport(periodStr = null) {
      const period = periodStr || this.state.month;
      const buildings = this.getBuildingsList();

      let totalKwh = 0;
      let totalTargetKwh = 0;
      let prevTotalKwh = 0;
      const deptTotals = {};

      const months = (this.summaryData.periods && this.summaryData.periods.months) || [];
      const curIdx = months.indexOf(period);
      const prevPeriod = curIdx > 0 ? months[curIdx - 1] : null;

      buildings.forEach(b => {
        const kwh = b.monthly_kwh || 0;
        totalKwh += kwh;
        if (b.target_kwh) totalTargetKwh += b.target_kwh;

        (b.departments || []).forEach(d => {
          deptTotals[d] = (deptTotals[d] || 0) + (kwh / (b.departments.length || 1));
        });

        if (prevPeriod && b.raw_summary && b.raw_summary.monthly_kwh) {
          prevTotalKwh += (b.raw_summary.monthly_kwh[prevPeriod] || 0);
        }
      });

      const targetVariancePct = totalTargetKwh > 0 ? ((totalKwh - totalTargetKwh) / totalTargetKwh) * 100 : null;
      const momChangePct = prevTotalKwh > 0 ? ((totalKwh - prevTotalKwh) / prevTotalKwh) * 100 : null;

      const topConsumers = [...buildings]
        .sort((a, b) => (b.monthly_kwh || 0) - (a.monthly_kwh || 0))
        .slice(0, 5)
        .map(b => ({
          b_code: b.b_code,
          name: b.name,
          short_name: b.short_name,
          category_th: b.category_th,
          kwh: b.monthly_kwh || 0,
          pctOfTotal: totalKwh > 0 ? ((b.monthly_kwh || 0) / totalKwh) * 100 : 0
        }));

      const activeAlerts = this.getActiveAlerts();

      return {
        period,
        totalKwh,
        totalTargetKwh,
        targetVariancePct,
        momChangePct,
        deptTotals,
        topConsumers,
        alertsCount: activeAlerts.length,
        alerts: activeAlerts
      };
    },

    // Export current filtered buildings to CSV with formula injection protection
    exportToCsv() {
      const buildings = this.getBuildingsList();
      const periodLabel = this.getPeriodLabel();
      const currentYear = this.state.year;
      const dept = this.state.department;

      const headers = [
        'รหัสอาคาร (b_code)',
        'ชื่ออาคารทางการ',
        'ชื่อเรียกย่อ',
        'ประเภทอาคาร',
        'จำนวนชั้น',
        'มิเตอร์ประธาน (Main Meter)',
        'ฝ่ายที่รับผิดชอบ',
        `ปริมาณใช้ไฟฟ้า (${periodLabel}) (kWh)`,
        `ยอดสะสมปี ${currentYear} (kWh)`,
        'เปลี่ยนแปลงเทียบช่วงเดียวกันปีก่อน (%)',
        'สถานะเป้าหมาย',
        'คุณภาพข้อมูล'
      ];

      const rows = [headers.map(sanitizeCsvValue).join(',')];

      buildings.forEach((b) => {
        const row = [
          b.b_code,
          b.name,
          b.short_name,
          b.category_th,
          b.floors,
          b.metering.main_meter_id || 'N/A',
          b.departments.join(', ') || '-',
          b.monthly_kwh !== null ? b.monthly_kwh.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'ไม่มีข้อมูล',
          b.annual_total !== null ? b.annual_total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'ไม่มีข้อมูล',
          b.yoy_change_pct !== null ? b.yoy_change_pct.toFixed(2) + '%' : (b.mom_change_pct !== null ? b.mom_change_pct.toFixed(2) + '%' : 'ไม่สามารถคำนวณได้'),
          b.target_status === 'achieved' ? 'บรรลุเป้าหมาย' : (b.target_status === 'exceeded' ? 'เกินเป้าหมาย' : 'ไม่มีเป้าหมาย'),
          b.quality_status === 'normal' ? 'สมบูรณ์' : (b.quality_status === 'warning' ? 'มีข้อสังเกต' : 'ขาดหาย')
        ];
        rows.push(row.map(sanitizeCsvValue).join(','));
      });

      const csvContent = '\uFEFF' + rows.join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      const cleanLabel = periodLabel.replace(/[\s\–\/]/g, '_');
      link.setAttribute('download', `Sainoi_Energy_Report_${cleanLabel}_${dept}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  window.EnergyTwin = EnergyTwin;

})(window);
