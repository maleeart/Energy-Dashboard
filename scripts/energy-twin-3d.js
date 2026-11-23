/**
 * Sainoi Energy Dashboard & 3D Building Digital Twin - 3D Campus Scene Engine
 * Three.js High-Fidelity Campus Environment, Master Plan Layout, Procedural Architecture,
 * Lighting, Shadows, OrbitControls, Smooth Raycasting, and Multi-Zone Camera Presets.
 *
 * Detailed Architectural Specs & Civil Layout from:
 * 1. EGAT Sai Noi Master Plan (SNO-MP28-SV-1/1, 1 Feb 2565)
 * 2. As-Built OHK Civil & Drainage Plan (SNO-RF11-SN-2/6 & 1/6)
 * 3. As-Built Blueprints: Office (OF12-3), Workshops (WS12-4), Vehicle Garage (MS-5), Fence (RF12)
 * 4. High-Resolution Campus Aerial & Drone Visuals (26 June 2019 / 1 Feb 2565)
 */

(function (window) {
  'use strict';

  class CampusScene {
    constructor(containerId) {
      this.container = document.getElementById(containerId);
      if (!this.container) {
        console.error(`Container #${containerId} not found`);
        return;
      }

      this.scene = null;
      this.camera = null;
      this.renderer = null;
      this.controls = null;
      this.raycaster = new THREE.Raycaster();
      this.mouse = new THREE.Vector2();

      this.buildingMeshes = new Map(); // b_code -> mesh group
      this.labelSprites = new Map();   // b_code -> sprite
      this.warningSprites = new Map(); // b_code -> sprite
      this.landmarkSprites = [];       // array of landmark label sprites
      this.roadMeshes = new Map();     // road_id -> mesh or group
      this.waterMeshes = new Map();    // water_id -> mesh or group
      this.landmarkMeshes = new Map(); // landmark_id -> mesh or group

      this.hemiLight = null;
      this.ambLight = null;
      this.dirLight = null;

      this.visualMode = 'heatmap'; // 'heatmap' | 'bars' | 'flow'
      this.currentTheme = 'day';   // 'day' | 'night'
      this.isKiosk = false;
      this.kioskInterval = null;
      this.kioskIndex = 0;

      this.barGroup = new THREE.Group();
      this.flowGroup = new THREE.Group();
      this.flowMaterials = [];
      this.windowMeshes = [];

      this.selectionRing = null;
      this.hoveredBuilding = null;
      this.selectedBuilding = null;

      this.isAnimatingCamera = false;
      this.needsRender = true;
      this.lastFrameTime = 0;

      // Default Camera View: Overlooking Campus from South-East
      this.defaultCameraPos = { x: 50, y: 165, z: 210 };
      this.defaultTargetPos = { x: -20, y: 0, z: -25 };

      this.init();
    }

    // Procedural Natural Light Soil Ground Texture Generator (ดินสีอ่อน)
    createSoilTexture() {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');

      // 1. Base soft natural warm light earth / sandy loam tone
      ctx.fillStyle = '#D6C8B2';
      ctx.fillRect(0, 0, 512, 512);

      // 2. Gentle organic soil tonal drifts & natural terrain gradations
      const patches = [
        { x: 128, y: 128, rx: 140, ry: 90, color: 'rgba(240, 233, 222, 0.45)' },
        { x: 384, y: 320, rx: 160, ry: 100, color: 'rgba(202, 188, 166, 0.35)' },
        { x: 220, y: 380, rx: 130, ry: 80, color: 'rgba(235, 227, 215, 0.40)' },
        { x: 360, y: 140, rx: 120, ry: 75, color: 'rgba(196, 182, 160, 0.32)' },
        { x: 60, y: 440, rx: 100, ry: 60, color: 'rgba(245, 239, 230, 0.38)' }
      ];

      patches.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.rx, p.ry, Math.PI / 6, 0, Math.PI * 2);
        ctx.fill();
      });

      // 3. Fine mineral / sand particulate & subtle earthen micro-texture
      ctx.fillStyle = 'rgba(248, 243, 235, 0.45)'; // Lighter sand specks
      for (let i = 0; i < 1100; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const s = Math.random() * 2.2 + 0.8;
        ctx.fillRect(x, y, s, s);
      }

      ctx.fillStyle = 'rgba(168, 152, 130, 0.32)'; // Warmer earthen clay grain
      for (let i = 0; i < 900; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const s = Math.random() * 2.0 + 0.8;
        ctx.fillRect(x, y, s, s);
      }

      ctx.fillStyle = 'rgba(135, 120, 100, 0.22)'; // Tiny natural gravel particles
      for (let i = 0; i < 400; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const s = Math.random() * 1.5 + 0.5;
        ctx.fillRect(x, y, s, s);
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(20, 24);
      return texture;
    }

    createLawnTexture() {
      return this.createSoilTexture();
    }

    init() {
      // 1. Scene & Atmosphere (Soft elegant sunny sky blue & balanced fog)
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0xD4E4F7);
      this.scene.fog = new THREE.FogExp2(0xD4E4F7, 0.0012);

      // 2. Camera Setup (Optimized near/far for rock-solid depth precision)
      const aspect = this.container.clientWidth / this.container.clientHeight;
      this.camera = new THREE.PerspectiveCamera(42, aspect, 2.0, 1200);
      this.camera.position.set(this.defaultCameraPos.x, this.defaultCameraPos.y, this.defaultCameraPos.z);

      // 3. WebGL Renderer with Logarithmic Depth Buffer (Eliminates Z-fighting and flicker during zoom)
      try {
        this.renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
          logarithmicDepthBuffer: true,
          powerPreference: 'high-performance'
        });
      } catch (e) {
        try {
          this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance'
          });
        } catch (e2) {
          console.warn('WebGL initialization failed, triggering 2D fallback:', e2);
          this.showWebGLFallback();
          return;
        }
      }

      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.outputEncoding = THREE.sRGBEncoding;
      this.container.appendChild(this.renderer.domElement);

      // 4. OrbitControls
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.06;
      this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
      this.controls.minDistance = 20;
      this.controls.maxDistance = 500;
      this.controls.target.set(this.defaultTargetPos.x, this.defaultTargetPos.y, this.defaultTargetPos.z);
      this.controls.addEventListener('change', () => { this.needsRender = true; });

      // 5. Daylight & Architectural Lighting
      this.setupLights();

      // 6. Complete Campus Environment (Ground, Ponds, Canal, Switchyard, Football, OHK Infrastructure)
      this.setupCampusEnvironment();

      // 6.1 3D Visual Layers (Bars & Energy Flow)
      this.scene.add(this.barGroup);
      this.scene.add(this.flowGroup);
      this.barGroup.visible = false;
      this.flowGroup.visible = false;

      // 7. Glowing Building Selection Ring
      this.setupSelectionRing();

      // 8. Event Handlers
      this.setupEventListeners();

      // 9. Start Render Loop
      this.animate(0);
    }

    setupLights() {
      // Natural Hemisphere Ambient Fill (Sky blue + Ground bounce warm light earth)
      this.hemiLight = new THREE.HemisphereLight(0xD8EEFD, 0x8C7A5E, 0.60);
      this.hemiLight.position.set(0, 220, 0);
      this.scene.add(this.hemiLight);

      // Soft Ambient Light
      this.ambLight = new THREE.AmbientLight(0xFFFFFF, 0.28);
      this.scene.add(this.ambLight);

      // Main Sun Directional Light
      this.dirLight = new THREE.DirectionalLight(0xFFFDF2, 0.82);
      this.dirLight.position.set(140, 240, 120);
      this.dirLight.castShadow = true;
      this.dirLight.shadow.mapSize.width = 2048;
      this.dirLight.shadow.mapSize.height = 2048;
      this.dirLight.shadow.camera.near = 10;
      this.dirLight.shadow.camera.far = 700;
      this.dirLight.shadow.camera.left = -240;
      this.dirLight.shadow.camera.right = 240;
      this.dirLight.shadow.camera.top = 260;
      this.dirLight.shadow.camera.bottom = -260;
      this.dirLight.shadow.bias = -0.00005;
      this.dirLight.shadow.normalBias = 0.04;
      this.scene.add(this.dirLight);
    }

    /* ═════════════════════════════════════════════════════════════════
       Campus Geography, Roads, Water Bodies, Switchyard, Sports Fields
       ═════════════════════════════════════════════════════════════════ */
    setupCampusEnvironment() {
      // 0. Surrounding Regional Landscape (Natural light earthen countryside terrain)
      const outerGeo = new THREE.PlaneGeometry(1600, 1600);
      const outerMat = new THREE.MeshStandardMaterial({
        color: 0xC8BCA8, // Soft natural light earth terrain
        roughness: 0.98,
        metalness: 0.0
      });
      const outerGround = new THREE.Mesh(outerGeo, outerMat);
      outerGround.rotation.x = -Math.PI / 2;
      outerGround.position.set(-20, -0.70, -40);
      outerGround.receiveShadow = true;
      this.scene.add(outerGround);
      this.outerGroundMesh = outerGround;

      // 1. Master Campus Ground (Warm light soil terrain - ดินสีอ่อน)
      this.soilTexture = this.createSoilTexture();
      this.lawnTexture = this.soilTexture; // Alias for backward compatibility
      const groundGeo = new THREE.PlaneGeometry(440, 520);
      const groundMat = new THREE.MeshStandardMaterial({
        map: this.soilTexture,
        color: 0xD6C9B3, // Clean warm light earth / soil
        roughness: 0.96,
        metalness: 0.01,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(-20, 0.02, -40); // Elevated to +0.02 strictly above pedestal top
      ground.receiveShadow = true;
      ground.renderOrder = 1;
      this.scene.add(ground);
      this.groundMesh = ground;

      // Campus Perimeter Boundary Base (Architectural stone curb pedestal)
      const curbGeo = new THREE.BoxGeometry(444, 1.2, 524);
      const curbMat = new THREE.MeshStandardMaterial({ color: 0x8C7E6C, roughness: 0.85 });
      const curb = new THREE.Mesh(curbGeo, curbMat);
      curb.position.set(-20, -0.65, -40); // Top face is at -0.65 + 0.6 = -0.05 (strictly BELOW the ground at +0.02)
      curb.receiveShadow = true;
      curb.renderOrder = 0;
      this.scene.add(curb);
      this.curbMesh = curb;

      // Apply custom campus boundary if previously configured
      if (window.EnergyTwin && typeof window.EnergyTwin.getCampusBounds === 'function') {
        const customBounds = window.EnergyTwin.getCampusBounds();
        if (customBounds) {
          this.updateCampusBounds(customBounds);
        }
      }

      // 2. Western Boundary Canal (คลองขุนศรี)
      this.setupWesternCanal();

      // 3. Central & South Retention Ponds (สระน้ำ 1, 2, 3)
      this.setupCentralRetentionPonds();

      // 4. 500 kV Switchyard (ลานสวิตช์ยาร์ด กฟผ. ไทรน้อย)
      this.setupSwitchyard();

      // 5. Main Football Pitch (สนามฟุตบอลใหญ่)
      this.setupMainFootballField();

      // 6. Main Campus Road Network & Chemistry Roundabout
      this.setupMainRoadsAndRoundabouts();

      // 7. Security Guardhouse & Entrance Gate (ท.0021)
      this.setupMainEntrance();

      // 7.1 Sunflower Field & Campus Entrance Sign ("ทุ่งทานตะวัน" & ป้าย กฟผ. ไทรน้อย)
      this.setupSunflowerFieldAndEntranceSign();

      // 8. Landscaping, Courtyards & Trees
      this.setupLandscaping();

      // 9. OHK Detailed Infrastructure (As-Built SNO-RF11-SN-2/6)
      this.setupOHKInfrastructure();

      // 10. Geographic 3D Landmark Labels
      this.setupLandmarkLabels();
    }

    // Procedural Water Ripple Texture Generator
    createWaterTexture(type = 'lake') {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');

      if (type === 'pool') {
        // Swimming pool: vibrant cyan with pool floor grid & subtle caustics
        ctx.fillStyle = '#06B6D4'; // Cyan-500
        ctx.fillRect(0, 0, 256, 256);

        // Subtle pool tile pattern
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= 256; x += 16) {
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke();
        }
        for (let y = 0; y <= 256; y += 16) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
        }

        // Shimmering light caustic bands
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.arc(64 + i * 48, 64 + (i % 2) * 64, 40, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Natural pond/lake/canal: deep aquatic cerulean blue with organic water waves
        const grad = ctx.createLinearGradient(0, 0, 256, 256);
        grad.addColorStop(0, '#0284C7');   // Sky-600
        grad.addColorStop(0.5, '#0369A1'); // Sky-700
        grad.addColorStop(1, '#0284C7');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 256, 256);

        // Gentle surface caustics / ripple waves
        ctx.fillStyle = 'rgba(56, 189, 248, 0.35)'; // Sky blue ripple bands
        for (let y = 16; y < 256; y += 32) {
          ctx.beginPath();
          ctx.ellipse(128 + ((y % 64 === 0) ? 24 : -24), y, 110, 9, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'; // Sunlit wave crests
        for (let y = 32; y < 256; y += 48) {
          ctx.beginPath();
          ctx.ellipse(80 + ((y % 96 === 0) ? 48 : 0), y, 64, 5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(2, 2);
      return texture;
    }

    // Western Boundary Canal: Khlong Khun Si (คลองขุนศรี)
    setupWesternCanal() {
      const canalGroup = new THREE.Group();
      canalGroup.name = 'Water_WEST_CANAL';
      canalGroup.position.set(-200, 0, -40);

      const waterGeo = new THREE.PlaneGeometry(24, 480);
      const waterMat = new THREE.MeshStandardMaterial({
        map: this.createWaterTexture('lake'),
        color: 0x0284C7,
        roughness: 0.35,
        metalness: 0.08,
        transparent: true,
        opacity: 0.95,
        depthWrite: true
      });
      const canalWater = new THREE.Mesh(waterGeo, waterMat);
      canalWater.rotation.x = -Math.PI / 2;
      canalWater.position.set(0, 0.12, 0);
      canalWater.receiveShadow = true;
      canalGroup.add(canalWater);

      // Concrete Canal Embankment Wall
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x94A3B8, roughness: 0.8 });
      const eastWall = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.5, 480), wallMat);
      eastWall.position.set(12.5, 0.5, 0);
      canalGroup.add(eastWall);

      const westWall = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.5, 480), wallMat);
      westWall.position.set(-12.5, 0.5, 0);
      canalGroup.add(westWall);

      this.scene.add(canalGroup);
      this.waterMeshes.set('WEST_CANAL', canalGroup);
    }

    // Campus Retention Ponds and Water Features (8 water bodies)
    setupCentralRetentionPonds() {
      const pondSpecs = [
        { id: 'POND_RETENTION_1', name: 'สระน้ำ 1', x: -120, z: -45, width: 36, depth: 44, type: 'lake' },
        { id: 'POND_RETENTION_2', name: 'สระน้ำ 2 (ข้างแฟลต)', x: -125, z: 25, width: 36, depth: 38, type: 'lake' },
        { id: 'POND_RETENTION_3', name: 'สระน้ำ 3', x: 335, z: -140, width: 32, depth: 38, type: 'lake' },
        { id: 'LAKE_PROMENADE', name: 'สระน้ำและสะพานไม้ริมน้ำหลัง ท.0019', x: 165, z: -40, width: 26, depth: 47, type: 'lake' },
        { id: 'LAKE_FOUNTAIN', name: 'สระน้ำพุวงเวียนหอนาฬิกา', x: 345, z: -230, width: 14, depth: 14, type: 'fountain' },
        { id: 'SWIMMING_POOL', name: 'สระว่ายน้ำสโมสรไทรน้อย', x: 345, z: -185, width: 16, depth: 25, type: 'pool' }
      ];

      const lakeTex = this.createWaterTexture('lake');
      const poolTex = this.createWaterTexture('pool');

      const lakeWaterMat = new THREE.MeshStandardMaterial({
        map: lakeTex,
        color: 0x0284C7,
        roughness: 0.35,
        metalness: 0.08,
        transparent: true,
        opacity: 0.95,
        depthWrite: true
      });

      const poolWaterMat = new THREE.MeshStandardMaterial({
        map: poolTex,
        color: 0x06B6D4,
        roughness: 0.25,
        metalness: 0.08,
        transparent: true,
        opacity: 0.96,
        depthWrite: true
      });

      const curbMat = new THREE.MeshStandardMaterial({ color: 0x94A3B8, roughness: 0.8 });
      const poolCurbMat = new THREE.MeshStandardMaterial({ color: 0xF8FAFC, roughness: 0.5 }); // White coping tile

      pondSpecs.forEach(p => {
        const pondGroup = new THREE.Group();
        pondGroup.name = 'Water_' + p.id;
        pondGroup.position.set(p.x, 0, p.z);

        const isPool = p.type === 'pool';
        const isFountain = p.type === 'fountain';
        const waterMat = isPool ? poolWaterMat : lakeWaterMat;
        const curMat = isPool ? poolCurbMat : curbMat;

        // 1. Water Plane (Elevated at Y=0.12 - safely above turf ground Y=0, completely visible)
        const pondWater = new THREE.Mesh(new THREE.PlaneGeometry(p.width, p.depth), waterMat);
        pondWater.rotation.x = -Math.PI / 2;
        pondWater.position.set(0, 0.12, 0);
        pondWater.receiveShadow = true;
        pondGroup.add(pondWater);

        // 2. Perimeter Curb Enclosure (Hollow border around water edges, NOT a solid box)
        const curbThick = isPool ? 0.6 : 0.8;
        const curbH = isPool ? 0.22 : 0.28;
        const curbY = curbH / 2;

        // North curb
        const nCurb = new THREE.Mesh(new THREE.BoxGeometry(p.width + curbThick * 2, curbH, curbThick), curMat);
        nCurb.position.set(0, curbY, -p.depth / 2 - curbThick / 2);
        nCurb.receiveShadow = true;
        pondGroup.add(nCurb);

        // South curb
        const sCurb = new THREE.Mesh(new THREE.BoxGeometry(p.width + curbThick * 2, curbH, curbThick), curMat);
        sCurb.position.set(0, curbY, p.depth / 2 + curbThick / 2);
        sCurb.receiveShadow = true;
        pondGroup.add(sCurb);

        // East curb
        const eCurb = new THREE.Mesh(new THREE.BoxGeometry(curbThick, curbH, p.depth), curMat);
        eCurb.position.set(p.width / 2 + curbThick / 2, curbY, 0);
        eCurb.receiveShadow = true;
        pondGroup.add(eCurb);

        // West curb
        const wCurb = new THREE.Mesh(new THREE.BoxGeometry(curbThick, curbH, p.depth), curMat);
        wCurb.position.set(-p.width / 2 - curbThick / 2, curbY, 0);
        wCurb.receiveShadow = true;
        pondGroup.add(wCurb);

        // Special features for specific bodies of water:
        if (p.id === 'LAKE_PROMENADE') {
          // Teak wooden boardwalk pier along water edge (หลัง ท.0019)
          const pierMat = new THREE.MeshStandardMaterial({ color: 0x92400E, roughness: 0.75 });
          const pier = new THREE.Mesh(new THREE.BoxGeometry(p.width * 0.75, 0.35, 3.2), pierMat);
          pier.position.set(0, 0.22, -p.depth / 2 + 1.6);
          pier.receiveShadow = true;
          pondGroup.add(pier);

          const railMat = new THREE.MeshStandardMaterial({ color: 0x78350F, roughness: 0.6 });
          const rail = new THREE.Mesh(new THREE.BoxGeometry(p.width * 0.75, 0.6, 0.15), railMat);
          rail.position.set(0, 0.65, -p.depth / 2 + 3.0);
          pondGroup.add(rail);
        } else if (isFountain) {
          // Decorative fountain basin & water spray
          const fountainBase = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 0.6, 16), curbMat);
          fountainBase.position.set(0, 0.3, 0);
          pondGroup.add(fountainBase);

          const sprayMat = new THREE.MeshStandardMaterial({
            color: 0xBAE6FD,
            roughness: 0.1,
            metalness: 0.1,
            transparent: true,
            opacity: 0.7
          });
          const spray = new THREE.Mesh(new THREE.ConeGeometry(0.8, 3.5, 8), sprayMat);
          spray.position.set(0, 2.0, 0);
          pondGroup.add(spray);
        } else if (isPool) {
          // Swimming lane lines
          const laneMat = new THREE.MeshBasicMaterial({ color: 0x0284C7 });
          [-p.width / 4, 0, p.width / 4].forEach(lx => {
            const lane = new THREE.Mesh(new THREE.PlaneGeometry(0.2, p.depth - 2), laneMat);
            lane.rotation.x = -Math.PI / 2;
            lane.position.set(lx, 0.13, 0);
            pondGroup.add(lane);
          });
        }

        this.scene.add(pondGroup);
        this.waterMeshes.set(p.id, pondGroup);
      });
    }

    // 500 kV Switchyard: High-voltage gantry structures, transformers, busbars, control house, gravel ground
    setupSwitchyard() {
      const yardGroup = new THREE.Group();
      yardGroup.name = 'Switchyard500kV';
      yardGroup.position.set(-25, 0, 110);

      const yardW = 65;
      const yardD = 60;

      // 1. Crushed Basalt Substation Gravel Ground
      const yardGeo = new THREE.PlaneGeometry(yardW, yardD);
      const yardMat = new THREE.MeshStandardMaterial({
        color: 0x475569, // Crushed basalt gravel rock for high-voltage substation
        roughness: 0.95,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });
      const yard = new THREE.Mesh(yardGeo, yardMat);
      yard.rotation.x = -Math.PI / 2;
      yard.position.set(0, 0.06, 0);
      yard.receiveShadow = true;
      yardGroup.add(yard);

      // Concrete perimeter curb apron
      const curbMat = new THREE.MeshStandardMaterial({ color: 0x94A3B8, roughness: 0.8 });
      const curbH = 0.25;
      const curbT = 0.6;
      [-yardD / 2 - curbT / 2, yardD / 2 + curbT / 2].forEach(cz => {
        const cBeam = new THREE.Mesh(new THREE.BoxGeometry(yardW + curbT * 2, curbH, curbT), curbMat);
        cBeam.position.set(0, curbH / 2 + 0.03, cz);
        yardGroup.add(cBeam);
      });
      [-yardW / 2 - curbT / 2, yardW / 2 + curbT / 2].forEach(cx => {
        const cBeam = new THREE.Mesh(new THREE.BoxGeometry(curbT, curbH, yardD), curbMat);
        cBeam.position.set(cx, curbH / 2 + 0.03, 0);
        yardGroup.add(cBeam);
      });

      // Chainlink security fence (wireframe + steel posts)
      const fenceMat = new THREE.MeshStandardMaterial({ color: 0x64748B, wireframe: true });
      const fenceGeo = new THREE.BoxGeometry(yardW + 0.8, 3.6, yardD + 0.8);
      const fence = new THREE.Mesh(fenceGeo, fenceMat);
      fence.position.set(0, 1.8, 0);
      yardGroup.add(fence);

      // 2. 500 kV High-Voltage Lattice Gantry Towers (3 Bays: North z=-19, Center z=0, South z=+19)
      const steelMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.3 });
      const insMat = new THREE.MeshStandardMaterial({ color: 0xD97706, roughness: 0.4 }); // Porcelain insulator brown
      const busbarMat = new THREE.MeshStandardMaterial({ color: 0x94A3B8, metalness: 0.85, roughness: 0.2 }); // Aluminum busbar

      const bayZs = [-19, 0, 19]; // 3 bays evenly distributed across depth 60m
      const gantryXs = [-20, 20]; // West and East gantry lines (width span = 50m with columns)

      bayZs.forEach(bz => {
        gantryXs.forEach(gx => {
          // Dual vertical gantry columns
          [-5, 5].forEach(ox => {
            const col = new THREE.Mesh(new THREE.BoxGeometry(0.8, 16, 0.8), steelMat);
            col.position.set(gx + ox, 8, bz);
            col.castShadow = true;
            yardGroup.add(col);

            // Diagonal cross-bracing truss
            const brace = new THREE.Mesh(new THREE.BoxGeometry(0.35, 14, 0.35), steelMat);
            brace.position.set(gx + ox * 0.5, 8, bz);
            brace.rotation.z = (ox > 0 ? 0.3 : -0.3);
            yardGroup.add(brace);
          });

          // Horizontal overhead crossbeam
          const beam = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.8, 0.8), steelMat);
          beam.position.set(gx, 15.5, bz);
          beam.castShadow = true;
          yardGroup.add(beam);

          // Suspension insulator strings (3 phases)
          [-3.5, 0, 3.5].forEach(ix => {
            const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.8, 8), insMat);
            ins.position.set(gx + ix, 13.6, bz);
            yardGroup.add(ins);
          });
        });
      });

      // 3. Overhead 3-Phase Main Busbars running along Z connecting the 3 bays
      [-23.5, -20, -16.5, 16.5, 20, 23.5].forEach(bx => {
        const busbar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 42, 6), busbarMat);
        busbar.rotation.x = Math.PI / 2;
        busbar.position.set(bx, 14.5, 0);
        yardGroup.add(busbar);
      });

      // 4. Power Transformer Banks (3 Main Units for 3 Bays)
      const transMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.5 });
      const finMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.6 });
      const pitMat = new THREE.MeshStandardMaterial({ color: 0x64748B, roughness: 0.9 });

      const transConfigs = [
        { x: -5, z: -16 },
        { x: 5, z: 0 },
        { x: -5, z: 16 }
      ];

      transConfigs.forEach(({ x: tx, z: tz }) => {
        // Concrete oil catchment pit
        const pit = new THREE.Mesh(new THREE.BoxGeometry(7, 0.3, 7.5), pitMat);
        pit.position.set(tx, 0.15, tz);
        yardGroup.add(pit);

        // Transformer main tank
        const transBody = new THREE.Mesh(new THREE.BoxGeometry(4.8, 4.5, 5.8), transMat);
        transBody.position.set(tx, 2.35, tz);
        transBody.castShadow = true;
        yardGroup.add(transBody);

        // Cooling radiator fin banks (North & South)
        [-2.8, 2.8].forEach(oz => {
          const fin = new THREE.Mesh(new THREE.BoxGeometry(5.0, 3.6, 0.6), finMat);
          fin.position.set(tx, 2.1, tz + oz);
          yardGroup.add(fin);
        });

        // Top oil conservator cylinder
        const conservator = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 4.4, 12), transMat);
        conservator.rotation.z = Math.PI / 2;
        conservator.position.set(tx, 5.0, tz);
        yardGroup.add(conservator);

        // 3 High-Voltage Bushings (Insulators on top)
        [-1.3, 0, 1.3].forEach(bx => {
          const bush = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.8, 8), insMat);
          bush.position.set(tx + bx, 5.6, tz);
          yardGroup.add(bush);
        });
      });

      // 5. Gas Insulated Circuit Breakers & Disconnect Switches in Bays
      const breakerMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, metalness: 0.6, roughness: 0.4 });
      [-10, 10].forEach(bx => {
        bayZs.forEach(bz => {
          const breaker = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 2.8, 8), breakerMat);
          breaker.position.set(bx, 1.4, bz + 4);
          yardGroup.add(breaker);

          const bBush = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 1.5, 6), insMat);
          bBush.position.set(bx, 3.2, bz + 4);
          yardGroup.add(bBush);
        });
      });

      // 6. Substation Control & Relay House (อาคารควบคุมสวิตช์ยาร์ด)
      const controlGroup = new THREE.Group();
      controlGroup.position.set(-20, 0, 21);

      const bldMat = new THREE.MeshStandardMaterial({ color: 0xE2E8F0, roughness: 0.6 });
      const bldRoofMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.5 });
      const bld = new THREE.Mesh(new THREE.BoxGeometry(11, 4.2, 7.5), bldMat);
      bld.position.set(0, 2.1, 0);
      bld.castShadow = true;
      controlGroup.add(bld);

      const bldRoof = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.4, 8.1), bldRoofMat);
      bldRoof.position.set(0, 4.3, 0);
      controlGroup.add(bldRoof);

      // Door & Windows
      const doorMat = new THREE.MeshStandardMaterial({ color: 0x334155 });
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.6, 0.1), doorMat);
      door.position.set(2, 1.3, 3.8);
      controlGroup.add(door);

      yardGroup.add(controlGroup);

      // 7. Corner Lightning Protection Masts (4 tall slender lightning rods)
      [-28, 28].forEach(lx => {
        [-25, 25].forEach(lz => {
          const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, 22, 6), steelMat);
          mast.position.set(lx, 11, lz);
          mast.castShadow = true;
          yardGroup.add(mast);

          const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 2.5, 6), busbarMat);
          tip.position.set(lx, 23.2, lz);
          yardGroup.add(tip);
        });
      });

      this.scene.add(yardGroup);
      this.landmarkMeshes.set('SW_YARD', yardGroup);
    }

    // Procedural Football Pitch Texture with regulation lines and alternating mowing stripes
    createFootballPitchTexture(fw = 28, fd = 56) {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;

      // 1. Alternating Grass Mowing Stripes (Deep lush stadium green)
      const numStripes = 14;
      const stripeH = h / numStripes;
      for (let i = 0; i < numStripes; i++) {
        ctx.fillStyle = (i % 2 === 0) ? '#15803D' : '#16A34A'; // Tailwind green-700 / green-600
        ctx.fillRect(0, i * stripeH, w, stripeH);
      }

      // Outer margin padding in canvas pixels
      const padX = 28;
      const padY = 40;
      const pitchW = w - padX * 2;
      const pitchH = h - padY * 2;

      // White Pitch Markings
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 6;
      ctx.lineJoin = 'miter';

      // 2. Touchlines & Goal lines (Boundary)
      ctx.strokeRect(padX, padY, pitchW, pitchH);

      // 3. Halfway Line
      const midY = padY + pitchH / 2;
      ctx.beginPath();
      ctx.moveTo(padX, midY);
      ctx.lineTo(padX + pitchW, midY);
      ctx.stroke();

      // 4. Center Circle & Center Spot
      const centerR = pitchW * 0.18;
      ctx.beginPath();
      ctx.arc(w / 2, midY, centerR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(w / 2, midY, 6, 0, Math.PI * 2);
      ctx.fill();

      // 5. Penalty Areas (18-yard box)
      const penW = pitchW * 0.54;
      const penH = pitchH * 0.16;
      const penX = padX + (pitchW - penW) / 2;

      // North Penalty Box
      ctx.strokeRect(penX, padY, penW, penH);
      // North Goal Area (6-yard box)
      const goalBoxW = pitchW * 0.28;
      const goalBoxH = pitchH * 0.06;
      ctx.strokeRect(padX + (pitchW - goalBoxW) / 2, padY, goalBoxW, goalBoxH);
      // North Penalty Spot
      ctx.beginPath();
      ctx.arc(w / 2, padY + penH * 0.72, 5, 0, Math.PI * 2);
      ctx.fill();
      // North Penalty Arc (D-arc)
      ctx.beginPath();
      ctx.arc(w / 2, padY + penH * 0.72, centerR * 0.8, 0.65, Math.PI - 0.65);
      ctx.stroke();

      // South Penalty Box
      ctx.strokeRect(penX, padY + pitchH - penH, penW, penH);
      // South Goal Area
      ctx.strokeRect(padX + (pitchW - goalBoxW) / 2, padY + pitchH - goalBoxH, goalBoxW, goalBoxH);
      // South Penalty Spot
      ctx.beginPath();
      ctx.arc(w / 2, padY + pitchH - penH * 0.72, 5, 0, Math.PI * 2);
      ctx.fill();
      // South Penalty Arc (D-arc)
      ctx.beginPath();
      ctx.arc(w / 2, padY + pitchH - penH * 0.72, centerR * 0.8, Math.PI + 0.65, Math.PI * 2 - 0.65);
      ctx.stroke();

      // 6. Corner Arcs
      const cornerR = 18;
      // Top-Left
      ctx.beginPath(); ctx.arc(padX, padY, cornerR, 0, Math.PI / 2); ctx.stroke();
      // Top-Right
      ctx.beginPath(); ctx.arc(padX + pitchW, padY, cornerR, Math.PI / 2, Math.PI); ctx.stroke();
      // Bottom-Left
      ctx.beginPath(); ctx.arc(padX, padY + pitchH, cornerR, -Math.PI / 2, 0); ctx.stroke();
      // Bottom-Right
      ctx.beginPath(); ctx.arc(padX + pitchW, padY + pitchH, cornerR, Math.PI, Math.PI * 1.5); ctx.stroke();

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      return texture;
    }

    // Main Football Pitch
    setupMainFootballField() {
      const fieldGroup = new THREE.Group();
      fieldGroup.name = 'FootballField';
      // Center position in campus layout (entrance-aligned perspective)
      const fx = 145;
      const fz = -125;
      const fw = 28;
      const fd = 56;

      fieldGroup.position.set(fx, 0, fz);
      fieldGroup.rotation.y = 0;

      // 1. Single Crisp Textured Pitch Mesh (No overlapping planes, No Z-fighting, No polygonOffset bugs)
      const pitchTexture = this.createFootballPitchTexture(fw, fd);
      const turfMat = new THREE.MeshStandardMaterial({
        map: pitchTexture,
        roughness: 0.85,
        metalness: 0.05
      });
      const pitch = new THREE.Mesh(new THREE.PlaneGeometry(fw, fd), turfMat);
      pitch.rotation.x = -Math.PI / 2;
      pitch.position.set(0, 0.12, 0);
      pitch.receiveShadow = true;
      fieldGroup.add(pitch);

      // 2. Regulation White Goal Posts with Nets at Both Ends
      const goalMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.3 });
      [-fd / 2 + 1.2, fd / 2 - 1.2].forEach(gz => {
        const goalCross = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.22, 0.22), goalMat);
        goalCross.position.set(0, 2.4, gz);
        fieldGroup.add(goalCross);

        [-2.6, 2.6].forEach(gx => {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.4, 0.22), goalMat);
          post.position.set(gx, 1.2, gz);
          fieldGroup.add(post);
        });

        // Goal net back frame
        const netDepth = (gz < 0) ? -1.8 : 1.8;
        const netMat = new THREE.MeshBasicMaterial({ color: 0xE2E8F0, wireframe: true, transparent: true, opacity: 0.45 });
        const netBox = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.4, 1.8), netMat);
        netBox.position.set(0, 1.2, gz + netDepth / 2);
        fieldGroup.add(netBox);
      });

      // 3. North Spectator Bleachers (Facing D.0025)
      const bleacherMat = new THREE.MeshStandardMaterial({ color: 0x94A3B8, roughness: 0.8 });
      const bleacherW = fw * 0.82;
      [
        { y: 0.35, d: 2.0, z: -fd / 2 - 1.2 },
        { y: 0.70, d: 1.6, z: -fd / 2 - 2.4 },
        { y: 1.05, d: 1.4, z: -fd / 2 - 3.6 }
      ].forEach(step => {
        const terrace = new THREE.Mesh(new THREE.BoxGeometry(bleacherW, step.y, step.d), bleacherMat);
        terrace.position.set(0, step.y / 2 + 0.05, step.z);
        terrace.receiveShadow = true;
        fieldGroup.add(terrace);
      });

      this.scene.add(fieldGroup);
      this.landmarkMeshes.set('FOOTBALL', fieldGroup);
    }

    // Main Campus Road Network & Eastern Roundabout
    setupMainRoadsAndRoundabouts() {
      // 1. Dynamic User-Configured Road Network Container
      this.roadContainer = new THREE.Group();
      this.roadContainer.name = 'DynamicRoadNetwork';
      this.scene.add(this.roadContainer);

      // 2. Eastern Science & Chemistry Roundabout (Landmark in front of T.0018 & T.0016)
      const eastRound = this.createRoundabout(200, -165, 12, 5.5);
      eastRound.name = 'Roundabout_East';
      this.scene.add(eastRound);
      this.roadMeshes.set('ROAD_EAST_ROUNDABOUT', eastRound);
      this.landmarkMeshes.set('EAST_ROUNDABOUT', eastRound);

      // Initial synchronization of dynamic roads
      this.syncRoadsFromModel();
    }

    createRoundabout(cx, cz, outerR, innerR) {
      const group = new THREE.Group();
      group.position.set(cx, 0, cz);

      const ringGeo = new THREE.RingGeometry(innerR, outerR, 36);
      const ringMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.72,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(0, 0.08, 0);
      ring.receiveShadow = true;
      group.add(ring);

      const islandGeo = new THREE.CircleGeometry(innerR - 0.2, 32);
      const islandMat = new THREE.MeshStandardMaterial({ color: 0x5B8E55, roughness: 0.9 });
      const island = new THREE.Mesh(islandGeo, islandMat);
      island.rotation.x = -Math.PI / 2;
      island.position.set(0, 0.25, 0);
      group.add(island);

      // Decorative Walkway Ring in Roundabout Island
      const innerWalk = new THREE.Mesh(new THREE.RingGeometry(innerR * 0.45, innerR * 0.75, 28), new THREE.MeshBasicMaterial({ color: 0xE2E8F0 }));
      innerWalk.rotation.x = -Math.PI / 2;
      innerWalk.position.set(0, 0.26, 0);
      group.add(innerWalk);

      const curbGeo = new THREE.CylinderGeometry(innerR, innerR, 0.4, 32, 1, true);
      const curbMat = new THREE.MeshStandardMaterial({ color: 0xCBD5E1 });
      const curb = new THREE.Mesh(curbGeo, curbMat);
      curb.position.set(0, 0.2, 0);
      group.add(curb);

      const tree = this.createTreeMesh();
      tree.position.set(0, 0.2, 0);
      tree.scale.set(1.4, 1.4, 1.4);
      group.add(tree);

      return group;
    }

    /* ═════════════════════════════════════════════════════════════════
       Detailed OHK Infrastructure (As-Built SNO-RF11-SN-2/6)
       Curved Retention Pond, Waterfront Gazebo, Grand Roundabout,
       Heavy Maneuvering Apron, Futsal Field, Roads & 230kV Pylons
       ═════════════════════════════════════════════════════════════════ */
    setupOHKInfrastructure() {
      const ohkGroup = new THREE.Group();
      ohkGroup.name = 'OHK_Infrastructure';

      const asphaltMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.72 });
      const concreteApronMat = new THREE.MeshStandardMaterial({ color: 0x94A3B8, roughness: 0.85 });
      const waterMat = new THREE.MeshStandardMaterial({
        map: this.createWaterTexture('lake'),
        color: 0x0284C7,
        roughness: 0.35,
        metalness: 0.08,
        transparent: true,
        opacity: 0.95,
        depthWrite: true
      });
      const curbMat = new THREE.MeshStandardMaterial({ color: 0x94A3B8, roughness: 0.8, side: THREE.DoubleSide });

      // ── 1. Curved Peanut-Shaped Retention Pond (สระน้ำ อหข. WL +99.00) ──
      const pondGroup = new THREE.Group();
      pondGroup.name = 'Water_OHK_RETENTION_POND';
      pondGroup.position.set(-200, 0, -95);

      // South lobe of pond (near D.0031) - relative to (-171, -158)
      const lobe1 = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 0.25, 32), waterMat);
      lobe1.position.set(1, 0.13, 10);
      lobe1.receiveShadow = true;
      pondGroup.add(lobe1);

      // North lobe of pond - relative to (-171, -158)
      const lobe2 = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 0.25, 32), waterMat);
      lobe2.position.set(-2, 0.13, -10);
      lobe2.receiveShadow = true;
      pondGroup.add(lobe2);

      // Connecting neck - relative to (-171, -158)
      const neck = new THREE.Mesh(new THREE.BoxGeometry(13, 0.25, 18), waterMat);
      neck.position.set(0, 0.13, 0);
      neck.receiveShadow = true;
      pondGroup.add(neck);

      // Stone border around pond
      const curbLobe1 = new THREE.Mesh(new THREE.CylinderGeometry(11.8, 11.8, 0.35, 32, 1, true), curbMat);
      curbLobe1.position.set(1, 0.2, 10);
      pondGroup.add(curbLobe1);

      const curbLobe2 = new THREE.Mesh(new THREE.CylinderGeometry(10.8, 10.8, 0.35, 32, 1, true), curbMat);
      curbLobe2.position.set(-2, 0.2, -10);
      pondGroup.add(curbLobe2);

      // Waterfront Gazebo Pavilion (ศาลาพักผ่อนริมน้ำ อหข.) with Pier
      const pierMat = new THREE.MeshStandardMaterial({ color: 0x78350F, roughness: 0.8 });
      const pier = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 8), pierMat);
      pier.position.set(11, 0.25, 0);
      pondGroup.add(pier);

      const gazeboRoofMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.6 });
      const gazeboRoof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 2.0, 8), gazeboRoofMat);
      gazeboRoof.position.set(9, 3.0, 0);
      gazeboRoof.castShadow = true;
      pondGroup.add(gazeboRoof);

      // Gazebo deck and columns
      const gazeboDeck = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.3, 8), pierMat);
      gazeboDeck.position.set(9, 0.3, 0);
      pondGroup.add(gazeboDeck);

      for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
        const col = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6),
          new THREE.MeshStandardMaterial({ color: 0xCBD5E1 })
        );
        col.position.set(9 + Math.cos(a) * 2.4, 1.5, Math.sin(a) * 2.4);
        col.castShadow = true;
        pondGroup.add(col);
      }

      ohkGroup.add(pondGroup);
      this.waterMeshes.set('OHK_RETENTION_POND', pondGroup);

      // ── 2. Grand OHK Roundabout (วงเวียนใหญ่ อหข.) ──
      // Positioned cleanly without intersecting any building: Center (-265, -160)
      const roundaboutGroup = new THREE.Group();
      roundaboutGroup.position.set(-265, 0, -160);

      const outerR = 16;
      const innerR = 8.5;

      // Asphalt Ring
      const ringGeo = new THREE.RingGeometry(innerR, outerR, 40);
      const ring = new THREE.Mesh(ringGeo, asphaltMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(0, 0.06, 0);
      ring.receiveShadow = true;
      roundaboutGroup.add(ring);

      // Raised Landscape Island Mound
      const moundGeo = new THREE.CylinderGeometry(innerR - 0.2, innerR - 0.1, 0.8, 36);
      const moundMat = new THREE.MeshStandardMaterial({ color: 0x5B8E55, roughness: 0.9 });
      const mound = new THREE.Mesh(moundGeo, moundMat);
      mound.position.set(0, 0.4, 0);
      roundaboutGroup.add(mound);

      // Decorative Walkway Ring inside Roundabout Mound
      const walkRing1 = new THREE.Mesh(new THREE.RingGeometry(3.6, 5.2, 32), new THREE.MeshBasicMaterial({ color: 0xE2E8F0 }));
      walkRing1.rotation.x = -Math.PI / 2;
      walkRing1.position.set(0, 0.81, 0);
      roundaboutGroup.add(walkRing1);

      // Center Landmark Palm / Tree
      const rTree = this.createTreeMesh();
      rTree.position.set(0, 0.8, 0);
      rTree.scale.set(1.5, 1.5, 1.5);
      roundaboutGroup.add(rTree);

      // Pink Ixora Flowerbeds in Roundabout Island (Matching photo: ท.0026.JPG)
      const flowerMat = new THREE.MeshStandardMaterial({ color: 0xF43F5E, roughness: 0.7 });
      for (let fa = 0; fa < Math.PI * 2; fa += Math.PI / 4) {
        const fx = Math.cos(fa) * 5.8;
        const fz = Math.sin(fa) * 5.8;
        const bush = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 8), flowerMat);
        bush.position.set(fx, 0.9, fz);
        roundaboutGroup.add(bush);
      }

      ohkGroup.add(roundaboutGroup);
      this.landmarkMeshes.set('OHK_ROUNDABOUT', roundaboutGroup);

      // ── 3. Heavy Vehicle Apron & Maneuvering Yard (ลานคอนกรีตลานกลับรถ อหข.) ──
      // Centered in front of Heavy Workshops T.0028 & T.0029
      const apronGeo = new THREE.PlaneGeometry(75, 60);
      const apron = new THREE.Mesh(apronGeo, concreteApronMat);
      apron.rotation.x = -Math.PI / 2;
      apron.position.set(-210, 0.05, -185);
      apron.receiveShadow = true;
      ohkGroup.add(apron);

      // Note: OHK access and perimeter roads are now part of the user-drawn dynamic road network

      this.scene.add(ohkGroup);
    }

    setupMainEntrance() {
      const gateGroup = new THREE.Group();
      gateGroup.name = 'CampusEntranceGate';
      const gx = 65;
      const gz = 140;

      // 1. Guardhouse Security Booth (ท.0021)
      const baseMat = new THREE.MeshStandardMaterial({ color: 0x64748B, roughness: 0.85 });
      const boothPlinth = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.4, 5.8), baseMat);
      boothPlinth.position.set(0, 0.2, 0);
      boothPlinth.receiveShadow = true;
      gateGroup.add(boothPlinth);

      const boothMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
      const booth = new THREE.Mesh(new THREE.BoxGeometry(5.8, 3.8, 4.8), boothMat);
      booth.position.set(0, 2.1, 0);
      booth.castShadow = true;
      booth.receiveShadow = true;
      gateGroup.add(booth);

      // Panoramic tinted glass observation windows
      const winMat = new THREE.MeshStandardMaterial({ color: 0x60A5FA, metalness: 0.85, roughness: 0.15 });
      const win = new THREE.Mesh(new THREE.BoxGeometry(5.9, 1.4, 3.8), winMat);
      win.position.set(0, 2.4, 0);
      gateGroup.add(win);

      // Modern Architectural Overhanging Canopy
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x0F172A, roughness: 0.6 });
      const roof = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.5, 7.0), roofMat);
      roof.position.set(0, 4.25, 0);
      roof.castShadow = true;
      gateGroup.add(roof);

      // 2. Automated Boom Barrier Gate
      const poleMat = new THREE.MeshStandardMaterial({ color: 0xF59E0B, roughness: 0.35, metalness: 0.2 });
      const barrierMat = new THREE.MeshStandardMaterial({ color: 0xDC2626, roughness: 0.4 });

      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.8), poleMat);
      pillar.position.set(-4.5, 0.7, 0);
      pillar.castShadow = true;
      gateGroup.add(pillar);

      const arm = new THREE.Mesh(new THREE.BoxGeometry(7, 0.15, 0.15), barrierMat);
      arm.position.set(-8.0, 1.1, 0);
      gateGroup.add(arm);

      gateGroup.position.set(gx, 0, gz);
      this.scene.add(gateGroup);
      this.landmarkMeshes.set('CAMPUS_ENTRANCE', gateGroup);
    }

    // Procedural Sunflower Field Agricultural Soil Texture (Rich dark brown fertile humus with planting furrows)
    createSunflowerSoilTexture() {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');

      // 1. Rich dark fertile agricultural loam base
      ctx.fillStyle = '#3E2723';
      ctx.fillRect(0, 0, 512, 512);

      // 2. Planting furrow rows running along depth
      const numRows = 16;
      const rowWidth = 512 / numRows;
      for (let i = 0; i < numRows; i++) {
        const x = i * rowWidth;
        const furrowGrad = ctx.createLinearGradient(x, 0, x + rowWidth, 0);
        furrowGrad.addColorStop(0, '#26160D');
        furrowGrad.addColorStop(0.35, '#4E342E');
        furrowGrad.addColorStop(0.65, '#5D4037'); // Sunlit ridge crest
        furrowGrad.addColorStop(1, '#26160D');
        ctx.fillStyle = furrowGrad;
        ctx.fillRect(x, 0, rowWidth, 512);
      }

      // 3. Natural soil clods and organic humus grain
      ctx.fillStyle = 'rgba(78, 52, 46, 0.45)';
      for (let j = 0; j < 600; j++) {
        const gx = (Math.sin(j * 91) * 0.5 + 0.5) * 512;
        const gy = (Math.cos(j * 53) * 0.5 + 0.5) * 512;
        const gr = 1.5 + (j % 4);
        ctx.beginPath();
        ctx.arc(gx, gy, gr, 0, Math.PI * 2);
        ctx.fill();
      }

      // 4. Subtle mossy green speckles in fertile agricultural soil
      ctx.fillStyle = 'rgba(77, 124, 15, 0.25)';
      for (let k = 0; k < 300; k++) {
        const mx = (Math.sin(k * 137) * 0.5 + 0.5) * 512;
        const my = (Math.cos(k * 79) * 0.5 + 0.5) * 512;
        ctx.fillRect(mx, my, 3, 3);
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(2, 3);
      return texture;
    }

    // Sunflower Field (ทุ่งทานตะวัน)
    setupSunflowerField() {
      const sunflowerGroup = new THREE.Group();
      sunflowerGroup.name = 'SunflowerField';

      const fieldW = 34;
      const fieldD = 44;

      // 1. Sunflower field soil bed (Rich warm fertile garden earth with furrow texture)
      const bedGeo = new THREE.PlaneGeometry(fieldW, fieldD);
      const soilTex = this.createSunflowerSoilTexture();
      const bedMat = new THREE.MeshStandardMaterial({
        map: soilTex,
        roughness: 0.95,
        metalness: 0.02
      });
      const bed = new THREE.Mesh(bedGeo, bedMat);
      bed.rotation.x = -Math.PI / 2;
      bed.position.set(0, 0.16, 0);
      bed.receiveShadow = true;
      sunflowerGroup.add(bed);

      // 2. Perimeter landscaping curb border around sunflower field (4 perimeter border beams)
      const curbMat = new THREE.MeshStandardMaterial({ color: 0x94A3B8, roughness: 0.75 });
      const curbH = 0.22;
      const curbT = 0.5; // thickness
      const halfW = fieldW / 2;
      const halfD = fieldD / 2;

      // North beam
      const curbN = new THREE.Mesh(new THREE.BoxGeometry(fieldW + curbT * 2, curbH, curbT), curbMat);
      curbN.position.set(0, curbH / 2, -halfD - curbT / 2);
      curbN.receiveShadow = true;
      sunflowerGroup.add(curbN);

      // South beam
      const curbS = new THREE.Mesh(new THREE.BoxGeometry(fieldW + curbT * 2, curbH, curbT), curbMat);
      curbS.position.set(0, curbH / 2, halfD + curbT / 2);
      curbS.receiveShadow = true;
      sunflowerGroup.add(curbS);

      // West beam
      const curbW = new THREE.Mesh(new THREE.BoxGeometry(curbT, curbH, fieldD), curbMat);
      curbW.position.set(-halfW - curbT / 2, curbH / 2, 0);
      curbW.receiveShadow = true;
      sunflowerGroup.add(curbW);

      // East beam
      const curbE = new THREE.Mesh(new THREE.BoxGeometry(curbT, curbH, fieldD), curbMat);
      curbE.position.set(halfW + curbT / 2, curbH / 2, 0);
      curbE.receiveShadow = true;
      sunflowerGroup.add(curbE);

      // 3. Blooming Sunflower Clusters (Golden yellow disk petals with dark seed centers & leaves)
      const stemMat = new THREE.MeshStandardMaterial({ color: 0x15803D, roughness: 0.8 });
      const petalMat = new THREE.MeshStandardMaterial({ color: 0xFACC15, roughness: 0.35 });
      const centerMat = new THREE.MeshStandardMaterial({ color: 0x78350F, roughness: 0.9 });
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.7 });

      for (let sx = -14; sx <= 14; sx += 3.5) {
        for (let sz = -18; sz <= 18; sz += 4) {
          const ox = sx + (Math.sin(sx * 3 + sz) * 0.4);
          const oz = sz + (Math.cos(sz * 3 + sx) * 0.4);
          const h = 1.3 + Math.abs(Math.sin(sx + sz)) * 0.4;

          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, h, 6), stemMat);
          stem.position.set(ox, h / 2 + 0.16, oz);
          sunflowerGroup.add(stem);

          // Green leaf pair at stem base
          const leaf1 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.04, 0.18), leafMat);
          leaf1.position.set(ox + 0.15, 0.45, oz);
          leaf1.rotation.z = -0.3;
          sunflowerGroup.add(leaf1);

          // Yellow Petal Disk
          const petal = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.06, 10), petalMat);
          petal.position.set(ox, h + 0.16, oz);
          petal.rotation.x = 0.25;
          sunflowerGroup.add(petal);

          // Dark Seed Center
          const center = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 10), centerMat);
          center.position.set(ox, h + 0.18, oz);
          center.rotation.x = 0.25;
          sunflowerGroup.add(center);
        }
      }

      sunflowerGroup.position.set(-15, 0, 260);
      this.scene.add(sunflowerGroup);
      this.landmarkMeshes.set('SUNFLOWER_FIELD', sunflowerGroup);
    }

    // Iconic EGAT Sai Noi Campus Landmark Sign (ป้ายสัญลักษณ์ กฟผ. ไทรน้อย)
    setupCampusEntranceSign() {
      const signGroup = new THREE.Group();
      signGroup.name = 'CampusEntranceSign';

      // 1. Dark Slate Concrete Plinth Base
      const plinthMat = new THREE.MeshStandardMaterial({ color: 0x0F172A, roughness: 0.75 });
      const basePlinth = new THREE.Mesh(new THREE.BoxGeometry(16, 0.5, 3.2), plinthMat);
      basePlinth.position.set(0, 0.25, 0);
      basePlinth.castShadow = true;
      basePlinth.receiveShadow = true;
      signGroup.add(basePlinth);

      // 2. Premium EGAT Dark Granite Monument Wall with Gold Trim
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.55, metalness: 0.2 });
      const signWall = new THREE.Mesh(new THREE.BoxGeometry(15, 2.2, 0.8), wallMat);
      signWall.position.set(0, 1.5, 0);
      signWall.castShadow = true;
      signWall.receiveShadow = true;
      signGroup.add(signWall);

      // Gold Trim Frame around Sign Wall
      const goldBorderMat = new THREE.MeshStandardMaterial({ color: 0xD97706, metalness: 0.8, roughness: 0.25 });
      const goldBorderTop = new THREE.Mesh(new THREE.BoxGeometry(15.2, 0.08, 0.85), goldBorderMat);
      goldBorderTop.position.set(0, 2.62, 0);
      signGroup.add(goldBorderTop);

      // 3. Golden Yellow 3D Letters: "กฟผ. ไทรน้อย" & Circular Emblem
      const goldMat = new THREE.MeshStandardMaterial({
        color: 0xEAB308,
        metalness: 0.88,
        roughness: 0.22
      });

      const emblem = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.15, 16), goldMat);
      emblem.rotation.x = Math.PI / 2;
      emblem.position.set(-5.0, 1.6, 0.45);
      signGroup.add(emblem);

      const textBar = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.7, 0.15), goldMat);
      textBar.position.set(1.0, 1.6, 0.45);
      signGroup.add(textBar);

      signGroup.position.set(-30, 0, 285);
      signGroup.rotation.y = -0.3;
      this.scene.add(signGroup);
      this.landmarkMeshes.set('CAMPUS_SIGN', signGroup);
    }

    // Street Lamps along Main Entrance Boulevard (ROAD_1)
    setupBoulevardStreetLamps() {
      const lampsGroup = new THREE.Group();
      lampsGroup.name = 'BoulevardStreetLamps';

      const poleMat = new THREE.MeshStandardMaterial({ color: 0x64748B, metalness: 0.8, roughness: 0.3 });
      const lightMat = new THREE.MeshBasicMaterial({ color: 0xFEF08A });

      for (let lz = 10; lz <= 240; lz += 30) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7.5, 8), poleMat);
        pole.position.set(58, 3.75, lz);
        pole.castShadow = true;
        lampsGroup.add(pole);

        const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.12), poleMat);
        arm.position.set(58, 7.3, lz);
        lampsGroup.add(arm);

        [-1.1, 1.1].forEach(ax => {
          const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.3), lightMat);
          fixture.position.set(58 + ax, 7.2, lz);
          lampsGroup.add(fixture);
        });
      }
      this.scene.add(lampsGroup);
    }

    setupSunflowerFieldAndEntranceSign() {
      this.setupSunflowerField();
      this.setupCampusEntranceSign();
      this.setupBoulevardStreetLamps();
    }

    setupLandscaping() {
      // 0. Steam Turbine Rotor Sculpture Plaza (ลานปฏิมากรรมกังหันไอน้ำ หน้า ท.0020)
      this.setupSteamTurbineSculpture();

      // Note: Scenic Promenade Pond (LAKE_PROMENADE) is managed dynamically in setupCentralRetentionPonds and waterMeshes

      const poleMat = new THREE.MeshStandardMaterial({ color: 0xE2E8F0, metalness: 0.8, roughness: 0.2 });
      [-3, 0, 3].forEach(ox => {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 9, 8), poleMat);
        pole.position.set(35 + ox, 4.5, -20);
        pole.castShadow = true;
        this.scene.add(pole);
      });

      // Initialize managed tree group and dynamically sync trees avoiding roads & water
      if (!this.treeGroup) {
        this.treeGroup = new THREE.Group();
        this.treeGroup.name = 'CampusTrees';
        this.scene.add(this.treeGroup);
      }
      this.syncTreesFromLayout();

      // ── Shrines & Iconic Campus Monuments from 3D Prototype (19-6-63) ──
      // 1. พระวิษณุกรรม Shrine (Between T.0020 and T.0007)
      const shrineGroup = new THREE.Group();
      shrineGroup.name = 'Shrine_Vishnu';
      const shrineMat = new THREE.MeshStandardMaterial({ color: 0xD97706, roughness: 0.4 });
      const shrineBase = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.2, 3.5), new THREE.MeshStandardMaterial({ color: 0xF1F5F9 }));
      shrineBase.position.set(0, 0.6, 0);
      shrineGroup.add(shrineBase);
      const shrineStatue = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 2.0, 8), shrineMat);
      shrineStatue.position.set(0, 2.2, 0);
      shrineGroup.add(shrineStatue);
      shrineGroup.position.set(40, 0, 45);
      this.scene.add(shrineGroup);
      this.landmarkMeshes.set('SHRINE_VISHNU', shrineGroup);

      // 2. หลวงพ่อเจ็ดกษัตริย์ Shrine (Near Canteen D.0017 and T.0010)
      const shrine2Group = new THREE.Group();
      shrine2Group.name = 'Shrine_SevenKings';
      const shrine2Base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.0, 3.2), new THREE.MeshStandardMaterial({ color: 0xF1F5F9 }));
      shrine2Base.position.set(0, 0.5, 0);
      shrine2Group.add(shrine2Base);
      const shrine2Statue = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.8, 1.8, 8), shrineMat);
      shrine2Statue.position.set(0, 1.9, 0);
      shrine2Group.add(shrine2Statue);
      shrine2Group.position.set(35, 0, -90);
      this.scene.add(shrine2Group);
      this.landmarkMeshes.set('SHRINE_SEVEN_KINGS', shrine2Group);

      // 3. Blue Parking Sheds: ต.0016 and ต.0018
      const shedMat = new THREE.MeshStandardMaterial({ color: 0x1E40AF, roughness: 0.5 });
      // ต.0016 โรงจอดรถยนต์ (Between T.0008 and T.0011)
      const shed16 = new THREE.Mesh(new THREE.BoxGeometry(6, 3.5, 26), shedMat);
      shed16.position.set(65, 1.75, -45);
      this.scene.add(shed16);
      this.landmarkMeshes.set('PARKING_SHED_16', shed16);

      // ต.0018 โรงจอดรถยนต์ (In front of T.0012)
      const shed18 = new THREE.Mesh(new THREE.BoxGeometry(30, 3.5, 7), shedMat);
      shed18.position.set(15, 1.75, -165);
      this.scene.add(shed18);
      this.landmarkMeshes.set('PARKING_SHED_18', shed18);

      // 4. ลานกองของ อบค. (Behind T.0012)
      const yardGroup = new THREE.Group();
      yardGroup.name = 'StorageYard';

      // Base pad: asphalt/gravel
      const yardBase = new THREE.Mesh(
        new THREE.BoxGeometry(36, 0.2, 24),
        new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85 })
      );
      yardBase.position.set(0, 0.1, 0);
      yardBase.receiveShadow = true;
      yardGroup.add(yardBase);

      // Concrete perimeter curb
      const yardCurb = new THREE.Mesh(
        new THREE.BoxGeometry(36.8, 0.35, 24.8),
        new THREE.MeshStandardMaterial({ color: 0x64748B, roughness: 0.8 })
      );
      yardCurb.position.set(0, 0.18, 0);
      yardGroup.add(yardCurb);

      // Stored equipment crates & industrial containers
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(6, 2.4, 2.5), new THREE.MeshStandardMaterial({ color: 0x0284C7, roughness: 0.45 }));
      c1.position.set(-10, 1.4, -5);
      c1.castShadow = true;
      yardGroup.add(c1);

      const c2 = new THREE.Mesh(new THREE.BoxGeometry(6, 2.4, 2.5), new THREE.MeshStandardMaterial({ color: 0xEA580C, roughness: 0.45 }));
      c2.position.set(-10, 1.4, 3);
      c2.castShadow = true;
      yardGroup.add(c2);

      const c3 = new THREE.Mesh(new THREE.BoxGeometry(5, 1.8, 3), new THREE.MeshStandardMaterial({ color: 0x15803D, roughness: 0.5 }));
      c3.position.set(6, 1.1, -4);
      c3.castShadow = true;
      yardGroup.add(c3);

      const c4 = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 12), new THREE.MeshStandardMaterial({ color: 0x78350F, roughness: 0.8 }));
      c4.position.set(6, 1.0, 4);
      c4.castShadow = true;
      yardGroup.add(c4);

      yardGroup.position.set(15, 0, -195);
      this.scene.add(yardGroup);
      this.landmarkMeshes.set('STORAGE_YARD', yardGroup);
    }

    createTreeMesh() {
      const group = new THREE.Group();

      const trunkGeo = new THREE.CylinderGeometry(0.25, 0.45, 2.6, 6);
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350F, roughness: 0.9 });
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 1.3;
      trunk.castShadow = true;
      group.add(trunk);

      const fMat1 = new THREE.MeshStandardMaterial({ color: 0x15803D, roughness: 0.8 });
      const fMat2 = new THREE.MeshStandardMaterial({ color: 0x16A34A, roughness: 0.8 });

      const cone1 = new THREE.Mesh(new THREE.ConeGeometry(2.4, 4.5, 7), fMat1);
      cone1.position.y = 4.2;
      cone1.castShadow = true;
      group.add(cone1);

      const cone2 = new THREE.Mesh(new THREE.ConeGeometry(1.8, 3.5, 7), fMat2);
      cone2.position.y = 6.0;
      cone2.castShadow = true;
      group.add(cone2);

      return group;
    }

    isTreePositionValid(tx, tz) {
      // 1. Campus Boundary bounds check
      if (tx < -215 || tx > 195 || tz < -218 || tz > 145) return false;

      // 2. Clear from WEST_CANAL perimeter water body (along Z = -235, width 24)
      if (tz <= -218) return false;

      // 3. Clear from all active Water Bodies (with 5.0m buffer from water edge)
      const waterList = (window.EnergyTwin && window.EnergyTwin.getWaterList) ? window.EnergyTwin.getWaterList() : [];
      for (const w of waterList) {
        if (w.hidden) continue;
        const wx = Number(w.x) || 0;
        const wz = Number(w.z) || 0;
        const halfW = ((Number(w.width) || 20) / 2) + 5.0;
        const halfD = ((Number(w.depth) || 20) / 2) + 5.0;
        const rot = Number(w.rotation_y) || 0;

        const dx = tx - wx;
        const dz = tz - wz;
        const cos = Math.cos(-rot);
        const sin = Math.sin(-rot);
        const lx = dx * cos - dz * sin;
        const lz = dx * sin + dz * cos;

        if (Math.abs(lx) < halfW && Math.abs(lz) < halfD) {
          return false;
        }
      }

      // 4. Clear from all active Roads (with 4.0m clearance beyond road edge)
      const roadList = (window.EnergyTwin && window.EnergyTwin.getRoadsList) ? window.EnergyTwin.getRoadsList() : [];
      for (const r of roadList) {
        if (r.hidden) continue;
        const rx = Number(r.x) || 0;
        const rz = Number(r.z) || 0;
        const halfW = ((Number(r.width) || 6) / 2) + 4.0;
        const halfLen = ((Number(r.length) || 50) / 2) + 3.0;
        const rot = Number(r.rotation_y) || 0;

        const dx = tx - rx;
        const dz = tz - rz;
        const cos = Math.cos(-rot);
        const sin = Math.sin(-rot);
        const lx = dx * cos - dz * sin;
        const lz = dx * sin + dz * cos;

        if (Math.abs(lx) < halfW && Math.abs(lz) < halfLen) {
          return false;
        }
      }

      // 5. Clear from all active Buildings (with 4.0m clearance from walls)
      const bList = (window.EnergyTwin && window.EnergyTwin.getBuildingsList) ? window.EnergyTwin.getBuildingsList() : [];
      for (const b of bList) {
        if (b.hidden) continue;
        const pos = b.layout_position || { x: b.x, z: b.z };
        const bx = Number(pos.x) || 0;
        const bz = Number(pos.z) || 0;
        const dims = b.dimensions || {};
        const halfW = ((Number(dims.width) || 24) / 2) + 4.0;
        const halfD = ((Number(dims.depth) || 30) / 2) + 4.0;
        const rot = Number(b.rotation_y) || 0;

        const dx = tx - bx;
        const dz = tz - bz;
        const cos = Math.cos(-rot);
        const sin = Math.sin(-rot);
        const lx = dx * cos - dz * sin;
        const lz = dx * sin + dz * cos;

        if (Math.abs(lx) < halfW && Math.abs(lz) < halfD) {
          return false;
        }
      }

      // 6. Clear from Landmarks dynamically (using active position, dimensions & rotation)
      const lmList = (window.EnergyTwin && window.EnergyTwin.getLandmarksList) ? window.EnergyTwin.getLandmarksList() : [];
      for (const lm of lmList) {
        if (lm.hidden) continue;
        const lx = Number(lm.x) || 0;
        const lz = Number(lm.z) || 0;
        const lw = Number(lm.width) || (lm.id === 'SW_YARD' ? 65 : (lm.id === 'SUNFLOWER_FIELD' ? 34 : (lm.id === 'FOOTBALL' ? 28 : (lm.id === 'OHK_ROUNDABOUT' ? 28 : (lm.id === 'EAST_ROUNDABOUT' ? 24 : 15)))));
        const ld = Number(lm.depth) || (lm.id === 'SW_YARD' ? 60 : (lm.id === 'SUNFLOWER_FIELD' ? 44 : (lm.id === 'FOOTBALL' ? 56 : (lm.id === 'OHK_ROUNDABOUT' ? 28 : (lm.id === 'EAST_ROUNDABOUT' ? 24 : 15)))));
        const halfW = (lw / 2) + 3.0;
        const halfD = (ld / 2) + 3.0;
        const rot = Number(lm.rotation_y) || 0;

        const dx = tx - lx;
        const dz = tz - lz;
        const cos = Math.cos(-rot);
        const sin = Math.sin(-rot);
        const localX = dx * cos - dz * sin;
        const localZ = dx * sin + dz * cos;

        if (Math.abs(localX) < halfW && Math.abs(localZ) < halfD) {
          return false;
        }
      }

      return true;
    }

    syncTreesFromLayout() {
      if (!this.treeGroup) {
        this.treeGroup = new THREE.Group();
        this.treeGroup.name = 'CampusTrees';
        this.scene.add(this.treeGroup);
      }

      // Dispose existing tree meshes
      while (this.treeGroup.children.length > 0) {
        const c = this.treeGroup.children[0];
        this.treeGroup.remove(c);
        if (c.traverse) {
          c.traverse(node => {
            if (node.geometry) node.geometry.dispose();
            if (node.material) {
              if (Array.isArray(node.material)) node.material.forEach(m => m.dispose());
              else node.material.dispose();
            }
          });
        }
      }

      const candidateTrees = [
        // 1. East Perimeter Green Line (Far eastern edge, expansive open soil verge)
        [185, -140], [185, -100], [185, -60], [185, -20], [185, 20], [185, 60], [185, 100],
        // 2. West Perimeter Buffer (East of West Canal bank, safe from canal & buildings)
        [-195, -135], [-195, -95], [-195, -55], [-195, -15], [-195, 25], [-195, 65],
        // 3. North Perimeter Boundary
        [-155, 125], [-115, 125], [-75, 125], [105, 125], [145, 125],
        // 4. South-East Open Landscape (Near T.0019/T.0020, well outside water & roads)
        [155, 20], [155, 50], [130, 25], [130, 55],
        // 5. Central Open Courtyard Axis (X = 0 line between workshop rows)
        [0, 5], [0, 35], [0, -25], [0, -65], [0, -105],
        // 6. Main Avenue Open Green Buffer (East of red walkway, X = 78)
        [78, 30], [78, 60], [78, 90], [78, 120], [78, 150],
        // 7. Southwest Open Ground
        [12, 75], [12, 105], [12, 135],
        // 8. Garden clusters between buildings (will only be placed if clearance is guaranteed)
        [36, -10], [36, -90], [-40, -10], [-40, -90]
      ];

      candidateTrees.forEach(([tx, tz]) => {
        if (!this.isTreePositionValid(tx, tz)) return;
        const tree = this.createTreeMesh();
        tree.position.set(tx, 0, tz);
        const s = 0.85 + Math.random() * 0.35;
        tree.scale.set(s, s, s);
        this.treeGroup.add(tree);
      });

      this.needsRender = true;
    }

    // Iconic Steam Turbine Rotor Sculpture Plaza (ลานปฏิมากรรมกังหันไอน้ำ หน้า ท.0020)
    setupSteamTurbineSculpture() {
      const scGroup = new THREE.Group();
      scGroup.name = 'SteamTurbineSculpture';
      const cx = 95;
      const cz = 30;
      scGroup.position.set(cx, 0, cz);

      // 1. Concentric Circular Plaza Walkways (Matching photo: ปฏิมากรรมหน้า ท.0020.JPG)
      const paveMat1 = new THREE.MeshStandardMaterial({
        color: 0xE2E8F0,
        roughness: 0.8,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });
      const paveMat2 = new THREE.MeshStandardMaterial({
        color: 0x94A3B8,
        roughness: 0.85,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });
      const lawnMat = new THREE.MeshStandardMaterial({ color: 0x4D7C0F, roughness: 0.9 });

      // Outer plaza ring
      const outerRing = new THREE.Mesh(new THREE.RingGeometry(6.5, 10.5, 40), paveMat1);
      outerRing.rotation.x = -Math.PI / 2;
      outerRing.position.set(0, 0.08, 0);
      outerRing.receiveShadow = true;
      scGroup.add(outerRing);

      // Inner circular green lawn
      const innerLawn = new THREE.Mesh(new THREE.CircleGeometry(6.4, 36), lawnMat);
      innerLawn.rotation.x = -Math.PI / 2;
      innerLawn.position.set(0, 0.1, 0);
      innerLawn.receiveShadow = true;
      scGroup.add(innerLawn);

      // Radial access walkways
      [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].forEach(ang => {
        const walk = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 11), paveMat2);
        walk.rotation.x = -Math.PI / 2;
        walk.rotation.z = ang;
        walk.position.set(0, 0.11, 0);
        scGroup.add(walk);
      });

      // 2. Concrete Triangular Support Pedestals (Bearing blocks for tilted rotor)
      const pedestalMat = new THREE.MeshStandardMaterial({ color: 0xF1F5F9, roughness: 0.6 });
      const lowerPedestal = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 2.0), pedestalMat);
      lowerPedestal.position.set(-2.5, 0.7 + 0.1, 2.0);
      lowerPedestal.castShadow = true;
      scGroup.add(lowerPedestal);

      const higherPedestal = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.2, 2.0), pedestalMat);
      higherPedestal.position.set(2.5, 1.6 + 0.1, -2.0);
      higherPedestal.castShadow = true;
      scGroup.add(higherPedestal);

      // 3. 3D Steam Turbine Rotor (Multi-Stage Bladed Rotor Shaft)
      const rotorGroup = new THREE.Group();
      const rotorSteelMat = new THREE.MeshStandardMaterial({
        color: 0x94A3B8,
        metalness: 0.88,
        roughness: 0.22
      });
      const bladeMat = new THREE.MeshStandardMaterial({
        color: 0x64748B,
        metalness: 0.92,
        roughness: 0.25
      });

      // Central Rotor Shaft Cylinder (tilted ~28 degrees)
      const shaftLength = 9.5;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, shaftLength, 24), rotorSteelMat);
      shaft.castShadow = true;
      rotorGroup.add(shaft);

      // Multi-stage bladed turbine disks (HP -> IP -> LP stages)
      const stages = [
        // Low Pressure (LP) - Largest bladed wheels
        { pos: -3.4, radius: 1.45, thick: 0.28 },
        { pos: -2.8, radius: 1.35, thick: 0.28 },
        { pos: -2.2, radius: 1.25, thick: 0.26 },
        { pos: -1.6, radius: 1.15, thick: 0.24 },
        // Intermediate Pressure (IP)
        { pos: -0.8, radius: 1.0, thick: 0.22 },
        { pos: -0.2, radius: 0.92, thick: 0.22 },
        { pos: 0.4, radius: 0.85, thick: 0.20 },
        { pos: 1.0, radius: 0.80, thick: 0.20 },
        // High Pressure (HP) - Compact stages
        { pos: 1.8, radius: 0.72, thick: 0.18 },
        { pos: 2.3, radius: 0.68, thick: 0.18 },
        { pos: 2.8, radius: 0.64, thick: 0.16 },
        { pos: 3.3, radius: 0.60, thick: 0.16 }
      ];

      stages.forEach(st => {
        const disk = new THREE.Mesh(new THREE.CylinderGeometry(st.radius, st.radius, st.thick, 28), bladeMat);
        disk.position.y = st.pos;
        disk.castShadow = true;
        rotorGroup.add(disk);

        const rim = new THREE.Mesh(new THREE.TorusGeometry(st.radius, 0.03, 8, 28), rotorSteelMat);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = st.pos;
        rotorGroup.add(rim);
      });

      // Tilt rotor ~28° along diagonal axis
      rotorGroup.rotation.z = -0.48;
      rotorGroup.rotation.y = 0.55;
      rotorGroup.position.set(0, 2.5, 0);
      scGroup.add(rotorGroup);

      // 4. Tall Thai National Flagpole (เสาธงชาติไทย สูง 14 ม.)
      const flagPoleMat = new THREE.MeshStandardMaterial({ color: 0xF8FAFC, metalness: 0.9, roughness: 0.2 });
      const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 14, 12), flagPoleMat);
      flagPole.position.set(4.8, 7.0, 3.5);
      flagPole.castShadow = true;
      scGroup.add(flagPole);

      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), new THREE.MeshStandardMaterial({ color: 0xEAB308, metalness: 0.9 }));
      finial.position.set(4.8, 14.1, 3.5);
      scGroup.add(finial);

      // Thai Flag Banner (Red, White, Blue, White, Red stripes)
      const flagCanvas = document.createElement('canvas');
      flagCanvas.width = 180;
      flagCanvas.height = 120;
      const fctx = flagCanvas.getContext('2d');
      const fh = 120;
      fctx.fillStyle = '#EF4444'; fctx.fillRect(0, 0, 180, fh / 6);
      fctx.fillStyle = '#FFFFFF'; fctx.fillRect(0, fh / 6, 180, fh / 6);
      fctx.fillStyle = '#1E3A8A'; fctx.fillRect(0, (2 * fh) / 6, 180, (2 * fh) / 6);
      fctx.fillStyle = '#FFFFFF'; fctx.fillRect(0, (4 * fh) / 6, 180, fh / 6);
      fctx.fillStyle = '#EF4444'; fctx.fillRect(0, (5 * fh) / 6, 180, fh / 6);

      const flagTex = new THREE.CanvasTexture(flagCanvas);
      const flagMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(3.2, 2.1),
        new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.7 })
      );
      flagMesh.position.set(4.8 + 1.6, 12.8, 3.5);
      scGroup.add(flagMesh);

      // Decorative shrubbery around the plaza
      const bushMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.85 });
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
        const bush = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 8), bushMat);
        bush.position.set(Math.cos(a) * 6.0, 0.45, Math.sin(a) * 6.0);
        scGroup.add(bush);
      }

      this.scene.add(scGroup);
      this.landmarkMeshes.set('TURBINE_SCULPTURE', scGroup);
    }

    setupLandmarkLabels() {
      const landmarks = [
        { id: 'SW_YARD', text: '⚡ สวิตช์ยาร์ด 500 kV', x: -45, y: 19, z: 205, color: '#D97706' },
        { id: 'FOOTBALL', text: '⚽ สนามฟุตบอล', x: 145, y: 8, z: -125, color: '#16A34A' },
        { id: 'POND_RETENTION_1', text: '💧 สระน้ำ 1, 2, 3', x: -120, y: 7, z: -45, color: '#0284C7' },
        { id: 'CAMPUS_ENTRANCE', text: '🚧 ทางเข้าหลัก / ท.0021 ที่ทำการ รปภ.', x: 40, y: 8, z: 140, color: '#475569' },
        { id: 'EAST_ROUNDABOUT', text: '🧪 วงเวียนหน้า ท.0018 / ท.0016', x: 200, y: 8, z: -165, color: '#2563EB' },
        { id: 'TURBINE_SCULPTURE', text: '⚙️ ปฏิมากรรมกังหันไอน้ำ', x: 95, y: 14, z: 30, color: '#EA580C' },
        { id: 'SUNFLOWER_FIELD', text: '🌻 ทุ่งทานตะวัน & ป้าย กฟผ.', x: -15, y: 8, z: 260, color: '#EAB308' },
        // OHK Specific Landmark Pins (No Soccer field in OHK)
        { id: 'OHK_ROUNDABOUT', text: '🚛 วงเวียนใหญ่ศูนย์ขนส่ง อหข.', x: -265, y: 10, z: -160, color: '#7C3AED' },
        { id: 'OHK_RETENTION_POND', text: '💧 สระน้ำ & ศาลาริมน้ำ อหข.', x: -200, y: 8, z: -95, color: '#0284C7' },
        { id: 'TRANS_LINE_ANGTHONG', text: '⚡ สายส่ง 230 kV อ่างทอง 2', x: -175, y: 28, z: -230, color: '#EF4444' }
      ];

      landmarks.forEach(lm => {
        const sprite = this.createLandmarkSprite(lm.text, lm.color);
        sprite.name = lm.id;
        sprite.userData = { id: lm.id };
        sprite.position.set(lm.x, lm.y, lm.z);
        this.scene.add(sprite);
        this.landmarkSprites.push(sprite);
      });
    }

    createLandmarkSprite(text, accentColor = '#D97706') {
      const canvas = document.createElement('canvas');
      canvas.width = 360;
      canvas.height = 70;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.beginPath();
      ctx.roundRect(6, 6, 348, 58, 29);
      ctx.fill();

      ctx.lineWidth = 3;
      ctx.strokeStyle = accentColor;
      ctx.stroke();

      ctx.font = 'bold 21px Sarabun, sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(text, 180, 42);

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;

      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(16, 3.2, 1);
      return sprite;
    }

    /* ═════════════════════════════════════════════════════════════════
       Procedural 3D Architectural Generation for Buildings
       ═════════════════════════════════════════════════════════════════ */
    populateBuildings(buildingsList) {
      this.buildingMeshes.forEach(mesh => this.scene.remove(mesh));
      this.buildingMeshes.clear();
      this.labelSprites.forEach(sprite => this.scene.remove(sprite));
      this.labelSprites.clear();
      this.warningSprites.forEach(sprite => this.scene.remove(sprite));
      this.warningSprites.clear();
      this.windowMeshes = [];

      buildingsList.forEach(bData => {
        const buildingGroup = this.createBuildingMesh(bData);
        if (bData.hidden) buildingGroup.visible = false;
        this.scene.add(buildingGroup);
        this.buildingMeshes.set(bData.b_code, buildingGroup);

        // Collect window meshes for day/night illumination
        buildingGroup.traverse((child) => {
          if (child.isMesh && child.material && child !== buildingGroup.children[0]) {
            const mat = child.material;
            if (mat.roughness < 0.35 && mat.metalness > 0.4) {
              child.userData.isWindow = true;
              this.windowMeshes.push(child);
            }
          }
        });

        const labelSprite = this.createLabelSprite(bData);
        if (bData.hidden) labelSprite.visible = false;
        this.scene.add(labelSprite);
        this.labelSprites.set(bData.b_code, labelSprite);

        const hasQualityWarn = bData.quality_status !== 'normal';
        const hasTargetAlert = bData.target_status === 'exceeded' && bData.target_variance_pct !== null && bData.target_variance_pct > 10;
        const hasSurgeAlert = bData.mom_change_pct !== null && bData.mom_change_pct > 20;

        if (hasQualityWarn || hasTargetAlert || hasSurgeAlert) {
          const warnSprite = this.createWarningSprite(bData, { hasQualityWarn, hasTargetAlert, hasSurgeAlert });
          if (bData.hidden) warnSprite.visible = false;
          this.scene.add(warnSprite);
          this.warningSprites.set(bData.b_code, warnSprite);
        }
      });

      this.needsRender = true;
    }

    createBuildingMesh(bData) {
      const group = new THREE.Group();
      group.name = bData.b_code;
      group.userData = { b_code: bData.b_code, data: bData };

      const { width, depth, height } = bData.dimensions;
      const { x, z } = bData.layout_position;
      const colorInfo = window.EnergyTwin.getColorForBuilding(bData);

      // Primary Wall Material
      const mainMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(colorInfo.hex),
        roughness: 0.45,
        metalness: 0.15
      });
      group.userData.mainMaterial = mainMat;

      // Concrete Plinth Foundation
      const plinthMat = new THREE.MeshStandardMaterial({ color: 0x94A3B8, roughness: 0.85 });
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(width + 1.2, 0.4, depth + 1.2), plinthMat);
      plinth.position.y = 0.2;
      plinth.receiveShadow = true;
      group.add(plinth);

      // Wall Geometry
      const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mainMat);
      wallMesh.position.y = height / 2 + 0.2;
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      group.add(wallMesh);
      group.userData.wallMesh = wallMesh;

      // ── Architectural Detailing by Category & Real Photo Visuals ──
      const roofType = bData.roof_type;

      // OHK Specific Architecture
      if (roofType === 'ohk_office_t0026') {
        this.buildOHKOfficeT0026(group, width, depth, height);
      } else if (roofType === 'ohk_garage_t0027') {
        this.buildOHKGarageT0027(group, width, depth, height);
      } else if (roofType === 'ohk_heavy_garage_t0028') {
        this.buildOHKHeavyGarageT0028(group, width, depth, height);
      } else if (roofType === 'ohk_heavy_workshop_t0029') {
        this.buildOHKHeavyWorkshopT0029(group, width, depth, height);
      } else if (roofType === 'ohk_workshop_heavy' || roofType === 'ohk_heavy_workshop') {
        this.buildOHKHeavyWorkshop(group, width, depth, height, bData.b_code);
      } else if (roofType === 'ohk_canteen_d0031') {
        this.buildOHKCanteenD0031(group, width, depth, height);
      } else if (roofType === 'ohk_welding_d0033') {
        this.buildOHKWeldingD0033(group, width, depth, height);
      }
      // Campus Main Architecture
      else if (roofType === 'metrology_center_t0018' || (roofType === 'office_stepped' && bData.b_code === 'T.0018')) {
        this.buildMetrologyT0018(group, width, depth, height);
      } else if (roofType === 'chemical_workshop_t0016') {
        this.buildChemicalWorkshopT0016(group, width, depth, height);
      } else if (roofType === 'competency_curved_t0017') {
        this.buildCompetencyT0017(group, width, depth, height);
      } else if (roofType === 'sports_pilotis_d0025') {
        this.buildSportsComplexD0025(group, width, depth, height);
      } else if (roofType === 'chem_lab_t0015') {
        this.buildChemLabT0015(group, width, depth, height);
      } else if (roofType === 'competency_center_t0020' || roofType === 'competency_center' || bData.b_code === 'T.0020') {
        this.buildCompetencyCenterT0020(group, width, depth, height);
      } else if (roofType === 'office_tower_9fl' || (roofType === 'office_stepped' && bData.b_code === 'T.0019')) {
        this.buildOfficeTower9Fl(group, width, depth, height);
      } else if (roofType === 'parking_complex' || (roofType === 'office_stepped' && bData.b_code === 'D.0019')) {
        this.buildParkingComplex(group, width, depth, height);
      } else if (roofType === 'curved_hall' || roofType === 'curved_barrel') {
        this.buildCurvedHall(group, width, depth, height);
      } else if (roofType === 'gabled_large') {
        this.buildLargeWorkshop(group, width, depth, height);
      } else if (roofType === 'gabled_warehouse' || roofType === 'gabled' || roofType === 'industrial_gable') {
        this.buildGabledWarehouse(group, width, depth, height);
      } else if (roofType === 'lab_modern') {
        this.buildModernLab(group, width, depth, height);
      } else if (roofType === 'residential_balcony') {
        this.buildResidentialFlat(group, width, depth, height);
      } else if (roofType === 'canteen_curved' || roofType === 'canteen' || bData.b_code === 'D.0017') {
        this.buildCanteen(group, width, depth, height);
      } else if (roofType === 'utility_tank' || bData.b_code === 'D.0026') {
        this.buildUtilityWaterStation(group, width, depth, height);
      } else {
        const parapetMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 });
        const parapet = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4, 0.6, depth + 0.4), parapetMat);
        parapet.position.y = height + 0.3;
        parapet.castShadow = true;
        group.add(parapet);
      }

      // Directional facing indicators are rendered exclusively in the 2D Layout Studio for clean photorealism in 3D

      // Position & Orientation in Master Plan Coordinates
      group.position.set(x, 0, z);
      if (bData.rotation_y) {
        group.rotation.y = bData.rotation_y;
      }

      return group;
    }

    /* ═════════════════════════════════════════════════════════════════
       OHK Specific Architectural Builders
       ═════════════════════════════════════════════════════════════════ */
    // T.0026: อาคารบริหารการขนส่ง (ที่ทำการ อหข. 3 ชั้น - Matching photo: ท.0026.JPG)
    buildOHKOfficeT0026(group, width, depth, height) {
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x60A5FA, metalness: 0.8, roughness: 0.2 });
      const yellowMat = new THREE.MeshStandardMaterial({ color: 0xEAB308, roughness: 0.35, metalness: 0.15 }); // Bright EGAT Yellow Grid Frame
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.65 });

      // 1. Three tiers of continuous ribbon glass windows
      const floors = 3;
      const flH = height / floors;
      for (let f = 1; f <= floors; f++) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(width + 0.25, flH * 0.48, depth + 0.25), glassMat);
        win.position.y = f * flH - flH * 0.26 + 0.2;
        group.add(win);
      }

      // 2. Prominent Bright EGAT Yellow External Structural Grid Frame (Matching photo: ท.0026.JPG)
      const gridSpacing = width / 5;
      for (let i = 0; i <= 5; i++) {
        const gx = -width / 2 + i * gridSpacing;
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.5, height + 0.6, 0.6), yellowMat);
        col.position.set(gx, (height + 0.6) / 2 + 0.2, depth / 2 + 0.3);
        col.castShadow = true;
        group.add(col);
      }

      // Horizontal yellow beams along floor levels and roofline
      for (let f = 1; f <= floors + 1; f++) {
        const beamY = (f - 1) * flH + 0.2;
        const beam = new THREE.Mesh(new THREE.BoxGeometry(width + 0.8, 0.45, 0.6), yellowMat);
        beam.position.set(0, beamY, depth / 2 + 0.3);
        beam.castShadow = true;
        group.add(beam);
      }

      // 3. Low-slope Gabled Roof with Yellow Fascia Soffit
      const roofH = 2.4;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(width, depth) * 0.65, roofH, 4), roofMat);
      roof.position.y = height + roofH / 2 + 0.2;
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(width / Math.max(width, depth), 1, depth / Math.max(width, depth));
      roof.castShadow = true;
      group.add(roof);

      const fascia = new THREE.Mesh(new THREE.BoxGeometry(width + 1.6, 0.35, depth + 1.6), yellowMat);
      fascia.position.y = height + 0.2;
      group.add(fascia);

      // 4. Front Entrance Drop-Off Canopy with Yellow Columns
      const canopy = new THREE.Mesh(
        new THREE.BoxGeometry(11, 0.4, 5.0),
        new THREE.MeshStandardMaterial({ color: 0xF8FAFC, roughness: 0.4 })
      );
      canopy.position.set(0, 3.6, depth / 2 + 2.5);
      canopy.castShadow = true;
      group.add(canopy);

      [-4.8, 4.8].forEach(cx => {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 3.6, 12), yellowMat);
        col.position.set(cx, 1.8, depth / 2 + 4.6);
        col.castShadow = true;
        group.add(col);
      });

      // 5. Arched Carport Wing on the West Side (Matching photo: ท.0026.JPG)
      const carportRoof = new THREE.Mesh(
        new THREE.BoxGeometry(10, 0.3, 14),
        new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 })
      );
      carportRoof.position.set(-width / 2 - 5, 3.2, 0);
      carportRoof.castShadow = true;
      group.add(carportRoof);

      // Circular Stepped Front Plaza
      const plaza = new THREE.Mesh(
        new THREE.CylinderGeometry(6, 6.5, 0.25, 24),
        new THREE.MeshStandardMaterial({ color: 0xE2E8F0, roughness: 0.7 })
      );
      plaza.position.set(0, 0.12, depth / 2 + 6);
      plaza.receiveShadow = true;
      group.add(plaza);
    }

    // T.0027: อาคารโรงจอดยานพาหนะ (อขน.) - 62m Steel Frame Multi-Bay Shed
    buildOHKGarageT0027(group, width, depth, height) {
      const steelMat = new THREE.MeshStandardMaterial({ color: 0xB91C1C, metalness: 0.6, roughness: 0.4 }); // Red steel trusses
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.75 });

      // Corrugated Pitched Roof
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(width, depth) * 0.55, 3.5, 4),
        roofMat
      );
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(width / Math.max(width, depth), 1, depth / Math.max(width, depth));
      roof.position.y = height + 1.75 + 0.2;
      roof.castShadow = true;
      group.add(roof);

      // 12 Drive-Through Open Service / Inspection Bays along the length
      const bayCount = 10;
      const baySpacing = depth / bayCount;
      const bayMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.9 });

      for (let i = 0; i < bayCount; i++) {
        const bz = -depth / 2 + (i + 0.5) * baySpacing;

        // Structural steel columns
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.5, height, 0.5), steelMat);
        col.position.set(-width / 2 - 0.1, height / 2 + 0.2, bz);
        col.castShadow = true;
        group.add(col);

        // Service Door Openings
        const door = new THREE.Mesh(new THREE.PlaneGeometry(0.1, height * 0.75), bayMat);
        door.position.set(-width / 2 - 0.05, height * 0.4 + 0.2, bz);
        group.add(door);
      }
    }

    // T.0028 & T.0029: อาคารปฏิบัติการ 1-2 (ซ่อมเครื่องจักรกลหนัก) with Overhead Crane Bay
    buildOHKHeavyWorkshop(group, width, depth, height, bCode) {
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 });
      const roofH = 4.5;

      // Heavy Workshop Gabled Roof
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(width, depth) * 0.72, roofH, 4),
        roofMat
      );
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(width / Math.max(width, depth), 1, depth / Math.max(width, depth));
      roof.position.y = height + roofH / 2 + 0.2;
      roof.castShadow = true;
      group.add(roof);

      // Central Overhead Crane Ridge (32m Crane Bay Clerestory Monitor)
      const craneRidge = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.55, 2.2, depth * 0.75),
        new THREE.MeshStandardMaterial({ color: 0x64748B, roughness: 0.6 })
      );
      craneRidge.position.y = height + roofH + 1.1;
      craneRidge.castShadow = true;
      group.add(craneRidge);

      // High Roller Shutter Bay Doors for Heavy Equipment / Trucks
      const doorMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.85 });
      const hazardMat = new THREE.MeshStandardMaterial({ color: 0xF59E0B });

      [-width * 0.25, 0, width * 0.25].forEach(dx => {
        const door = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.22, height * 0.72), doorMat);
        door.position.set(dx, height * 0.36 + 0.2, depth / 2 + 0.06);
        group.add(door);

        const curbStripe = new THREE.Mesh(new THREE.BoxGeometry(width * 0.24, 0.3, 0.4), hazardMat);
        curbStripe.position.set(dx, 0.15, depth / 2 + 0.2);
        group.add(curbStripe);
      });

      // Side 2-Story Tool Room / Administrative Annex
      const annex = new THREE.Mesh(
        new THREE.BoxGeometry(6, height * 0.8, depth * 0.6),
        new THREE.MeshStandardMaterial({ color: 0xE2E8F0 })
      );
      annex.position.set(-width / 2 - 3, height * 0.4 + 0.2, 0);
      annex.castShadow = true;
      group.add(annex);

      // Covered Connector Canopy between T.0028 and T.0029
      if (bCode === 'T.0028') {
        const connector = new THREE.Mesh(
          new THREE.BoxGeometry(16, 0.4, depth * 0.45),
          new THREE.MeshStandardMaterial({ color: 0x475569 })
        );
        connector.position.set(-width / 2 - 8, height * 0.75, 0);
        connector.castShadow = true;
        group.add(connector);
      }
    }

    // T.0028: อาคารปฏิบัติการ 1 ซ่อมเครื่องจักรกลหนัก อหข. (Heavy Garage 1 - Matching photo: เล็กๆ ท.0027 ท.0028 และขวาสุด ท.0029.JPG)
    buildOHKHeavyGarageT0028(group, width, depth, height) {
      const roofRadius = width * 0.62;
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.68 });
      const doorMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.85 });
      const yellowMat = new THREE.MeshStandardMaterial({ color: 0xEAB308, roughness: 0.4 });
      const hazardMat = new THREE.MeshStandardMaterial({ color: 0xF59E0B });

      // 1. Curved Eave Roof
      const curveGeo = new THREE.CylinderGeometry(roofRadius, roofRadius, depth + 1.0, 32, 1, false, 0, Math.PI);
      const curvedRoof = new THREE.Mesh(curveGeo, roofMat);
      curvedRoof.rotation.z = Math.PI / 2;
      curvedRoof.rotation.y = Math.PI / 2;
      curvedRoof.position.set(0, height + 0.2, 0);
      curvedRoof.castShadow = true;
      group.add(curvedRoof);

      // Central Roof Ridge Monitor
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(width * 0.7, 1.4, depth * 0.3), new THREE.MeshStandardMaterial({ color: 0x64748B }));
      ridge.position.y = height + roofRadius * 0.45 + 0.7;
      ridge.castShadow = true;
      group.add(ridge);

      // 2. Exactly 4 Dark Grey Roller Shutter Doors
      const doorW = width * 0.18;
      const doorH = height * 0.7;
      const doorSpacing = width / 4.5;
      for (let i = 0; i < 4; i++) {
        const dx = -width * 0.36 + i * doorSpacing;
        const door = new THREE.Mesh(new THREE.PlaneGeometry(doorW, doorH), doorMat);
        door.position.set(dx, doorH / 2 + 0.2, depth / 2 + 0.06);
        group.add(door);

        const stripe = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.2, 0.25, 0.35), hazardMat);
        stripe.position.set(dx, 0.12, depth / 2 + 0.18);
        group.add(stripe);
      }

      // 3. External Yellow Steel Emergency Stair on the right side
      const stair = new THREE.Mesh(new THREE.BoxGeometry(2.2, height * 0.8, 5.5), yellowMat);
      stair.position.set(width / 2 + 1.2, height * 0.4 + 0.2, 0);
      stair.rotation.x = 0.45;
      stair.castShadow = true;
      group.add(stair);

      // Connector canopy towards T.0029
      const connector = new THREE.Mesh(
        new THREE.BoxGeometry(14, 0.4, depth * 0.45),
        new THREE.MeshStandardMaterial({ color: 0x475569 })
      );
      connector.position.set(-width / 2 - 7, height * 0.75, 0);
      connector.castShadow = true;
      group.add(connector);
    }

    // T.0029: อาคารปฏิบัติการ 2 ซ่อมเครื่องจักรกลหนัก อหข. (Heavy Workshop 2)
    buildOHKHeavyWorkshopT0029(group, width, depth, height) {
      const roofRadius = width * 0.65;
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.68 });
      const doorMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.85 });
      const yellowMat = new THREE.MeshStandardMaterial({ color: 0xEAB308, roughness: 0.4 });

      // 1. Wide Curved Roof Profile
      const curveGeo = new THREE.CylinderGeometry(roofRadius, roofRadius, depth + 1.2, 32, 1, false, 0, Math.PI);
      const curvedRoof = new THREE.Mesh(curveGeo, roofMat);
      curvedRoof.rotation.z = Math.PI / 2;
      curvedRoof.rotation.y = Math.PI / 2;
      curvedRoof.position.set(0, height + 0.2, 0);
      curvedRoof.castShadow = true;
      group.add(curvedRoof);

      // Raised 32m Overhead Crane Clerestory Monitor Ridge
      const craneMonitor = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.6, 2.4, depth * 0.8),
        new THREE.MeshStandardMaterial({ color: 0x64748B, roughness: 0.6 })
      );
      craneMonitor.position.y = height + roofRadius * 0.45 + 1.2;
      craneMonitor.castShadow = true;
      group.add(craneMonitor);

      // Yellow exterior column supports along facade
      [-width * 0.45, -width * 0.15, width * 0.15, width * 0.45].forEach(cx => {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.8, height, 0.8), yellowMat);
        col.position.set(cx, height / 2 + 0.2, depth / 2 + 0.4);
        col.castShadow = true;
        group.add(col);
      });

      // 2. Oversized Heavy Vehicle Equipment Bay Doors
      [-width * 0.28, width * 0.28].forEach(dx => {
        const door = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.28, height * 0.78), doorMat);
        door.position.set(dx, height * 0.39 + 0.2, depth / 2 + 0.06);
        group.add(door);

        const ramp = new THREE.Mesh(new THREE.BoxGeometry(width * 0.3, 0.2, 4.0), new THREE.MeshStandardMaterial({ color: 0xCBD5E1 }));
        ramp.position.set(dx, 0.1, depth / 2 + 2.0);
        ramp.receiveShadow = true;
        group.add(ramp);
      });
    }

    // D.0031: อาคารโรงอาหาร อหข.
    buildOHKCanteenD0031(group, width, depth, height) {
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.6 });
      const roof = new THREE.Mesh(new THREE.BoxGeometry(width + 3, 0.8, depth + 3), roofMat);
      roof.position.y = height + 0.4 + 0.2;
      roof.castShadow = true;
      group.add(roof);

      // Outdoor covered patio facing the pond
      const patio = new THREE.Mesh(
        new THREE.BoxGeometry(width + 5, 0.2, depth + 5),
        new THREE.MeshStandardMaterial({ color: 0xE2E8F0, roughness: 0.7 })
      );
      patio.position.y = 0.15;
      patio.receiveShadow = true;
      group.add(patio);
    }

    // D.0033: อาคารปฏิบัติการงานเชื่อม อหข.
    buildOHKWeldingD0033(group, width, depth, height) {
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 });
      const roofH = 2.8;

      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(width, depth) * 0.74, roofH, 4),
        roofMat
      );
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(width / Math.max(width, depth), 1, depth / Math.max(width, depth));
      roof.position.y = height + roofH / 2 + 0.2;
      roof.castShadow = true;
      group.add(roof);

      // Industrial Ventilation Extraction Exhaust Ducts
      const ductMat = new THREE.MeshStandardMaterial({ color: 0xCBD5E1, metalness: 0.8 });
      [-width * 0.2, width * 0.2].forEach(dx => {
        const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 2.5, 12), ductMat);
        duct.position.set(dx, height + roofH + 1.25, 0);
        duct.castShadow = true;
        group.add(duct);
      });
    }

    /* ═════════════════════════════════════════════════════════════════
       Campus Main Architectural Builders
       ═════════════════════════════════════════════════════════════════ */
    buildOfficeTower9Fl(group, width, depth, height) {
      const glassMat = new THREE.MeshStandardMaterial({
        color: 0x60A5FA,
        metalness: 0.85,
        roughness: 0.15
      });
      const floors = 9;
      const floorH = height / floors;

      for (let f = 1; f < floors; f++) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, floorH * 0.48, depth + 0.3), glassMat);
        win.position.y = f * floorH + 0.2;
        group.add(win);
      }

      // Front Grand Entrance Canopy with Columns
      const canopyH = 6.5;
      const canopyD = 8;
      const canopyW = 16;
      const canopyMat = new THREE.MeshStandardMaterial({ color: 0xE2E8F0, roughness: 0.4 });
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(canopyW, 0.6, canopyD), canopyMat);
      canopy.position.set(0, canopyH, depth / 2 + canopyD / 2);
      canopy.castShadow = true;
      group.add(canopy);

      const colMat = new THREE.MeshStandardMaterial({ color: 0xCBD5E1 });
      [-canopyW / 2 + 1, canopyW / 2 - 1].forEach(cx => {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, canopyH, 12), colMat);
        col.position.set(cx, canopyH / 2, depth / 2 + canopyD - 1);
        col.castShadow = true;
        group.add(col);
      });

      // Rooftop Mechanical Penthouse
      const mechH = 4.2;
      const mech = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.42, mechH, depth * 0.42),
        new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.65 })
      );
      mech.position.set(0, height + mechH / 2 + 0.2, 0);
      mech.castShadow = true;
      group.add(mech);

      // Antenna Mast
      const mastMat = new THREE.MeshStandardMaterial({ color: 0xE2E8F0, metalness: 0.9 });
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.25, 11, 8), mastMat);
      mast.position.set(0, height + mechH + 5.5, 0);
      mast.castShadow = true;
      group.add(mast);
    }

    // T.0018: ศูนย์มาตรวิทยาและสอบเทียบเครื่องมือวัด กฟผ. (Metrology and Calibration Center - Matching photo: ท.0018.jpg)
    buildMetrologyT0018(group, width, depth, height) {
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x93C5FD, metalness: 0.8, roughness: 0.2 });
      const orangeMat = new THREE.MeshStandardMaterial({ color: 0xEA580C, roughness: 0.38, metalness: 0.1 }); // Vibrant EGAT Orange
      const louverMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 });
      const canopyMat = new THREE.MeshStandardMaterial({ color: 0xF8FAFC, roughness: 0.3 });
      const steelMat = new THREE.MeshStandardMaterial({ color: 0xCBD5E1, metalness: 0.8 });

      // 1. Two-level continuous ribbon windows
      [height * 0.35, height * 0.72].forEach(wy => {
        const win = new THREE.Mesh(new THREE.BoxGeometry(width + 0.25, 1.6, depth + 0.25), glassMat);
        win.position.y = wy + 0.2;
        group.add(win);
      });

      // 2. Vertical Solar Louver Fins on Upper Story (Shading windows)
      for (let lx = -width * 0.38; lx <= width * 0.12; lx += 2.0) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.4, 0.7), louverMat);
        fin.position.set(lx, height * 0.72 + 0.2, depth / 2 + 0.36);
        fin.castShadow = true;
        group.add(fin);
      }

      // 3. Iconic Vibrant EGAT Orange Entrance Cube Tower (Southwest corner)
      const towerW = 8.5;
      const towerD = 8.5;
      const towerH = height + 3.2;
      const orangeTower = new THREE.Mesh(new THREE.BoxGeometry(towerW, towerH, towerD), orangeMat);
      orangeTower.position.set(width / 2 - towerW / 2 + 0.5, towerH / 2 + 0.2, depth / 2 - towerD / 2 + 0.5);
      orangeTower.castShadow = true;
      group.add(orangeTower);

      // Floating horizontal orange cantilever beam
      const orangeBeam = new THREE.Mesh(new THREE.BoxGeometry(width * 0.65, 1.2, 1.0), orangeMat);
      orangeBeam.position.set(width * 0.1, height * 0.85 + 0.2, depth / 2 + 0.8);
      orangeBeam.castShadow = true;
      group.add(orangeBeam);

      // 4. Cantilevered Drop-Off Entrance Canopy underneath tower
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(10, 0.45, 6), canopyMat);
      canopy.position.set(width / 2 - towerW / 2 + 0.5, 3.8, depth / 2 + 3.0);
      canopy.castShadow = true;
      group.add(canopy);

      [-3.8, 3.8].forEach(cx => {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3.8, 12), steelMat);
        col.position.set(width / 2 - towerW / 2 + 0.5 + cx, 1.9, depth / 2 + 5.5);
        col.castShadow = true;
        group.add(col);
      });

      // 5. Heavy Calibration Workshop Roll-up Bay Door (North Wing)
      const doorMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.85 });
      const door = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.28, height * 0.68), doorMat);
      door.position.set(-width * 0.25, height * 0.34 + 0.2, depth / 2 + 0.06);
      group.add(door);

      // Rooftop Parapet
      const parapetMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 });
      const parapet = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4, 0.6, depth + 0.4), parapetMat);
      parapet.position.y = height + 0.3;
      group.add(parapet);
    }

    // T.0016: อาคารปฏิบัติการเคมี (Chemical Workshop - Matching photo: ท.0016.JPG)
    buildChemicalWorkshopT0016(group, width, depth, height) {
      const roofRadius = width * 0.58;
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 });
      const orangeMat = new THREE.MeshStandardMaterial({ color: 0xEA580C, roughness: 0.4 });
      const portalMat = new THREE.MeshStandardMaterial({ color: 0xF8FAFC, roughness: 0.3 });
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x93C5FD, metalness: 0.8, roughness: 0.2 });

      // 1. Curved Barrel Roof Profile with Orange Fascia Trim
      const curveGeo = new THREE.CylinderGeometry(roofRadius, roofRadius, depth + 0.6, 32, 1, false, 0, Math.PI);
      const curvedRoof = new THREE.Mesh(curveGeo, roofMat);
      curvedRoof.rotation.z = Math.PI / 2;
      curvedRoof.rotation.y = Math.PI / 2;
      curvedRoof.position.set(0, height + 0.2, 0);
      curvedRoof.castShadow = true;
      group.add(curvedRoof);

      // Orange Roof Edge Trim Band
      const trimGeo = new THREE.CylinderGeometry(roofRadius + 0.08, roofRadius + 0.08, 0.4, 32, 1, false, 0, Math.PI);
      const trimFront = new THREE.Mesh(trimGeo, orangeMat);
      trimFront.rotation.z = Math.PI / 2;
      trimFront.rotation.y = Math.PI / 2;
      trimFront.position.set(0, height + 0.2, depth / 2 + 0.2);
      group.add(trimFront);

      // 2. Signature White & EGAT Orange Arch Entrance Portal (Matching photo: ท.0016.JPG)
      const portalW = 8.0;
      const portalH = 4.8;
      const pFrame = new THREE.Mesh(new THREE.BoxGeometry(portalW, portalH, 1.4), portalMat);
      pFrame.position.set(-width * 0.22, portalH / 2 + 0.2, depth / 2 + 0.7);
      pFrame.castShadow = true;
      group.add(pFrame);

      const orangeInner = new THREE.Mesh(new THREE.BoxGeometry(portalW - 1.2, portalH - 0.8, 1.5), orangeMat);
      orangeInner.position.set(-width * 0.22, portalH / 2 + 0.2, depth / 2 + 0.7);
      group.add(orangeInner);

      const doorMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.5 });
      const door = new THREE.Mesh(new THREE.BoxGeometry(portalW - 2.4, portalH - 1.6, 1.6), doorMat);
      door.position.set(-width * 0.22, (portalH - 1.6) / 2 + 0.2, depth / 2 + 0.7);
      group.add(door);

      // 3. Horizontal Metal Solar Louvre Screens (Above laboratory windows)
      const louverMat = new THREE.MeshStandardMaterial({ color: 0x64748B, roughness: 0.65 });
      const win = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.45, 1.8), glassMat);
      win.position.set(width * 0.22, height * 0.55 + 0.2, depth / 2 + 0.06);
      group.add(win);

      for (let ly = height * 0.5; ly <= height * 0.75; ly += 0.4) {
        const louverBlade = new THREE.Mesh(new THREE.BoxGeometry(width * 0.46, 0.08, 0.45), louverMat);
        louverBlade.position.set(width * 0.22, ly + 0.2, depth / 2 + 0.25);
        group.add(louverBlade);
      }

      // Workshop Bay Roll-Up Shutter on East End
      const bayDoor = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.25, height * 0.7), doorMat);
      bayDoor.position.set(width * 0.32, height * 0.35 + 0.2, -depth / 2 - 0.06);
      bayDoor.rotation.y = Math.PI;
      group.add(bayDoor);
    }

    // T.0017: ศูนย์พัฒนาศักยภาพบุคลากร (Competency Center - Matching photo: ขอบตึกเล็กๆ ท.0016 ท.0018 ท.0017 ต.0025.jpg)
    buildCompetencyT0017(group, width, depth, height) {
      const silverMat = new THREE.MeshStandardMaterial({
        color: 0xCBD5E1,
        metalness: 0.6,
        roughness: 0.35
      });
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x60A5FA, metalness: 0.85, roughness: 0.2 });
      const cowlMat = new THREE.MeshStandardMaterial({ color: 0x64748B, metalness: 0.7, roughness: 0.4 });

      // 1. Curved Roof Eaves
      const roofRadius = width * 0.55;
      const curveGeo = new THREE.CylinderGeometry(roofRadius, roofRadius, depth + 0.8, 32, 1, false, 0, Math.PI);
      const curvedRoof = new THREE.Mesh(curveGeo, silverMat);
      curvedRoof.rotation.z = Math.PI / 2;
      curvedRoof.rotation.y = Math.PI / 2;
      curvedRoof.position.set(0, height + 0.2, 0);
      curvedRoof.castShadow = true;
      group.add(curvedRoof);

      // 2. Exactly 6 Cylindrical Rooftop Cowl Exhaust Vents (Spaced along ridge)
      const cowlSpacing = (width * 0.8) / 5;
      for (let i = 0; i < 6; i++) {
        const cx = -width * 0.4 + i * cowlSpacing;
        const cowlStack = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.8, 12), cowlMat);
        cowlStack.position.set(cx, height + roofRadius * 0.48 + 0.9, 0);
        cowlStack.castShadow = true;
        group.add(cowlStack);

        const cowlCap = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.4, 12), cowlMat);
        cowlCap.position.set(cx, height + roofRadius * 0.48 + 1.9, 0);
        cowlCap.castShadow = true;
        group.add(cowlCap);
      }

      // 3. Continuous Ribbon Windows
      [height * 0.4, height * 0.72].forEach(wy => {
        const win = new THREE.Mesh(new THREE.BoxGeometry(width + 0.2, 1.5, depth + 0.2), glassMat);
        win.position.y = wy + 0.2;
        group.add(win);
      });

      // 4. Front Entrance Portico
      const portico = new THREE.Mesh(
        new THREE.BoxGeometry(8, 0.35, 4),
        new THREE.MeshStandardMaterial({ color: 0x0284C7 })
      );
      portico.position.set(0, 3.4, depth / 2 + 2);
      portico.castShadow = true;
      group.add(portico);
    }

    // D.0025: อาคารอเนกประสงค์ / กีฬา (Sports Complex - Matching photo: ต.0025.JPG)
    buildSportsComplexD0025(group, width, depth, height) {
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 });
      const colMat = new THREE.MeshStandardMaterial({ color: 0xCBD5E1, roughness: 0.85 });
      const emeraldGlassMat = new THREE.MeshStandardMaterial({
        color: 0x059669,
        metalness: 0.75,
        roughness: 0.2
      });

      // 1. High-Pitched Gabled Metal Roof
      const roofH = 4.2;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(width, depth) * 0.72, roofH, 4), roofMat);
      roof.position.y = height + roofH / 2 + 0.2;
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(width / Math.max(width, depth), 1, depth / Math.max(width, depth));
      roof.castShadow = true;
      group.add(roof);

      // 2. Ground Floor Open-Air Pilotis (เสาลอยเปิดโล่ง จอดรถยนต์ใต้ถุน)
      const pilotisHeight = height * 0.42;
      const colSpacingX = width / 4;
      const colSpacingZ = depth / 3;

      for (let ix = -width / 2 + 2; ix <= width / 2 - 2; ix += colSpacingX) {
        for (let iz = -depth / 2 + 2; iz <= depth / 2 - 2; iz += colSpacingZ) {
          const col = new THREE.Mesh(new THREE.BoxGeometry(0.7, pilotisHeight, 0.7), colMat);
          col.position.set(ix, pilotisHeight / 2 + 0.2, iz);
          col.castShadow = true;
          group.add(col);
        }
      }

      // Parked cars underneath pilotis
      const carColors = [0x1E40AF, 0xDC2626, 0xF8FAFC, 0x475569];
      [-width * 0.28, -width * 0.1, width * 0.1, width * 0.28].forEach((cx, idx) => {
        const carMat = new THREE.MeshStandardMaterial({ color: carColors[idx % carColors.length], roughness: 0.4 });
        const car = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.2, 4.2), carMat);
        car.position.set(cx, 0.8, (idx % 2 === 0 ? 1 : -1) * 2.5);
        car.castShadow = true;
        group.add(car);
      });

      // 3. Second Floor Continuous Emerald Ribbon Glass
      const win = new THREE.Mesh(new THREE.BoxGeometry(width + 0.25, height * 0.45, depth + 0.25), emeraldGlassMat);
      win.position.y = height * 0.7 + 0.2;
      group.add(win);

      // 4. Side Annex Structure (Lower equipment/changing room wing)
      const annex = new THREE.Mesh(
        new THREE.BoxGeometry(7, height * 0.5, depth * 0.65),
        new THREE.MeshStandardMaterial({ color: 0xE2E8F0, roughness: 0.7 })
      );
      annex.position.set(width / 2 + 3.5, height * 0.25 + 0.2, 0);
      annex.castShadow = true;
      group.add(annex);

      // External Concrete Staircase to 2nd Floor
      const stairMat = new THREE.MeshStandardMaterial({ color: 0x94A3B8, roughness: 0.8 });
      const stair = new THREE.Mesh(new THREE.BoxGeometry(2.4, height * 0.45, 6), stairMat);
      stair.position.set(-width / 2 - 1.2, height * 0.22 + 0.2, depth * 0.2);
      stair.rotation.x = 0.4;
      stair.castShadow = true;
      group.add(stair);
    }

    // T.0015: ศูนย์ปฏิบัติการทดสอบเคมี (Chemistry Laboratory Center 4 Fl - Matching photo: ท.0015.jpg)
    buildChemLabT0015(group, width, depth, height) {
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x93C5FD, metalness: 0.85, roughness: 0.2 });
      const darkCoreMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.7 });
      const canopyMat = new THREE.MeshStandardMaterial({ color: 0xF8FAFC, roughness: 0.4 });
      const carportMat = new THREE.MeshStandardMaterial({ color: 0x0284C7, roughness: 0.5 });

      // 1. 4-Story Window Bands
      const floors = 4;
      const flH = height / floors;
      for (let f = 1; f <= floors; f++) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(width + 0.2, flH * 0.48, depth + 0.2), glassMat);
        win.position.y = f * flH - flH * 0.25 + 0.2;
        group.add(win);
      }

      // 2. Dark Charcoal Vertical Stair / Elevator Core Tower on Corner
      const coreW = 6.5;
      const coreD = 6.5;
      const coreH = height + 2.5;
      const stairCore = new THREE.Mesh(new THREE.BoxGeometry(coreW, coreH, coreD), darkCoreMat);
      stairCore.position.set(width / 2 - coreW / 2 + 0.2, coreH / 2 + 0.2, -depth / 2 + coreD / 2 - 0.2);
      stairCore.castShadow = true;
      group.add(stairCore);

      // 3. Cantilevered Drop-Off Entrance Canopy with Accessible Ramp
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(10, 0.4, 5.5), canopyMat);
      canopy.position.set(-width * 0.15, 3.8, depth / 2 + 2.8);
      canopy.castShadow = true;
      group.add(canopy);

      // 4. Covered Carport in Front (Matching photo: ท.0015.jpg)
      const carportRoof = new THREE.Mesh(new THREE.BoxGeometry(16, 0.3, 7), carportMat);
      carportRoof.position.set(-width * 0.15, 3.2, depth / 2 + 8.5);
      carportRoof.castShadow = true;
      group.add(carportRoof);

      // Rooftop mechanical exhaust stacks
      [-width * 0.25, 0].forEach(sx => {
        const stack = new THREE.Mesh(
          new THREE.CylinderGeometry(0.35, 0.35, 2.8, 12),
          new THREE.MeshStandardMaterial({ color: 0xCBD5E1, metalness: 0.7 })
        );
        stack.position.set(sx, height + 1.4 + 0.2, 0);
        stack.castShadow = true;
        group.add(stack);
      });
    }

    // T.0020: ศูนย์รับรองสมรรถนะ (Competency Training Center - Matching photo: ลานปฏิมากรรม หน้า ท.0020.JPG)
    buildCompetencyCenterT0020(group, width, depth, height) {
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x60A5FA, metalness: 0.8, roughness: 0.2 });
      const stairMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7 });
      const railMat = new THREE.MeshStandardMaterial({ color: 0xEA580C, roughness: 0.4 }); // Vibrant Orange-Red Handrail

      // 1. Two-Story Ribbon Glass Windows
      [height * 0.35, height * 0.75].forEach(wy => {
        const win = new THREE.Mesh(new THREE.BoxGeometry(width + 0.25, 1.8, depth + 0.25), glassMat);
        win.position.y = wy + 0.2;
        group.add(win);
      });

      // 2. Open Steel Fire Escape Stair Tower on West End (Matching photo: ลานปฏิมากรรม หน้า ท.0020.JPG)
      const stairTower = new THREE.Group();
      const stH = height + 1.2;
      const stW = 4.0;
      const stD = 4.0;

      // 4 Corner steel columns
      [-stW / 2, stW / 2].forEach(ox => {
        [-stD / 2, stD / 2].forEach(oz => {
          const col = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, stH, 6), stairMat);
          col.position.set(ox, stH / 2 + 0.2, oz);
          stairTower.add(col);
        });
      });

      // Orange Handrails & landings
      [height * 0.5, height].forEach(ly => {
        const landing = new THREE.Mesh(new THREE.BoxGeometry(stW, 0.15, stD), stairMat);
        landing.position.y = ly + 0.2;
        stairTower.add(landing);

        const rail = new THREE.Mesh(new THREE.BoxGeometry(stW + 0.1, 0.9, stD + 0.1), railMat);
        rail.position.y = ly + 0.6 + 0.2;
        stairTower.add(rail);
      });

      stairTower.position.set(-width / 2 - stW / 2 - 0.4, 0, 0);
      group.add(stairTower);

      // 3. Entrance Canopy facing the Steam Turbine Plaza
      const canopy = new THREE.Mesh(
        new THREE.BoxGeometry(11, 0.4, 4),
        new THREE.MeshStandardMaterial({ color: 0x0284C7 })
      );
      canopy.position.set(0, 3.5, depth / 2 + 2);
      canopy.castShadow = true;
      group.add(canopy);

      // Rooftop Parapet
      const parapetMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 });
      const parapet = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4, 0.6, depth + 0.4), parapetMat);
      parapet.position.y = height + 0.3;
      group.add(parapet);
    }

    buildParkingComplex(group, width, depth, height) {
      const yellowBandMat = new THREE.MeshStandardMaterial({ color: 0xF59E0B, roughness: 0.4 });
      const slabMat = new THREE.MeshStandardMaterial({ color: 0xCBD5E1, roughness: 0.8 });
      const louverMat = new THREE.MeshStandardMaterial({ color: 0x64748B, roughness: 0.7 });

      const floors = 4;
      const floorH = height / floors;

      for (let f = 1; f <= floors; f++) {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(width + 0.6, 0.5, depth + 0.6), slabMat);
        slab.position.y = f * floorH;
        group.add(slab);

        const band = new THREE.Mesh(new THREE.BoxGeometry(width + 0.7, 0.4, depth + 0.7), yellowBandMat);
        band.position.y = f * floorH - 1.0;
        group.add(band);

        if (f < floors) {
          const louver = new THREE.Mesh(new THREE.BoxGeometry(width + 0.2, 0.15, depth + 0.2), louverMat);
          louver.position.y = f * floorH - 1.8;
          group.add(louver);
        }
      }

      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.8, 1.2, depth + 0.8),
        new THREE.MeshStandardMaterial({ color: 0x94A3B8 })
      );
      rail.position.y = height + 0.6;
      group.add(rail);
    }

    buildCurvedHall(group, width, depth, height) {
      const roofRadius = width * 0.6;
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.65 });

      const curveGeo = new THREE.CylinderGeometry(roofRadius, roofRadius, depth + 0.8, 32, 1, false, 0, Math.PI);
      const curvedRoof = new THREE.Mesh(curveGeo, roofMat);
      curvedRoof.rotation.z = Math.PI / 2;
      curvedRoof.rotation.y = Math.PI / 2;
      curvedRoof.position.set(0, height + 0.2, 0);
      curvedRoof.castShadow = true;
      group.add(curvedRoof);

      const glassMat = new THREE.MeshStandardMaterial({ color: 0x93C5FD, metalness: 0.8, roughness: 0.2 });
      const frontGlass = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.65, height * 0.75), glassMat);
      frontGlass.position.set(0, height * 0.38, depth / 2 + 0.05);
      group.add(frontGlass);
    }

    buildCompetencyCenter(group, width, depth, height) {
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x60A5FA, metalness: 0.8, roughness: 0.2 });
      const floors = 3;
      const floorH = height / floors;

      for (let f = 1; f < floors; f++) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, floorH * 0.45, depth + 0.3), glassMat);
        win.position.y = f * floorH + 0.2;
        group.add(win);
      }

      const canopy = new THREE.Mesh(
        new THREE.BoxGeometry(10, 0.4, 4),
        new THREE.MeshStandardMaterial({ color: 0x0284C7 })
      );
      canopy.position.set(0, 3.5, depth / 2 + 2);
      canopy.castShadow = true;
      group.add(canopy);
    }

    buildLargeWorkshop(group, width, depth, height) {
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 });
      const roofH = 4.2;

      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(width, depth) * 0.72, roofH, 4), roofMat);
      roof.position.y = height + roofH / 2 + 0.2;
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(width / Math.max(width, depth), 1, depth / Math.max(width, depth));
      roof.castShadow = true;
      group.add(roof);

      const ridge = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.6, 1.8, depth * 0.25),
        new THREE.MeshStandardMaterial({ color: 0x64748B })
      );
      ridge.position.y = height + roofH + 0.9;
      ridge.castShadow = true;
      group.add(ridge);

      const doorMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.85 });
      const hazardMat = new THREE.MeshStandardMaterial({ color: 0xF59E0B });

      [-width * 0.24, width * 0.24].forEach(dx => {
        const door = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.26, height * 0.72), doorMat);
        door.position.set(dx, height * 0.36 + 0.2, depth / 2 + 0.05);
        group.add(door);

        const curbStripe = new THREE.Mesh(new THREE.BoxGeometry(width * 0.28, 0.3, 0.4), hazardMat);
        curbStripe.position.set(dx, 0.15, depth / 2 + 0.2);
        group.add(curbStripe);
      });
    }

    buildGabledWarehouse(group, width, depth, height) {
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.72 });
      const roofH = 3.2;

      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(width, depth) * 0.74, roofH, 4), roofMat);
      roof.position.y = height + roofH / 2 + 0.2;
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(width / Math.max(width, depth), 1, depth / Math.max(width, depth));
      roof.castShadow = true;
      group.add(roof);

      const doorMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.8 });
      const door = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.36, height * 0.65), doorMat);
      door.position.set(0, height * 0.325 + 0.2, depth / 2 + 0.05);
      group.add(door);
    }

    buildModernLab(group, width, depth, height) {
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x93C5FD, metalness: 0.8, roughness: 0.2 });

      const win = new THREE.Mesh(new THREE.BoxGeometry(width + 0.2, 1.8, depth + 0.2), glassMat);
      win.position.y = height * 0.65 + 0.2;
      group.add(win);

      const stackMat = new THREE.MeshStandardMaterial({ color: 0xCBD5E1, metalness: 0.7, roughness: 0.3 });
      [-width * 0.25, 0, width * 0.25].forEach(sx => {
        const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.8, 12), stackMat);
        stack.position.set(sx, height + 1.4 + 0.2, depth * 0.15);
        stack.castShadow = true;
        group.add(stack);
      });
    }

    buildResidentialFlat(group, width, depth, height) {
      const balconyMat = new THREE.MeshStandardMaterial({ color: 0xCBD5E1, roughness: 0.6 });
      const floors = 4;
      const floorH = height / floors;

      for (let f = 1; f <= floors; f++) {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(width + 0.8, 0.4, depth + 0.8), balconyMat);
        slab.position.y = f * floorH + 0.2;
        group.add(slab);

        const rail = new THREE.Mesh(new THREE.BoxGeometry(width + 0.9, 0.8, depth + 0.9), balconyMat);
        rail.position.y = f * floorH + 0.6 + 0.2;
        group.add(rail);
      }
    }

    buildCanteen(group, width, depth, height) {
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.6 });
      const roof = new THREE.Mesh(new THREE.BoxGeometry(width + 4, 0.8, depth + 4), roofMat);
      roof.position.y = height + 0.4 + 0.2;
      roof.castShadow = true;
      group.add(roof);

      const patioMat = new THREE.MeshStandardMaterial({ color: 0xE2E8F0, roughness: 0.7 });
      const patio = new THREE.Mesh(new THREE.BoxGeometry(width + 6, 0.2, depth + 6), patioMat);
      patio.position.y = 0.15;
      patio.receiveShadow = true;
      group.add(patio);
    }

    buildUtilityWaterStation(group, width, depth, height) {
      const tankMat = new THREE.MeshStandardMaterial({
        color: 0x0284C7,
        metalness: 0.6,
        roughness: 0.3
      });

      [-width * 0.25, width * 0.25].forEach(tx => {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.22, width * 0.22, 5.5, 16), tankMat);
        tank.position.set(tx, height + 2.75 + 0.2, 0);
        tank.castShadow = true;
        group.add(tank);
      });
    }

    /* ═════════════════════════════════════════════════════════════════
       Billboard Thai Labels and Warning Sprites
       ═════════════════════════════════════════════════════════════════ */
    createLabelSprite(bData) {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.beginPath();
      ctx.roundRect(8, 8, 384, 84, 18);
      ctx.fill();

      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#F59E0B';
      ctx.stroke();

      ctx.font = 'bold 26px Sarabun, sans-serif';
      ctx.fillStyle = '#F59E0B';
      ctx.textAlign = 'center';
      ctx.fillText(bData.b_code, 200, 42);

      ctx.font = '500 20px Sarabun, sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(bData.short_name || bData.name, 200, 74);

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;

      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
      const sprite = new THREE.Sprite(spriteMat);

      const { height } = bData.dimensions;
      const { x, z } = bData.layout_position;
      sprite.position.set(x, height + 8.5, z);
      sprite.scale.set(18, 4.5, 1);
      sprite.userData = { b_code: bData.b_code };

      return sprite;
    }

    createWarningSprite(bData, alertTypes = {}) {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');

      let badgeBg = '#DC2626';
      let badgeText = '!';
      let icon = '⚠️';

      if (alertTypes.hasTargetAlert) {
        badgeBg = '#DC2626'; // Red
        const v = bData.target_variance_pct || 0;
        badgeText = `+${v.toFixed(0)}%`;
        icon = '🚨';
      } else if (alertTypes.hasSurgeAlert) {
        badgeBg = '#D97706'; // Amber
        const m = bData.mom_change_pct || 0;
        badgeText = `+${m.toFixed(0)}%`;
        icon = '⚠️';
      } else {
        badgeBg = '#DC2626';
        badgeText = 'ไม่มีข้อมูล';
        icon = 'ℹ️';
      }

      // Draw rounded pill badge
      ctx.fillStyle = badgeBg;
      ctx.beginPath();
      ctx.roundRect(4, 8, 152, 48, 14);
      ctx.fill();

      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      ctx.font = 'bold 22px Sarabun, sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(`${icon} ${badgeText}`, 80, 40);

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
      const sprite = new THREE.Sprite(spriteMat);

      const { height } = bData.dimensions;
      const { x, z } = bData.layout_position;
      sprite.position.set(x + bData.dimensions.width * 0.45, height + 10.5, z);
      sprite.scale.set(8.5, 3.4, 1);
      sprite.userData = { b_code: bData.b_code };

      return sprite;
    }

    setupSelectionRing() {
      const ringGeo = new THREE.RingGeometry(1, 1.25, 36);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xF59E0B,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95
      });
      this.selectionRing = new THREE.Mesh(ringGeo, ringMat);
      this.selectionRing.rotation.x = -Math.PI / 2;
      this.selectionRing.position.y = 0.14;
      this.selectionRing.visible = false;
      this.scene.add(this.selectionRing);
    }

    /* ═════════════════════════════════════════════════════════════════
       Interactive State Updates, Raycasting & Camera Controls
       ═════════════════════════════════════════════════════════════════ */

    /* ═════════════════════════════════════════════════════════════════
       Advanced Digital Twin Visual Modes (Heatmap, 3D Bars, Flow Network)
       ═════════════════════════════════════════════════════════════════ */
    updateEnergyBars(buildingsList) {
      // Clear existing bars
      while (this.barGroup.children.length > 0) {
        const obj = this.barGroup.children[0];
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
        this.barGroup.remove(obj);
      }

      if (!buildingsList || buildingsList.length === 0) return;

      // Find maximum kWh to scale bars reasonably
      let maxKwh = 1;
      buildingsList.forEach(b => {
        const kwh = b.daily_kwh || b.monthly_kwh || 0;
        if (kwh > maxKwh) maxKwh = kwh;
      });

      buildingsList.forEach(bData => {
        const kwh = bData.daily_kwh || bData.monthly_kwh || 0;
        if (kwh <= 0) return;

        const normalized = Math.min(kwh / maxKwh, 1);
        const barHeight = Math.max(3.5, normalized * 38);
        const barWidth = Math.max(1.8, Math.min(bData.dimensions.width, bData.dimensions.depth) * 0.28);

        // Cylinder bar
        const barGeo = new THREE.CylinderGeometry(barWidth, barWidth * 1.15, barHeight, 16);
        const colorInfo = window.EnergyTwin ? window.EnergyTwin.getColorForBuilding(bData) : { hex: 0x10B981 };

        const barMat = new THREE.MeshStandardMaterial({
          color: colorInfo.hex,
          emissive: colorInfo.hex,
          emissiveIntensity: 0.45,
          roughness: 0.25,
          metalness: 0.35,
          transparent: true,
          opacity: 0.88
        });

        const barMesh = new THREE.Mesh(barGeo, barMat);
        const { height } = bData.dimensions;
        const { x, z } = bData.layout_position;
        barMesh.position.set(x, height + barHeight / 2, z);
        barMesh.userData = { b_code: bData.b_code };
        this.barGroup.add(barMesh);

        // Value text billboard at top of bar
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.beginPath();
        ctx.roundRect(4, 4, 248, 56, 12);
        ctx.fill();
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.font = 'bold 22px Sarabun, sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        const formattedKwh = kwh >= 1000 ? (kwh / 1000).toFixed(1) + 'k' : Math.round(kwh);
        ctx.fillText(`${formattedKwh} kWh`, 128, 38);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
        const valSprite = new THREE.Sprite(spriteMat);
        valSprite.position.set(x, height + barHeight + 3.2, z);
        valSprite.scale.set(11, 2.8, 1);
        this.barGroup.add(valSprite);
      });

      this.needsRender = true;
    }

    updateEnergyFlow(buildingsList) {
      // Clear existing flow lines
      while (this.flowGroup.children.length > 0) {
        const obj = this.flowGroup.children[0];
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
        this.flowGroup.remove(obj);
      }
      this.flowMaterials = [];

      if (!buildingsList || buildingsList.length === 0) return;

      // 500 kV Substation / Switchyard Origin
      const switchyardOrigin = new THREE.Vector3(-65, 5, 85);
      const subHub = new THREE.Vector3(0, 4, -10);

      // Main trunk line from Switchyard to Central Distribution Hub
      const trunkCurve = new THREE.QuadraticBezierCurve3(
        switchyardOrigin,
        new THREE.Vector3(-30, 22, 35),
        subHub
      );
      const trunkPoints = trunkCurve.getPoints(40);
      const trunkGeo = new THREE.BufferGeometry().setFromPoints(trunkPoints);
      const trunkMat = new THREE.LineDashedMaterial({
        color: 0xFDE047,
        dashSize: 3.5,
        gapSize: 2.0,
        linewidth: 3,
        transparent: true,
        opacity: 0.92
      });
      const trunkLine = new THREE.Line(trunkGeo, trunkMat);
      trunkLine.computeLineDistances();
      this.flowGroup.add(trunkLine);
      this.flowMaterials.push(trunkMat);

      // Branch lines to each building
      buildingsList.forEach(bData => {
        const dest = new THREE.Vector3(bData.layout_position.x, 2, bData.layout_position.z);
        // Choose closer source between SubHub and Switchyard
        const src = (dest.distanceTo(switchyardOrigin) < dest.distanceTo(subHub)) ? switchyardOrigin : subHub;

        const mid = new THREE.Vector3(
          (src.x + dest.x) * 0.5,
          10 + Math.min(src.distanceTo(dest) * 0.12, 18),
          (src.z + dest.z) * 0.5
        );

        const curve = new THREE.QuadraticBezierCurve3(src, mid, dest);
        const points = curve.getPoints(30);
        const geo = new THREE.BufferGeometry().setFromPoints(points);

        const colorInfo = window.EnergyTwin ? window.EnergyTwin.getColorForBuilding(bData) : { hex: 0x38BDF8 };
        const flowMat = new THREE.LineDashedMaterial({
          color: colorInfo.hex,
          dashSize: 2.2,
          gapSize: 1.8,
          linewidth: 2,
          transparent: true,
          opacity: 0.8
        });

        const flowLine = new THREE.Line(geo, flowMat);
        flowLine.computeLineDistances();
        this.flowGroup.add(flowLine);
        this.flowMaterials.push(flowMat);
      });

      this.needsRender = true;
    }

    setVisualMode(mode) {
      this.visualMode = mode || 'heatmap';

      if (this.visualMode === 'heatmap') {
        this.barGroup.visible = false;
        this.flowGroup.visible = false;
      } else if (this.visualMode === 'bars') {
        this.barGroup.visible = true;
        this.flowGroup.visible = false;
        if (window.EnergyTwin && window.EnergyTwin.currentBuildings) {
          this.updateEnergyBars(window.EnergyTwin.currentBuildings);
        }
      } else if (this.visualMode === 'flow') {
        this.barGroup.visible = false;
        this.flowGroup.visible = true;
        if (window.EnergyTwin && window.EnergyTwin.currentBuildings) {
          this.updateEnergyFlow(window.EnergyTwin.currentBuildings);
        }
      }

      this.needsRender = true;
    }

    /* ═════════════════════════════════════════════════════════════════
       Day / Night Theme & Ambient Lighting
       ═════════════════════════════════════════════════════════════════ */
    setTheme(theme) {
      this.currentTheme = theme === 'night' ? 'night' : 'day';

      if (this.currentTheme === 'night') {
        // Night Sky & Fog
        this.scene.background = new THREE.Color(0x0A0F1D);
        if (this.scene.fog) {
          this.scene.fog.color = new THREE.Color(0x0A0F1D);
          this.scene.fog.density = 0.0022;
        }

        // Night Lighting
        if (this.hemiLight) {
          this.hemiLight.color.setHex(0x1E293B);
          this.hemiLight.groundColor.setHex(0x0F172A);
          this.hemiLight.intensity = 0.28;
        }
        if (this.ambLight) {
          this.ambLight.color.setHex(0x1E293B);
          this.ambLight.intensity = 0.15;
        }
        if (this.dirLight) {
          this.dirLight.color.setHex(0x60A5FA);
          this.dirLight.intensity = 0.32;
        }

        // Glowing Windows
        this.windowMeshes.forEach(mesh => {
          if (mesh.material) {
            mesh.material.emissive = new THREE.Color(0xFDE047);
            mesh.material.emissiveIntensity = 0.82;
          }
        });
      } else {
        // Daylight Sky & Fog (Soft elegant sunny sky blue & balanced fog)
        this.scene.background = new THREE.Color(0xD4E4F7);
        if (this.scene.fog) {
          this.scene.fog.color = new THREE.Color(0xD4E4F7);
          this.scene.fog.density = 0.0012;
        }

        // Daylight Lighting (Sky fill + Ground bounce green)
        if (this.hemiLight) {
          this.hemiLight.color.setHex(0xD8EEFD);
          this.hemiLight.groundColor.setHex(0x3E5C28);
          this.hemiLight.intensity = 0.60;
        }
        if (this.ambLight) {
          this.ambLight.color.setHex(0xFFFFFF);
          this.ambLight.intensity = 0.28;
        }
        if (this.dirLight) {
          this.dirLight.color.setHex(0xFFFDF2);
          this.dirLight.intensity = 0.82;
        }

        // Windows unlit in daylight
        this.windowMeshes.forEach(mesh => {
          if (mesh.material) {
            mesh.material.emissive = new THREE.Color(0x000000);
            mesh.material.emissiveIntensity = 0;
          }
        });
      }

      this.needsRender = true;
    }

    /* ═════════════════════════════════════════════════════════════════
       Kiosk Auto-Orbit Presentation Mode & High-Res Snapshot
       ═════════════════════════════════════════════════════════════════ */
    toggleKioskMode(forceState) {
      this.isKiosk = forceState !== undefined ? !!forceState : !this.isKiosk;

      if (this.isKiosk) {
        if (this.controls) {
          this.controls.autoRotate = true;
          this.controls.autoRotateSpeed = 0.75;
        }

        // Cycle through top energy consumers every 12 seconds
        this.kioskIndex = 0;
        if (this.kioskInterval) clearInterval(this.kioskInterval);
        this.kioskInterval = setInterval(() => {
          if (!this.isKiosk || !window.EnergyTwin || !window.EnergyTwin.currentBuildings) return;
          const buildings = [...window.EnergyTwin.currentBuildings].sort((a, b) => (b.daily_kwh || 0) - (a.daily_kwh || 0));
          if (buildings.length > 0) {
            const b = buildings[this.kioskIndex % Math.min(5, buildings.length)];
            window.EnergyTwin.setState({ selectedBuildingId: b.b_code });
            this.kioskIndex++;
          }
        }, 12000);
      } else {
        if (this.controls) {
          this.controls.autoRotate = false;
        }
        if (this.kioskInterval) {
          clearInterval(this.kioskInterval);
          this.kioskInterval = null;
        }
      }

      this.needsRender = true;
      return this.isKiosk;
    }

    takeSnapshot() {
      if (!this.renderer || !this.scene || !this.camera) return null;
      this.renderer.render(this.scene, this.camera);
      return this.renderer.domElement.toDataURL('image/png');
    }

    updateBuildingColors(buildingsList) {
      const bMap = new Map();
      buildingsList.forEach(b => bMap.set(b.b_code, b));

      this.buildingMeshes.forEach((group, bCode) => {
        const bData = bMap.get(bCode);
        if (bData && group && group.userData.mainMaterial) {
          const colorInfo = window.EnergyTwin.getColorForBuilding(bData);
          group.userData.mainMaterial.color.set(colorInfo.hex);
          group.userData.mainMaterial.opacity = 1.0;
          group.userData.mainMaterial.transparent = false;
        } else if (group && group.userData.mainMaterial) {
          // Softly dim buildings not in current department filter
          group.userData.mainMaterial.color.set(0x94A3B8);
          group.userData.mainMaterial.opacity = 0.35;
          group.userData.mainMaterial.transparent = true;
        }

        let warnSprite = this.warningSprites.get(bCode);
        if (bData && bData.quality_status !== 'normal') {
          if (!warnSprite) {
            warnSprite = this.createWarningSprite(bData);
            this.scene.add(warnSprite);
            this.warningSprites.set(bCode, warnSprite);
          }
          warnSprite.visible = true;
        } else if (warnSprite) {
          warnSprite.visible = false;
        }
      });

      if (this.visualMode === 'bars') {
        this.updateEnergyBars(buildingsList);
      } else if (this.visualMode === 'flow') {
        this.updateEnergyFlow(buildingsList);
      }

      this.needsRender = true;
    }

    setLabelsVisible(visible) {
      this.labelSprites.forEach(sprite => { sprite.visible = visible; });
      this.landmarkSprites.forEach(sprite => { sprite.visible = visible; });
      this.needsRender = true;
    }

    setQuality(level) {
      if (!this.renderer) return;

      if (level === 'high') {
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        if (this.dirLight) this.dirLight.castShadow = true;
      } else if (level === 'medium') {
        this.renderer.setPixelRatio(1);
        this.renderer.shadowMap.enabled = false;
        if (this.dirLight) this.dirLight.castShadow = false;
      } else {
        this.renderer.setPixelRatio(0.8);
        this.renderer.shadowMap.enabled = false;
        if (this.dirLight) this.dirLight.castShadow = false;
      }
      this.needsRender = true;
    }

    selectBuilding(bCode, flyCamera = true) {
      if (!bCode) {
        this.selectedBuilding = null;
        if (this.selectionRing) this.selectionRing.visible = false;
        this.needsRender = true;
        return;
      }

      const group = this.buildingMeshes.get(bCode);
      if (!group) return;

      this.selectedBuilding = bCode;
      const bData = group.userData.data;

      if (this.selectionRing) {
        const radius = Math.max(bData.dimensions.width, bData.dimensions.depth) * 0.88;
        this.selectionRing.geometry.dispose();
        this.selectionRing.geometry = new THREE.RingGeometry(radius, radius + 1.4, 36);
        this.selectionRing.position.set(bData.layout_position.x, 0.14, bData.layout_position.z);
        this.selectionRing.visible = true;
      }

      if (flyCamera) {
        const targetPos = {
          x: bData.layout_position.x,
          y: bData.dimensions.height * 0.5,
          z: bData.layout_position.z
        };
        const distance = Math.max(bData.dimensions.width, bData.dimensions.depth) * 2.2 + 25;
        const camPos = {
          x: targetPos.x + distance * 0.7,
          y: targetPos.y + distance * 0.75,
          z: targetPos.z + distance * 0.85
        };

        this.animateCamera(camPos, targetPos, 900);
      }

      this.needsRender = true;
    }

    updateBuildingPosition(bCode, newX, newZ, newY = null) {
      const group = this.buildingMeshes.get(bCode);
      if (!group) return;

      const x = Number(newX);
      const z = Number(newZ);
      group.position.x = x;
      group.position.z = z;
      // All buildings sit flush on ground plane (Y = 0)
      group.position.y = 0;

      if (group.userData && group.userData.data && group.userData.data.layout_position) {
        group.userData.data.layout_position.x = x;
        group.userData.data.layout_position.z = z;
        group.userData.data.layout_position.y = 0;
      }

      const bData = group.userData?.data;
      const height = (bData && bData.dimensions && bData.dimensions.height) || 12;

      // Update 3D label sprite position accurately above the roof
      const label = this.labelSprites.get(bCode);
      if (label) {
        label.position.set(x, height + 8.5, z);
      }

      // Update warning sprite position if present
      const warn = this.warningSprites.get(bCode);
      if (warn) {
        const w = (bData && bData.dimensions && bData.dimensions.width) || 20;
        warn.position.set(x + w * 0.45, height + 10.5, z);
      }

      // Update selection ring if active on this building
      if (this.selectedBuilding === bCode && this.selectionRing) {
        this.selectionRing.position.set(x, 0.14, z);
      }

      this.needsRender = true;
    }

    updateBuildingDimensions(bCode, newWidth, newDepth, newHeight = null) {
      const group = this.buildingMeshes.get(bCode);
      const bData = group?.userData?.data || (window.EnergyTwin?.mappingData?.buildings?.[bCode]);
      if (!bData) return;

      if (!bData.dimensions) bData.dimensions = { width: 20, depth: 20, height: 12 };
      if (newWidth !== undefined && !isNaN(Number(newWidth))) bData.dimensions.width = Number(newWidth);
      if (newDepth !== undefined && !isNaN(Number(newDepth))) bData.dimensions.depth = Number(newDepth);
      if (newHeight !== undefined && !isNaN(Number(newHeight))) bData.dimensions.height = Number(newHeight);

      const isVisible = group ? group.visible : !bData.hidden;

      // Remove and dispose old mesh group
      if (group) {
        this.scene.remove(group);
        group.traverse(child => {
          if (child.isMesh && child.geometry) {
            child.geometry.dispose();
          }
        });
      }

      // Recreate building mesh with newly dimensioned architecture
      const newGroup = this.createBuildingMesh(bData);
      newGroup.visible = isVisible;
      this.scene.add(newGroup);
      this.buildingMeshes.set(bCode, newGroup);

      // Reposition label & alert sprites above updated roof height
      const h = bData.dimensions.height || 12;
      const x = bData.layout_position ? bData.layout_position.x : 0;
      const z = bData.layout_position ? bData.layout_position.z : 0;
      const label = this.labelSprites.get(bCode);
      if (label) {
        label.position.set(x, h + 8.5, z);
      }
      const warn = this.warningSprites ? this.warningSprites.get(bCode) : null;
      if (warn) {
        const w = bData.dimensions.width || 20;
        warn.position.set(x + w * 0.45, h + 10.5, z);
      }

      this.needsRender = true;
    }

    updateBuildingRotation(bCode, angleRad) {
      const group = this.buildingMeshes.get(bCode);
      if (!group) return;
      const rot = Number(angleRad);
      if (!isNaN(rot)) {
        group.rotation.y = rot;
        if (group.userData && group.userData.data) {
          group.userData.data.rotation_y = rot;
        }
      }
      this.needsRender = true;
    }

    // Dynamic Road Lifecycle & Synchronization
    syncRoadsFromModel() {
      if (!this.roadContainer) {
        this.roadContainer = new THREE.Group();
        this.roadContainer.name = 'DynamicRoadNetwork';
        this.scene.add(this.roadContainer);
      }
      if (!this.roadMeshes) this.roadMeshes = new Map();

      const roads = window.EnergyTwin && window.EnergyTwin.getRoadsList ? window.EnergyTwin.getRoadsList() : [];
      const currentRoadIds = new Set(roads.map(r => r.id));

      // 1. Remove meshes for deleted roads
      for (const [id, mesh] of this.roadMeshes.entries()) {
        if (id === 'ROAD_EAST_ROUNDABOUT') continue; // Preserve landmark roundabout
        if (!currentRoadIds.has(id)) {
          if (mesh.parent) mesh.parent.remove(mesh);
          else this.roadContainer.remove(mesh);
          if (mesh.traverse) {
            mesh.traverse(c => {
              if (c.geometry) c.geometry.dispose();
              if (c.material) {
                if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
                else c.material.dispose();
              }
            });
          }
          this.roadMeshes.delete(id);
        }
      }

      // Also clean any orphaned meshes in roadContainer
      const orphaned = [];
      this.roadContainer.children.forEach(c => {
        const rid = c.userData?.roadId || (c.name?.startsWith('Road_') ? c.name.replace('Road_', '') : null);
        if (rid && !currentRoadIds.has(rid)) {
          orphaned.push(c);
        }
      });
      orphaned.forEach(c => {
        this.roadContainer.remove(c);
        if (c.traverse) {
          c.traverse(m => {
            if (m.geometry) m.geometry.dispose();
            if (m.material) {
              if (Array.isArray(m.material)) m.material.forEach(mat => mat.dispose());
              else m.material.dispose();
            }
          });
        }
      });

      // 2. Add or update meshes for active roads
      roads.forEach(r => {
        let mesh = this.roadMeshes.get(r.id);
        if (!mesh) {
          mesh = this.createRoadSegmentMesh(r);
          this.roadContainer.add(mesh);
          this.roadMeshes.set(r.id, mesh);
        } else {
          this.updateRoadSegmentMesh(mesh, r);
        }
      });

      this.needsRender = true;
    }

    createRoadSegmentMesh(r) {
      const group = new THREE.Group();
      group.name = 'Road_' + r.id;
      group.userData = { roadId: r.id };
      const w = Number(r.width) || 8;
      const len = Number(r.length) || 50;
      const isRedWalkway = (r.id && r.id.includes('RED')) || r.category === 'ทางเท้า' || (r.category && r.category.includes('ทางเท้า')) || r.color === 'red';

      const asphaltMat = new THREE.MeshStandardMaterial({
        color: isRedWalkway ? 0xB91C1C : 0x334155,
        roughness: isRedWalkway ? 0.68 : 0.72,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });
      const roadPlane = new THREE.Mesh(new THREE.PlaneGeometry(w, len), asphaltMat);
      roadPlane.name = 'asphaltPlane';
      roadPlane.rotation.x = -Math.PI / 2;
      roadPlane.receiveShadow = true;
      group.add(roadPlane);

      // Centerline dashes or walkway border
      const lineGroup = new THREE.Group();
      lineGroup.name = 'centerlineGroup';
      this.buildRoadCenterline(lineGroup, w, len, isRedWalkway);
      group.add(lineGroup);

      group.position.set(Number(r.x) || 0, 0.08, Number(r.z) || 0);
      group.rotation.y = Number(r.rotation_y) || 0;
      group.visible = !r.hidden;
      return group;
    }

    buildRoadCenterline(lineGroup, w, len, isRedWalkway = false) {
      while (lineGroup.children.length > 0) {
        const c = lineGroup.children.pop();
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      }

      if (isRedWalkway) {
        // Red paving border curbs along each side of the walkway
        const curbMat = new THREE.MeshStandardMaterial({
          color: 0x94A3B8,
          roughness: 0.8,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2
        });
        const curbW = Math.min(0.3, w * 0.1);
        [-w / 2 + curbW / 2, w / 2 - curbW / 2].forEach(cx => {
          const curb = new THREE.Mesh(new THREE.PlaneGeometry(curbW, len), curbMat);
          curb.rotation.x = -Math.PI / 2;
          curb.position.set(cx, 0.02, 0);
          lineGroup.add(curb);
        });
        return;
      }

      if (w < 6 || len < 12) return;

      const lineMat = new THREE.MeshBasicMaterial({
        color: 0xF1F5F9,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      });
      const dashLen = Math.min(5, Math.max(2, len * 0.08));
      const step = dashLen * 2.2;

      for (let z = -len / 2 + step; z <= len / 2 - step; z += step) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.35, dashLen), lineMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(0, 0.02, z);
        lineGroup.add(dash);
      }
    }

    updateRoadSegmentMesh(mesh, r) {
      mesh.position.set(Number(r.x) || 0, 0.08, Number(r.z) || 0);
      mesh.rotation.y = Number(r.rotation_y) || 0;
      mesh.visible = !r.hidden;

      const w = Number(r.width) || 8;
      const len = Number(r.length) || 50;
      const isRedWalkway = (r.id && r.id.includes('RED')) || r.category === 'ทางเท้า' || (r.category && r.category.includes('ทางเท้า')) || r.color === 'red';

      const plane = mesh.getObjectByName('asphaltPlane');
      if (plane) {
        if (plane.geometry) plane.geometry.dispose();
        plane.geometry = new THREE.PlaneGeometry(w, len);
        if (plane.material) {
          plane.material.color.setHex(isRedWalkway ? 0xB91C1C : 0x334155);
        }
      }

      const lineGroup = mesh.getObjectByName('centerlineGroup');
      if (lineGroup) {
        this.buildRoadCenterline(lineGroup, w, len, isRedWalkway);
      }
    }

    updateRoadPosition(roadId, newX, newZ) {
      const road = this.roadMeshes.get(roadId);
      if (!road) {
        this.syncRoadsFromModel();
        return;
      }
      const x = Number(newX);
      const z = Number(newZ);
      if (!isNaN(x)) road.position.x = x;
      if (!isNaN(z)) road.position.z = z;
      this.needsRender = true;
    }

    updateRoadRotation(roadId, angleRad) {
      const road = this.roadMeshes.get(roadId);
      if (!road) {
        this.syncRoadsFromModel();
        return;
      }
      const rot = Number(angleRad);
      if (!isNaN(rot)) {
        road.rotation.y = rot;
      }
      this.needsRender = true;
    }

    updateRoadDimensions(roadId, newWidth, newLength) {
      const road = this.roadMeshes.get(roadId);
      if (!road) {
        this.syncRoadsFromModel();
        return;
      }
      const w = Number(newWidth) || 8;
      const len = Number(newLength) || 50;
      const plane = road.getObjectByName('asphaltPlane');
      if (plane) {
        if (plane.geometry) plane.geometry.dispose();
        plane.geometry = new THREE.PlaneGeometry(w, len);
      }
      const lineGroup = road.getObjectByName('centerlineGroup');
      if (lineGroup) {
        this.buildRoadCenterline(lineGroup, w, len);
      }
      this.needsRender = true;
    }

    setRoadVisible(roadId, visible) {
      const road = this.roadMeshes.get(roadId);
      if (!road) {
        this.syncRoadsFromModel();
        return;
      }
      road.visible = Boolean(visible);
      this.needsRender = true;
    }

    updateWaterPosition(waterId, newX, newZ) {
      if (!this.waterMeshes) return;
      const water = this.waterMeshes.get(waterId);
      if (!water) return;
      const x = Number(newX);
      const z = Number(newZ);
      if (!isNaN(x)) water.position.x = x;
      if (!isNaN(z)) water.position.z = z;
      this.needsRender = true;
    }

    updateWaterRotation(waterId, angleRad) {
      if (!this.waterMeshes) return;
      const water = this.waterMeshes.get(waterId);
      if (!water) return;
      const rot = Number(angleRad);
      if (!isNaN(rot)) {
        if (water.isGroup) {
          water.rotation.y = rot;
        } else {
          water.rotation.z = -rot;
        }
      }
      this.needsRender = true;
    }

    updateWaterDimensions(waterId, newWidth, newDepth) {
      if (!this.waterMeshes) return;
      const water = this.waterMeshes.get(waterId);
      if (!water) return;
      const w = Number(newWidth);
      const d = Number(newDepth);
      const def = window.EnergyTwin && window.EnergyTwin.defaultWater && window.EnergyTwin.defaultWater[waterId];
      if (!def) return;
      const origW = def.width || 20;
      const origD = def.depth || 40;

      if (!isNaN(w) && w > 0 && !isNaN(d) && d > 0) {
        const scaleW = w / origW;
        const scaleD = d / origD;
        if (water.isGroup) {
          water.scale.set(scaleW, 1, scaleD);
        } else {
          water.scale.set(scaleW, scaleD, 1);
        }
      }
      this.needsRender = true;
    }

    updateLandmarkPosition(landmarkId, newX, newZ) {
      if (!this.landmarkMeshes) return;
      const lm = this.landmarkMeshes.get(landmarkId);
      const x = Number(newX);
      const z = Number(newZ);
      if (lm) {
        if (!isNaN(x)) lm.position.x = x;
        if (!isNaN(z)) lm.position.z = z;
      }
      if (this.landmarkSprites) {
        const sprite = this.landmarkSprites.find(s => s.name === landmarkId || (s.userData && s.userData.id === landmarkId));
        if (sprite) {
          if (!isNaN(x)) sprite.position.x = x;
          if (!isNaN(z)) sprite.position.z = z;
        }
      }
      this.needsRender = true;
    }

    updateLandmarkRotation(landmarkId, rotY) {
      if (!this.landmarkMeshes) return;
      const lm = this.landmarkMeshes.get(landmarkId);
      if (!lm) return;
      const rot = Number(rotY);
      if (!isNaN(rot)) {
        lm.rotation.y = rot;
      }
      this.needsRender = true;
    }

    updateLandmarkDimensions(landmarkId, newWidth, newDepth) {
      if (!this.landmarkMeshes) return;
      const lm = this.landmarkMeshes.get(landmarkId);
      if (!lm) return;
      const w = Number(newWidth);
      const d = Number(newDepth);
      const def = window.EnergyTwin && window.EnergyTwin.defaultLandmarks && window.EnergyTwin.defaultLandmarks[landmarkId];
      const origW = (def && def.width) ? def.width : (landmarkId === 'SW_YARD' ? 65 : (landmarkId === 'SUNFLOWER_FIELD' ? 34 : (landmarkId === 'FOOTBALL' ? 28 : (landmarkId === 'OHK_ROUNDABOUT' ? 28 : (landmarkId === 'EAST_ROUNDABOUT' ? 24 : 15)))));
      const origD = (def && def.depth) ? def.depth : (landmarkId === 'SW_YARD' ? 60 : (landmarkId === 'SUNFLOWER_FIELD' ? 44 : (landmarkId === 'FOOTBALL' ? 56 : (landmarkId === 'OHK_ROUNDABOUT' ? 28 : (landmarkId === 'EAST_ROUNDABOUT' ? 24 : 15)))));
      if (!isNaN(w) && w > 0 && !isNaN(d) && d > 0 && origW > 0 && origD > 0) {
        lm.scale.set(w / origW, 1, d / origD);
      }
      this.needsRender = true;
    }

    updateCampusBounds(bounds) {
      if (!bounds || !this.groundMesh || !this.curbMesh) return;
      const minX = bounds.minX ?? -210;
      const maxX = bounds.maxX ?? 180;
      const minZ = bounds.minZ ?? -220;
      const maxZ = bounds.maxZ ?? 140;

      const width = Math.max(120, (maxX - minX) + 50);
      const depth = Math.max(120, (maxZ - minZ) + 50);
      const centerX = (minX + maxX) / 2;
      const centerZ = (minZ + maxZ) / 2;

      if (this.groundMesh.geometry) this.groundMesh.geometry.dispose();
      this.groundMesh.geometry = new THREE.PlaneGeometry(width, depth);
      this.groundMesh.position.set(centerX, 0.02, centerZ);
      this.groundMesh.renderOrder = 1;

      if (this.soilTexture) {
        this.soilTexture.repeat.set(width / 24, depth / 24);
      }
      if (this.lawnTexture && this.lawnTexture !== this.soilTexture) {
        this.lawnTexture.repeat.set(width / 24, depth / 24);
      }

      if (this.curbMesh.geometry) this.curbMesh.geometry.dispose();
      this.curbMesh.geometry = new THREE.BoxGeometry(width + 4, 1.2, depth + 4);
      this.curbMesh.position.set(centerX, -0.65, centerZ);
      this.curbMesh.renderOrder = 0;

      if (this.outerGroundMesh) {
        this.outerGroundMesh.position.set(centerX, -0.70, centerZ);
      }

      this.needsRender = true;
    }

    setBuildingVisible(bCode, visible) {
      const group = this.buildingMeshes.get(bCode);
      if (group) group.visible = !!visible;
      const label = this.labelSprites.get(bCode);
      if (label) label.visible = !!visible;
      const warn = this.warningSprites.get(bCode);
      if (warn) warn.visible = !!visible;
      this.needsRender = true;
    }

    setRoadVisible(roadId, visible) {
      const road = this.roadMeshes.get(roadId);
      if (road) {
        road.visible = !!visible;
        this.needsRender = true;
      }
    }

    setWaterVisible(waterId, visible) {
      if (!this.waterMeshes) return;
      const water = this.waterMeshes.get(waterId);
      if (water) {
        water.visible = !!visible;
        this.needsRender = true;
      }
    }

    setLandmarkVisible(landmarkId, visible) {
      if (!this.landmarkMeshes) return;
      const lm = this.landmarkMeshes.get(landmarkId);
      if (lm) {
        lm.visible = !!visible;
        this.needsRender = true;
      }
    }

    resetView() {
      this.selectBuilding(null, false);
      this.animateCamera(this.defaultCameraPos, this.defaultTargetPos, 850);
    }

    setTopDownView() {
      const topCam = { x: -20, y: 240, z: -39.99 };
      const topTarget = { x: -20, y: 0, z: -40 };
      this.animateCamera(topCam, topTarget, 850);
    }

    focusZone(zoneKey) {
      if (zoneKey === 'office') {
        // Zone 1: Office & Labs (T.0019, T.0020, D.0019, Football Field)
        this.animateCamera({ x: 65, y: 80, z: 70 }, { x: 45, y: 10, z: -15 }, 850);
      } else if (zoneKey === 'workshop') {
        // Zone 2: Central Workshops & Warehouses (T.0006 - T.0012)
        this.animateCamera({ x: -10, y: 80, z: 30 }, { x: -25, y: 5, z: -60 }, 850);
      } else if (zoneKey === 'switchyard') {
        // Zone 3: Switchyard 500 kV, Ponds & Residential Flat
        this.animateCamera({ x: -60, y: 90, z: 140 }, { x: -65, y: 8, z: 85 }, 850);
      } else if (zoneKey === 'transport') {
        // Zone 4: Transportation Hub (T.0026 - T.0029, D.0031, D.0033, Roundabout)
        this.animateCamera({ x: -110, y: 85, z: -85 }, { x: -130, y: 6, z: -160 }, 850);
      }
    }

    focusPoint(x, z, altitude = 65, dist = 60) {
      const target = { x: Number(x) || 0, y: 5, z: Number(z) || 0 };
      const cam = { x: target.x + dist * 0.45, y: altitude, z: target.z + dist };
      this.animateCamera(cam, target, 750);
    }

    animateCamera(destPos, destTarget, duration = 850) {
      const startCam = { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z };
      const startTarget = { x: this.controls.target.x, y: this.controls.target.y, z: this.controls.target.z };
      const startTime = performance.now();

      this.isAnimatingCamera = true;

      const step = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);

        const ease = progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        this.camera.position.x = startCam.x + (destPos.x - startCam.x) * ease;
        this.camera.position.y = startCam.y + (destPos.y - startCam.y) * ease;
        this.camera.position.z = startCam.z + (destPos.z - startCam.z) * ease;

        this.controls.target.x = startTarget.x + (destTarget.x - startTarget.x) * ease;
        this.controls.target.y = startTarget.y + (destTarget.y - startTarget.y) * ease;
        this.controls.target.z = startTarget.z + (destTarget.z - startTarget.z) * ease;

        this.controls.update();
        this.needsRender = true;

        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          this.isAnimatingCamera = false;
        }
      };

      requestAnimationFrame(step);
    }

    setupEventListeners() {
      window.addEventListener('resize', () => {
        if (!this.container || !this.renderer || !this.camera) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this.needsRender = true;
      });

      this.renderer.domElement.addEventListener('pointermove', (event) => {
        const modal = document.getElementById('layoutEditorModal');
        if (modal && modal.style.display === 'flex') return;
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.checkHover();
      });

      this.renderer.domElement.addEventListener('pointerup', (event) => {
        const modal = document.getElementById('layoutEditorModal');
        if (modal && modal.style.display === 'flex') return;
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersectable = Array.from(this.buildingMeshes.values());
        const intersects = this.raycaster.intersectObjects(intersectable, true);

        if (intersects.length > 0) {
          let cur = intersects[0].object;
          while (cur && cur.parent && !cur.userData.b_code) {
            cur = cur.parent;
          }
          if (cur && cur.userData && cur.userData.b_code) {
            const bCode = cur.userData.b_code;
            window.EnergyTwin.setState({ selectedBuildingId: bCode });
          }
        }
      });
    }

    checkHover() {
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersectable = Array.from(this.buildingMeshes.values());
      const intersects = this.raycaster.intersectObjects(intersectable, true);

      let foundBuilding = null;
      if (intersects.length > 0) {
        let cur = intersects[0].object;
        while (cur && cur.parent && !cur.userData.b_code) {
          cur = cur.parent;
        }
        if (cur && cur.userData && cur.userData.b_code) {
          foundBuilding = cur.userData.b_code;
        }
      }

      if (foundBuilding !== this.hoveredBuilding) {
        if (this.hoveredBuilding) {
          const oldGroup = this.buildingMeshes.get(this.hoveredBuilding);
          if (oldGroup && oldGroup.userData.mainMaterial) {
            oldGroup.userData.mainMaterial.emissive.setHex(0x000000);
          }
        }

        this.hoveredBuilding = foundBuilding;

        if (this.hoveredBuilding) {
          this.container.style.cursor = 'pointer';
          const newGroup = this.buildingMeshes.get(this.hoveredBuilding);
          if (newGroup && newGroup.userData.mainMaterial) {
            newGroup.userData.mainMaterial.emissive.setHex(0x223344);
          }
        } else {
          this.container.style.cursor = 'default';
        }

        this.needsRender = true;
      }
    }

    animate(time) {
      requestAnimationFrame((t) => this.animate(t));

      // Performance: When 2D Layout Editor modal is open, completely pause 3D loop (0% GPU/CPU usage)
      const layoutModal = document.getElementById('layoutEditorModal');
      if (layoutModal && layoutModal.style.display === 'flex') {
        return;
      }

      if (this.selectionRing && this.selectionRing.visible) {
        const pulse = 1 + Math.sin(time * 0.005) * 0.04;
        this.selectionRing.scale.set(pulse, pulse, 1);
        this.needsRender = true;
      }

      if (this.warningSprites.size > 0) {
        const floatDelta = Math.sin(time * 0.004) * 0.35;
        this.warningSprites.forEach(sprite => {
          if (sprite.visible) {
            const bData = window.EnergyTwin.mappingData.buildings[sprite.userData.b_code];
            if (bData) {
              sprite.position.y = bData.dimensions.height + 10 + floatDelta;
            }
          }
        });
        this.needsRender = true;
      }

      // Animate flowing pulses in Energy Flow mode
      if (this.visualMode === 'flow' && this.flowMaterials.length > 0) {
        const offsetDelta = (time * 0.0018) % 10;
        this.flowMaterials.forEach((mat, idx) => {
          mat.dashOffset = -offsetDelta * (1 + (idx % 3) * 0.2);
        });
        this.needsRender = true;
      }

      if (this.controls) {
        const controlsMoved = this.controls.update();
        if (controlsMoved || this.controls.autoRotate) {
          this.needsRender = true;
        }
      }

      if (this.needsRender || this.isAnimatingCamera) {
        this.renderer.render(this.scene, this.camera);
        this.needsRender = false;
      }
    }

    showWebGLFallback() {
      if (!this.container) return;
      this.container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;background:#F8FAFC;padding:30px;text-align:center;color:#334155;">
          <div style="font-size:42px;margin-bottom:12px">🏢</div>
          <h3 style="font-size:18px;font-weight:700;color:#0B1D51;margin-bottom:8px">ระบบสลับสู่โหมดแผนที่สาธิต 2D (WebGL Fallback)</h3>
          <p style="font-size:13px;max-width:440px;line-height:1.6;margin-bottom:16px">
            อุปกรณ์หรือเบราว์เซอร์ของท่านไม่รองรับ WebGL หรือปิดการเร่งความเร็วด้วยฮาร์ดแวร์ ระบบจึงแสดงผลเป็นแผนที่สาธิตแบบ 2D ที่ยังคงคลิกเลือกและดูข้อมูลพลังงานของทุกอาคารได้ครบถ้วน
          </p>
          <button onclick="window.EnergyTwin.setState({ viewMode: '2d' })" style="background:#0B1D51;color:#fff;border:none;padding:8px 18px;border-radius:6px;font-family:'Sarabun',sans-serif;font-weight:600;cursor:pointer">
            สลับสู่แผนที่ 2D ทันที
          </button>
        </div>
      `;
    }
  }

  window.CampusScene = CampusScene;

})(window);
