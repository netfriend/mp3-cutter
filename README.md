# MP3 Cutter

Aplikasi desktop Windows untuk memotong (trim) file audio MP3.

Dibangun dengan **Electron**, **WaveSurfer.js**, dan **ffmpeg**.

## Fitur

- Pemutar audio (play, pause, stop, volume)
- Waveform interaktif
- Trim kiri–kanan dengan handle geser (warna merah)
- Playhead bisa digeser/klik untuk pindah posisi
- Input menit & detik + tombol **Apply** untuk set range trim
- Export hasil potongan ke file MP3 baru
- Menu klik kanan Explorer: **Open with MP3 Cutter**
- Format: MP3, WAV, FLAC, M4A, AAC, OGG, WMA, OPUS, AIFF

## Persyaratan

- Node.js 18+
- Windows 10/11 (x64)

## Instalasi (development)

```bash
git clone https://github.com/netfriend/mp3-cutter.git
cd mp3-cutter
npm install
npm start
```

## Cara pakai

1. Klik **Buka Audio** (atau klik kanan file audio → **Open with MP3 Cutter**)
2. Geser handle merah kiri/kanan, atau isi menit/detik lalu klik **Apply**
3. Putar pilihan untuk preview
4. Klik **Export MP3** dan simpan hasilnya

### Menu konteks Windows

Daftarkan menu klik kanan:

```bash
npm run register-menu
```

Hapus menu:

```bash
npm run unregister-menu
```

Atau gunakan tombol **Menu Explorer** di dalam aplikasi.

## Build .exe

```bash
npm run build
```

Hasil di folder `dist/`:

| File | Keterangan |
|------|------------|
| `MP3 Cutter Setup 1.0.0.exe` | Installer (disarankan) |
| `MP3-Cutter-Portable.exe` | Portable, tanpa install |
| `win-unpacked/MP3 Cutter.exe` | Versi unpacked |

## Struktur proyek

```
mp3-cutter/
├── main.js                 # Proses utama Electron (dialog, ffmpeg, export)
├── preload.js              # Bridge aman UI ↔ main process
├── package.json            # Dependensi & konfigurasi build
├── bin/mp3-cutter.cmd      # Launcher menu konteks Explorer
├── scripts/
│   ├── register-context-menu.ps1
│   └── unregister-context-menu.ps1
├── build/icon.png          # Ikon aplikasi
└── src/
    ├── index.html          # UI
    ├── styles.css          # Styling
    ├── renderer.js         # Logic player, waveform, trim
    └── vendor/             # WaveSurfer (bundled untuk build)
```

## Script npm

| Script | Fungsi |
|--------|--------|
| `npm start` | Jalankan app (dev) |
| `npm run build` | Build installer + portable |
| `npm run register-menu` | Daftarkan menu Explorer |
| `npm run unregister-menu` | Hapus menu Explorer |

## Lisensi

MIT
