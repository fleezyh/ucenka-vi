(() => {
  "use strict";

  const canvas = document.createElement("canvas");
  canvas.className = "flowCanvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);

  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "low-power"
  });
  if (!gl) return;

  const vertexSource = `
    attribute vec2 a_position;
    void main(){ gl_Position = vec4(a_position, 0.0, 1.0); }
  `;

  const fragmentSource = `
    precision mediump float;
    uniform vec2 u_resolution;
    uniform vec2 u_pointer;
    uniform float u_time;

    float hash(vec2 p){
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float noise(vec2 p){
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }

    float fbm(vec2 p){
      float value = 0.0;
      float amplitude = 0.52;
      mat2 turn = mat2(0.80, -0.60, 0.60, 0.80);
      for(int i = 0; i < 5; i++){
        value += amplitude * noise(p);
        p = turn * p * 2.02 + 11.7;
        amplitude *= 0.50;
      }
      return value;
    }

    void main(){
      vec2 uv = gl_FragCoord.xy / u_resolution.xy;
      vec2 p = uv - 0.5;
      p.x *= u_resolution.x / u_resolution.y;
      float t = u_time * 0.115;

      vec2 q = vec2(
        fbm(p * 1.25 + vec2(t, -t * 0.54)),
        fbm(p * 1.25 + vec2(-t * 0.42, t * 0.72) + 4.7)
      );
      vec2 pointer = (u_pointer - 0.5) * vec2(0.24, 0.14);
      vec2 warped = p + (q - 0.5) * 1.18 + pointer;
      float flow = fbm(warped * 1.42 + vec2(-t * 0.65, t * 0.38));
      float folds = fbm(warped * 2.15 - q * 0.86 + vec2(t * 0.28, -t * 0.22));

      vec2 redCenter = vec2(-0.38 + 0.24 * sin(t * 1.35), 0.17 + 0.16 * cos(t * 0.91));
      vec2 coralCenter = vec2(0.34 + 0.28 * cos(t * 0.78), -0.12 + 0.20 * sin(t * 1.12));
      float redBlob = 1.0 - smoothstep(0.18, 1.12, length(warped - redCenter));
      float coralBlob = 1.0 - smoothstep(0.12, 0.88, length(warped - coralCenter));

      vec3 blackCherry = vec3(0.030, 0.014, 0.026);
      vec3 burgundy = vec3(0.28, 0.040, 0.080);
      vec3 mutedRed = vec3(0.66, 0.12, 0.18);
      vec3 coral = vec3(0.94, 0.38, 0.34);
      vec3 roseLight = vec3(1.00, 0.68, 0.58);
      vec3 dustyViolet = vec3(0.20, 0.095, 0.34);
      vec3 warmAmber = vec3(0.78, 0.43, 0.17);

      vec3 color = mix(blackCherry, dustyViolet, smoothstep(0.22, 0.82, q.y) * 0.88);
      color = mix(color, burgundy, smoothstep(0.24, 0.74, flow) * 0.82);
      color = mix(color, mutedRed, redBlob * (0.54 + 0.40 * flow));
      color = mix(color, coral, coralBlob * smoothstep(0.22, 0.82, folds) * 0.86);
      float amberField = smoothstep(0.56, 0.90, q.x * 0.72 + folds * 0.46) * (1.0 - coralBlob * 0.55);
      color = mix(color, warmAmber, amberField * 0.42);
      float highlight = smoothstep(0.64, 0.91, flow * 0.62 + folds * 0.48 + coralBlob * 0.34);
      color = mix(color, roseLight, highlight * 0.48);

      float vignette = smoothstep(1.15, 0.20, length(p * vec2(0.72, 0.90)));
      color *= mix(0.48, 1.06, vignette);
      float grain = hash(gl_FragCoord.xy + fract(u_time) * 813.7) - 0.5;
      color += grain * 0.045;
      color = pow(max(color, 0.0), vec3(0.94));
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn("Flow background shader error", gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  };

  const vertex = compile(gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) return;

  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const resolution = gl.getUniformLocation(program, "u_resolution");
  const pointerUniform = gl.getUniformLocation(program, "u_pointer");
  const timeUniform = gl.getUniformLocation(program, "u_time");
  const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let raf = 0;
  let last = 0;

  const resize = () => {
    const mobile = innerWidth < 700;
    const scale = Math.min(devicePixelRatio || 1, mobile ? 0.8 : 1.05);
    const width = Math.max(1, Math.round(innerWidth * scale));
    const height = Math.max(1, Math.round(innerHeight * scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  };

  const draw = (now) => {
    const fps = innerWidth < 700 ? 30 : 45;
    if (now - last >= 1000 / fps || !last) {
      pointer.x += (pointer.tx - pointer.x) * 0.035;
      pointer.y += (pointer.ty - pointer.y) * 0.035;
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform2f(pointerUniform, pointer.x, pointer.y);
      gl.uniform1f(timeUniform, reduced ? 18.0 : now / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      last = now;
    }
    if (!reduced) raf = requestAnimationFrame(draw);
  };

  addEventListener("pointermove", (event) => {
    pointer.tx = event.clientX / Math.max(innerWidth, 1);
    pointer.ty = 1 - event.clientY / Math.max(innerHeight, 1);
  }, { passive: true });
  addEventListener("resize", () => { resize(); draw(performance.now()); }, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (reduced) return;
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (!raf) {
      last = 0;
      raf = requestAnimationFrame(draw);
    }
  });

  resize();
  draw(performance.now());
})();
