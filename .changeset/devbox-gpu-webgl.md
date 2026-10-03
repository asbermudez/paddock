---
"@paddock/server": minor
---

The devbox image can now give the browser MCP's Chromium a real GPU for WebGL (#964). Map the host's render node into the container (`--device /dev/dri/renderD128`) and Paddock passes Chromium `--use-gl=angle --use-angle=gl-egl`, with the Mesa EGL/Vulkan packages the image now carries. Measured on an Intel UHD 630, WebGL ran 12.7× faster on 16× less CPU than the SwiftShader software renderer it replaces. Hosts without a GPU are unchanged: the flags are only passed when the device actually opens, and the boot log says which renderer agents got. `docker: true` projects keep the defaults.
