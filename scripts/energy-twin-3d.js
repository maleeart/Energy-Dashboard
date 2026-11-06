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

    init() {
      // 1. Scene & Daylight Atmosphere
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0xEDF2F7);
      this.scene.fog = new THREE.FogExp2(0xEDF2F7, 0.0018);

      // 2. Camera Setup
      const aspect = this.container.clientWidth / this.container.clientHeight;
      this.camera = new THREE.PerspectiveCamera(42, aspect, 1, 1400);
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
      // Natural Hemisphere Ambient Fill
      this.hemiLight = new THREE.HemisphereLight(0xFFFFFF, 0xCBD5E1, 0.72);
      this.hemiLight.position.set(0, 220, 0);
      this.scene.add(this.hemiLight);

      // Soft Ambient Light
      this.ambLight = new THREE.AmbientLight(0xFFFFFF, 0.35);
      this.scene.add(this.ambLight);

      // Main Sun Directional Light
      this.dirLight = new THREE.DirectionalLight(0xFFFBEB, 0.95);
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
      this.dirLight.shadow.bias = -0.0004;
      this.scene.add(this.dirLight);
    }

    /* ═════════════════════════════════════════════════════════════════
       Campus Geography, Roads, Water Bodies, Switchyard, Sports Fields
       ═════════════════════════════════════════════════════════════════ */
    setupCampusEnvironment() {
      // 1. Master Campus Ground Turf (Extending north to cover OHK expansion)
      const groundGeo = new THREE.PlaneGeometry(440, 520);
      const groundMat = new THREE.MeshStandardMaterial({
        color: 0x7CA96A, // Natural Thai lawn green
        roughness: 0.92,
        metalness: 0.05
      });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(-20, 0, -40);
      ground.receiveShadow = true;
      this.scene.add(ground);

      // Campus Perimeter Boundary Base
      const curbGeo = new THREE.BoxGeometry(444, 1.2, 524);
      const curbMat = new THREE.MeshStandardMaterial({ color: 0xCBD5E1, roughness: 0.85 });
      const curb = new THREE.Mesh(curbGeo, curbMat);
      curb.position.set(-20, -0.6, -40);
      curb.receiveShadow = true;
      this.scene.add(curb);

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

      // 8. Landscaping, Courtyards & Trees
      this.setupLandscaping();

      // 9. OHK Detailed Infrastructure (As-Built SNO-RF11-SN-2/6)
      this.setupOHKInfrastructure();

      // 10. Geographic 3D Landmark Labels
      this.setupLandmarkLabels();
    }

    // Western Boundary Canal: Khlong Khun Si (คลองขุนศรี)
    setupWesternCanal() {
      const canalGroup = new THREE.Group();

      const waterGeo = new THREE.PlaneGeometry(24, 480);
      const waterMat = new THREE.MeshStandardMaterial({
        color: 0x2563EB,
        roughness: 0.15,
        metalness: 0.5,
        transparent: true,
        opacity: 0.92
      });
      const canalWater = new THREE.Mesh(waterGeo, waterMat);
      canalWater.rotation.x = -Math.PI / 2;
      canalWater.position.set(-200, 0.04, -40);
      canalGroup.add(canalWater);

      // Concrete Canal Embankment Wall
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x94A3B8, roughness: 0.8 });
      const eastWall = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.5, 480), wallMat);
      eastWall.position.set(-187.5, 0.5, -40);
      canalGroup.add(eastWall);

      const westWall = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.5, 480), wallMat);
      westWall.position.set(-212.5, 0.5, -40);
      canalGroup.add(westWall);

      this.scene.add(canalGroup);
    }

    // Three Central Retention Ponds (สระน้ำ 1, 2, 3)
    setupCentralRetentionPonds() {
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

        const pondWater = new THREE.Mesh(new THREE.PlaneGeometry(p.width, p.depth), waterMat);
        pondWater.rotation.x = -Math.PI / 2;
        pondWater.position.set(p.x, 0.05, p.z);
        pondWater.receiveShadow = true;
        pondGroup.add(pondWater);

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

      const yardGeo = new THREE.PlaneGeometry(65, 60);
      const yardMat = new THREE.MeshStandardMaterial({ color: 0xCBD5E1, roughness: 0.95 });
      const yard = new THREE.Mesh(yardGeo, yardMat);
      yard.rotation.x = -Math.PI / 2;
      yard.position.set(-65, 0.06, 85);
      yard.receiveShadow = true;
      yardGroup.add(yard);

      const fenceMat = new THREE.MeshStandardMaterial({ color: 0x64748B, wireframe: true });
      const fenceGeo = new THREE.BoxGeometry(66, 3.5, 61);
      const fence = new THREE.Mesh(fenceGeo, fenceMat);
      fence.position.set(-65, 1.75, 85);
      yardGroup.add(fence);

      const steelMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.3 });
      const gantryPositions = [
        [-85, 70], [-85, 100], [-45, 70], [-45, 100]
      ];

      gantryPositions.forEach(([gx, gz]) => {
        [-5, 5].forEach(ox => {
          const col = new THREE.Mesh(new THREE.BoxGeometry(0.8, 16, 0.8), steelMat);
          col.position.set(gx + ox, 8, gz);
          col.castShadow = true;
          yardGroup.add(col);
        });

        const beam = new THREE.Mesh(new THREE.BoxGeometry(11, 0.8, 0.8), steelMat);
        beam.position.set(gx, 15.5, gz);
        beam.castShadow = true;
        yardGroup.add(beam);

        const insMat = new THREE.MeshStandardMaterial({ color: 0xD97706, roughness: 0.4 });
        [-3, 0, 3].forEach(ix => {
          const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.5, 8), insMat);
          ins.position.set(gx + ix, 13.8, gz);
          yardGroup.add(ins);
        });
      });

      // Step-up / Step-down Power Transformers
      const transMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.5 });
      const finMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.6 });
      const transPositions = [[-70, 85], [-60, 85]];

      transPositions.forEach(([tx, tz]) => {
        const transBody = new THREE.Mesh(new THREE.BoxGeometry(5, 4.5, 6), transMat);
        transBody.position.set(tx, 2.25, tz);
        transBody.castShadow = true;
        yardGroup.add(transBody);

        const fin1 = new THREE.Mesh(new THREE.BoxGeometry(5.4, 3.5, 0.5), finMat);
        fin1.position.set(tx, 2, tz + 3.2);
        yardGroup.add(fin1);

        const fin2 = new THREE.Mesh(new THREE.BoxGeometry(5.4, 3.5, 0.5), finMat);
        fin2.position.set(tx, 2, tz - 3.2);
        yardGroup.add(fin2);
      });

      this.scene.add(yardGroup);
    }

    // Main Football Pitch between D.0019 and D.0025
    setupMainFootballField() {
      const fieldGroup = new THREE.Group();
      // Main Campus Football Pitch: Situated between D.0019 and D.0025 flanking T.0019
      const fx = 65;
      const fz = -20;
      const fw = 36;
      const fd = 54;

      const turfMat = new THREE.MeshStandardMaterial({ color: 0x228B22, roughness: 0.85 });
      const pitch = new THREE.Mesh(new THREE.PlaneGeometry(fw, fd), turfMat);
      pitch.rotation.x = -Math.PI / 2;
      pitch.position.set(fx, 0.06, fz);
      pitch.receiveShadow = true;
      fieldGroup.add(pitch);

      const lineMat = new THREE.MeshBasicMaterial({ color: 0xF8FAFC });

      const borderLine = new THREE.Mesh(new THREE.PlaneGeometry(fw, fd), lineMat);
      borderLine.rotation.x = -Math.PI / 2;
      borderLine.position.set(fx, 0.07, fz);
      fieldGroup.add(borderLine);

      const pitchInner = new THREE.Mesh(new THREE.PlaneGeometry(fw - 1, fd - 1), turfMat);
      pitchInner.rotation.x = -Math.PI / 2;
      pitchInner.position.set(fx, 0.08, fz);
      pitchInner.receiveShadow = true;
      fieldGroup.add(pitchInner);

      const midLine = new THREE.Mesh(new THREE.PlaneGeometry(fw - 1, 0.4), lineMat);
      midLine.rotation.x = -Math.PI / 2;
      midLine.position.set(fx, 0.09, fz);
      fieldGroup.add(midLine);

      const circleGeo = new THREE.RingGeometry(4.8, 5.2, 32);
      const circle = new THREE.Mesh(circleGeo, lineMat);
      circle.rotation.x = -Math.PI / 2;
      circle.position.set(fx, 0.09, fz);
      fieldGroup.add(circle);

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

    // Main Campus Road Network & Eastern Roundabout
    setupMainRoadsAndRoundabouts() {
      const roadGroup = new THREE.Group();
      const asphaltMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.72 });
      const lineMat = new THREE.MeshBasicMaterial({ color: 0xF1F5F9 });

      // 1. Main North-South Entrance Boulevard (Passing T.0020, T.0019, D.0019)
      const mainBoulevard = new THREE.Mesh(new THREE.PlaneGeometry(12, 360), asphaltMat);
      mainBoulevard.rotation.x = -Math.PI / 2;
      mainBoulevard.position.set(35, 0.06, -20);
      mainBoulevard.receiveShadow = true;
      roadGroup.add(mainBoulevard);

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

      // 4. Horizontal Cross Streets
      const hRoads = [
        { z: 140, x: 35, width: 90 }, // Front Gate & Substation Street
        { z: 50, x: 0, width: 140 },  // Front of T.0020 & T.0007
        { z: 12, x: 0, width: 140 },  // Front of T.0019 & T.0006
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

      // 5. Eastern Science & Chemistry Roundabout (in front of T.0018 & T.0016)
      const eastRound = this.createRoundabout(120, -60, 16, 7.5);
      roadGroup.add(eastRound);

      // Diagonal Road Connector from T.0018 Roundabout to OHK Zone
      const ohkDiag = new THREE.Mesh(new THREE.PlaneGeometry(9, 90), asphaltMat);
      ohkDiag.rotation.x = -Math.PI / 2;
      ohkDiag.rotation.z = 0.55; // Angle northwest
      ohkDiag.position.set(-95, 0.05, -75);
      roadGroup.add(ohkDiag);

      // Marked Parking Bays in front of D.0019 & T.0019
      const parkingLots = [
        { x: 52, z: -48, w: 12, d: 24 },
        { x: 52, z: 0, w: 10, d: 20 }
      ];

      parkingLots.forEach(lot => {
        const lotMesh = new THREE.Mesh(new THREE.PlaneGeometry(lot.w, lot.d), asphaltMat);
        lotMesh.rotation.x = -Math.PI / 2;
        lotMesh.position.set(lot.x, 0.06, lot.z);
        lotMesh.receiveShadow = true;
        roadGroup.add(lotMesh);

        for (let lz = lot.z - lot.d / 2 + 3; lz <= lot.z + lot.d / 2 - 3; lz += 4) {
          const stallLine = new THREE.Mesh(new THREE.PlaneGeometry(lot.w - 1, 0.25), lineMat);
          stallLine.rotation.x = -Math.PI / 2;
          stallLine.position.set(lot.x, 0.07, lz);
          roadGroup.add(stallLine);
        }
      });

      this.scene.add(roadGroup);
    }

    createRoundabout(cx, cz, outerR, innerR) {
      const group = new THREE.Group();

      const ringGeo = new THREE.RingGeometry(innerR, outerR, 36);
      const ringMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.72, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(cx, 0.06, cz);
      ring.receiveShadow = true;
      group.add(ring);

      const islandGeo = new THREE.CircleGeometry(innerR - 0.2, 32);
      const islandMat = new THREE.MeshStandardMaterial({ color: 0x5B8E55, roughness: 0.9 });
      const island = new THREE.Mesh(islandGeo, islandMat);
      island.rotation.x = -Math.PI / 2;
      island.position.set(cx, 0.25, cz);
      group.add(island);

      const curbGeo = new THREE.CylinderGeometry(innerR, innerR, 0.4, 32, 1, true);
      const curbMat = new THREE.MeshStandardMaterial({ color: 0xCBD5E1 });
      const curb = new THREE.Mesh(curbGeo, curbMat);
      curb.position.set(cx, 0.2, cz);
      group.add(curb);

      const tree = this.createTreeMesh();
      tree.position.set(cx, 0.2, cz);
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
      const concreteApronMat = new THREE.MeshStandardMaterial({ color: 0xDCE3EB, roughness: 0.75 });
      const waterMat = new THREE.MeshStandardMaterial({
        color: 0x0284C7,
        roughness: 0.12,
        metalness: 0.45,
        transparent: true,
        opacity: 0.94
      });
      const curbMat = new THREE.MeshStandardMaterial({ color: 0xCBD5E1, roughness: 0.75 });

      // ── 1. Curved Peanut-Shaped Retention Pond (สระน้ำ อหข. WL +99.00) ──
      const pondGroup = new THREE.Group();
      // South lobe of pond (near D.0031)
      const lobe1 = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 0.2, 32), waterMat);
      lobe1.position.set(-185, 0.1, -170);
      pondGroup.add(lobe1);

      // North lobe of pond
      const lobe2 = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 0.2, 32), waterMat);
      lobe2.position.set(-188, 0.1, -195);
      pondGroup.add(lobe2);

      // Connecting neck
      const neck = new THREE.Mesh(new THREE.BoxGeometry(16, 0.2, 24), waterMat);
      neck.position.set(-186, 0.1, -182);
      pondGroup.add(neck);

      // Stone border around pond
      const curbLobe1 = new THREE.Mesh(new THREE.CylinderGeometry(14.8, 14.8, 0.35, 32, 1, true), curbMat);
      curbLobe1.position.set(-185, 0.2, -170);
      pondGroup.add(curbLobe1);

      const curbLobe2 = new THREE.Mesh(new THREE.CylinderGeometry(12.8, 12.8, 0.35, 32, 1, true), curbMat);
      curbLobe2.position.set(-188, 0.2, -195);
      pondGroup.add(curbLobe2);

      // Waterfront Gazebo Pavilion (ศาลาพักผ่อนริมน้ำ อหข.) with Pier
      const pierMat = new THREE.MeshStandardMaterial({ color: 0x78350F, roughness: 0.8 });
      const pier = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 10), pierMat);
      pier.position.set(-170, 0.25, -180);
      pondGroup.add(pier);

      const gazeboRoofMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.6 });
      const gazeboRoof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 2.2, 8), gazeboRoofMat);
      gazeboRoof.position.set(-173, 3.2, -180);
      gazeboRoof.castShadow = true;
      pondGroup.add(gazeboRoof);

      // Gazebo deck and columns
      const gazeboDeck = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.3, 8), pierMat);
      gazeboDeck.position.set(-173, 0.3, -180);
      pondGroup.add(gazeboDeck);

      for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
        const col = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6),
          new THREE.MeshStandardMaterial({ color: 0xCBD5E1 })
        );
        col.position.set(-173 + Math.cos(a) * 2.8, 1.6, -180 + Math.sin(a) * 2.8);
        col.castShadow = true;
        pondGroup.add(col);
      }

      ohkGroup.add(pondGroup);

      // ── 2. Grand OHK Roundabout (วงเวียนใหญ่ อหข.) ──
      // Positioned cleanly without intersecting any building: Center (-130, -160)
      const rCenter = { x: -130, z: -160 };
      const outerR = 20;
      const innerR = 11;

      // Asphalt Ring
      const ringGeo = new THREE.RingGeometry(innerR, outerR, 40);
      const ring = new THREE.Mesh(ringGeo, asphaltMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(rCenter.x, 0.06, rCenter.z);
      ring.receiveShadow = true;
      ohkGroup.add(ring);

      // Raised Landscape Island Mound
      const moundGeo = new THREE.CylinderGeometry(innerR - 0.2, innerR - 0.1, 0.8, 36);
      const moundMat = new THREE.MeshStandardMaterial({ color: 0x5B8E55, roughness: 0.9 });
      const mound = new THREE.Mesh(moundGeo, moundMat);
      mound.position.set(rCenter.x, 0.4, rCenter.z);
      ohkGroup.add(mound);

      // Decorative Walkway Ring inside Roundabout Mound
      const walkRing1 = new THREE.Mesh(new THREE.RingGeometry(4.5, 6.5, 32), new THREE.MeshBasicMaterial({ color: 0xE2E8F0 }));
      walkRing1.rotation.x = -Math.PI / 2;
      walkRing1.position.set(rCenter.x, 0.81, rCenter.z);
      ohkGroup.add(walkRing1);

      // Center Landmark Palm / Tree
      const rTree = this.createTreeMesh();
      rTree.position.set(rCenter.x, 0.8, rCenter.z);
      rTree.scale.set(1.5, 1.5, 1.5);
      ohkGroup.add(rTree);

      // ── 3. Heavy Vehicle Apron & Maneuvering Yard (ลานคอนกรีตลานกลับรถ อหข.) ──
      // Positioned in front of Heavy Workshops T.0028 & T.0029
      const apronGeo = new THREE.PlaneGeometry(65, 55);
      const apron = new THREE.Mesh(apronGeo, concreteApronMat);
      apron.rotation.x = -Math.PI / 2;
      apron.position.set(-120, 0.05, -115);
      apron.receiveShadow = true;
      ohkGroup.add(apron);

      // ── 4. OHK Road Network (Access & Perimeter Ring Roads - NO Football Pitch in OHK) ──
      // South Access Road from campus spine into OHK Roundabout
      const accessRoad = new THREE.Mesh(new THREE.PlaneGeometry(9, 70), asphaltMat);
      accessRoad.rotation.x = -Math.PI / 2;
      accessRoad.position.set(-130, 0.06, -115);
      accessRoad.receiveShadow = true;
      ohkGroup.add(accessRoad);

      // North Perimeter Loop Road behind T.0026 Office
      const northLoop = new THREE.Mesh(new THREE.PlaneGeometry(100, 8), asphaltMat);
      northLoop.rotation.x = -Math.PI / 2;
      northLoop.position.set(-130, 0.06, -235);
      northLoop.receiveShadow = true;
      ohkGroup.add(northLoop);

      // East Perimeter Road behind garage T.0027
      const eastLoop = new THREE.Mesh(new THREE.PlaneGeometry(8, 75), asphaltMat);
      eastLoop.rotation.x = -Math.PI / 2;
      eastLoop.position.set(-45, 0.06, -200);
      eastLoop.receiveShadow = true;
      ohkGroup.add(eastLoop);

      // ── 6. 230 kV Ang Thong 2 Transmission Line Right-of-Way Crossing ──
      const pylonGroup = new THREE.Group();
      const pylonMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.85, roughness: 0.3 });
      const pylonCoords = [
        [-175, -230],
        [-65, -150]
      ];

      pylonCoords.forEach(([px, pz]) => {
        // 4-legged lattice steel transmission tower
        const h = 26;
        [-2.5, 2.5].forEach(ox => {
          [-2.5, 2.5].forEach(oz => {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, h, 6), pylonMat);
            leg.position.set(px + ox * 0.7, h / 2, pz + oz * 0.7);
            leg.castShadow = true;
            pylonGroup.add(leg);
          });
        });

        // 3 Crossarms for 230 kV conductors
        [h - 7, h - 3.5, h].forEach((ch, ci) => {
          const armW = 14 - ci * 2.5;
          const arm = new THREE.Mesh(new THREE.BoxGeometry(armW, 0.6, 0.6), pylonMat);
          arm.position.set(px, ch, pz);
          arm.castShadow = true;
          pylonGroup.add(arm);
        });
      });
      ohkGroup.add(pylonGroup);

      this.scene.add(ohkGroup);
    }

    setupMainEntrance() {
      const gateGroup = new THREE.Group();
      const gx = 40;
      const gz = 140;

      const bMat = new THREE.MeshStandardMaterial({ color: 0xE2E8F0, roughness: 0.4 });
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.6 });

      const booth = new THREE.Mesh(new THREE.BoxGeometry(6, 4.2, 5), bMat);
      booth.position.set(gx + 9, 2.1, gz);
      booth.castShadow = true;
      gateGroup.add(booth);

      const winMat = new THREE.MeshStandardMaterial({ color: 0x93C5FD, metalness: 0.8, roughness: 0.2 });
      const win = new THREE.Mesh(new THREE.BoxGeometry(6.1, 1.5, 3), winMat);
      win.position.set(gx + 9, 2.5, gz);
      gateGroup.add(win);

      const roof = new THREE.Mesh(new THREE.BoxGeometry(8, 0.6, 7), roofMat);
      roof.position.set(gx + 9, 4.4, gz);
      roof.castShadow = true;
      gateGroup.add(roof);

      const barrierMat = new THREE.MeshStandardMaterial({ color: 0x0284C7 });
      const poleMat = new THREE.MeshStandardMaterial({ color: 0xF59E0B });

      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.8), poleMat);
      pillar.position.set(gx, 0.7, gz);
      gateGroup.add(pillar);

      const arm = new THREE.Mesh(new THREE.BoxGeometry(7, 0.15, 0.15), barrierMat);
      arm.position.set(gx - 3.5, 1.1, gz);
      gateGroup.add(arm);

      this.scene.add(gateGroup);
    }

    setupLandscaping() {
      // 1. Scenic Promenade Pond & Lake Behind T.0019 (Matching 3D Prototype & crop_field.jpg)
      const poolGroup = new THREE.Group();
      const poolGeo = new THREE.PlaneGeometry(42, 18);
      const poolMat = new THREE.MeshStandardMaterial({
        color: 0x0284C7,
        roughness: 0.1,
        metalness: 0.35,
        transparent: true,
        opacity: 0.92
      });
      const pool = new THREE.Mesh(poolGeo, poolMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(35, 0.08, 24);
      pool.receiveShadow = true;
      poolGroup.add(pool);

      // Wooden footbridges crossing the lake
      const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x78350F, roughness: 0.75 });
      [-9, 9].forEach(bx => {
        const bridge = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.35, 20), bridgeMat);
        bridge.position.set(35 + bx, 0.28, 24);
        bridge.castShadow = true;
        poolGroup.add(bridge);
      });

      // Stone border curb
      const poolCurb = new THREE.Mesh(
        new THREE.BoxGeometry(43.6, 0.4, 19.6),
        new THREE.MeshStandardMaterial({ color: 0xCBD5E1, roughness: 0.8 })
      );
      poolCurb.position.set(35, 0.2, 24);
      poolGroup.add(poolCurb);
      this.scene.add(poolGroup);

      const poleMat = new THREE.MeshStandardMaterial({ color: 0xE2E8F0, metalness: 0.8, roughness: 0.2 });
      [-3, 0, 3].forEach(ox => {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 9, 8), poleMat);
        pole.position.set(35 + ox, 4.5, -20);
        pole.castShadow = true;
        this.scene.add(pole);
      });

      const treeCoords = [
        [24, 120], [24, 90], [24, 60], [24, 30], [24, -10], [24, -40], [24, -70], [24, -100], [24, -130],
        [46, 120], [46, 90], [46, 60], [46, 30], [46, -70], [46, -100], [46, -130],
        [44, -2], [44, -12], [44, -24], [44, -36], [86, -2], [86, -12], [86, -24], [86, -36],
        [-118, 45], [-118, 25], [-118, -5], [-118, -35], [-118, -65],
        [-72, 45], [-72, 25], [-72, -5], [-72, -35],
        [-5, -165], [-35, -165], [-65, -165],
        // OHK Perimeter Trees
        [-170, -180], [-170, -200], [-170, -220], [-120, -235], [-90, -235], [-60, -210], [-60, -170]
      ];

      treeCoords.forEach(([tx, tz]) => {
        const tree = this.createTreeMesh();
        tree.position.set(tx, 0, tz);
        const s = 0.85 + Math.random() * 0.35;
        tree.scale.set(s, s, s);
        this.scene.add(tree);
      });

      // ── Shrines & Iconic Campus Monuments from 3D Prototype (19-6-63) ──
      // 1. พระวิษณุกรรม Shrine (Between T.0020 and T.0007)
      const shrineMat = new THREE.MeshStandardMaterial({ color: 0xD97706, roughness: 0.4 });
      const shrineBase = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.2, 3.5), new THREE.MeshStandardMaterial({ color: 0xF1F5F9 }));
      shrineBase.position.set(40, 0.6, 45);
      this.scene.add(shrineBase);
      const shrineStatue = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 2.0, 8), shrineMat);
      shrineStatue.position.set(40, 2.2, 45);
      this.scene.add(shrineStatue);

      // 2. หลวงพ่อเจ็ดกษัตริย์ Shrine (Near Canteen D.0017 and T.0010)
      const shrine2Base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.0, 3.2), new THREE.MeshStandardMaterial({ color: 0xF1F5F9 }));
      shrine2Base.position.set(35, 0.5, -90);
      this.scene.add(shrine2Base);
      const shrine2Statue = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.8, 1.8, 8), shrineMat);
      shrine2Statue.position.set(35, 1.9, -90);
      this.scene.add(shrine2Statue);

      // 3. Blue Parking Sheds: ต.0016 and ต.0018
      const shedMat = new THREE.MeshStandardMaterial({ color: 0x1E40AF, roughness: 0.5 });
      // ต.0016 โรงจอดรถยนต์ (Between T.0008 and T.0011)
      const shed16 = new THREE.Mesh(new THREE.BoxGeometry(6, 3.5, 26), shedMat);
      shed16.position.set(65, 1.75, -45);
      this.scene.add(shed16);
      // ต.0018 โรงจอดรถยนต์ (In front of T.0012)
      const shed18 = new THREE.Mesh(new THREE.BoxGeometry(30, 3.5, 7), shedMat);
      shed18.position.set(15, 1.75, -165);
      this.scene.add(shed18);

      // 4. ลานกองของ อบค. (Behind T.0012)
      const storageYard = new THREE.Mesh(new THREE.PlaneGeometry(36, 24), new THREE.MeshStandardMaterial({ color: 0xCBD5E1, roughness: 0.9 }));
      storageYard.rotation.x = -Math.PI / 2;
      storageYard.position.set(15, 0.05, -195);
      this.scene.add(storageYard);
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

    setupLandmarkLabels() {
      const landmarks = [
        { text: '⚡ สวิตช์ยาร์ด 500 kV', x: -65, y: 19, z: 85, color: '#D97706' },
        { text: '⚽ สนามฟุตบอล', x: 65, y: 8, z: -20, color: '#16A34A' },
        { text: '💧 สระน้ำ 1, 2, 3', x: -95, y: 7, z: 20, color: '#0284C7' },
        { text: '🚧 ทางเข้าหลัก / ท.0021 ที่ทำการ รปภ.', x: 40, y: 8, z: 140, color: '#475569' },
        { text: '🧪 วงเวียนหน้า ท.0018 / ท.0016', x: 120, y: 8, z: -60, color: '#2563EB' },
        // OHK Specific Landmark Pins (No Soccer field in OHK)
        { text: '🚛 วงเวียนใหญ่ศูนย์ขนส่ง อหข.', x: -130, y: 10, z: -160, color: '#7C3AED' },
        { text: '💧 สระน้ำ & ศาลาริมน้ำ อหข.', x: -185, y: 8, z: -180, color: '#0284C7' },
        { text: '⚡ สายส่ง 230 kV อ่างทอง 2', x: -120, y: 28, z: -190, color: '#EF4444' }
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
        this.scene.add(labelSprite);
        this.labelSprites.set(bData.b_code, labelSprite);

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

      // OHK Specific Architecture
      if (roofType === 'ohk_office_t0026') {
        this.buildOHKOfficeT0026(group, width, depth, height);
      } else if (roofType === 'ohk_garage_t0027') {
        this.buildOHKGarageT0027(group, width, depth, height);
      } else if (roofType === 'ohk_workshop_heavy' || roofType === 'ohk_heavy_workshop') {
        this.buildOHKHeavyWorkshop(group, width, depth, height, bData.b_code);
      } else if (roofType === 'ohk_canteen_d0031') {
        this.buildOHKCanteenD0031(group, width, depth, height);
      } else if (roofType === 'ohk_welding_d0033') {
        this.buildOHKWeldingD0033(group, width, depth, height);
      }
      // Campus Main Architecture
      else if (roofType === 'office_tower_9fl' || (roofType === 'office_stepped' && bData.b_code === 'T.0019')) {
        this.buildOfficeTower9Fl(group, width, depth, height);
      } else if (roofType === 'parking_complex' || (roofType === 'office_stepped' && bData.b_code === 'D.0019')) {
        this.buildParkingComplex(group, width, depth, height);
      } else if (roofType === 'curved_hall' || roofType === 'curved_barrel') {
        this.buildCurvedHall(group, width, depth, height);
      } else if (roofType === 'competency_center' || bData.b_code === 'T.0020') {
        this.buildCompetencyCenter(group, width, depth, height);
      } else if (roofType === 'gabled_large') {
        this.buildLargeWorkshop(group, width, depth, height);
      } else if (roofType === 'gabled_warehouse' || roofType === 'gabled' || roofType === 'industrial_gable') {
        this.buildGabledWarehouse(group, width, depth, height);
      } else if (roofType === 'lab_modern' || (roofType === 'office_stepped' && bData.b_code === 'T.0018')) {
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
    // T.0026: อาคารบริหารการขนส่ง (อาคารที่ทำการ อหข. 2 ชั้น)
    buildOHKOfficeT0026(group, width, depth, height) {
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x60A5FA, metalness: 0.8, roughness: 0.2 });
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.65 });

      // 2nd Floor Ribbon Glass Strips
      const win = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, 1.8, depth + 0.3), glassMat);
      win.position.y = height * 0.65 + 0.2;
      group.add(win);

      // Pitched Hip Roof section over stair tower / central entrance
      const hipRoof = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(width, depth) * 0.45, 3.2, 4),
        roofMat
      );
      hipRoof.rotation.y = Math.PI / 4;
      hipRoof.position.set(-width * 0.2, height + 1.6 + 0.2, 0);
      hipRoof.castShadow = true;
      group.add(hipRoof);

      // Front Entrance Porch facing roundabout
      const porch = new THREE.Mesh(
        new THREE.BoxGeometry(10, 0.4, 4),
        new THREE.MeshStandardMaterial({ color: 0x0284C7 })
      );
      porch.position.set(0, 3.4, depth / 2 + 2);
      porch.castShadow = true;
      group.add(porch);

      // Rear Covered Car Park (16 car bays)
      const carParkMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 });
      const cpRoof = new THREE.Mesh(new THREE.BoxGeometry(width * 0.85, 0.3, 8), carParkMat);
      cpRoof.position.set(0, 3.0, -depth / 2 - 4);
      cpRoof.castShadow = true;
      group.add(cpRoof);

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

    createWarningSprite(bData) {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#DC2626';
      ctx.beginPath();
      ctx.arc(32, 32, 26, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 4;
      ctx.stroke();

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
        // Daylight Sky & Fog
        this.scene.background = new THREE.Color(0xEDF2F7);
        if (this.scene.fog) {
          this.scene.fog.color = new THREE.Color(0xEDF2F7);
          this.scene.fog.density = 0.0018;
        }

        // Daylight Lighting
        if (this.hemiLight) {
          this.hemiLight.color.setHex(0xFFFFFF);
          this.hemiLight.groundColor.setHex(0xCBD5E1);
          this.hemiLight.intensity = 0.72;
        }
        if (this.ambLight) {
          this.ambLight.color.setHex(0xFFFFFF);
          this.ambLight.intensity = 0.35;
        }
        if (this.dirLight) {
          this.dirLight.color.setHex(0xFFFBEB);
          this.dirLight.intensity = 0.95;
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
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.checkHover();
      });

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
        this.controls.update();
        if (this.controls.autoRotate) {
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
