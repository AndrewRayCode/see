'use client'
import { useLayoutEffect, useMemo } from 'react'
import { createPortal, useFrame, useThree } from '@react-three/fiber'
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

  varying vec2 vUv;
  varying vec4 vClipPos;

  void main() {
    vec2 ndc = vClipPos.xy / vClipPos.w;
    vec2 bgUV = ndc * 0.5 + 0.5;
    vec3 col = texture2D(uBackground, bgUV).rgb;

    // Green desaturation
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col.g = mix(col.g, lum, uDesatGreen);

    // Overall desaturation
    float gray = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(gray), uDesatOverall);

    // Darkening
    col *= (1.0 - uDarken);

    // Blob on top
    vec4 blob = texture2D(uTexture, vUv);
    gl_FragColor = vec4(mix(col, blob.rgb, blob.a), 1.0);
  }
`

type OverlayUniforms = {
  uTexture:     { value: THREE.Texture | null }
  uBackground:  { value: THREE.Texture | null }
  uTime:        { value: number }
  uDesatGreen:  { value: number }
  uDarken:      { value: number }
  uDesatOverall:{ value: number }
}

// Mesh lives inside createPortal; receives the stable uniforms object from parent.
function OverlayMesh({ uniforms }: { uniforms: OverlayUniforms }) {
  const { size } = useThree()
  const texture = useTexture('/Azoor-Blobs.png')

  // Wire texture into the shared uniforms object once loaded.
  useLayoutEffect(() => {
    uniforms.uTexture.value = texture
  }, [texture, uniforms])

  const { planeW, planeH } = useMemo(() => {
    const imgW = texture.image?.naturalWidth  ?? texture.image?.width  ?? 1
    const imgH = texture.image?.naturalHeight ?? texture.image?.height ?? 1
    return { planeW: size.height * (imgW / imgH), planeH: size.height }
  }, [texture, size.height])

  return (
    <mesh position={[-size.width / 4, 0, 0]}>
      <planeGeometry args={[planeW, planeH]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthTest={false}
      />
    </mesh>
  )
}

type OverlayProps = {
  desatGreen:   number
  darken:       number
  desatOverall: number
}

export default function VisionOverlay({ desatGreen, darken, desatOverall }: OverlayProps) {
  const { gl, scene, camera, size } = useThree()

  const overlayScene = useMemo(() => new THREE.Scene(), [])

  const renderTarget = useMemo(
    () => new THREE.WebGLRenderTarget(size.width, size.height),
    [size.width, size.height]
  )

  const overlayCamera = useMemo(() => {
    const cam = new THREE.OrthographicCamera(
      -size.width / 2,  size.width / 2,
       size.height / 2, -size.height / 2,
      0.1, 10
    )
    cam.position.z = 5
    return cam
  }, [size.width, size.height])

  // Uniforms live here (not inside the portal) so updates from props are reliable.
  const uniforms = useMemo<OverlayUniforms>(() => ({
    uTexture:     { value: null },
    uBackground:  { value: renderTarget.texture },
    uTime:        { value: 0 },
    uDesatGreen:  { value: desatGreen },
    uDarken:      { value: darken },
    uDesatOverall:{ value: desatOverall },
  }), [renderTarget]) // intentionally excludes slider values — they're updated every frame below

  useFrame(({ clock }) => {
    // Update slider-driven values every frame from the latest closure.
    uniforms.uBackground.value  = renderTarget.texture
    uniforms.uDesatGreen.value  = desatGreen
    uniforms.uDarken.value      = darken
    uniforms.uDesatOverall.value = desatOverall
    uniforms.uTime.value        = clock.getElapsedTime()

    // Capture main scene to render target so the shader can sample it.
    gl.setRenderTarget(renderTarget)
    gl.render(scene, camera)
    gl.setRenderTarget(null)

    // Draw main scene to screen.
    gl.render(scene, camera)

    // Draw overlay on top.
    gl.autoClear = false
    gl.clearDepth()
    gl.render(overlayScene, overlayCamera)
    gl.autoClear = true
  }, 1)

  return createPortal(<OverlayMesh uniforms={uniforms} />, overlayScene)
}
