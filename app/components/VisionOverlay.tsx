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

  varying vec2 vUv;
  varying vec4 vClipPos;

  void main() {
    vec2 ndc = vClipPos.xy / vClipPos.w;
    vec2 bgUV = ndc * 0.5 + 0.5;
    vec3 col = texture2D(uBackground, bgUV).rgb;

    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col.g = mix(col.g, lum, uDesatGreen);

    float gray = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(gray), uDesatOverall);

    col *= (1.0 - uDarken);

    vec4 blob = texture2D(uTexture, vUv);
    gl_FragColor = vec4(mix(col, blob.rgb, blob.a), 1.0);
  }
`

type OverlayProps = { desatGreen: number; darken: number; desatOverall: number }

export default function VisionOverlay({ desatGreen, darken, desatOverall }: OverlayProps) {
  const texture = useTexture('/Azoor-Blobs.png')

  // Ref is always current — no stale closure possible in useFrame.
  const vals = useRef({ desatGreen, darken, desatOverall })
  vals.current = { desatGreen, darken, desatOverall }

  const overlayScene  = useMemo(() => new THREE.Scene(), [])
  const overlayCamera = useMemo(() => {
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
    cam.position.z = 5
    return cam
  }, [])
  const renderTarget  = useMemo(() => new THREE.WebGLRenderTarget(1, 1), [])

  // Build the mesh imperatively — no R3F reconciler involved.
  const overlayMesh = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTexture:     { value: null as THREE.Texture | null },
        uBackground:  { value: null as THREE.Texture | null },
        uTime:        { value: 0 },
        uDesatGreen:  { value: 0.5 },
        uDarken:      { value: 0.1 },
        uDesatOverall:{ value: 0.15 },
      },
      depthTest: false,
    })
    return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
  }, [])

  useEffect(() => {
    overlayScene.add(overlayMesh)
    return () => { overlayScene.remove(overlayMesh) }
  }, [overlayScene, overlayMesh])

  useFrame(({ gl, scene, camera, size, clock }) => {
    const mat = overlayMesh.material as THREE.ShaderMaterial
    const imgW = texture.image?.naturalWidth  ?? texture.image?.width  ?? 1
    const imgH = texture.image?.naturalHeight ?? texture.image?.height ?? 1
    const planeW = size.height * (imgW / imgH)

    // Sync render target and orthographic camera to current viewport.
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

    // Update uniforms directly on the material — guaranteed fresh every frame.
    mat.uniforms.uTexture.value      = texture
    mat.uniforms.uBackground.value   = renderTarget.texture
    mat.uniforms.uTime.value         = clock.getElapsedTime()
    mat.uniforms.uDesatGreen.value   = vals.current.desatGreen
    mat.uniforms.uDarken.value       = vals.current.darken
    mat.uniforms.uDesatOverall.value = vals.current.desatOverall

    // Capture main scene → render target (for background sampling).
    gl.setRenderTarget(renderTarget)
    gl.render(scene, camera)
    gl.setRenderTarget(null)

    // Draw main scene to screen, then overlay on top.
    gl.render(scene, camera)
    gl.autoClear = false
    gl.clearDepth()
    gl.render(overlayScene, overlayCamera)
    gl.autoClear = true
  }, 1)

  return null
}
