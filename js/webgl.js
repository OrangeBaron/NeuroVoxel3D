// =========================================================================
// MOTORE WEBGL2 RAYMARCHER, TELECAMERA 3D E MATRICI DI PROIEZIONE
// =========================================================================

function initWebGL() {
    const canvas = document.getElementById('glCanvas');
    gl = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true });
    if (!gl) {
        showToast("Errore: Il tuo browser non supporta WebGL2.", true);
        return;
    }

    // Compilazione Shaders
    const vsSource = Shaders.vertex;
    const fsSource = Shaders.fragment;
    const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);

    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("Errore link shader:", gl.getProgramInfoLog(program));
        return;
    }

    // Geometria Cubo Unitario [-0.5, 0.5]^3
    const vertices = new Float32Array([
        -0.5, -0.5, -0.5,   0.5, -0.5, -0.5,   0.5,  0.5, -0.5,  -0.5,  0.5, -0.5,
        -0.5, -0.5,  0.5,   0.5, -0.5,  0.5,   0.5,  0.5,  0.5,  -0.5,  0.5,  0.5
    ]);
    const indices = new Uint16Array([
        0, 1, 2,  0, 2, 3, // Back
        4, 6, 5,  4, 7, 6, // Front
        0, 3, 7,  0, 7, 4, // Left
        1, 5, 6,  1, 6, 2, // Right
        3, 2, 6,  3, 6, 7, // Top
        0, 4, 5,  0, 5, 1  // Bottom
    ]);

    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

    const ebo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    gl.bindVertexArray(null);

    // Cache Uniform Locations
    const uNames = [
        'uModelViewProjection', 'uVolumeTex', 'uCamPosObj', 'uVolumeScale',
        'uClipMin', 'uClipMax', 'uPrimaryThreshold', 'uPrimarySharpness',
        'uSecondaryOpacity', 'uGlobalAlpha', 'uSpecular', 'uShadeStrength',
        'uSteps', 'uRenderMode', 'uPrimaryTint'
    ];
    uNames.forEach(name => {
        uniforms[name] = gl.getUniformLocation(program, name);
    });

    setupMouseAndTouchControls(canvas);
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
}

function compileShader(gl, type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error("Shader Compile Error:", gl.getShaderInfoLog(s));
    }
    return s;
}

function uploadVolumeToGPU() {
    if (!gl || !VolumeState.huData) return;

    const W = VolumeState.width;
    const H = VolumeState.height;
    const D = VolumeState.depth;
    const total = W * H * D;

    // Normalizziamo i valori HU [-1024..+3071] in Uint8 [0..255] o R8 con interpolazione lineare
    // Per massima compatibilità su tutte le GPU WebGL2 (incluso mobile/macOS), R8 con LINEAR filter è nativamente garantito
    const uint8Vol = new Uint8Array(total);
    const hu = VolumeState.huData;
    for (let i = 0; i < total; i++) {
        let norm = (hu[i] + 1024.0) / 4095.0;
        if (norm < 0) norm = 0;
        else if (norm > 1) norm = 1;
        uint8Vol[i] = (norm * 255) | 0;
    }

    if (volumeTexture) gl.deleteTexture(volumeTexture);
    volumeTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, volumeTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.texImage3D(
        gl.TEXTURE_3D,
        0,
        gl.R8,
        W, H, D,
        0,
        gl.RED,
        gl.UNSIGNED_BYTE,
        uint8Vol
    );

    // Aggiorna UI e slider MPR
    document.getElementById('metaTitle').textContent = VolumeState.seriesTitle;
    document.getElementById('metaModality').textContent = VolumeState.modality;
    document.getElementById('metaDims').textContent = `${W}×${H}×${D}`;
    document.getElementById('metaSpacing').textContent = `${VolumeState.spacingX.toFixed(1)}×${VolumeState.spacingZ.toFixed(1)}mm`;
    document.getElementById('metaHURange').textContent = `${VolumeState.minHU}..+${VolumeState.maxHU}`;

    const sx = document.getElementById('sliceX');
    const sy = document.getElementById('sliceY');
    const sz = document.getElementById('sliceZ');
    sx.max = W - 1; sx.value = Math.floor(W / 2);
    sy.max = H - 1; sy.value = Math.floor(H / 2);
    sz.max = D - 1; sz.value = Math.floor(D / 2);

    updateMPRViews();
}

// --- TELECAMERA 3D, CONTROLLI MOUSE/TOUCH & MATRICI ---
function setupMouseAndTouchControls(canvas) {
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('mousedown', (e) => {
        Camera.isDragging = true;
        Camera.lastX = e.clientX;
        Camera.lastY = e.clientY;
        Camera.dragMode = (e.button === 2 || e.shiftKey) ? 'pan' : 'orbit';
    });

    window.addEventListener('mousemove', (e) => {
        if (!Camera.isDragging) return;
        const dx = e.clientX - Camera.lastX;
        const dy = e.clientY - Camera.lastY;
        Camera.lastX = e.clientX;
        Camera.lastY = e.clientY;

        if (Camera.dragMode === 'orbit') {
            Camera.yaw -= dx * 0.0085;
            Camera.pitch = Math.max(-1.52, Math.min(1.52, Camera.pitch + dy * 0.0085));
        } else {
            Camera.panX += dx * 0.0022;
            Camera.panY -= dy * 0.0022;
        }
    });

    window.addEventListener('mouseup', () => {
        Camera.isDragging = false;
    });

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        Camera.distance = Math.max(0.85, Math.min(4.8, Camera.distance + e.deltaY * 0.0015));
    }, { passive: false });

    // Touch mobile
    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            Camera.isDragging = true;
            Camera.dragMode = 'orbit';
            Camera.lastX = e.touches[0].clientX;
            Camera.lastY = e.touches[0].clientY;
        }
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
        if (!Camera.isDragging || e.touches.length !== 1) return;
        const dx = e.touches[0].clientX - Camera.lastX;
        const dy = e.touches[0].clientY - Camera.lastY;
        Camera.lastX = e.touches[0].clientX;
        Camera.lastY = e.touches[0].clientY;
        Camera.yaw -= dx * 0.0085;
        Camera.pitch = Math.max(-1.52, Math.min(1.52, Camera.pitch + dy * 0.0085));
    }, { passive: true });

    canvas.addEventListener('touchend', () => {
        Camera.isDragging = false;
    });
}

function setCameraView(view) {
    Camera.panX = 0;
    Camera.panY = 0;
    if (view === 'front') { Camera.yaw = 0.0; Camera.pitch = 0.0; }
    else if (view === 'side') { Camera.yaw = Math.PI / 2; Camera.pitch = 0.0; }
    else if (view === 'top') { Camera.yaw = 0.0; Camera.pitch = 1.48; }
    else if (view === 'iso') { Camera.yaw = 0.52; Camera.pitch = 0.25; }
}

function toggleAutoRotate() {
    Camera.autoRotate = !Camera.autoRotate;
    const btn = document.getElementById('btnAutoRotate');
    if (Camera.autoRotate) {
        btn.classList.add('border-amber-400', 'text-amber-300', 'bg-amber-500/20');
    } else {
        btn.classList.remove('border-amber-400', 'text-amber-300', 'bg-amber-500/20');
    }
}

function resizeCanvas() {
    const container = document.getElementById('viewportContainer');
    const canvas = document.getElementById('glCanvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(container.clientWidth * dpr);
    canvas.height = Math.floor(container.clientHeight * dpr);
    if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
}

// Algebra lineare compatta per Mat4 Proiezione + LookAt
function perspectiveMatrix(fovRad, aspect, near, far) {
    const f = 1.0 / Math.tan(fovRad / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, (2 * far * near) * nf, 0
    ]);
}

function lookAtMatrix(eye, target, up) {
    let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    let len = Math.hypot(zx, zy, zz);
    zx /= len; zy /= len; zz /= len;

    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    len = Math.hypot(xx, xy, xz);
    xx /= len; xy /= len; xz /= len;

    let yx = zy * xz - zz * xy;
    let yy = zz * xx - zx * xz;
    let yz = zx * xy - zy * xx;

    return new Float32Array([
        xx, yx, zx, 0,
        xy, yy, zy, 0,
        xz, yz, zz, 0,
        -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
        -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
        -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
        1
    ]);
}

function multiplyMat4(a, b) {
    const out = new Float32Array(16);
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            out[j * 4 + i] =
                a[0 * 4 + i] * b[j * 4 + 0] +
                a[1 * 4 + i] * b[j * 4 + 1] +
                a[2 * 4 + i] * b[j * 4 + 2] +
                a[3 * 4 + i] * b[j * 4 + 3];
        }
    }
    return out;
}

function renderLoop() {
    if (Camera.autoRotate && !Camera.isDragging) {
        Camera.yaw += 0.006;
    }

    if (gl && program && volumeTexture) {
        const canvas = gl.canvas;
        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // 1. Calcola le proporzioni fisiche reali in millimetri (X, Y, Z) del volume paziente
        const physX = VolumeState.width * VolumeState.spacingX;
        const physY = VolumeState.height * VolumeState.spacingY;
        const physZ = VolumeState.depth * VolumeState.spacingZ;
        const maxPhys = Math.max(physX, physY, physZ, 1e-4);
        const scaleVec = [physX / maxPhys, physY / maxPhys, physZ / maxPhys];

        // 2. Calcolo della camera orbitale nello spazio standard del cubo
        const cosP = Math.cos(Camera.pitch);
        const sinP = Math.sin(Camera.pitch);
        const cosY = Math.cos(Camera.yaw);
        const sinY = Math.sin(Camera.yaw);

        const camX = Camera.distance * cosP * sinY - Camera.panX;
        const camY = -Camera.distance * cosP * cosY;
        const camZ = Camera.distance * sinP - Camera.panY;

        const eye = [camX, camY, camZ];
        const target = [-Camera.panX, 0.0, -Camera.panY];
        const up = [0.0, 0.0, 1.0];

        const aspect = canvas.width / Math.max(1, canvas.height);
        const proj = perspectiveMatrix(40 * Math.PI / 180, aspect, 0.05, 20.0);
        
        // 3. Matrice Model-View-Projection diretta senza scale asimmetriche che rompono il raymarching
        const view = lookAtMatrix(eye, target, up);
        const mvp = multiplyMat4(proj, view);

        gl.useProgram(program);
        gl.bindVertexArray(vao);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_3D, volumeTexture);
        gl.uniform1i(uniforms.uVolumeTex, 0);

        gl.uniformMatrix4fv(uniforms.uModelViewProjection, false, mvp);
        gl.uniform3fv(uniforms.uCamPosObj, eye);
        gl.uniform3fv(uniforms.uVolumeScale, scaleVec);
        gl.uniform3fv(uniforms.uClipMin, VolumeState.clipMin);
        gl.uniform3fv(uniforms.uClipMax, VolumeState.clipMax);

        gl.uniform1f(uniforms.uPrimaryThreshold, VolumeState.primaryThreshold);
        gl.uniform1f(uniforms.uPrimarySharpness, VolumeState.primarySharpness);
        gl.uniform1f(uniforms.uSecondaryOpacity, VolumeState.secondaryOpacity);
        gl.uniform1f(uniforms.uGlobalAlpha, VolumeState.globalAlpha);
        gl.uniform1f(uniforms.uSpecular, VolumeState.specular);
        gl.uniform1f(uniforms.uShadeStrength, VolumeState.shadeStrength);
        gl.uniform1i(uniforms.uSteps, Camera.isDragging ? Math.min(180, VolumeState.steps) : VolumeState.steps);
        gl.uniform1i(uniforms.uRenderMode, VolumeState.renderMode);
        gl.uniform3fv(uniforms.uPrimaryTint, VolumeState.primaryTint);

        gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
        gl.bindVertexArray(null);
    }

    requestAnimationFrame(renderLoop);
}
