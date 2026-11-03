# 🧠 NeuroVoxel 3D

**NeuroVoxel 3D** è un visualizzatore volumetrico ad alte prestazioni basato su **WebGL2 Raymarching** e fette **DICOM/TAC**, eseguito interamente in locale nel browser (client-side). Progettato con un'interfaccia ispirata alle stazioni di lavoro PACS ospedaliere, permette di esplorare scansioni TC in **Unità Hounsfield (HU)** reali, applicare preset anatomici, affettare volumi 3D in tempo reale e analizzare fette multiplanari (MPR) con sonda densitometrica.

---

## ✨ Caratteristiche Principali

* 💀 **Rendering Volumetrico Diretto (Raymarching WebGL2):** Nessuna estrazione di mesh (marching cubes lenta); il raymarcher attraversa direttamente il campo scalare 3D calcolando gradienti, ombreggiature di Phong e trasparenze a livello di sub-voxel.
* 📂 **Parser DICOM Multi-Serie Intelligente:** Supporto nativo per fette DICOM multiple e cartelle intere (tramite API standard e Drag & Drop). Il sistema rileva automaticamente esami multi-serie, scarta le immagini "scout/localizer" e ricostruisce il volume posizionando le fette in base alle **coordinate millimetriche reali** (ImagePositionPatient), garantendo proporzioni anatomiche perfette.
* 📐 **Ricostruzione Multiplanare 2D (MPR) Sincronizzata:** Tre piani anatomici (**Assiale Z**, **Coronale Y**, **Sagittale X**) con controllo dinamico di finestra radiologica (Window/Level) e lettura istantanea della densità (HU) al passaggio del mouse. È possibile **sincronizzare il taglio 3D alla quota esatta della fetta 2D** in visualizzazione.
* ✂️ **Bisturi 3D a Box di Clipping Libero:** Taglia il volume lungo i tre assi per rimuovere la calotta cranica, esplorare le cavità dei seni paranasali o esaminare strutture interne complesse.
* 🎨 **Preset Anatomici e Illuminazione Avanzata:** Preset rapidi (Teschio, Osso + Cute, Angio, Lastra MIP) combinati con controlli avanzati per l'illuminazione speculare, l'incisione anatomica (shading), la qualità del raymarching (steps) e palette di colori personalizzate per l'osso.
* ⚡ **Zero Installazione / 100% Privacy:** Nessun dato sensibile o file medico viene caricato su server remoti; il parsing, l'ordinamento e il rendering avvengono interamente in locale nella GPU dell'utente.

---

## 🛠️ Stack Tecnologico

* **HTML5 / CSS3 / JavaScript ES6+**
* **WebGL2 Shading Language (GLSL ES 3.00):** Motore di calcolo parallelo su GPU per il volume raymarching e il calcolo delle Hounsfield Units.
* **Tailwind CSS:** Per un'interfaccia utente "glassmorphism" moderna, reattiva e in stile Dark Mode PACS.
* **Daikon DICOM Parser:** Per la lettura robusta dei metadati e dei tag DICOM standard (con fallback binario di sicurezza).

---

## 📖 Guida all'Uso

### 1. Caricamento Dati
* **Teschio Demo:** All'apertura, genera un "Teschio TAC Sintetico" in alta risoluzione per testare subito le funzionalità.
* **DICOM Reali:** Usa i pulsanti in alto per caricare una cartella intera o file multipli `.dcm`. In alternativa, **trascina direttamente i file** nella finestra del browser. Se vengono rilevate più serie, apparirà un menu a tendina a sinistra per passare da una all'altra.

### 2. Navigazione 3D (Viewport Centrale)
* **Rotazione:** Clicca e trascina con il *tasto sinistro*.
* **Spostamento (Pan):** Clicca e trascina con il *tasto destro* (o Shift + tasto sinistro).
* **Zoom:** Usa la *rotellina del mouse*.
* **HUD (In alto a sinistra):** Usa i pulsanti rapidi per impostare viste standard (Frontale, Profilo, Assiale, 3/4) o per attivare la **Rotazione Automatica (Cinema)**.
* **Screenshot:** L'icona della fotocamera in alto a destra permette di salvare un'istantanea PNG ad alta risoluzione del modello 3D.

### 3. Controlli di Rendering (Pannello Sinistro)
* **Preset Anatomici:** Cambia rapidamente modalità di visualizzazione (es. da Osso a Lastra MIP radiografica).
* **Soglie e Trasparenza:** Usa gli slider per decidere esattamente quali densità (HU) visualizzare. Puoi rendere la pelle semi-trasparente per vedere lo scheletro sottostante.
* **Illuminazione e Qualità:** Regola la lucentezza (specularità), le ombre e aumenta i "Passi Raymarching" se desideri una qualità d'immagine superiore (a costo di un po' di prestazioni). Puoi anche cambiare la tonalità dell'osso.

### 4. Affettamento e Fette 2D (Pannello Destro)
* **Affettamento Libero 3D:** Usa gli slider X, Y, Z per sezionare il modello 3D in tempo reale.
* **Fette TAC 2D (MPR):** Scorri le immagini Assiali, Coronali e Sagittali.
* **Sonda HU:** Passa il mouse sulle fette 2D per leggere il valore Hounsfield esatto e il tipo di tessuto in quel punto.
* **Sincronizzazione 3D (✂️):** Sotto ogni fetta 2D c'è un pulsante. Cliccandolo, il modello 3D verrà tagliato esattamente alla quota dell'immagine 2D che stai osservando, permettendoti di ispezionare il volume in modo mirato.
* **Finestra 2D (W/L):** Usa i preset in basso per ottimizzare il contrasto delle immagini 2D (Osso, Tessuti Molli, Aria/Seni).