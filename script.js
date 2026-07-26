let recorder;
let chunks = [];
let scripts = JSON.parse(localStorage.getItem('my_monologues')) || {};
let isRecording = false;
let mediaStream = null;
let canvasStream = null;
let animationId = null;
let videoElement = null;

// Elementi DOM
const setupScreen = document.getElementById('setup-screen');
const recScreen = document.getElementById('recording-screen');
const prompterText = document.getElementById('prompter-text');
const prompterOverlay = document.getElementById('prompter-overlay');
const liveFontInput = document.getElementById('live-font-size');
const liveFontVal = document.getElementById('live-font-val');
const titleInput = document.getElementById('script-title');
const textArea = document.getElementById('input-text');
const selector = document.getElementById('script-selector');
const preview = document.getElementById('preview');
const recBtn = document.getElementById('recBtn');

// Carica script iniziale e font size salvato
updateSelector();
loadSavedFontSize();

// Gestione Font Live
liveFontInput.oninput = () => {
  const size = liveFontInput.value + "px";
  prompterText.style.fontSize = size;
  liveFontVal.innerText = size;
  localStorage.setItem('preferred_font_size', liveFontInput.value);
};

function loadSavedFontSize() {
  const savedSize = localStorage.getItem('preferred_font_size') || 45;
  liveFontInput.value = savedSize;
  prompterText.style.fontSize = savedSize + "px";
  liveFontVal.innerText = savedSize + "px";
}

// Selettore Monologhi
selector.onchange = () => {
  const selectedTitle = selector.value;
  if (selectedTitle && scripts[selectedTitle]) {
    titleInput.value = selectedTitle;
    textArea.value = scripts[selectedTitle];
  } else {
    titleInput.value = "";
    textArea.value = "";
  }
};

function saveCurrentScript() {
  const title = titleInput.value.trim();
  const content = textArea.value.trim();
  if (!title || !content) return alert("Inserisci titolo e testo!");

  scripts[title] = content;
  localStorage.setItem('my_monologues', JSON.stringify(scripts));
  updateSelector();
  selector.value = title;
  showNotification("Monologo salvato con successo! ✓");
}

function deleteScript() {
  const title = selector.value;
  if (!title || !confirm(`Eliminare definitivamente "${title}"?`)) return;

  delete scripts[title];
  localStorage.setItem('my_monologues', JSON.stringify(scripts));
  titleInput.value = "";
  textArea.value = "";
  updateSelector();
  showNotification("Monologo eliminato");
}

function updateSelector() {
  selector.innerHTML = '<option value="">-- Carica un monologo --</option>';
  Object.keys(scripts).sort().forEach(title => {
    const opt = document.createElement('option');
    opt.value = title;
    opt.innerText = title;
    selector.appendChild(opt);
  });
}

async function startApp() {
  const text = textArea.value.trim();
  if (!text) return alert("Inserisci un testo prima di iniziare!");

  // Autosave
  const title = titleInput.value.trim();
  if (title) {
    scripts[title] = text;
    localStorage.setItem('my_monologues', JSON.stringify(scripts));
    updateSelector();
    selector.value = title;
  }

  // Configura UI
  prompterText.innerText = text;
  const savedSize = localStorage.getItem('preferred_font_size') || 45;
  liveFontInput.value = savedSize;
  prompterText.style.fontSize = savedSize + "px";
  liveFontVal.innerText = savedSize + "px";

  try {
    // 1. Ottieni stream dalla camera (in 16:9 o qualsiasi formato)
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 }
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    // 2. Crea elemento video nascosto
    videoElement = document.createElement('video');
    videoElement.srcObject = mediaStream;
    videoElement.setAttribute('playsinline', '');
    videoElement.muted = true;
    await videoElement.play();

    // 3. Canvas in 9:16 (VERTICALE) - risoluzione ridotta per performance
    const canvas = document.createElement('canvas');
    const CANVAS_WIDTH = 540;   // 9:16 ratio
    const CANVAS_HEIGHT = 960;
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext('2d');

    // 4. Stream dal canvas
    canvasStream = canvas.captureStream(30);

    // 5. COPIA l'audio
    const audioTracks = mediaStream.getAudioTracks();
    audioTracks.forEach(track => canvasStream.addTrack(track));

    // 6. Funzione che disegna il video in verticale
    function drawFrame() {
      if (!videoElement || !videoElement.videoWidth) {
        animationId = requestAnimationFrame(drawFrame);
        return;
      }

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Calcola il crop per riempire il 9:16
      const videoAspect = videoElement.videoWidth / videoElement.videoHeight;
      const canvasAspect = CANVAS_WIDTH / CANVAS_HEIGHT;

      let sx, sy, sw, sh;

      if (videoAspect > canvasAspect) {
        // Video più largo: taglia i lati
        sh = videoElement.videoHeight;
        sw = videoElement.videoHeight * canvasAspect;
        sx = (videoElement.videoWidth - sw) / 2;
        sy = 0;
      } else {
        // Video più alto: taglia sopra/sotto
        sw = videoElement.videoWidth;
        sh = videoElement.videoWidth / canvasAspect;
        sx = 0;
        sy = (videoElement.videoHeight - sh) / 2;
      }

      // Disegna il video nel canvas (verticale 9:16)
      ctx.drawImage(videoElement, sx, sy, sw, sh, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      animationId = requestAnimationFrame(drawFrame);
    }

    // 7. Avvia il disegno
    drawFrame();

    // 8. Crea lo stream combinato (video dal canvas + audio originale)
    const combinedStream = new MediaStream();
    combinedStream.addTrack(canvasStream.getVideoTracks()[0]);
    const audioTrack = mediaStream.getAudioTracks()[0];
    if (audioTrack) {
      combinedStream.addTrack(audioTrack.clone());
    }

    // 9. Crea il recorder
    let mimeType = 'video/mp4';
    if (!MediaRecorder.isTypeSupported('video/mp4')) {
      mimeType = 'video/webm;codecs=vp9,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8,opus';
      }
    }

    recorder = new MediaRecorder(combinedStream, {
      mimeType: mimeType,
      videoBitsPerSecond: 3000000, // 3 Mbps per performance
      audioBitsPerSecond: 128000
    });

    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      saveVideo();
    };

    // 10. Preview (mostra il canvas in 9:16)
    preview.srcObject = canvasStream;

    setupScreen.classList.add('hidden');
    recScreen.classList.remove('hidden');
    isRecording = false;
    recBtn.innerText = "REC";
    recBtn.classList.remove('is-recording');

    // Salva riferimenti per cleanup
    window._canvasElement = canvas;
    window._combinedStream = combinedStream;

    // 11. Setup controlli fotocamera (fuoco, esposizione, white balance)
    setupCameraControls(mediaStream.getVideoTracks()[0]);

  } catch (err) {
    alert("Errore accesso camera/microfono: " + err.message);
    console.error(err);
  }
}

function toggleRecord() {
  if (!recorder) return;

  if (recorder.state === "inactive") {
    chunks = [];
    try {
      recorder.start(1000);
      recBtn.innerText = "STOP";
      recBtn.classList.add('is-recording');
      isRecording = true;
      console.log('📹 Registrazione 9:16 FORZATA iniziata!');
    } catch (e) {
      console.error('Errore start registrazione:', e);
    }
  } else {
    recorder.stop();
    recBtn.innerText = "REC";
    recBtn.classList.remove('is-recording');
    isRecording = false;
    console.log('⏹ Registrazione fermata');
  }
}

function saveVideo() {
  if (chunks.length === 0) {
    alert("Nessun dato video registrato!");
    return;
  }

  let extension = 'mp4';
  let mimeType = 'video/mp4';

  if (recorder && recorder.mimeType) {
    if (recorder.mimeType.includes('webm')) {
      extension = 'webm';
      mimeType = 'video/webm';
    }
  }

  const blob = new Blob(chunks, { type: mimeType });
  console.log(`📊 Video salvato: ${(blob.size / 1024 / 1024).toFixed(2)} MB - FORMATO 9:16 VERTICALE`);

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const title = titleInput.value.trim() || "monologo";
  a.download = `${title}_${timestamp}_9x16.${extension}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => URL.revokeObjectURL(url), 10000);
  showNotification(`✅ Video salvato in 9:16 VERTICALE!`);

  chunks = [];
}

function exitApp() {
  // Ferma il loop
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  if (recorder && recorder.state !== "inactive") {
    try {
      recorder.stop();
    } catch (e) { }
  }

  // Pulisci combined stream
  if (window._combinedStream) {
    window._combinedStream.getTracks().forEach(track => track.stop());
    window._combinedStream = null;
  }

  if (canvasStream) {
    canvasStream.getTracks().forEach(track => track.stop());
    canvasStream = null;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }

  if (videoElement) {
    videoElement.pause();
    videoElement.srcObject = null;
    videoElement = null;
  }

  if (preview.srcObject) {
    preview.srcObject = null;
  }

  chunks = [];
  recScreen.classList.add('hidden');
  setupScreen.classList.remove('hidden');
  isRecording = false;

  loadSavedFontSize();
  showNotification("👋 Uscito");
}

function showNotification(msg) {
  const notif = document.createElement('div');
  notif.className = 'notification';
  notif.textContent = msg;
  notif.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #4a9eff;
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-family: system-ui, sans-serif;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 9999;
    animation: slideIn 0.3s ease-out;
  `;
  document.body.appendChild(notif);
  setTimeout(() => {
    notif.style.opacity = '0';
    notif.style.transition = 'opacity 0.5s';
    setTimeout(() => notif.remove(), 500);
  }, 2500);
}

const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateY(100px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
`;
document.head.appendChild(style);

// Shortcut tastiera
document.addEventListener('keydown', (e) => {
  if (e.key === ' ' && !recScreen.classList.contains('hidden')) {
    e.preventDefault();
    toggleRecord();
  }
  if (e.key === 'Escape' && !recScreen.classList.contains('hidden')) {
    exitApp();
  }
});

// =========================================================
// CONTROLLI FOTOCAMERA: fuoco, esposizione, white balance
// =========================================================

const cameraSettingsPanel = document.getElementById('camera-settings-panel');
const focusControl = document.getElementById('focus-control');
const focusSlider = document.getElementById('focus-slider');
const focusVal = document.getElementById('focus-val');
const exposureControl = document.getElementById('exposure-control');
const exposureSlider = document.getElementById('exposure-slider');
const exposureVal = document.getElementById('exposure-val');
const wbControl = document.getElementById('wb-control');
const wbSlider = document.getElementById('wb-slider');
const wbVal = document.getElementById('wb-val');

let currentVideoTrack = null;

function setupCameraControls(track) {
  currentVideoTrack = track;
  const capabilities = track.getCapabilities();

  // --- FUOCO ---
  if (capabilities.focusDistance) {
    const { min, max, step } = capabilities.focusDistance;
    focusSlider.min = min;
    focusSlider.max = max;
    focusSlider.step = step;
    const mid = (min + max) / 2;
    focusSlider.value = mid;
    focusVal.innerText = mid.toFixed(2);
    focusControl.classList.remove('hidden');
    focusControl.classList.add('flex');

    focusSlider.oninput = async () => {
      const v = parseFloat(focusSlider.value);
      focusVal.innerText = v.toFixed(2);
      try {
        await track.applyConstraints({
          advanced: [{ focusMode: 'manual', focusDistance: v }]
        });
      } catch (err) {
        console.error('Errore focus:', err);
      }
    };
  }

  // --- ESPOSIZIONE ---
  if (capabilities.exposureCompensation) {
    const { min, max, step } = capabilities.exposureCompensation;
    exposureSlider.min = min;
    exposureSlider.max = max;
    exposureSlider.step = step;

    // Parti da un valore leggermente sotto lo zero (non 0 neutro):
    // corregge preventivamente i bianchi bruciati tipici delle camere phone in automatico
    const defaultExposure = Math.max(min, -0.5);
    exposureSlider.value = defaultExposure;
    exposureVal.innerText = defaultExposure.toFixed(2);
    exposureControl.classList.remove('hidden');
    exposureControl.classList.add('flex');

    track.applyConstraints({
      advanced: [{ exposureMode: 'manual', exposureCompensation: defaultExposure }]
    }).catch(err => console.warn('Esposizione iniziale non applicata:', err));

    exposureSlider.oninput = async () => {
      const v = parseFloat(exposureSlider.value);
      exposureVal.innerText = v.toFixed(2);
      try {
        await track.applyConstraints({
          advanced: [{ exposureMode: 'manual', exposureCompensation: v }]
        });
      } catch (err) {
        console.error('Errore esposizione:', err);
      }
    };
  }

  // --- WHITE BALANCE ---
  if (capabilities.colorTemperature) {
    const { min, max, step } = capabilities.colorTemperature;
    wbSlider.min = min;
    wbSlider.max = max;
    wbSlider.step = step;
    const mid = 5000;
    wbSlider.value = mid;
    wbVal.innerText = mid;
    wbControl.classList.remove('hidden');
    wbControl.classList.add('flex');

    wbSlider.oninput = async () => {
      const v = parseInt(wbSlider.value);
      wbVal.innerText = v;
      try {
        await track.applyConstraints({
          advanced: [{ whiteBalanceMode: 'manual', colorTemperature: v }]
        });
      } catch (err) {
        console.error('Errore white balance:', err);
      }
    };
  }
}

function toggleCameraSettingsPanel() {
  cameraSettingsPanel.classList.toggle('hidden');
}

async function resetCameraSettings() {
  if (!currentVideoTrack) return;
  const capabilities = currentVideoTrack.getCapabilities();
  let resetSomething = false;

  // Applica ogni reset singolarmente e solo se il controllo è supportato,
  // così un controllo mancante non blocca gli altri né riempie la console di errori
  if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
    try {
      await currentVideoTrack.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
      resetSomething = true;
    } catch (err) { console.warn('Reset focus non riuscito:', err); }
  }

  if (capabilities.exposureMode && capabilities.exposureMode.includes('continuous')) {
    try {
      await currentVideoTrack.applyConstraints({ advanced: [{ exposureMode: 'continuous' }] });
      resetSomething = true;
    } catch (err) { console.warn('Reset esposizione non riuscito:', err); }
  }

  if (capabilities.whiteBalanceMode && capabilities.whiteBalanceMode.includes('continuous')) {
    try {
      await currentVideoTrack.applyConstraints({ advanced: [{ whiteBalanceMode: 'continuous' }] });
      resetSomething = true;
    } catch (err) { console.warn('Reset white balance non riuscito:', err); }
  }

  showNotification(resetSomething ? '↺ Impostazioni automatiche ripristinate' : 'Nessun controllo manuale attivo su questo dispositivo');
}