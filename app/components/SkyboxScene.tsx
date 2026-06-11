/* eslint-disable react-hooks/immutability */
'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import * as THREE from 'three'
import VisionOverlay from './VisionOverlay'
import FloaterSphere from './FloaterSphere'

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
      target.current.x = (Math.PI / 4 ) + -nx * MAX_ANGLE
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
  { key: 'desatGreen',    label: 'Green Desat',    min: 0, max: 1 },
  { key: 'darken',        label: 'Darken',          min: 0, max: 1 },
  { key: 'desatOverall',  label: 'Overall Desat',   min: 0, max: 1 },
  { key: 'brightness',    label: 'Brightness',      min: 0, max: 1 },
  { key: 'shimmerOpacity',label: 'Shimmer Opacity', min: 0, max: 1 },
] as const

type SliderKey = typeof sliders[number]['key']
type OverlayValues = Record<SliderKey, number>

export default function SkyboxScene() {
  const [canvasKey, setCanvasKey] = useState(0)
  const [values, setValues] = useState<OverlayValues>({
    desatGreen:    0.5,
    darken:        0.1,
    desatOverall:  0.15,
    brightness:    0.13,
    shimmerOpacity:0.05,
  })

  const handleCreated = useCallback(({ gl }: { gl: THREE.WebGLRenderer }) => {
    gl.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      setTimeout(() => setCanvasKey((k) => k + 1), 100)
    })
  }, [])

  const [blinkPhase, setBlinkPhase] = useState<'idle' | 'closing' | 'held' | 'opening'>('idle')
  const heldRef  = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }

  const startBlink = () => {
    if (heldRef.current) return
    heldRef.current = true
    clearTimer()
    setBlinkPhase('closing')
    timerRef.current = setTimeout(() => {
      if (heldRef.current) {
        setBlinkPhase('held')
      } else {
        setBlinkPhase('opening')
        timerRef.current = setTimeout(() => setBlinkPhase('idle'), 60)
      }
    }, 50)
  }

  const endBlinkRef = useRef(() => {});
  // eslint-disable-next-line react-hooks/refs
  endBlinkRef.current = () => {
    if (!heldRef.current) return
    heldRef.current = false
    clearTimer()
    setBlinkPhase('opening')
    timerRef.current = setTimeout(() => setBlinkPhase('idle'), 60)
  }

  useEffect(() => {
    const handler = () => endBlinkRef.current()
    window.addEventListener('mouseup', handler)
    return () => window.removeEventListener('mouseup', handler)
  }, [])

  const set = (key: SliderKey) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues(v => ({ ...v, [key]: parseFloat(e.target.value) }))

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Canvas click area — triggers blink, excludes fixed overlays */}
      <div style={{ width: '100%', height: '100%' }} onMouseDown={startBlink}>
      <Canvas key={canvasKey} camera={{ fov: 75, near: 0.1, far: 1000 }} onCreated={handleCreated}>
        <CameraController />
        <Environment
          files={['/posx.jpg', '/negx.jpg', '/posy.jpg', '/negy.jpg', '/posz.jpg', '/negz.jpg']}
          background
        />
        <FloaterSphere />
        <VisionOverlay {...values} blinkPhase={blinkPhase} />
      </Canvas>
      </div>

      {/* Eye delineation bar */}
      <div style={{
        position: 'fixed',
        top: 10,
        left: 0,
        width: '100%',
        display: 'flex',
        zIndex: 10,
        pointerEvents: 'none',
        userSelect: 'none',
      }}>
        {/* Left eye */}
        <div style={{ width: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingBottom: 6, paddingLeft: 24, paddingRight: 16 }}>
          <span style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace', fontSize: 10, letterSpacing: 2 }}>LEFT EYE</span>
          <div style={{ width: '100%', height: 1, background: 'rgba(255,255,255,0.4)' }} />
        </div>
        {/* Right eye */}
        <div style={{ width: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingBottom: 6, paddingLeft: 16, paddingRight: 24 }}>
          <span style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace', fontSize: 10, letterSpacing: 2 }}>RIGHT EYE</span>
          <div style={{ width: '100%', height: 1, background: 'rgba(255,255,255,0.4)' }} />
        </div>
      </div>

      {process.env.NODE_ENV !== 'production' && (
        <div onClick={e => e.stopPropagation()} style={{
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
      )}
    </div>
  )
}
