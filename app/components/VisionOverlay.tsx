/* eslint-disable react-hooks/immutability */
'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'

const vertexShader = `
  varying vec2 vUv;
  varying vec4 vClipPos;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vClipPos = gl_Position;
  }
`

const fragmentShader = `
  uniform sampler2D uTexture;
  uniform sampler2D uBackground;
  uniform float uTime;
  uniform float uDesatGreen;
  uniform float uDarken;
  uniform float uDesatOverall;
  uniform float uFadeWidth;
  uniform float uBrightness;
  uniform float uShimmerOpacity;
  uniform float uBlinkFade;

  varying vec2 vUv;
  varying vec4 vClipPos;

  vec3 desaturate(vec3 color, float factor) {
    vec3 grayScale = vec3(dot(color, vec3(0.299, 0.587, 0.114)));
    return mix(color, grayScale, factor);
  }

  void main() {
    vec2 ndc = vClipPos.xy / vClipPos.w;
    vec2 bgUV = ndc * 0.5 + 0.5;
    vec3 bgCol = mix(texture2D(uBackground, bgUV).rgb, vec3(0.0), uBlinkFade);

    float lum = dot(bgCol, vec3(0.299, 0.587, 0.114));
    bgCol.g = mix(bgCol.g, lum, uDesatGreen);

    bgCol = desaturate(bgCol, uDesatOverall);

    bgCol *= (1.0 - uDarken);

    vec4 blob = texture2D(uTexture, vUv);
    vec3 final = mix(bgCol, blob.rgb + uBrightness, blob.a);

    // Shimmer: radial gradient (bright centre → dark edge) oscillating at ~10 Hz.
    float dist = length(vUv - vec2(0.32, 0.5));
    float shimGrad = max(0.0, 1.0 - dist / 0.3);
    shimGrad = shimGrad * shimGrad;
    float flicker = sin(uTime * 62.832); // 2π × 10 Hz
    final = clamp(final + vec3(flicker * shimGrad * uShimmerOpacity), 0.0, 1.0);

    // Fade out toward the right edge so there's no hard cut at screen centre.
    float fadeAlpha = 1.0 - smoothstep(1.0 - uFadeWidth, 1.0, vUv.x);
    gl_FragColor = vec4(final, blob.a * fadeAlpha);
  }
`

// Eyelid curtain — transparent at the moving bottom edge (vUv.y = 0), solid at top (vUv.y = 1).
const blinkVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const blinkFragmentShader = `
  varying vec2 vUv;
  void main() {
    float alpha = smoothstep(0.0, 0.2, vUv.y);
    gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
  }
`

type BlinkPhase = 'idle' | 'closing' | 'held' | 'opening'
type OverlayProps = { desatGreen: number; darken: number; desatOverall: number; brightness: number; shimmerOpacity: number; blinkPhase: BlinkPhase }

const CLOSE_DUR = 0.05
const OPEN_DUR  = 0.06

export default function VisionOverlay({ desatGreen, darken, desatOverall, brightness, shimmerOpacity, blinkPhase }: OverlayProps) {
  const texture = useTexture('/Azoor-Blobs.png')

  const vals = useRef({ desatGreen, darken, desatOverall, brightness, shimmerOpacity, blinkPhase });
  useEffect(() => {
    vals.current = { desatGreen, darken, desatOverall, brightness, shimmerOpacity, blinkPhase }
  }, [desatGreen, darken, desatOverall, brightness, shimmerOpacity, blinkPhase]);

  // Spring state for light-sensitivity effects driven by blink transitions.
  const prevPhase      = useRef<BlinkPhase>('idle')
  const shimmerSpring  = useRef({ value: shimmerOpacity, target: shimmerOpacity })
  const shimmerBoosted = useRef(false)
  const shimmerTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const brightnessSpring = useRef({ value: brightness, target: brightness })
  const brightnessK    = useRef(6) // fast by default; slows after an opening spike

  // Blink animation state — driven by clock time, not React state, for frame accuracy.
  const blinkPhaseStart = useRef(0)
  const blinkProgress   = useRef(0) // 0 = open, 1.25 = fully closed

  const overlayScene  = useMemo(() => new THREE.Scene(), [])
  const overlayCamera = useMemo(() => {
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
    cam.position.z = 5
    return cam
  }, [])
  const renderTarget = useMemo(() => new THREE.WebGLRenderTarget(1, 1), [])

  // Eyelid mesh — renderOrder 0 so the shimmer mesh (order 1) draws on top of it.
  const blinkMesh = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: blinkVertexShader,
      fragmentShader: blinkFragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
    mesh.renderOrder = 0
    mesh.visible = false
    return mesh
  }, [])

  const overlayMesh = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTexture:        { value: null as THREE.Texture | null },
        uBackground:     { value: null as THREE.Texture | null },
        uTime:           { value: 0 },
        uDesatGreen:     { value: 0.5 },
        uDarken:         { value: 0.1 },
        uDesatOverall:   { value: 0.15 },
        uFadeWidth:      { value: 0.05 },
        uBrightness:     { value: 0.05 },
        uShimmerOpacity: { value: 0.15 },
        uBlinkFade:      { value: 0 },
      },
      transparent: true,
      depthTest: false,
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
    mesh.renderOrder = 1
    return mesh
  }, [])

  useEffect(() => {
    overlayScene.add(blinkMesh)
    overlayScene.add(overlayMesh)
    return () => {
      overlayScene.remove(blinkMesh)
      overlayScene.remove(overlayMesh)
    }
  }, [overlayScene, blinkMesh, overlayMesh])

  useFrame(({ gl, scene, camera, size, clock }, delta) => {
    const mat = overlayMesh.material as THREE.ShaderMaterial;
    // @ts-expect-error unknown image type
    const imgW = texture.image?.naturalWidth  ?? texture.image?.width  ?? 1
    // @ts-expect-error unknown image type
    const imgH = texture.image?.naturalHeight ?? texture.image?.height ?? 1
    const planeW = size.height * (imgW / imgH)

    if (renderTarget.width !== size.width || renderTarget.height !== size.height) {
      renderTarget.setSize(size.width, size.height)
    }
    overlayCamera.left   = -size.width  / 2
    overlayCamera.right  =  size.width  / 2
    overlayCamera.top    =  size.height / 2
    overlayCamera.bottom = -size.height / 2
    overlayCamera.updateProjectionMatrix()

    overlayMesh.scale.set(planeW, size.height, 1)
    overlayMesh.position.set(-size.width / 4, 0, 0)

    // Blink phase transition detection → drive light-sensitivity springs.
    const phase = vals.current.blinkPhase
    const now = clock.getElapsedTime()
    if (phase !== prevPhase.current) {
      prevPhase.current = phase
      blinkPhaseStart.current = now

      if (phase === 'closing') {
        shimmerBoosted.current = true
        shimmerSpring.current.target = 0.8
        if (shimmerTimer.current) clearTimeout(shimmerTimer.current)
        shimmerTimer.current = setTimeout(() => { shimmerBoosted.current = false }, 500)
      }

      if (phase === 'opening') {

        brightnessSpring.current.value  = 0
        brightnessSpring.current.target = vals.current.brightness
        brightnessK.current = 1.2
      }
    }

    // Blink eyelid animation: top-anchored curtain descending from screen top.
    // progress 0 = open, 1.25 = fully closed (matches CSS scaleY(1.25) overshoot).
    const elapsed = now - blinkPhaseStart.current
    if (phase === 'closing') {
      const t = Math.min(elapsed / CLOSE_DUR, 1)
      blinkProgress.current = (t * t) * 1.25                    // ease-in
    } else if (phase === 'held') {
      blinkProgress.current = 1.25
    } else if (phase === 'opening') {
      const t = Math.min(elapsed / OPEN_DUR, 1)
      blinkProgress.current = 1.25 * (1 - t * (2 - t))          // ease-out: 1.25 → 0
    } else {
      blinkProgress.current = 0
    }

    const bp = blinkProgress.current
    blinkMesh.visible = bp > 0.001
    if (bp > 0.001) {
      // Top edge stays fixed at size.height/2; bottom edge descends as bp increases.
      blinkMesh.scale.set(size.width, bp * size.height, 1)
      blinkMesh.position.set(0, size.height / 2 * (1 - bp), 0)
    }

    // Keep spring targets synced with slider values when not event-overridden.
    if (!shimmerBoosted.current) shimmerSpring.current.target = vals.current.shimmerOpacity
    brightnessSpring.current.target = vals.current.brightness

    // Exponential spring physics (frame-rate independent).
    shimmerSpring.current.value    += (shimmerSpring.current.target    - shimmerSpring.current.value)    * (1 - Math.exp(-4 * delta))
    brightnessSpring.current.value += (brightnessSpring.current.target - brightnessSpring.current.value) * (1 - Math.exp(-brightnessK.current * delta))

    // Restore fast brightness tracking once the slow spring has settled.
    if (brightnessK.current < 1 && Math.abs(brightnessSpring.current.value - vals.current.brightness) < 0.005) {
      brightnessK.current = 6
    }

    mat.uniforms.uTexture.value        = texture
    mat.uniforms.uBackground.value     = renderTarget.texture
    mat.uniforms.uTime.value           = now
    mat.uniforms.uDesatGreen.value     = vals.current.desatGreen
    mat.uniforms.uDarken.value         = vals.current.darken
    mat.uniforms.uDesatOverall.value   = vals.current.desatOverall
    mat.uniforms.uFadeWidth.value      = 0.2
    mat.uniforms.uBrightness.value     = brightnessSpring.current.value
    mat.uniforms.uShimmerOpacity.value = shimmerSpring.current.value
    mat.uniforms.uBlinkFade.value      = Math.min(blinkProgress.current, 1.0)

    gl.setRenderTarget(renderTarget)
    gl.render(scene, camera)
    gl.setRenderTarget(null)

    gl.render(scene, camera)
    gl.autoClear = false
    gl.clearDepth()
    gl.render(overlayScene, overlayCamera)
    gl.autoClear = true
  }, 1)

  return null
}
