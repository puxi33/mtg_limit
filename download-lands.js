const https = require('https');
const fs = require('fs');
const path = require('path');

const UA = 'MTGLimitedSite/1.0';
const OUT_DIR = path.join(__dirname, 'public', 'images', 'tokens');

const LANDS = [
  ['plains.jpg', 'Plains', 'is:basic set:unf "Plains"'],
  ['island.jpg', 'Island', 'is:basic set:unf "Island"'],
  ['swamp.jpg', 'Swamp', 'is:basic set:unf "Swamp"'],
  ['mountain.jpg', 'Mountain', 'is:basic set:unf "Mountain"'],
  ['forest.jpg', 'Forest', 'is:basic set:unf "Forest"'],
];

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: { 'User-Agent': UA, 'Accept': 'application/json' }
    };
    https.get(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.object === 'error') reject(new Error('Scryfall error: ' + (j.details || data.slice(0, 200))));
          else resolve(j);
        } catch(e) { reject(new Error('Parse error: ' + data.slice(0, 200))); }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: { 'User-Agent': UA, 'Accept': '*/*' }
    };
    const file = fs.createWriteStream(filepath);
    https.get(options, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redir = new URL(res.headers.location);
        https.get({ hostname: redir.hostname, path: redir.pathname + redir.search, headers: { 'User-Agent': UA, 'Accept': '*/*' } }, res2 => {
          res2.pipe(file);
          file.on('finish', () => { file.close(); resolve(); });
        }).on('error', err => { fs.unlinkSync(filepath); reject(err); });
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', err => { fs.unlinkSync(filepath); reject(err); });
  });
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const [filename, landName, query] of LANDS) {
    const outPath = path.join(OUT_DIR, filename);
    try {
      const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=name&unique=art`;
      console.log(`[search] ${landName}: ${query}`);
      const result = await fetchJSON(url);

      if (!result.data || result.data.length === 0) {
        console.log(`  [warn] No results, falling back to any set`);
        const fallbackUrl = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(landName)}`;
        const card = await fetchJSON(fallbackUrl);
        const imgUrl = card.image_uris?.large || card.image_uris?.normal;
        if (!imgUrl) { console.log(`  [error] No image`); continue; }
        console.log(`  [download] ${imgUrl}`);
        await downloadFile(imgUrl, outPath);
        console.log(`  [saved] ${filename}`);
      } else {
        // Pick first result with image
        let card = result.data.find(c => c.image_uris?.large) || result.data[0];
        const imgUrl = card.image_uris?.large || card.image_uris?.normal;
        if (!imgUrl) { console.log(`  [error] No image for ${card.name}`); continue; }
        console.log(`  [found] ${card.name} (${card.set.toUpperCase()})`);
        console.log(`  [download] ${imgUrl}`);
        await downloadFile(imgUrl, outPath);
        console.log(`  [saved] ${filename}`);
      }
    } catch (err) {
      console.log(`  [error] ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 150));
  }

  console.log('\nDone!');
}

main();
