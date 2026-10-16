# philipgrundy.github.io

The source of my portfolio site: **https://philipgrundy.github.io**

## What's on it

- **[Suika bot](https://philipgrundy.github.io/projects/suika/)**: a bot that taught itself
  Suika, a fruit-stacking game, through self-play. It pairs a small transformer value network
  (PyTorch, trained with TD(λ)) with a search over possible drops, on a deterministic Rust
  physics engine. The home page replays its best game live in the browser, using the same
  engine compiled to WebAssembly.
- **[Shader experiments](https://philipgrundy.github.io/projects/shaders/)**: four GLSL shaders
  from Shadertoy, running live on a small WebGL 2 runner written for this site.
- **[CV](https://philipgrundy.github.io/cv/PhilipGrundy_CV.pdf)** (PDF).

## How it's built

Plain HTML, CSS and JavaScript: no frameworks, no build step and no third-party requests.

- **Replays are exact.** The Suika engine is deterministic, so the browser replays a recorded
  game tick for tick on the same engine (`assets/suika/`).
- **Shader runner** (`assets/js/shaders.js`): wraps each pass in Shadertoy's standard inputs,
  renders Buffer A into a texture before the Image pass, and gives a buffer that reads its own
  last frame two textures that swap each frame. Previews pause when they're off screen.
- **Results chart** on the Suika page is drawn from the training logs by `tools/chart.py`.
  Each test shows a 95% Wilson interval, so you can see how much of a difference is luck.
- **Light and dark themes** follow the visitor's system setting, with a switch in the corner.
- **Fonts:** headings use Rosario (SIL Open Font License), self-hosted as a 37 KB WOFF2.

## Run it locally

```bash
python -m http.server 8000
```

Then open http://localhost:8000. Links start with `/`, so opening the HTML files directly
won't work.
