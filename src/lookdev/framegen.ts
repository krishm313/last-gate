// Frame renderer (dev tool): renders animation frames of a CC0 KayKit character to a transparent
// canvas, one frame per call, so the 2D game can use them as a sprite sheet.
// Usage: framegen.html?model=Barbarian&clip=Walking_A&frames=8&i=0&show=1H_Axe
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const q = new URLSearchParams(location.search);
const SIZE = Number(q.get("size") ?? 256);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(SIZE, SIZE);
renderer.setPixelRatio(1);
renderer.setClearColor(0, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;
scene.add(new THREE.HemisphereLight(0xdff0ff, 0x3a4a20, 0.9));
const sun = new THREE.DirectionalLight(0xffeccc, 2.6);
sun.position.set(-4, 8, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: 0.3 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 100);
cam.position.set(0, 4.6, 7.6);
cam.lookAt(0, 1.1, 0);

const gltf = await new GLTFLoader().loadAsync(`./kaykit/${q.get("model") ?? "Barbarian"}.glb`);
const model = gltf.scene;
const show = (q.get("show") ?? "").split(",").filter(Boolean);
model.traverse((o) => {
  const m = o as THREE.Mesh;
  if (!m.isMesh) return;
  m.castShadow = true;
  const body = /(ArmLeft|ArmRight|Body|Head|LegLeft|LegRight|Cape|Hat)$/.test(o.name) && !/Shield|Axe|Mug|Sword/.test(o.name);
  o.visible = body || show.includes(o.name);
  if (q.get("hide")?.split(",").includes(o.name)) o.visible = false;
});
model.rotation.y = Number(q.get("rot") ?? 0.5);
scene.add(model);
const clip = gltf.animations.find((a) => a.name === (q.get("clip") ?? "Walking_A"))!;
const mixer = new THREE.AnimationMixer(model);
mixer.clipAction(clip).play();
const frames = Number(q.get("frames") ?? 8);
const i = Number(q.get("i") ?? 0);
mixer.setTime((clip.duration * i) / frames);
renderer.render(scene, cam);
const foot = new THREE.Vector3(0, 0, 0).project(cam);
(window as unknown as { __foot: object }).__foot = { x: ((foot.x + 1) / 2) * SIZE, y: ((1 - foot.y) / 2) * SIZE };
(window as unknown as { __done: boolean }).__done = true;
