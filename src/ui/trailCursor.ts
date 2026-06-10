/**
 * Site-wide cursor smoke trail.
 *
 * A low-resolution ping-pong WebGL buffer accumulates "mist" stamped at the
 * pointer each frame (intensity follows speed), fades it, and drifts it with
 * procedural curl-ish noise — then composites as a soft white wisp over the
 * page. Original implementation of the effect seen on the reference site.
 */
const UPDATE_FRAG = `
precision mediump float;
uniform sampler2D uPrev;
uniform vec2 uRes;
uniform vec2 uMouse;
uniform vec2 uVelocity;
uniform float uTime;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  vec2 aspect = vec2(uRes.x / uRes.y, 1.0);

  // gentle curl-ish drift: rotated gradient of a slowly evolving noise field
  float n1 = noise(vUv * 5.0 + vec2(uTime * 0.07, uTime * 0.045));
  float n2 = noise(vUv * 5.0 + vec2(31.4, 17.3) - uTime * 0.06);
  vec2 drift = (vec2(n1, n2) - 0.5) * 0.0035;
  drift.y += 0.0007; // mist rises slightly

  float prev = texture2D(uPrev, vUv - drift).r;

  // soft stamp at the pointer, sized in aspect-corrected uv space
  vec2 d = (vUv - uMouse) * aspect;
  float speed = clamp(length(uVelocity) * 14.0, 0.0, 1.0);
  float stamp = exp(-dot(d, d) * 900.0) * speed * 0.5;

  float value = prev * 0.962 + stamp;
  gl_FragColor = vec4(vec3(clamp(value, 0.0, 1.0)), 1.0);
}
`;

const DRAW_FRAG = `
precision mediump float;
uniform sampler2D uTex;
varying vec2 vUv;

void main() {
  float v = texture2D(uTex, vUv).r;
  float alpha = smoothstep(0.02, 0.55, v) * 0.5;
  // cool grey rim blending to a white core, like mist on the off-white page
  vec3 color = mix(vec3(0.72, 0.74, 0.84), vec3(1.0), smoothstep(0.1, 0.7, v));
  gl_FragColor = vec4(color, alpha);
}
`;

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const SIM_DOWNSCALE = 4;

export class TrailCursor {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext;
  private readonly updateProgram: WebGLProgram;
  private readonly drawProgram: WebGLProgram;
  private targets: Array<{ fb: WebGLFramebuffer; tex: WebGLTexture }> = [];
  private current = 0;

  private mouse = { x: 0.5, y: 0.5 };
  private lastMouse = { x: 0.5, y: 0.5 };
  private velocity = { x: 0, y: 0 };
  private hasPointer = false;
  private energy = 0;
  private rafId = 0;
  private startTime = performance.now();

  static create(): TrailCursor | null {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
    if (window.matchMedia('(pointer: coarse)').matches) return null;
    try {
      return new TrailCursor();
    } catch {
      return null; // WebGL unavailable: the site simply has no trail
    }
  }

  private constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'trail-canvas';
    document.body.appendChild(this.canvas);

    const gl = this.canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      depth: false,
      stencil: false,
      antialias: false,
    });
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl;

    this.updateProgram = this.createProgram(VERT, UPDATE_FRAG);
    this.drawProgram = this.createProgram(VERT, DRAW_FRAG);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]), // fullscreen triangle
      gl.STATIC_DRAW,
    );

    this.resize();
    this.bind();
    this.rafId = requestAnimationFrame(this.loop);
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.canvas.remove();
  }

  private bind(): void {
    window.addEventListener('pointermove', (event) => {
      this.mouse = {
        x: event.clientX / window.innerWidth,
        y: 1 - event.clientY / window.innerHeight,
      };
      if (!this.hasPointer) {
        this.lastMouse = { ...this.mouse };
        this.hasPointer = true;
      }
    });

    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    const w = Math.max(1, Math.floor(window.innerWidth / SIM_DOWNSCALE));
    const h = Math.max(1, Math.floor(window.innerHeight / SIM_DOWNSCALE));
    this.canvas.width = w;
    this.canvas.height = h;

    const gl = this.gl;
    for (const target of this.targets) {
      gl.deleteFramebuffer(target.fb);
      gl.deleteTexture(target.tex);
    }
    this.targets = [0, 1].map(() => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return { fb, tex };
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private readonly loop = (): void => {
    this.velocity = {
      x: this.mouse.x - this.lastMouse.x,
      y: this.mouse.y - this.lastMouse.y,
    };
    this.lastMouse = { ...this.mouse };

    const speed = Math.hypot(this.velocity.x, this.velocity.y);
    this.energy = Math.max(this.energy * 0.97, Math.min(speed * 20, 1));

    // skip all GPU work once the mist has fully faded and the pointer rests
    if (this.energy > 0.003) {
      this.step();
    }
    this.rafId = requestAnimationFrame(this.loop);
  };

  private step(): void {
    const gl = this.gl;
    const src = this.targets[this.current];
    const dst = this.targets[1 - this.current];
    const time = (performance.now() - this.startTime) / 1000;

    // update pass (ping-pong)
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.updateProgram);
    this.setUniforms(this.updateProgram, src.tex, time);
    this.drawTriangle(this.updateProgram);

    // composite pass to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.drawProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dst.tex);
    gl.uniform1i(gl.getUniformLocation(this.drawProgram, 'uTex'), 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.drawTriangle(this.drawProgram);

    this.current = 1 - this.current;
  }

  private setUniforms(program: WebGLProgram, tex: WebGLTexture, time: number): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(gl.getUniformLocation(program, 'uPrev'), 0);
    gl.uniform2f(gl.getUniformLocation(program, 'uRes'), this.canvas.width, this.canvas.height);
    gl.uniform2f(gl.getUniformLocation(program, 'uMouse'), this.mouse.x, this.mouse.y);
    gl.uniform2f(gl.getUniformLocation(program, 'uVelocity'), this.velocity.x, this.velocity.y);
    gl.uniform1f(gl.getUniformLocation(program, 'uTime'), time);
  }

  private drawTriangle(program: WebGLProgram): void {
    const gl = this.gl;
    const loc = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private createProgram(vertSrc: string, fragSrc: string): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, source: string): WebGLShader => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) ?? 'shader compile failed');
      }
      return shader;
    };

    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertSrc));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? 'program link failed');
    }
    return program;
  }
}
