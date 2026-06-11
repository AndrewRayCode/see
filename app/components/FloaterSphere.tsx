/* eslint-disable react-hooks/immutability */
'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'

// Built-in uniforms (modelViewMatrix, projectionMatrix, etc.) and attributes
// (position, normal, uv) are auto-prepended by THREE.ShaderMaterial — do not re-declare.
const vertexShader = `
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec2 vUv;

  void main() {
    vNormal   = normal;
    vUv       = uv;
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// Copyright https://github.com/lighttransport/procedural-eyeball-shader
// Modified: removed precision/built-in declarations, added uOpacity, alpha = line * uOpacity
const fragmentShader = `
  uniform float time;
  uniform float speed;
  uniform vec3  veinColor;
  uniform float veinBrightness;
  uniform vec3  color;
  uniform vec2  resolution;
  uniform sampler2D randomTexture;
  uniform float uOpacity;

  varying vec2 vUv;

  vec3 saturatex(vec3 i) {
    return clamp(i, 0.0, 1.0);
  }
  float saturatex(float i) {
    return clamp(i, 0.0, 1.0);
  }

  vec4 texture2DNearest(sampler2D _tex, vec2 _uv, vec2 _reso) {
    return texture2D(_tex, (floor(_uv * _reso) + 0.5) / _reso);
  }

  float expCurve(float _in, float _lv) {
    return sign(0.5 - _in) * (exp(-abs(_in - 0.5) * _lv) - 1.0) * 0.5 + 0.5;
  }

  vec4 noise(vec2 _uv, vec2 _mul, vec2 _off, float _iter, float _lacu) {
    vec4 sum = vec4(0.0);
    for (float i = 0.0; i < 99.0; i += 1.0) {
      vec2 uv0 = (_uv * _mul + _off) * 0.01 * exp(i * _lacu) + time * speed * i * 0.01;
      vec2 uv1 = ((_uv + vec2(1.0, 0.0)) * _mul + _off) * 0.01 * exp(i * _lacu) + time * speed * i * 0.01;
      vec4 tex0 = texture2D(randomTexture, uv0);
      vec4 tex1 = texture2D(randomTexture, uv1);
      vec4 tex  = mix(tex1, tex0, expCurve(_uv.x, 10.0));
      sum += tex / pow(2.0, i + 1.0);
      if (_iter < i) { break; }
    }
    return sum;
  }

  void main() {
    vec2 uv = mod(vUv.xy / resolution, 1.0);
    uv = mod(uv + vec2(0.5, 0.0), 1.0);

    float line = 0.0;
    for (float i = 0.0; i < 1.5; i += 1.0) {
      vec2 mul = vec2(exp(i * 0.3));
      vec2 off = vec2(i * 423.1);

      float lineL = 1.0 - abs(noise(uv, mul * vec2(2.0, 1.5), off,       2.0, 0.4).x - 0.5) * 2.0;
      float lineS = 1.0 - abs(noise(uv, mul * vec2(14.0),     off + 10.0, 6.0, 0.7).x - 0.5) * 2.0;

      float lineT  = expCurve(pow(lineL, 200.0), 7.0);
      lineT += pow(lineL, 12.0) * expCurve(pow(lineS, 40.0), 10.0);
      lineT  = saturatex(lineT);
      lineT *= expCurve(noise(uv, mul * 7.0, off + 20.0, 6.0, 1.0).x * 0.88, 20.0);

      line += lineT * exp(-i * 0.1);
    }
    line = saturatex(line);

    vec3 col = vec3(0.5) * color;
    col = mix(col, color * 0.8,
      expCurve(noise(uv, vec2(4.0), vec2(40.0), 5.0, 0.7).x * 0.7, 14.0));
    col = mix(col, color * 0.8,
      expCurve(noise(uv, vec2(4.0), vec2(50.0), 5.0, 0.7).x * 0.7,  5.0) * 0.7);
    col = mix(col, veinColor * veinBrightness, line);

    // Transparent everywhere except the floater strands.
    gl_FragColor = vec4(col, line * uOpacity);
  }
`

// How strongly camera rotation delta translates to sphere angular impulse.
const IMPULSE_SCALE = 0.05;
// Exponential decay rate — higher = comes to rest faster (~1 / DAMPING seconds).
const DAMPING = 2.5
// Converts angular velocity magnitude → speed uniform offset on top of base 0.01.
const SPEED_SCALE = 1.0;

export default function FloaterSphere() {
  const { scene } = useThree()

  const noiseTexture = useTexture('/chromatic_noise_diff_1k.jpg')
  noiseTexture.wrapS = THREE.RepeatWrapping
  noiseTexture.wrapT = THREE.RepeatWrapping

  const floaterMesh = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        time:          { value: 0 },
        speed:         { value: 0.01 },
        veinColor:     { value: new THREE.Color(0.08, 0.06, 0.05) },
        veinBrightness:{ value: 2.9 },
        color:         { value: new THREE.Color(0.4, 0.4, 0.4) },
        resolution:    { value: new THREE.Vector2(1, 1) },
        randomTexture: { value: noiseTexture },
        uOpacity:      { value: 0.5 },
      },
      side:        THREE.BackSide,
      transparent: true,
      depthWrite:  false,
    })
    return new THREE.Mesh(new THREE.SphereGeometry(50, 64, 64), mat)
  }, [noiseTexture])

  useEffect(() => {
    scene.add(floaterMesh)
    return () => { scene.remove(floaterMesh) }
  }, [scene, floaterMesh])

  // Spring state — angular velocity and last-seen camera rotation.
  const angVel      = useRef({ x: 0, y: 0 })
  const prevRot     = useRef({ x: 0, y: 0 })
  const initialized = useRef(false)

  useFrame(({ camera, clock }, delta) => {
    // Seed prevRot on the first frame so the initial lerp-in doesn't cause a jerk.
    if (!initialized.current) {
      prevRot.current = { x: camera.rotation.x, y: camera.rotation.y }
      initialized.current = true
    }

    // Angular impulse proportional to how much the camera moved this frame.
    const dX = camera.rotation.x - prevRot.current.x
    const dY = camera.rotation.y - prevRot.current.y
    prevRot.current = { x: camera.rotation.x, y: camera.rotation.y }

    angVel.current.x += dX * IMPULSE_SCALE
    angVel.current.y += dY * IMPULSE_SCALE

    // Exponential decay — frame-rate independent.
    const decay = Math.exp(-DAMPING * delta)
    angVel.current.x *= decay
    angVel.current.y *= decay

    // Apply rotation.
    floaterMesh.rotation.x += angVel.current.x
    floaterMesh.rotation.y += angVel.current.y

    // Drive speed uniform from current momentum magnitude.
    const velMag = Math.sqrt(angVel.current.x ** 2 + angVel.current.y ** 2)
    const mat = floaterMesh.material as THREE.ShaderMaterial
    mat.uniforms.speed.value = 0.01 + velMag * SPEED_SCALE
    mat.uniforms.time.value  = clock.getElapsedTime()

    floaterMesh.position.copy(camera.position)
  })

  return null
}
