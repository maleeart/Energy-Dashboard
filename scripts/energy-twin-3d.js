/**
 * Sainoi Energy Dashboard & 3D Building Digital Twin - 3D Scene Engine
 * Three.js Procedural Campus, Lighting, OrbitControls, Raycasting, and Responsive Optimization
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
      this.labelSprites = new Map(); // b_code -> sprite
      this.warningSprites = new Map(); // b_code -> sprite
      
      this.selectionRing = null;
      this.hoveredBuilding = null;
      this.selectedBuilding = null;

      this.isAnimatingCamera = false;
      this.cameraAnimation = null;
      this.needsRender = true;
      this.lastRenderTime = 0;

      this.defaultCameraPos = { x: 0, y: 110, z: 140 };
      this.defaultTargetPos = { x: 0, y: 0, z: 15 };

      this.init();
    }

    init() {
      // 1. Scene
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0xF0F4F8); // Daylight soft sky blue-gray
      this.scene.fog = new THREE.FogExp2(0xF0F4F8, 0.0028);

      // 2. Camera
      const aspect = this.container.clientWidth / this.container.clientHeight;
      this.camera = new THREE.PerspectiveCamera(45, aspect, 1, 1000);
      this.camera.position.set(this.defaultCameraPos.x, this.defaultCameraPos.y, this.defaultCameraPos.z);

      // 3. Renderer with WebGL Detection
      try {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      } catch (e) {
        console.warn('WebGL initialization failed, triggering 2D fallback:', e);
        this.showWebGLFallback();
        return;
      }

      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.container.appendChild(this.renderer.domElement);

      // 4. OrbitControls
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.06;
      this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // Do not go below ground
      this.controls.minDistance = 15;
      this.controls.maxDistance = 380;
      this.controls.target.set(this.defaultTargetPos.x, this.defaultTargetPos.y, this.defaultTargetPos.z);
      this.controls.addEventListener('change', () => { this.needsRender = true; });

      // 5. Lighting
      this.setupLights();

      // 6. Environment (Ground, Roads, Greenery)
      this.setupCampusEnvironment();

      // 7. Selection Ring
      this.setupSelectionRing();

      // 8. Event Listeners (Resize, Raycasting, Touch)
      this.setupEventListeners();

      // 9. Start Render Loop
      this.animate();
    }

    setupLights() {
      // Hemisphere Light (Sky & Ground bounce)
      const hemiLight = new THREE.HemisphereLight(0xffffff, 0xc8d6e5, 0.65);
      hemiLight.position.set(0, 150, 0);
      this.scene.add(hemiLight);

      // Ambient Light for soft fill
      const ambLight = new THREE.AmbientLight(0xffffff, 0.35);
      this.scene.add(ambLight);

      // Main Sun Directional Light
      this.dirLight = new THREE.DirectionalLight(0xfff8e7, 0.85);
      this.dirLight.position.set(90, 160, 80);
      this.dirLight.castShadow = true;
      this.dirLight.shadow.mapSize.width = 2048;
      this.dirLight.shadow.mapSize.height = 2048;
      this.dirLight.shadow.camera.near = 10;
      this.dirLight.shadow.camera.far = 400;
      this.dirLight.shadow.camera.left = -140;
      this.dirLight.shadow.camera.right = 140;
      this.dirLight.shadow.camera.top = 140;
      this.dirLight.shadow.camera.bottom = -140;
      this.dirLight.shadow.bias = -0.0005;
      this.scene.add(this.dirLight);
    }

    setupCampusEnvironment() {
      // Main Campus Ground (Lush lawn)
      const groundGeo = new THREE.PlaneGeometry(320, 260);
      const groundMat = new THREE.MeshStandardMaterial({
        color: 0x82C787,
        roughness: 0.9,
        metalness: 0.05
      });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      this.scene.add(ground);

      // Campus Boundary Curb
      const curbGeo = new THREE.BoxGeometry(324, 1.2, 264);
      const curbMat = new THREE.MeshStandardMaterial({ color: 0xD0D7DE, roughness: 0.8 });
      const curb = new THREE.Mesh(curbGeo, curbMat);
      curb.position.y = -0.6;
      curb.receiveShadow = true;
      this.scene.add(curb);

      // Road Network
      const roadMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 });
      const roadLineMat = new THREE.MeshBasicMaterial({ color: 0xF1F5F9 });

      // Main Horizontal Roads
      const hRoads = [-25, 18, 68];
      hRoads.forEach(z => {
        const road = new THREE.Mesh(new THREE.PlaneGeometry(300, 10), roadMat);
        road.rotation.x = -Math.PI / 2;
        road.position.set(0, 0.06, z);
        road.receiveShadow = true;
        this.scene.add(road);

        // Center dashed markings
        for (let x = -135; x <= 135; x += 15) {
          const dash = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.5), roadLineMat);
          dash.rotation.x = -Math.PI / 2;
          dash.position.set(x, 0.08, z);
          this.scene.add(dash);
        }
      });

      // Main Vertical Roads
      const vRoads = [-36, 26];
      vRoads.forEach(x => {
        const road = new THREE.Mesh(new THREE.PlaneGeometry(10, 230), roadMat);
        road.rotation.x = -Math.PI / 2;
        road.position.set(x, 0.05, 15);
        road.receiveShadow = true;
        this.scene.add(road);
      });

      // Decorative Walkways / Plaza in front of T.0019
      const plazaGeo = new THREE.PlaneGeometry(60, 24);
      const plazaMat = new THREE.MeshStandardMaterial({ color: 0xE2E8F0, roughness: 0.6 });
      const plaza = new THREE.Mesh(plazaGeo, plazaMat);
      plaza.rotation.x = -Math.PI / 2;
      plaza.position.set(0, 0.07, 13);
      plaza.receiveShadow = true;
      this.scene.add(plaza);

      // Flagpole and Water Fountain / Landscape in front of main building
      this.addCampusLandmarks();
    }

    addCampusLandmarks() {
      // Circular ornamental fountain / monument in front of T.0019
      const fountainGeo = new THREE.CylinderGeometry(5, 5.5, 0.8, 24);
      const fountainMat = new THREE.MeshStandardMaterial({ color: 0xCBD5E1, roughness: 0.5 });
      const fountain = new THREE.Mesh(fountainGeo, fountainMat);
      fountain.position.set(0, 0.4, 18);
      fountain.castShadow = true;
      fountain.receiveShadow = true;
      this.scene.add(fountain);

      // Water surface inside
      const waterGeo = new THREE.CylinderGeometry(4.6, 4.6, 0.7, 24);
      const waterMat = new THREE.MeshStandardMaterial({ color: 0x0284C7, roughness: 0.1, metalness: 0.3 });
      const water = new THREE.Mesh(waterGeo, waterMat);
      water.position.set(0, 0.55, 18);
      this.scene.add(water);

      // 3 Flagpoles (Thailand, EGAT, Royal)
      [-2, 0, 2].forEach(ox => {
        const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 8, 8);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0xE2E8F0, metalness: 0.8, roughness: 0.2 });
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(ox, 4, 18);
        pole.castShadow = true;
        this.scene.add(pole);
      });

      // Perimeter Trees (Low-poly foliage)
      const treePositions = [
        [-110, -80], [-80, -80], [-50, -80], [50, -80], [80, -80], [110, -80],
        [-110, 100], [-80, 100], [-50, 100], [50, 100], [80, 100], [110, 100],
        [-130, -30], [-130, 0], [-130, 40], [130, -30], [130, 0], [130, 40]
      ];

      const trunkGeo = new THREE.CylinderGeometry(0.3, 0.5, 2.5, 6);
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350F, roughness: 0.9 });
      const foliageGeo = new THREE.ConeGeometry(2.5, 5, 7);
      const foliageMat = new THREE.MeshStandardMaterial({ color: 0x15803D, roughness: 0.8 });

      treePositions.forEach(([tx, tz]) => {
        const treeGroup = new THREE.Group();
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 1.25;
        trunk.castShadow = true;
        treeGroup.add(trunk);

        const foliage = new THREE.Mesh(foliageGeo, foliageMat);
        foliage.position.y = 4.2;
        foliage.castShadow = true;
        treeGroup.add(foliage);

        treeGroup.position.set(tx, 0, tz);
        this.scene.add(treeGroup);
      });
    }

    setupSelectionRing() {
      // Glowing selection box frame around active building
      const ringGeo = new THREE.RingGeometry(1, 1.25, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xF59E0B, // Vibrant Amber/Gold
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9
      });
      this.selectionRing = new THREE.Mesh(ringGeo, ringMat);
      this.selectionRing.rotation.x = -Math.PI / 2;
      this.selectionRing.position.y = 0.12;
      this.selectionRing.visible = false;
      this.scene.add(this.selectionRing);
    }

    // Populate all buildings from mapping data
    populateBuildings(buildingsList) {
      // Clear old meshes if any
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

        // Create Thai Label Sprite
        const labelSprite = this.createLabelSprite(bData);
        this.scene.add(labelSprite);
        this.labelSprites.set(bData.b_code, labelSprite);

        // Warning Indicator Sprite if quality has issues
        if (bData.quality_status !== 'normal') {
          const warnSprite = this.createWarningSprite(bData);
          this.scene.add(warnSprite);
          this.warningSprites.set(bData.b_code, warnSprite);
        }
      });

      this.needsRender = true;
    }

    // Procedural 3D building generation based on architectural category
    createBuildingMesh(bData) {
      const group = new THREE.Group();
      group.name = bData.b_code;
      group.userData = { b_code: bData.b_code, data: bData };

      const { width, depth, height } = bData.dimensions;
      const { x, z } = bData.layout_position;
      const colorInfo = window.EnergyTwin.getColorForBuilding(bData);

      // Base Material
      const mainMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(colorInfo.hex),
        roughness: 0.45,
        metalness: 0.15
      });
      group.userData.mainMaterial = mainMat;

      // Building Wall Geometry
      const wallGeo = new THREE.BoxGeometry(width, height, depth);
      const wallMesh = new THREE.Mesh(wallGeo, mainMat);
      wallMesh.position.y = height / 2;
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      group.add(wallMesh);
      group.userData.wallMesh = wallMesh;

      // Architectural Enhancements by category
      if (bData.roof_type === 'flat_office') {
        // T.0019 Multi-floor office styling with ribbon glass windows
        const windowMat = new THREE.MeshStandardMaterial({ color: 0x93C5FD, roughness: 0.1, metalness: 0.7 });
        const floorCount = bData.floors || 9;
        const floorH = height / floorCount;

        for (let i = 1; i < floorCount; i++) {
          const winStrip = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, floorH * 0.45, depth + 0.3), windowMat);
          winStrip.position.y = i * floorH;
          group.add(winStrip);
        }

        // Rooftop Elevator / Mechanical Penthouse
        const roofH = 3.5;
        const roofMech = new THREE.Mesh(
          new THREE.BoxGeometry(width * 0.4, roofH, depth * 0.4),
          new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 })
        );
        roofMech.position.y = height + roofH / 2;
        roofMech.castShadow = true;
        group.add(roofMech);

      } else if (bData.roof_type === 'gabled') {
        // Workshop / Warehouse with pitched triangular gabled roof
        const roofH = 3.2;
        const roofGeo = new THREE.ConeGeometry(Math.max(width, depth) * 0.75, roofH, 4);
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 });
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.y = height + roofH / 2;
        roof.rotation.y = Math.PI / 4;
        roof.scale.set(width / Math.max(width, depth), 1, depth / Math.max(width, depth));
        roof.castShadow = true;
        group.add(roof);

        // Workshop Bay Doors
        const doorMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.8 });
        const door = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.35, height * 0.65), doorMat);
        door.position.set(0, height * 0.325, depth / 2 + 0.05);
        group.add(door);

      } else if (bData.roof_type === 'parking') {
        // Parking garage with open deck tiers
        const deckMat = new THREE.MeshStandardMaterial({ color: 0x94A3B8, roughness: 0.8 });
        for (let f = 1; f < bData.floors; f++) {
          const slab = new THREE.Mesh(new THREE.BoxGeometry(width + 0.8, 0.6, depth + 0.8), deckMat);
          slab.position.y = f * (height / bData.floors);
          group.add(slab);
        }

      } else if (bData.roof_type === 'residential') {
        // Flat residential building with balcony recesses
        const balconyMat = new THREE.MeshStandardMaterial({ color: 0xE2E8F0, roughness: 0.5 });
        const balcony = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4, 0.8, depth + 0.4), balconyMat);
        balcony.position.y = height * 0.5;
        group.add(balcony);

      } else if (bData.roof_type === 'utility') {
        // Utility water tank / pump station styling
        const tankGeo = new THREE.CylinderGeometry(width * 0.28, width * 0.28, 4, 16);
        const tankMat = new THREE.MeshStandardMaterial({ color: 0x0284C7, roughness: 0.3, metalness: 0.5 });
        const tank = new THREE.Mesh(tankGeo, tankMat);
        tank.position.set(width * 0.2, height + 2, 0);
        tank.castShadow = true;
        group.add(tank);
      }

      // Concrete Foundation plinth
      const plinthGeo = new THREE.BoxGeometry(width + 1.2, 0.4, depth + 1.2);
      const plinthMat = new THREE.MeshStandardMaterial({ color: 0x94A3B8, roughness: 0.9 });
      const plinth = new THREE.Mesh(plinthGeo, plinthMat);
      plinth.position.y = 0.2;
      plinth.receiveShadow = true;
      group.add(plinth);

      // Place building in Campus coordinates
      group.position.set(x, 0, z);

      return group;
    }

    // High-resolution Billboard Canvas Sprite for Thai Labels
    createLabelSprite(bData) {
      const canvas = document.createElement('canvas');
      canvas.width = 384;
      canvas.height = 96;
      const ctx = canvas.getContext('2d');

      // Rounded banner background
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.beginPath();
      ctx.roundRect(8, 8, 368, 80, 16);
      ctx.fill();

      // Border highlight
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#F59E0B';
      ctx.stroke();

      // Text Code
      ctx.font = 'bold 24px Sarabun, sans-serif';
      ctx.fillStyle = '#F59E0B';
      ctx.textAlign = 'center';
      ctx.fillText(bData.b_code, 192, 40);

      // Text Thai Short Name
      ctx.font = '500 20px Sarabun, sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(bData.short_name || bData.name, 192, 70);

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;

      const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
      const sprite = new THREE.Sprite(spriteMat);

      const { height } = bData.dimensions;
      const { x, z } = bData.layout_position;
      sprite.position.set(x, height + 7.5, z);
      sprite.scale.set(16, 4, 1);
      sprite.userData = { b_code: bData.b_code };

      return sprite;
    }

    // Warning Beacon for data irregularities / missing readings
    createWarningSprite(bData) {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');

      // Amber circle
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
      sprite.position.set(x + bData.dimensions.width * 0.4, height + 9, z);
      sprite.scale.set(3.5, 3.5, 1);
      sprite.userData = { b_code: bData.b_code };

      return sprite;
    }

    // Update Building Colors when Mode, Month, or Filters change
    updateBuildingColors(buildingsList) {
      buildingsList.forEach(bData => {
        const group = this.buildingMeshes.get(bData.b_code);
        if (group && group.userData.mainMaterial) {
          const colorInfo = window.EnergyTwin.getColorForBuilding(bData);
          group.userData.mainMaterial.color.set(colorInfo.hex);
        }

        // Toggle or update warning beacon
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

    // Toggle Label visibility
    setLabelsVisible(visible) {
      this.labelSprites.forEach(sprite => {
        sprite.visible = visible;
      });
      this.needsRender = true;
    }

    // Set Quality Mode (High / Medium / Low)
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

    // Highlight and focus camera to building
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

      // Position selection ring around base
      if (this.selectionRing) {
        const radius = Math.max(bData.dimensions.width, bData.dimensions.depth) * 0.85;
        this.selectionRing.geometry.dispose();
        this.selectionRing.geometry = new THREE.RingGeometry(radius, radius + 1.2, 32);
        this.selectionRing.position.set(bData.layout_position.x, 0.12, bData.layout_position.z);
        this.selectionRing.visible = true;
      }

      // Smooth Camera Fly-to
      if (flyCamera) {
        const targetPos = {
          x: bData.layout_position.x,
          y: bData.dimensions.height * 0.5,
          z: bData.layout_position.z
        };
        const distance = Math.max(bData.dimensions.width, bData.dimensions.depth) * 2.2 + 25;
        const camPos = {
          x: targetPos.x + distance * 0.7,
          y: targetPos.y + distance * 0.8,
          z: targetPos.z + distance * 0.9
        };

        this.animateCamera(camPos, targetPos, 900);
      }

      this.needsRender = true;
    }

    // Reset Camera to initial campus overview
    resetView() {
      this.selectBuilding(null, false);
      this.animateCamera(this.defaultCameraPos, this.defaultTargetPos, 800);
    }

    // Top-Down 2D Map View
    setTopDownView() {
      const topCam = { x: 0, y: 190, z: 15.01 };
      const topTarget = { x: 0, y: 0, z: 15 };
      this.animateCamera(topCam, topTarget, 800);
    }

    // Smooth Camera Transition via interpolation
    animateCamera(destPos, destTarget, duration = 800) {
      const startCam = { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z };
      const startTarget = { x: this.controls.target.x, y: this.controls.target.y, z: this.controls.target.z };
      const startTime = performance.now();

      this.isAnimatingCamera = true;

      const step = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Ease-in-out cubic formula
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
      // Window resize
      window.addEventListener('resize', () => {
        if (!this.container || !this.renderer || !this.camera) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this.needsRender = true;
      });

      // Pointer Move for Hover Effect
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
          // Find root building group
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
        // Reset old hover
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

    // Animation Loop with Idle Demand-Render optimization
    animate(time) {
      requestAnimationFrame((t) => this.animate(t));

      // Selection ring pulse animation
      if (this.selectionRing && this.selectionRing.visible) {
        const pulse = 1 + Math.sin(time * 0.005) * 0.04;
        this.selectionRing.scale.set(pulse, pulse, 1);
        this.needsRender = true;
      }

      // Warning icons gentle floating
      if (this.warningSprites.size > 0) {
        const floatDelta = Math.sin(time * 0.004) * 0.3;
        this.warningSprites.forEach(sprite => {
          if (sprite.visible) {
            const bData = window.EnergyTwin.mappingData.buildings[sprite.userData.b_code];
            if (bData) {
              sprite.position.y = bData.dimensions.height + 9 + floatDelta;
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

    // Graceful 2D Fallback for older browsers or machines with WebGL disabled
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

  // Expose CampusScene
  window.CampusScene = CampusScene;

})(window);
