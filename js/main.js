// =========================================================================
// BOOTSTRAP APPLICAZIONE NEUROVOXEL 3D
// =========================================================================

window.onload = function () {
    initWebGL();
    setupMPRProbe();
    generateProceduralPhantom();
    requestAnimationFrame(renderLoop);
};
