/*TODO:
Add skybox, remember depth stuff!
Make UI work
*/
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
const WIDTH = window.innerWidth;
const HEIGHT = window.innerHeight;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(WIDTH, HEIGHT);
renderer.setClearColor(0x111111, 1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(80, WIDTH / HEIGHT, 100, 1000000);
camera.position.set(0, 0, -30000);
scene.add(camera);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.05);
scene.add(ambientLight);

// directional "sun" further away and with reasonable intensity
const sun = new THREE.DirectionalLight(0xffffff, 3.0);
const sunDirection = new THREE.Vector3(-10, 0, 0);
sun.position.copy(sunDirection);
sun.target.position.set(0, 0, 0);
scene.add(sun);
scene.add(sun.target);

const controls = new OrbitControls(camera, renderer.domElement);

const planetSystem = new THREE.Group();
scene.add(planetSystem);

// Textures
const textureLoader = new THREE.TextureLoader();
let textures = {};
textures.earthDay = textureLoader.load("assets/8k_earth_daymap.jpg");
textures.earthSpecular = textureLoader.load("assets/8k_earth_specular_map.jpg");
textures.earthNormal = textureLoader.load("assets/8k_earth_normal_map.jpg");
textures.earthClouds = textureLoader.load("assets/8k_earth_clouds.jpg");
textures.earthNight = textureLoader.load("assets/8k_earth_nightmap.jpg");
// textures.skybox = textureLoader.load("assets/skybox.jpg");
textures.earthDay.colorSpace = THREE.SRGBColorSpace;
textures.earthNormal.colorSpace = THREE.NoColorSpace;
textures.earthSpecular.wrapS = THREE.RepeatWrapping;
textures.earthSpecular.wrapT = THREE.ClampToEdgeWrapping;
textures.earthSpecular.colorSpace = THREE.NoColorSpace;
textures.earthClouds.colorSpace = THREE.SRGBColorSpace;
textures.earthNight.colorSpace = THREE.SRGBColorSpace;
// textures.skybox.colorSpace = THREE.SRGBColorSpace;
// textures.skybox.wrapS = THREE.RepeatWrapping;
// textures.skybox.repeat.x = -1;

const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
const orbitLineGroup = new THREE.Group();
scene.add(orbitLineGroup);

// // Skybox
// const skyboxMaterial = new THREE.MeshBasicMaterial({
//   map: textures.skybox,
//   side: THREE.BackSide,
//   depthTest: false,
//   depthWrite: false,
// });
// const skyboxGeometry = new THREE.SphereGeometry(1e4, 64, 64);
// const skyboxMesh = new THREE.Mesh(skyboxGeometry, skyboxMaterial);
// skyboxMesh.renderOrder = -1;
// scene.add(skyboxMesh);

// Planet mesh
let earthRadius = 6_371;
let atmosphereHeight = 120;
const planetGeometry = new THREE.SphereGeometry(earthRadius, 64, 64);
// ensure smooth shading by computing vertex normals
planetGeometry.computeVertexNormals();
planetGeometry.computeTangents();
// Fix normalMap and stuff
const planetMaterial = new THREE.MeshPhongMaterial({
  map: textures.earthDay,
  specularMap: textures.earthSpecular,
  normalMap: textures.earthNormal,
  emissiveMap: textures.earthNight,
  emissive: 0x202020,
  shininess: 100,
});
const planetMesh = new THREE.Mesh(planetGeometry, planetMaterial);
planetSystem.add(planetMesh);

// Clouds
const cloudShadowGeometry = new THREE.SphereGeometry(
  earthRadius * 1.001,
  64,
  64,
);
const cloudShadowMaterial = new THREE.MeshPhongMaterial({
  map: textures.earthClouds,
  alphaMap: textures.earthClouds,
  transparent: true,
  emissive: 0x000000,
  specular: 0x000000,
});
cloudShadowMaterial.color.set("#000000");
const cloudShadowMesh = new THREE.Mesh(
  cloudShadowGeometry,
  cloudShadowMaterial,
);
planetSystem.add(cloudShadowMesh);

const cloudGeometry = new THREE.SphereGeometry(earthRadius * 1.004, 64, 64);
const cloudMaterial = new THREE.MeshPhongMaterial({
  map: textures.earthClouds,
  alphaMap: textures.earthClouds,
  transparent: true,
  opacity: 1,
});
const cloudMesh = new THREE.Mesh(cloudGeometry, cloudMaterial);
planetSystem.add(cloudMesh);

// AI-generated atmosphere shaders
// --- UNIFIED VERTEX SHADER ---
const atmosphereVertexShader = `
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
    // Normal and Position are kept purely in absolute World Space
    vNormal = normalize(mat3(modelMatrix) * normal);
    vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const spaceFragmentShader = `
varying vec3 vNormal;
varying vec3 vPosition;

uniform vec3 uSunDirection;
uniform vec3 uCameraPosition;

const float R_PLANET = 6371.0;
const float R_ATMOSPHERE = 6491.0;
const float DENSITY_FALLOFF = 4.0;
const float ATMOSPHERE_OPACITY = 30.0;

// Lower this toward 0.12 for an even subtler sunset.
const float SUNSET_STRENGTH = 0.6;

// Increase for a wider, softer terminator band.
const float SUNSET_WIDTH = 0.06;

void main() {
    vec3 rayStart = uCameraPosition;
    vec3 rayDir = normalize(vPosition - uCameraPosition);

    /*
     * uSunDirection points from the planet toward the Sun.
     *
     * Because this is a single uniform direction and does not depend on
     * vPosition, all sunlight rays are treated as exactly parallel.
     *
     * The direction in which photons travel is -sunDir.
     */
    vec3 sunDir = normalize(uSunDirection);

    vec3 eyeDir = -rayDir;
    vec3 surfaceNormal = normalize(vNormal);

    // ---------------------------------------------------------------------
    // Atmosphere intersection
    // ---------------------------------------------------------------------

    float bAtmosphere = dot(rayStart, rayDir);
    float cAtmosphere =
        dot(rayStart, rayStart) -
        R_ATMOSPHERE * R_ATMOSPHERE;

    float hAtmosphere =
        bAtmosphere * bAtmosphere -
        cAtmosphere;

    if (hAtmosphere < 0.0) {
        discard;
    }

    float atmosphereRoot = sqrt(max(hAtmosphere, 0.0));

    float tNear = max(
        -bAtmosphere - atmosphereRoot,
        0.0
    );

    float tFar =
        -bAtmosphere + atmosphereRoot;

    // ---------------------------------------------------------------------
    // Planet intersection
    // ---------------------------------------------------------------------

    float bPlanet = dot(rayStart, rayDir);
    float cPlanet =
        dot(rayStart, rayStart) -
        R_PLANET * R_PLANET;

    float hPlanet =
        bPlanet * bPlanet -
        cPlanet;

    bool rayHitsPlanet = false;
    float tSegmentEnd = tFar;

    if (hPlanet > 0.00001) {
        float tPlanetNear =
            -bPlanet - sqrt(hPlanet);

        if (tPlanetNear > tNear) {
            rayHitsPlanet = true;
            tSegmentEnd = min(tSegmentEnd, tPlanetNear);
        }
    }

    // ---------------------------------------------------------------------
    // Closest approach and atmospheric density
    // ---------------------------------------------------------------------

    float tClosest =
        max(dot(-rayStart, rayDir), 0.0);

    vec3 closestPoint =
        rayStart + rayDir * tClosest;

    float closestRadius =
        length(closestPoint);

    float altitude =
        (closestRadius - R_PLANET) /
        (R_ATMOSPHERE - R_PLANET);

    altitude = clamp(altitude, 0.0, 1.0);

    const int SAMPLE_COUNT = 6;

float opticalDepth = 0.0;
float segmentLength = max(tSegmentEnd - tNear, 0.0);

// World-space step used to locate samples.
float stepLength =
    segmentLength / float(SAMPLE_COUNT);

if (segmentLength > 0.0) {
    vec3 startPos =
        rayStart + rayDir * tNear;

    float startAlt = clamp(
        (length(startPos) - R_PLANET) /
        (R_ATMOSPHERE - R_PLANET),
        0.0,
        1.0
    );

    float startDensity =
        exp(-startAlt * DENSITY_FALLOFF);

    vec3 endPos =
        rayStart + rayDir * tSegmentEnd;

    float endAlt = clamp(
        (length(endPos) - R_PLANET) /
        (R_ATMOSPHERE - R_PLANET),
        0.0,
        1.0
    );

    float endDensity =
        exp(-endAlt * DENSITY_FALLOFF);

    opticalDepth =
        0.5 * (startDensity + endDensity);

    for (int i = 1; i < SAMPLE_COUNT; i++) {
        float t =
            tNear + float(i) * stepLength;

        vec3 samplePosition =
            rayStart + rayDir * t;

        float sampleAltitude = clamp(
            (length(samplePosition) - R_PLANET) /
            (R_ATMOSPHERE - R_PLANET),
            0.0,
            1.0
        );

        float sampleDensity =
            exp(-sampleAltitude * DENSITY_FALLOFF);

        opticalDepth += sampleDensity;
    }

    /*
     * Convert world-space distance into planet-radius units.
     *
     * This makes opticalDepth dimensionless and invariant when the entire
     * planet, atmosphere, and camera setup are scaled uniformly.
     */
    opticalDepth *= stepLength / R_PLANET;
}

float scatteringAlpha =
    1.0 - exp(-opticalDepth * ATMOSPHERE_OPACITY);
    // Make the atmosphere fade more strongly near the limb (edge).
    // Increase the cutoff altitude and widen the smoothstep so the fade
    // begins earlier and is more gradual. Also apply a power curve to
    // accentuate the fade near the edge.
    float cutoffAltitude = 0.90;

    float outerCutoff = 1.0 - smoothstep(
        cutoffAltitude - 0.06, // wider transition
        cutoffAltitude,
        altitude
    );

    // accentuate fading near the edge
    outerCutoff = pow(outerCutoff, 1.5);

    scatteringAlpha *= outerCutoff;

    // ---------------------------------------------------------------------
    // Stable representative atmospheric point
    // ---------------------------------------------------------------------

    /*
     * Do not normalize closestPoint directly.
     *
     * closestPoint can approach zero at the center of the planet's projected
     * disk. Instead, sample the middle of the visible atmosphere segment for
     * rays that hit the planet.
     */
    float tColumnSample;

    if (rayHitsPlanet) {
        tColumnSample =
            0.5 * (tNear + tSegmentEnd);
    } else {
        tColumnSample =
            clamp(tClosest, tNear, tSegmentEnd);
    }

    vec3 columnPoint =
        rayStart + rayDir * tColumnSample;

    vec3 columnNormal =
        normalize(columnPoint);

    // ---------------------------------------------------------------------
    // Ordinary daylight
    // ---------------------------------------------------------------------

    /*
     * Use the stable outer-sphere normal for the broad sunlit region.
     * This removes the singularity at the center of the projected disk.
     */
    float surfaceSunCosine =
        dot(surfaceNormal, sunDir);

    float dayLight =
        smoothstep(
            -0.10,
            0.22,
            surfaceSunCosine
        );

    // ---------------------------------------------------------------------
    // Sunset terminator
    // ---------------------------------------------------------------------

    /*
     * This peaks when the Sun is approximately tangent to the representative
     * atmospheric column.
     */
    float columnSunCosine =
        dot(columnNormal, sunDir);

    // Peak where the sun is tangent to the column (columnSunCosine ~= 0).
    // Use a smoothstep-based band centered on zero so the glow sits at the
    // terminator line rather than producing wide Gaussian leakage.
float sunsetTerminator =
    1.0 - smoothstep(
        0.0,
        SUNSET_WIDTH,
        abs(columnSunCosine)
    );
    /*
     * Restrict warm coloration to rays that pass near the solid planet limb.
     */
    float normalizedLimbDistance =
        abs(closestRadius - R_PLANET) /
        (R_ATMOSPHERE - R_PLANET);

    // Narrow the rim falloff so the warm coloration hugs the limb more
    // tightly around the terminator.
    float planetRim =
        exp(-pow(normalizedLimbDistance / 0.30, 2.0));

    /*
     * A mild symmetric phase approximation.
     *
     * Squaring viewSunCosine means the result does not vanish when the camera
     * is behind the planet relative to the Sun.
     */
    float viewSunCosine =
        dot(eyeDir, sunDir);

    float scatteringPhase =
        0.85 +
        0.15 * viewSunCosine * viewSunCosine;

    float sunsetGlow =
        clamp(
            sunsetTerminator *
            planetRim *
            scatteringPhase *
            SUNSET_STRENGTH,
            0.0,
            1.0
        );

    // ---------------------------------------------------------------------
    // Final color and opacity
    // ---------------------------------------------------------------------

    vec3 upperAtmosphereColor =
        vec3(0.30, 0.60, 1.00);

    vec3 lowerAtmosphereColor =
        vec3(0.08, 0.32, 0.82);

    vec3 dayColor =
        mix(
            upperAtmosphereColor,
            lowerAtmosphereColor,
            (1.0 - altitude) * 0.55
        );

    // Less saturated than the previous orange-red.
    vec3 sunsetColor =
        vec3(1.00, 0.62, 0.38);

    float sunsetColorMix = sunsetGlow;

    vec3 finalColor =
        mix(
            dayColor,
            sunsetColor,
            sunsetColorMix
        );

    /*
     * Sunset contributes less opacity than daylight. This keeps the ring from
     * appearing like a bright opaque orange band.
     */
    float totalLighting =
        clamp(
            dayLight +
            sunsetGlow * 0.50,
            0.0,
            1.0
        );

    float finalAlpha =
        scatteringAlpha *
        totalLighting;

    gl_FragColor =
        vec4(
            finalColor,
            clamp(finalAlpha, 0.0, 1.0)
        );
}
`;

// Atmosphere
const atmosphereUniforms = {
  // direction from planet toward sun (normalized)
  uSunDirection: { value: sunDirection.clone().normalize() },
  uCameraPosition: { value: camera.position },
};

const atmosphereGeometry = new THREE.SphereGeometry(
  earthRadius + atmosphereHeight,
  64,
  64,
);
const atmosphereMaterial = new THREE.ShaderMaterial({
  vertexShader: atmosphereVertexShader,
  fragmentShader: spaceFragmentShader,
  uniforms: atmosphereUniforms,
  blending: THREE.NormalBlending,
  side: THREE.FrontSide,
  transparent: true,
  depthWrite: false,
  depthTest: true,
});
const atmosphereMesh = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
planetSystem.add(atmosphereMesh);

const satelliteMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff });
const satelliteGeometry = new THREE.SphereGeometry(100, 32, 32);

// Physics stuff starts here
const TAU = 2 * Math.PI;
let orbiters = [];

class Orbit {
  constructor(data) {
    // semi-major axis
    this.a = data.a ?? earthRadius;
    // eccentricity
    this.e = data.e ?? 0;
    // inclination
    this.i = data.i ?? 0;
    // longitude of ascending node
    this.lan = data.lan ?? 0;
    // argument of periapsis
    this.ape = data.ape ?? 0;
    // Epoch
    this.epoch = data.epoch ?? 0;
    // mean anomaly at epoch
    this.m0 = data.m0 ?? 0;
    // gravitational parameter
    this.mu = data.mu ?? earthMu;

    // Precompute orbit constants for repeated use.
    this.meanMotion = Math.sqrt(this.mu / this.a ** 3);
    this.periodValue = TAU * Math.sqrt(this.a ** 3 / this.mu);
    this.sqrtOneMinusE2 = Math.sqrt(Math.max(0, 1 - this.e * this.e));

    const cosO = Math.cos(this.lan);
    const sinO = Math.sin(this.lan);
    const cosI = Math.cos(this.i);
    const sinI = Math.sin(this.i);
    const cosW = Math.cos(this.ape);
    const sinW = Math.sin(this.ape);

    this.rot00 = cosO * cosW - sinO * sinW * cosI;
    this.rot01 = -cosO * sinW - sinO * cosW * cosI;
    this.rot10 = sinO * cosW + cosO * sinW * cosI;
    this.rot11 = -sinO * sinW + cosO * cosW * cosI;
    this.rot20 = sinW * sinI;
    this.rot21 = cosW * sinI;
  }
  period() {
    return this.periodValue;
  }
  positionAtTime(time) {
    let M = this.m0 + this.meanMotion * (time - this.epoch);
    M = ((M % TAU) + TAU) % TAU;
    let E = this.e < 0.8 ? M : Math.PI;
    for (let iteration = 0; iteration < 6; iteration++) {
      const f = E - this.e * Math.sin(E) - M;
      const fPrime = 1 - this.e * Math.cos(E);
      const delta = f / fPrime;
      E -= delta;
      if (Math.abs(delta) < 1e-12) {
        break;
      }
    }

    const cosE = Math.cos(E);
    const sinE = Math.sin(E);
    const xp = this.a * (cosE - this.e);
    const yp = this.a * this.sqrtOneMinusE2 * sinE;

    const x = this.rot00 * xp + this.rot01 * yp;
    const y = this.rot10 * xp + this.rot11 * yp;
    const z = this.rot20 * xp + this.rot21 * yp;

    return new THREE.Vector3(x, y, z);
  }
}

class Orbiter {
  constructor(data, orbits) {
    this.data = data;
    this.orbits = orbits;
    this.points = [];
    this.iconMesh = new THREE.Mesh(satelliteGeometry, satelliteMaterial);
    scene.add(this.iconMesh);
    this.orbitMesh = false;
    this.orbitMeshNeedsUpdating = true;
    this.orbitGeometry = false;
    orbiters.push(this);
  }
  drawOrbit() {
    // build points for the orbit
    const points = [];
    const period = this.orbits[0].period();
    const segs = 300;
    for (let i = 0; i < period + period / segs; i += period / segs) {
      points.push(this.orbits[0].positionAtTime(t + i));
    }
    // AI cleaned the following up and helped mitigate memory leaks
    // If we already have a mesh, update its geometry in-place to avoid creating
    // and abandoning many BufferGeometry instances which would leak GPU memory.
    if (this.orbitMesh) {
      // ensure geometry exists
      if (this.orbitMesh.geometry && this.orbitMesh.geometry.setFromPoints) {
        this.orbitMesh.geometry.setFromPoints(points);
      } else {
        // fallback: create geometry and assign
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        // dispose old geometry if present
        if (this.orbitMesh.geometry) {
          orbitLineGroup.remove(this.orbitMesh);
          this.orbitMesh.geometry.dispose();
        }
        this.orbitMesh.geometry = geo;
      }
    } else {
      // create mesh once and reuse
      const orbitGeometry = new THREE.BufferGeometry().setFromPoints(points);
      this.orbitMesh = new THREE.Line(orbitGeometry, lineMaterial);
      orbitLineGroup.add(this.orbitMesh);
    }
  }
  update() {
    this.drawOrbit();
    this.iconMesh.position.copy(this.orbits[0].positionAtTime(t));
  }
}
let t = 0;
let start = performance.now();
let deltaT = 0;
let earthMu = 398600.4418; //km^3/s^3
// let ISS = new Orbiter(null, [new Orbit({ a: 400 + earthRadius, i: 0.9006 + Math.PI })]);
for (let i = 0; i < 100; i++) {
  new Orbiter({}, [
    new Orbit({
      a: earthRadius + 300 + 20000 * Math.random() ** 2,
      i: -Math.PI / 2 + 2 * (Math.random() - 0.5),
      lan: 2 * Math.random() * Math.PI,
      m0: 2 * Math.PI * Math.random(),
    }),
  ]);
}

function gameLoop() {
  for (let orbiter of orbiters) {
    orbiter.update();
  }
  planetSystem.rotation.y = t / (60 * 60 * 24); // Divide by day length
  controls.update();
}

function render() {
  requestAnimationFrame(render);
  deltaT = performance.now() - start;
  start = performance.now();
  t += (deltaT / 1000) * 1000;
  // Update camera and sun direction uniforms each frame
  camera.getWorldPosition(atmosphereUniforms.uCameraPosition.value);
  atmosphereUniforms.uSunDirection.value.copy(sun.position).normalize();
  gameLoop();
  //   // Center sybox on camera
  //   skyboxMesh.position.copy(camera.position);

  renderer.render(scene, camera);
}

render();

window.addEventListener("resize", () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  renderer.setPixelRatio(window.devicePixelRatio);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
});

document.addEventListener("pointerdown", (event) => {
  const clickedElement = event.target;
//   TODO
});
