let recorder;
let chunks = [];
let scripts = JSON.parse(localStorage.getItem('my_monologues')) || {};

const setupScreen = document.getElementById('setup-screen');
const recScreen = document.getElementById('recording-screen');
const prompterText = document.getElementById('prompter-text');
const prompterOverlay = document.getElementById('prompter-overlay');
const liveFontInput = document.getElementById('live-font-size');
const liveFontVal = document.getElementById('live-font-val');
const titleInput = document.getElementById('script-title');
const textArea = document.getElementById('input-text');
const selector = document.getElementById('script-selector');

// Carica script iniziale
updateSelector();

// Gestione Font Live
liveFontInput.oninput = () => {
  const size = liveFontInput.value + "px";
  prompterText.style.fontSize = size;
  liveFontVal.innerText = size;
  localStorage.setItem('preferred_font_size', liveFontInput.value);
};

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
  alert("Monologo salvato!");
}

function deleteScript() {
  const title = selector.value;
  if (!title || !confirm(`Eliminare "${title}"?`)) return;

  delete scripts[title];
  localStorage.setItem('my_monologues', JSON.stringify(scripts));
  titleInput.value = "";
  textArea.value = "";
  updateSelector();
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
  if (!textArea.value.trim()) return alert("Inserisci un testo!");

  // Autosave prima di partire
  if (titleInput.value.trim()) {
    scripts[titleInput.value.trim()] = textArea.value;
    localStorage.setItem('my_monologues', JSON.stringify(scripts));
  }

  // Configura UI
  prompterText.innerText = textArea.value;
  const savedSize = localStorage.getItem('preferred_font_size') || 45;
  liveFontInput.value = savedSize;
  prompterText.style.fontSize = savedSize + "px";
  liveFontVal.innerText = savedSize + "px";

  // Creiamo una lista di tentativi (dal meglio al peggiore)
  const videoConstraints = [
    // 1. Tentativo: Full HD Verticale (Solo "ideal", senza forzare il "min")
    { video: { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1920 } }, audio: true },
    // 2. Tentativo: HD Verticale
    { video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 } }, audio: true },
    // 3. Tentativo: Default (se l'OPPO è testardo, prende quello che dà)
    { video: { facingMode: "user" }, audio: true }
  ];

  let stream = null;
  let errorDettagli = "";

  // Cicla tra i tentativi finché non ottiene la telecamera
  for (let i = 0; i < videoConstraints.length; i++) {
    try {
      stream = await navigator.mediaDevices.getUserMedia(videoConstraints[i]);
      break; // Se funziona, esci dal ciclo!
    } catch (err) {
      errorDettagli = err.message; // Salva l'errore per dopo
      stream = null;
    }
  }

  // Se dopo 3 tentativi stream è ancora null, la telecamera è irraggiungibile
  if (!stream) {
    return alert("Impossibile accedere alla camera. Dettagli: " + errorDettagli);
  }

  // Se arriviamo qui, la telecamera funziona!
  try {
    document.getElementById('preview').srcObject = stream;

    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = saveVideo;

    setupScreen.classList.add('hidden');
    recScreen.classList.remove('hidden');
  } catch (err) {
    alert("Errore avvio recorder: " + err.message);
  }
}

function toggleRecord() {
  const btn = document.getElementById('recBtn');
  if (recorder.state === "inactive") {
    chunks = [];
    recorder.start();
    btn.innerText = "STOP";
    btn.classList.add('is-recording');
  } else {
    recorder.stop();
    btn.innerText = "REC";
    btn.classList.remove('is-recording');
  }
}

function saveVideo() {
  const blob = new Blob(chunks, { type: 'video/mp4' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `monologo_${new Date().getTime()}.mp4`;
  a.click();
}

function toggleMirror() {
  prompterText.classList.toggle('mirror-text');
}

function exitApp() {
  const stream = document.getElementById('preview').srcObject;
  if (stream) stream.getTracks().forEach(track => track.stop());
  recScreen.classList.add('hidden');
  setupScreen.classList.remove('hidden');
}