const https = require('https');
const fs = require('fs');
const path = require('path');

const UA = 'MTGLimitedSite/1.0';
const OUT_DIR = path.join(__dirname, 'public', 'images', 'tokens');

// Token definitions: [filename, search query, preferred type hint]
const TOKENS = [
  ['soldier-1-1.jpg', 'is:token t:soldier pow:1 tou:1', 'Soldier'],
  ['zombie-2-2.jpg', 'is:token t:zombie pow:2 tou:2', 'Zombie'],
  ['beast-3-3.jpg', 'is:token t:beast pow:3 tou:3', 'Beast'],
  ['angel-4-4.jpg', 'is:token t:angel pow:4 tou:4', 'Angel'],
  ['goblin-1-1.jpg', 'is:token t:goblin pow:1 tou:1', 'Goblin'],
  ['dragon-5-5.jpg', 'is:token t:dragon pow:5 tou:5', 'Dragon'],
  ['treasure.jpg', 'is:token t:treasure', 'Treasure'],
  ['clue.jpg', 'is:token t:clue', 'Clue'],
  ['food.jpg', 'is:token t:food', 'Food'],
  ['blood.jpg', 'is:token t:blood', 'Blood'],
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
          if (j.object === 'error') {
            reject(new Error('Scryfall error: ' + (j.details || data.slice(0, 200))));
          } else {
            resolve(j);
          }
        }
        catch(e) { reject(new Error('Parse error: ' + data.slice(0, 200))); }
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

  for (const [filename, query, hint] of TOKENS) {
    const outPath = path.join(OUT_DIR, filename);
    if (fs.existsSync(outPath)) {
      console.log(`[skip] ${filename} already exists`);
      continue;
    }
    try {
      const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=name&unique=art`;
      console.log(`[search] ${hint}: ${query}`);
      const result = await fetchJSON(url);

      if (!result.data || result.data.length === 0) {
        console.log(`  [warn] No results for ${hint}`);
        continue;
      }

      // Find best match
      let card = result.data.find(c => (c.type_line || '').includes(hint));
      if (!card) card = result.data[0];

      const imgUrl = card.image_uris?.small || card.image_uris?.normal;
      if (!imgUrl) {
        console.log(`  [warn] No image for ${card.name}`);
        continue;
      }

      console.log(`  [found] ${card.name} (${card.type_line})`);
      console.log(`  [download] ${imgUrl}`);
      await downloadFile(imgUrl, outPath);
      console.log(`  [saved] ${filename}`);
    } catch (err) {
      console.log(`  [error] ${err.message}`);
    }
    // Rate limit: Scryfall asks for 50-100ms between requests
    await new Promise(r => setTimeout(r, 150));
  }

  console.log('\nDone!');
}

main();
