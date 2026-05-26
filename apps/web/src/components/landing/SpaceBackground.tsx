'use client';

import { useRef, useMemo, useState, useEffect, useCallback, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STAR_COUNT = 5000;
const GALAXY_PARTICLE_COUNT = 4000;
const GALAXY_ROTATION_SPEED = 0.0001;
const ATTRACTOR_PARTICLE_COUNT = 600;
const ATTRACT_STRENGTH = 0.0004;

const PLANET_DATA = [
  { name: 'Groq', color: '#FF6B35', distance: 1.2, size: 0.06, speed: 0.15, offset: 0 },
  { name: 'GLM-4', color: '#4ECDC4', distance: 1.6, size: 0.07, speed: 0.1, offset: Math.PI * 0.33 },
  { name: 'Gemini', color: '#3B82F6', distance: 2.0, size: 0.08, speed: 0.07, offset: Math.PI * 0.66 },
  { name: 'Bedrock', color: '#8B5CF6', distance: 2.5, size: 0.065, speed: 0.05, offset: Math.PI },
  { name: 'Ollama', color: '#10B981', distance: 3.0, size: 0.075, speed: 0.035, offset: Math.PI * 1.33 },
  { name: 'Twelve Data', color: '#F59E0B', distance: 3.5, size: 0.055, speed: 0.025, offset: Math.PI * 1.66 },
] as const;

const NEBULA_DATA = [
  { color: [0.6, 0.2, 0.8] as const, position: [2, 1, -3] as const, scale: 1.8, speed: 0.08 },
  { color: [0.2, 0.4, 0.9] as const, position: [-2.5, -0.5, -4] as const, scale: 2.2, speed: 0.06 },
  { color: [0.1, 0.7, 0.4] as const, position: [0.5, -1.5, -2] as const, scale: 1.5, speed: 0.1 },
] as const;

/* ------------------------------------------------------------------ */
/*  Hook: prefers-reduced-motion                                       */
/* ------------------------------------------------------------------ */

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mql.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return reduced;
}

/* ------------------------------------------------------------------ */
/*  Stars — 5 000 twinkling points                                    */
/* ------------------------------------------------------------------ */

function Stars({ reduced }: { reduced: boolean }) {
  const ref = useRef<THREE.Points>(null!);

  const { positions, opacities, twinkleSpeeds } = useMemo(() => {
    const pos = new Float32Array(STAR_COUNT * 3);
    const opa = new Float32Array(STAR_COUNT);
    const spd = new Float32Array(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 40;
      opa[i] = Math.random();
      spd[i] = 0.3 + Math.random() * 2.0;
    }
    return { positions: pos, opacities: opa, twinkleSpeeds: spd };
  }, []);

  const opacityRef = useRef(opacities);

  useFrame(({ clock }) => {
    if (reduced) return;
    const t = clock.getElapsedTime();
    const opa = opacityRef.current;
    for (let i = 0; i < STAR_COUNT; i++) {
      opa[i] = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * twinkleSpeeds[i] + i));
    }
    const geom = ref.current.geometry;
    geom.attributes.aOpacity.needsUpdate = true;
  });

  const shaderMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {},
        vertexShader: `
          attribute float aOpacity;
          varying float vOpacity;
          void main() {
            vOpacity = aOpacity;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = 2.0 * (5.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          varying float vOpacity;
          void main() {
            float d = length(gl_PointCoord - vec2(0.5));
            if (d > 0.5) discard;
            float alpha = smoothstep(0.5, 0.0, d) * vOpacity;
            gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
          }
        `,
      }),
    [],
  );

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={STAR_COUNT}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aOpacity"
          count={STAR_COUNT}
          array={opacityRef.current}
          itemSize={1}
        />
      </bufferGeometry>
      <primitive object={shaderMaterial} attach="material" />
    </points>
  );
}

/* ------------------------------------------------------------------ */
/*  Spiral Galaxy                                                      */
/* ------------------------------------------------------------------ */

function SpiralGalaxy({ reduced }: { reduced: boolean }) {
  const ref = useRef<THREE.Points>(null!);

  const { positions, colors } = useMemo(() => {
    const pos = new Float32Array(GALAXY_PARTICLE_COUNT * 3);
    const col = new Float32Array(GALAXY_PARTICLE_COUNT * 3);
    const arms = 3;

    for (let i = 0; i < GALAXY_PARTICLE_COUNT; i++) {
      const arm = i % arms;
      const armAngle = (arm / arms) * Math.PI * 2;
      const radius = Math.random() * 2.5;
      const spiralAngle = radius * 2.5;
      const angle = armAngle + spiralAngle;

      const spread = 0.15 * radius;
      const randX = (Math.random() - 0.5) * spread;
      const randY = (Math.random() - 0.5) * spread * 0.3;
      const randZ = (Math.random() - 0.5) * spread;

      pos[i * 3] = Math.cos(angle) * radius + randX;
      pos[i * 3 + 1] = randY;
      pos[i * 3 + 2] = Math.sin(angle) * radius + randZ;

      const t = radius / 2.5;
      const core = 1.0 - t;
      col[i * 3] = 0.4 + core * 0.6;
      col[i * 3 + 1] = 0.3 + core * 0.4;
      col[i * 3 + 2] = 0.7 + core * 0.3;
    }
    return { positions: pos, colors: col };
  }, []);

  useFrame((_, delta) => {
    if (reduced) return;
    ref.current.rotation.y += GALAXY_ROTATION_SPEED * delta * 60;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={GALAXY_PARTICLE_COUNT}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={GALAXY_PARTICLE_COUNT}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.015}
        vertexColors
        transparent
        opacity={0.8}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

/* ------------------------------------------------------------------ */
/*  Nebulae — soft transparent blobs                                  */
/* ------------------------------------------------------------------ */

function Nebula({
  color,
  position,
  scale,
  speed,
  reduced,
}: {
  color: readonly [number, number, number];
  position: readonly [number, number, number];
  scale: number;
  speed: number;
  reduced: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null!);

  const texture = useMemo(() => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, `rgba(${Math.round(color[0] * 255)},${Math.round(color[1] * 255)},${Math.round(color[2] * 255)},0.35)`);
    gradient.addColorStop(0.4, `rgba(${Math.round(color[0] * 255)},${Math.round(color[1] * 255)},${Math.round(color[2] * 255)},0.12)`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, [color]);

  const initialOffset = useMemo(() => Math.random() * Math.PI * 2, []);

  useFrame(({ clock }) => {
    if (reduced) return;
    const t = clock.getElapsedTime();
    ref.current.position.x = position[0] + Math.sin(t * speed + initialOffset) * 0.3;
    ref.current.position.y = position[1] + Math.cos(t * speed * 0.7 + initialOffset) * 0.2;
  });

  return (
    <mesh ref={ref} position={[position[0], position[1], position[2]]}>
      <planeGeometry args={[scale, scale]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={0.6}
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/*  Planet — orbiting sphere with label                                */
/* ------------------------------------------------------------------ */

function Planet({
  name,
  color,
  distance,
  size,
  speed,
  offset,
  reduced,
}: {
  name: string;
  color: string;
  distance: number;
  size: number;
  speed: number;
  offset: number;
  reduced: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null!);
  const glowRef = useRef<THREE.Mesh>(null!);

  useFrame(({ clock }) => {
    const t = reduced ? 0 : clock.getElapsedTime();
    const angle = offset + t * speed;
    groupRef.current.position.x = Math.cos(angle) * distance;
    groupRef.current.position.z = Math.sin(angle) * distance;
    groupRef.current.position.y = Math.sin(angle * 0.5) * 0.15;
  });

  const glowTexture = useMemo(() => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const c = new THREE.Color(color);
    const r = Math.round(c.r * 255);
    const g = Math.round(c.g * 255);
    const b = Math.round(c.b * 255);
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, `rgba(${r},${g},${b},0.5)`);
    gradient.addColorStop(0.3, `rgba(${r},${g},${b},0.15)`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, [color]);

  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[size, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh ref={glowRef} scale={[3, 3, 1]}>
        <planeGeometry args={[size * 3, size * 3]} />
        <meshBasicMaterial
          map={glowTexture}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <Text
        position={[0, size + 0.12, 0]}
        fontSize={0.09}
        color={color}
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.008}
        outlineColor="#000000"
      >
        {name}
      </Text>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Shooting Stars                                                     */
/* ------------------------------------------------------------------ */

interface ShootingStar {
  id: number;
  start: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

function ShootingStars({ reduced }: { reduced: boolean }) {
  const [stars, setStars] = useState<ShootingStar[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    if (reduced) return;

    const spawnStar = () => {
      const id = nextId.current++;
      const startX = (Math.random() - 0.5) * 10;
      const startY = 3 + Math.random() * 4;
      const startZ = (Math.random() - 0.5) * 5 - 3;
      const angle = -0.3 - Math.random() * 0.4;
      const speed = 4 + Math.random() * 4;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const vz = (Math.random() - 0.5) * 0.5;
      const maxLife = 0.6 + Math.random() * 0.8;

      setStars((prev) => [...prev, { id, start: new THREE.Vector3(startX, startY, startZ), velocity: new THREE.Vector3(vx, vy, vz), life: 0, maxLife }]);
    };

    const scheduleNext = () => {
      const delay = 5000 + Math.random() * 5000;
      return window.setTimeout(() => {
        spawnStar();
        timerRef.current = scheduleNext();
      }, delay);
    };

    const timerRef = { current: scheduleNext() };

    return () => {
      clearTimeout(timerRef.current);
    };
  }, [reduced]);

  // Update star lifetimes and remove expired ones
  useFrame((_, delta) => {
    if (reduced) return;
    setStars((prev) =>
      prev
        .map((s) => ({ ...s, life: s.life + delta }))
        .filter((s) => s.life < s.maxLife),
    );
  });

  return (
    <>
      {stars.map((star) => {
        const progress = star.life / star.maxLife;
        const opacity = 1.0 - progress;
        const pos = star.start.clone().add(star.velocity.clone().multiplyScalar(star.life));
        const tailLen = 0.3;
        const tailPos = pos.clone().sub(star.velocity.clone().normalize().multiplyScalar(tailLen));

        const points = new Float32Array([
          pos.x, pos.y, pos.z,
          tailPos.x, tailPos.y, tailPos.z,
        ]);

        return (
          <points key={star.id}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={2}
                array={points}
                itemSize={3}
              />
            </bufferGeometry>
            <pointsMaterial
              size={0.04}
              color="#ffffff"
              transparent
              opacity={opacity}
              depthWrite={false}
              sizeAttenuation
            />
          </points>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Cursor Attractor Particles                                         */
/* ------------------------------------------------------------------ */

function CursorAttractorParticles({ reduced }: { reduced: boolean }) {
  const ref = useRef<THREE.Points>(null!);
  const mouse = useRef(new THREE.Vector2(0, 0));
  const { viewport } = useThree();

  const { positions, velocities } = useMemo(() => {
    const pos = new Float32Array(ATTRACTOR_PARTICLE_COUNT * 3);
    const vel = new Float32Array(ATTRACTOR_PARTICLE_COUNT * 3);
    for (let i = 0; i < ATTRACTOR_PARTICLE_COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 8;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 8;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 4;
      vel[i * 3] = 0;
      vel[i * 3 + 1] = 0;
      vel[i * 3 + 2] = 0;
    }
    return { positions: pos, velocities: vel };
  }, []);

  const velocitiesRef = useRef(velocities);

  const onPointerMove = useCallback((e: { clientX: number; clientY: number }) => {
    mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }, []);

  useEffect(() => {
    window.addEventListener('pointermove', onPointerMove);
    return () => window.removeEventListener('pointermove', onPointerMove);
  }, [onPointerMove]);

  useFrame(() => {
    if (reduced) return;
    const posArr = ref.current.geometry.attributes.position.array as Float32Array;
    const vel = velocitiesRef.current;

    // Convert mouse to world position approximately
    const targetX = mouse.current.x * viewport.width * 0.5;
    const targetY = mouse.current.y * viewport.height * 0.5;
    const targetZ = 0;

    for (let i = 0; i < ATTRACTOR_PARTICLE_COUNT; i++) {
      const ix = i * 3;
      const iy = i * 3 + 1;
      const iz = i * 3 + 2;

      const dx = targetX - posArr[ix];
      const dy = targetY - posArr[iy];
      const dz = targetZ - posArr[iz];

      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.001;

      // Attraction force inversely proportional to distance
      const force = ATTRACT_STRENGTH / (dist * 0.5 + 0.1);

      vel[ix] += dx * force;
      vel[iy] += dy * force;
      vel[iz] += dz * force;

      // Damping
      vel[ix] *= 0.96;
      vel[iy] *= 0.96;
      vel[iz] *= 0.96;

      posArr[ix] += vel[ix];
      posArr[iy] += vel[iy];
      posArr[iz] += vel[iz];

      // Soft bounds to keep particles visible
      if (Math.abs(posArr[ix]) > 5) vel[ix] -= posArr[ix] * 0.01;
      if (Math.abs(posArr[iy]) > 5) vel[iy] -= posArr[iy] * 0.01;
      if (Math.abs(posArr[iz]) > 3) vel[iz] -= posArr[iz] * 0.01;
    }

    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={ATTRACTOR_PARTICLE_COUNT}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.02}
        color="#8899ff"
        transparent
        opacity={0.5}
        depthWrite={false}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ------------------------------------------------------------------ */
/*  Scene — assembles all sub-components                               */
/* ------------------------------------------------------------------ */

function Scene({ reduced }: { reduced: boolean }) {
  return (
    <>
      <Stars reduced={reduced} />
      <SpiralGalaxy reduced={reduced} />
      {NEBULA_DATA.map((n, i) => (
        <Nebula
          key={i}
          color={n.color}
          position={n.position}
          scale={n.scale}
          speed={n.speed}
          reduced={reduced}
        />
      ))}
      {PLANET_DATA.map((p) => (
        <Planet
          key={p.name}
          name={p.name}
          color={p.color}
          distance={p.distance}
          size={p.size}
          speed={p.speed}
          offset={p.offset}
          reduced={reduced}
        />
      ))}
      <ShootingStars reduced={reduced} />
      <CursorAttractorParticles reduced={reduced} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Main export — full-screen Canvas                                   */
/* ------------------------------------------------------------------ */

function SpaceBackground() {
  const reduced = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);

  // Ensure WebGL context is released when component unmounts
  useEffect(() => {
    return () => {
      const container = containerRef.current;
      if (container) {
        const canvas = container.querySelector('canvas');
        if (canvas) {
          const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
          if (gl && 'getExtension' in gl) {
            const ext = (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context');
            if (ext) ext.loseContext();
          }
        }
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000000',
        zIndex: -1,
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 5], fov: 60, near: 0.1, far: 100 }}
        dpr={[1, 1.5]}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
      >
        <Suspense fallback={null}>
          <Scene reduced={reduced} />
        </Suspense>
      </Canvas>
    </div>
  );
}

export default SpaceBackground;
