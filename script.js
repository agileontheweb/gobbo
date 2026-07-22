let recorder;
let chunks = [];
let canvasStream;
let animationFrameId;
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

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1920 } },
      audio: true
    });

    const videoElement = document.getElementById('preview');
    videoElement.srcObject = stream;
    await videoElement.play();

    // Creiamo un canvas nascosto per forzare il ritaglio geometrico 9:16 (es. 720x1280)
    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 1280;
    const ctx = canvas.getContext('2d');

    // Funzione che ridisegna ogni fotogramma tagliandolo in 9:16 esatto
    function drawVideoToCanvas() {
      if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
        const vWidth = videoElement.videoWidth;
        const vHeight = videoElement.videoHeight;

        // Calcolo per il crop centrale (object-fit: cover)
        const targetRatio = 9 / 16;
        const currentRatio = vWidth / vHeight;

        let sWidth, sHeight, sX, sY;
        if (currentRatio > targetRatio) {
          sHeight = vHeight;
          sWidth = vHeight * targetRatio;
          sX = (vWidth - sWidth) / 2;
          sY = 0;
        } else {
          sWidth = vWidth;
          sHeight = vWidth / targetRatio;
          sX = 0;
          sY = (vHeight - sHeight) / 2;
        }

        ctx.save();
        // Effetto speculare (mirror) integrato direttamente nel canvas salvato
        ctx.scale(-1, 1);
        ctx.drawImage(videoElement, sX, sY, sWidth, sHeight, -canvas.width, 0, canvas.width, canvas.height);
        ctx.restore();
      }
      animationFrameId = requestAnimationFrame(drawVideoToCanvas);
    }
    drawVideoToCanvas();

    // Catturiamo lo stream dal canvas pulito unendo l'audio del microfono
    canvasStream = canvas.captureStream(30); // 30 fps
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      canvasStream.addTrack(audioTrack);
    }

    recorder = new MediaRecorder(canvasStream, { mimeType: 'video/webm;codecs=vp9,opus' });
    chunks = [];
    recorder.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = saveVideo;

    setupScreen.classList.add('hidden');
    recScreen.classList.remove('hidden');
  } catch (err) {
    alert("Errore accesso camera: " + err);
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
  cancelAnimationFrame(animationFrameId);
  const blob = new Blob(chunks, { type: 'video/webm' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `monologo_${new Date().getTime()}.webm`;
  a.click();
}

function toggleMirror() {
  prompterText.classList.toggle('mirror-text');
}

function exitApp() {
  cancelAnimationFrame(animationFrameId);
  const videoElement = document.getElementById('preview');
  if (videoElement.srcObject) {
    videoElement.srcObject.getTracks().forEach(track => track.stop());
  }
  recScreen.classList.add('hidden');
  setupScreen.classList.remove('hidden');
}