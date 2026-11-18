// =========================================================================
// GENERATORE PHANTOM PROCEDURALE 3D (IN UNITÀ HOUNSFIELD REALI)
// =========================================================================

function generateProceduralPhantom() {
    const overlay = document.getElementById('loadingOverlay');
    overlay.classList.remove('hidden');
    document.getElementById('loadingTitle').textContent = "Generazione Volume Demo 3D (Phantom Procedurale)...";
    document.getElementById('loadingSub').textContent = "Sintesi strutture multi-densità (tessuti molli, vie aeree, vasi e strutture ad alta densità) in Unità Hounsfield";
    document.getElementById('loadingBar').style.width = "65%";

    setTimeout(() => {
        const W = 128, H = 128, D = 128;
        const hu = new Int16Array(W * H * D);
        hu.fill(-1000); // Aria radiologica (-1000 HU)

        // Costruiamo un teschio umano anatomicamente ricco con coordinate normalizzate [-1, +1]
        // X: Destra/Sinistra, Y: Anteriore(-)/Posteriore(+), Z: Inferiore(-)/Superiore(+)
        for (let z = 0; z < D; z++) {
            const zn = (z / (D - 1)) * 2.0 - 1.0;
            for (let y = 0; y < H; y++) {
                const yn = (y / (H - 1)) * 2.0 - 1.0;
                for (let x = 0; x < W; x++) {
                    const xn = (x / (W - 1)) * 2.0 - 1.0;

                    let valHU = -1000;

                    // 1. Neurocranio (Calotta ellissoidale superiore-posteriore)
                    const cx = xn / 0.66;
                    const cy = (yn - 0.08) / 0.78;
                    const cz = (zn - 0.16) / 0.68;
                    const dCranium = Math.sqrt(cx * cx + cy * cy + cz * cz);

                    // 2. Massiccio Facciale / Mascella / Zigomi (anteriore-inferiore)
                    const fx = xn / 0.50;
                    const fy = (yn + 0.34) / 0.44;
                    const fz = (zn + 0.25) / 0.48;
                    const dFace = Math.sqrt(fx * fx + fy * fy + fz * fz);

                    // 3. Mandibola (ramo e corpo mandibolare a U)
                    const jawArc = Math.sqrt(xn * xn + (yn + 0.30) * (yn + 0.30));
                    const dJaw = Math.max(Math.abs(jawArc - 0.38) - 0.07, Math.abs(zn + 0.56) - 0.15);

                    // Unione morbida della testa per il profilo cutaneo esterno
                    const skinField = Math.min(dCranium, dFace * 0.95);
                    if (skinField < 1.05 || (dJaw < 0.06 && yn < 0.12)) {
                        // Tessuto molle sottocutaneo e muscolare (-60 .. +55 HU)
                        valHU = 35;
                    }

                    // Parenchima cerebrale dentro la scatola cranica (35 HU)
                    if (dCranium < 0.85) {
                        valHU = 38;
                        // Ventricoli laterali (liquor 10 HU)
                        if (Math.abs(xn) > 0.05 && Math.abs(xn) < 0.20 && Math.abs(yn - 0.05) < 0.25 && Math.abs(zn - 0.15) < 0.12) {
                            valHU = 8;
                        }
                    }

                    // Guscio osseo della Calotta Cranica (Tavolato esterno, diploe, tavolato interno)
                    if (dCranium >= 0.85 && dCranium <= 1.0) {
                        const shellPos = (dCranium - 0.85) / 0.15; // 0..1
                        const cortical = 1.0 - 4.0 * (shellPos - 0.5) * (shellPos - 0.5);
                        valHU = Math.round(980 - cortical * 320); // Diploe ~660 HU, Corticale ~980 HU
                    }

                    // Struttura ossea facciale, arcate sopraccigliari e zigomatiche
                    if (dFace < 0.98 && yn < 0.15 && zn < 0.18 && zn > -0.58) {
                        if (dFace > 0.72) {
                            valHU = Math.max(valHU, 820);
                        }
                    }

                    // Arcate Zigomatiche prominenti
                    const zygX = (Math.abs(xn) - 0.48) / 0.12;
                    const zygY = (yn + 0.18) / 0.28;
                    const zygZ = (zn + 0.08) / 0.10;
                    if (zygX * zygX + zygY * zygY + zygZ * zygZ < 1.0) {
                        valHU = Math.max(valHU, 950);
                    }

                    // Mandibola Ossea Corticale Densa
                    if (dJaw < 0.0 && yn < 0.10) {
                        valHU = Math.max(valHU, 960);
                    }
                    // Ramo ascendente mandibolare
                    if (Math.abs(Math.abs(xn) - 0.42) < 0.065 && yn > -0.18 && yn < 0.05 && zn > -0.55 && zn < -0.05) {
                        valHU = Math.max(valHU, 920);
                    }

                    // CAVITÀ ORBITARIE (Scavate con aria/tessuto orbitario)
                    const orbX = (Math.abs(xn) - 0.24) / 0.165;
                    const orbY = (yn + 0.55) / 0.24;
                    const orbZ = (zn - 0.02) / 0.155;
                    const dOrbit = Math.sqrt(orbX * orbX + orbY * orbY + orbZ * orbZ);
                    if (dOrbit < 1.0) {
                        valHU = -920; // Cavità orbitaria aperta per risalto 3D
                    } else if (dOrbit < 1.22 && yn < -0.35) {
                        valHU = Math.max(valHU, 1040); // Rima orbitaria ossea spessa
                    }

                    // CAVITÀ NASALE PIRIFORME & SETTO OSSEO
                    const noseX = xn / 0.11;
                    const noseY = (yn + 0.58) / 0.25;
                    const noseZ = (zn + 0.20) / 0.18;
                    if (noseX * noseX + noseY * noseY + noseZ * noseZ < 1.0) {
                        if (Math.abs(xn) < 0.018 && yn > -0.62) {
                            valHU = 720; // Setto nasale osseo (vomere/lamina perpendicolare)
                        } else {
                            valHU = -980; // Aria cavità nasale
                        }
                    }

                    // SENI PNEUMATIZZATI & VIE AEREE CON MUCOSA/SETTI (-650..-480 HU)
                    const sinX = (Math.abs(xn) - 0.23) / 0.13;
                    const sinY = (yn + 0.42) / 0.16;
                    const sinZ = (zn + 0.22) / 0.13;
                    const sinDist = sinX * sinX + sinY * sinY + sinZ * sinZ;
                    if (sinDist < 1.0) {
                        valHU = sinDist > 0.55 ? -560 : -940;
                    }

                    // TRONCHI VASCOLARI PRINCIPALI CON MEZZO DI CONTRASTO (+180..+260 HU)
                    const vascX = Math.abs(xn) - (0.16 + 0.03 * Math.sin(zn * 5.0));
                    const vascY = yn + 0.04 - 0.04 * zn;
                    if (vascX * vascX + vascY * vascY < 0.0022 && zn > -0.75 && zn < 0.38) {
                        valHU = Math.max(valHU, 225);
                    }

                    // STRUTTURE AD ALTISSIMA DENSITÀ (1500-2100 HU)
                    const toothRadius = Math.sqrt(xn * xn + (yn + 0.38) * (yn + 0.38));
                    if (Math.abs(toothRadius - 0.33) < 0.045 && yn < -0.22 && Math.abs(zn + 0.38) < 0.075) {
                        // Modulazione angolare per separare i singoli elementi
                        const angle = Math.atan2(yn + 0.38, xn);
                        const toothGap = Math.sin(angle * 28.0);
                        const archGap = Math.abs(zn + 0.38);
                        if (toothGap > -0.55 && archGap > 0.012) {
                            valHU = 1750;
                        }
                    }

                    // FORAME MAGNO E RACHIDE CERVICALE C1-C2
                    const spineR = Math.sqrt(xn * xn + (yn - 0.05) * (yn - 0.05));
                    if (zn < -0.42 && spineR < 0.24 && spineR > 0.11) {
                        // Anelli vertebrali cervicali
                        if (Math.sin(zn * 32.0) > -0.3) {
                            valHU = 890;
                        }
                    }

                    // Rumore quantico TC realistico (+/- 12 HU)
                    const noise = ((Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453) % 1) * 18;
                    hu[z * W * H + y * W + x] = Math.max(-1024, Math.min(3000, Math.round(valHU + noise)));
                }
            }
        }

        VolumeState.width = W;
        VolumeState.height = H;
        VolumeState.depth = D;
        VolumeState.spacingX = 1.4;
        VolumeState.spacingY = 1.4;
        VolumeState.spacingZ = 1.4;
        VolumeState.huData = hu;
        VolumeState.minHU = -1024;
        VolumeState.maxHU = 1950;
        VolumeState.seriesTitle = "Phantom Procedurale (HR-CT)";
        VolumeState.modality = "CT • PHANTOM";

        uploadVolumeToGPU();
        overlay.classList.add('hidden');
        showToast("Volume Demo 3D pronto! Ruota col mouse o usa gli slider per affettare il volume.");
    }, 80);
}
