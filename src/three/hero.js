/**
 * HueForge — hero.js
 * -----------------------------------------------------------------------------
 * The landing-page centrepiece: a morphing, iridescent orb built from a
 * simplex-noise vertex shader, lit by the colours of the current palette.
 *
 * Design goals:
 *   • Zero post-processing (fast on laptops and phones).
 *   • Graceful degradation: no WebGL → CSS orb fallback; reduced motion →
 *     a single static frame.
 *   • Cheap palette updates: colours lerp, the environment map regenerates
 *     once per generation (not per frame).
 */

// Vendored relative import: works in browsers without a build step and in Node tests.
import * as THREE from '../../vendor/three.module.min.js';

/* -------------------------------------------------------------------------- */
/* GLSL                                                                       */
/* -------------------------------------------------------------------------- */

// 3D simplex noise — Ashima Arts / Stefan Gustavson (MIT).
const NOISE_GLSL = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

const DISPLACE_GLSL = /* glsl */ `
uniform float uTime;
uniform float uAmplitude;
uniform float uFrequency;
uniform float uSpeed;

float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = 1.0;
  for (int i = 0; i < 4; i++) {
    value += amplitude * snoise(p * frequency + uTime * 0.16);
    frequency *= 2.02;
    amplitude *= 0.5;
  }
  return value;
}

vec3 displace(vec3 p) {
  vec3 dir = normalize(p);
  float base = fbm(p * uFrequency);
  float detail = snoise(p * uFrequency * 2.7 - uTime * 0.28);
  // Two octave layers only: enough to feel alive, never enough to break the
  // spherical silhouette.
  return p + dir * (base * uAmplitude + detail * uAmplitude * 0.18);
}
`;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Canvas-drawn equirectangular environment → PMREM for soft, colourful gloss. */
function createEnvironment(renderer, colors) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const background = ctx.createLinearGradient(0, 0, 0, canvas.height);
  background.addColorStop(0, '#0b0d1a');
  background.addColorStop(0.45, '#080a12');
  background.addColorStop(1, '#030407');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.globalCompositeOperation = 'lighter';
  const blobs = [
    { color: colors[2], x: 0.22, y: 0.3, radius: 0.34, alpha: 0.85 },
    { color: colors[1], x: 0.72, y: 0.24, radius: 0.26, alpha: 0.7 },
    { color: colors[4], x: 0.55, y: 0.72, radius: 0.38, alpha: 0.55 },
    { color: colors[3], x: 0.92, y: 0.5, radius: 0.22, alpha: 0.6 },
  ];

  for (const blob of blobs) {
    const gradient = ctx.createRadialGradient(
      canvas.width * blob.x,
      canvas.height * blob.y,
      0,
      canvas.width * blob.x,
      canvas.height * blob.y,
      canvas.width * blob.radius,
    );
    gradient.addColorStop(0, `${blob.color}${Math.round(blob.alpha * 255)
      .toString(16)
      .padStart(2, '0')}`);
    gradient.addColorStop(1, '#00000000');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Bright strip = studio softbox reflection, keeps the orb from going muddy.
  const strip = ctx.createLinearGradient(0, 40, 0, 190);
  strip.addColorStop(0, 'rgba(255,255,255,0)');
  strip.addColorStop(0.5, 'rgba(255,255,255,0.85)');
  strip.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = strip;
  ctx.fillRect(canvas.width * 0.08, 30, canvas.width * 0.3, 180);

  ctx.globalCompositeOperation = 'source-over';

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envMap = pmrem.fromEquirectangular(texture).texture;
  texture.dispose();
  pmrem.dispose();
  return envMap;
}

/** Soft additive sprite used as a halo behind the orb. */
function createGlow() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.28, 'rgba(255,255,255,0.34)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(8, 8, 1);
  return sprite;
}

/* -------------------------------------------------------------------------- */
/* Scene                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Mount the hero scene.
 *
 * @param {HTMLElement} container  Positioned element that owns the canvas.
 * @param {object} options
 * @param {string[]} options.colors  Initial palette.
 * @param {boolean} options.reducedMotion  Force the static presentation.
 * @returns {{ setPalette(colors: string[]): void, destroy(): void }}
 */
export function createHeroScene(container, { colors, reducedMotion = prefersReducedMotion() } = {}) {
  const palette = colors ?? ['#d9c9ff', '#b49cff', '#7c5cff', '#4a2fb8', '#1d1250'];
  const state = {
    raf: 0,
    running: false,
    visible: true,
    disposed: false,
    dragging: false,
    lastX: 0,
    lastY: 0,
    pointerX: 0,
    pointerY: 0,
    spinX: 0,
    spinY: 0,
    velocityX: 0,
    velocityY: 0,
    elapsed: 0,
    intro: reducedMotion ? 1 : 0,
    reducedMotion,
  };

  /* ---- Renderer ---------------------------------------------------------- */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
  } catch {
    container.classList.add('is-fallback');
    return { setPalette() {}, destroy() {} };
  }

  if (!renderer.getContext()) {
    container.classList.add('is-fallback');
    return { setPalette() {}, destroy() {} };
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.9));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.classList.add('hero__canvas');
  container.appendChild(renderer.domElement);

  /* ---- Scene & camera ---------------------------------------------------- */
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0.35, 7.6);

  const group = new THREE.Group();
  scene.add(group);

  const initialColors = palette.map((hex) => new THREE.Color(hex));
  const targetColors = initialColors.map((color) => color.clone());

  let envMap = createEnvironment(renderer, palette);
  scene.environment = envMap;

  /* ---- Orb --------------------------------------------------------------- */
  const orbGeometry = new THREE.IcosahedronGeometry(1.62, 64);
  const orbMaterial = new THREE.MeshPhysicalMaterial({
    color: initialColors[2],
    emissive: initialColors[2],
    emissiveIntensity: 0.34,
    metalness: 0.16,
    roughness: 0.14,
    clearcoat: 1,
    clearcoatRoughness: 0.18,
    iridescence: 0.62,
    iridescenceIOR: 1.45,
    iridescenceThicknessRange: [180, 620],
    sheen: 0.5,
    sheenColor: initialColors[1],
    sheenRoughness: 0.4,
    envMapIntensity: 1.35,
  });

  const uniforms = {
    uTime: { value: 0 },
    uAmplitude: { value: 0.055 },
    uFrequency: { value: 0.9 },
    uSpeed: { value: 1 },
  };

  orbMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uAmplitude = uniforms.uAmplitude;
    shader.uniforms.uFrequency = uniforms.uFrequency;
    shader.uniforms.uSpeed = uniforms.uSpeed;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\n${NOISE_GLSL}\n${DISPLACE_GLSL}`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `
        vec3 objectNormal;
        {
          vec3 n = normalize(position);
          vec3 helper = abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
          vec3 tangent = normalize(cross(n, helper));
          vec3 bitangent = cross(n, tangent);
          vec3 centre = displace(position);
          vec3 alongT = displace(position + tangent * 0.03);
          vec3 alongB = displace(position + bitangent * 0.03);
          objectNormal = normalize(cross(alongT - centre, alongB - centre));
        }
        `,
      )
      .replace(
        '#include <begin_vertex>',
        `vec3 transformed = displace(position);`,
      );
    orbMaterial.userData.shader = shader;
  };

  const orb = new THREE.Mesh(orbGeometry, orbMaterial);
  group.add(orb);

  // A second, faint wireframe shell adds depth without a post-processing pass.
  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.02, 2),
    new THREE.MeshBasicMaterial({
      color: initialColors[1],
      wireframe: true,
      transparent: true,
      opacity: 0.07,
      depthWrite: false,
    }),
  );
  group.add(shell);

  /* ---- Halo -------------------------------------------------------------- */
  const glow = createGlow();
  glow.position.z = -1.6;
  scene.add(glow);
  glow.material.color.copy(initialColors[2]);

  /* ---- Rings ------------------------------------------------------------- */
  const ringSpecs = [
    { radius: 2.35, tilt: [1.15, 0.25, 0.2], opacity: 0.34, colorIndex: 1 },
    { radius: 2.85, tilt: [0.55, -0.35, -0.9], opacity: 0.22, colorIndex: 2 },
    { radius: 3.4, tilt: [1.5, 0.15, 0.55], opacity: 0.14, colorIndex: 3 },
  ];

  const rings = ringSpecs.map((spec) => {
    const geometry = new THREE.TorusGeometry(spec.radius, 0.006, 6, 260);
    const material = new THREE.MeshBasicMaterial({
      color: initialColors[spec.colorIndex],
      transparent: true,
      opacity: spec.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(geometry, material);
    ring.rotation.set(...spec.tilt);
    scene.add(ring);
    return ring;
  });

  /* ---- Particles --------------------------------------------------------- */
  const particleCount = 620;
  const positions = new Float32Array(particleCount * 3);
  const particleColors = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i += 1) {
    const radius = 2.8 + Math.random() * 5.4;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta) * 0.72;
    positions[i * 3 + 2] = radius * Math.cos(phi);
    const color = initialColors[Math.floor(Math.random() * initialColors.length)];
    particleColors[i * 3] = color.r;
    particleColors[i * 3 + 1] = color.g;
    particleColors[i * 3 + 2] = color.b;
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeometry.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));
  const particles = new THREE.Points(
    particleGeometry,
    new THREE.PointsMaterial({
      size: 0.035,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  scene.add(particles);

  /* ---- Lights ------------------------------------------------------------ */
  const ambient = new THREE.HemisphereLight(0xb6a8ff, 0x05060b, 0.72);
  scene.add(ambient);

  const keyLight = new THREE.PointLight(initialColors[1], 62, 26, 2);
  keyLight.position.set(3.4, 2.6, 3.2);
  scene.add(keyLight);

  const rimLight = new THREE.PointLight(initialColors[3], 55, 26, 2);
  rimLight.position.set(-3.6, -1.4, -2.4);
  scene.add(rimLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 1.1);
  fillLight.position.set(-2, 4, 2);
  scene.add(fillLight);

  // Front fill lifts the lower hemisphere so the globe never reads as half-black.
  const frontLight = new THREE.PointLight(0xffffff, 18, 18, 2);
  frontLight.position.set(0.4, -1.6, 5);
  scene.add(frontLight);

  // A warm-white specular bounce keeps the highlight readable on dark screens.
  const specLight = new THREE.PointLight(0xffffff, 26, 20, 2);
  specLight.position.set(-1.6, 3.2, 4.4);
  scene.add(specLight);

  /* ---- Interaction ------------------------------------------------------- */
  const handlePointerDown = (event) => {
    state.dragging = true;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    renderer.domElement.setPointerCapture?.(event.pointerId);
    container.classList.add('is-grabbing');
  };

  const handlePointerMove = (event) => {
    const bounds = container.getBoundingClientRect();
    state.pointerX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    state.pointerY = ((event.clientY - bounds.top) / bounds.height) * 2 - 1;

    if (!state.dragging) return;
    const deltaX = event.clientX - state.lastX;
    const deltaY = event.clientY - state.lastY;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    state.spinY += deltaX * 0.0055;
    state.spinX += deltaY * 0.0035;
    state.velocityY = deltaX * 0.0006;
    state.velocityX = deltaY * 0.0004;
  };

  const handlePointerUp = (event) => {
    state.dragging = false;
    container.classList.remove('is-grabbing');
    renderer.domElement.releasePointerCapture?.(event.pointerId);
  };

  const handlePointerLeave = () => {
    state.pointerX = 0;
    state.pointerY = 0;
  };

  if (!reducedMotion) {
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);
    renderer.domElement.addEventListener('pointercancel', handlePointerUp);
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave);
  }

  /* ---- Resize ------------------------------------------------------------ */
  const resize = () => {
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    const aspect = width / height;
    renderer.setSize(width, height, false);
    camera.aspect = aspect;
    camera.fov = aspect < 0.85 ? 52 : 38;
    camera.position.z = aspect < 0.85 ? 8.8 : 7.6;
    group.scale.setScalar(aspect < 0.85 ? 0.78 : 1);
    glow.scale.setScalar(aspect < 0.85 ? 6.4 : 8);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };

  const resizeObserver = new ResizeObserver(resize);

  /* ---- Frame loop -------------------------------------------------------- */
  const clock = new THREE.Clock();
  let envPending = false;

  const renderFrame = () => {
    const delta = Math.min(clock.getDelta(), 0.05);
    state.elapsed += delta;

    if (!state.reducedMotion) {
      uniforms.uTime.value = state.elapsed;

      // Intro scale-in.
      if (state.intro < 1) {
        state.intro = Math.min(1, state.intro + delta / 1.5);
        const eased = 1 - (1 - state.intro) ** 3;
        orb.scale.setScalar(0.72 + eased * 0.28);
      }

      // Drag inertia with gentle return towards the resting pose.
      state.spinY += state.velocityY;
      state.spinX += state.velocityX;
      state.velocityY *= 0.94;
      state.velocityX *= 0.94;
      state.spinX = THREE.MathUtils.clamp(state.spinX, -0.8, 0.8);
      state.spinY += (0 - state.spinY) * 0.0015;

      const targetRotX = state.spinX + state.pointerY * 0.16;
      const targetRotY = state.spinY + state.pointerX * 0.22;

      group.rotation.x += (targetRotX - group.rotation.x) * 0.06;
      group.rotation.y += (targetRotY - group.rotation.y) * 0.06;
      group.rotation.y += delta * 0.075;
      orb.rotation.y += delta * 0.03;
      shell.rotation.y -= delta * 0.06;
      shell.rotation.x += delta * 0.02;

      rings.forEach((ring, index) => {
        ring.rotation.z += delta * (0.03 + index * 0.014) * (index % 2 === 0 ? 1 : -1);
        ring.rotation.x += delta * 0.006;
      });

      particles.rotation.y += delta * 0.012;
      particles.rotation.x = Math.sin(state.elapsed * 0.08) * 0.08;

      // Ease palette colours towards the latest generation.
      orbMaterial.color.lerp(targetColors[2], 0.04);
      orbMaterial.emissive.lerp(targetColors[4], 0.04);
      orbMaterial.sheenColor.lerp(targetColors[1], 0.04);
      keyLight.color.lerp(targetColors[1], 0.04);
      rimLight.color.lerp(targetColors[3], 0.04);
      glow.material.color.lerp(targetColors[2], 0.04);
      specLight.intensity = 16 + Math.sin(state.elapsed * 0.7) * 3;
      shell.material.color.lerp(targetColors[1], 0.04);
      rings.forEach((ring, index) => {
        ring.material.color.lerp(targetColors[ringSpecs[index].colorIndex], 0.04);
      });

      glow.material.opacity = 0.38 + Math.sin(state.elapsed * 0.8) * 0.05;
      uniforms.uAmplitude.value = 0.05 + Math.sin(state.elapsed * 0.55) * 0.012;
    }

    renderer.render(scene, camera);
  };

  const tick = () => {
    if (state.disposed) return;
    state.raf = requestAnimationFrame(tick);
    if (!state.visible || document.hidden) return;
    renderFrame();
  };

  const start = () => {
    if (state.running || state.disposed) return;
    state.running = true;
    if (state.reducedMotion) {
      renderFrame();
      return;
    }
    clock.start();
    tick();
  };

  const stop = () => {
    state.running = false;
    cancelAnimationFrame(state.raf);
  };

  resizeObserver.observe(container);
  resize();

  const visibilityObserver = new IntersectionObserver(
    ([entry]) => {
      state.visible = entry.isIntersecting;
    },
    { threshold: 0.02 },
  );
  visibilityObserver.observe(container);

  const handleVisibility = () => {
    if (!document.hidden) clock.getDelta();
  };
  document.addEventListener('visibilitychange', handleVisibility);

  // Start after the first paint so the intro animation is never skipped.
  requestAnimationFrame(() => {
    resize();
    start();
  });

  /* ---- Public API -------------------------------------------------------- */
  let envTimer = 0;

  return {
    setPalette(nextColors) {
      if (state.disposed || !Array.isArray(nextColors)) return;
      nextColors.slice(0, 5).forEach((hex, index) => {
        targetColors[index]?.set(hex);
        if (index < particleColors.length / 3) {
          // no-op — particles keep their original scatter tint on purpose
        }
      });

      if (state.reducedMotion) {
        orbMaterial.color.set(nextColors[2]);
        orbMaterial.emissive.set(nextColors[4]);
        orbMaterial.sheenColor.set(nextColors[1]);
        keyLight.color.set(nextColors[1]);
        rimLight.color.set(nextColors[3]);
        glow.material.color.set(nextColors[2]);
        shell.material.color.set(nextColors[1]);
        rings.forEach((ring, index) => {
          ring.material.color.set(nextColors[ringSpecs[index].colorIndex]);
        });
        resize();
      }

      // Rebuild reflections at most once per animation frame burst.
      window.clearTimeout(envTimer);
      envTimer = window.setTimeout(() => {
        if (state.disposed) return;
        const previous = envMap;
        envMap = createEnvironment(renderer, nextColors);
        scene.environment = envMap;
        previous?.dispose();
      }, 180);
    },

    /** Pause rendering (used when the studio is open on small screens). */
    pause: stop,
    resume: start,

    destroy() {
      state.disposed = true;
      stop();
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearTimeout(envTimer);

      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointercancel', handlePointerUp);
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);

      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => {
            material.map?.dispose();
            material.dispose();
          });
        }
      });
      envMap?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
