# ⚡ MamakeSport - Live Streaming & Jadwal Pertandingan Olahraga

Aplikasi web modern yang terintegrasi secara langsung dengan jadwal pertandingan dan live streaming olahraga dari sumber **[apemtipi.online](https://apemtipi.online/)**.

---

## 🌟 Fitur Utama

1. **Integrasi Real-Time dengan Apemtipi.online**:
   - Scraping & sinkronisasi otomatis jadwal pertandingan di semua kategori (Voli, Sepak Bola, MotoGP/F1, Badminton, Basket, Fight Sports, Tenis, dsb.).
   - Tombol **Sinkron Jadwal** manual dengan notifikasi pembaruan data langsung.
   - Pengecekan status siaran aktif & multi-server (`/api/check-stream?id=...`).

2. **Pemutar Video Multi-Format Berteknologi Tinggi**:
   - **Google Shaka Player**: Dukungan streaming MPEG-DASH & HLS dengan enkripsi DRM ClearKey (`keyId` & `key`).
   - **Hls.js**: Fallback otomatis untuk siaran HLS `.m3u8` adaptif berlatensi rendah.
   - **Iframe Embed**: Dukungan pemutar embed eksternal.
   - **Multi-Server & Court Switcher**: Pilihan server (Server 1 HD, Server 2 HD, Court 1, Court 2, dsb.) dengan auto-polling status siaran setiap beberapa detik.
   - **Pre-Match Countdown Clock**: Hitung mundur jam:menit:detik interaktif sebelum pertandingan dimulai.
   - **Tombol Uji Coba Video HD**: Memungkinkan pengguna menguji pemutar secara instan meskipun pertandingan belum dimulai.

3. **Tampilan & Desain Premium**:
   - Dark sports theme dengan aksen neon kuning `#d9ff00` dan efek animated glowing border untuk pertandingan yang sedang **LIVE**.
   - Hero Carousel berisi pertandingan unggulan & blockbuster.
   - Slider horizontal responsif untuk setiap cabang olahraga dengan tombol navigasi geser.
   - Fitur pencarian instan (live search) tim, liga, dan cabang olahraga.
   - Filter pill kategori olahraga (Semua, Live Sekarang, Sepak Bola, MotoGP, Voli, Badminton, Basket, UFC/Tinju, Tenis).
   - Indikator penonton online (Live Viewer Count) dengan simulasi detak jantung (heartbeat).
   - Fitur interaktif: Ambient Glow, Picture-in-Picture (PiP), Layar Penuh (Fullscreen), dan Live Chat suporter.

4. **Panel Kelola Stream & Admin (`/admin`)**:
   - Pemicu sinkronisasi manual ke apemtipi.online.
   - Penambahan jadwal atau link stream kustom secara instan.
   - Fitur pengujian link `.m3u8` atau `.mpd` langsung di halaman admin.

---

## 🚀 Cara Menjalankan

### 1. Instalasi Dependensi
```bash
npm install
```

### 2. Menjalankan Server
```bash
npm start
```
Atau:
```bash
node server.js
```

Aplikasi akan berjalan di:
- **Halaman Utama (Beranda)**: [http://localhost:3000/](http://localhost:3000/)
- **Halaman Nonton (Watch Live)**: [http://localhost:3000/watch?id=LIVE_UCL_01](http://localhost:3000/watch?id=LIVE_UCL_01)
- **Panel Admin / Kelola Stream**: [http://localhost:3000/admin](http://localhost:3000/admin)

---

## 📡 Dokumentasi Endpoint API

| Endpoint | Method | Deskripsi |
|---|---|---|
| `/api/schedule` | GET | Mengambil semua jadwal pertandingan yang dikelompokkan per kategori dari apemtipi.online |
| `/api/live` | GET | Mengambil daftar pertandingan yang sedang berstatus LIVE saat ini |
| `/api/match/:id` | GET | Mengambil rincian detail pertandingan berdasarkan ID |
| `/api/check-stream?id=:id` | GET | Memeriksa ketersediaan server & URL siaran langsung dari apemtipi.online |
| `/api/viewer?id=:id&action=join` | GET | Menghitung dan menyinkronkan jumlah penonton aktif secara real-time |
| `/api/refresh` | POST | Memaksa penyegaran data jadwal langsung dari apemtipi.online |
| `/api/custom-match` | POST | Menambahkan pertandingan & URL stream kustom baru |
