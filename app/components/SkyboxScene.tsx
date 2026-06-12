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

// UV coordinate on the blob texture where the central vision marker sits.
// Adjust these to move the dot to the correct spot on the image.
const MARKER_UV = { x: 0.32, y: 0.5 }

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

  // Track viewport size and blob image aspect ratio so the marker stays
  // anchored to the same UV coordinate on the overlay texture.
  const [vp, setVp] = useState({ w: 0, h: 0 })
  const [blobAspect, setBlobAspect] = useState(1)
  useEffect(() => {
    setVp({ w: window.innerWidth, h: window.innerHeight })
    const img = new Image()
    img.onload = () => setBlobAspect(img.naturalWidth / img.naturalHeight)
    img.src = '/Azoor-Blobs.png'
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const [values, setValues] = useState<OverlayValues>({
    desatGreen:    0.5,
    darken:        0.1,
    desatOverall:  0.3,
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

  const endBlinkRef = useRef(() => {})
  // eslint-disable-next-line react-hooks/refs
  endBlinkRef.current = () => {
    if (!heldRef.current) return
    heldRef.current = false
    clearTimer()
    setBlinkPhase('opening')
    timerRef.current = setTimeout(() => setBlinkPhase('idle'), 60)
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (e.button === 0) endBlinkRef.current() }
    window.addEventListener('mouseup', handler)
    return () => window.removeEventListener('mouseup', handler)
  }, [])

  // Right eye — same phase machine, driven by right-click hold.
  const [rightBlinkPhase, setRightBlinkPhase] = useState<'idle' | 'closing' | 'held' | 'opening'>('idle')
  const rightHeldRef  = useRef(false)
  const rightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearRightTimer = () => {
    if (rightTimerRef.current) { clearTimeout(rightTimerRef.current); rightTimerRef.current = null }
  }

  const startRightBlink = () => {
    if (rightHeldRef.current) return
    rightHeldRef.current = true
    clearRightTimer()
    setRightBlinkPhase('closing')
    rightTimerRef.current = setTimeout(() => {
      if (rightHeldRef.current) {
        setRightBlinkPhase('held')
      } else {
        setRightBlinkPhase('opening')
        rightTimerRef.current = setTimeout(() => setRightBlinkPhase('idle'), 60)
      }
    }, 50)
  }

  const endRightBlinkRef = useRef(() => {})
  // eslint-disable-next-line react-hooks/refs
  endRightBlinkRef.current = () => {
    if (!rightHeldRef.current) return
    rightHeldRef.current = false
    clearRightTimer()
    setRightBlinkPhase('opening')
    rightTimerRef.current = setTimeout(() => setRightBlinkPhase('idle'), 60)
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (e.button === 2) endRightBlinkRef.current() }
    window.addEventListener('mouseup', handler)
    return () => window.removeEventListener('mouseup', handler)
  }, [])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) startBlink()
    if (e.button === 2) startRightBlink()
  }

  const set = (key: SliderKey) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues(v => ({ ...v, [key]: parseFloat(e.target.value) }))

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Canvas click area — left click = left blink, right click = right blink */}
      <div style={{ width: '100%', height: '100%' }} onMouseDown={handleMouseDown} onContextMenu={e => e.preventDefault()}>
      <Canvas key={canvasKey} camera={{ fov: 75, near: 0.1, far: 1000 }} onCreated={handleCreated}>
        <CameraController />
        <Environment
          files={['/posx.jpg', '/negx.jpg', '/posy.jpg', '/negy.jpg', '/posz.jpg', '/negz.jpg']}
          background
        />
        <FloaterSphere />
        <VisionOverlay {...values} blinkPhase={blinkPhase} rightBlinkPhase={rightBlinkPhase} />
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

      {/* Central vision marker — pinned to MARKER_UV on the blob texture */}
      {vp.w > 0 && (() => {
        // Mirror the plane sizing from VisionOverlay: full height, aspect-correct width,
        // centred at 25% of the viewport (left quarter of screen).
        const planeW  = vp.h * blobAspect
        const markerX = vp.w / 4 + planeW * (MARKER_UV.x - 0.5)
        // Three.js UV y=0 is bottom; CSS y=0 is top.
        const markerY = (1 - MARKER_UV.y) * vp.h
        return (
          <div style={{
            position: 'fixed',
            left: markerX,
            top: markerY,
            transform: 'translate(600%, 85%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            pointerEvents: 'none',
            userSelect: 'none',
            zIndex: 10,
            opacity: 0.5,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.7)' }} />
            <span style={{ color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace', fontSize: 10, letterSpacing: 1 }}>CENTRAL<br />VISION</span>
          </div>
        )
      })()}

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
