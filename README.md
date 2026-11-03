# 🧠 NeuroVoxel 3D

**NeuroVoxel 3D** è un visualizzatore volumetrico ad alte prestazioni basato su **WebGL2 Raymarching** e fette **DICOM/TAC**, eseguito interamente in locale nel browser (client-side). Progettato con un'interfaccia ispirata alle stazioni di lavoro PACS ospedaliere, permette di esplorare scansioni TC in **Unità Hounsfield (HU)** reali, applicare preset anatomici, affettare volumi 3D in tempo reale e analizzare fette multiplanari (MPR) con sonda densitometrica.

---

## ✨ Caratteristiche Principali

* 💀 **Rendering Volumetrico Direttissimo (Raymarching WebGL2):** Nessuna estrazione di mesh (marching cubes lenta); il raymarcher attraversa direttamente il campo scalare 3D calcolando gradienti, ombreggiature di Phong e trasparenze a livello di sub-voxel.
* 📂 **Parser DICOM Universale Nato per il Browser:** Supporto nativo per fette DICOM multiple e cartelle intere tramite API standard (`webkitdirectory` e Drag & Drop) con integrazione della libreria *Daikon* e fallback binario robusto per file little-endian espliciti/impliciti.
* 📐 **Ricostruzione Multiplanare 2D (MPR):** Tre piani anatomici sincronizzati (**Assiale Z**, **Coronale Y**, **Sagittale X**) con controllo dinamico di finestra radiologica (Window/Level) e lettura istantanea della densità in Unità Hounsfield (HU) al passaggio del mouse.
* ✂️ **Bisturi 3D a Box di Clipping Libero:** Taglia il volume lungo i tre assi anatomici per rimuovere la calotta cranica o esplorare le cavità dei seni paranasali e l'orecchio interno.
* 🎨 **Preset Anatomici e Color Mapping:** Teschio puro, Osso + Tessuti molli semitrasparenti (Alpha Blending), Alta Densità (MDC/Smalto) e Lastra MIP (Proiezione Massima Intensità).
* ⚡ **Zero Installazione / 100% Privacy:** Nessun dato viene caricato su server remoti; l'elaborazione e il parsing avvengono interamente in locale nella GPU dell'utente.

---

## 🛠️ Stack Tecnologico

* **HTML5 / CSS3 / JavaScript ES6+**
* **Tailwind CSS** (per un'interfaccia moderna in stile Dark Mode PACS)
* **WebGL2 Shading Language (GLSL ES 3.00)** (per il calcolo parallelo del volume raymarching su GPU)
* **Daikon DICOM Parser** (per il parsing dei metadati e tag DICOM standard)
* **Google Fonts** (Inter & JetBrains Mono)

---

## 📖 Guida all'Uso

1. **Demo Immediata:** All'apertura, l'applicazione genera automaticamente un **Teschio TAC Sintetico ad Alta Risoluzione** con valori in Unità Hounsfield realistici. Puoi subito ruotarlo cliccando e trascinando il mouse.
2. **Caricare Cartelle DICOM:** Clicca su **"Carica Cartella DICOM"** o trascina una cartella contenente le fette `.dcm` direttamente all'interno della finestra del browser.
3. **Esplorazione 3D (Viewport Centrale):**
   * *Trascina con tasto sinistro:* Ruota il teschio nello spazio 3D.
   * *Trascina con tasto destro (o Shift + Sinistro):* Sposta (Pan) la vista.
   * *Rotellina del mouse:* Zoom avanti / indietro.
4. **Modifica Soglie Tessuti (Sidebar Sinistra):** Regola la *Soglia Osso (HU)* e l'opacità dei *Tessuti Molli* per evidenziare dettagli specifici o rimuovere la cute.
5. **Tagli e Affettamento (Sidebar Destra):** Utilizza i cursori dell'Asse X, Y e Z per sezionare liberamente il volume in tempo reale e ispezionare le strutture anatomiche interne.
