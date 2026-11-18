// =========================================================================
// STATO GLOBALE DEL VOLUME, TELECAMERA E RIFERIMENTI CONDIVISI
// =========================================================================

// --- STATO GLOBALE DEL VOLUME ---
const VolumeState = {
    width: 128,
    height: 128,
    depth: 128,
    spacingX: 1.5,
    spacingY: 1.5,
    spacingZ: 1.5,
    huData: null,       // Int16Array con valori in Unità Hounsfield [-1024..+3071]
    texData: null,      // Uint8Array o Float32Array normalizzato per WebGL2
    minHU: -1024,
    maxHU: 2400,
    seriesTitle: "Phantom Procedurale (HR-CT)",
    modality: "CT • HU",
    // Parametri Transfer Function Universale (Total-Body)
    primaryThreshold: 230,
    primarySharpness: 180,
    secondaryOpacity: 0.0,
    globalAlpha: 0.95,
    specular: 0.65,
    shadeStrength: 0.85,
    steps: 280,
    renderMode: 0,      // 0 = High-Pass Phong, 1 = MIP, 2 = Band-Pass Phong (Polmoni / Addome)
    primaryTint: [1.0, 0.96, 0.86],
    // Clipping Box [0..1]
    clipMin: [0.0, 0.0, 0.0],
    clipMax: [1.0, 1.0, 1.0],
    // Finestra 2D MPR
    winCenter: 400,
    winWidth: 1800
};

// --- STATO TELECAMERA ORBITALE 3D ---
const Camera = {
    yaw: 0.42,          // Rotazione orizzontale (radianti)
    pitch: 0.22,        // Elevazione verticale (radianti)
    distance: 2.05,     // Distanza dal centro
    panX: 0.0,
    panY: 0.0,
    autoRotate: false,
    isDragging: false,
    dragMode: 'orbit',  // 'orbit' o 'pan'
    lastX: 0,
    lastY: 0
};

// --- RIFERIMENTI WEBGL2 ---
let gl = null;
let program = null;
let vao = null;
let volumeTexture = null;
let uniforms = {};

// --- MAPPA SERIE DICOM CARICATE ---
let LoadedSeriesMap = {}; // Archivia le serie volumetriche valide per SeriesInstanceUID
