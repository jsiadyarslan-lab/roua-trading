'use client'

import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { usePrefersReducedMotion } from '@/hooks/use-reduced-motion'

/* ── Constants ── */
const COLORS = ['#3B82F6', '#FFD700', '#10B981']
const CONNECTION_DISTANCE = 8
const TOTAL_NODES = 102 // core(12) + inner(20) + outer(30) + scattered(40)

/* ── Node generation ── */
interface NodeData {
  position: THREE.Vector3
  color: string
  frequency: number
  phase: number
  size: number
  ring: number
}

function generateNodes(): NodeData[] {
  const nodes: NodeData[] = []

  // Core ring - 12 nodes, tight cluster
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2
    const radius = 2.5 + Math.random() * 0.5
    nodes.push({
      position: new THREE.Vector3(
        Math.cos(angle) * radius,
        (Math.random() - 0.5) * 2,
        Math.sin(angle) * radius
      ),
      color: COLORS[i % 3],
      frequency: 0.5 + Math.random() * 1.5,
      phase: Math.random() * Math.PI * 2,
      size: 0.12 + Math.random() * 0.08,
      ring: 0,
    })
  }

  // Inner ring - 20 nodes
  for (let i = 0; i < 20; i++) {
    const angle = (i / 20) * Math.PI * 2
    const radius = 6 + Math.random() * 1
    nodes.push({
      position: new THREE.Vector3(
        Math.cos(angle) * radius,
        (Math.random() - 0.5) * 4,
        Math.sin(angle) * radius
      ),
      color: COLORS[i % 3],
      frequency: 0.3 + Math.random() * 1.2,
      phase: Math.random() * Math.PI * 2,
      size: 0.1 + Math.random() * 0.06,
      ring: 1,
    })
  }

  // Outer ring - 30 nodes
  for (let i = 0; i < 30; i++) {
    const angle = (i / 30) * Math.PI * 2
    const radius = 10 + Math.random() * 2
    nodes.push({
      position: new THREE.Vector3(
        Math.cos(angle) * radius,
        (Math.random() - 0.5) * 6,
        Math.sin(angle) * radius
      ),
      color: COLORS[i % 3],
      frequency: 0.2 + Math.random() * 0.8,
      phase: Math.random() * Math.PI * 2,
      size: 0.08 + Math.random() * 0.04,
      ring: 2,
    })
  }

  // Scattered - 40 nodes
  for (let i = 0; i < 40; i++) {
    nodes.push({
      position: new THREE.Vector3(
        (Math.random() - 0.5) * 28,
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 28
      ),
      color: COLORS[i % 3],
      frequency: 0.15 + Math.random() * 0.6,
      phase: Math.random() * Math.PI * 2,
      size: 0.06 + Math.random() * 0.03,
      ring: 3,
    })
  }

  return nodes
}

/* ── Neural Network Scene ── */
function NeuralScene({ nodes }: { nodes: NodeData[] }) {
  const groupRef = useRef<THREE.Group>(null)
  const pointsRef = useRef<THREE.Points>(null)
  const linesRef = useRef<THREE.LineSegments>(null)
  const particlesRef = useRef<THREE.Points>(null)
  const timeRef = useRef(0)

  // Create geometry for nodes (points)
  const { positions, colors, sizes } = useMemo(() => {
    const pos = new Float32Array(TOTAL_NODES * 3)
    const col = new Float32Array(TOTAL_NODES * 3)
    const siz = new Float32Array(TOTAL_NODES)

    for (let i = 0; i < TOTAL_NODES; i++) {
      pos[i * 3] = nodes[i].position.x
      pos[i * 3 + 1] = nodes[i].position.y
      pos[i * 3 + 2] = nodes[i].position.z

      const c = new THREE.Color(nodes[i].color)
      col[i * 3] = c.r
      col[i * 3 + 1] = c.g
      col[i * 3 + 2] = c.b

      siz[i] = nodes[i].size * 10 // scale for PointsMaterial size
    }

    return { positions: pos, colors: col, sizes: siz }
  }, [nodes])

  // Connection lines
  const { linePositions, lineColors } = useMemo(() => {
    const lPos: number[] = []
    const lCol: number[] = []

    for (let i = 0; i < TOTAL_NODES; i++) {
      for (let j = i + 1; j < TOTAL_NODES; j++) {
        const dist = nodes[i].position.distanceTo(nodes[j].position)
        if (dist < CONNECTION_DISTANCE) {
          lPos.push(
            nodes[i].position.x, nodes[i].position.y, nodes[i].position.z,
            nodes[j].position.x, nodes[j].position.y, nodes[j].position.z
          )
          const cA = new THREE.Color(nodes[i].color)
          const cB = new THREE.Color(nodes[j].color)
          lCol.push(cA.r, cA.g, cA.b, cB.r, cB.g, cB.b)
        }
      }
    }

    return {
      linePositions: new Float32Array(lPos),
      lineColors: new Float32Array(lCol),
    }
  }, [nodes])

  // Data stream particles
  const PARTICLE_COUNT = 200
  const { particlePositions, particleColors } = useMemo(() => {
    const pPos = new Float32Array(PARTICLE_COUNT * 3)
    const pCol = new Float32Array(PARTICLE_COUNT * 3)

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const nodeA = Math.floor(Math.random() * TOTAL_NODES)
      const nodeB = Math.floor(Math.random() * TOTAL_NODES)
      const t = Math.random()

      const pA = nodes[nodeA]?.position ?? new THREE.Vector3()
      const pB = nodes[nodeB]?.position ?? new THREE.Vector3()

      pPos[i * 3] = pA.x + (pB.x - pA.x) * t
      pPos[i * 3 + 1] = pA.y + (pB.y - pA.y) * t
      pPos[i * 3 + 2] = pA.z + (pB.z - pA.z) * t

      const c = new THREE.Color(COLORS[Math.floor(Math.random() * 3)])
      pCol[i * 3] = c.r
      pCol[i * 3 + 1] = c.g
      pCol[i * 3 + 2] = c.b
    }

    return {
      particlePositions: pPos,
      particleColors: pCol,
    }
  }, [nodes])

  useFrame((_, delta) => {
    timeRef.current += delta

    // Slow rotation
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.03
    }

    // Pulse node sizes
    if (pointsRef.current) {
      const geom = pointsRef.current.geometry
      const sizeAttr = geom.getAttribute('size') as THREE.BufferAttribute
      if (sizeAttr) {
        for (let i = 0; i < TOTAL_NODES; i++) {
          const node = nodes[i]
          const pulse = Math.sin(timeRef.current * node.frequency + node.phase) * 0.5 + 0.5
          sizeAttr.setX(i, node.size * 10 * (0.6 + pulse * 0.8))
        }
        sizeAttr.needsUpdate = true
      }
    }

    // Move particles along connections
    if (particlesRef.current) {
      const geom = particlesRef.current.geometry
      const posAttr = geom.getAttribute('position') as THREE.BufferAttribute

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const nodeA = Math.floor(i * 1.7) % TOTAL_NODES
        const nodeB = Math.floor(i * 2.3 + 7) % TOTAL_NODES
        const speed = 0.1 + (i % 5) * 0.05
        const t = ((timeRef.current * speed + i * 0.37) % 1)

        const pA = nodes[nodeA]?.position ?? new THREE.Vector3()
        const pB = nodes[nodeB]?.position ?? new THREE.Vector3()

        posAttr.setXYZ(
          i,
          pA.x + (pB.x - pA.x) * t,
          pA.y + (pB.y - pA.y) * t,
          pA.z + (pB.z - pA.z) * t
        )
      }
      posAttr.needsUpdate = true
    }
  })

  return (
    <group ref={groupRef}>
      {/* Nodes (points) */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
            count={TOTAL_NODES}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[colors, 3]}
            count={TOTAL_NODES}
          />
          <bufferAttribute
            attach="attributes-size"
            args={[sizes, 1]}
            count={TOTAL_NODES}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.4}
          vertexColors
          transparent
          opacity={0.9}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

      {/* Connection lines */}
      <lineSegments ref={linesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[linePositions, 3]}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[lineColors, 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={0.15}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>

      {/* Data stream particles */}
      <points ref={particlesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[particlePositions, 3]}
            count={PARTICLE_COUNT}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[particleColors, 3]}
            count={PARTICLE_COUNT}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.12}
          vertexColors
          transparent
          opacity={0.6}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
    </group>
  )
}

/* ── Fallback static gradient ── */
function StaticGradientFallback() {
  return (
    <div
      className="absolute inset-0"
      style={{
        background:
          'radial-gradient(ellipse at 50% 40%, #0a1628 0%, #050D1A 50%, #020810 100%)',
      }}
    >
      {/* Simulated node dots */}
      <div className="absolute inset-0 overflow-hidden">
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: `${4 + (i * 7) % 6}px`,
              height: `${4 + (i * 3) % 6}px`,
              left: `${(i * 37 + 13) % 100}%`,
              top: `${(i * 53 + 7) % 100}%`,
              background: COLORS[i % 3],
              opacity: 0.3 + (i * 0.03),
              filter: `blur(${1 + (i % 3)}px)`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

/* ── Main Component ── */
export default function NeuralBackground() {
  const prefersReducedMotion = usePrefersReducedMotion()
  const nodes = useMemo(() => generateNodes(), [])

  if (prefersReducedMotion) {
    return <StaticGradientFallback />
  }

  return (
    <div className="absolute inset-0 -z-10">
      <Canvas
        camera={{ position: [0, 4, 25], fov: 55 }}
        dpr={[1, 1.5]}
        gl={{
          antialias: false,
          alpha: true,
          powerPreference: 'high-performance',
        }}
        style={{ background: 'transparent' }}
      >
        <NeuralScene nodes={nodes} />
      </Canvas>

      {/* Gradient overlays for depth */}
      <div
        className="absolute inset-x-0 top-0 h-40 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, #050D1A 0%, transparent 100%)',
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-40 pointer-events-none"
        style={{
          background: 'linear-gradient(to top, #050D1A 0%, transparent 100%)',
        }}
      />
    </div>
  )
}
