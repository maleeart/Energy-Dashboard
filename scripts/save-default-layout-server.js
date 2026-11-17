/**
 * Local Bridge Server for Saving Campus Layout as System Default
 * Overwrites data/building_mapping.json, data/building_mapping.js,
 * data/sainoi_campus_layout.csv, data/campus_layout_default.json,
 * and scripts/energy-twin-core.js defaults.
 * Listens on 0.0.0.0 so other devices on LAN can sync and save layouts.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3333;
const ROOT = path.resolve(__dirname, '..');

const server = http.createServer((req, res) => {
  // CORS Headers allowing any origin on LAN
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cache-Control');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const reqPath = (req.url || '').split('?')[0];

  if (reqPath === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
    return;
  }

  if (reqPath === '/api/get-default-layout' && req.method === 'GET') {
    const defaultJsonPath = path.join(ROOT, 'data', 'campus_layout_default.json');
    if (fs.existsSync(defaultJsonPath)) {
      const content = fs.readFileSync(defaultJsonPath, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(content);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'campus_layout_default.json not found' }));
    }
    return;
  }

  if (reqPath === '/api/save-default-layout' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const result = applyDefaultLayout(payload);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          message: 'บันทึกผังปัจจุบันเป็นค่า Default ของระบบถาวรเรียบร้อยแล้ว!',
          updated: result,
          updated_at: new Date().toISOString()
        }));
      } catch (err) {
        console.error('Error saving default layout:', err);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

function applyDefaultLayout(payload) {
  const { buildings, roads, water, landmarks, bounds } = payload;
  const updatedFiles = [];

  // 1. Update data/campus_layout_default.json (full layout state)
  const defaultJsonPath = path.join(ROOT, 'data', 'campus_layout_default.json');
  try {
    let base = {};
    if (fs.existsSync(defaultJsonPath)) {
      try { base = JSON.parse(fs.readFileSync(defaultJsonPath, 'utf8')); } catch (_) {}
    }
    const fullLayout = {
      version: payload.version || base.version || '2026.11.13',
      updated_at: new Date().toISOString(),
      bounds: bounds || payload.bounds || base.bounds || { minX: -210, maxX: 180, minZ: -220, maxZ: 140 },
      buildings: buildings || payload.buildings || base.buildings || {},
      roads: roads || payload.roads || base.roads || {},
      water: water || payload.water || base.water || {},
      landmarks: landmarks || payload.landmarks || base.landmarks || {}
    };
    fs.writeFileSync(defaultJsonPath, JSON.stringify(fullLayout, null, 2), 'utf8');
    updatedFiles.push('campus_layout_default.json');
  } catch (err) {
    console.warn('Failed to write campus_layout_default.json:', err);
  }

  // 2. Update data/building_mapping.json
  const mappingJsonPath = path.join(ROOT, 'data', 'building_mapping.json');
  if (fs.existsSync(mappingJsonPath) && buildings) {
    const raw = fs.readFileSync(mappingJsonPath, 'utf8');
    const mapping = JSON.parse(raw);
    let updatedCount = 0;

    Object.entries(buildings).forEach(([bid, b]) => {
      if (mapping.buildings && mapping.buildings[bid]) {
        const target = mapping.buildings[bid];
        if (!target.layout_position) target.layout_position = { x: 0, y: 0, z: 0 };
        const pos = b.layout_position || { x: b.x, z: b.z };
        if (pos.x !== undefined) target.layout_position.x = Number(pos.x);
        if (pos.z !== undefined) target.layout_position.z = Number(pos.z);
        target.layout_position.y = 0;
        if (b.rotation_y !== undefined) target.rotation_y = Number(b.rotation_y);
        if (b.hidden !== undefined) target.hidden = Boolean(b.hidden);

        // Update building dimensions (width, depth, height)
        if (b.dimensions) {
          if (!target.dimensions) target.dimensions = {};
          if (b.dimensions.width !== undefined && !isNaN(Number(b.dimensions.width))) {
            target.dimensions.width = Number(b.dimensions.width);
          }
          if (b.dimensions.depth !== undefined && !isNaN(Number(b.dimensions.depth))) {
            target.dimensions.depth = Number(b.dimensions.depth);
          }
          if (b.dimensions.height !== undefined && !isNaN(Number(b.dimensions.height))) {
            target.dimensions.height = Number(b.dimensions.height);
          }
        }

        updatedCount++;
      }
    });

    mapping.generated_at = new Date().toISOString();
    fs.writeFileSync(mappingJsonPath, JSON.stringify(mapping, null, 2), 'utf8');
    updatedFiles.push(`building_mapping.json (${updatedCount} buildings)`);

    // 3. Update data/building_mapping.js
    const mappingJsPath = path.join(ROOT, 'data', 'building_mapping.js');
    const jsContent = `/**\n * Sai Noi Campus Building Mapping Data (Pre-bundled)\n * Auto-generated: ${new Date().toISOString()}\n */\nwindow.SAINOI_BUILDING_MAPPING = ${JSON.stringify(mapping, null, 2)};\n`;
    fs.writeFileSync(mappingJsPath, jsContent, 'utf8');
    updatedFiles.push('building_mapping.js');
  }

  // 4. Update data/sainoi_campus_layout.csv
  const layoutCsvPath = path.join(ROOT, 'data', 'sainoi_campus_layout.csv');
  if (fs.existsSync(layoutCsvPath) && buildings) {
    const csvLines = ['Building_Code,Building_Name,Category,Zone,X_Coord,Z_Coord,Y_Coord,Rotation_Y,Rotation_Deg,Is_Hidden,Width,Depth,Height'];
    Object.entries(buildings).forEach(([bid, b]) => {
      const pos = b.layout_position || { x: b.x, z: b.z };
      const rotRad = Number(b.rotation_y) || 0;
      const rotDeg = Math.round(((rotRad * 180 / Math.PI) % 360 + 360) % 360);
      const name = b.name || b.short_name || bid;
      const cat = b.category_th || b.category || 'อาคาร';
      const zone = b.zone || 'กลาง';
      const hidden = b.hidden ? 1 : 0;
      const w = b.dimensions?.width ?? 20;
      const d = b.dimensions?.depth ?? 20;
      const h = b.dimensions?.height ?? 10;
      csvLines.push(`"${bid}","${name}","${cat}","${zone}",${pos.x},${pos.z},0,${rotRad.toFixed(4)},${rotDeg},${hidden},${w},${d},${h}`);
    });
    fs.writeFileSync(layoutCsvPath, '\uFEFF' + csvLines.join('\r\n'), 'utf8');
    updatedFiles.push('sainoi_campus_layout.csv');
  }

  // 5. Update defaultRoads, defaultWater, defaultLandmarks, defaultBounds in scripts/energy-twin-core.js
  const coreJsPath = path.join(ROOT, 'scripts', 'energy-twin-core.js');
  if (fs.existsSync(coreJsPath)) {
    let coreCode = fs.readFileSync(coreJsPath, 'utf8');

    // Replace defaultRoads
    if (roads) {
      const cleanRoads = {};
      Object.entries(roads).forEach(([rid, r]) => {
        cleanRoads[rid] = {
          name: r.name || rid,
          x: Number(r.x) || 0,
          z: Number(r.z) || 0,
          width: Number(r.width) || 12,
          length: Number(r.length) || 60,
          category: r.category || 'ถนน',
          rotation_y: Number(r.rotation_y) || 0,
          hidden: Boolean(r.hidden)
        };
      });
      const roadsStr = JSON.stringify(cleanRoads, null, 6);
      coreCode = coreCode.replace(
        /defaultRoads:\s*\{[\s\S]*?\},\s*(?:\/\/[^\n]*\n\s*)?roads:/,
        `defaultRoads: ${roadsStr},\n    roads:`
      );
      updatedFiles.push(`defaultRoads (${Object.keys(cleanRoads).length} roads)`);
    }

    // Replace defaultWater
    if (water) {
      const cleanWater = {};
      Object.entries(water).forEach(([wid, w]) => {
        cleanWater[wid] = {
          name: w.name || wid,
          x: Number(w.x) || 0,
          z: Number(w.z) || 0,
          width: Number(w.width) || 20,
          depth: Number(w.depth) || 20,
          category: w.category || 'สระน้ำ',
          rotation_y: Number(w.rotation_y) || 0,
          hidden: Boolean(w.hidden)
        };
      });
      const waterStr = JSON.stringify(cleanWater, null, 6);
      coreCode = coreCode.replace(
        /defaultWater:\s*\{[\s\S]*?\},\s*water:/,
        `defaultWater: ${waterStr},\n    water:`
      );
      updatedFiles.push(`defaultWater (${Object.keys(cleanWater).length} water bodies)`);
    }

    // Replace defaultLandmarks
    if (landmarks) {
      const cleanLandmarks = {};
      Object.entries(landmarks).forEach(([lid, l]) => {
        cleanLandmarks[lid] = {
          name: l.name || lid,
          x: Number(l.x) || 0,
          z: Number(l.z) || 0,
          category: l.category || 'แลนด์มาร์ค',
          rotation_y: Number(l.rotation_y) || 0,
          hidden: Boolean(l.hidden)
        };
        if (l.width !== undefined && !isNaN(Number(l.width))) cleanLandmarks[lid].width = Number(l.width);
        if (l.depth !== undefined && !isNaN(Number(l.depth))) cleanLandmarks[lid].depth = Number(l.depth);
      });
      const lmStr = JSON.stringify(cleanLandmarks, null, 6);
      coreCode = coreCode.replace(
        /defaultLandmarks:\s*\{[\s\S]*?\},\s*landmarks:/,
        `defaultLandmarks: ${lmStr},\n    landmarks:`
      );
      updatedFiles.push(`defaultLandmarks (${Object.keys(cleanLandmarks).length} landmarks)`);
    }

    // Replace defaultBounds
    if (bounds) {
      const bObj = {
        minX: Number(bounds.minX),
        maxX: Number(bounds.maxX),
        minZ: Number(bounds.minZ),
        maxZ: Number(bounds.maxZ)
      };
      coreCode = coreCode.replace(
        /defaultBounds:\s*\{[\s\S]*?\},\s*loadCampusBounds/,
        `defaultBounds: ${JSON.stringify(bObj, null, 6)},\n    loadCampusBounds`
      );
      updatedFiles.push('defaultBounds');
    }

    fs.writeFileSync(coreJsPath, coreCode, 'utf8');
  }

  console.log(`[Layout Sync Server] Applied default layout: ${updatedFiles.join(', ')}`);
  return updatedFiles;
}

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Layout Sync Server] Listening on http://0.0.0.0:${PORT} (All network interfaces)`);
  });
}

module.exports = { applyDefaultLayout };
