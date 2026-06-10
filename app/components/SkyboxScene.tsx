'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import * as THREE from 'three'
import VisionOverlay from './VisionOverlay'

const MAX_ANGLE = 15 * (Math.PI / 180)
const LERP = 0.06

function CameraController() {
  const { camera } = useThree()
  const target = useRef({ x: 0, y: 0 })

  useEffect(() => {
    camera.rotation.order = 'YXZ'

    const onMouseMove = (e: MouseEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1
      const ny = (e.clientY / window.innerHeight) * 2 - 1
      target.current.x = -nx * MAX_ANGLE
      target.current.y = -ny * MAX_ANGLE
    }

    window.addEventListener('mousemove', onMouseMove)
    return () => window.removeEventListener('mousemove', onMouseMove)
  }, [camera])

  useFrame(() => {
    camera.rotation.y = THREE.MathUtils.lerp(camera.rotation.y, target.current.x, LERP)
    camera.rotation.x = THREE.MathUtils.lerp(camera.rotation.x, target.current.y, LERP)
  })

  return null
}

const sliders = [
  { key: 'desatGreen',  label: 'Green Desat',   min: 0, max: 1 },
  { key: 'darken',      label: 'Darken',         min: 0, max: 1 },
  { key: 'desatOverall',label: 'Overall Desat',  min: 0, max: 1 },
] as const

type SliderKey = typeof sliders[number]['key']
type OverlayValues = Record<SliderKey, number>

export default function SkyboxScene() {
  const [canvasKey, setCanvasKey] = useState(0)
  const [values, setValues] = useState<OverlayValues>({
    desatGreen:   0.5,
    darken:       0.1,
    desatOverall: 0.15,
  })

  const handleCreated = useCallback(({ gl }: { gl: THREE.WebGLRenderer }) => {
    gl.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      setTimeout(() => setCanvasKey((k) => k + 1), 100)
    })
  }, [])

  const set = (key: SliderKey) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues(v => ({ ...v, [key]: parseFloat(e.target.value) }))

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <Canvas key={canvasKey} camera={{ fov: 75, near: 0.1, far: 1000 }} onCreated={handleCreated}>
        <CameraController />
        <Environment
          files={['/posx.jpg', '/negx.jpg', '/posy.jpg', '/negy.jpg', '/posz.jpg', '/negz.jpg']}
          background
        />
        <VisionOverlay {...values} />
      </Canvas>

      <div style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        background: 'rgba(0,0,0,0.72)',
        color: '#fff',
        padding: '12px 16px',
        borderRadius: 8,
        fontFamily: 'monospace',
        fontSize: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 10,
        minWidth: 210,
        userSelect: 'none',
      }}>
        <span style={{ fontWeight: 'bold', letterSpacing: 1 }}>VISION DEBUG</span>
        {sliders.map(({ key, label, min, max }) => (
          <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span>{label}: {values[key].toFixed(2)}</span>
            <input
              type="range"
              min={min} max={max} step={0.01}
              value={values[key]}
              onChange={set(key)}
              style={{ width: '100%', accentColor: '#7df' }}
            />
          </label>
        ))}
      </div>
    </div>
  )
}
