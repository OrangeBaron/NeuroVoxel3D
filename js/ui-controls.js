// =========================================================================
// CONTROLLI UI: PRESET TESSUTI, TRANSFER FUNCTION, CLIPPING 3D & UTILITIES
// =========================================================================

function applyPreset(presetName) {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active-preset'));
    const activeBtn = document.getElementById(`preset-${presetName}`);
    if (activeBtn) activeBtn.classList.add('active-preset');

    if (presetName === 'bone') {
        // Tessuti ad Alta Densità (>220 HU)
        document.getElementById('sliderPrimaryThresh').value = 230;
        document.getElementById('sliderPrimarySharp').value = 180;
        document.getElementById('sliderSecondaryOpacity').value = 0;
        document.getElementById('sliderGlobalAlpha').value = 95;
        document.getElementById('sliderSpecular').value = 65;
        VolumeState.renderMode = 0; // High-Pass Phong
        VolumeState.primaryTint = [1.0, 0.96, 0.86];
    } else if (presetName === 'hybrid') {
        // Ibrido Multi-Tessuto (Alta densità + Tessuti molli di contesto)
        document.getElementById('sliderPrimaryThresh').value = 250;
        document.getElementById('sliderPrimarySharp').value = 160;
        document.getElementById('sliderSecondaryOpacity').value = 38;
        document.getElementById('sliderGlobalAlpha').value = 95;
        document.getElementById('sliderSpecular').value = 70;
        VolumeState.renderMode = 0; // High-Pass Phong
        VolumeState.primaryTint = [1.0, 0.96, 0.86];
    } else if (presetName === 'lungs') {
        // A. Polmoni / Vie Aeree (Parenchima polmonare, range HU circa -700 / -400)
        document.getElementById('sliderPrimaryThresh').value = -550;
        document.getElementById('sliderPrimarySharp').value = 300;
        document.getElementById('sliderSecondaryOpacity').value = 8;
        document.getElementById('sliderGlobalAlpha').value = 85;
        document.getElementById('sliderSpecular').value = 35;
        VolumeState.renderMode = 2; // Band-Pass Phong per isolare -700..-400 HU
        VolumeState.primaryTint = [0.55, 0.88, 1.0];
        set2DWindow(-550, 1400);
    } else if (presetName === 'abdomen') {
        // B. Addome / Organi (Tessuti molli addominali, range ristretto circa +20 / +60 HU)
        document.getElementById('sliderPrimaryThresh').value = 40;
        document.getElementById('sliderPrimarySharp').value = 45;
        document.getElementById('sliderSecondaryOpacity').value = 12;
        document.getElementById('sliderGlobalAlpha').value = 100;
        document.getElementById('sliderSpecular').value = 55;
        VolumeState.renderMode = 2; // Band-Pass Phong stretto attorno a +20..+60 HU
        VolumeState.primaryTint = [0.95, 0.58, 0.42];
        set2DWindow(40, 350);
    } else if (presetName === 'angio_mdc') {
        // C. Angio MDC (Vasi sanguigni opacizzati, range circa +100 / +300 HU)
        document.getElementById('sliderPrimaryThresh').value = 200;
        document.getElementById('sliderPrimarySharp').value = 200;
        document.getElementById('sliderSecondaryOpacity').value = 10;
        document.getElementById('sliderGlobalAlpha').value = 110;
        document.getElementById('sliderSpecular').value = 85;
        VolumeState.renderMode = 0; // High-Pass Phong a partire da ~100 HU
        VolumeState.primaryTint = [0.96, 0.36, 0.32];
        set2DWindow(200, 600);
    } else if (presetName === 'angio') {
        // Iperdensità Estrema
        document.getElementById('sliderPrimaryThresh').value = 580;
        document.getElementById('sliderPrimarySharp').value = 220;
        document.getElementById('sliderSecondaryOpacity').value = 8;
        document.getElementById('sliderGlobalAlpha').value = 115;
        document.getElementById('sliderSpecular').value = 88;
        VolumeState.renderMode = 0;
        VolumeState.primaryTint = [1.0, 0.92, 0.80];
    } else if (presetName === 'mip') {
        document.getElementById('sliderPrimaryThresh').value = 180;
        VolumeState.renderMode = 1;
    }
    updateTransferParams();
}

function updateTransferParams() {
    const pThresh = parseFloat(document.getElementById('sliderPrimaryThresh').value);
    const pSharp  = parseFloat(document.getElementById('sliderPrimarySharp').value);
    const sOpac   = parseFloat(document.getElementById('sliderSecondaryOpacity').value);
    const gAlpha  = parseFloat(document.getElementById('sliderGlobalAlpha').value);
    const spec    = parseFloat(document.getElementById('sliderSpecular').value);
    const shade   = parseFloat(document.getElementById('sliderShade').value);
    const steps   = parseInt(document.getElementById('sliderSteps').value);

    VolumeState.primaryThreshold = pThresh;
    VolumeState.primarySharpness = pSharp;
    VolumeState.secondaryOpacity = sOpac / 100.0;
    VolumeState.globalAlpha = gAlpha / 100.0;
    VolumeState.specular = spec / 100.0;
    VolumeState.shadeStrength = shade / 100.0;
    VolumeState.steps = steps;

    document.getElementById('valPrimaryThresh').textContent = `${pThresh} HU`;
    document.getElementById('valPrimarySharp').textContent = `${pSharp} HU`;
    document.getElementById('valSecondaryOpacity').textContent = `${sOpac}%`;
    document.getElementById('valGlobalAlpha').textContent = `${gAlpha}%`;
    document.getElementById('valSpecular').textContent = `${spec}%`;
    document.getElementById('valShade').textContent = `${shade}%`;
    document.getElementById('valSteps').textContent = `${steps} step`;
}

function setPrimaryTint(r, g, b) {
    VolumeState.primaryTint = [r, g, b];
}

function updateClipping() {
    let xMin = parseInt(document.getElementById('clipXMin').value);
    let xMax = parseInt(document.getElementById('clipXMax').value);
    if (xMin > xMax - 2) { xMin = xMax - 2; document.getElementById('clipXMin').value = xMin; }

    let yMin = parseInt(document.getElementById('clipYMin').value);
    let yMax = parseInt(document.getElementById('clipYMax').value);
    if (yMin > yMax - 2) { yMin = yMax - 2; document.getElementById('clipYMin').value = yMin; }

    let zMin = parseInt(document.getElementById('clipZMin').value);
    let zMax = parseInt(document.getElementById('clipZMax').value);
    if (zMin > zMax - 2) { zMin = zMax - 2; document.getElementById('clipZMin').value = zMin; }

    VolumeState.clipMin = [xMin / 100.0, yMin / 100.0, zMin / 100.0];
    VolumeState.clipMax = [xMax / 100.0, yMax / 100.0, zMax / 100.0];

    document.getElementById('lblClipX').textContent = `${xMin}% - ${xMax}%`;
    document.getElementById('lblClipY').textContent = `${yMin}% - ${yMax}%`;
    document.getElementById('lblClipZ').textContent = `${zMin}% - ${zMax}%`;
}

function resetClipping() {
    document.getElementById('clipXMin').value = 0;
    document.getElementById('clipXMax').value = 100;
    document.getElementById('clipYMin').value = 0;
    document.getElementById('clipYMax').value = 100;
    document.getElementById('clipZMin').value = 0;
    document.getElementById('clipZMax').value = 100;
    updateClipping();
}

// --- UTILITIES: SCREENSHOT & NOTIFICHE TOAST ---
function captureScreenshot() {
    const canvas = document.getElementById('glCanvas');
    const link = document.createElement('a');
    link.download = `TAC_3D_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast("Istantanea 3D salvata in formato PNG!");
}

let toastTimer = null;
function showToast(msg, isError = false) {
    const toast = document.getElementById('statusToast');
    const txt = document.getElementById('statusText');
    txt.textContent = msg;
    toast.style.borderColor = isError ? 'rgba(239,68,68,0.5)' : 'rgba(56,189,248,0.35)';
    toast.style.opacity = '1';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.style.opacity = '0.75';
    }, 5000);
}
