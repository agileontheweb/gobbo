let recorder;
let chunks = [];
let scripts = JSON.parse(localStorage.getItem('my_monologues')) || {};

const setupScreen = document.getElementById('setup-screen');
const recScreen = document.getElementById('recording-screen');
const prompterText = document.getElementById('prompter-text');
const prompterOverlay = document.getElementById('prompter-overlay');
const fontSizeInput = document.getElementById('font-size');
const titleInput = document.getElementById('script-title');
const textArea = document.getElementById('input-text');
const selector = document.getElementById('script-selector');

// Inizializzazione
updateSelector();

fontSizeInput.oninput = () => document.getElementById('font-val').innerText = fontSizeInput.value + "px";

// Cambia script dal menu a tendina
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

  if (!title || !content) {
    alert("Inserisci titolo e testo prima di salvare!");
    return;
  }

  scripts[title] = content;
  localStorage.setItem('my_monologues', JSON.stringify(scripts));
  updateSelector();
  selector.value = title;
  alert("Salvato correttamente!");
}

function deleteScript() {
  const title = selector.value;
  if (!title) return;

  if (confirm(`Vuoi davvero eliminare "${title}"?`)) {
    delete scripts[title];
    localStorage.setItem('my_monologues', JSON.stringify(scripts));
    titleInput.value = "";
    textArea.value = "";
    updateSelector();
  }
}

function updateSelector() {
  selector.innerHTML = '<option value="">-- Seleziona o crea nuovo --</option>';
  Object.keys(scripts).forEach(title => {
    const opt = document.createElement('option');
    opt.value = title;
    opt.innerText = title;
    selector.appendChild(opt);
  });
}

async function startApp() {
  if (!textArea.value.trim()) return alert("Incolla un testo!");

  // Salva automaticamente prima di avviare
  if (titleInput.value.trim()) {
    scripts[titleInput.value.trim()] = textArea.value;
    localStorage.setItem('my_monologues', JSON.stringify(scripts));
  }

  prompterText.innerText = textArea.value;
  prompterText.style.fontSize = fontSizeInput.value + "px";

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById('preview').srcObject = stream;
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onstop = saveVideo;

    setupScreen.classList.add('hidden');
    recScreen.classList.remove('hidden');
  } catch (err) {
    alert("Errore camera: " + err);
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
  a.download = `video_${new Date().getTime()}.mp4`;
  a.click();
}

function exitApp() {
  // Invece di reload, torniamo semplicemente alla schermata precedente
  // Così non perdiamo lo stato delle variabili
  const stream = document.getElementById('preview').srcObject;
  if (stream) stream.getTracks().forEach(track => track.stop());

  recScreen.classList.add('hidden');
  setupScreen.classList.remove('hidden');
  updateSelector();
}