const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

function resolveFfmpegPath() {
  if (app.isPackaged) {
    const unpacked = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
    if (fs.existsSync(unpacked)) return unpacked;
  }
  return ffmpegPath;
}

ffmpeg.setFfmpegPath(resolveFfmpegPath());

const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.wma', '.opus', '.aiff', '.aif',
]);

const MIME_TYPES = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.wma': 'audio/x-ms-wma',
  '.opus': 'audio/opus',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
};

function getMimeType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'audio/mpeg';
}

let mainWindow;
let pendingFilePath = null;
let launchFileConsumed = false;

function isAudioFile(filePath) {
  return AUDIO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function readFilePayload(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile() || !isAudioFile(resolved)) {
    return null;
  }

  return {
    path: resolved,
    name: path.basename(resolved),
    mimeType: getMimeType(resolved),
  };
}

function analyzeAudio(inputPath) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    ffmpeg(inputPath)
      .audioChannels(1)
      .audioFrequency(8000)
      .format('f32le')
      .on('error', reject)
      .pipe()
      .on('data', (chunk) => chunks.push(chunk))
      .on('end', () => {
        try {
          const buffer = Buffer.concat(chunks);
          const sampleCount = Math.floor(buffer.length / 4);
          if (sampleCount === 0) {
            reject(new Error('File audio kosong atau tidak didukung'));
            return;
          }

          const samples = new Float32Array(
            buffer.buffer,
            buffer.byteOffset,
            sampleCount,
          );
          const duration = sampleCount / 8000;
          const peakCount = Math.min(2000, Math.max(100, Math.floor(duration * 25)));
          const samplesPerPeak = Math.max(1, Math.floor(sampleCount / peakCount));
          const peaks = [];

          for (let i = 0; i < peakCount; i += 1) {
            let max = 0;
            const start = i * samplesPerPeak;
            const end = Math.min(start + samplesPerPeak, sampleCount);
            for (let j = start; j < end; j += 1) {
              const value = Math.abs(samples[j]);
              if (value > max) max = value;
            }
            peaks.push(max);
          }

          resolve({ peaks: [peaks], duration });
        } catch (error) {
          reject(error);
        }
      })
      .on('error', reject);
  });
}

async function readAudioForPlayer(filePath) {
  const payload = readFilePayload(filePath);
  if (!payload) return null;

  const [{ peaks, duration }, buffer] = await Promise.all([
    analyzeAudio(payload.path),
    fs.promises.readFile(payload.path),
  ]);

  return {
    path: payload.path,
    name: payload.name,
    mimeType: payload.mimeType,
    base64: buffer.toString('base64'),
    peaks,
    duration,
  };
}

function getFileFromArgv(argv) {
  const args = argv.slice(1).filter((arg) => !arg.startsWith('-'));

  for (let i = args.length - 1; i >= 0; i -= 1) {
    const arg = args[i];
    if (arg === '.' || arg.endsWith('electron.exe') || arg.endsWith('MP3 Cutter.exe')) {
      continue;
    }
    if (fs.existsSync(arg) && fs.statSync(arg).isFile() && isAudioFile(arg)) {
      return path.resolve(arg);
    }
  }

  return null;
}

function sendFileToRenderer(filePath) {
  const payload = readFilePayload(filePath);
  if (!payload || !mainWindow) return false;

  mainWindow.webContents.send('file-opened', payload);
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  return true;
}

function openFileInWindow(filePath) {
  if (!mainWindow || mainWindow.webContents.isLoading()) {
    pendingFilePath = filePath;
    return;
  }
  sendFileToRenderer(filePath);
}

function consumeLaunchFile() {
  if (launchFileConsumed) return null;
  launchFileConsumed = true;

  const launchPath = pendingFilePath || getFileFromArgv(process.argv);
  pendingFilePath = null;

  return launchPath ? readFilePayload(launchPath) : null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 720,
    minHeight: 520,
    title: 'MP3 Cutter',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.setMenuBarVisibility(false);
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const filePath = getFileFromArgv(argv);
    if (filePath) {
      openFileInWindow(filePath);
    } else if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(createWindow);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('get-launch-file', async () => consumeLaunchFile());

function getMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
}

ipcMain.handle('open-file', async () => {
  try {
    const parent = getMainWindow();
    const result = await dialog.showOpenDialog(parent ?? undefined, {
      title: 'Pilih file audio',
      filters: [
        { name: 'Semua Audio', extensions: ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'wma', 'opus', 'aiff', 'aif'] },
        { name: 'MP3', extensions: ['mp3'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return readFilePayload(result.filePaths[0]);
  } catch (error) {
    console.error('open-file dialog error:', error);
    return { error: error.message };
  }
});

ipcMain.handle('read-audio-file', async (_event, filePath) => {
  try {
    return await readAudioForPlayer(filePath);
  } catch (error) {
    console.error('read-audio-file error:', error);
    return { error: error.message };
  }
});

ipcMain.handle('save-file', async (_event, { defaultName }) => {
  const parent = getMainWindow();
  const result = await dialog.showSaveDialog(parent ?? undefined, {
    title: 'Simpan MP3 hasil potong',
    defaultPath: defaultName,
    filters: [{ name: 'Audio MP3', extensions: ['mp3'] }],
  });

  if (result.canceled || !result.filePath) {
    return { success: false };
  }

  return { success: true, outputPath: result.filePath };
});

ipcMain.handle('export-mp3', async (_event, { inputPath, outputPath, start, end }) => {
  return new Promise((resolve) => {
    const inputExt = path.extname(inputPath).toLowerCase();
    const command = ffmpeg(inputPath)
      .setStartTime(start)
      .setDuration(end - start)
      .output(outputPath);

    if (inputExt === '.mp3') {
      command.outputOptions('-c', 'copy');
    } else {
      command.audioCodec('libmp3lame').audioQuality(2);
    }

    command
      .on('end', () => resolve({ success: true }))
      .on('error', (err) => resolve({ success: false, error: err.message }))
      .run();
  });
});

ipcMain.handle('register-context-menu', async () => {
  const { execFile } = require('child_process');
  const scriptPath = path.join(__dirname, 'scripts', 'register-context-menu.ps1');

  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      (error, stdout, stderr) => {
        resolve({
          success: !error,
          message: error ? (stderr || error.message) : stdout.trim(),
        });
      },
    );
  });
});

ipcMain.handle('unregister-context-menu', async () => {
  const { execFile } = require('child_process');
  const scriptPath = path.join(__dirname, 'scripts', 'unregister-context-menu.ps1');

  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      (error, stdout, stderr) => {
        resolve({
          success: !error,
          message: error ? (stderr || error.message) : stdout.trim(),
        });
      },
    );
  });
});
