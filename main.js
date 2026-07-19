import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { ImprovedNoise } from 'https://unpkg.com/three/examples/jsm/math/ImprovedNoise.js';

let dim = { x: 100, y: 100, z: 100 };
let spawn = new THREE.Vector3(Math.random() * dim.x, 110, Math.random() * dim.z)
let fogDistance = 0
let backgroundColor = 0xdddddd
const WIDTH = window.innerWidth;
const HEIGHT = window.innerHeight;

const perlin = new ImprovedNoise()
let noiseScale = 0.1

let canvasElement = document.getElementById("game-canvas")
const renderer = new THREE.WebGLRenderer({ canvas: canvasElement, antialias: false });
renderer.setSize(WIDTH, HEIGHT);
renderer.setClearColor(backgroundColor, 1);
// renderer.shadowMap.enabled = true;
// renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(70, WIDTH / HEIGHT);
scene.add(camera);

// Ambient light (uniform background illumination)
const ambientLight = new THREE.AmbientLight(0xffffff, 1);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 3);
directionalLight.position.set(5, 10, 7.5);
scene.add(directionalLight);

const headlamp = new THREE.SpotLight(0xffffff, 0.15);
scene.add(headlamp)
scene.add(headlamp.target)

const raycaster = new THREE.Raycaster()

scene.fog = new THREE.Fog(backgroundColor, 1, fogDistance)
// scene.fog = new THREE.FogExp2(backgroundColor, 0.05)

const activeKeys = new Set()
let mouseDelta = new THREE.Vector2(0, 0)
let velocity = new THREE.Vector3(0, 0, 0)
// Hardcoded initial values, might be buggy
let deltaTime = 0.016;
let grounded = false;
let boxGeometry = new THREE.BoxGeometry(1, 1, 1);

const textureLoader = new THREE.TextureLoader()
const textures = [textureLoader.load('assets/cobblestone.png'), textureLoader.load('assets/grass.png')];
for (let item of textures) {
  item.colorSpace = THREE.SRGBColorSpace;
}
const materials = [];
for(let i = 0; i < textures.length; i++){
  materials.push(new THREE.MeshLambertMaterial({ map: textures[i], roughness: 0.9, metalness: 0 }))
}

let worldBuffer = new ArrayBuffer(dim.x * dim.y * dim.z);
let worldView = new Uint8Array(worldBuffer)
let numCubes = Array(textures.length).fill(0);
for (let i = 0; i < worldView.length; i++) {
  let position = indexToPosition(i)
  let noise = perlin.noise(noiseScale * position.x, noiseScale * position.y, noiseScale * position.z)
  // let noise = perlin.noise(noiseScale*position.x, 0, noiseScale*position.z)
  // let value = 0.5+0.1*noise > position.y/dim.y
  let value = noise > 0
  let type0 = position.y > dim.y - 5;
  worldView[i] = packBlock({ value: value, drawn: false, type0: type0 })
  if (value) numCubes[+type0]++;
}
// Create instanced meshes with the per-type max instance count
const worldMeshes = [
  new THREE.InstancedMesh(boxGeometry, materials[0], numCubes[0] || 0),
  new THREE.InstancedMesh(boxGeometry, materials[1], numCubes[1] || 0)
]
const dummy = new THREE.Object3D();
let drawnCubes = Array(worldMeshes.length).fill(0);
for (let i = 0; i < worldView.length; i++) {
  let spacing = 1
  let position = indexToPosition(i)
  let blockData = unpackBlock(worldView[i])
  if (blockData.value) {
    let obstructed = true;
    for (let index = 0; index < 3; index++) {
      for (let value = -1; value < 2; value += 2) {
        const ni = position.x + (index === 0 ? value : 0);
        const nj = position.y + (index === 1 ? value : 0);
        const nk = position.z + (index === 2 ? value : 0);
        let worldIndex = positionToIndex({ x: ni, y: nj, z: nk })
        if (worldIndex === false || !unpackBlock(worldView[worldIndex]).value) {
          obstructed = false;
        }
      }
    }
    if (!obstructed) {
      dummy.position.set(position.x * spacing, position.y * spacing, position.z * spacing)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      worldMeshes[+blockData.type0].setMatrixAt(drawnCubes[+blockData.type0], dummy.matrix)
      drawnCubes[+blockData.type0]++;
      blockData.drawn = true;
      worldView[i] = packBlock(blockData)
    }
  }
}
// instancedMesh.instanceMatrix.needsUpdate = true;
// instancedMesh.count = drawnCubes
for (let i = 0; i < worldMeshes.length; i++) {
  worldMeshes[i].instanceMatrix.needsUpdate = true;
  worldMeshes[i].count = drawnCubes[i]
  // worldMeshes[i].castShadow = true
  // worldMeshes[i].receiveShadow = true;
  scene.add(worldMeshes[i])
}
camera.position.x = spawn.x
camera.position.y = spawn.y
camera.position.z = spawn.z

let start = performance.now();

function render() {
  deltaTime = (performance.now() - start) / 1000
  start = performance.now()
  // controls.update();
  requestAnimationFrame(render);
  // Physics  
  camera.rotation.order = "YXZ"
  camera.rotation.y += mouseDelta.x * -0.0015;
  camera.rotation.x += mouseDelta.y * -0.0015;
  mouseDelta.x = 0;
  mouseDelta.y = 0;
  let movementDir = new THREE.Vector3(0, 0, 0)
  if (keyIsDown("r")) {
    camera.position.x = spawn.x
    camera.position.y = spawn.y
    camera.position.z = spawn.z
    velocity = new THREE.Vector3(0, 0, 0)
  }
  if (keyIsDown("w")) {
    movementDir.x -= Math.sin(camera.rotation.y)
    movementDir.z -= Math.cos(camera.rotation.y)
  }
  if (keyIsDown("s")) {
    movementDir.x += Math.sin(camera.rotation.y)
    movementDir.z += Math.cos(camera.rotation.y)
  }
  if (keyIsDown("a")) {
    movementDir.x -= Math.sin(camera.rotation.y + Math.PI / 2)
    movementDir.z -= Math.cos(camera.rotation.y + Math.PI / 2)
  }
  if (keyIsDown("d")) {
    movementDir.x += Math.sin(camera.rotation.y + Math.PI / 2)
    movementDir.z += Math.cos(camera.rotation.y + Math.PI / 2)
  }
  if (movementDir.length() > 0) {
    camera.position.add(movementDir.normalize().multiplyScalar(deltaTime*4.3))
  }
  if (grounded) {
    if (keyIsDown(" ")) {
      velocity.y = 5
    }
  }
  velocity.y -= 10 * (deltaTime)
  camera.position.add(velocity.clone().multiplyScalar(deltaTime))
  let camRounded = new THREE.Vector3(Math.round(camera.position.x), Math.round(camera.position.y), Math.round(camera.position.z))
  grounded = false;
  for (let i = -2; i < 3; i++) {
    for (let j = -2; j < 3; j++) {
      for (let k = -2; k < 3; k++) {
        let block = new THREE.Vector3(i + camRounded.x, j + camRounded.y, k + camRounded.z)
        let index = positionToIndex(block)
        if (index !== false && unpackBlock(worldView[index]).value) {
          let displacement = new THREE.Vector3()
          displacement.subVectors(block, camera.position)
          let abX = Math.abs(displacement.x)
          let abY = Math.abs(displacement.y)
          let abZ = Math.abs(displacement.z)
          if (abX < 1 && abY < 1.5 && abZ < 1) {
            const overlapX = 1 - abX
            const overlapY = 1.5 - abY
            const overlapZ = 1 - abZ
            const collisions = [
              { axis: 'x', overlap: overlapX, sign: Math.sign(displacement.x) || 1 },
              { axis: 'y', overlap: overlapY, sign: Math.sign(displacement.y) || 1 },
              { axis: 'z', overlap: overlapZ, sign: Math.sign(displacement.z) || 1 },
            ]
            const smallest = collisions.reduce((best, current) => current.overlap < best.overlap ? current : best)
            if (smallest.overlap > 0) {
              camera.position[smallest.axis] -= smallest.sign * smallest.overlap
              velocity[smallest.axis] = 0
            }
            let below = new THREE.Vector3(camRounded.x, camRounded.y - 1, camRounded.z)
            let belowIndex = positionToIndex(below)
            if (smallest.axis === 'y' && displacement.y < 0 && belowIndex !== false && unpackBlock(worldView[belowIndex]).value) {
              grounded = true
            }
          }
        }
      }
    }
  }
  headlamp.position.copy(camera.position)
  // point the spotlight in the camera's forward direction
  const dir = new THREE.Vector3()
  camera.getWorldDirection(dir)
  headlamp.target.position.copy(camera.position).add(dir.multiplyScalar(1))
  headlamp.target.updateMatrixWorld()
  renderer.render(scene, camera);
}
render();

window.addEventListener('keydown', (event) => {
  activeKeys.add(event.key)
})

window.addEventListener('keyup', (event) => {
  activeKeys.delete(event.key)
})

function keyIsDown(key) {
  return activeKeys.has(key)
}

renderer.domElement.addEventListener("dblclick", async () => {
  await renderer.domElement.requestPointerLock({
    unadjustedMovement: true,
  });
});

renderer.domElement.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

renderer.domElement.addEventListener("mousemove", (event) => {
  mouseDelta.x = event.movementX
  mouseDelta.y = event.movementY
})

renderer.domElement.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 && event.button !== 2) return;
  event.preventDefault();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera)
  const hits = raycaster.intersectObjects(worldMeshes)
  if (hits.length > 0) {
    let id = hits[0].instanceId
    let mesh = hits[0].object
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    mesh.getMatrixAt(id, matrix);
    matrix.decompose(position, rotation, scale);

    if (event.button === 0) {
      const dummy = new THREE.Object3D()
      const offset = new THREE.Vector3(0, 0, 0)
      let faceIndex = hits[0].faceIndex
      if ([4, 5].includes(faceIndex)) offset.y = 1
      if ([6, 7].includes(faceIndex)) offset.y = -1
      if ([8, 9].includes(faceIndex)) offset.z = 1
      if ([10, 11].includes(faceIndex)) offset.z = -1
      if ([2, 3].includes(faceIndex)) offset.x = -1
      if ([0, 1].includes(faceIndex)) offset.x = 1
      const targetX = position.x + offset.x
      const targetY = position.y + offset.y
      const targetZ = position.z + offset.z
      const worldIndex = positionToIndex(targetX, targetY, targetZ)
      if (worldIndex !== false) {
        let worldData = unpackBlock(worldView[worldIndex])
        if (!worldData.value) {
          const targetMesh = worldMeshes[+worldData.type0]
          dummy.position.set(targetX, targetY, targetZ)
          dummy.scale.set(1, 1, 1)
          dummy.updateMatrix()
          targetMesh.setMatrixAt(drawnCubes[+worldData.type0], dummy.matrix)
          targetMesh.instanceMatrix.needsUpdate = true
          drawnCubes[+worldData.type0]++;
          targetMesh.count++;
          worldData.value = true;
          worldData.drawn = true;
          worldView[worldIndex] = packBlock(worldData)
        }
      }
    } else if (event.button === 2) {
      const lastIndex = mesh.count - 1;
      const tempMatrix = new THREE.Matrix4();
      mesh.getMatrixAt(lastIndex, tempMatrix);
      mesh.setMatrixAt(id, tempMatrix);
      mesh.count -= 1;
      mesh.instanceMatrix.needsUpdate = true;
      let worldIndex = positionToIndex(position.x, position.y, position.z)
      if (worldIndex !== false) {
        let worldData = unpackBlock(worldView[worldIndex])
        worldData.value = false;
        worldData.drawn = false;
        drawnCubes[+worldData.type0]--;
        worldView[worldIndex] = packBlock(worldData)
      }
      // I don't add cubes that are fully surrounded by other cubes to the instancedMesh. This checks to see if any of those unrendered but real cubes were exposed
      for (let index = 0; index < 3; index++) {
        for (let value = -1; value < 2; value += 2) {
          const ni = position.x + (index === 0 ? value : 0);
          const nj = position.y + (index === 1 ? value : 0);
          const nk = position.z + (index === 2 ? value : 0);
          worldIndex = positionToIndex({ x: ni, y: nj, z: nk })
          if (worldIndex !== false) {
            let worldData = unpackBlock(worldView[worldIndex])
            if (!worldData.drawn && worldData.value) {
              dummy.position.set(ni, nj, nk)
              dummy.scale.set(1, 1, 1)
              dummy.updateMatrix()
              // Something's up here
              worldMeshes[+worldData.type0].setMatrixAt(drawnCubes[+worldData.type0], dummy.matrix)
              worldMeshes[+worldData.type0].instanceMatrix.needsUpdate = true
              drawnCubes[+worldData.type0]++;
              worldMeshes[+worldData.type0].count++;
              worldData.drawn = true;
              worldData.value = true;
              worldView[worldIndex] = packBlock(worldData)
            }
          }
        }
      }

    }
  }
})

function positionToIndex(pos, y, z) {
  let xVal, yVal, zVal;
  if (typeof pos === 'object' && pos !== null) {
    xVal = pos.x;
    yVal = pos.y;
    zVal = pos.z;
  } else {
    xVal = pos;
    yVal = y;
    zVal = z;
  }
  if (
    xVal < 0 || xVal >= dim.x ||
    yVal < 0 || yVal >= dim.y ||
    zVal < 0 || zVal >= dim.z
  ) {
    return false;
  }
  return xVal + dim.x * (yVal + dim.y * zVal)
}

function indexToPosition(index) {
  let result = new THREE.Vector3()
  result.x = index % dim.x
  result.y = Math.floor(index / dim.x) % dim.y
  result.z = Math.floor(index / (dim.x * dim.y))
  return result
}

function packBlock({ value = false, drawn = false, type0 = false }) {
  // Store value, drawn, type0 in bits 7,6,5 respectively
  let byte = 0
  if (value) byte |= 1 << 7
  if (drawn) byte |= 1 << 6
  if (type0) byte |= 1 << 5
  return byte
}

function unpackBlock(block) {
  // Read value, drawn, type0 from bits 7,6,5 respectively
  return {
    value: (block & (1 << 7)) !== 0,
    drawn: (block & (1 << 6)) !== 0,
    type0: (block & (1 << 5)) !== 0,
  }
}