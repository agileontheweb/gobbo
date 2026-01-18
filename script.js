let recorder;
let chunks = [];
let scrollInterval;

const setupScreen = document.getElementById('setup-screen');
const recScreen = document.getElementById('recording-screen');
const prompterText = document.getElementById('prompter-text');
const prompterOverlay = document.getElementById('prompter-overlay');
const fontSizeInput = document.getElementById('font-size');
const scrollSpeedInput = document.getElementById('scroll-speed');

// Aggiorna UI setup in tempo reale
fontSizeInput.oninput = () => document.getElementById('font-val').innerText = fontSizeInput.value + "px";
scrollSpeedInput.oninput = () => document.getElementById('speed-val').innerText = scrollSpeedInput.value + "x";

async function startApp() {
  const text = document.getElementById('input-text').value;
  if (!text) return alert("Inserisci del testo!");

  prompterText.innerText = text;
  prompterText.style.fontSize = fontSizeInput.value + "px";

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: true
    });
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
    // START RECORDING
    chunks = [];
    recorder.start();
    btn.innerText = "STOP";
    btn.classList.add('is-recording');

    // Start Auto-Scroll
    const speed = parseInt(scrollSpeedInput.value);
    scrollInterval = setInterval(() => {
      prompterOverlay.scrollTop += speed;
    }, 40);

  } else {
    // STOP RECORDING
    recorder.stop();
    btn.innerText = "REC";
    btn.classList.remove('is-recording');
    clearInterval(scrollInterval);
  }
}

function saveVideo() {
  const blob = new Blob(chunks, { type: 'video/mp4' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gobbo_${new Date().getTime()}.mp4`;
  a.click();
}

function toggleMirror() {
  prompterText.classList.toggle('mirror-text');
}

function exitApp() {
  location.reload();
}