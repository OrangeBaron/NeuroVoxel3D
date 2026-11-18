# 🧠 NeuroVoxel 3D

**NeuroVoxel 3D** è un visualizzatore volumetrico **total-body** ad alte prestazioni basato su **WebGL2 Raymarching** e fette **DICOM/TAC**, eseguito interamente in locale nel browser (client-side). Progettato con un'interfaccia ispirata alle stazioni di lavoro PACS ospedaliere, permette di esplorare scansioni TC di qualsiasi distretto anatomico (cranio, torace, addome, apparato vascolare e muscolo-scheletrico) in **Unità Hounsfield (HU)** reali, applicare preset dedicati, affettare volumi 3D in tempo reale e analizzare fette multiplanari (MPR) con sonda densitometrica.

---

## ✨ Caratteristiche Principali

* 🩻 **Rendering Volumetrico Diretto Total-Body (Raymarching WebGL2):** Nessuna estrazione di mesh (marching cubes lenta); il raymarcher attraversa direttamente il campo scalare 3D calcolando gradienti, ombreggiature di Phong e trasparenze a livello di sub-voxel, con supporto sia a soglia **High-Pass** (tessuti ad alta densità, angio) sia a finestra **Band-Pass** (parenchima polmonare, organi addominali).
* 📂 **Parser DICOM Multi-Serie Intelligente:** Supporto nativo per fette DICOM multiple e cartelle intere (tramite selettore standard e Drag & Drop ricorsivo). Il sistema raggruppa le serie per `SeriesInstanceUID (0020,000E)`, scarta automaticamente scout/localizer e serie accessorie non volumetriche, e ricostruisce il volume posizionando le fette in base alle **coordinate millimetriche reali** (`ImagePositionPatient` + `ImageOrientationPatient`), preservando le proporzioni anatomiche reali.
* 📐 **Ricostruzione Multiplanare 2D (MPR) Sincronizzata:** Tre piani anatomici (**Assiale Z**, **Coronale Y**, **Sagittale X**) con controllo della finestra radiologica (WL/WW) e lettura istantanea della densità (HU) e del tipo di tessuto al passaggio del mouse. È possibile **sincronizzare il taglio 3D alla quota esatta della fetta 2D** in visualizzazione.
* ✂️ **Affettamento Libero 3D (Clipping Box):** Taglia il volume lungo i tre assi anatomici (Sagittale X, Coronale Y, Assiale Z) per ispezionare in tempo reale le sezioni interne di qualsiasi distretto anatomico.
* 🎨 **Preset Anatomici Total-Body & Illuminazione Avanzata:** 7 preset rapidi (**Tessuti ad Alta Densità**, **Ibrido Multi-Tessuto**, **Polmoni / Vie Aeree**, **Addome / Organi**, **Angio MDC**, **Iperdensità Estrema**, **Lastra MIP**) combinati con controlli per specularità Phong, shading direzionale, qualità del raymarching (steps) e mappatura cromatica personalizzabile.
* ⚡ **Zero Installazione / 100% Privacy:** Nessun dato sensibile o file medico viene caricato su server remoti; il parsing, l'ordinamento e il rendering avvengono interamente in locale nella GPU dell'utente.

---

## 🛠️ Stack Tecnologico

* **HTML5 / CSS3 / JavaScript ES6+**
* **WebGL2 Shading Language (GLSL ES 3.00):** Motore di calcolo parallelo su GPU per il volume raymarching e il calcolo delle Hounsfield Units.
* **Tailwind CSS:** Per un'interfaccia utente "glassmorphism" moderna, reattiva e in stile Dark Mode PACS.
* **Daikon DICOM Parser:** Per la lettura robusta dei metadati e dei tag DICOM standard (con fallback binario nativo integrato).

---

## 📁 Struttura del Progetto

* `index.html` — Markup principale dell'interfaccia PACS.
* `css/styles.css` — Stili custom (slider medicali, pannelli glassmorphism, scrollbar, griglia viewport).
* `js/state.js` — Stato globale del volume (`VolumeState`), telecamera (`Camera`) e serie caricate.
* `js/shaders.js` — Vertex e Fragment Shader GLSL ES 3.00 per il raymarching volumetrico.
* `js/webgl.js` — Inizializzazione WebGL2, upload texture 3D, controlli orbitali e render loop.
* `js/mpr.js` — Viste 2D multiplanari (Assiale, Coronale, Sagittale), sonda HU e sincronizzazione tagli.
* `js/ui-controls.js` — Preset anatomici, transfer function, clipping 3D, screenshot e notifiche toast.
* `js/phantom.js` — Generatore procedurale del Volume Demo 3D in Unità Hounsfield.
* `js/dicom-parser.js` — Caricamento cartelle/file, Drag & Drop, parser DICOM multi-serie e ricostruzione volumetrica.
* `js/main.js` — Bootstrap dell'applicazione.

---

## 📖 Guida all'Uso

### 1. Caricamento Dati

* **Volume Demo 3D:** All'apertura, genera automaticamente un **Phantom Procedurale (HR-CT)** multi-densità in Unità Hounsfield (tessuti molli, vie aeree, vasi e strutture ad alta densità) per testare subito le funzionalità.
* **DICOM Reali:** Usa i pulsanti in alto per caricare una cartella intera o file multipli `.dcm`, oppure **trascina direttamente file o cartelle** nella finestra del browser. Se vengono rilevate più serie, apparirà un menu a tendina a sinistra per passare da una all'altra.

### 2. Navigazione 3D (Viewport Centrale)

* **Rotazione:** Clicca e trascina con il *tasto sinistro*.
* **Spostamento (Pan):** Clicca e trascina con il *tasto destro* (o `Shift` + tasto sinistro).
* **Zoom:** Usa la *rotellina del mouse*.
* **HUD (In alto a sinistra):** Usa i pulsanti rapidi per impostare viste standard (**Frontale (Cor)**, **Profilo (Sag)**, **Assiale (Sup)**, **Vista Isometrica**) o per attivare la rotazione automatica (**🔄 Cinema**).
* **Screenshot:** L'icona della fotocamera in alto a destra permette di salvare un'istantanea PNG del modello 3D.

### 3. Controlli di Rendering (Pannello Sinistro)

* **Preset Anatomici 3D:** Cambia rapidamente modalità di visualizzazione (es. *Tessuti ad Alta Densità*, *Polmoni / Vie Aeree*, *Addome / Organi*, *Angio MDC*, *Lastra MIP*).
* **Trasparenza & Soglie Tessuti:** Regola la *Soglia Primaria (Iso-HU)*, la *Finestra / Contrasto Struttura Target*, l'*Opacità Tessuti Molli di Contesto* (per visualizzare i tessuti circostanti come velo semitrasparente) e la *Densità Globale Volume*.
* **Illuminazione & Qualità 3D:** Regola il *Riflesso Speculare*, l'*Incisione Anatomica (Shading)*, i *Passi Raymarching* (da 96 a 512 step) e la *Mappatura Cromatica (Color Map)*.

### 4. Affettamento e Fette 2D (Pannello Destro)

* **Affettamento Libero 3D:** Usa gli slider X, Y, Z per sezionare il volume 3D in tempo reale.
* **Fette TAC 2D (MPR):** Scorri le immagini Assiali, Coronali e Sagittali.
* **Sonda HU:** Passa il mouse sulle fette 2D per leggere il valore Hounsfield esatto e la classificazione del tessuto in quel punto.
* **Sincronizzazione 3D (✂️):** Sotto ogni fetta 2D è presente un pulsante per tagliare il modello 3D esattamente alla quota dell'immagine 2D in visualizzazione.
* **Finestra 2D (WL/WW):** Usa i preset in basso (**Alta Densità**, **Tessuti Molli**, **Polmone/Aria**) per ottimizzare il contrasto delle immagini 2D.
