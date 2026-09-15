"use client"

import { useEffect, useRef } from "react"

const vertexShader = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const fragmentShader = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec3 uColor;
uniform float uSpeed;
uniform float uScale;
uniform float uRotation;
uniform float uNoiseIntensity;
uniform vec2 uResolution;
uniform vec2 uPointer;

const float e = 2.71828182845904523536;

float noise(vec2 texCoord) {
  float G = e;
  vec2 r = (G * sin(G * texCoord));
  return fract(r.x * r.y * (1.0 + texCoord.x));
}

vec2 rotateUvs(vec2 uv, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  mat2 rot = mat2(c, -s, s, c);
  return rot * uv;
}

void main() {
  float rnd = noise(gl_FragCoord.xy);
  vec2 uv = rotateUvs(vUv * uScale, uRotation);
  vec2 tex = uv * uScale;
  float tOffset = uSpeed * uTime;
  tex.y += 0.03 * sin(8.0 * tex.x - tOffset);

  vec2 pointer = (uPointer - 0.5) * 0.18;
  tex += pointer;

  float pattern = 0.6 +
    0.4 * sin(5.0 * (tex.x + tex.y +
    cos(3.0 * tex.x + 5.0 * tex.y) +
    0.02 * tOffset) +
    sin(20.0 * (tex.x + tex.y - 0.1 * tOffset)));

  float grain = rnd / 15.0 * uNoiseIntensity;
  vec3 result = uColor * pattern - vec3(grain);
  gl_FragColor = vec4(clamp(result, 0.0, 1.0), 1.0);
}
`

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

export function SilkBackground({
  color = "#3d3a78",
  speed = 1.4,
  scale = 1.15,
  noiseIntensity = 1.1,
}: {
  color?: string
  speed?: number
  scale?: number
  noiseIntensity?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      powerPreference: "low-power",
    })
    if (!gl) return

    const vertex = compile(gl, gl.VERTEX_SHADER, vertexShader)
    const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentShader)
    if (!vertex || !fragment) return
    const program = gl.createProgram()
    if (!program) return
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, "position")
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

    const uTime = gl.getUniformLocation(program, "uTime")
    const uColor = gl.getUniformLocation(program, "uColor")
    const uSpeed = gl.getUniformLocation(program, "uSpeed")
    const uScale = gl.getUniformLocation(program, "uScale")
    const uRotation = gl.getUniformLocation(program, "uRotation")
    const uNoise = gl.getUniformLocation(program, "uNoiseIntensity")
    const uResolution = gl.getUniformLocation(program, "uResolution")
    const uPointer = gl.getUniformLocation(program, "uPointer")

    const rgb = color.replace("#", "")
    gl.uniform3f(
      uColor,
      Number.parseInt(rgb.slice(0, 2), 16) / 255,
      Number.parseInt(rgb.slice(2, 4), 16) / 255,
      Number.parseInt(rgb.slice(4, 6), 16) / 255
    )
    gl.uniform1f(uSpeed, reduceMotion ? 0 : speed)
    gl.uniform1f(uScale, scale)
    gl.uniform1f(uRotation, -0.18)
    gl.uniform1f(uNoise, noiseIntensity)

    const pointer = { x: 0.5, y: 0.5 }
    const target = { x: 0.5, y: 0.5 }
    const isTouch = window.matchMedia("(pointer: coarse)").matches
    const onMove = (event: PointerEvent) => {
      if (isTouch) return
      target.x = event.clientX / window.innerWidth
      target.y = 1 - event.clientY / window.innerHeight
    }
    window.addEventListener("pointermove", onMove, { passive: true })

    let frame = 0
    let running = true
    const started = performance.now()
    const isMobile = window.matchMedia("(max-width: 768px)").matches
    const dprCap = isMobile ? 1 : Math.min(1.5, window.devicePixelRatio || 1)

    const resize = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      canvas.width = Math.max(1, Math.floor(width * dprCap))
      canvas.height = Math.max(1, Math.floor(height * dprCap))
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform2f(uResolution, canvas.width, canvas.height)
    }
    resize()
    window.addEventListener("resize", resize)

    const draw = (now: number) => {
      if (!running) return
      if (document.hidden) {
        frame = requestAnimationFrame(draw)
        return
      }
      pointer.x += (target.x - pointer.x) * 0.04
      pointer.y += (target.y - pointer.y) * 0.04
      gl.uniform1f(uTime, reduceMotion ? 0.2 : (now - started) / 1000)
      gl.uniform2f(uPointer, pointer.x, pointer.y)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)

    return () => {
      running = false
      cancelAnimationFrame(frame)
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("resize", resize)
      gl.deleteProgram(program)
    }
  }, [color, noiseIntensity, scale, speed])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  )
}
