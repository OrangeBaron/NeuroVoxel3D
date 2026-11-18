// =========================================================================
// PARSER DICOM MULTI-SERIE + POSIZIONAMENTO MILLIMETRICO (0020,0032)
// =========================================================================

function initDicomInputListeners() {
    document.getElementById('folderInput').addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            loadDicomFiles(Array.from(e.target.files));
            e.target.value = ''; // Permette di ricaricare la stessa cartella
        }
    });

    document.getElementById('filesInput').addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            loadDicomFiles(Array.from(e.target.files));
            e.target.value = '';
        }
    });

    // Gestione Drag & Drop ricorsivo per cartelle e sottocartelle con file senza estensione
    window.addEventListener('dragover', (e) => {
        e.preventDefault();
        document.getElementById('dropOverlay').classList.remove('hidden');
    });
    window.addEventListener('dragleave', (e) => {
        if (e.relatedTarget === null) {
            document.getElementById('dropOverlay').classList.add('hidden');
        }
    });
    window.addEventListener('drop', async (e) => {
        e.preventDefault();
        document.getElementById('dropOverlay').classList.add('hidden');

        const items = e.dataTransfer.items;
        if (items && items.length > 0) {
            const collectedFiles = [];
            const traverseEntry = async (entry) => {
                if (!entry) return;
                if (entry.isFile) {
                    const file = await new Promise((res) => entry.file(res));
                    collectedFiles.push(file);
                } else if (entry.isDirectory) {
                    const reader = entry.createReader();
                    let batch;
                    do {
                        batch = await new Promise((res) => reader.readEntries(res));
                        for (const child of batch) {
                            await traverseEntry(child);
                        }
                    } while (batch.length > 0);
                }
            };

            const entries = [];
            for (let i = 0; i < items.length; i++) {
                if (items[i].webkitGetAsEntry) {
                    entries.push(items[i].webkitGetAsEntry());
                }
            }

            if (entries.length > 0) {
                for (const entry of entries) {
                    await traverseEntry(entry);
                }
                if (collectedFiles.length > 0) {
                    loadDicomFiles(collectedFiles);
                    return;
                }
            }
        }

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            loadDicomFiles(Array.from(e.dataTransfer.files));
        }
    });
}

// Calcola la coordinata millimetrica reale lungo l'asse normale al piano immagine
// usando ImagePositionPatient (0020,0032) e ImageOrientationPatient (0020,0037)
function computeRealMillimeterCoord(ipp, iop, fallbackLoc) {
    if (Array.isArray(ipp) && ipp.length >= 3 && !isNaN(ipp[0]) && !isNaN(ipp[1]) && !isNaN(ipp[2])) {
        if (Array.isArray(iop) && iop.length >= 6 && !isNaN(iop[0])) {
            // Vettore riga (r) e vettore colonna (c)
            const rx = iop[0], ry = iop[1], rz = iop[2];
            const cx = iop[3], cy = iop[4], cz = iop[5];
            // Normale al piano della fetta: n = r x c
            const nx = ry * cz - rz * cy;
            const ny = rz * cx - rx * cz;
            const nz = rx * cy - ry * cx;
            const normLen = Math.hypot(nx, ny, nz);
            if (normLen > 0.5) {
                // Proiezione scalare in millimetri reali lungo l'asse di acquisizione
                return (ipp[0] * nx + ipp[1] * ny + ipp[2] * nz) / normLen;
            }
        }
        // Se l'orientamento non è specificato, usa la coordinata Z millimetrica di ImagePositionPatient
        return ipp[2];
    }
    return (fallbackLoc !== null && !isNaN(fallbackLoc)) ? fallbackLoc : null;
}

// Rileva se una fetta è uno Scout 2D / Localizer / Topogram o serie accessoria non volumetrica
function isScoutOrAccessorySlice(meta) {
    const imgType = (meta.imageType || "").toUpperCase();
    const desc = (meta.seriesDesc || "").toUpperCase();
    const mod = (meta.modality || "CT").toUpperCase();

    // Scarta modalità non d'immagine (Structured Report, Presentation State, Key Object, ecc.)
    if (["SR", "PR", "KO", "SEG", "RTSTRUCT", "RTPLAN", "DOC"].includes(mod)) return true;

    // Scarta se ImageType (0008,0008) dichiara esplicitamente LOCALIZER / SCOUT
    if (
        imgType.includes("LOCALIZER") ||
        imgType.includes("SCOUT") ||
        imgType.includes("TOPOGRAM") ||
        imgType.includes("SURVIEW") ||
        imgType.includes("SCANOSCOPE") ||
        imgType.includes("PROJECTION")
    ) {
        return true;
    }

    // Scarta se la descrizione della serie indica uno scout / dose report / protocollo
    if (
        desc.includes("SCOUT") ||
        desc.includes("LOCALIZER") ||
        desc.includes("TOPOGRAM") ||
        desc.includes("SURVIEW") ||
        desc.includes("DOSE REPORT") ||
        desc.includes("PATIENT PROTOCOL")
    ) {
        return true;
    }

    return false;
}

// Parser binario DICOM nativo (corretto e completo di 0020,000E / 0020,0032 / 0020,0037 / 0008,0008)
function parseDicomBufferFallback(arrayBuffer, fallbackName = "") {
    const view = new DataView(arrayBuffer);
    const len = view.byteLength;
    if (len < 256) return null;

    let offset = 0;
    const hasDICM = (
        view.getUint8(128) === 0x44 &&
        view.getUint8(129) === 0x49 &&
        view.getUint8(130) === 0x43 &&
        view.getUint8(131) === 0x4D
    );
    if (hasDICM) offset = 132;

    // Variabili dichiarate FUORI dal ciclo while (fix del bug di scope)
    let rows = 0, cols = 0, samplesPerPixel = 1;
    let bitsAllocated = 16, pixelRepresentation = 1;
    let rescaleSlope = 1.0, rescaleIntercept = 0.0;
    let sliceLocation = null, instanceNumber = 0;
    let imagePosition = null, imageOrientation = null;
    let pixelSpacingX = 1.0, pixelSpacingY = 1.0, sliceThickness = 1.0;
    let seriesDesc = "", seriesNumber = 0;
    let seriesUID = "";
    let imageType = "", modality = "CT";
    let transferSyntax = "1.2.840.10008.1.2";
    let pixelDataOffset = -1;

    const readAscii = (start, length) => {
        let s = "";
        for (let i = 0; i < length && (start + i) < len; i++) {
            const c = view.getUint8(start + i);
            if (c >= 32 && c <= 126) s += String.fromCharCode(c);
        }
        return s.trim();
    };

    const longVRs = new Set(["OB", "OW", "OF", "OD", "SQ", "UT", "UN", "UC", "UR", "OL"]);
    let implicitLE = false;

    while (offset + 8 < len) {
        const group = view.getUint16(offset, true);
        const element = view.getUint16(offset + 2, true);

        // Gestione tag di sequenza / delimitatori (FFFE, E000 / E00D / E0DD)
        if (group === 0xFFFE) {
            const seqLen = view.getUint32(offset + 4, true);
            offset += 8 + ((seqLen !== 0xFFFFFFFF && seqLen > 0 && offset + 8 + seqLen <= len) ? seqLen : 0);
            continue;
        }

        const vr1 = String.fromCharCode(view.getUint8(offset + 4), view.getUint8(offset + 5));
        const isExplicit = (group === 0x0002) ? true : (!implicitLE && /^[A-Z]{2}$/.test(vr1));

        let vl = 0;
        let headerSize = 8;

        if (isExplicit) {
            if (longVRs.has(vr1)) {
                vl = view.getUint32(offset + 8, true);
                headerSize = 12;
            } else {
                vl = view.getUint16(offset + 6, true);
                headerSize = 8;
            }
        } else {
            vl = view.getUint32(offset + 4, true);
            headerSize = 8;
        }

        const valOffset = offset + headerSize;

        // Tag PixelData (7FE0, 0010)
        if (group === 0x7FE0 && element === 0x0010) {
            pixelDataOffset = valOffset;
            break;
        }

        // Sequenze con lunghezza indefinita: salta l'header e prosegui
        if (vl === 0xFFFFFFFF || vl < 0 || valOffset + vl > len) {
            offset += headerSize;
            continue;
        }

        if (group === 0x0002 && element === 0x0010) {
            transferSyntax = readAscii(valOffset, vl);
            if (transferSyntax === "1.2.840.10008.1.2") implicitLE = true;
        } else if (group === 0x0008 && element === 0x0008) {
            imageType = readAscii(valOffset, vl);
        } else if (group === 0x0008 && element === 0x0060) {
            modality = readAscii(valOffset, vl) || "CT";
        } else if (group === 0x0008 && element === 0x103E) {
            seriesDesc = readAscii(valOffset, vl);
        } else if (group === 0x0018 && element === 0x0050) {
            sliceThickness = parseFloat(readAscii(valOffset, vl)) || 1.0;
        } else if (group === 0x0020 && element === 0x000E) {
            seriesUID = readAscii(valOffset, vl);
        } else if (group === 0x0020 && element === 0x0011) {
            seriesNumber = parseInt(readAscii(valOffset, vl)) || 0;
        } else if (group === 0x0020 && element === 0x0013) {
            instanceNumber = parseInt(readAscii(valOffset, vl)) || 0;
        } else if (group === 0x0020 && element === 0x0032) {
            // ImagePositionPatient (x\y\z in mm)
            const parts = readAscii(valOffset, vl).split('\\').map(Number);
            if (parts.length >= 3 && !isNaN(parts[2])) imagePosition = parts;
        } else if (group === 0x0020 && element === 0x0037) {
            // ImageOrientationPatient (rx\ry\rz\cx\cy\cz)
            const parts = readAscii(valOffset, vl).split('\\').map(Number);
            if (parts.length >= 6 && !isNaN(parts[0])) imageOrientation = parts;
        } else if (group === 0x0020 && element === 0x1041) {
            sliceLocation = parseFloat(readAscii(valOffset, vl));
        } else if (group === 0x0028 && element === 0x0002) {
            samplesPerPixel = view.getUint16(valOffset, true);
        } else if (group === 0x0028 && element === 0x0010) {
            rows = view.getUint16(valOffset, true);
        } else if (group === 0x0028 && element === 0x0011) {
            cols = view.getUint16(valOffset, true);
        } else if (group === 0x0028 && element === 0x0030) {
            const sp = readAscii(valOffset, vl).split('\\');
            if (sp.length >= 2) {
                pixelSpacingY = parseFloat(sp[0]) || 1.0;
                pixelSpacingX = parseFloat(sp[1]) || 1.0;
            }
        } else if (group === 0x0028 && element === 0x0100) {
            bitsAllocated = view.getUint16(valOffset, true);
        } else if (group === 0x0028 && element === 0x0103) {
            pixelRepresentation = view.getUint16(valOffset, true);
        } else if (group === 0x0028 && element === 0x1052) {
            const val = parseFloat(readAscii(valOffset, vl));
            if (!isNaN(val)) rescaleIntercept = val;
        } else if (group === 0x0028 && element === 0x1053) {
            const val = parseFloat(readAscii(valOffset, vl));
            if (!isNaN(val) && val !== 0) rescaleSlope = val;
        }

        offset = valOffset + vl;
    }

    // Scarta immagini RGB/secondarie (samplesPerPixel > 1) o prive di geometria valida
    if (rows <= 16 || cols <= 16 || samplesPerPixel > 1) return null;

    const metaCheck = { imageType, seriesDesc, modality };
    if (isScoutOrAccessorySlice(metaCheck)) return null;

    const numPixels = rows * cols;
    const bytesPerPixel = Math.max(1, bitsAllocated >> 3);
    const bytesNeeded = numPixels * bytesPerPixel;

    if (pixelDataOffset < 0 || pixelDataOffset + bytesNeeded > len) {
        if (len >= bytesNeeded + 132) {
            pixelDataOffset = len - bytesNeeded;
        } else {
            return null;
        }
    }

    const huSlice = new Int16Array(numPixels);
    let pOff = pixelDataOffset;

    if (bitsAllocated === 16) {
        for (let i = 0; i < numPixels; i++) {
            const raw = (pixelRepresentation === 1)
                ? view.getInt16(pOff, true)
                : view.getUint16(pOff, true);
            pOff += 2;
            const hu = Math.round(raw * rescaleSlope + rescaleIntercept);
            huSlice[i] = Math.max(-1024, Math.min(3071, hu));
        }
    } else if (bitsAllocated === 8) {
        for (let i = 0; i < numPixels; i++) {
            const raw = view.getUint8(pOff++);
            const hu = Math.round(raw * rescaleSlope + rescaleIntercept);
            huSlice[i] = Math.max(-1024, Math.min(3071, hu));
        }
    } else {
        return null;
    }

    const mmCoord = computeRealMillimeterCoord(imagePosition, imageOrientation, sliceLocation);

    return {
        rows,
        cols,
        huSlice,
        hasIPP: Array.isArray(imagePosition) && imagePosition.length >= 3,
        imagePosition,
        imageOrientation,
        mmCoord, // Coordinata millimetrica reale lungo l'asse della serie
        instanceNumber,
        pixelSpacingX,
        pixelSpacingY,
        sliceThickness,
        seriesDesc: seriesDesc || fallbackName,
        seriesNumber,
        seriesUID: seriesUID || "series_fallback_default",
        imageType,
        modality
    };
}

// Estrae un tag stringa grezzo da Daikon se il metodo helper non esiste
function getDaikonTagString(image, group, element) {
    try {
        if (image && image.tags) {
            const key = daikon.Tag.createKey(group, element);
            const tag = image.tags[key];
            if (tag && tag.value) {
                return Array.isArray(tag.value) ? tag.value.join('\\') : String(tag.value);
            }
        }
    } catch (e) {}
    return "";
}

async function loadDicomFiles(fileList) {
    // Accetta file con o senza estensione in qualsiasi sottocartella, ignorando solo file di sistema noti
    const candidateFiles = fileList.filter(f => {
        const name = f.name.toLowerCase();
        return (
            !name.startsWith('.') &&
            name !== 'dicomdir' &&
            name !== 'thumbs.db' &&
            name !== 'desktop.ini' &&
            !name.endsWith('.xml') &&
            !name.endsWith('.txt') &&
            !name.endsWith('.html') &&
            !name.endsWith('.pdf') &&
            !name.endsWith('.jpg') &&
            !name.endsWith('.jpeg') &&
            !name.endsWith('.png') &&
            !name.endsWith('.exe') &&
            !name.endsWith('.dll') &&
            !name.endsWith('.zip') &&
            f.size > 512
        );
    });

    if (candidateFiles.length === 0) {
        showToast("Nessun file DICOM valido trovato nella selezione.", true);
        return;
    }

    const overlay = document.getElementById('loadingOverlay');
    const bar = document.getElementById('loadingBar');
    const sub = document.getElementById('loadingSub');
    overlay.classList.remove('hidden');
    document.getElementById('loadingTitle').textContent = `Scansione di ${candidateFiles.length} file nelle cartelle...`;

    const parsedSlices = [];
    let discardedScoutCount = 0;

    for (let i = 0; i < candidateFiles.length; i++) {
        const f = candidateFiles[i];
        if (i % 12 === 0 || i === candidateFiles.length - 1) {
            const pct = Math.round(((i + 1) / candidateFiles.length) * 85);
            bar.style.width = `${pct}%`;
            sub.textContent = `Lettura header e pixel ${i + 1} / ${candidateFiles.length}`;
            await new Promise(r => setTimeout(r, 0));
        }

        try {
            const buf = await f.arrayBuffer();
            let sliceObj = null;

            // 1. Tentativo primario con Daikon (supporta anche sintassi compresse JPEG/RLE)
            if (window.daikon) {
                try {
                    const dataView = new DataView(buf);
                    const image = daikon.Series.parseImage(dataView);
                    if (image && image.hasPixelData()) {
                        const imageType = getDaikonTagString(image, 0x0008, 0x0008);
                        const modality = image.getModality ? (image.getModality() || "CT") : getDaikonTagString(image, 0x0008, 0x0060);
                        const seriesDesc = image.getSeriesDescription() || "";

                        if (isScoutOrAccessorySlice({ imageType, seriesDesc, modality })) {
                            discardedScoutCount++;
                            continue;
                        }

                        const rows = image.getRows();
                        const cols = image.getCols();
                        const interpreted = image.getInterpretedData(false, false);

                        if (rows > 16 && cols > 16 && interpreted && interpreted.length >= rows * cols) {
                            const huSlice = new Int16Array(rows * cols);
                            for (let p = 0; p < rows * cols; p++) {
                                huSlice[p] = Math.max(-1024, Math.min(3071, Math.round(interpreted[p])));
                            }
                            const ipp = image.getImagePosition(); // (0020,0032) [x, y, z]
                            const iop = image.getImageDirections ? image.getImageDirections() : null; // (0020,0037)
                            const sp = image.getPixelSpacing();
                            const sliceLoc = image.getSliceLocation();
                            const hasIPP = Array.isArray(ipp) && ipp.length >= 3 && !isNaN(ipp[2]);
                            const mmCoord = computeRealMillimeterCoord(ipp, iop, sliceLoc);

                            // Cartella padre come descrizione di fallback se SeriesDescription è vuoto
                            const relPath = f.webkitRelativePath || f.name;
                            const folderHint = relPath.includes('/') ? relPath.split('/').slice(-2, -1)[0] : f.name;

                            sliceObj = {
                                rows,
                                cols,
                                huSlice,
                                hasIPP,
                                imagePosition: hasIPP ? ipp : null,
                                imageOrientation: iop,
                                mmCoord,
                                instanceNumber: image.getImageNumber() || 0,
                                pixelSpacingX: (sp && sp.length >= 2 && sp[1] > 0) ? sp[1] : 1.0,
                                pixelSpacingY: (sp && sp.length >= 2 && sp[0] > 0) ? sp[0] : 1.0,
                                sliceThickness: image.getSliceThickness() || 1.0,
                                seriesDesc: seriesDesc || `Serie ${folderHint}`,
                                seriesNumber: image.getSeriesNumber ? (image.getSeriesNumber() || 0) : 0,
                                seriesUID: image.getSeriesInstanceUID() || image.getSeriesId() || `series_${folderHint}`,
                                imageType,
                                modality: modality || "CT"
                            };
                        }
                    }
                } catch (daikonErr) {}
            }

            // 2. Fallback binario diretto
            if (!sliceObj) {
                const relPath = f.webkitRelativePath || f.name;
                const folderHint = relPath.includes('/') ? relPath.split('/').slice(-2, -1)[0] : f.name;
                sliceObj = parseDicomBufferFallback(buf, `Serie ${folderHint}`);
            }

            if (sliceObj && sliceObj.rows > 16 && sliceObj.cols > 16) {
                parsedSlices.push(sliceObj);
            }
        } catch (err) {
            console.warn("File ignorato:", f.name, err);
        }
    }

    if (parsedSlices.length === 0) {
        overlay.classList.add('hidden');
        showToast("Impossibile decodificare serie volumetriche valide dai file selezionati.", true);
        return;
    }

    // --- RAGGRUPPAMENTO PER SeriesInstanceUID (0020,000E) E FILTRO SERIE ACCESSORIE ---
    const rawGroups = {};
    for (const s of parsedSlices) {
        const uid = (s.seriesUID || "series_default").trim();
        if (!rawGroups[uid]) rawGroups[uid] = [];
        rawGroups[uid].push(s);
    }

    LoadedSeriesMap = {};
    const validSeriesList = [];

    for (const uid of Object.keys(rawGroups)) {
        let slices = rawGroups[uid];

        // 1. Filtra solo le fette che hanno ImagePositionPatient (0020,0032) o coordinata millimetrica valida
        const withCoords = slices.filter(s => s.mmCoord !== null && !isNaN(s.mmCoord));
        if (withCoords.length >= 5) {
            slices = withCoords;
        }

        // 2. Mantiene solo la risoluzione dominante (rows x cols) dentro la serie,
        // scartando eventuali immagini riepilogative / localizer annidate nella stessa serie
        const resCounts = {};
        let domKey = "";
        let domMax = 0;
        for (const s of slices) {
            const k = `${s.rows}x${s.cols}`;
            resCounts[k] = (resCounts[k] || 0) + 1;
            if (resCounts[k] > domMax) {
                domMax = resCounts[k];
                domKey = k;
            }
        }
        slices = slices.filter(s => `${s.rows}x${s.cols}` === domKey);

        // 3. Ordinamento per coordinata millimetrica reale (0020,0032) - MAI alfabetico!
        slices.sort((a, b) => {
            if (a.mmCoord !== null && b.mmCoord !== null) {
                return a.mmCoord - b.mmCoord;
            }
            return a.instanceNumber - b.instanceNumber;
        });

        // 4. Deduplica fette alla medesima coordinata millimetrica (< 0.01 mm, es. ricostruzioni doppie)
        const uniqueSlices = [];
        for (const s of slices) {
            if (
                uniqueSlices.length === 0 ||
                s.mmCoord === null ||
                Math.abs(s.mmCoord - uniqueSlices[uniqueSlices.length - 1].mmCoord) > 0.01
            ) {
                uniqueSlices.push(s);
            }
        }

        // 5. Calcola l'estensione fisica in millimetri lungo Z
        const firstMM = uniqueSlices[0]?.mmCoord ?? 0;
        const lastMM = uniqueSlices[uniqueSlices.length - 1]?.mmCoord ?? 0;
        const spanMM = Math.abs(lastMM - firstMM);

        // Scarta serie accessorie/scout che hanno meno di 5 fette o estensione millimetrica quasi nulla (< 2 mm)
        if (uniqueSlices.length < 5 || (uniqueSlices[0].hasIPP && spanMM < 2.0)) {
            discardedScoutCount += uniqueSlices.length;
            continue;
        }

        const avgStepMM = spanMM / (uniqueSlices.length - 1);
        const seriesInfo = {
            uid,
            slices: uniqueSlices,
            count: uniqueSlices.length,
            rows: uniqueSlices[0].rows,
            cols: uniqueSlices[0].cols,
            minMM: firstMM,
            maxMM: lastMM,
            spanMM,
            avgStepMM: (avgStepMM > 0.05 && avgStepMM < 30.0) ? avgStepMM : (uniqueSlices[0].sliceThickness || 1.0),
            seriesNumber: uniqueSlices[0].seriesNumber || 0,
            seriesDesc: uniqueSlices[0].seriesDesc || `Serie #${uniqueSlices[0].seriesNumber || 1}`
        };

        LoadedSeriesMap[uid] = seriesInfo;
        validSeriesList.push(seriesInfo);
    }

    // Fallback nel caso l'utente abbia caricato intenzionalmente pochissimi file (< 5)
    if (validSeriesList.length === 0) {
        const fallbackUID = Object.keys(rawGroups)[0];
        const slices = rawGroups[fallbackUID];
        slices.sort((a, b) => (a.mmCoord ?? a.instanceNumber) - (b.mmCoord ?? b.instanceNumber));
        const firstMM = slices[0]?.mmCoord ?? 0;
        const lastMM = slices[slices.length - 1]?.mmCoord ?? (slices.length - 1);
        const spanMM = Math.max(1.0, Math.abs(lastMM - firstMM));
        const fallbackSeries = {
            uid: fallbackUID,
            slices,
            count: slices.length,
            rows: slices[0].rows,
            cols: slices[0].cols,
            minMM: firstMM,
            maxMM: lastMM,
            spanMM,
            avgStepMM: slices.length > 1 ? spanMM / (slices.length - 1) : (slices[0].sliceThickness || 1.0),
            seriesNumber: slices[0].seriesNumber || 1,
            seriesDesc: slices[0].seriesDesc || "Serie Caricata"
        };
        LoadedSeriesMap[fallbackUID] = fallbackSeries;
        validSeriesList.push(fallbackSeries);
    }

    // Ordina le serie nella UI: prima quella con più fette e risoluzione assiale più densa
    validSeriesList.sort((a, b) => b.count - a.count);

    // Popola il menu a tendina per selezionare tra le serie (0020,000E)
    const selectorContainer = document.getElementById('seriesSelectorContainer');
    const selectEl = document.getElementById('seriesSelect');
    const badgeEl = document.getElementById('seriesCountBadge');

    selectEl.innerHTML = '';
    validSeriesList.forEach((s, idx) => {
        const opt = document.createElement('option');
        opt.value = s.uid;
        const stepStr = s.avgStepMM.toFixed(2);
        opt.textContent = `${idx + 1}. ${s.seriesDesc} — ${s.count} fette (${s.cols}×${s.rows}, Δz ${stepStr} mm)`;
        selectEl.appendChild(opt);
    });

    badgeEl.textContent = `${validSeriesList.length} serie`;
    if (validSeriesList.length > 1) {
        selectorContainer.classList.remove('hidden');
    } else {
        selectorContainer.classList.remove('hidden'); // Visibile anche con 1 serie per confermare l'UID selezionato
    }

    sub.textContent = `Ricostruzione volume in coordinate millimetriche reali...`;
    bar.style.width = `95%`;
    await new Promise(r => setTimeout(r, 20));

    // Attiva la serie principale
    await activateSeriesByUID(validSeriesList[0].uid, discardedScoutCount);
    overlay.classList.add('hidden');
}

// Costruisce il volume 3D posizionando ogni fetta in base alla sua coordinata millimetrica reale (0020,0032)
async function activateSeriesByUID(uid, discardedScoutCount = 0) {
    const series = LoadedSeriesMap[uid];
    if (!series || !series.slices || series.slices.length === 0) return;

    const validSlices = series.slices;
    const origW = series.cols;
    const origH = series.rows;
    const origD = validSlices.length;

    const targetW = Math.min(256, origW);
    const targetH = Math.min(256, origH);
    const targetD = Math.min(256, origD);

    const volumeHU = new Int16Array(targetW * targetH * targetD);
    let minH = 3071, maxH = -1024;

    const zMinMM = validSlices[0].mmCoord ?? 0;
    const zMaxMM = validSlices[origD - 1].mmCoord ?? (origD - 1);
    const totalSpanMM = zMaxMM - zMinMM;
    const useRealMM = validSlices[0].hasIPP && Math.abs(totalSpanMM) > 0.5 && origD > 1;

    // Pre-calcola la mappa di campionamento X e Y
    const xMap = new Int32Array(targetW);
    const yMap = new Int32Array(targetH);
    for (let x = 0; x < targetW; x++) xMap[x] = Math.min(origW - 1, Math.floor((x / targetW) * origW));
    for (let y = 0; y < targetH; y++) yMap[y] = Math.min(origH - 1, Math.floor((y / targetH) * origH));

    let searchIdx = 0;

    for (let z = 0; z < targetD; z++) {
        const u = (targetD > 1) ? (z / (targetD - 1)) : 0.0;

        if (useRealMM) {
            // Coordinata millimetrica fisica esatta del piano Z corrente nel volume 3D
            const targetMM = zMinMM + u * totalSpanMM;

            // Ricerca binaria/monotona delle due fette reali che racchiudono targetMM
            while (searchIdx < origD - 2 && validSlices[searchIdx + 1].mmCoord < targetMM) {
                searchIdx++;
            }
            const s0 = validSlices[searchIdx];
            const s1 = validSlices[Math.min(origD - 1, searchIdx + 1)];
            const denom = (s1.mmCoord - s0.mmCoord);
            const alpha = (Math.abs(denom) > 1e-4)
                ? Math.max(0.0, Math.min(1.0, (targetMM - s0.mmCoord) / denom))
                : 0.0;

            const sliceA = s0.huSlice;
            const sliceB = s1.huSlice;
            const zOffset = z * targetW * targetH;

            // Interpolazione lineare lungo la coordinata millimetrica reale Z
            for (let y = 0; y < targetH; y++) {
                const rowOff = yMap[y] * origW;
                const dstRow = zOffset + y * targetW;
                for (let x = 0; x < targetW; x++) {
                    const srcIdx = rowOff + xMap[x];
                    const val = Math.round(sliceA[srcIdx] * (1.0 - alpha) + sliceB[srcIdx] * alpha);
                    volumeHU[dstRow + x] = val;
                    if (val < minH) minH = val;
                    if (val > maxH) maxH = val;
                }
            }
        } else {
            // Fallback per serie prive di tag 0020,0032
            const srcZ = Math.min(origD - 1, Math.floor(u * (origD - 1)));
            const sliceData = validSlices[srcZ].huSlice;
            const zOffset = z * targetW * targetH;
            for (let y = 0; y < targetH; y++) {
                const rowOff = yMap[y] * origW;
                const dstRow = zOffset + y * targetW;
                for (let x = 0; x < targetW; x++) {
                    const val = sliceData[rowOff + xMap[x]];
                    volumeHU[dstRow + x] = val;
                    if (val < minH) minH = val;
                    if (val > maxH) maxH = val;
                }
            }
        }
    }

    // Spaziatura fisica millimetrica reale del voxel ricostruito
    const dzRealMM = series.avgStepMM;

    VolumeState.width = targetW;
    VolumeState.height = targetH;
    VolumeState.depth = targetD;
    VolumeState.spacingX = validSlices[0].pixelSpacingX * (origW / targetW);
    VolumeState.spacingY = validSlices[0].pixelSpacingY * (origH / targetH);
    VolumeState.spacingZ = dzRealMM * (origD / targetD);
    VolumeState.huData = volumeHU;
    VolumeState.minHU = minH;
    VolumeState.maxHU = maxH;
    VolumeState.seriesTitle = `${series.seriesDesc} (${origD} fette)`;
    VolumeState.modality = `CT • Δz ${dzRealMM.toFixed(2)}mm`;

    uploadVolumeToGPU();

    // Mostra nel box metadati il range millimetrico reale Z coperto dalla serie
    document.getElementById('metaHURange').textContent = `${zMinMM.toFixed(0)}..${zMaxMM.toFixed(0)}mm`;

    const totalSeries = Object.keys(LoadedSeriesMap).length;
    const scoutNote = discardedScoutCount > 0 ? ` (${discardedScoutCount} scout/accessori scartati)` : '';
    showToast(`Serie attiva: "${series.seriesDesc}" • ${origD} fette posizionate in mm reali su ${totalSeries} serie${scoutNote}`);
}

// Registra subito i listener di input file e drag & drop
initDicomInputListeners();
