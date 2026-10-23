# Pogo M3U8 Harvester (GitHub Actions)

Menjaring `.m3u8` bertanda tangan dari halaman player playerdee.top
memakai Playwright, lalu mengirimnya ke **POGO Playlist Worker V1.4+**
(`/ingest`). GitHub Actions menjalankannya tiap 15 menit.

## Cara pasang

1. Buat repository GitHub baru. **Disarankan Public** — Actions di
   repo publik gratis tanpa batas menit; repo privat ditagih menit
   (jadwal 15 menit bisa menghabiskan kuota gratis 2.000 menit/bulan).
   Kode ini tidak berisi rahasia apa pun; kunci disimpan di Secrets.
2. Unggah semua isi folder ini ke repository (termasuk folder
   `.github/workflows/` — hati-hati, folder diawali titik mudah
   terlewat saat upload lewat web; cara paling aman: `git push`).
3. Di repository: **Settings → Secrets and variables → Actions →
   New repository secret**, tambahkan:
   - `INGEST_KEY` — teks acak pilihanmu. **Harus sama persis** dengan
     `INGEST_KEY` di dalam skrip worker POGO V1.4 yang sudah dideploy.
   - `WORKER_URL` — *opsional*; bila kosong memakai bawaan
     `https://footystream.lutfimuhammad200917.workers.dev`.
4. Buka tab **Actions** → aktifkan workflow bila diminta → pilih
   **Pogo M3U8 Harvester** → **Run workflow** untuk tes pertama.
5. Baca log run-nya. Baris terpenting:
   - `laga LIVE dari worker: N` — worker menjawab dan ada laga live.
   - `OK terjaring & terkirim` — .m3u8 tertangkap dan diterima worker.
   - `GAGAL: .m3u8 tidak tertangkap` — halaman player tertahan
     Cloudflare; unduh artifact `shots-*` di halaman run untuk
     melihat screenshot halamannya.

## Catatan jujur soal Cloudflare

IP GitHub Actions adalah IP server (Azure), kelas yang sama yang
selama ini dibalas 403 oleh playerdee.top untuk fetch biasa.
Bedanya, ini browser Chromium sungguhan — kadang lolos, kadang
ditolak; **hasil run pertama yang menentukan**. Profil browser
disimpan antar-run (actions/cache) supaya izin yang pernah didapat
tidak hilang. Bila GitHub ternyata selalu ditolak, jalur PC Kapten
(`pogo-m3u8-harvester.js` versi lokal, mode `LOOP=1`) tetap menjadi
cadangan yang terbukti lolos.

## Berkas

- `harvester.js` — penjaring (satu putaran, atau `LOOP=1` untuk PC).
- `.github/workflows/harvest.yml` — jadwal & langkah Actions.
- `package.json` — dependensi Playwright.
