import WaveSurfer from './vendor/wavesurfer.esm.js';
import RegionsPlugin from './vendor/regions.esm.js';

const $ = (id) => document.getElementById(id);

const emptyState = $('empty-state');
const editor = $('editor');
const fileName = $('file-name');
const fileDuration = $('file-duration');
const trimStart = $('trim-start');
const trimEnd = $('trim-end');
const trimDuration = $('trim-duration');
const btnOpen = $('btn-open');
const btnPlay = $('btn-play');
const btnStop = $('btn-stop');
const btnPlaySelection = $('btn-play-selection');
const btnExport = $('btn-export');
const btnRegisterMenu = $('btn-register-menu');
const volumeSlider = $('volume');
const toast = $('toast');
const waveformEl = $('waveform');
const templatePanel = $('template-panel');
const templateEnabled = $('template-enabled');
const templateBadge = $('template-badge');
const startMin = $('start-min');
const startSec = $('start-sec');
const endMin = $('end-min');
const endSec = $('end-sec');
const btnApplyTemplate = $('btn-apply-template');

const TEMPLATE_STORAGE_KEY = 'mp3-cutter-template';

let wavesurfer = null;
let regionsPlugin = null;
let activeRegion = null;
let currentFile = null;
let selectionEndHandler = null;
let loadToken = 0;
let loadedPath = null;
let isLoading = false;
let mediaElement = null;
let mediaObjectUrl = null;
let applyingTemplate = false;

function clampNumber(value, min, max) {
  const num = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, num));
}

function parseTimeInput(minInput, secInput) {
  const minutes = clampNumber(parseInt(minInput.value, 10) || 0, 0, 999);
  const seconds = clampNumber(parseInt(secInput.value, 10) || 0, 0, 59);
  return minutes * 60 + seconds;
}

function setTimeInputs(minInput, secInput, totalSeconds) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  minInput.value = String(minutes);
  secInput.value = String(seconds);
}

function isTemplateActive() {
  return templateEnabled.checked;
}

function setTemplateUiState() {
  const active = isTemplateActive();
  templatePanel.classList.toggle('template-panel--active', active);
  templateBadge.textContent = active ? 'Aktif' : 'Nonaktif';
}

function saveTemplatePrefs() {
  const prefs = {
    enabled: templateEnabled.checked,
    startMin: startMin.value,
    startSec: startSec.value,
    endMin: endMin.value,
    endSec: endSec.value,
  };
  localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(prefs));
}

function loadTemplatePrefs() {
  try {
    const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (!raw) return;

    const prefs = JSON.parse(raw);
    templateEnabled.checked = Boolean(prefs.enabled);
    if (prefs.startMin != null) startMin.value = prefs.startMin;
    if (prefs.startSec != null) startSec.value = prefs.startSec;
    if (prefs.endMin != null) endMin.value = prefs.endMin;
    if (prefs.endSec != null) endSec.value = prefs.endSec;
  } catch {
    // ignore invalid saved prefs
  }
  setTemplateUiState();
}

function getInputRange(totalDuration) {
  if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
    return { start: 0, end: 0 };
  }

  let start = parseTimeInput(startMin, startSec);
  let end = parseTimeInput(endMin, endSec);

  start = clampNumber(start, 0, totalDuration);
  end = clampNumber(end, 0, totalDuration);

  if (end <= start) {
    end = Math.min(totalDuration, start + 1);
  }

  return { start, end };
}

function applyInputTrim() {
  if (!isTemplateActive()) {
    showToast('Aktifkan input waktu terlebih dahulu', 'error');
    return;
  }

  if (!wavesurfer || !activeRegion) {
    showToast('Buka file audio terlebih dahulu', 'error');
    return;
  }

  const duration = wavesurfer.getDuration();
  if (!Number.isFinite(duration) || duration <= 0) return;

  applyingTemplate = true;

  const { start, end } = getInputRange(duration);
  setTimeInputs(startMin, startSec, start);
  setTimeInputs(endMin, endSec, end);

  activeRegion.setOptions({
    start,
    end,
    drag: true,
    resize: true,
  });
  updateTrimLabels(start, end);

  applyingTemplate = false;
  saveTemplatePrefs();
  requestAnimationFrame(styleTrimHandles);
  showToast(`Limiter diset: ${formatTime(start)} – ${formatTime(end)}`);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '00:00.0';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

function showToast(message, type = 'success') {
  toast.textContent = message;
  toast.className = `toast ${type}`;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.className = 'toast hidden';
  }, 4000);
}

function updateTrimLabels(start, end) {
  trimStart.textContent = formatTime(start);
  trimEnd.textContent = formatTime(end);
  trimDuration.textContent = formatTime(Math.max(0, end - start));
}

function setPlayButton(playing) {
  btnPlay.textContent = playing ? '⏸' : '▶';
  btnPlay.title = playing ? 'Jeda' : 'Putar';
}

function setControlsEnabled(enabled) {
  btnPlay.disabled = !enabled;
  btnStop.disabled = !enabled;
  btnPlaySelection.disabled = !enabled;
  btnExport.disabled = !enabled;
}

function setWaveformLoading(loading) {
  waveformEl.classList.toggle('waveform--loading', loading);
}

function clearSelectionHandler() {
  if (selectionEndHandler && wavesurfer) {
    wavesurfer.un('timeupdate', selectionEndHandler);
  }
  selectionEndHandler = null;
}

function revokeMediaUrl() {
  if (mediaObjectUrl) {
    URL.revokeObjectURL(mediaObjectUrl);
    mediaObjectUrl = null;
  }
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function styleTrimHandles() {
  if (!wavesurfer) return;

  const root = wavesurfer.getWrapper()?.getRootNode();
  const scope = root instanceof ShadowRoot ? root : document;

  scope.querySelectorAll('[part*="region-handle-left"]').forEach((el) => {
    el.style.background = '#ef4444';
    el.style.borderLeft = '3px solid #ef4444';
    el.style.width = '8px';
    el.style.cursor = 'ew-resize';
  });

  scope.querySelectorAll('[part*="region-handle-right"]').forEach((el) => {
    el.style.background = '#ef4444';
    el.style.borderRight = '3px solid #ef4444';
    el.style.width = '8px';
    el.style.cursor = 'ew-resize';
  });
}

function stylePlayhead() {
  if (!wavesurfer) return;

  const root = wavesurfer.getWrapper()?.getRootNode();
  const scope = root instanceof ShadowRoot ? root : document;

  scope.querySelectorAll('[part="cursor"]').forEach((el) => {
    el.style.background = '#fbbf24';
    el.style.width = '3px';
    el.style.cursor = 'ew-resize';
    el.style.boxShadow = '0 0 6px rgba(251, 191, 36, 0.6)';
  });
}

function setupRegion(duration) {
  if (!regionsPlugin || !Number.isFinite(duration) || duration <= 0) return;

  regionsPlugin.clearRegions();
  activeRegion = regionsPlugin.addRegion({
    start: 0,
    end: duration,
    color: 'rgba(239, 68, 68, 0.15)',
    drag: true,
    resize: true,
  });
  updateTrimLabels(0, duration);
  setTimeInputs(startMin, startSec, 0);
  setTimeInputs(endMin, endSec, duration);

  requestAnimationFrame(() => {
    styleTrimHandles();
    stylePlayhead();
  });
}

function finishLoad(token, name, duration) {
  if (token !== loadToken) return;

  fileName.textContent = name;
  fileDuration.textContent = formatTime(duration);
  setupRegion(duration);
  setControlsEnabled(true);
  setWaveformLoading(false);
  isLoading = false;
}

function ensureWaveSurfer() {
  if (wavesurfer) return;

  regionsPlugin = RegionsPlugin.create();

  wavesurfer = WaveSurfer.create({
    container: '#waveform',
    waveColor: '#4f46e5',
    progressColor: '#818cf8',
    cursorColor: '#fbbf24',
    cursorWidth: 3,
    barWidth: 2,
    barGap: 1,
    barRadius: 2,
    height: 120,
    normalize: true,
    interact: true,
    dragToSeek: true,
    plugins: [regionsPlugin],
  });

  wavesurfer.on('ready', () => {
    finishLoad(wavesurfer.__loadToken, wavesurfer.__fileName, wavesurfer.getDuration());
  });

  wavesurfer.on('error', (error) => {
    if (wavesurfer.__loadToken !== loadToken) return;
    isLoading = false;
    setControlsEnabled(false);
    setWaveformLoading(false);
    showToast(`Gagal memuat audio: ${error?.message || error}`, 'error');
  });

  regionsPlugin.on('region-updated', (region) => {
    activeRegion = region;
    updateTrimLabels(region.start, region.end);
    styleTrimHandles();

    if (!applyingTemplate) {
      setTimeInputs(startMin, startSec, region.start);
      setTimeInputs(endMin, endSec, region.end);
      saveTemplatePrefs();
    }
  });

  wavesurfer.on('redrawcomplete', () => {
    styleTrimHandles();
    stylePlayhead();
  });

  wavesurfer.on('play', () => setPlayButton(true));
  wavesurfer.on('pause', () => setPlayButton(false));
  wavesurfer.on('finish', () => setPlayButton(false));

  wavesurfer.setVolume(volumeSlider.value / 100);
}

function createMediaElement(bytes, mimeType) {
  revokeMediaUrl();

  if (mediaElement) {
    mediaElement.pause();
    mediaElement.removeAttribute('src');
    mediaElement.load();
  } else {
    mediaElement = document.createElement('audio');
    mediaElement.preload = 'auto';
  }

  const blob = new Blob([bytes], { type: mimeType || 'audio/mpeg' });
  mediaObjectUrl = URL.createObjectURL(blob);
  mediaElement.src = mediaObjectUrl;

  return mediaElement;
}

async function loadFileData(file) {
  if (!file?.path) return;
  if (isLoading && file.path === loadedPath) return;
  if (!isLoading && file.path === loadedPath && wavesurfer?.getDuration() > 0) {
    currentFile = file;
    fileName.textContent = file.name;
    emptyState.classList.add('hidden');
    editor.classList.remove('hidden');
    return;
  }

  const token = ++loadToken;
  isLoading = true;
  loadedPath = file.path;
  currentFile = file;

  fileName.textContent = `${file.name} (memuat...)`;
  emptyState.classList.add('hidden');
  editor.classList.remove('hidden');
  setControlsEnabled(false);
  setWaveformLoading(true);
  clearSelectionHandler();

  try {
    const audio = await window.api.readAudioFile(file.path);
    if (token !== loadToken) return;

    if (audio?.error) {
      throw new Error(audio.error);
    }

    if (!audio?.base64 || !audio?.peaks || !audio?.duration) {
      throw new Error('File audio tidak bisa dibaca');
    }

    const bytes = base64ToBytes(audio.base64);
    if (bytes.length === 0) {
      throw new Error('File audio kosong');
    }

    ensureWaveSurfer();

    const media = createMediaElement(bytes, audio.mimeType);
    wavesurfer.setMediaElement(media);

    wavesurfer.__loadToken = token;
    wavesurfer.__fileName = audio.name;

    await wavesurfer.load(mediaObjectUrl, audio.peaks, audio.duration);

    if (token !== loadToken) return;
  } catch (error) {
    if (token !== loadToken) return;
    setWaveformLoading(false);
    showToast(`Gagal membuka file: ${error.message}`, 'error');
  } finally {
    if (token === loadToken) {
      isLoading = false;
    }
  }
}

async function openFile() {
  try {
    if (!window.api?.openFile) {
      showToast('API aplikasi belum siap. Restart aplikasi.', 'error');
      return;
    }

    const file = await window.api.openFile();

    if (!file) return;

    if (file.error) {
      showToast(`Gagal membuka dialog: ${file.error}`, 'error');
      return;
    }

    await loadFileData(file);
  } catch (error) {
    showToast(`Gagal membuka file: ${error.message}`, 'error');
  }
}

function togglePlay() {
  if (!wavesurfer || isLoading) return;
  wavesurfer.playPause();
}

function stopPlayback() {
  if (!wavesurfer) return;
  clearSelectionHandler();
  wavesurfer.stop();
  setPlayButton(false);
}

function playSelection() {
  if (!wavesurfer || !activeRegion || isLoading) return;

  stopPlayback();
  wavesurfer.setTime(activeRegion.start);
  wavesurfer.play();

  selectionEndHandler = (time) => {
    if (time >= activeRegion.end) {
      wavesurfer.pause();
      wavesurfer.setTime(activeRegion.end);
      clearSelectionHandler();
    }
  };
  wavesurfer.on('timeupdate', selectionEndHandler);
}

async function exportMp3() {
  if (!currentFile || !activeRegion || isLoading) return;

  const start = activeRegion.start;
  const end = activeRegion.end;

  if (end - start < 0.1) {
    showToast('Pilihan terlalu pendek (min 0.1 detik)', 'error');
    return;
  }

  const baseName = currentFile.name.replace(/\.[^.]+$/, '');
  const defaultName = `${baseName}_cut.mp3`;

  const saveResult = await window.api.saveFile({ defaultName, start, end });
  if (!saveResult.success) return;

  btnExport.disabled = true;
  btnExport.textContent = 'Menyimpan...';

  const result = await window.api.exportMp3({
    inputPath: currentFile.path,
    outputPath: saveResult.outputPath,
    start,
    end,
  });

  btnExport.disabled = false;
  btnExport.textContent = 'Export MP3';

  if (result.success) {
    showToast(`Berhasil disimpan: ${saveResult.outputPath.split(/[/\\]/).pop()}`);
  } else {
    showToast(`Gagal export: ${result.error}`, 'error');
  }
}

function initTemplateControls() {
  loadTemplatePrefs();

  templateEnabled.addEventListener('change', () => {
    setTemplateUiState();
    saveTemplatePrefs();
  });

  [startMin, startSec, endMin, endSec].forEach((input) => {
    input.addEventListener('change', saveTemplatePrefs);
  });

  btnApplyTemplate.addEventListener('click', applyInputTrim);
}

function bindUiEvents() {
  btnOpen.addEventListener('click', openFile);
  btnRegisterMenu.addEventListener('click', async () => {
    btnRegisterMenu.disabled = true;
    const result = await window.api.registerContextMenu();
    btnRegisterMenu.disabled = false;
    showToast(result.message, result.success ? 'success' : 'error');
  });
  btnPlay.addEventListener('click', togglePlay);
  btnStop.addEventListener('click', stopPlayback);
  btnPlaySelection.addEventListener('click', playSelection);
  btnExport.addEventListener('click', exportMp3);

  volumeSlider.addEventListener('input', () => {
    if (wavesurfer) {
      wavesurfer.setVolume(volumeSlider.value / 100);
    }
  });

  window.api.onFileOpened((file) => {
    loadFileData(file);
  });
}

async function initApp() {
  initTemplateControls();
  bindUiEvents();

  try {
    const launchFile = await window.api.getLaunchFile();
    if (launchFile) {
      await loadFileData(launchFile);
    }
  } catch (error) {
    showToast(`Gagal memuat file awal: ${error.message}`, 'error');
  }
}

if (window.api) {
  initApp().catch((error) => {
    showToast(`Gagal inisialisasi: ${error.message}`, 'error');
  });
} else {
  showToast('Gagal inisialisasi aplikasi. Restart MP3 Cutter.', 'error');
}
