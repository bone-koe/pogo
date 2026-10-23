// ============================================================================
// POGO M3U8 HARVESTER — versi GitHub Actions / CI
// Menjaring .m3u8 bertanda tangan dari halaman player playerdee.top
// memakai Chromium (Playwright), lalu mengirimnya ke POGO Playlist
// Worker V1.4+ lewat /ingest.
//
// Konfigurasi lewat environment (di GitHub: Settings > Secrets):
//   WORKER_URL   alamat worker (bawaan: footystream milik Desi)
//   INGEST_KEY   WAJIB — samakan dengan INGEST_KEY di skrip worker
//   HEADLESS     "1" = tanpa jendela (bawaan CI: headful di bawah xvfb)
//   LOOP         "1" = jalan terus & polling (mode PC lokal)
//   PROFILE_DIR  folder profil browser (bawaan ./pogo-profile; di
//                GitHub disimpan antar-run lewat actions/cache)
//
// Mode GitHub Actions: SATU putaran lalu keluar; pengulangan diatur
// jadwal cron di .github/workflows/harvest.yml.
// ============================================================================

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const WORKER_URL = (process.env.WORKER_URL || "https://footystream.lutfimuhammad200917.workers.dev").replace(/\/+$/, "");
const INGEST_KEY = process.env.INGEST_KEY || "";
const HEADLESS = process.env.HEADLESS === "1";
const LOOP = process.env.LOOP === "1";
const PROFILE_DIR = process.env.PROFILE_DIR || path.join(__dirname, "pogo-profile");
const SHOTS_DIR = path.join(__dirname, "shots");
const POLL_MS = 5 * 60 * 1000;
const REFRESH_BEFORE_MS = 20 * 60 * 1000;
const PAGE_TIMEOUT_MS = 75 * 1000;
const MAX_LINKS_PER_ROUND = 6;

const log = (...a) => console.log(new Date().toISOString(), ...a);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getJobs(){
  const res = await fetch(WORKER_URL + "/jobs");
  if(!res.ok) throw new Error("GET /jobs HTTP " + res.status);
  return res.json();
}
async function ingest(job, link, url){
  const res = await fetch(WORKER_URL + "/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: INGEST_KEY, slug: job.slug, id: link.id, name: link.name, url })
  });
  const data = await res.json().catch(() => ({}));
  if(!res.ok || !data.ok) throw new Error("ingest HTTP " + res.status + " " + JSON.stringify(data));
  return data;
}

async function snareM3u8(context, job, link){
  const page = await context.newPage();
  let found = "";
  const onResponse = (res) => {
    const u = res.url();
    if(!found && u.includes(".m3u8")) found = u;
  };
  page.on("response", onResponse);
  try{
    await page.goto(link.url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    const deadline = Date.now() + PAGE_TIMEOUT_MS;
    let shotTaken = false;
    while(!found && Date.now() < deadline){
      await sleep(1000);
      // Di tengah jalan: simpan screenshot sekali untuk diagnosis
      // (terlihat apakah halaman berhenti di tantangan Cloudflare).
      if(!shotTaken && Date.now() > deadline - PAGE_TIMEOUT_MS + 30000){
        shotTaken = true;
        try{
          fs.mkdirSync(SHOTS_DIR, { recursive: true });
          await page.screenshot({ path: path.join(SHOTS_DIR, `${job.slug}-${link.id}.png`) });
          log(`  screenshot diagnosis disimpan (judul halaman: "${await page.title()}")`);
        }catch(e){ /* abaikan */ }
      }
    }
    return found;
  }finally{
    page.off("response", onResponse);
    await page.close().catch(() => {});
  }
}

async function oneRound(context){
  const jobs = await getJobs();
  log(`laga LIVE dari worker: ${jobs.length}`);
  let ok = 0, tried = 0;
  for(const job of jobs){
    for(const link of job.links || []){
      if(tried >= MAX_LINKS_PER_ROUND){ log("batas link per putaran tercapai, sisanya putaran berikut"); break; }
      const sisa = (link.harvestedExpiresAt || 0) - Date.now();
      if(sisa > REFRESH_BEFORE_MS){
        log(`lewati ${job.slug} #${link.id} — masih segar (${Math.round(sisa / 60000)} mnt)`);
        continue;
      }
      tried++;
      log(`membuka player ${job.slug} #${link.id} (${link.name || ""}) ...`);
      const url = await snareM3u8(context, job, link);
      if(!url){ log(`  GAGAL: .m3u8 tidak tertangkap (kemungkinan tertahan Cloudflare — cek screenshot artifact)`); continue; }
      try{
        const r = await ingest(job, link, url);
        ok++;
        log(`  OK terjaring & terkirim — berlaku s/d ${new Date(r.expiresAt).toISOString()}`);
      }catch(e){ log("  ingest error:", e.message); }
      await sleep(1500);
    }
  }
  log(`HASIL putaran: ${ok}/${tried} link terjaring`);
  return { ok, tried };
}

(async () => {
  if(!INGEST_KEY){
    console.error("INGEST_KEY belum diisi (GitHub Secrets / env) — berhenti.");
    process.exit(1);
  }
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: HEADLESS,
    viewport: { width: 1280, height: 800 },
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"]
  });
  log("browser jalan. profil:", PROFILE_DIR, "| mode:", HEADLESS ? "headless" : "headful");
  try{
    if(LOOP){
      for(;;){
        try{ await oneRound(context); }catch(e){ log("putaran error:", e.message); }
        log(`tidur ${POLL_MS / 60000} menit...`);
        await sleep(POLL_MS);
      }
    }else{
      await oneRound(context);
    }
  }finally{
    await context.close().catch(() => {});
  }
})();
