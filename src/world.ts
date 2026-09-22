import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  BALL_ANGULAR_DAMPING,
  BALL_LINEAR_DAMPING,
  BALL_R,
  BUCKET_H,
  BUCKET_R,
  BUCKET_WALL_T,
  FIELD_DEPTH,
  FIELD_HALF_WIDTH,
  ROLL_ANGULAR_DAMPING,
  ROLL_LINEAR_DAMPING,
  ROLL_SPEED_THRESHOLD,
  WALL_HEIGHT
} from './constants';

const RING_SEGMENTS = 20;

/** Owns the Three.js scene, the Rapier physics world, and the link between them. */
export class World {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly physics: RAPIER.World;

  private readonly eventQueue: RAPIER.EventQueue;
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  groundHandle = -1;
  wallHandle = -1;
  private bucketHandles = new Set<number>();
  private bucketBody: RAPIER.RigidBody | null = null;

  private ballBody: RAPIER.RigidBody | null = null;
  ballCollider: RAPIER.Collider | null = null;

  readonly ballMesh: THREE.Mesh;
  readonly bucketGroup = new THREE.Group();
  readonly featherGroup = new THREE.Group();
  readonly aimLine: THREE.Line;
  readonly trailLine: THREE.Line;
  private zoneMesh: THREE.Mesh;

  private trailPoints: THREE.Vector3[] = [];
  private camTarget = new THREE.Vector3();
  private camGoal = new THREE.Vector3();
  private lookGoal = new THREE.Vector3();
  private camSnap = true;
  private ballDead = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
    this.camera.position.set(0, 9, 22);

    this.scene.background = new THREE.Color('#121821');
    this.scene.fog = new THREE.Fog('#121821', 30, 70);

    this.physics = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.physics.timestep = 1 / 120;
    this.eventQueue = new RAPIER.EventQueue(true);

    this.buildLights();
    this.buildGround();
    this.buildWall();
    this.buildBucketMesh();
    this.buildFeatherMesh();

    this.ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R, 24, 16),
      new THREE.MeshStandardMaterial({ color: '#d8f34a', roughness: 0.85 })
    );
    this.ballMesh.castShadow = true;
    this.ballMesh.visible = false;
    this.scene.add(this.ballMesh);

    this.aimLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({ color: '#ffb703', dashSize: 0.18, gapSize: 0.12 })
    );
    this.aimLine.visible = false;
    this.scene.add(this.aimLine);

    this.trailLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: '#d8f34a', transparent: true, opacity: 0.55 })
    );
    this.scene.add(this.trailLine);


    this.zoneMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: '#ffb703',
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide
      })
    );
    this.zoneMesh.rotation.x = -Math.PI / 2;
    this.zoneMesh.position.y = 0.004;
    this.zoneMesh.visible = false;
    this.scene.add(this.zoneMesh);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // -- construction ------------------------------------------------------

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight('#9fb8d6', '#2a2620', 0.85));

    const sun = new THREE.DirectionalLight('#fff3e0', 1.5);
    sun.position.set(-8, 14, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -18;
    c.right = 18;
    c.top = 18;
    c.bottom = -18;
    c.near = 1;
    c.far = 50;
    this.scene.add(sun);
  }

  private buildGround() {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: '#3f4a3c', roughness: 1 })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    const grid = new THREE.GridHelper(FIELD_DEPTH * 2, FIELD_DEPTH * 2, '#6d7a66', '#4a5546');
    grid.position.set(0, 0.002, FIELD_DEPTH / 2);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.25;
    this.scene.add(grid);

    const body = this.physics.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const col = this.physics.createCollider(
      RAPIER.ColliderDesc.cuboid(30, 0.5, 30)
        .setTranslation(0, -0.5, 0)
        .setRestitution(0.72)
        .setFriction(0.7)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body
    );
    this.groundHandle = col.handle;
  }

  private buildWall() {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(FIELD_HALF_WIDTH * 2, WALL_HEIGHT, 0.5),
      new THREE.MeshStandardMaterial({ color: '#8c7b6b', roughness: 0.95 })
    );
    mesh.position.set(0, WALL_HEIGHT / 2, -0.25);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    const body = this.physics.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const col = this.physics.createCollider(
      RAPIER.ColliderDesc.cuboid(FIELD_HALF_WIDTH, WALL_HEIGHT / 2, 0.25)
        .setTranslation(0, WALL_HEIGHT / 2, -0.25)
        .setRestitution(0.72)
        .setFriction(0.5)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body
    );
    this.wallHandle = col.handle;
  }

  private buildBucketMesh() {
    const topR = BUCKET_R;
    const bottomR = BUCKET_R * 0.76;

    // Subtle mottling keeps the steel from reading as smooth grey plastic.
    const texCanvas = document.createElement('canvas');
    texCanvas.width = 96;
    texCanvas.height = 96;
    const texCtx = texCanvas.getContext('2d')!;
    const pixels = texCtx.createImageData(96, 96);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const grain = 172 + Math.random() * 56;
      pixels.data[i] = grain;
      pixels.data[i + 1] = grain + 3;
      pixels.data[i + 2] = grain + 7;
      pixels.data[i + 3] = 255;
    }
    texCtx.putImageData(pixels, 0, 0);
    const galvanized = new THREE.CanvasTexture(texCanvas);
    galvanized.wrapS = galvanized.wrapT = THREE.RepeatWrapping;
    galvanized.repeat.set(3, 2);

    const steel = new THREE.MeshPhysicalMaterial({
      color: '#c4ccd1',
      map: galvanized,
      metalness: 0.82,
      roughness: 0.34,
      clearcoat: 0.12,
      clearcoatRoughness: 0.48,
      side: THREE.DoubleSide
    });
    const darkSteel = new THREE.MeshStandardMaterial({
      color: '#7f8a91',
      metalness: 0.78,
      roughness: 0.4
    });

    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(topR, bottomR, BUCKET_H, 48, 1, true),
      steel
    );
    shell.position.y = BUCKET_H / 2;
    shell.castShadow = true;
    shell.receiveShadow = true;

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(bottomR, bottomR, 0.018, 48),
      darkSteel
    );
    base.position.y = 0.009;

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(topR, 0.018, 10, 56),
      darkSteel
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = BUCKET_H;
    rim.castShadow = true;

    // Rolled base seam and two reinforcing ribs around the body.
    const rings: THREE.Mesh[] = [];
    for (const [height, radius, tube] of [
      [0.025, bottomR + 0.005, 0.009],
      [BUCKET_H * 0.58, bottomR + (topR - bottomR) * 0.58 + 0.004, 0.008],
      [BUCKET_H * 0.68, bottomR + (topR - bottomR) * 0.68 + 0.004, 0.007]
    ] as const) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius, tube, 8, 48),
        darkSteel
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = height;
      ring.castShadow = true;
      rings.push(ring);
    }

    // Dark inner floor gives the open bucket visible depth.
    const innerFloor = new THREE.Mesh(
      new THREE.CircleGeometry(bottomR * 0.93, 48),
      new THREE.MeshStandardMaterial({
        color: '#4d575d',
        metalness: 0.62,
        roughness: 0.52,
        side: THREE.DoubleSide
      })
    );
    innerFloor.rotation.x = -Math.PI / 2;
    innerFloor.position.y = 0.022;

    // Side lugs and a classic wire bail handle.
    const lugGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.026, 12);
    const lugs: THREE.Mesh[] = [];
    for (const side of [-1, 1]) {
      const lug = new THREE.Mesh(lugGeo, darkSteel);
      lug.rotation.z = Math.PI / 2;
      lug.position.set(side * (topR + 0.011), BUCKET_H * 0.84, 0);
      lug.castShadow = true;
      lugs.push(lug);
    }

    const handleCurve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(-topR - 0.015, BUCKET_H * 0.84, 0),
      new THREE.Vector3(-topR * 0.72, BUCKET_H + topR * 1.18, 0),
      new THREE.Vector3(topR * 0.72, BUCKET_H + topR * 1.18, 0),
      new THREE.Vector3(topR + 0.015, BUCKET_H * 0.84, 0)
    );
    const handle = new THREE.Mesh(
      new THREE.TubeGeometry(handleCurve, 48, 0.008, 8, false),
      new THREE.MeshStandardMaterial({
        color: '#aab4ba',
        metalness: 0.94,
        roughness: 0.2
      })
    );
    handle.castShadow = true;

    this.bucketGroup.add(shell, base, rim, innerFloor, handle, ...rings, ...lugs);
    this.bucketGroup.visible = false;
    this.scene.add(this.bucketGroup);
  }

  /**
   * A feather lying flat on the ground: two curved vanes either side of a tapered shaft,
   * with barb lines for detail. It points towards the wall, which doubles as a cue for
   * which way the player is facing. The ring marks the spot to throw from.
   */
  private buildFeatherMesh() {
    const QUILL = 0.2; // bare shaft behind the vanes
    const TIP = 0.36; // vane length ahead of the shaft origin
    const feather = new THREE.Group();

    // Half-outline of a vane in the XY plane. Real flight feathers are asymmetric,
    // so the two sides use different widths.
    const vaneShape = (sign: number, width: number) => {
      const s = new THREE.Shape();
      s.moveTo(0, -QUILL * 0.35);
      s.bezierCurveTo(sign * width * 0.35, -0.05, sign * width, 0.03, sign * width * 0.88, 0.17);
      s.bezierCurveTo(sign * width * 0.74, 0.26, sign * width * 0.4, 0.31, 0, TIP);
      s.closePath();
      return s;
    };

    const vaneMat = new THREE.MeshStandardMaterial({
      color: '#f7f4ec',
      roughness: 0.92,
      side: THREE.DoubleSide
    });

    const WIDTH = { 1: 0.115, '-1': 0.08 } as Record<string, number>;
    for (const sign of [1, -1]) {
      const geo = new THREE.ShapeGeometry(vaneShape(sign, WIDTH[String(sign)]), 32);
      const vane = new THREE.Mesh(geo, vaneMat);
      vane.rotation.x = -Math.PI / 2;
      vane.position.y = 0.012;
      vane.receiveShadow = true;
      feather.add(vane);
    }

    // Tapered shaft, thick at the quill end and fine at the tip. The bare quill
    // protrudes past the vanes so it reads as a feather rather than a leaf.
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0085, 0.0016, QUILL + TIP, 8),
      new THREE.MeshStandardMaterial({ color: '#e4dcca', roughness: 0.65 })
    );
    shaft.rotation.x = Math.PI / 2;
    shaft.position.set(0, 0.017, -(TIP - QUILL) / 2);
    shaft.castShadow = true;
    feather.add(shaft);

    // Barbs, angled forward from the shaft like a real feather.
    const barbs: number[] = [];
    const COUNT = 34;
    for (let i = 1; i < COUNT; i++) {
      const t = i / COUNT;
      const y = -0.06 + t * 0.4;
      const env = Math.sin(Math.PI * Math.pow(t, 0.8));
      for (const sign of [1, -1]) {
        const w = WIDTH[String(sign)] * 0.92 * env;
        barbs.push(0, y, 0, sign * w, y + w * 0.6, 0);
      }
    }
    const barbGeo = new THREE.BufferGeometry();
    barbGeo.setAttribute('position', new THREE.Float32BufferAttribute(barbs, 3));
    const barbLines = new THREE.LineSegments(
      barbGeo,
      new THREE.LineBasicMaterial({ color: '#a99d80', transparent: true, opacity: 0.95 })
    );
    barbLines.rotation.x = -Math.PI / 2;
    barbLines.position.y = 0.016;
    feather.add(barbLines);

    feather.scale.setScalar(1.7);
    feather.rotation.y = 0.2; // dropped, not placed
    this.featherGroup.add(feather);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.48, 48),
      new THREE.MeshBasicMaterial({
        color: '#f4f1ea',
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.009; // above the placement zone highlight, else they z-fight
    this.featherGroup.add(ring);

    this.featherGroup.visible = false;
    this.scene.add(this.featherGroup);
  }

  // -- bucket placement --------------------------------------------------

  /** Moves the bucket (visual + physics) to a spot on the ground. */
  setBucket(x: number, z: number) {
    this.bucketGroup.position.set(x, 0, z);
    this.bucketGroup.visible = true;

    if (this.bucketBody) {
      this.physics.removeRigidBody(this.bucketBody);
      this.bucketHandles.clear();
    }

    const body = this.physics.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(x, 0, z)
    );
    this.bucketBody = body;

    const mat = (d: RAPIER.ColliderDesc) =>
      d.setRestitution(0.12).setFriction(0.9).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

    const base = this.physics.createCollider(
      mat(RAPIER.ColliderDesc.cylinder(0.01, BUCKET_R)).setTranslation(0, 0.01, 0),
      body
    );
    this.bucketHandles.add(base.handle);

    // Approximate the bucket's curved shell with a ring of thin boxes.
    const halfWidth = BUCKET_R * Math.tan(Math.PI / RING_SEGMENTS);
    for (let i = 0; i < RING_SEGMENTS; i++) {
      const theta = (i / RING_SEGMENTS) * Math.PI * 2;
      const radial = BUCKET_R + BUCKET_WALL_T / 2;
      const desc = mat(
        RAPIER.ColliderDesc.cuboid(halfWidth, BUCKET_H / 2, BUCKET_WALL_T / 2)
      )
        .setTranslation(Math.sin(theta) * radial, BUCKET_H / 2, Math.cos(theta) * radial)
        .setRotation({ x: 0, y: Math.sin(theta / 2), z: 0, w: Math.cos(theta / 2) });
      this.bucketHandles.add(this.physics.createCollider(desc, body).handle);
    }
  }

  setFeather(x: number, z: number) {
    this.featherGroup.position.set(x, 0, z);
    this.featherGroup.visible = true;
  }

  isBucketCollider(handle: number) {
    return this.bucketHandles.has(handle);
  }

  // -- ball --------------------------------------------------------------

  spawnBall(origin: THREE.Vector3, velocity: THREE.Vector3) {
    this.despawnBall();

    const body = this.physics.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(origin.x, origin.y, origin.z)
        .setLinvel(velocity.x, velocity.y, velocity.z)
        .setLinearDamping(BALL_LINEAR_DAMPING)
        .setAngularDamping(BALL_ANGULAR_DAMPING)
        .setCcdEnabled(true)
    );

    this.ballCollider = this.physics.createCollider(
      RAPIER.ColliderDesc.ball(BALL_R)
        .setRestitution(0.8)
        .setFriction(0.45)
        .setDensity(1.2)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body
    );

    this.ballBody = body;
    this.ballMesh.position.copy(origin);
    this.ballMesh.visible = true;
    this.ballDead = false;
    const trailMat = this.trailLine.material as THREE.LineBasicMaterial;
    trailMat.color.set('#d8f34a');
    trailMat.opacity = 0.55;
    this.trailPoints = [origin.clone()];
    this.trailLine.geometry.setFromPoints(this.trailPoints);
  }

  despawnBall() {
    if (this.ballBody) {
      this.physics.removeRigidBody(this.ballBody);
      this.ballBody = null;
      this.ballCollider = null;
    }
    this.ballMesh.visible = false;
  }

  clearTrail() {
    this.trailPoints = [];
    this.trailLine.geometry.setFromPoints([]);
  }

  get ballPosition(): THREE.Vector3 | null {
    if (!this.ballBody) return null;
    const t = this.ballBody.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  get ballSpeed(): number {
    if (!this.ballBody) return 0;
    const v = this.ballBody.linvel();
    return Math.hypot(v.x, v.y, v.z);
  }

  /** Steps physics and returns this frame's collision events between the ball and the court. */
  stepPhysics(substeps: number): Array<{ handle: number; started: boolean }> {
    const hits: Array<{ handle: number; started: boolean }> = [];
    const ballHandle = this.ballCollider?.handle ?? -1;

    for (let i = 0; i < substeps; i++) {
      this.applyRollingResistance();
      this.physics.step(this.eventQueue);
      this.eventQueue.drainCollisionEvents((h1, h2, started) => {
        if (h1 !== ballHandle && h2 !== ballHandle) return;
        hits.push({ handle: h1 === ballHandle ? h2 : h1, started });
      });
    }

    const p = this.ballPosition;
    if (p) {
      this.ballMesh.position.copy(p);
      const last = this.trailPoints[this.trailPoints.length - 1];
      if (!last || last.distanceToSquared(p) > 0.0025) {
        this.trailPoints.push(p.clone());
        if (this.trailPoints.length > 400) this.trailPoints.shift();
        this.trailLine.geometry.setFromPoints(this.trailPoints);
      }
    }
    return hits;
  }

  /**
   * A ball in flight should carry, but a ball trundling along the ground should pull up
   * quickly — so heavy damping is switched in only once it is slow and grounded.
   */
  private applyRollingResistance() {
    const body = this.ballBody;
    if (!body) return;

    const p = body.translation();
    const v = body.linvel();
    const grounded = p.y < BALL_R * 1.8;
    const slow = Math.hypot(v.x, v.y, v.z) < ROLL_SPEED_THRESHOLD;

    if (grounded && slow) {
      body.setLinearDamping(ROLL_LINEAR_DAMPING);
      body.setAngularDamping(ROLL_ANGULAR_DAMPING);
    } else {
      body.setLinearDamping(BALL_LINEAR_DAMPING);
      body.setAngularDamping(BALL_ANGULAR_DAMPING);
    }
  }

  // -- camera ------------------------------------------------------------

  framePlacement() {
    this.camGoal.set(0, 7.5, FIELD_DEPTH + 3);
    this.lookGoal.set(0, 0.4, 3.2);
  }

  frameThrow(feather: THREE.Vector3, bucket: THREE.Vector3) {
    this.camGoal.set(feather.x * 0.65, 2.5, feather.z + 3.6);
    this.lookGoal.set((feather.x + bucket.x) / 2, 1.0, (bucket.z + feather.z) / 2 - 1.5);
  }

  /** Keeps the ball and the bucket both in shot while the ball is live. */
  trackFlight(ball: THREE.Vector3, bucket: THREE.Vector3) {
    this.lookGoal.set(
      (ball.x + bucket.x) / 2,
      Math.max(0.5, (ball.y + 0.3) / 2),
      (ball.z + bucket.z) / 2
    );
  }

  snapCamera() {
    this.camSnap = true;
  }

  updateCamera(dt: number) {
    const k = this.camSnap ? 1 : 1 - Math.exp(-4.5 * dt);
    this.camSnap = false;
    this.camera.position.lerp(this.camGoal, k);
    this.camTarget.lerp(this.lookGoal, k);
    this.camera.lookAt(this.camTarget);
  }

  // -- misc --------------------------------------------------------------

  /** Projects normalised device coords onto the ground plane. */
  pointerToGround(ndc: THREE.Vector2): THREE.Vector3 | null {
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.groundPlane, hit) ? hit : null;
  }

  /** Highlights the patch of ground the current placement is allowed to use. */
  showZone(minZ: number, maxZ: number, halfWidth: number) {
    this.zoneMesh.scale.set(halfWidth * 2, maxZ - minZ, 1);
    this.zoneMesh.position.set(0, 0.004, (minZ + maxZ) / 2);
    this.zoneMesh.visible = true;
  }

  hideZone() {
    this.zoneMesh.visible = false;
  }

  /** Greys out the ball and its trail once the shot can no longer score. */
  setBallDead(dead: boolean) {
    if (this.ballDead === dead) return;
    this.ballDead = dead;

    const ballMat = this.ballMesh.material as THREE.MeshStandardMaterial;
    const trailMat = this.trailLine.material as THREE.LineBasicMaterial;
    if (dead) {
      ballMat.color.set('#6b7280');
      trailMat.color.set('#ff6b6b');
      trailMat.opacity = 0.35;
    } else {
      trailMat.color.set('#d8f34a');
      trailMat.opacity = 0.55;
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
