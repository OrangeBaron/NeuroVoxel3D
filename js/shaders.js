// =========================================================================
// SHADERS GLSL WEBGL2 PER VOLUME RAYMARCHING DIRETTO IN HOUNSFIELD UNITS
// =========================================================================

const Shaders = {
    vertex: `#version 300 es
        precision highp float;
        in vec3 aPosition;
        uniform mat4 uModelViewProjection;
        uniform vec3 uVolumeScale;
        out vec3 vPosObj;

        void main() {
            // Scala il box [-0.5, 0.5]^3 secondo le proporzioni millimetriche reali del paziente
            vec3 scaledPos = aPosition * uVolumeScale;
            vPosObj = scaledPos;
            gl_Position = uModelViewProjection * vec4(scaledPos, 1.0);
        }
    `,

    fragment: `#version 300 es
        precision highp float;
        precision highp sampler3D;

        in vec3 vPosObj;
        out vec4 fragColor;

        uniform sampler3D uVolumeTex;
        uniform vec3 uCamPosObj;
        uniform vec3 uVolumeScale;         // Proporzioni fisiche (es. mm)
        uniform vec3 uClipMin;             // [0..1]
        uniform vec3 uClipMax;             // [0..1]

        // Parametri Funzione di Trasferimento Hounsfield Universale (Total-Body)
        uniform float uPrimaryThreshold;   // Soglia o centro finestra target (es. -550 HU polmoni, +40 HU addome, +200 HU angio, +230 HU alta densità)
        uniform float uPrimarySharpness;   // Ampiezza / contrasto transizione HU
        uniform float uSecondaryOpacity;   // Opacità tessuti secondari di contesto [0..1]
        uniform float uGlobalAlpha;        // Moltiplicatore densità globale [0.1..1.5]
        uniform float uSpecular;           // Riflessione speculare Phong [0..1]
        uniform float uShadeStrength;      // Intensità ombreggiatura direzionale [0..1]
        uniform int uSteps;                // Passi di campionamento [96..512]
        uniform int uRenderMode;           // 0 = Phong High-Pass, 1 = MIP, 2 = Phong Band-Pass (Polmoni / Organi / Angio selettivo)
        uniform vec3 uPrimaryTint;         // Mappatura cromatica struttura target

        // Converte il valore normalizzato [0..1] della texture 3D in Hounsfield Units [-1024..+3071]
        float sampleHU(vec3 uvw) {
            float normVal = texture(uVolumeTex, uvw).r;
            return normVal * 4095.0 - 1024.0;
        }

        // Calcolo della normale tramite differenze centrali nel campo HU
        vec3 computeNormal(vec3 uvw, float eps) {
            float dx = sampleHU(uvw + vec3(eps, 0.0, 0.0)) - sampleHU(uvw - vec3(eps, 0.0, 0.0));
            float dy = sampleHU(uvw + vec3(0.0, eps, 0.0)) - sampleHU(uvw - vec3(0.0, eps, 0.0));
            float dz = sampleHU(uvw + vec3(0.0, 0.0, eps)) - sampleHU(uvw - vec3(0.0, 0.0, eps));
            return normalize(vec3(dx, dy, dz) + 1e-5);
        }

        // Intersezione Raggio - AABB (Axis-Aligned Bounding Box)
        vec2 intersectBox(vec3 orig, vec3 dir, vec3 boxMin, vec3 boxMax) {
            vec3 invDir = 1.0 / dir;
            vec3 tminTmp = (boxMin - orig) * invDir;
            vec3 tmaxTmp = (boxMax - orig) * invDir;
            vec3 tmin = min(tminTmp, tmaxTmp);
            vec3 tmax = max(tminTmp, tmaxTmp);
            float t0 = max(max(tmin.x, tmin.y), tmin.z);
            float t1 = min(min(tmax.x, tmax.y), tmax.z);
            return vec2(t0, t1);
        }

        // Hash veloce per jittering stocastico (elimina gli artefatti "wood-grain" da slicing)
        float hash12(vec2 p) {
            vec3 p3  = fract(vec3(p.xyx) * .1031);
            p3 += dot(p3, p3.yzx + 33.33);
            return fract((p3.x + p3.y) * p3.z);
        }

        void main() {
            vec3 rayDir = normalize(vPosObj - uCamPosObj);

            // Convertiamo il clipping [0..1] nello spazio oggetto [-0.5, +0.5] scalato
            vec3 boxMin = (uClipMin - 0.5) * uVolumeScale;
            vec3 boxMax = (uClipMax - 0.5) * uVolumeScale;

            vec2 tHit = intersectBox(uCamPosObj, rayDir, boxMin, boxMax);
            if (tHit.x > tHit.y || tHit.y < 0.0) {
                discard;
            }
            tHit.x = max(tHit.x, 0.0);

            // Lunghezza massima diagonale del volume
            float maxDist = length(uVolumeScale);
            float stepSize = maxDist / float(uSteps);

            // Jittering del punto di partenza per levigare le superfici volumetriche
            float jitter = hash12(gl_FragCoord.xy) * stepSize;
            float t = tHit.x + jitter;

            vec4 accum = vec4(0.0);
            float maxMIP = -1024.0;

            vec3 lightDir = normalize(uCamPosObj + vec3(0.6, 0.8, 0.5));
            vec3 viewDir = -rayDir;

            float halfWidth = max(uPrimarySharpness * 0.5, 10.0);
            float lowBound  = uPrimaryThreshold - halfWidth;
            float highBound = uPrimaryThreshold + halfWidth;

            for (int i = 0; i < 512; i++) {
                if (i >= uSteps || t > tHit.y || accum.a >= 0.985) break;

                vec3 posObj = uCamPosObj + rayDir * t;
                // Rimappiamo da coordinate scalate a coordinate texture [0..1]^3
                vec3 uvw = (posObj / uVolumeScale) + 0.5;

                float hu = sampleHU(uvw);

                if (uRenderMode == 1) {
                    // Modalità MIP (Raggi X / Proiezione Massima Intensità)
                    maxMIP = max(maxMIP, hu);
                } else {
                    // Modalità Volume Raymarching con Transfer Function Total-Body Universale
                    vec3 sampleCol = vec3(0.0);
                    float sampleAlpha = 0.0;

                    // 1. Contributo Tessuti Secondari di Contesto (-320 HU .. +150 HU)
                    if (uSecondaryOpacity > 0.001 && hu > -320.0 && hu < 160.0) {
                        float secFactor = smoothstep(-320.0, -40.0, hu) * (1.0 - smoothstep(80.0, 160.0, hu));
                        sampleCol = mix(vec3(0.75, 0.35, 0.30), vec3(0.95, 0.68, 0.58), smoothstep(-150.0, 70.0, hu));
                        sampleAlpha = secFactor * uSecondaryOpacity * 0.08;
                    }

                    // 2. Contributo Struttura Primaria Target (Soglia High-Pass oppure Finestra Band-Pass per Polmoni/Organi)
                    float primaryFactor = 0.0;
                    if (uRenderMode == 2) {
                        // Modalità Band-Pass (es. Polmoni -700..-400 HU o Parenchimi Addominali +20..+60 HU)
                        float fadeMargin = max(halfWidth * 0.45, 12.0);
                        if (hu > (lowBound - fadeMargin) && hu < (highBound + fadeMargin)) {
                            float rampIn  = smoothstep(lowBound - fadeMargin, lowBound + fadeMargin * 0.4, hu);
                            float rampOut = 1.0 - smoothstep(highBound - fadeMargin * 0.4, highBound + fadeMargin, hu);
                            primaryFactor = rampIn * rampOut;
                        }
                    } else {
                        // Modalità High-Pass Iso-Soglia (Tessuti Densi, Vasi con MDC, Strutture Iperdense)
                        if (hu > lowBound) {
                            primaryFactor = smoothstep(lowBound, highBound, hu);
                        }
                    }

                    if (primaryFactor > 0.005) {
                        // Mappatura Cromatica dinamica centrata sul range della struttura target
                        vec3 shadowTint = uPrimaryTint * vec3(0.76, 0.62, 0.48);
                        vec3 baseTint   = uPrimaryTint;
                        vec3 peakTint   = mix(uPrimaryTint, vec3(1.0, 1.0, 1.0), 0.72);

                        float normRange = clamp((hu - lowBound) / max(uPrimarySharpness * 1.6, 25.0), 0.0, 1.0);
                        vec3 targetCol = mix(shadowTint, baseTint, smoothstep(0.0, 0.55, normRange));
                        targetCol = mix(targetCol, peakTint, smoothstep(0.55, 1.0, normRange));

                        // Per il parenchima polmonare/vie aeree, riduciamo leggermente la densità per step per dare profondità alveolare/bronchiale
                        float densityScale = (uPrimaryThreshold < -250.0) ? 0.24 : 0.42;
                        float pAlpha = primaryFactor * densityScale * uGlobalAlpha;

                        // Illuminazione 3D Phong sul gradiente locale
                        if (pAlpha > 0.008) {
                            vec3 grad = computeNormal(uvw, 0.008);
                            // Per cavità aeree/polmoni a bassa densità usiamo illuminazione a doppia faccia sul gradiente
                            vec3 normal = (uPrimaryThreshold < -250.0) ? (dot(grad, viewDir) > 0.0 ? grad : -grad) : -grad;

                            float diff = max(dot(normal, lightDir), 0.0);
                            float rim  = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.5);
                            vec3 halfVec = normalize(lightDir + viewDir);
                            float spec = pow(max(dot(normal, halfVec), 0.0), 28.0) * uSpecular;

                            // Se siamo vicini al piano di taglio (Clipping Plane), evidenziamo la sezione interna
                            vec3 distToClip = min( abs(uvw - uClipMin), abs(uvw - uClipMax) );
                            float minClipDist = min(min(distToClip.x, distToClip.y), distToClip.z);
                            float cutHighlight = 1.0 - smoothstep(0.0, 0.012, minClipDist);

                            vec3 litTarget = targetCol * mix(1.0, (0.28 + 0.72 * diff + 0.18 * rim), uShadeStrength) + vec3(spec * 0.85);
                            // Colore sezione tagliata dal bisturi 3D
                            litTarget = mix(litTarget, uPrimaryTint * 0.92, cutHighlight * 0.65);

                            sampleCol = mix(sampleCol, litTarget, primaryFactor);
                            sampleAlpha = max(sampleAlpha, pAlpha);
                        }
                    }

                    // Correzione opacità rispetto al passo di integrazione
                    if (sampleAlpha > 0.0005) {
                        float alphaCorr = 1.0 - pow(1.0 - clamp(sampleAlpha, 0.0, 0.99), stepSize * 180.0);
                        accum.rgb += (1.0 - accum.a) * sampleCol * alphaCorr;
                        accum.a   += (1.0 - accum.a) * alphaCorr;
                    }
                }

                t += stepSize;
            }

            if (uRenderMode == 1) {
                // Output MIP Radiografico
                float mipNorm = smoothstep(uPrimaryThreshold - 300.0, uPrimaryThreshold + 1100.0, maxMIP);
                vec3 xrayCol = mix(vec3(0.04, 0.09, 0.16), vec3(0.88, 0.96, 1.0), mipNorm);
                fragColor = vec4(xrayCol * mipNorm, mipNorm * 0.95);
            } else {
                if (accum.a < 0.005) discard;
                // Leggero tone-mapping e gamma correction
                vec3 finalRGB = pow(clamp(accum.rgb, 0.0, 1.0), vec3(0.95));
                fragColor = vec4(finalRGB, accum.a);
            }
        }
    `
};
