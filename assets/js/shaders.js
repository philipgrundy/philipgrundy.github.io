// A small WebGL2 host for the original Shadertoy Image / Buffer A passes.
(() => {
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const library = fetch("/assets/shaders/shaders.json?v=2").then(response => {
    if (!response.ok) throw new Error("Shader source could not be loaded.");
    return response.json();
  });
  const vertexSource = `#version 300 es
  const vec2 vertices[3] = vec2[3](vec2(-1., -1.), vec2(3., -1.), vec2(-1., 3.));
  void main() { gl_Position = vec4(vertices[gl_VertexID], 0., 1.); }`;
  const header = `#version 300 es
  precision highp float;
  precision highp int;
  uniform vec3 iResolution;
  uniform float iTime;
  uniform float iTimeDelta;
  uniform int iFrame;
  uniform vec4 iMouse;
  uniform sampler2D iChannel0;
  out vec4 fragColor;
  #line 1
  `;

  for (const card of document.querySelectorAll("[data-shader]")) setup(card);

  function setup(card) {
    const canvas = card.querySelector("canvas");
    const status = card.querySelector("[data-shader-status]");
    const toggle = card.querySelector("[data-shader-toggle]");
    const restart = card.querySelector("[data-shader-restart]");
    const title = card.querySelector("h2").textContent;
    let gl, image, buffer, targets = [], emptyTexture;
    let visible = false, ready = false, failed = false, paused = motion.matches;
    let animation = 0, lastStamp = null, elapsed = 0, frame = 0, front = 0;
    let mouse = [0, 0, 0, 0];

    function updateStatus() {
      if (failed || !ready) return;
      const state = paused ? "paused" : visible && !document.hidden ? "running" : "offscreen";
      if (card.dataset.state === state) return;
      card.dataset.state = state;
      status.textContent = paused ? "Paused" : "";
      toggle.textContent = paused ? "Play" : "Pause";
      toggle.setAttribute("aria-label", `${paused ? "Play" : "Pause"} ${title}`);
      toggle.setAttribute("aria-pressed", String(paused));
    }

    function stop() {
      cancelAnimationFrame(animation);
      animation = 0;
      lastStamp = null;
    }

    function schedule() {
      updateStatus();
      if (ready && !failed && visible && !document.hidden && !paused && !animation) {
        animation = requestAnimationFrame(animate);
      }
    }

    function fail(error) {
      failed = true;
      stop();
      card.dataset.state = "error";
      status.textContent = error.message || "This preview could not start.";
      toggle.disabled = restart.disabled = true;
    }

    function compile(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Shader compilation failed: ${error}`);
      }
      return shader;
    }

    function program(pass) {
      const vertex = compile(gl.VERTEX_SHADER, vertexSource);
      const fragment = compile(gl.FRAGMENT_SHADER, header + pass.code + "\nvoid main() { mainImage(fragColor, gl_FragCoord.xy); }");
      const handle = gl.createProgram();
      gl.attachShader(handle, vertex);
      gl.attachShader(handle, fragment);
      gl.linkProgram(handle);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) {
        throw new Error(`Shader linking failed: ${gl.getProgramInfoLog(handle)}`);
      }
      const uniforms = {};
      for (const name of ["iResolution", "iTime", "iTimeDelta", "iFrame", "iMouse", "iChannel0"]) {
        uniforms[name] = gl.getUniformLocation(handle, name);
      }
      return { handle, uniforms };
    }

    function texture(width, height) {
      const handle = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, handle);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return handle;
    }

    function reset() {
      elapsed = frame = front = 0;
      lastStamp = null;
      mouse = [0, 0, 0, 0];
      for (const target of targets) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      draw(0);
      schedule();
    }

    function resize() {
      if (!ready || failed) return;
      const displayWidth = canvas.getBoundingClientRect().width;
      const pixelRatio = window.devicePixelRatio || 1;
      const limit = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
      const width = Math.min(limit, Math.max(1, Math.round(displayWidth * pixelRatio)));
      const height = width;
      if (width === canvas.width && height === canvas.height && frame) return;
      canvas.width = width;
      canvas.height = height;
      for (const target of targets) {
        gl.deleteFramebuffer(target.framebuffer);
        gl.deleteTexture(target.texture);
      }
      targets = [];
      if (buffer) {
        for (let i = 0; i < 2; i++) {
          const target = { texture: texture(width, height), framebuffer: gl.createFramebuffer() };
          gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0);
          if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("This browser cannot create the preview buffer.");
          targets.push(target);
        }
      }
      gl.viewport(0, 0, width, height);
      reset();
    }

    window.addEventListener("resize", () => { try { resize(); } catch (error) { fail(error); } });

    function render(pass, target, input, delta) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      gl.useProgram(pass.handle);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, input);
      const u = pass.uniforms;
      gl.uniform3f(u.iResolution, canvas.width, canvas.height, 1);
      gl.uniform1f(u.iTime, card.dataset.loop ? elapsed % Number(card.dataset.loop) : elapsed);
      gl.uniform1f(u.iTimeDelta, delta);
      gl.uniform1i(u.iFrame, frame);
      gl.uniform4fv(u.iMouse, mouse);
      gl.uniform1i(u.iChannel0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function draw(delta) {
      if (buffer) {
        const next = 1 - front;
        // Read the previous texture, write the other, then show the new state.
        render(buffer, targets[next].framebuffer, targets[front].texture, delta);
        front = next;
      }
      render(image, null, buffer ? targets[front].texture : emptyTexture, delta);
      card.dataset.frame = String(++frame);
    }

    function animate(stamp) {
      animation = 0;
      if (!visible || paused || document.hidden || failed) { lastStamp = null; return; }
      // Keep playback bounded at 30 fps; off-screen time never advances the shaders.
      if (lastStamp !== null && stamp - lastStamp < 1000 / 30) { schedule(); return; }
      const delta = lastStamp === null ? 0 : Math.min((stamp - lastStamp) / 1000, 0.1);
      lastStamp = stamp;
      elapsed += delta;
      draw(delta);
      schedule();
    }

    function pointer(event) {
      const rect = canvas.getBoundingClientRect();
      mouse[0] = Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) / rect.width * canvas.width));
      mouse[1] = Math.max(0, Math.min(canvas.height, (rect.bottom - event.clientY) / rect.height * canvas.height));
    }
    canvas.addEventListener("pointerdown", event => {
      pointer(event);
      mouse[2] = Math.max(0.001, mouse[0]);
      mouse[3] = Math.max(0.001, mouse[1]);
      canvas.setPointerCapture(event.pointerId);
      if (paused && ready && !failed) draw(0);
    });
    canvas.addEventListener("pointermove", event => {
      pointer(event);
      if (event.buttons && paused && ready && !failed) draw(0);
    });
    function release() { mouse[2] = -Math.abs(mouse[2]); mouse[3] = -Math.abs(mouse[3]); }
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    toggle.addEventListener("click", () => { paused = !paused; stop(); schedule(); });
    restart.addEventListener("click", () => { stop(); reset(); });
    document.addEventListener("visibilitychange", () => { stop(); schedule(); });
    motion.addEventListener("change", event => { if (event.matches) { paused = true; stop(); schedule(); } });
    canvas.addEventListener("webglcontextlost", () => fail(new Error("Graphics paused by your browser. Reload this page to restart.")));
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      stop();
      schedule();
    }, { threshold: 0 }).observe(canvas);

    library.then(data => {
      const shader = data[card.dataset.shader];
      if (!shader) throw new Error("This shader source is missing.");
      const source = card.querySelector("[data-shader-source]");
      for (const pass of shader.passes) {
        const heading = document.createElement("h3");
        heading.textContent = pass.name;
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        code.textContent = pass.code;
        pre.append(code);
        source.append(heading, pre);
      }
      gl = canvas.getContext("webgl2", { antialias: false, depth: false, stencil: false });
      if (!gl) throw new Error("This preview needs WebGL 2. You can still read its source below.");
      gl.bindVertexArray(gl.createVertexArray());
      image = program(shader.passes.find(pass => pass.type === "image"));
      const bufferPass = shader.passes.find(pass => pass.type === "buffer");
      buffer = bufferPass ? program(bufferPass) : null;
      emptyTexture = texture(1, 1);
      ready = true;
      toggle.disabled = restart.disabled = false;
      resize();
      new ResizeObserver(() => { try { resize(); } catch (error) { fail(error); } }).observe(canvas);
      if (gl.getError() !== gl.NO_ERROR) throw new Error("Your browser could not render this preview.");
      updateStatus();
    }).catch(fail);
  }
})();
