// =========================================================================
// VISTE SINCRONIZZATE 2D MPR (ASSIALE, CORONALE, SAGITTALE) & SONDA HU
// =========================================================================

function huToGray(hu, center, width) {
    const low = center - width * 0.5;
    const norm = (hu - low) / width;
    if (norm <= 0) return 0;
    if (norm >= 1) return 255;
    return (norm * 255) | 0;
}

function updateMPRViews() {
    if (!VolumeState.huData) return;

    const W = VolumeState.width;
    const H = VolumeState.height;
    const D = VolumeState.depth;
    const hu = VolumeState.huData;

    const sx = parseInt(document.getElementById('sliceX').value) || 0;
    const sy = parseInt(document.getElementById('sliceY').value) || 0;
    const sz = parseInt(document.getElementById('sliceZ').value) || 0;

    document.getElementById('lblSliceX').textContent = `${sx + 1} / ${W}`;
    document.getElementById('lblSliceY').textContent = `${sy + 1} / ${H}`;
    document.getElementById('lblSliceZ').textContent = `${sz + 1} / ${D}`;

    // 1. ASSIALE (Z fisso: X vs Y)
    renderMPRSlice('canvasAxial', W, H, (x, y) => {
        return hu[sz * W * H + y * W + x];
    }, sx / W, sy / H, '#38bdf8', '#10b981');

    // 2. CORONALE (Y fisso: X vs Z invertito alto/basso)
    renderMPRSlice('canvasCoronal', W, D, (x, zPlot) => {
        const z = (D - 1) - zPlot;
        return hu[z * W * H + sy * W + x];
    }, sx / W, 1.0 - (sz / D), '#38bdf8', '#f59e0b');

    // 3. SAGITTALE (X fisso: Y vs Z invertito alto/basso)
    renderMPRSlice('canvasSagittal', H, D, (y, zPlot) => {
        const z = (D - 1) - zPlot;
        return hu[z * W * H + y * W + sx];
    }, sy / H, 1.0 - (sz / D), '#10b981', '#f59e0b');
}

function renderMPRSlice(canvasId, width, height, sampleFn, crossX, crossY, colV, colH) {
    const canvas = document.getElementById(canvasId);
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    const wc = VolumeState.winCenter;
    const ww = VolumeState.winWidth;

    let p = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const valHU = sampleFn(x, y);
            const g = huToGray(valHU, wc, ww);
            data[p++] = g;
            data[p++] = g;
            data[p++] = g;
            data[p++] = 255;
        }
    }
    ctx.putImageData(imgData, 0, 0);

    // Disegna i mirini sincronizzati (Crosshairs)
    ctx.lineWidth = 1;
    ctx.strokeStyle = colV;
    ctx.beginPath();
    ctx.moveTo(crossX * width, 0);
    ctx.lineTo(crossX * width, height);
    ctx.stroke();

    ctx.strokeStyle = colH;
    ctx.beginPath();
    ctx.moveTo(0, crossY * height);
    ctx.lineTo(width, crossY * height);
    ctx.stroke();
}

// Sonda densità HU al passaggio del mouse sulle viste 2D
function setupMPRProbe() {
    const probeEl = document.getElementById('huProbeValue');
    const bindCanvas = (id, getCoordsFn) => {
        const c = document.getElementById(id);
        c.addEventListener('mousemove', (e) => {
            if (!VolumeState.huData) return;
            const rect = c.getBoundingClientRect();
            const nx = Math.max(0, Math.min(0.999, (e.clientX - rect.left) / rect.width));
            const ny = Math.max(0, Math.min(0.999, (e.clientY - rect.top) / rect.height));
            const [vx, vy, vz] = getCoordsFn(nx, ny);
            const idx = vz * VolumeState.width * VolumeState.height + vy * VolumeState.width + vx;
            const hu = VolumeState.huData[idx];
            let tissue = "Aria / Fondo";
            if (hu > 1000) tissue = "Tessuto Iperdenso";
            else if (hu > 220) tissue = "Tessuto ad Alta Densità";
            else if (hu > 100) tissue = "Vasi / Strutture Opacizzate";
            else if (hu > 15) tissue = "Tessuto Molle / Parenchima";
            else if (hu > -150) tissue = "Tessuto Adiposo";
            else if (hu > -850) tissue = "Parenchima Polmonare / Vie Aeree";
            probeEl.textContent = `${hu} HU (${tissue})`;
        });
    };

    bindCanvas('canvasAxial', (nx, ny) => [
        Math.floor(nx * VolumeState.width),
        Math.floor(ny * VolumeState.height),
        parseInt(document.getElementById('sliceZ').value)
    ]);
    bindCanvas('canvasCoronal', (nx, ny) => [
        Math.floor(nx * VolumeState.width),
        parseInt(document.getElementById('sliceY').value),
        Math.floor((1.0 - ny) * VolumeState.depth)
    ]);
    bindCanvas('canvasSagittal', (nx, ny) => [
        parseInt(document.getElementById('sliceX').value),
        Math.floor(nx * VolumeState.height),
        Math.floor((1.0 - ny) * VolumeState.depth)
    ]);
}

function set2DWindow(center, width) {
    VolumeState.winCenter = center;
    VolumeState.winWidth = width;
    updateMPRViews();
}

function syncClipToMPR(axis) {
    const W = Math.max(2, VolumeState.width);
    const H = Math.max(2, VolumeState.height);
    const D = Math.max(2, VolumeState.depth);
    if (axis === 'z') {
        const zPct = Math.round((parseInt(document.getElementById('sliceZ').value) / (D - 1)) * 100);
        document.getElementById('clipZMax').value = zPct;
    } else if (axis === 'y') {
        const yPct = Math.round((parseInt(document.getElementById('sliceY').value) / (H - 1)) * 100);
        document.getElementById('clipYMin').value = yPct;
    } else if (axis === 'x') {
        const xPct = Math.round((parseInt(document.getElementById('sliceX').value) / (W - 1)) * 100);
        document.getElementById('clipXMin').value = xPct;
    }
    updateClipping();
}
