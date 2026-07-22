let recorder;
let chunks = [];
let scripts = JSON.parse(localStorage.getItem('my_monologues')) || {};
let isRecording = false;
let mediaStream = null;
let animationId = null;

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
    // 🇮🇹 SOLUZIONE: Registra direttamente dalla camera in 9:16
    // Chiediamo alla camera di registrare in verticale (9:16)
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 720 },
        height: { ideal: 1280 }, // 9:16 ratio
        aspectRatio: 9 / 16
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    // Preview direttamente dalla camera (senza canvas!)
    preview.srcObject = mediaStream;

    // Crea recorder direttamente dallo stream della camera
    let mimeType = 'video/mp4';
    if (!MediaRecorder.isTypeSupported('video/mp4')) {
      mimeType = 'video/webm;codecs=vp9,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8,opus';
      }
    }

    recorder = new MediaRecorder(mediaStream, {
      mimeType: mimeType,
      videoBitsPerSecond: 5000000, // 5 Mbps per qualità decente
      audioBitsPerSecond: 128000
    });

    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      saveVideo();
    };

    setupScreen.classList.add('hidden');
    recScreen.classList.remove('hidden');
    isRecording = false;
    recBtn.innerText = "REC";
    recBtn.classList.remove('is-recording');

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
      console.log('📹 Registrazione 9:16 iniziata!');
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
  console.log(`📊 Video salvato: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);

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
  showNotification(`✅ Video salvato in 9:16!`);

  chunks = [];
}

function toggleMirror() {
  prompterText.classList.toggle('mirror-text');
}

function exitApp() {
  if (recorder && recorder.state !== "inactive") {
    try {
      recorder.stop();
    } catch (e) { }
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
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