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

  // Autosave prima di partire
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
    // 1. Ottieni stream dalla camera in alta qualità
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: true
    });

    // 2. Crea elemento video nascosto per processare i frame
    videoElement = document.createElement('video');
    videoElement.srcObject = mediaStream;
    videoElement.setAttribute('playsinline', '');
    videoElement.muted = true;
    await videoElement.play();

    // 3. Crea canvas in 9:16 (VERTICALE)
    const canvas = document.createElement('canvas');
    const CANVAS_WIDTH = 1080;   // 9:16 ratio
    const CANVAS_HEIGHT = 1920;
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext('2d');

    // 4. Stream dal canvas (questo sarà in 9:16!)
    canvasStream = canvas.captureStream(30);

    // 5. COPIA l'audio dallo stream originale al canvas stream
    const audioTracks = mediaStream.getAudioTracks();
    audioTracks.forEach(track => canvasStream.addTrack(track));

    // 6. Funzione che disegna il video ruotato sul canvas
    function drawFrame() {
      if (!videoElement || !videoElement.videoWidth) {
        animationId = requestAnimationFrame(drawFrame);
        return;
      }

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Calcola il crop per riempire lo schermo verticale
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

      // Disegna il video nel canvas (già in 9:16)
      ctx.drawImage(videoElement, sx, sy, sw, sh, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Continua il loop
      animationId = requestAnimationFrame(drawFrame);
    }

    // 7. Crea il recorder con lo stream del canvas
    // Prova prima MP4, se non supportato usa WebM
    let mimeType = 'video/mp4';
    if (!MediaRecorder.isTypeSupported('video/mp4')) {
      mimeType = 'video/webm;codecs=vp9,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8,opus';
      }
      console.log('MP4 non supportato, uso:', mimeType);
    }

    recorder = new MediaRecorder(canvasStream, {
      mimeType: mimeType,
      videoBitsPerSecond: 8000000 // 8 Mbps per alta qualità
    });

    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      saveVideo();
    };

    // 8. Avvia il disegno dei frame
    drawFrame();

    // 9. MOSTRA L'ANTEPRIMA - Mostra lo stream del canvas (già in 9:16)
    preview.srcObject = canvasStream;
    // Forza il preview a mantenere 9:16
    preview.style.objectFit = 'cover';
    preview.style.width = '100%';
    preview.style.height = '100%';

    setupScreen.classList.add('hidden');
    recScreen.classList.remove('hidden');
    isRecording = false;
    recBtn.innerText = "🎬 REC";
    recBtn.classList.remove('is-recording');

    // Salva canvas per cleanup
    window._canvasElement = canvas;

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
      recorder.start(1000); // Chunk ogni secondo
      recBtn.innerText = "⏹ STOP";
      recBtn.classList.add('is-recording');
      isRecording = true;
      console.log('📹 Registrazione 9:16 iniziata!');
    } catch (e) {
      console.error('Errore start registrazione:', e);
    }
  } else {
    recorder.stop();
    recBtn.innerText = "🎬 REC";
    recBtn.classList.remove('is-recording');
    isRecording = false;
    console.log('⏹ Registrazione fermata, salvataggio...');
  }
}

function saveVideo() {
  if (chunks.length === 0) {
    alert("Nessun dato video registrato!");
    return;
  }

  // Determina estensione in base al mimeType
  let extension = 'mp4';
  let mimeType = 'video/mp4';

  if (recorder && recorder.mimeType) {
    if (recorder.mimeType.includes('webm')) {
      extension = 'webm';
      mimeType = 'video/webm';
    }
  }

  const blob = new Blob(chunks, { type: mimeType });
  console.log(`📊 Video salvato: ${(blob.size / 1024 / 1024).toFixed(2)} MB, formato 1080x1920 (9:16)`);

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
  showNotification(`✅ Video salvato in 9:16! (${extension.toUpperCase()})`);

  chunks = [];
}

function toggleMirror() {
  prompterText.classList.toggle('mirror-text');
}

function exitApp() {
  // Ferma il loop di animazione
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  // Ferma registrazione
  if (recorder && recorder.state !== "inactive") {
    try {
      recorder.stop();
    } catch (e) {
      console.log('Recorder già fermo');
    }
  }

  // Ferma canvas stream
  if (canvasStream) {
    canvasStream.getTracks().forEach(track => track.stop());
    canvasStream = null;
  }

  // Ferma stream originale
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }

  // Ferma video element nascosto
  if (videoElement) {
    videoElement.pause();
    videoElement.srcObject = null;
    videoElement = null;
  }

  // Pulisci preview
  if (preview.srcObject) {
    preview.srcObject = null;
  }

  // Reset
  chunks = [];
  recScreen.classList.add('hidden');
  setupScreen.classList.remove('hidden');
  isRecording = false;

  loadSavedFontSize();
  showNotification("👋 Uscito dalla registrazione");
}

// Helper per notifiche
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

// Aggiungi CSS per animazioni notifiche
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