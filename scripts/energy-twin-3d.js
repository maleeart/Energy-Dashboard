/**
 * Sainoi Energy Dashboard & 3D Building Digital Twin - 3D Campus Scene Engine
 * Three.js High-Fidelity Campus Environment, Master Plan Layout, Procedural Architecture,
 * Lighting, Shadows, OrbitControls, Smooth Raycasting, and Multi-Zone Camera Presets.
 *
 * Based on EGAT Sai Noi Master Plan (SNO-MP28-SV-1/1, 1 Feb 2565) & Campus Architectural Visuals.
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

      this.selectionRing = null;
      this.hoveredBuilding = null;
      this.selectedBuilding = null;

      this.isAnimatingCamera = false;
      this.needsRender = true;
      this.lastFrameTime = 0;

      // Default Camera View: Overlooking Campus from South-East
      this.defaultCameraPos = { x: 45, y: 155, z: 200 };
      this.defaultTargetPos = { x: -10, y: 0, z: -15 };

      this.init();
    }

    init() {
      // 1. Scene & Daylight Sky Atmosphere
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0xEDF2F7); // Crisp daylight sky tone
      this.scene.fog = new THREE.FogExp2(0xEDF2F7, 0.0020);

      // 2. Camera Setup
      const aspect = this.container.clientWidth / this.container.clientHeight;
      this.camera = new THREE.PerspectiveCamera(42, aspect, 1, 1200);
      this.camera.position.set(this.defaultCameraPos.x, this.defaultCameraPos.y, this.defaultCameraPos.z);

      // 3. WebGL Renderer with High-Performance Settings
      try {
        this.renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance'
        });
      } catch (e) {
        console.warn('WebGL initialization failed, triggering 2D fallback:', e);
        this.showWebGLFallback();
        return;
      }

      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.outputEncoding = THREE.sRGBEncoding;
      this.container.appendChild(this.renderer.domElement);

      // 4. OrbitControls for Intuitive Campus Navigation
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.06;
      this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // Stay above ground
      this.controls.minDistance = 20;
      this.controls.maxDistance = 450;
      this.controls.target.set(this.defaultTargetPos.x, this.defaultTargetPos.y, this.defaultTargetPos.z);
      this.controls.addEventListener('change', () => { this.needsRender = true; });

      // 5. Daylight & Architectural Lighting
      this.setupLights();

      // 6. Complete Campus Environment (Ground, Ponds, Canal, Switchyard, Football Field, Roads)
      this.setupCampusEnvironment();

      // 7. Glowing Building Selection Ring
      this.setupSelectionRing();

      // 8. Event Handlers
      this.setupEventListeners();

      // 9. Start Render Loop
      this.animate(0);
    }

    setupLights() {
      // Natural Hemisphere Ambient Fill
      const hemiLight = new THREE.HemisphereLight(0xFFFFFF, 0xCBD5E1, 0.70);
      hemiLight.position.set(0, 200, 0);
      this.scene.add(hemiLight);

      // Soft Ambient Light
      const ambLight = new THREE.AmbientLight(0xFFFFFF, 0.35);
      this.scene.add(ambLight);

      // Main Sun Directional Light casting realistic shadows
      this.dirLight = new THREE.DirectionalLight(0xFFFBEB, 0.95);
      this.dirLight.position.set(130, 220, 110);
      this.dirLight.castShadow = true;
      this.dirLight.shadow.mapSize.width = 2048;
      this.dirLight.shadow.mapSize.height = 2048;
      this.dirLight.shadow.camera.near = 10;
      this.dirLight.shadow.camera.far = 600;
      this.dirLight.shadow.camera.left = -220;
      this.dirLight.shadow.camera.right = 220;
      this.dirLight.shadow.camera.top = 220;
      this.dirLight.shadow.camera.bottom = -220;
      this.dirLight.shadow.bias = -0.0004;
      this.scene.add(this.dirLight);
    }

    /* ═════════════════════════════════════════════════════════════════
       Campus Geography, Roads, Ponds, Canal, Switchyard, Sports Field
       ═════════════════════════════════════════════════════════════════ */
    setupCampusEnvironment() {
      // 1. Master Campus Ground Turf
      const groundGeo = new THREE.PlaneGeometry(420, 440);
      const groundMat = new THREE.MeshStandardMaterial({
        color: 0x7CA96A, // Natural Thai lawn green
        roughness: 0.92,
        metalness: 0.05
      });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(-15, 0, -20);
      ground.receiveShadow = true;
      this.scene.add(ground);

      // Campus Perimeter Boundary Base
      const curbGeo = new THREE.BoxGeometry(424, 1.2, 444);
      const curbMat = new THREE.MeshStandardMaterial({ color: 0xCBD5E1, roughness: 0.85 });
      const curb = new THREE.Mesh(curbGeo, curbMat);
      curb.position.set(-15, -0.6, -20);
      curb.receiveShadow = true;
      this.scene.add(curb);

      // 2. Western Boundary Canal (คลองขุนศรี)
      this.setupWesternCanal();

      // 3. Three Retention Ponds (สระน้ำ 1, 2, 3)
      this.setupRetentionPonds();

      // 4. 500 kV Switchyard (ลานสวิตช์ยาร์ด กฟผ. ไทรน้อย)
      this.setupSwitchyard();

      // 5. Football Field / Sports Pitch
      this.setupFootballField();

      // 6. Road Network & Roundabouts
      this.setupRoadsAndRoundabouts();

      // 7. Security Guardhouse & Entrance Gate (ท.0021)
      this.setupMainEntrance();

      // 8. Landscaping, Courtyards & Trees
      this.setupLandscaping();

      // 9. Geographic 3D Landmark Labels
      this.setupLandmarkLabels();
    }

    // Western Boundary Canal: Khlong Khun Si (คลองขุนศรี)
    setupWesternCanal() {
      const canalGroup = new THREE.Group();

      // Canal Water Strip
      const waterGeo = new THREE.PlaneGeometry(24, 400);
      const waterMat = new THREE.MeshStandardMaterial({
        color: 0x2563EB,
        roughness: 0.15,
        metalness: 0.5,
        transparent: true,
        opacity: 0.92
      });
      const canalWater = new THREE.Mesh(waterGeo, waterMat);
      canalWater.rotation.x = -Math.PI / 2;
      canalWater.position.set(-195, 0.04, -20);
      canalGroup.add(canalWater);

      // Concrete Canal Embankment Wall
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x94A3B8, roughness: 0.8 });
      const eastWall = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.5, 400), wallMat);
      eastWall.position.set(-182.5, 0.5, -20);
      canalGroup.add(eastWall);

      const westWall = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.5, 400), wallMat);
      westWall.position.set(-207.5, 0.5, -20);
      canalGroup.add(westWall);

      this.scene.add(canalGroup);
    }

    // Three Retention Ponds (สระน้ำ 1, 2, 3) between spine and western boundary
    setupRetentionPonds() {
      const pondSpecs = [
        { name: 'สระน้ำ 1', x: -95, z: 45, width: 36, depth: 44 },
        { name: 'สระน้ำ 2 (ข้างแฟลต)', x: -95, z: -5, width: 36, depth: 38 },
        { name: 'สระน้ำ 3', x: -75, z: -75, width: 32, depth: 38 }
      ];

      const waterMat = new THREE.MeshStandardMaterial({
        color: 0x0284C7,
        roughness: 0.12,
        metalness: 0.45,
        transparent: true,
        opacity: 0.94
      });
      const curbMat = new THREE.MeshStandardMaterial({ color: 0xCBD5E1, roughness: 0.75 });

      pondSpecs.forEach(p => {
        const pondGroup = new THREE.Group();

        // Water surface
        const pondWater = new THREE.Mesh(new THREE.PlaneGeometry(p.width, p.depth), waterMat);
        pondWater.rotation.x = -Math.PI / 2;
        pondWater.position.set(p.x, 0.05, p.z);
        pondWater.receiveShadow = true;
        pondGroup.add(pondWater);

        // Stone boundary curb
        const borderGeo = new THREE.BoxGeometry(p.width + 1.6, 0.4, p.depth + 1.6);
        const border = new THREE.Mesh(borderGeo, curbMat);
        border.position.set(p.x, 0.2, p.z);
        border.receiveShadow = true;
        pondGroup.add(border);

        this.scene.add(pondGroup);
      });
    }

    // 500 kV Switchyard: High-voltage gantry structures, transformers, gravel ground
    setupSwitchyard() {
      const yardGroup = new THREE.Group();
      yardGroup.name = 'Switchyard500kV';

      // Crushed rock / gravel base yard
      const yardGeo = new THREE.PlaneGeometry(65, 60);
      const yardMat = new THREE.MeshStandardMaterial({ color: 0xCBD5E1, roughness: 0.95 });
      const yard = new THREE.Mesh(yardGeo, yardMat);
      yard.rotation.x = -Math.PI / 2;
      yard.position.set(-65, 0.06, 85);
      yard.receiveShadow = true;
      yardGroup.add(yard);

      // Perimeter Security Chain-link Fence
      const fenceMat = new THREE.MeshStandardMaterial({ color: 0x64748B, wireframe: true });
      const fenceGeo = new THREE.BoxGeometry(66, 3.5, 61);
      const fence = new THREE.Mesh(fenceGeo, fenceMat);
      fence.position.set(-65, 1.75, 85);
      yardGroup.add(fence);

      // Steel Lattice Gantry Towers (High-voltage bay frames)
      const steelMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.3 });
      const gantryPositions = [
        [-85, 70], [-85, 100], [-45, 70], [-45, 100]
      ];

      gantryPositions.forEach(([gx, gz]) => {
        // Dual vertical steel columns
        [-5, 5].forEach(ox => {
          const col = new THREE.Mesh(new THREE.BoxGeometry(0.8, 16, 0.8), steelMat);
          col.position.set(gx + ox, 8, gz);
          col.castShadow = true;
          yardGroup.add(col);
        });

        // Horizontal crossbeam
        const beam = new THREE.Mesh(new THREE.BoxGeometry(11, 0.8, 0.8), steelMat);
        beam.position.set(gx, 15.5, gz);
        beam.castShadow = true;
        yardGroup.add(beam);

        // Insulator strings (Porcelain/composite hanging units)
        const insMat = new THREE.MeshStandardMaterial({ color: 0xD97706, roughness: 0.4 });
        [-3, 0, 3].forEach(ix => {
          const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.5, 8), insMat);
          ins.position.set(gx + ix, 13.8, gz);
          yardGroup.add(ins);
        });
      });

      // Step-up / Step-down Power Transformer Units
      const transMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.5 });
      const finMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.6 });
      const transPositions = [[-70, 85], [-60, 85]];

      transPositions.forEach(([tx, tz]) => {
        const transBody = new THREE.Mesh(new THREE.BoxGeometry(5, 4.5, 6), transMat);
        transBody.position.set(tx, 2.25, tz);
        transBody.castShadow = true;
        yardGroup.add(transBody);

        // Cooling radiator fins
        const fin1 = new THREE.Mesh(new THREE.BoxGeometry(5.4, 3.5, 0.5), finMat);
        fin1.position.set(tx, 2, tz + 3.2);
        yardGroup.add(fin1);

        const fin2 = new THREE.Mesh(new THREE.BoxGeometry(5.4, 3.5, 0.5), finMat);
        fin2.position.set(tx, 2, tz - 3.2);
        yardGroup.add(fin2);
      });

      this.scene.add(yardGroup);
    }

    // Sports Football Pitch between D.0019 and D.0025
    setupFootballField() {
      const fieldGroup = new THREE.Group();
      const fx = 65;
      const fz = -20;
      const fw = 36;
      const fd = 54;

      // Pitch Turf
      const turfMat = new THREE.MeshStandardMaterial({ color: 0x228B22, roughness: 0.85 });
      const pitch = new THREE.Mesh(new THREE.PlaneGeometry(fw, fd), turfMat);
      pitch.rotation.x = -Math.PI / 2;
      pitch.position.set(fx, 0.06, fz);
      pitch.receiveShadow = true;
      fieldGroup.add(pitch);

      // White Chalk Markings
      const lineMat = new THREE.MeshBasicMaterial({ color: 0xF8FAFC });

      // Field boundary outline
      const outerBorder = new THREE.Mesh(new THREE.PlaneGeometry(fw - 2, fd - 2), new THREE.MeshBasicMaterial({ color: 0x228B22 }));
      const borderLine = new THREE.Mesh(new THREE.PlaneGeometry(fw, fd), lineMat);
      borderLine.rotation.x = -Math.PI / 2;
      borderLine.position.set(fx, 0.07, fz);
      fieldGroup.add(borderLine);

      // Pitch inside surface above border
      const pitchInner = new THREE.Mesh(new THREE.PlaneGeometry(fw - 1, fd - 1), turfMat);
      pitchInner.rotation.x = -Math.PI / 2;
      pitchInner.position.set(fx, 0.08, fz);
      pitchInner.receiveShadow = true;
      fieldGroup.add(pitchInner);

      // Midfield line
      const midLine = new THREE.Mesh(new THREE.PlaneGeometry(fw - 1, 0.4), lineMat);
      midLine.rotation.x = -Math.PI / 2;
      midLine.position.set(fx, 0.09, fz);
      fieldGroup.add(midLine);

      // Center Circle
      const circleGeo = new THREE.RingGeometry(4.8, 5.2, 32);
      const circle = new THREE.Mesh(circleGeo, lineMat);
      circle.rotation.x = -Math.PI / 2;
      circle.position.set(fx, 0.09, fz);
      fieldGroup.add(circle);

      // Goal Posts (North & South)
      const goalMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF });
      [-fd / 2 + 1, fd / 2 - 1].forEach(gz => {
        const goalCross = new THREE.Mesh(new THREE.BoxGeometry(6, 0.2, 0.2), goalMat);
        goalCross.position.set(fx, 2.4, fz + gz);
        fieldGroup.add(goalCross);

        [-3, 3].forEach(gx => {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.4, 0.2), goalMat);
          post.position.set(fx + gx, 1.2, fz + gz);
          fieldGroup.add(post);
        });
      });

      this.scene.add(fieldGroup);
    }

    // Complete Road Network, Boulevard, and Two Major Roundabouts
    setupRoadsAndRoundabouts() {
      const roadGroup = new THREE.Group();
      const asphaltMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.72 });
      const lineMat = new THREE.MeshBasicMaterial({ color: 0xF1F5F9 });

      // 1. Main North-South Entrance Boulevard (Passing T.0020, T.0019, D.0019)
      const mainRoad = new THREE.Mesh(new THREE.PlaneGeometry(12, 360), asphaltMat);
      mainRoad.rotation.x = -Math.PI / 2;
      mainRoad.position.set(35, 0.06, -20);
      mainRoad.receiveShadow = true;
      roadGroup.add(mainRoad);

      // Center dash stripes on Boulevard
      for (let z = -170; z <= 130; z += 12) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 5), lineMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(35, 0.08, z);
        roadGroup.add(dash);
      }

      // 2. Central Workshop Avenue (Between Spine Workshops and West Ponds)
      const spineRoad = new THREE.Mesh(new THREE.PlaneGeometry(10, 340), asphaltMat);
      spineRoad.rotation.x = -Math.PI / 2;
      spineRoad.position.set(-25, 0.05, -30);
      spineRoad.receiveShadow = true;
      roadGroup.add(spineRoad);

      // 3. West Pond & Canal Service Road
      const canalRoad = new THREE.Mesh(new THREE.PlaneGeometry(9, 320), asphaltMat);
      canalRoad.rotation.x = -Math.PI / 2;
      canalRoad.position.set(-170, 0.05, -40);
      canalRoad.receiveShadow = true;
      roadGroup.add(canalRoad);

      // 4. Horizontal Cross Connectors
      const hRoads = [
        { z: 140, x: 35, width: 90 }, // Gate entrance connection
        { z: 50, x: 0, width: 140 },  // In front of T.0020 & T.0007
        { z: 12, x: 0, width: 140 },  // In front of T.0019 & T.0006
        { z: -48, x: 45, width: 180 }, // Between D.0019, Canteen, Roundabout
        { z: -100, x: -10, width: 220 }, // North connection
        { z: -150, x: -60, width: 200 }  // Heavy workshop & North connection
      ];

      hRoads.forEach(r => {
        const road = new THREE.Mesh(new THREE.PlaneGeometry(r.width, 9), asphaltMat);
        road.rotation.x = -Math.PI / 2;
        road.position.set(r.x, 0.05, r.z);
        road.receiveShadow = true;
        roadGroup.add(road);
      });

      // 5. Eastern Science & Chemistry Roundabout (วงเวียนวิทยาศาสตร์/เคมี)
      const eastRound = this.createRoundabout(120, -60, 16, 7);
      roadGroup.add(eastRound);

      // 6. Northern Transportation Roundabout (วงเวียนศูนย์ขนส่ง อหข.)
      const northRound = this.createRoundabout(-125, -135, 16, 7);
      roadGroup.add(northRound);

      // 7. Marked Parking Bays in front of D.0019 & T.0019
      const parkingLots = [
        { x: 52, z: -48, w: 12, d: 24 }, // D.0019 Parking Lot
        { x: 52, z: 0, w: 10, d: 20 }     // T.0019 Parking Lot
      ];

      parkingLots.forEach(lot => {
        const lotMesh = new THREE.Mesh(new THREE.PlaneGeometry(lot.w, lot.d), asphaltMat);
        lotMesh.rotation.x = -Math.PI / 2;
        lotMesh.position.set(lot.x, 0.06, lot.z);
        lotMesh.receiveShadow = true;
        roadGroup.add(lotMesh);

        // Parking stall white lines
        for (let lz = lot.z - lot.d / 2 + 3; lz <= lot.z + lot.d / 2 - 3; lz += 4) {
          const stallLine = new THREE.Mesh(new THREE.PlaneGeometry(lot.w - 1, 0.25), lineMat);
          stallLine.rotation.x = -Math.PI / 2;
          stallLine.position.set(lot.x, 0.07, lz);
          roadGroup.add(stallLine);
        }
      });

      this.scene.add(roadGroup);
    }

    // Circular Asphalt Roundabout with Center Island
    createRoundabout(cx, cz, outerR, innerR) {
      const group = new THREE.Group();

      // Asphalt Ring
      const ringGeo = new THREE.RingGeometry(innerR, outerR, 36);
      const ringMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.72, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(cx, 0.06, cz);
      ring.receiveShadow = true;
      group.add(ring);

      // Center Island Lawn
      const islandGeo = new THREE.CircleGeometry(innerR - 0.2, 32);
      const islandMat = new THREE.MeshStandardMaterial({ color: 0x5B8E55, roughness: 0.9 });
      const island = new THREE.Mesh(islandGeo, islandMat);
      island.rotation.x = -Math.PI / 2;
      island.position.set(cx, 0.25, cz);
      group.add(island);

      // Island Curb
      const curbGeo = new THREE.CylinderGeometry(innerR, innerR, 0.4, 32, 1, true);
      const curbMat = new THREE.MeshStandardMaterial({ color: 0xCBD5E1 });
      const curb = new THREE.Mesh(curbGeo, curbMat);
      curb.position.set(cx, 0.2, cz);
      group.add(curb);

      // Center Landmark Tree
      const tree = this.createTreeMesh();
      tree.position.set(cx, 0.2, cz);
      tree.scale.set(1.4, 1.4, 1.4);
      group.add(tree);

      return group;
    }

    // Main Security Entrance Gate & Guardhouse (ท.0021)
    setupMainEntrance() {
      const gateGroup = new THREE.Group();
      const gx = 40;
      const gz = 140;

      // Guardhouse Building (ท.0021)
      const bMat = new THREE.MeshStandardMaterial({ color: 0xE2E8F0, roughness: 0.4 });
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.6 });

      const booth = new THREE.Mesh(new THREE.BoxGeometry(6, 4.2, 5), bMat);
      booth.position.set(gx + 9, 2.1, gz);
      booth.castShadow = true;
      gateGroup.add(booth);

      // Glass windows on booth
      const winMat = new THREE.MeshStandardMaterial({ color: 0x93C5FD, metalness: 0.8, roughness: 0.2 });
      const win = new THREE.Mesh(new THREE.BoxGeometry(6.1, 1.5, 3), winMat);
      win.position.set(gx + 9, 2.5, gz);
      gateGroup.add(win);

      // Overhanging roof
      const roof = new THREE.Mesh(new THREE.BoxGeometry(8, 0.6, 7), roofMat);
      roof.position.set(gx + 9, 4.4, gz);
      roof.castShadow = true;
      gateGroup.add(roof);

      // EGAT Blue Entrance Boom Barrier Arms (ไม้กั้นทางเข้า-ออก)
      const barrierMat = new THREE.MeshStandardMaterial({ color: 0x0284C7 });
      const poleMat = new THREE.MeshStandardMaterial({ color: 0xF59E0B });

      // Center island pillar
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.8), poleMat);
      pillar.position.set(gx, 0.7, gz);
      gateGroup.add(pillar);

      // Boom Arm
      const arm = new THREE.Mesh(new THREE.BoxGeometry(7, 0.15, 0.15), barrierMat);
      arm.position.set(gx - 3.5, 1.1, gz);
      gateGroup.add(arm);

      this.scene.add(gateGroup);
    }

    // Courtyards, Reflecting Pools, Flagpoles, and Trees
    setupLandscaping() {
      // 1. Scenic Promenade Pond Behind T.0019
      const poolGeo = new THREE.PlaneGeometry(36, 12);
      const poolMat = new THREE.MeshStandardMaterial({ color: 0x0284C7, roughness: 0.1, metalness: 0.3 });
      const pool = new THREE.Mesh(poolGeo, poolMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(35, 0.08, -16);
      this.scene.add(pool);

      // 2. 3 National / EGAT Flagpoles in front of T.0019
      const poleMat = new THREE.MeshStandardMaterial({ color: 0xE2E8F0, metalness: 0.8, roughness: 0.2 });
      [-3, 0, 3].forEach(ox => {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 9, 8), poleMat);
        pole.position.set(35 + ox, 4.5, 16);
        pole.castShadow = true;
        this.scene.add(pole);
      });

      // 3. Low-Poly Trees along Campus Corridors
      const treeCoords = [
        // Along Boulevard
        [24, 120], [24, 90], [24, 60], [24, 30], [24, -10], [24, -40], [24, -70], [24, -100], [24, -130],
        [46, 120], [46, 90], [46, 60], [46, 30], [46, -70], [46, -100], [46, -130],
        // Around Football pitch
        [44, -2], [44, -12], [44, -24], [44, -36], [86, -2], [86, -12], [86, -24], [86, -36],
        // Around Retention Ponds
        [-118, 45], [-118, 25], [-118, -5], [-118, -35], [-118, -65],
        [-72, 45], [-72, 25], [-72, -5], [-72, -35],
        // North Workshop Zone
        [-5, -165], [-35, -165], [-65, -165], [-95, -165], [-125, -165]
      ];

      treeCoords.forEach(([tx, tz]) => {
        const tree = this.createTreeMesh();
        tree.position.set(tx, 0, tz);
        // Subtle random scaling for natural appearance
        const s = 0.85 + Math.random() * 0.35;
        tree.scale.set(s, s, s);
        this.scene.add(tree);
      });
    }

    createTreeMesh() {
      const group = new THREE.Group();

      // Trunk
      const trunkGeo = new THREE.CylinderGeometry(0.25, 0.45, 2.6, 6);
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350F, roughness: 0.9 });
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 1.3;
      trunk.castShadow = true;
      group.add(trunk);

      // Foliage Canopies
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

    // 3D Campus Landmark Pins (Switchyard, Football, Ponds, Gate, Roundabouts)
    setupLandmarkLabels() {
      const landmarks = [
        { text: '⚡ สวิตช์ยาร์ด 500 kV', x: -65, y: 19, z: 85, color: '#D97706' },
        { text: '⚽ สนามฟุตบอล', x: 65, y: 8, z: -20, color: '#16A34A' },
        { text: '💧 สระน้ำ 1, 2, 3', x: -95, y: 7, z: 20, color: '#0284C7' },
        { text: '🚧 ทางเข้าหลัก / ท.0021', x: 40, y: 8, z: 140, color: '#475569' },
        { text: '🧪 วงเวียนวิทยาศาสตร์/เคมี', x: 120, y: 8, z: -60, color: '#2563EB' },
        { text: '🚛 วงเวียนศูนย์ขนส่ง อหข.', x: -125, y: 8, z: -135, color: '#7C3AED' }
      ];

      landmarks.forEach(lm => {
        const sprite = this.createLandmarkSprite(lm.text, lm.color);
        sprite.position.set(lm.x, lm.y, lm.z);
        this.scene.add(sprite);
        this.landmarkSprites.push(sprite);
      });
    }

    createLandmarkSprite(text, accentColor = '#D97706') {
      const canvas = document.createElement('canvas');
      canvas.width = 340;
      canvas.height = 70;
      const ctx = canvas.getContext('2d');

      // Pill Background
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.beginPath();
      ctx.roundRect(6, 6, 328, 58, 29);
      ctx.fill();

      // Border
      ctx.lineWidth = 3;
      ctx.strokeStyle = accentColor;
      ctx.stroke();

      // Text
      ctx.font = 'bold 22px Sarabun, sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(text, 170, 42);

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;

      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(15, 3.1, 1);
      return sprite;
    }

    /* ═════════════════════════════════════════════════════════════════
       Procedural 3D Architectural Generation for Buildings
       ═════════════════════════════════════════════════════════════════ */
    populateBuildings(buildingsList) {
      // Clear old meshes and sprites
      this.buildingMeshes.forEach(mesh => this.scene.remove(mesh));
      this.buildingMeshes.clear();
      this.labelSprites.forEach(sprite => this.scene.remove(sprite));
      this.labelSprites.clear();
      this.warningSprites.forEach(sprite => this.scene.remove(sprite));
      this.warningSprites.clear();

      buildingsList.forEach(bData => {
        const buildingGroup = this.createBuildingMesh(bData);
        this.scene.add(buildingGroup);
        this.buildingMeshes.set(bData.b_code, buildingGroup);

        // Billboard Thai Label Sprite
        const labelSprite = this.createLabelSprite(bData);
        this.scene.add(labelSprite);
        this.labelSprites.set(bData.b_code, labelSprite);

        // Warning Beacon Sprite if quality anomaly exists
        if (bData.quality_status !== 'normal') {
          const warnSprite = this.createWarningSprite(bData);
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

      if (roofType === 'office_tower_9fl') {
        // T.0019 (ชธธ. 9 ชั้น - อาคารหลักกระจกฟ้าขาว พร้อมมุขทางเข้า 2 ชั้น)
        this.buildOfficeTower9Fl(group, width, depth, height);
      } else if (roofType === 'parking_complex') {
        // D.0019 (อาคารจอดรถ 4 ชั้น ขาวคาดเหลือง)
        this.buildParkingComplex(group, width, depth, height);
      } else if (roofType === 'curved_hall') {
        // D.0025 (อาคารอเนกประสงค์ / หอประชุมหลังคาโค้ง)
        this.buildCurvedHall(group, width, depth, height);
      } else if (roofType === 'competency_center') {
        // T.0020 (ศูนย์รับรองสมรรถนะฯ 3 ชั้น กระจกแถบยาว)
        this.buildCompetencyCenter(group, width, depth, height);
      } else if (roofType === 'gabled_large') {
        // T.0012 (โรงซ่อมเครื่องกลขนาดใหญ่ อบค. & ศูนย์ประดาน้ำ)
        this.buildLargeWorkshop(group, width, depth, height);
      } else if (roofType === 'gabled_warehouse' || roofType === 'gabled') {
        // กลุ่มคลังและโรงซ่อม (T.0006, T.0008, T.0010, T.0011, D.0015, T.0023, T.0027, etc.)
        this.buildGabledWarehouse(group, width, depth, height);
      } else if (roofType === 'lab_modern') {
        // กลุ่มห้องปฏิบัติการเคมีและมาตรวิทยา (T.0014, T.0015, T.0016, T.0017, T.0018)
        this.buildModernLab(group, width, depth, height);
      } else if (roofType === 'residential_balcony') {
        // B.0001 (แฟลต อบค. ที่พักอาศัย 4 ชั้น ริมสระน้ำ)
        this.buildResidentialFlat(group, width, depth, height);
      } else if (roofType === 'canteen_curved' || roofType === 'canteen') {
        // D.0017 / D.0031 (โรงอาหารหลังคาโค้ง/ลานร่มรื่น)
        this.buildCanteen(group, width, depth, height);
      } else if (roofType === 'utility_tank') {
        // D.0026 (ระบบประปาสำนักงาน พร้อมหอถังน้ำ)
        this.buildUtilityWaterStation(group, width, depth, height);
      } else {
        // Standard Flat Roof with Modern Parapet
        const parapetMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 });
        const parapet = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4, 0.6, depth + 0.4), parapetMat);
        parapet.position.y = height + 0.3;
        parapet.castShadow = true;
        group.add(parapet);
      }

      // Position in Master Plan Coordinates
      group.position.set(x, 0, z);
      return group;
    }

    // Detail Builder: T.0019 (ชธธ. 9 ชั้น)
    buildOfficeTower9Fl(group, width, depth, height) {
      const glassMat = new THREE.MeshStandardMaterial({
        color: 0x60A5FA,
        metalness: 0.85,
        roughness: 0.15
      });
      const whiteSpandrelMat = new THREE.MeshStandardMaterial({ color: 0xF8FAFC, roughness: 0.5 });
      const floors = 9;
      const floorH = height / floors;

      // 9 Floor Horizontal Glass Ribbon Strips
      for (let f = 1; f < floors; f++) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, floorH * 0.48, depth + 0.3), glassMat);
        win.position.y = f * floorH + 0.2;
        group.add(win);
      }

      // Front Grand Entrance Canopy with Columns (มุขทางเข้าด้านหน้า)
      const canopyH = 6.5;
      const canopyD = 8;
      const canopyW = 16;
      const canopyMat = new THREE.MeshStandardMaterial({ color: 0xE2E8F0, roughness: 0.4 });
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(canopyW, 0.6, canopyD), canopyMat);
      canopy.position.set(0, canopyH, depth / 2 + canopyD / 2);
      canopy.castShadow = true;
      group.add(canopy);

      // Support Columns
      const colMat = new THREE.MeshStandardMaterial({ color: 0xCBD5E1 });
      [-canopyW / 2 + 1, canopyW / 2 - 1].forEach(cx => {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, canopyH, 12), colMat);
        col.position.set(cx, canopyH / 2, depth / 2 + canopyD - 1);
        col.castShadow = true;
        group.add(col);
      });

      // Rooftop Mechanical Room / Elevator Overrun
      const mechH = 4.2;
      const mech = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.42, mechH, depth * 0.42),
        new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.65 })
      );
      mech.position.set(0, height + mechH / 2 + 0.2, 0);
      mech.castShadow = true;
      group.add(mech);

      // Rooftop Communications Antenna Mast
      const mastMat = new THREE.MeshStandardMaterial({ color: 0xE2E8F0, metalness: 0.9 });
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.25, 11, 8), mastMat);
      mast.position.set(0, height + mechH + 5.5, 0);
      mast.castShadow = true;
      group.add(mast);
    }

    // Detail Builder: D.0019 (อาคารจอดรถ 4 ชั้น สีขาวคาดแถบเหลือง กฟผ.)
    buildParkingComplex(group, width, depth, height) {
      const yellowBandMat = new THREE.MeshStandardMaterial({ color: 0xF59E0B, roughness: 0.4 }); // Signature EGAT Yellow
      const slabMat = new THREE.MeshStandardMaterial({ color: 0xCBD5E1, roughness: 0.8 });
      const louverMat = new THREE.MeshStandardMaterial({ color: 0x64748B, roughness: 0.7 });

      const floors = 4;
      const floorH = height / floors;

      // Open Deck Slabs & EGAT Yellow Accent Bands
      for (let f = 1; f <= floors; f++) {
        // Floor slab
        const slab = new THREE.Mesh(new THREE.BoxGeometry(width + 0.6, 0.5, depth + 0.6), slabMat);
        slab.position.y = f * floorH;
        group.add(slab);

        // Yellow horizontal stripe band
        const band = new THREE.Mesh(new THREE.BoxGeometry(width + 0.7, 0.4, depth + 0.7), yellowBandMat);
        band.position.y = f * floorH - 1.0;
        group.add(band);

        // Ventilation slats / louvers
        if (f < floors) {
          const louver = new THREE.Mesh(new THREE.BoxGeometry(width + 0.2, 0.15, depth + 0.2), louverMat);
          louver.position.y = f * floorH - 1.8;
          group.add(louver);
        }
      }

      // Rooftop Parapet Railing for sports court
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.8, 1.2, depth + 0.8),
        new THREE.MeshStandardMaterial({ color: 0x94A3B8, wireframe: false })
      );
      rail.position.y = height + 0.6;
      group.add(rail);
    }

    // Detail Builder: D.0025 (อาคารอเนกประสงค์ / หอประชุมหลังคาโค้ง)
    buildCurvedHall(group, width, depth, height) {
      const roofRadius = width * 0.6;
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.65 });

      // Curved Barrel Vault Roof
      const curveGeo = new THREE.CylinderGeometry(roofRadius, roofRadius, depth + 0.8, 32, 1, false, 0, Math.PI);
      const curvedRoof = new THREE.Mesh(curveGeo, roofMat);
      curvedRoof.rotation.z = Math.PI / 2;
      curvedRoof.rotation.y = Math.PI / 2;
      curvedRoof.position.set(0, height + 0.2, 0);
      curvedRoof.castShadow = true;
      group.add(curvedRoof);

      // Glass Front Entrance Glazing
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x93C5FD, metalness: 0.8, roughness: 0.2 });
      const frontGlass = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.65, height * 0.75), glassMat);
      frontGlass.position.set(0, height * 0.38, depth / 2 + 0.05);
      group.add(frontGlass);
    }

    // Detail Builder: T.0020 (ศูนย์รับรองสมรรถนะฯ 3 ชั้น)
    buildCompetencyCenter(group, width, depth, height) {
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x60A5FA, metalness: 0.8, roughness: 0.2 });
      const floors = 3;
      const floorH = height / floors;

      for (let f = 1; f < floors; f++) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, floorH * 0.45, depth + 0.3), glassMat);
        win.position.y = f * floorH + 0.2;
        group.add(win);
      }

      // Entrance Canopy
      const canopy = new THREE.Mesh(
        new THREE.BoxGeometry(10, 0.4, 4),
        new THREE.MeshStandardMaterial({ color: 0x0284C7 })
      );
      canopy.position.set(0, 3.5, depth / 2 + 2);
      canopy.castShadow = true;
      group.add(canopy);
    }

    // Detail Builder: T.0012 (โรงบำรุงรักษาเครื่องกลขนาดใหญ่ อบค.)
    buildLargeWorkshop(group, width, depth, height) {
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 });
      const roofH = 4.2;

      // Pitched Triangular Roof
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(width, depth) * 0.72, roofH, 4), roofMat);
      roof.position.y = height + roofH / 2 + 0.2;
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(width / Math.max(width, depth), 1, depth / Math.max(width, depth));
      roof.castShadow = true;
      group.add(roof);

      // Raised Roof Monitor Ridge for natural daylight ventilation
      const ridge = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.6, 1.8, depth * 0.25),
        new THREE.MeshStandardMaterial({ color: 0x64748B })
      );
      ridge.position.y = height + roofH + 0.9;
      ridge.castShadow = true;
      group.add(ridge);

      // Dual High-Clearance Roller Shutter Bay Doors (ประตูม้วนโรงซ่อมขนาดใหญ่)
      const doorMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.85 });
      const hazardMat = new THREE.MeshStandardMaterial({ color: 0xF59E0B });

      [-width * 0.24, width * 0.24].forEach(dx => {
        const door = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.26, height * 0.72), doorMat);
        door.position.set(dx, height * 0.36 + 0.2, depth / 2 + 0.05);
        group.add(door);

        // Hazard safety stripe curb
        const curbStripe = new THREE.Mesh(new THREE.BoxGeometry(width * 0.28, 0.3, 0.4), hazardMat);
        curbStripe.position.set(dx, 0.15, depth / 2 + 0.2);
        group.add(curbStripe);
      });
    }

    // Detail Builder: Standard Industrial Workshop & Warehouse (T.0006, T.0008, T.0010, T.0011, etc.)
    buildGabledWarehouse(group, width, depth, height) {
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.72 });
      const roofH = 3.2;

      // Gabled Roof
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(width, depth) * 0.74, roofH, 4), roofMat);
      roof.position.y = height + roofH / 2 + 0.2;
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(width / Math.max(width, depth), 1, depth / Math.max(width, depth));
      roof.castShadow = true;
      group.add(roof);

      // Industrial Rollup Bay Door
      const doorMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.8 });
      const door = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.36, height * 0.65), doorMat);
      door.position.set(0, height * 0.325 + 0.2, depth / 2 + 0.05);
      group.add(door);
    }

    // Detail Builder: Modern Laboratory (T.0014, T.0015, T.0016, T.0017, T.0018)
    buildModernLab(group, width, depth, height) {
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x93C5FD, metalness: 0.8, roughness: 0.2 });

      // 2nd Floor Ribbon Window Strip
      const win = new THREE.Mesh(new THREE.BoxGeometry(width + 0.2, 1.8, depth + 0.2), glassMat);
      win.position.y = height * 0.65 + 0.2;
      group.add(win);

      // Scientific Ventilation Exhaust Stacks (ท่อระบายอากาศห้องทดลองเคมี)
      const stackMat = new THREE.MeshStandardMaterial({ color: 0xCBD5E1, metalness: 0.7, roughness: 0.3 });
      [-width * 0.25, 0, width * 0.25].forEach(sx => {
        const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.8, 12), stackMat);
        stack.position.set(sx, height + 1.4 + 0.2, depth * 0.15);
        stack.castShadow = true;
        group.add(stack);
      });
    }

    // Detail Builder: B.0001 (แฟลต อบค. ที่พักอาศัย 4 ชั้น)
    buildResidentialFlat(group, width, depth, height) {
      const balconyMat = new THREE.MeshStandardMaterial({ color: 0xCBD5E1, roughness: 0.6 });
      const winMat = new THREE.MeshStandardMaterial({ color: 0x475569 });

      const floors = 4;
      const floorH = height / floors;

      for (let f = 1; f <= floors; f++) {
        // Balcony projection slab
        const slab = new THREE.Mesh(new THREE.BoxGeometry(width + 0.8, 0.4, depth + 0.8), balconyMat);
        slab.position.y = f * floorH + 0.2;
        group.add(slab);

        // Balcony safety railing
        const rail = new THREE.Mesh(new THREE.BoxGeometry(width + 0.9, 0.8, depth + 0.9), balconyMat);
        rail.position.y = f * floorH + 0.6 + 0.2;
        group.add(rail);
      }
    }

    // Detail Builder: D.0017 / D.0031 (โรงอาหาร)
    buildCanteen(group, width, depth, height) {
      // Overhanging Pavilion Roof
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.6 });
      const roof = new THREE.Mesh(new THREE.BoxGeometry(width + 4, 0.8, depth + 4), roofMat);
      roof.position.y = height + 0.4 + 0.2;
      roof.castShadow = true;
      group.add(roof);

      // Outdoor Dining Terrace Eaves
      const patioMat = new THREE.MeshStandardMaterial({ color: 0xE2E8F0, roughness: 0.7 });
      const patio = new THREE.Mesh(new THREE.BoxGeometry(width + 6, 0.2, depth + 6), patioMat);
      patio.position.y = 0.15;
      patio.receiveShadow = true;
      group.add(patio);
    }

    // Detail Builder: D.0026 (ระบบประปาสำนักงาน พร้อมถังน้ำทรงกระบอก)
    buildUtilityWaterStation(group, width, depth, height) {
      const tankMat = new THREE.MeshStandardMaterial({
        color: 0x0284C7,
        metalness: 0.6,
        roughness: 0.3
      });

      // Twin elevated storage cylinders
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

      // Rounded container pill
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.beginPath();
      ctx.roundRect(8, 8, 384, 84, 18);
      ctx.fill();

      // Golden Amber border
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#F59E0B';
      ctx.stroke();

      // Building Code (e.g. T.0019)
      ctx.font = 'bold 26px Sarabun, sans-serif';
      ctx.fillStyle = '#F59E0B';
      ctx.textAlign = 'center';
      ctx.fillText(bData.b_code, 200, 42);

      // Building Thai Name
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

    createWarningSprite(bData) {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');

      // Alert red disc
      ctx.fillStyle = '#DC2626';
      ctx.beginPath();
      ctx.arc(32, 32, 26, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 4;
      ctx.stroke();

      // Exclamation Mark
      ctx.font = 'bold 32px sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText('!', 32, 43);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
      const sprite = new THREE.Sprite(spriteMat);

      const { height } = bData.dimensions;
      const { x, z } = bData.layout_position;
      sprite.position.set(x + bData.dimensions.width * 0.45, height + 10, z);
      sprite.scale.set(3.8, 3.8, 1);
      sprite.userData = { b_code: bData.b_code };

      return sprite;
    }

    setupSelectionRing() {
      const ringGeo = new THREE.RingGeometry(1, 1.25, 36);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xF59E0B, // Vibrant Amber/Gold
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
    updateBuildingColors(buildingsList) {
      buildingsList.forEach(bData => {
        const group = this.buildingMeshes.get(bData.b_code);
        if (group && group.userData.mainMaterial) {
          const colorInfo = window.EnergyTwin.getColorForBuilding(bData);
          group.userData.mainMaterial.color.set(colorInfo.hex);
        }

        // Toggle warning icon
        let warnSprite = this.warningSprites.get(bData.b_code);
        if (bData.quality_status !== 'normal') {
          if (!warnSprite) {
            warnSprite = this.createWarningSprite(bData);
            this.scene.add(warnSprite);
            this.warningSprites.set(bData.b_code, warnSprite);
          }
          warnSprite.visible = true;
        } else if (warnSprite) {
          warnSprite.visible = false;
        }
      });

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
      } else { // low
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

      // Position glowing selection ring around base
      if (this.selectionRing) {
        const radius = Math.max(bData.dimensions.width, bData.dimensions.depth) * 0.88;
        this.selectionRing.geometry.dispose();
        this.selectionRing.geometry = new THREE.RingGeometry(radius, radius + 1.4, 36);
        this.selectionRing.position.set(bData.layout_position.x, 0.14, bData.layout_position.z);
        this.selectionRing.visible = true;
      }

      // Smooth Fly-to Animation
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

    // Reset Camera to Campus Overview
    resetView() {
      this.selectBuilding(null, false);
      this.animateCamera(this.defaultCameraPos, this.defaultTargetPos, 850);
    }

    // Top-Down Orthogonal-like Map View (Master Plan View)
    setTopDownView() {
      const topCam = { x: -10, y: 220, z: -14.99 };
      const topTarget = { x: -10, y: 0, z: -15 };
      this.animateCamera(topCam, topTarget, 850);
    }

    // Multi-Zone Navigation Presets
    focusZone(zoneKey) {
      if (zoneKey === 'office') {
        // Zone 1: Office & Labs (T.0019, T.0020, D.0019, Chemistry Roundabout)
        this.animateCamera({ x: 65, y: 80, z: 70 }, { x: 50, y: 10, z: -20 }, 850);
      } else if (zoneKey === 'workshop') {
        // Zone 2: Central Workshops & Warehouses (T.0006 - T.0012)
        this.animateCamera({ x: -10, y: 80, z: 30 }, { x: -25, y: 5, z: -60 }, 850);
      } else if (zoneKey === 'switchyard') {
        // Zone 3: Switchyard 500 kV, Ponds & Residential Flat
        this.animateCamera({ x: -60, y: 90, z: 140 }, { x: -90, y: 5, z: 40 }, 850);
      } else if (zoneKey === 'transport') {
        // Zone 4: Transportation Hub (T.0026 - T.0029, Roundabout)
        this.animateCamera({ x: -110, y: 80, z: -70 }, { x: -130, y: 5, z: -145 }, 850);
      }
    }

    // Smooth Camera Transition via Cubic Ease-In-Out
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
      // Window Resize
      window.addEventListener('resize', () => {
        if (!this.container || !this.renderer || !this.camera) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this.needsRender = true;
      });

      // Pointer Move for Hover Highlight
      this.renderer.domElement.addEventListener('pointermove', (event) => {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.checkHover();
      });

      // Pointer Click / Tap
      this.renderer.domElement.addEventListener('pointerup', (event) => {
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
        // Reset previous hovered building emissive
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

    // Render Loop with Demand-Driven Optimization
    animate(time) {
      requestAnimationFrame((t) => this.animate(t));

      // Pulse Selection Ring
      if (this.selectionRing && this.selectionRing.visible) {
        const pulse = 1 + Math.sin(time * 0.005) * 0.04;
        this.selectionRing.scale.set(pulse, pulse, 1);
        this.needsRender = true;
      }

      // Gentle floating animation for warning icons
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

      if (this.controls) {
        this.controls.update();
      }

      if (this.needsRender || this.isAnimatingCamera) {
        this.renderer.render(this.scene, this.camera);
        this.needsRender = false;
      }
    }

    // Graceful 2D Fallback for Legacy Browsers
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

  // Expose CampusScene globally
  window.CampusScene = CampusScene;

})(window);
