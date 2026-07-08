// ============================================================
// MTG Limited Site - MTGA-style refactor
// Server entry point
// ============================================================
const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const http = require('http');
const url = require('url');
const { WebSocketServer } = require('ws');
const { song_url, song_detail, search } = require('NeteaseCloudMusicApi');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'mtg-limited-secret-key-dev-2024';
const PORT = process.env.PORT || 3001;

// ============================================================
// Scryfall Helper: Extract card data (supports double-faced cards)
// ============================================================
function getCardImageUris(card) {
  // Normal cards have image_uris at top level
  if (card.image_uris) return card.image_uris;
  // Double-faced cards (DFCs) have images in card_faces[0] (front face)
  if (card.card_faces && card.card_faces.length > 0 && card.card_faces[0].image_uris) {
    return card.card_faces[0].image_uris;
  }
  return null;
}

function getCardText(card) {
  // Normal cards have oracle_text at top level
  if (card.oracle_text) return card.oracle_text;
  // DFCs: concatenate front and back face text
  if (card.card_faces && card.card_faces.length > 1) {
    const front = card.card_faces[0].oracle_text || '';
    const back = card.card_faces[1].oracle_text || '';
    return front + (back ? '\n---\n' + back : '');
  }
  if (card.card_faces && card.card_faces.length > 0) {
    return card.card_faces[0].oracle_text || '';
  }
  return '';
}

function getCardManaCost(card) {
  if (card.mana_cost) return card.mana_cost;
  if (card.card_faces && card.card_faces.length > 0) {
    return card.card_faces[0].mana_cost || '';
  }
  return '';
}

function getCardPowerToughness(card) {
  if (card.power != null) return { power: card.power, toughness: card.toughness };
  if (card.card_faces && card.card_faces.length > 0) {
    const face = card.card_faces[0];
    return { power: face.power || null, toughness: face.toughness || null };
  }
  return { power: null, toughness: null };
}

// Get back face image URIs for double-faced cards (DFCs)
function getCardBackImageUris(card) {
  if (card.card_faces && card.card_faces.length > 1 && card.card_faces[1].image_uris) {
    return card.card_faces[1].image_uris;
  }
  return null;
}

// Get back face type line for double-faced cards (DFCs)
function getCardBackType(card) {
  if (card.card_faces && card.card_faces.length > 1) {
    return card.card_faces[1].type_line || null;
  }
  return null;
}

// Get back face loyalty for double-faced cards (DFCs)
function getCardBackLoyalty(card) {
  if (card.card_faces && card.card_faces.length > 1) {
    return card.card_faces[1].loyalty || null;
  }
  return null;
}

// Normalize card name for Scryfall API lookup:
// "Delver of Secrets // Insectile Aberration" → "Delver of Secrets"
// "Jace, Vryn's Prodigy // Jace, Telepath Unbound" → "Jace, Vryn's Prodigy"
function normalizeCardName(name) {
  if (!name) return name;
  // Split on " // " (DFC separator) and take front face only
  const parts = name.split(' // ');
  return parts[0].trim();
}

// ============================================================
// Scryfall Bulk Cache
// ============================================================
const SCRYFALL_CACHE_FILE = path.join(__dirname, 'data', 'scryfall-cache.json');
let scryfallBulkCache = new Map();
let bulkCacheReady = false;
let bulkCacheLoading = false;

function loadBulkCacheFromDisk() {
  try {
    if (fs.existsSync(SCRYFALL_CACHE_FILE)) {
      const raw = fs.readFileSync(SCRYFALL_CACHE_FILE, 'utf8');
      const data = JSON.parse(raw);
      scryfallBulkCache = new Map(data);
      bulkCacheReady = true;
      console.log(`[scryfall-cache] Loaded ${scryfallBulkCache.size} cards from disk cache`);
      return true;
    }
  } catch (err) {
    console.warn('[scryfall-cache] Failed to load disk cache:', err.message);
  }
  return false;
}

function saveBulkCacheToDisk() {
  try {
    const data = JSON.stringify([...scryfallBulkCache]);
    fs.writeFileSync(SCRYFALL_CACHE_FILE, data, 'utf8');
    console.log(`[scryfall-cache] Saved ${scryfallBulkCache.size} cards to disk cache`);
  } catch (err) {
    console.warn('[scryfall-cache] Failed to save disk cache:', err.message);
  }
}

async function downloadBulkData() {
  if (bulkCacheLoading) return;
  bulkCacheLoading = true;
  console.log('[scryfall-cache] Starting bulk data download from Scryfall...');
  try {
    const listResponse = await fetch('https://api.scryfall.com/bulk-data', {
      headers: { 'User-Agent': 'MTGLimitedSite/2.0', 'Accept': 'application/json' }
    });
    if (!listResponse.ok) throw new Error(`Bulk list failed: ${listResponse.status}`);
    const listData = await listResponse.json();

    const oracleBulk = listData.data.find(d => d.type === 'oracle_cards');
    if (!oracleBulk) throw new Error('oracle_cards bulk type not found');
    const downloadUri = oracleBulk.download_uri;
    console.log(`[scryfall-cache] Downloading oracle cards (~${(oracleBulk.size / 1024 / 1024).toFixed(0)}MB)...`);

    const dataResponse = await fetch(downloadUri, {
      headers: { 'User-Agent': 'MTGLimitedSite/2.0', 'Accept-Encoding': 'gzip' }
    });
    if (!dataResponse.ok) throw new Error(`Download failed: ${dataResponse.status}`);

    const text = await dataResponse.text();
    console.log(`[scryfall-cache] Downloaded ${(text.length / 1024 / 1024).toFixed(1)}MB, parsing...`);

    const cards = JSON.parse(text);
    console.log(`[scryfall-cache] Parsed ${cards.length} cards, building lookup...`);
    for (const card of cards) {
      if (!card.name) continue;
      const key = card.name.toLowerCase();
      if (!scryfallBulkCache.has(key)) {
        scryfallBulkCache.set(key, {
          id: card.id, name: card.name,
          manaCost: card.mana_cost || '', cmc: card.cmc || 0,
          type: card.type_line || '', colors: card.colors || [],
          color_identity: card.color_identity || [], rarity: card.rarity || 'common',
          text: card.oracle_text || '', power: card.power || null,
          toughness: card.toughness || null, loyalty: card.loyalty || null,
          keywords: card.keywords || [],
          image: getCardImageUris(card) ? getCardImageUris(card).normal : null,
          image_small: getCardImageUris(card) ? getCardImageUris(card).small : null,
          image_large: getCardImageUris(card) ? getCardImageUris(card).large : null,
          image_back: getCardBackImageUris(card) ? getCardBackImageUris(card).normal : null,
          image_small_back: getCardBackImageUris(card) ? getCardBackImageUris(card).small : null,
          image_large_back: getCardBackImageUris(card) ? getCardBackImageUris(card).large : null,
          type_back: getCardBackType(card) || null,
          loyalty_back: getCardBackLoyalty(card) || null,
          set: card.set || '', set_name: card.set_name || '', scryfall_id: card.id
        });
      }
    }
    bulkCacheReady = true;
    saveBulkCacheToDisk();
    console.log(`[scryfall-cache] Ready! ${scryfallBulkCache.size} unique cards indexed.`);
  } catch (err) {
    console.error('[scryfall-cache] Bulk download failed:', err.message);
    console.log('[scryfall-cache] Will use API fallback for card lookups.');
  } finally {
    bulkCacheLoading = false;
  }
}

function lookupLocalCard(name) {
  if (!bulkCacheReady) return null;
  return scryfallBulkCache.get(name.toLowerCase().trim()) || null;
}

loadBulkCacheFromDisk();
// Disabled bulk download to avoid OOM on 1GB containers.
// Card lookups use the per-card Scryfall API instead.
// setTimeout(downloadBulkData, 3000);

// ============================================================
// Scryfall API fallback (per-card)
// ============================================================
const scryfallCache = new Map();
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function fetchCardFromScryfall(cardName) {
  const cached = lookupLocalCard(cardName);
  if (cached) return cached;
  const cacheKey = cardName.toLowerCase().trim();
  if (scryfallCache.has(cacheKey)) return scryfallCache.get(cacheKey);
  try {
    const url = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'MTGLimitedSite/2.0', 'Accept': 'application/json' }
    });
    if (!response.ok) {
      console.warn(`Scryfall lookup failed for "${cardName}": ${response.status}`);
      return null;
    }
    const data = await response.json();
    const card = {
      id: data.id || `sf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: data.name,
      manaCost: getCardManaCost(data),
      cmc: data.cmc || 0,
      type: data.type_line || '',
      colors: data.colors || [],
      color_identity: data.color_identity || [],
      rarity: data.rarity || 'common',
      text: getCardText(data),
      power: getCardPowerToughness(data).power,
      toughness: getCardPowerToughness(data).toughness,
      loyalty: data.loyalty || null,
      keywords: data.keywords || [],
      image: getCardImageUris(data) ? getCardImageUris(data).normal : null,
      image_small: getCardImageUris(data) ? getCardImageUris(data).small : null,
      image_large: getCardImageUris(data) ? getCardImageUris(data).large : null,
      image_back: getCardBackImageUris(data) ? getCardBackImageUris(data).normal : null,
      image_small_back: getCardBackImageUris(data) ? getCardBackImageUris(data).small : null,
      image_large_back: getCardBackImageUris(data) ? getCardBackImageUris(data).large : null,
      type_back: getCardBackType(data) || null,
      loyalty_back: getCardBackLoyalty(data) || null,
      set: data.set || '',
      set_name: data.set_name || '',
      scryfall_id: data.id || null
    };
    scryfallCache.set(cacheKey, card);
    // For DFCs, also cache under each face name
    if (data.card_faces && data.card_faces.length > 1) {
      for (const face of data.card_faces) {
        if (face.name && face.name !== data.name) {
          scryfallCache.set(face.name.toLowerCase(), card);
        }
      }
    }
    await sleep(80);
    return card;
  } catch (err) {
    console.error(`Error fetching "${cardName}" from Scryfall:`, err.message);
    return null;
  }
}

async function fetchCardsFromText(lines) {
  const results = [];
  const errors = [];
  const entries = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    let count = 1;
    let cardName = line;
    const match = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
    if (match) {
      count = parseInt(match[1]);
      cardName = match[2].trim();
    }
    entries.push({ cardName, count });
  }
  const uniqueNames = [...new Set(entries.map(e => e.cardName))];

  // Check caches first, collect names that need API lookup
  const fetchedMap = new Map();
  const namesToFetch = [];
  for (const name of uniqueNames) {
    const cached = lookupLocalCard(name);
    if (cached) {
      fetchedMap.set(name, cached);
    } else {
      const cacheKey = name.toLowerCase().trim();
      if (scryfallCache.has(cacheKey)) {
        fetchedMap.set(name, scryfallCache.get(cacheKey));
      } else {
        namesToFetch.push(name);
      }
    }
  }

  // Use Scryfall /cards/collection endpoint (up to 75 cards per request)
  const BATCH_SIZE = 75;
  for (let i = 0; i < namesToFetch.length; i += BATCH_SIZE) {
    const batch = namesToFetch.slice(i, i + BATCH_SIZE);
    // Normalize names for API: "Delver of Secrets // Insectile Aberration" → "Delver of Secrets"
    const identifiers = batch.map(name => ({ name: normalizeCardName(name) }));
    try {
      const response = await fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: { 'User-Agent': 'MTGLimitedSite/2.0', 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers })
      });
      if (!response.ok) {
        console.warn(`Scryfall collection batch ${Math.floor(i/BATCH_SIZE)+1} failed: ${response.status}`);
        // Fall back to individual fetches for this batch
        for (const name of batch) {
          const card = await fetchCardFromScryfall(name);
          if (card) fetchedMap.set(name, card);
          await sleep(100);
        }
      } else {
        const data = await response.json();
        const foundCards = data.data || [];
        const foundNames = new Set();
        for (const sfCard of foundCards) {
          if (!sfCard.name) continue;
          foundNames.add(sfCard.name);
          const card = {
            id: sfCard.id || `sf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: sfCard.name,
            manaCost: getCardManaCost(sfCard),
            cmc: sfCard.cmc || 0,
            type: sfCard.type_line || '',
            colors: sfCard.colors || [],
            color_identity: sfCard.color_identity || [],
            rarity: sfCard.rarity || 'common',
            text: getCardText(sfCard),
            power: getCardPowerToughness(sfCard).power,
            toughness: getCardPowerToughness(sfCard).toughness,
            loyalty: sfCard.loyalty || null,
            keywords: sfCard.keywords || [],
            image: getCardImageUris(sfCard) ? getCardImageUris(sfCard).normal : null,
            image_small: getCardImageUris(sfCard) ? getCardImageUris(sfCard).small : null,
            image_large: getCardImageUris(sfCard) ? getCardImageUris(sfCard).large : null,
            image_back: getCardBackImageUris(sfCard) ? getCardBackImageUris(sfCard).normal : null,
            image_small_back: getCardBackImageUris(sfCard) ? getCardBackImageUris(sfCard).small : null,
            image_large_back: getCardBackImageUris(sfCard) ? getCardBackImageUris(sfCard).large : null,
            type_back: getCardBackType(sfCard) || null,
            loyalty_back: getCardBackLoyalty(sfCard) || null,
            set: sfCard.set || '',
            set_name: sfCard.set_name || '',
            scryfall_id: sfCard.id || null
          };
          // Store under full name (e.g. "Delver of Secrets // Insectile Aberration")
          fetchedMap.set(sfCard.name, card);
          scryfallCache.set(sfCard.name.toLowerCase(), card);
          // For DFCs, also store under each face name for lookup matching
          if (sfCard.card_faces && sfCard.card_faces.length > 1) {
            for (const face of sfCard.card_faces) {
              if (face.name && face.name !== sfCard.name) {
                fetchedMap.set(face.name, card);
                scryfallCache.set(face.name.toLowerCase(), card);
              }
            }
          }
        }
        // Handle not_found cards
        if (data.not_found && data.not_found.length > 0) {
          for (const item of data.not_found) {
            // not_found can be numeric indices or objects with identifier
            let name = null;
            if (typeof item === 'number') {
              name = batch[item];
            } else if (item && typeof item === 'object') {
              name = item.identifier ? item.identifier.name : null;
            }
            if (!name) continue;
            console.warn(`Scryfall not found: "${name}"`);
            // Try individual fuzzy search as fallback
            const card = await fetchCardFromScryfall(name);
            if (card) {
              fetchedMap.set(name, card);
              // Also store under full DFC name and face names
              if (card.name && card.name !== name) {
                fetchedMap.set(card.name, card);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error(`Scryfall collection batch error:`, err.message);
      // Fall back to individual fetches
      for (const name of batch) {
        const card = await fetchCardFromScryfall(name);
        if (card) fetchedMap.set(name, card);
        await sleep(100);
      }
    }
    // Rate limit between batches
    if (i + BATCH_SIZE < namesToFetch.length) await sleep(500);
  }

  for (const { cardName, count } of entries) {
    const cardData = fetchedMap.get(cardName);
    if (cardData) {
      for (let i = 0; i < count; i++) {
        results.push({ ...cardData, id: `${cardData.id}_${i}` });
      }
    } else {
      if (!errors.includes(cardName)) errors.push(cardName);
    }
  }
  return { cards: results, errors };
}

// ============================================================
// Database Setup
// ============================================================
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'mtg.db'));
db.pragma('journal_mode = DELETE');  // Use DELETE mode for OSS/FUSE compatibility
db.pragma('synchronous = FULL');  // FULL sync for FUSE reliability
db.pragma('foreign_keys = ON');

// Graceful shutdown: close database properly before exit
function gracefulShutdown(signal) {
  console.log(`[shutdown] Received ${signal}, closing database...`);
  try {
    db.close();
    console.log('[shutdown] Database closed successfully');
  } catch (e) {
    console.error('[shutdown] Database close error:', e.message);
  }
  process.exit(0);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Schema migrations for tables that may pre-date the new columns.
// SQLite has no IF NOT EXISTS for ADD COLUMN, so check pragma_table_info first.
function ensureColumn(table, column, definition) {
  const cols = db.pragma(`table_info(${table})`);
  if (!cols.find(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
    console.log(`[migrate] Added ${table}.${column}`);
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cubes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    cards TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT CHECK(type IN ('draft','sealed')) NOT NULL,
    cube_id INTEGER,
    status TEXT DEFAULT 'waiting' CHECK(status IN ('waiting','in_progress','completed')),
    settings TEXT DEFAULT '{}',
    current_round INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (cube_id) REFERENCES cubes(id)
  );

  CREATE TABLE IF NOT EXISTS participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    seat_number INTEGER,
    pool TEXT DEFAULT '[]',
    picks TEXT DEFAULT '[]',
    current_packs TEXT DEFAULT '{}',
    status TEXT DEFAULT 'joined',
    bot_state TEXT DEFAULT '{}',
    FOREIGN KEY (event_id) REFERENCES events(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS decks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    main_deck TEXT DEFAULT '[]',
    sideboard TEXT DEFAULT '[]',
    outside_game TEXT DEFAULT '[]',
    event_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS battles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    status TEXT DEFAULT 'waiting' CHECK(status IN ('waiting','in_progress','completed')),
    player1_id INTEGER,
    player2_id INTEGER,
    player1_deck TEXT DEFAULT '{}',
    player2_deck TEXT DEFAULT '{}',
    game_state TEXT DEFAULT '{}',
    current_turn INTEGER DEFAULT 1,
    winner_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player1_id) REFERENCES users(id),
    FOREIGN KEY (player2_id) REFERENCES users(id)
  );
`);

// Schema migrations for tables that may pre-date the new columns.
ensureColumn('participants', 'bot_state', "bot_state TEXT DEFAULT '{}'");
ensureColumn('events', 'picks_this_round', "picks_this_round TEXT DEFAULT '[]'");
ensureColumn('events', 'set_code', "set_code TEXT");
ensureColumn('events', 'set_name', "set_name TEXT");
ensureColumn('battles', 'event_id', "event_id INTEGER");
ensureColumn('battles', 'player1_wins', "player1_wins INTEGER DEFAULT 0");
ensureColumn('battles', 'player2_wins', "player2_wins INTEGER DEFAULT 0");
ensureColumn('battles', 'current_game', "current_game INTEGER DEFAULT 1");
ensureColumn('battles', 'round', "round INTEGER DEFAULT 1");
ensureColumn('decks', 'outside_game', "outside_game TEXT DEFAULT '[]'");

// ============================================================
// Middleware
// ============================================================
app.set('trust proxy', true);
app.use((req, res, next) => {
  if (req.headers['x-forwarded-proto'] !== 'https' && req.hostname !== 'localhost' && req.hostname !== '127.0.0.1') {
    return res.redirect(301, `https://${req.hostname}${req.url}`);
  }
  next();
});
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// Helpers
// ============================================================
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ============================================================
// MTG SETS & BOOSTER GENERATION
// ============================================================

// Cache for set data (code → {sets, cards, timestamp})
const _setsCache = { sets: null, timestamp: 0 };
const _setCardsCache = {}; // code → {cards: {common,uncommon,rare,mythic,basic_land}, timestamp}
const SETS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Fetch all MTG sets from Scryfall
async function fetchAllSets() {
  if (_setsCache.sets && Date.now() - _setsCache.timestamp < SETS_CACHE_TTL) {
    return _setsCache.sets;
  }
  try {
    const response = await fetch('https://api.scryfall.com/sets', {
      headers: { 'User-Agent': 'MTGLimitedSite/2.0', 'Accept': 'application/json' }
    });
    if (!response.ok) throw new Error('Scryfall sets API error: ' + response.status);
    const data = await response.json();
    // Filter: only standard-legal sets (type === 'expansion' or 'core'), exclude alchemy/token/promo
    const validTypes = ['expansion', 'core', 'draft_innovation', 'masters', 'commander', 'funny'];
    const sets = (data.data || [])
      .filter(s => validTypes.includes(s.set_type))
      .filter(s => s.card_count >= 50)
      .map(s => ({
        code: s.code, name: s.name, set_type: s.set_type,
        released_at: s.released_at, icon_svg_uri: s.icon_svg_uri,
        card_count: s.card_count
      }))
      .sort((a, b) => (b.released_at || '').localeCompare(a.released_at || ''));
    _setsCache.sets = sets;
    _setsCache.timestamp = Date.now();
    return sets;
  } catch (err) {
    console.error('fetchAllSets error:', err.message);
    if (_setsCache.sets) return _setsCache.sets; // Return stale cache
    return [];
  }
}

// Fetch all cards from a specific set, grouped by rarity
async function fetchSetCards(setCode) {
  const code = setCode.toLowerCase();
  const cached = _setCardsCache[code];
  if (cached && Date.now() - cached.timestamp < SETS_CACHE_TTL) {
    return cached.cards;
  }

  const allCards = [];
  // Use game:paper to exclude digital-only (Alchemy) cards
  let url = `https://api.scryfall.com/cards/search?q=set:${code}+game:paper&order=set&unique=prints`;
  let page = 0;

  while (url && page < 20) { // Max 20 pages to avoid infinite loops
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'MTGLimitedSite/2.0', 'Accept': 'application/json' }
      });
      if (!response.ok) break;
      const data = await response.json();
      for (const c of (data.data || [])) {
        // Skip tokens, emblems, and double-sided weirdness
        if (c.layout === 'token' || c.layout === 'double_faced_token') continue;
        if (c.type_line && c.type_line.includes('Token')) continue;
        // Skip digital/Alchemy cards
        if (c.digital) continue;
        if (c.name && c.name.startsWith('A-')) continue;

        const card = {
          id: c.id, name: c.name,
          manaCost: getCardManaCost(c), cmc: c.cmc || 0,
          type: c.type_line || '',
          colors: c.colors || [], color_identity: c.color_identity || [],
          rarity: c.rarity || 'common',
          text: getCardText(c),
          power: getCardPowerToughness(c).power,
          toughness: getCardPowerToughness(c).toughness,
          loyalty: c.loyalty || null,
          keywords: c.keywords || [],
          image: getCardImageUris(c) ? getCardImageUris(c).normal : null,
          image_small: getCardImageUris(c) ? getCardImageUris(c).small : null,
          image_back: getCardBackImageUris(c) ? getCardBackImageUris(c).normal : null,
          image_small_back: getCardBackImageUris(c) ? getCardBackImageUris(c).small : null,
          type_back: getCardBackType(c) || null,
          loyalty_back: getCardBackLoyalty(c) || null,
          set: c.set || '', set_name: c.set_name || '',
          scryfall_id: c.id
        };
        allCards.push(card);
      }
      url = data.has_more ? data.next_page : null;
      page++;
      if (url) await sleep(300); // Rate limit
    } catch (err) {
      console.error(`fetchSetCards page ${page} error:`, err.message);
      break;
    }
  }

  // Group by rarity
  const grouped = {
    common: allCards.filter(c => c.rarity === 'common'),
    uncommon: allCards.filter(c => c.rarity === 'uncommon'),
    rare: allCards.filter(c => c.rarity === 'rare'),
    mythic: allCards.filter(c => c.rarity === 'mythic'),
    basic_land: allCards.filter(c => c.type && c.type.includes('Basic Land') && !c.type.includes('Token'))
  };

  // If no basic lands in set, use generic basic lands
  if (grouped.basic_land.length === 0) {
    grouped.basic_land = [
      {id:'basic_plains',name:'Plains',manaCost:'',cmc:0,type:'Basic Land - Plains',colors:['W'],color_identity:['W'],rarity:'common',text:'',power:null,toughness:null,loyalty:null,keywords:[],image:'https://cards.scryfall.io/normal/front/3/b/3bc7c2b6-0fa4-4a07-a9c4-c1b6827a6670.jpg?1562403871',image_small:'https://cards.scryfall.io/small/front/3/b/3bc7c2b6-0fa4-4a07-a9c4-c1b6827a6670.jpg?1562403871',image_back:null,image_small_back:null,type_back:null,loyalty_back:null,set:'',set_name:''},
      {id:'basic_island',name:'Island',manaCost:'',cmc:0,type:'Basic Land - Island',colors:['U'],color_identity:['U'],rarity:'common',text:'',power:null,toughness:null,loyalty:null,keywords:[],image:'https://cards.scryfall.io/normal/front/7/c/7c2163ea-5008-4b91-9b09-7fb8a27e9e6b.jpg?1562407526',image_small:'https://cards.scryfall.io/small/front/7/c/7c2163ea-5008-4b91-9b09-7fb8a27e9e6b.jpg?1562407526',image_back:null,image_small_back:null,type_back:null,loyalty_back:null,set:'',set_name:''},
      {id:'basic_swamp',name:'Swamp',manaCost:'',cmc:0,type:'Basic Land - Swamp',colors:['B'],color_identity:['B'],rarity:'common',text:'',power:null,toughness:null,loyalty:null,keywords:[],image:'https://cards.scryfall.io/normal/front/6/0/60fa413b-5dd3-4b32-ab06-7fec01a5a5b1.jpg?1562406455',image_small:'https://cards.scryfall.io/small/front/6/0/60fa413b-5dd3-4b32-ab06-7fec01a5a5b1.jpg?1562406455',image_back:null,image_small_back:null,type_back:null,loyalty_back:null,set:'',set_name:''},
      {id:'basic_mountain',name:'Mountain',manaCost:'',cmc:0,type:'Basic Land - Mountain',colors:['R'],color_identity:['R'],rarity:'common',text:'',power:null,toughness:null,loyalty:null,keywords:[],image:'https://cards.scryfall.io/normal/front/c/2/c20b3a15-8b8a-4b59-8b07-5ec1b8a5dd83.jpg?1562412674',image_small:'https://cards.scryfall.io/small/front/c/2/c20b3a15-8b8a-4b59-8b07-5ec1b8a5dd83.jpg?1562412674',image_back:null,image_small_back:null,type_back:null,loyalty_back:null,set:'',set_name:''},
      {id:'basic_forest',name:'Forest',manaCost:'',cmc:0,type:'Basic Land - Forest',colors:['G'],color_identity:['G'],rarity:'common',text:'',power:null,toughness:null,loyalty:null,keywords:[],image:'https://cards.scryfall.io/normal/front/d/7/d705d134-0731-4d0f-a930-7cc3095950b1.jpg?1562413587',image_small:'https://cards.scryfall.io/small/front/d/7/d705d134-0731-4d0f-a930-7cc3095950b1.jpg?1562413587',image_back:null,image_small_back:null,type_back:null,loyalty_back:null,set:'',set_name:''}
    ];
  }

  _setCardsCache[code] = { cards: grouped, timestamp: Date.now() };
  console.log(`Fetched ${allCards.length} cards for set ${code}: C${grouped.common.length} U${grouped.uncommon.length} R${grouped.rare.length} M${grouped.mythic.length} L${grouped.basic_land.length}`);
  return grouped;
}

// Generate a single booster pack for a set (Play Booster style: 14 cards)
function generateSetBooster(setCards) {
  const pack = [];
  const usedNames = new Set(); // Avoid duplicates within the same pack

  function pickRandom(pool, count, avoidSet) {
    const result = [];
    const available = pool.filter(c => !avoidSet.has(c.name));
    const shuffled = shuffle(available);
    for (let i = 0; i < Math.min(count, shuffled.length); i++) {
      result.push(shuffled[i]);
      avoidSet.add(shuffled[i].name);
    }
    return result;
  }

  // 1. Common (7 cards, no lands at all — filter out basic lands AND fix lands / non-basic lands)
  const nonLandCommons = setCards.common.filter(c => !c.type || !c.type.includes('Land'));
  const commons = pickRandom(nonLandCommons, 7, usedNames);
  pack.push(...commons);

  // 2. Uncommon (3 cards)
  const nonLandUncommons = setCards.uncommon.filter(c => !c.type || !c.type.includes('Basic Land'));
  const uncommons = pickRandom(nonLandUncommons, 3, usedNames);
  pack.push(...uncommons);

  // 3. Rare/Mythic (1 card): 1/8 chance mythic, 7/8 rare
  const isMythic = Math.random() < (1/8);
  const rarePool = isMythic ? setCards.mythic : setCards.rare;
  const rarePick = pickRandom(rarePool, 1, usedNames);
  if (rarePick.length > 0) pack.push(rarePick[0]);
  else {
    // Fallback: if no mythic available, try rare; if no rare, try mythic
    const fallback = isMythic ? setCards.rare : setCards.mythic;
    const fb = pickRandom(fallback, 1, usedNames);
    if (fb.length > 0) pack.push(fb[0]);
  }

  // 4. Wildcard slot 1: any rarity (NO basic lands)
  const allNonLand = [...setCards.common, ...setCards.uncommon, ...setCards.rare, ...setCards.mythic]
    .filter(c => !c.type || !c.type.includes('Basic Land'));
  const wc1 = pickRandom(allNonLand, 1, usedNames);
  if (wc1.length > 0) pack.push(wc1[0]);

  // 5. Wildcard slot 2: common/uncommon only (NO lands at all — same non-land filter as commons)
  const cUNonLand = [...nonLandCommons, ...nonLandUncommons];
  const wc2 = pickRandom(cUNonLand, 1, usedNames);
  if (wc2.length > 0) pack.push(wc2[0]);

  // 6. Land slot: any land from the set (basic lands + non-rare non-basic lands)
  const allLands = [...(setCards.basic_land || [])];
  // Add non-basic lands from common/uncommon (dual lands, utility lands, etc.)
  const nonBasicLands = [...setCards.common, ...setCards.uncommon]
    .filter(c => c.type && c.type.includes('Land') && !c.type.includes('Basic Land'));
  allLands.push(...nonBasicLands);
  const landSlot = pickRandom(allLands, 1, usedNames);
  if (landSlot.length > 0) pack.push(landSlot[0]);

  // Assign unique IDs for draft tracking
  for (let i = 0; i < pack.length; i++) {
    pack[i] = { ...pack[i], id: `${pack[i].id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${i}` };
  }

  return pack;
}

function authMiddleware(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }
  if (!token && req.cookies) token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ error: '未提供认证令牌' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: '无效的认证令牌' });
  }
}

function getBotUserId() {
  let botUser = db.prepare('SELECT id FROM users WHERE username = ?').get('_bot');
  if (!botUser) {
    const hash = bcrypt.hashSync('bot', 10);
    const r = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('_bot', hash);
    botUser = { id: r.lastInsertRowid };
  }
  return botUser.id;
}

function getDemoUserId() {
  let demoUser = db.prepare('SELECT id FROM users WHERE username = ?').get('demo');
  if (!demoUser) {
    const hash = bcrypt.hashSync('demo123', 10);
    const r = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run('demo', hash);
    demoUser = { id: r.lastInsertRowid };
  }
  return demoUser.id;
}

// ============================================================
// Sample Cube (Starter)
// ============================================================
const SAMPLE_CARDS = [
  // WHITE - 12
  {id:"w001",name:"Savannah Lions",manaCost:"{W}",cmc:1,type:"Creature - Cat",colors:["W"],rarity:"rare",text:"",power:"2",toughness:"1",keywords:[]},
  {id:"w002",name:"Mother of Runes",manaCost:"{W}",cmc:1,type:"Creature - Human Cleric",colors:["W"],rarity:"uncommon",text:"{T}: Target creature you control gains protection from the color of your choice until end of turn.",power:"1",toughness:"1",keywords:[]},
  {id:"w003",name:"Soldier of the Pantheon",manaCost:"{W}",cmc:1,type:"Creature - Human Soldier",colors:["W"],rarity:"rare",text:"Multicolored spells cost {2} more to cast.\n{T}: Add {C}. Spend this mana only to cast a multicolored spell.",power:"2",toughness:"1",keywords:[]},
  {id:"w004",name:"Knight of the White Orchid",manaCost:"{2}{W}{W}",cmc:4,type:"Creature - Human Knight",colors:["W"],rarity:"rare",text:"When Knight of the White Orchid enters the battlefield, if an opponent controls more lands than you, you may search your library for a Plains card, put it onto the battlefield, then shuffle.",power:"2",toughness:"2",keywords:["haste"]},
  {id:"w005",name:"Blade Splicer",manaCost:"{2}{W}",cmc:3,type:"Creature - Phyrexian Human Artificer",colors:["W"],rarity:"rare",text:"When Blade Splicer enters the battlefield, create a 3/3 colorless Phyrexian Golem artifact creature token.\nGolem creatures you control have first strike.",power:"1",toughness:"1",keywords:["first strike"]},
  {id:"w006",name:"Fiend Hunter",manaCost:"{1}{W}{W}",cmc:3,type:"Creature - Human Cleric",colors:["W"],rarity:"uncommon",text:"When Fiend Hunter enters the battlefield, you may exile another target creature.\nWhen Fiend Hunter leaves the battlefield, return the exiled card to the battlefield under its owner's control.",power:"1",toughness:"3",keywords:[]},
  {id:"w007",name:"Restoration Angel",manaCost:"{3}{W}",cmc:4,type:"Creature - Angel",colors:["W"],rarity:"uncommon",text:"Flash\nFlying\nWhen Restoration Angel enters the battlefield, you may exile another target creature you control, then return that card to the battlefield under your control.",power:"3",toughness:"4",keywords:["flash","flying"]},
  {id:"w008",name:"Sun Titan",manaCost:"{4}{W}{W}",cmc:6,type:"Creature - Giant",colors:["W"],rarity:"mythic",text:"Vigilance\nWhenever Sun Titan enters the battlefield or attacks, you may return target permanent card with mana value 3 or less from your graveyard to the battlefield.",power:"4",toughness:"4",keywords:["vigilance"]},
  {id:"w009",name:"Path to Exile",manaCost:"{W}",cmc:1,type:"Instant",colors:["W"],rarity:"uncommon",text:"Exile target creature. Its controller may search their library for a basic land card, put that card onto the battlefield tapped, then shuffle.",keywords:[]},
  {id:"w010",name:"Swords to Plowshares",manaCost:"{W}",cmc:1,type:"Instant",colors:["W"],rarity:"uncommon",text:"Exile target creature. Its controller gains life equal to its power.",keywords:[]},
  {id:"w011",name:"Lingering Souls",manaCost:"{2}{W}",cmc:3,type:"Sorcery",colors:["W"],rarity:"uncommon",text:"Create two 1/1 white Spirit creature tokens with flying.\nFlashback {1}{B}",keywords:[]},
  {id:"w012",name:"Honor of the Pure",manaCost:"{1}{W}",cmc:2,type:"Enchantment",colors:["W"],rarity:"rare",text:"White creatures you control get +1/+1.",keywords:[]},
  // BLUE - 12
  {id:"u001",name:"Delver of Secrets",manaCost:"{U}",cmc:1,type:"Creature - Human Wizard",colors:["U"],rarity:"uncommon",text:"At the beginning of your upkeep, look at the top card of your library. You may reveal that card. If an instant or sorcery card is revealed this way, transform Delver of Secrets.",power:"1",toughness:"1",keywords:[]},
  {id:"u002",name:"Snapcaster Mage",manaCost:"{1}{U}",cmc:2,type:"Creature - Human Wizard",colors:["U"],rarity:"rare",text:"Flash\nWhen Snapcaster Mage enters the battlefield, target instant or sorcery card in your graveyard gains flashback until end of turn.",power:"2",toughness:"1",keywords:["flash"]},
  {id:"u003",name:"Phantasmal Bear",manaCost:"{U}",cmc:1,type:"Creature - Bear Illusion",colors:["U"],rarity:"rare",text:"When Phantasmal Bear becomes the target of a spell or ability, sacrifice it.",power:"2",toughness:"2",keywords:[]},
  {id:"u004",name:"Man-o'-War",manaCost:"{2}{U}",cmc:3,type:"Creature - Jellyfish",colors:["U"],rarity:"common",text:"When Man-o'-War enters the battlefield, return target creature to its owner's hand.",power:"2",toughness:"2",keywords:[]},
  {id:"u005",name:"Mulldrifter",manaCost:"{4}{U}",cmc:5,type:"Creature - Elemental",colors:["U"],rarity:"uncommon",text:"Flying\nWhen Mulldrifter enters the battlefield, draw two cards.",power:"2",toughness:"2",keywords:["flying","evoke"]},
  {id:"u006",name:"Frost Titan",manaCost:"{4}{U}{U}",cmc:6,type:"Creature - Giant",colors:["U"],rarity:"mythic",text:"Whenever Frost Titan becomes the target of a spell or ability, counter that spell or ability unless its controller pays {2}.\nWhenever Frost Titan enters the battlefield or attacks, you may tap target permanent. It doesn't untap during its controller's next untap step.",power:"6",toughness:"6",keywords:[]},
  {id:"u007",name:"Counterspell",manaCost:"{U}{U}",cmc:2,type:"Instant",colors:["U"],rarity:"uncommon",text:"Counter target spell.",keywords:[]},
  {id:"u008",name:"Mana Leak",manaCost:"{1}{U}",cmc:2,type:"Instant",colors:["U"],rarity:"common",text:"Counter target spell unless its controller pays {3}.",keywords:[]},
  {id:"u009",name:"Remand",manaCost:"{1}{U}",cmc:2,type:"Instant",colors:["U"],rarity:"uncommon",text:"Counter target spell. If that spell is countered this way, put it into its owner's hand instead of into that player's graveyard. Draw a card.",keywords:[]},
  {id:"u010",name:"Cyclonic Rift",manaCost:"{1}{U}",cmc:2,type:"Instant",colors:["U"],rarity:"rare",text:"Return target nonland permanent you don't control to its owner's hand.\nOverload {6}{U}",keywords:[]},
  {id:"u011",name:"Brainstorm",manaCost:"{U}",cmc:1,type:"Instant",colors:["U"],rarity:"common",text:"Draw three cards, then put two cards from your hand on top of your library in any order.",keywords:[]},
  {id:"u012",name:"Ponder",manaCost:"{U}",cmc:1,type:"Sorcery",colors:["U"],rarity:"common",text:"Look at the top three cards of your library, then put them back in any order. You may shuffle.\nDraw a card.",keywords:[]},
  // BLACK - 12
  {id:"b001",name:"Dark Confidant",manaCost:"{B}",cmc:1,type:"Creature - Human Wizard",colors:["B"],rarity:"rare",text:"At the beginning of your upkeep, reveal the top card of your library and put it into your hand. You lose life equal to its mana value.",power:"2",toughness:"1",keywords:[]},
  {id:"b002",name:"Vampire Nighthawk",manaCost:"{1}{B}{B}",cmc:3,type:"Creature - Vampire Shaman",colors:["B"],rarity:"uncommon",text:"Flying\nDeathtouch\nLifelink",power:"2",toughness:"3",keywords:["flying","deathtouch","lifelink"]},
  {id:"b003",name:"Pack Rat",manaCost:"{1}{B}",cmc:2,type:"Creature - Rat",colors:["B"],rarity:"rare",text:"{2}{B}, Discard a card: Create a token that's a copy of Pack Rat.",power:"1",toughness:"1",keywords:[]},
  {id:"b004",name:"Gray Merchant of Asphodel",manaCost:"{4}{B}",cmc:5,type:"Creature - Zombie",colors:["B"],rarity:"uncommon",text:"When Gray Merchant of Asphodel enters the battlefield, each opponent loses X life, where X is your devotion to black. You gain life equal to the life lost this way.",power:"2",toughness:"4",keywords:[]},
  {id:"b005",name:"Griselbrand",manaCost:"{4}{B}{B}{B}{B}",cmc:8,type:"Legendary Creature - Demon",colors:["B"],rarity:"mythic",text:"Flying\n{B}, Pay 7 life: Draw seven cards.",power:"9",toughness:"9",keywords:["flying","lifelink"]},
  {id:"b006",name:"Doom Blade",manaCost:"{1}{B}",cmc:2,type:"Instant",colors:["B"],rarity:"uncommon",text:"Destroy target nonblack creature.",keywords:[]},
  {id:"b007",name:"Go for the Throat",manaCost:"{B}",cmc:1,type:"Instant",colors:["B"],rarity:"common",text:"Destroy target nonartifact creature.",keywords:[]},
  {id:"b008",name:"Thoughtseize",manaCost:"{B}",cmc:1,type:"Sorcery",colors:["B"],rarity:"rare",text:"Target player reveals their hand. You choose a nonland card from it. That player discards that card. You lose 2 life.",keywords:[]},
  {id:"b009",name:"Duress",manaCost:"{B}",cmc:1,type:"Sorcery",colors:["B"],rarity:"common",text:"Target opponent reveals their hand. You choose a noncreature, nonland card from it. That player discards that card.",keywords:[]},
  {id:"b010",name:"Inquisition of Kozilek",manaCost:"{B}",cmc:1,type:"Sorcery",colors:["B"],rarity:"uncommon",text:"Target player reveals their hand. You choose a nonland card from it with mana value 3 or less. That player discards that card.",keywords:[]},
  {id:"b011",name:"Sign in Blood",manaCost:"{B}{B}",cmc:2,type:"Sorcery",colors:["B"],rarity:"common",text:"Target player draws two cards and loses 2 life.",keywords:[]},
  {id:"b012",name:"Phyrexian Arena",manaCost:"{1}{B}{B}",cmc:3,type:"Enchantment",colors:["B"],rarity:"rare",text:"At the beginning of your upkeep, you draw a card and you lose 1 life.",keywords:[]},
  // RED - 12
  {id:"r001",name:"Goblin Guide",manaCost:"{R}",cmc:1,type:"Creature - Goblin Scout",colors:["R"],rarity:"rare",text:"Haste\nWhenever Goblin Guide attacks, defending player reveals the top card of their library. If it's a land card, that player puts it into their hand.",power:"2",toughness:"2",keywords:["haste"]},
  {id:"r002",name:"Monastery Swiftspear",manaCost:"{R}",cmc:1,type:"Creature - Human Monk",colors:["R"],rarity:"uncommon",text:"Prowess\nHaste",power:"1",toughness:"1",keywords:["haste","prowess"]},
  {id:"r003",name:"Eidolon of the Great Revel",manaCost:"{R}{R}",cmc:2,type:"Enchantment Creature - Spirit",colors:["R"],rarity:"rare",text:"Whenever a player casts a spell with mana value 3 or less, Eidolon of the Great Revel deals 2 damage to that player.",power:"2",toughness:"2",keywords:[]},
  {id:"r004",name:"Stormbreath Dragon",manaCost:"{3}{R}{R}",cmc:5,type:"Creature - Dragon",colors:["R"],rarity:"mythic",text:"Flying\nHaste\nProtection from white and from blue\n{5}{R}{R}: Monstrosity 3.",power:"4",toughness:"3",keywords:["flying","haste","protection"]},
  {id:"r005",name:"Inferno Titan",manaCost:"{4}{R}{R}",cmc:6,type:"Creature - Giant",colors:["R"],rarity:"mythic",text:"Whenever Inferno Titan enters the battlefield or attacks, it deals 3 damage divided as you choose among one, two, or three targets.",power:"6",toughness:"6",keywords:[]},
  {id:"r006",name:"Lightning Bolt",manaCost:"{R}",cmc:1,type:"Instant",colors:["R"],rarity:"common",text:"Lightning Bolt deals 3 damage to any target.",keywords:[]},
  {id:"r007",name:"Lava Spike",manaCost:"{R}",cmc:1,type:"Sorcery",colors:["R"],rarity:"common",text:"Lava Spike deals 3 damage to target player or planeswalker.",keywords:[]},
  {id:"r008",name:"Searing Blaze",manaCost:"{R}{R}",cmc:2,type:"Instant",colors:["R"],rarity:"rare",text:"Searing Blaze deals 1 damage to target player or planeswalker and 1 damage to target creature that player or that planeswalker's controller controls.",keywords:[]},
  {id:"r009",name:"Lightning Strike",manaCost:"{1}{R}",cmc:2,type:"Instant",colors:["R"],rarity:"uncommon",text:"Lightning Strike deals 3 damage to any target.",keywords:[]},
  {id:"r010",name:"Magma Jet",manaCost:"{1}{R}",cmc:2,type:"Instant",colors:["R"],rarity:"uncommon",text:"Magma Jet deals 2 damage to any target. Scry 2.",keywords:[]},
  {id:"r011",name:"Skullcrack",manaCost:"{1}{R}",cmc:2,type:"Instant",colors:["R"],rarity:"uncommon",text:"Players can't gain life this turn. Damage can't be prevented this turn. Skullcrack deals 3 damage to target player or planeswalker.",keywords:[]},
  {id:"r012",name:"Faithless Looting",manaCost:"{R}",cmc:1,type:"Sorcery",colors:["R"],rarity:"common",text:"Draw two cards, then discard two cards.\nFlashback {2}{R}",keywords:[]},
  // GREEN - 12
  {id:"g001",name:"Llanowar Elves",manaCost:"{G}",cmc:1,type:"Creature - Elf Druid",colors:["G"],rarity:"common",text:"{T}: Add {G}.",power:"1",toughness:"1",keywords:[]},
  {id:"g002",name:"Noble Hierarch",manaCost:"{G}",cmc:1,type:"Creature - Human Druid",colors:["G"],rarity:"rare",text:"{T}: Add {G}, {W}, or {U}.\nExalted",power:"0",toughness:"1",keywords:["exalted"]},
  {id:"g003",name:"Scavenging Ooze",manaCost:"{1}{G}",cmc:2,type:"Creature - Ooze",colors:["G"],rarity:"rare",text:"{G}: Exile target card from a graveyard. If it was a creature card, Scavenging Ooze gets +1/+1 until end of turn and you gain 1 life.",power:"2",toughness:"2",keywords:[]},
  {id:"g004",name:"Tarmogoyf",manaCost:"{1}{G}",cmc:2,type:"Creature - Lhurgoyf",colors:["G"],rarity:"rare",text:"Tarmogoyf's power is equal to the number of card types among cards in all graveyards and its toughness is equal to the number of card types among cards in all graveyards plus 1.",power:"*",toughness:"*",keywords:[]},
  {id:"g005",name:"Polukranos, World Eater",manaCost:"{2}{G}{G}",cmc:4,type:"Legendary Creature - Hydra",colors:["G"],rarity:"rare",text:"{X}{G}{G}: Monstrosity X.\nWhen Polukranos becomes monstrous, it deals X damage divided as you choose among any number of target creatures and each of those creatures deals damage equal to its power to Polukranos.",power:"5",toughness:"5",keywords:["monstrosity"]},
  {id:"g006",name:"Primeval Titan",manaCost:"{4}{G}{G}",cmc:6,type:"Creature - Giant",colors:["G"],rarity:"mythic",text:"Trample\nWhenever Primeval Titan enters the battlefield or attacks, you may search your library for up to two land cards, put them onto the battlefield tapped, then shuffle.",power:"6",toughness:"6",keywords:["trample"]},
  {id:"g007",name:"Giant Growth",manaCost:"{G}",cmc:1,type:"Instant",colors:["G"],rarity:"common",text:"Target creature gets +3/+3 until end of turn.",keywords:[]},
  {id:"g008",name:"Blossoming Defense",manaCost:"{G}",cmc:1,type:"Instant",colors:["G"],rarity:"uncommon",text:"Target creature you control gets +2/+2 and gains hexproof until end of turn.",keywords:[]},
  {id:"g009",name:"Vines of Vastwood",manaCost:"{G}",cmc:1,type:"Instant",colors:["G"],rarity:"common",text:"Kicker {4}\nTarget creature can't be the target of spells or abilities your opponents control this turn. It gets +0/+2 until end of turn. If this spell was kicked, it gets +4/+4 instead.",keywords:[]},
  {id:"g010",name:"Lightning Helix",manaCost:"{R}{W}",cmc:2,type:"Instant",colors:["R","W"],rarity:"uncommon",text:"Lightning Helix deals 3 damage to any target and you gain 3 life.",keywords:[]},
  {id:"g011",name:"Cultivate",manaCost:"{2}{G}",cmc:3,type:"Sorcery",colors:["G"],rarity:"uncommon",text:"Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.",keywords:[]},
  {id:"g012",name:"Reclamation Sage",manaCost:"{2}{G}",cmc:3,type:"Creature - Elf Shaman",colors:["G"],rarity:"uncommon",text:"When Reclamation Sage enters the battlefield, you may destroy target artifact or enchantment.",power:"2",toughness:"1",keywords:[]},
  // MULTICOLOR + ARTIFACTS - 10
  {id:"m001",name:"Fleecemane Lion",manaCost:"{G}{W}",cmc:2,type:"Creature - Cat",colors:["G","W"],rarity:"rare",text:"{3}{G}{W}: Monstrosity 1.\nAs long as Fleecemane Lion is monstrous, it has hexproof and indestructible.",power:"3",toughness:"3",keywords:["monstrosity"]},
  {id:"m002",name:"Geist of Saint Traft",manaCost:"{1}{W}{U}",cmc:3,type:"Legendary Creature - Spirit Cleric",colors:["W","U"],rarity:"mythic",text:"Hexproof\nWhenever Geist of Saint Traft attacks, create a 4/4 white Angel creature token with flying that's tapped and attacking.",power:"2",toughness:"2",keywords:["hexproof"]},
  {id:"m003",name:"Bloodbraid Elf",manaCost:"{2}{R}{G}",cmc:4,type:"Creature - Elf Berserker",colors:["R","G"],rarity:"uncommon",text:"Haste\nCascade",power:"3",toughness:"2",keywords:["haste","cascade"]},
  {id:"m004",name:"Putrefy",manaCost:"{1}{B}{G}",cmc:3,type:"Instant",colors:["B","G"],rarity:"uncommon",text:"Destroy target artifact or creature. It can't be regenerated.",keywords:[]},
  {id:"m005",name:"Electrolyze",manaCost:"{1}{U}{R}",cmc:3,type:"Instant",colors:["U","R"],rarity:"uncommon",text:"Electrolyze deals 2 damage divided as you choose among one or two targets. Draw a card.",keywords:[]},
  {id:"m006",name:"Terminate",manaCost:"{B}{R}",cmc:2,type:"Instant",colors:["B","R"],rarity:"uncommon",text:"Destroy target creature. It can't be regenerated.",keywords:[]},
  {id:"m007",name:"Vindicate",manaCost:"{1}{W}{B}",cmc:3,type:"Sorcery",colors:["W","B"],rarity:"rare",text:"Destroy target permanent.",keywords:[]},
  {id:"m008",name:"Sol Ring",manaCost:"{1}",cmc:1,type:"Artifact",colors:[],rarity:"uncommon",text:"{T}: Add {C}{C}.",keywords:[]},
  {id:"m009",name:"Umezawa's Jitte",manaCost:"{2}",cmc:2,type:"Legendary Artifact",colors:[],rarity:"mythic",text:"Whenever equipped creature deals combat damage, put a charge counter on Umezawa's Jitte.\nRemove a charge counter: Choose one - Put a -1/-1 counter on target creature; or destroy target creature; or gain 2 life.",keywords:["equip"]},
  {id:"m010",name:"Crucible of Worlds",manaCost:"{3}",cmc:3,type:"Artifact",colors:[],rarity:"mythic",text:"You may play lands from your graveyard.",keywords:[]},
  // BASIC LANDS - 8
  {id:"l001",name:"Plains",manaCost:"",cmc:0,type:"Basic Land - Plains",colors:["W"],rarity:"common",text:"",keywords:[]},
  {id:"l002",name:"Island",manaCost:"",cmc:0,type:"Basic Land - Island",colors:["U"],rarity:"common",text:"",keywords:[]},
  {id:"l003",name:"Swamp",manaCost:"",cmc:0,type:"Basic Land - Swamp",colors:["B"],rarity:"common",text:"",keywords:[]},
  {id:"l004",name:"Mountain",manaCost:"",cmc:0,type:"Basic Land - Mountain",colors:["R"],rarity:"common",text:"",keywords:[]},
  {id:"l005",name:"Forest",manaCost:"",cmc:0,type:"Basic Land - Forest",colors:["G"],rarity:"common",text:"",keywords:[]},
  {id:"l006",name:"Wastes",manaCost:"",cmc:0,type:"Basic Land - Wastes",colors:[],rarity:"common",text:"{T}: Add {C}.",keywords:[]}
];

function seedSampleCube() {
  const count = db.prepare('SELECT COUNT(*) as c FROM cubes').get();
  if (count.c === 0) {
    const demoId = getDemoUserId();
    const cards = JSON.stringify(SAMPLE_CARDS);
    db.prepare('INSERT INTO cubes (user_id, name, description, cards) VALUES (?, ?, ?, ?)').run(
      demoId, 'Starter Cube', '一个包含80张牌+8基本地的入门Cube，涵盖所有5个颜色 + 神器', cards
    );
    console.log('Sample cube seeded successfully.');
  }
}

// ============================================================
// Auth Routes
// ============================================================
app.post('/api/auth/register', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
    if (username.length < 2) return res.status(400).json({ error: '用户名至少2个字符' });
    if (password.length < 4) return res.status(400).json({ error: '密码至少4个字符' });
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return res.status(409).json({ error: '用户名已存在' });
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
    const user = { id: result.lastInsertRowid, username };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('auth_token', token, {
      httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000
    });
    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    const payload = { id: user.id, username: user.username };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('auth_token', token, {
      httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000
    });
    res.json({ token, user: payload });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ success: true });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, username, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('auth_token', token, {
    httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000
  });
  res.json({ token, user: { id: user.id, username: user.username } });
});

// ============================================================
// User Routes
// ============================================================
app.get('/api/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, username, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json(user);
});

app.put('/api/me', authMiddleware, (req, res) => {
  try {
    const { username } = req.body;
    if (username && username.length >= 2) {
      const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, req.user.id);
      if (existing) return res.status(409).json({ error: '用户名已被使用' });
      db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, req.user.id);
    }
    const user = db.prepare('SELECT id, username, created_at FROM users WHERE id = ?').get(req.user.id);
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});// ============================================================
// Cube Routes
// ============================================================
app.get('/api/cubes', authMiddleware, (req, res) => {
  const cubes = db.prepare('SELECT c.id, c.name, c.description, c.cards, c.created_at, c.user_id, u.username as creator_name FROM cubes c LEFT JOIN users u ON c.user_id = u.id ORDER BY c.created_at DESC').all();
  const result = cubes.map(c => ({
    ...c, card_count: JSON.parse(c.cards || '[]').length, cards: undefined
  }));
  res.json(result);
});

app.post('/api/cubes', authMiddleware, (req, res) => {
  try {
    const { name, description, cards } = req.body;
    if (!name) return res.status(400).json({ error: 'Cube名称不能为空' });
    const existing = db.prepare('SELECT id FROM cubes WHERE name = ?').get(name);
    if (existing) return res.status(400).json({ error: '已存在同名Cube，请使用其他名称' });
    const cardsJson = JSON.stringify(cards || []);
    const result = db.prepare('INSERT INTO cubes (user_id, name, description, cards) VALUES (?, ?, ?, ?)').run(
      req.user.id, name, description || '', cardsJson
    );
    const cube = db.prepare('SELECT * FROM cubes WHERE id = ?').get(result.lastInsertRowid);
    cube.cards = JSON.parse(cube.cards);
    res.json(cube);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/cubes/:id', authMiddleware, (req, res) => {
  const cube = db.prepare('SELECT c.*, u.username as creator_name FROM cubes c LEFT JOIN users u ON c.user_id = u.id WHERE c.id = ?').get(req.params.id);
  if (!cube) return res.status(404).json({ error: 'Cube不存在' });
  cube.cards = JSON.parse(cube.cards);
  res.json(cube);
});

app.put('/api/cubes/:id', authMiddleware, (req, res) => {
  try {
    const cube = db.prepare('SELECT * FROM cubes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!cube) return res.status(404).json({ error: 'Cube不存在' });
    const { name, description, cards } = req.body;
    if (name && name !== cube.name) {
      const dup = db.prepare('SELECT id FROM cubes WHERE name = ? AND id != ?').get(name, cube.id);
      if (dup) return res.status(400).json({ error: '已存在同名Cube，请使用其他名称' });
    }
    db.prepare('UPDATE cubes SET name = ?, description = ?, cards = ? WHERE id = ?').run(
      name || cube.name,
      description !== undefined ? description : cube.description,
      cards ? JSON.stringify(cards) : cube.cards,
      cube.id
    );
    const updated = db.prepare('SELECT * FROM cubes WHERE id = ?').get(cube.id);
    updated.cards = JSON.parse(updated.cards);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/cubes/:id', authMiddleware, (req, res) => {
  const result = db.prepare('DELETE FROM cubes WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Cube不存在' });
  res.json({ success: true });
});

app.post('/api/cubes/import', authMiddleware, async (req, res) => {
  try {
    const { data, name, description } = req.body;
    if (!data || typeof data !== 'string') {
      return res.status(400).json({ error: '请提供纯文本格式的卡牌列表' });
    }
    const cubeName = name || 'Imported Cube';
    const existing = db.prepare('SELECT id FROM cubes WHERE name = ?').get(cubeName);
    if (existing) return res.status(400).json({ error: '已存在同名Cube，请使用其他名称' });
    const cubeDesc = description || '';
    const lines = data.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return res.status(400).json({ error: '没有解析到任何卡牌名称' });
    const { cards, errors } = await fetchCardsFromText(lines);
    if (cards.length === 0) return res.status(400).json({ error: '没有获取到任何卡牌数据' });
    const cardsJson = JSON.stringify(cards);
    const result = db.prepare('INSERT INTO cubes (user_id, name, description, cards) VALUES (?, ?, ?, ?)').run(
      req.user.id, cubeName, cubeDesc, cardsJson
    );
    const successCount = cards.filter(c => c.image || c.image_small).length;
    res.json({
      id: result.lastInsertRowid, user_id: req.user.id, name: cubeName, description: cubeDesc,
      cards: cards, created_at: new Date().toISOString(),
      import_stats: {
        total: cards.length, fetched: successCount, failed: errors.length,
        failed_names: errors.slice(0, 20)
      }
    });
  } catch (err) {
    res.status(500).json({ error: '导入失败: ' + err.message });
  }
});

app.post('/api/cubes/:id/add-cards', authMiddleware, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: '请提供卡牌名称文本' });
    const cube = db.prepare('SELECT * FROM cubes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!cube) return res.status(404).json({ error: 'Cube不存在' });
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const { cards: newCards, errors } = await fetchCardsFromText(lines);
    const existingCards = JSON.parse(cube.cards);
    const allCards = [...existingCards, ...newCards];
    db.prepare('UPDATE cubes SET cards = ? WHERE id = ?').run(JSON.stringify(allCards), cube.id);
    res.json({
      added: newCards.length,
      fetched: newCards.filter(c => c.image).length,
      failed: errors.length,
      failed_names: errors.slice(0, 20),
      total: allCards.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cubes/:id/add-cards-batch', authMiddleware, async (req, res) => {
  try {
    const { names } = req.body; // array of card name strings
    if (!Array.isArray(names) || names.length === 0) return res.status(400).json({ error: '请提供卡牌名称列表' });
    const cube = db.prepare('SELECT * FROM cubes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!cube) return res.status(404).json({ error: 'Cube不存在' });
    const { cards: newCards, errors } = await fetchCardsFromText(names);
    const existingCards = JSON.parse(cube.cards);
    const allCards = [...existingCards, ...newCards];
    db.prepare('UPDATE cubes SET cards = ? WHERE id = ?').run(JSON.stringify(allCards), cube.id);
    res.json({
      added: newCards.length,
      fetched: newCards.filter(c => c.image).length,
      failed: errors.length,
      failed_names: errors.slice(0, 20),
      total: allCards.length,
      processed: names.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove a card from a cube by index
app.post('/api/cubes/:id/remove-card', authMiddleware, (req, res) => {
  try {
    const { index } = req.body;
    if (index === undefined || index === null) return res.status(400).json({ error: '请提供卡牌索引' });
    const cube = db.prepare('SELECT * FROM cubes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!cube) return res.status(404).json({ error: 'Cube不存在' });
    const cards = JSON.parse(cube.cards);
    if (index < 0 || index >= cards.length) return res.status(400).json({ error: '无效的卡牌索引' });
    const removed = cards.splice(index, 1)[0];
    db.prepare('UPDATE cubes SET cards = ? WHERE id = ?').run(JSON.stringify(cards), cube.id);
    res.json({ removed: removed.name, total: cards.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Retry failed cards in a cube (cards with no image/data)
app.post('/api/cubes/:id/retry-failed', authMiddleware, async (req, res) => {
  try {
    const cube = db.prepare('SELECT * FROM cubes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!cube) return res.status(404).json({ error: 'Cube不存在' });
    const cards = JSON.parse(cube.cards);
    const failedIndices = [];
    const failedNames = [];
    cards.forEach((card, idx) => {
      if (!card.image && !card.image_small && card.text === '未找到卡牌数据') {
        failedIndices.push(idx);
        if (!failedNames.includes(card.name)) failedNames.push(card.name);
      }
    });
    if (failedNames.length === 0) return res.json({ retried: 0, success: 0, message: '没有需要重试的卡牌' });
    const uniqueFailed = [...new Set(failedNames)];
    const { cards: fetchedCards } = await fetchCardsFromText(uniqueFailed);
    const fetchedMap = new Map();
    for (const card of fetchedCards) {
      if (card.image || card.image_small) fetchedMap.set(card.name, card);
    }
    let successCount = 0;
    for (const idx of failedIndices) {
      const replacement = fetchedMap.get(cards[idx].name);
      if (replacement) {
        cards[idx] = { ...replacement, id: cards[idx].id };
        successCount++;
      }
    }
    db.prepare('UPDATE cubes SET cards = ? WHERE id = ?').run(JSON.stringify(cards), cube.id);
    res.json({
      retried: failedIndices.length,
      success: successCount,
      still_failed: failedIndices.length - successCount,
      total: cards.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search cards on Scryfall
app.get('/api/cards/search', authMiddleware, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) return res.status(400).json({ error: '搜索词至少2个字符' });
    const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&order=name`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'MTGLimitedSite/2.0', 'Accept': 'application/json' }
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: errData.details || `搜索失败: ${response.status}` });
    }
    const data = await response.json();
    const cards = (data.data || []).slice(0, 20).map(c => ({
      id: c.id, name: c.name, manaCost: getCardManaCost(c), cmc: c.cmc || 0,
      type: c.type_line || '', colors: c.colors || [], color_identity: c.color_identity || [],
      rarity: c.rarity || 'common', text: getCardText(c),
      power: getCardPowerToughness(c).power, toughness: getCardPowerToughness(c).toughness,
      loyalty: c.loyalty || null, keywords: c.keywords || [],
      image: getCardImageUris(c) ? getCardImageUris(c).normal : null,
      image_small: getCardImageUris(c) ? getCardImageUris(c).small : null,
      image_back: getCardBackImageUris(c) ? getCardBackImageUris(c).normal : null,
      image_small_back: getCardBackImageUris(c) ? getCardBackImageUris(c).small : null,
      type_back: getCardBackType(c) || null,
      loyalty_back: getCardBackLoyalty(c) || null,
      set: c.set || '', set_name: c.set_name || ''
    }));
    res.json({ cards, has_more: data.has_more, total: data.total_cards || cards.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Batch search cards by name (uses Scryfall /cards/collection for efficiency)
app.post('/api/cards/batch-search', authMiddleware, async (req, res) => {
  try {
    const { names } = req.body;
    if (!Array.isArray(names) || names.length === 0) return res.status(400).json({ error: '请提供卡牌名称列表' });

    // Deduplicate and normalize
    const seen = new Set();
    const uniqueNames = [];
    for (const n of names) {
      const norm = normalizeCardName(n.trim());
      const key = norm.toLowerCase();
      if (!seen.has(key) && norm.length > 0) { seen.add(key); uniqueNames.push(norm); }
    }

    const identifiers = uniqueNames.map(name => ({ name }));
    const response = await fetch('https://api.scryfall.com/cards/collection', {
      method: 'POST',
      headers: { 'User-Agent': 'MTGLimitedSite/2.0', 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers })
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Scryfall API error: ' + response.status });
    }

    const data = await response.json();
    const cards = (data.data || []).map(c => ({
      id: c.id, name: c.name, manaCost: getCardManaCost(c), cmc: c.cmc || 0,
      type: c.type_line || '', colors: c.colors || [], color_identity: c.color_identity || [],
      rarity: c.rarity || 'common', text: getCardText(c),
      power: getCardPowerToughness(c).power, toughness: getCardPowerToughness(c).toughness,
      loyalty: c.loyalty || null, keywords: c.keywords || [],
      image: getCardImageUris(c) ? getCardImageUris(c).normal : null,
      image_small: getCardImageUris(c) ? getCardImageUris(c).small : null,
      image_back: getCardBackImageUris(c) ? getCardBackImageUris(c).normal : null,
      image_small_back: getCardBackImageUris(c) ? getCardBackImageUris(c).small : null,
      type_back: getCardBackType(c) || null,
      loyalty_back: getCardBackLoyalty(c) || null,
      set: c.set || '', set_name: c.set_name || ''
    }));

    const foundNamesSet = new Set(cards.map(c => c.name.toLowerCase()));
    // Also check DFC face names
    for (const sfCard of (data.data || [])) {
      if (sfCard.card_faces) {
        for (const face of sfCard.card_faces) {
          if (face.name) foundNamesSet.add(face.name.toLowerCase());
        }
      }
    }

    const failed = uniqueNames.filter(n => !foundNamesSet.has(n.toLowerCase()));

    // Cache found cards
    for (const sfCard of (data.data || [])) {
      if (!sfCard.name) continue;
      const card = cards.find(c => c.name === sfCard.name);
      if (card) {
        scryfallCache.set(sfCard.name.toLowerCase(), card);
        if (sfCard.card_faces && sfCard.card_faces.length > 1) {
          for (const face of sfCard.card_faces) {
            if (face.name && face.name !== sfCard.name) {
              scryfallCache.set(face.name.toLowerCase(), card);
            }
          }
        }
      }
    }

    res.json({ cards, failed, total: names.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// MTG Sets API
app.get('/api/sets', authMiddleware, async (req, res) => {
  try {
    const sets = await fetchAllSets();
    res.json({ sets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sets/:code/cards', authMiddleware, async (req, res) => {
  try {
    const code = req.params.code.toLowerCase();
    const cards = await fetchSetCards(code);
    res.json({
      set_code: code,
      common: cards.common.length,
      uncommon: cards.uncommon.length,
      rare: cards.rare.length,
      mythic: cards.mythic.length,
      basic_land: cards.basic_land.length,
      total: cards.common.length + cards.uncommon.length + cards.rare.length + cards.mythic.length + cards.basic_land.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add searched cards to cube
app.post('/api/cubes/:id/add-searched', authMiddleware, async (req, res) => {
  try {
    const { cardNames } = req.body;
    if (!Array.isArray(cardNames) || cardNames.length === 0) return res.status(400).json({ error: '请选择要添加的卡牌' });
    const cube = db.prepare('SELECT * FROM cubes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!cube) return res.status(404).json({ error: 'Cube不存在' });
    const { cards: newCards, errors } = await fetchCardsFromText(cardNames);
    const existingCards = JSON.parse(cube.cards);
    const allCards = [...existingCards, ...newCards];
    db.prepare('UPDATE cubes SET cards = ? WHERE id = ?').run(JSON.stringify(allCards), cube.id);
    res.json({
      added: newCards.length,
      fetched: newCards.filter(c => c.image || c.image_small).length,
      failed: errors.length,
      failed_names: errors.slice(0, 20),
      total: allCards.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Event Routes
// ============================================================
app.get('/api/events', authMiddleware, (req, res) => {
  const events = db.prepare(`
    SELECT e.*, c.name as cube_name, u.username as creator_name,
    (SELECT COUNT(*) FROM participants WHERE event_id = e.id) as participant_count
    FROM events e
    LEFT JOIN cubes c ON e.cube_id = c.id
    LEFT JOIN users u ON e.user_id = u.id
    ORDER BY e.created_at DESC
  `).all();
  const result = events.map(e => ({ ...e, settings: JSON.parse(e.settings || '{}') }));
  res.json(result);
});

app.post('/api/events', authMiddleware, (req, res) => {
  try {
    const { name, type, cube_id, set_code, set_name, settings } = req.body;
    if (!name || !type) return res.status(400).json({ error: '名称和类型不能为空' });
    if (!['draft', 'sealed'].includes(type)) return res.status(400).json({ error: '无效的事件类型' });
    if (cube_id) {
      const cube = db.prepare('SELECT * FROM cubes WHERE id = ? AND user_id = ?').get(cube_id, req.user.id);
      if (!cube) return res.status(404).json({ error: 'Cube不存在' });
    }
    if (!cube_id && !set_code) return res.status(400).json({ error: '请选择Cube或万智牌系列' });
    const defaultSettings = {
      max_players: type === 'draft' ? 8 : 24,
      packs_per_player: type === 'draft' ? 3 : 6,
      cards_per_pack: 15,
      cards_per_pick: type === 'draft' ? 1 : 1,
      set_code: set_code || null,
      set_name: set_name || null,
      ...settings
    };
    const result = db.prepare('INSERT INTO events (user_id, name, type, cube_id, settings, set_code, set_name) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      req.user.id, name, type, cube_id || null, JSON.stringify(defaultSettings), set_code || null, set_name || null
    );
    const eventId = result.lastInsertRowid;
    db.prepare('INSERT INTO participants (event_id, user_id, seat_number) VALUES (?, ?, ?)').run(
      eventId, req.user.id, 1
    );
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
    event.settings = JSON.parse(event.settings);
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/events/:id', authMiddleware, (req, res) => {
  const event = db.prepare(`
    SELECT e.*, c.name as cube_name, u.username as creator_name
    FROM events e
    LEFT JOIN cubes c ON e.cube_id = c.id
    LEFT JOIN users u ON e.user_id = u.id
    WHERE e.id = ?
  `).get(req.params.id);
  if (!event) return res.status(404).json({ error: '事件不存在' });
  event.settings = JSON.parse(event.settings || '{}');
  const participants = db.prepare(`
    SELECT p.*, u.username FROM participants p
    LEFT JOIN users u ON p.user_id = u.id
    WHERE p.event_id = ?
    ORDER BY p.seat_number
  `).all(req.params.id);
  event.participants = participants.map(p => ({
    id: p.id, user_id: p.user_id, username: p.username, seat_number: p.seat_number,
    status: p.status, pick_count: JSON.parse(p.picks || '[]').length,
    pool_size: JSON.parse(p.pool || '[]').length
  }));
  const myParticipation = participants.find(p => p.user_id === req.user.id);
  if (myParticipation) {
    let packData = JSON.parse(myParticipation.current_packs || '{}');
    if (Array.isArray(packData)) {
      packData = { current: packData[0] || [], queue: packData.slice(1), pending: null };
    }
    event.my_participation = {
      ...myParticipation,
      pool: JSON.parse(myParticipation.pool || '[]'),
      picks: JSON.parse(myParticipation.picks || '[]'),
      current_packs: packData
    };
  } else {
    event.my_participation = null;
  }

  // Round-state info so the client can show "waiting for X to pick"
  event.picks_this_round = JSON.parse(event.picks_this_round || '[]');
  const picksThisRound = event.picks_this_round;
  event.round_status = {
    picked: picksThisRound.map(id => {
      const p = participants.find(x => x.id === id);
      return p ? { id, username: p.username, seat: p.seat_number } : { id };
    }),
    waiting_for: participants
      .filter(p => !picksThisRound.includes(p.id))
      .filter(p => {
        const pd = JSON.parse(p.current_packs || '{}');
        const cur = Array.isArray(pd) ? pd[0] : (pd.current || []);
        return cur && cur.length > 0;
      })
      .map(p => ({ id: p.id, username: p.username, seat: p.seat_number }))
  };

  res.json(event);
});

app.delete('/api/events/:id', authMiddleware, (req, res) => {
  const event = db.prepare('SELECT * FROM events WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!event) return res.status(404).json({ error: '事件不存在' });
  db.prepare('DELETE FROM participants WHERE event_id = ?').run(req.params.id);
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/api/events/:id/join', authMiddleware, (req, res) => {
  try {
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
    if (!event) return res.status(404).json({ error: '事件不存在' });
    if (event.status !== 'waiting') return res.status(400).json({ error: '事件已经开始' });
    const existing = db.prepare('SELECT id FROM participants WHERE event_id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (existing) return res.status(400).json({ error: '你已经加入了此事件' });
    const settings = JSON.parse(event.settings);
    const count = db.prepare('SELECT COUNT(*) as c FROM participants WHERE event_id = ?').get(req.params.id);
    if (count.c >= settings.max_players) return res.status(400).json({ error: '参与人数已满' });
    const seatNumber = count.c + 1;
    const result = db.prepare('INSERT INTO participants (event_id, user_id, seat_number) VALUES (?, ?, ?)').run(
      req.params.id, req.user.id, seatNumber
    );
    res.json({ id: result.lastInsertRowid, seat_number: seatNumber });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/events/:id/bot-fill', authMiddleware, (req, res) => {
  try {
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
    if (!event) return res.status(404).json({ error: '事件不存在' });
    if (event.status !== 'waiting') return res.status(400).json({ error: '事件已经开始' });
    const settings = JSON.parse(event.settings);
    const count = db.prepare('SELECT COUNT(*) as c FROM participants WHERE event_id = ?').get(req.params.id);
    const needed = settings.max_players - count.c;
    const botUserId = getBotUserId();
    const insertStmt = db.prepare('INSERT INTO participants (event_id, user_id, seat_number, status) VALUES (?, ?, ?, ?)');
    for (let i = 0; i < needed; i++) {
      insertStmt.run(req.params.id, botUserId, count.c + i + 1, 'bot');
    }
    res.json({ added: needed, total: settings.max_players });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Draft Bot AI
// ============================================================
function botScoreCard(card, botState) {
  let score = 0;
  const rarityScore = { mythic: 100, rare: 40, uncommon: 15, common: 5 };
  score += rarityScore[card.rarity] || 5;

  // Color commitment (bot favors a leading color)
  if (card.colors && card.colors.length === 1) {
    const c = card.colors[0];
    score += (botState.colorCount[c] || 0) * 4;
  } else if (card.colors && card.colors.length > 1) {
    // Multicolor: good if matches bot's committed colors
    let overlap = 0;
    for (const c of card.colors) overlap += (botState.colorCount[c] || 0);
    if (overlap > 0) score += overlap * 3;
  }

  // Type preferences
  if (card.type && card.type.includes('Creature')) score += 6;
  if (card.type && card.type.includes('Land')) score += 8;  // fix mana
  if (card.type && (card.type.includes('Instant') || card.type.includes('Sorcery'))) {
    // Removal / card draw
    if (card.text && /destroy|exile|damage|draw/i.test(card.text)) score += 4;
  }
  if (card.type && card.type.includes('Planeswalker')) score += 12;

  // Curve
  if (card.cmc === 1) score += 4;
  else if (card.cmc === 2) score += 5;
  else if (card.cmc === 3) score += 3;
  else if (card.cmc === 4) score += 1;
  else if (card.cmc >= 6) score -= 3;

  // P/T ratio
  if (card.power && card.toughness && !card.power.includes('*')) {
    const p = parseInt(card.power) || 0;
    const t = parseInt(card.toughness) || 0;
    if (p + t > 0) score += Math.min((p + t) / 3, 5);
  }

  // Keywords that matter
  if (card.keywords && card.keywords.length > 0) {
    const valuable = ['flying', 'trample', 'haste', 'lifelink', 'deathtouch', 'hexproof', 'first strike', 'double strike'];
    for (const k of card.keywords) {
      if (valuable.includes(k)) score += 3;
    }
  }

  return score;
}

function botMakePick(pack, botState) {
  if (pack.length === 0) return null;
  let best = pack[0];
  let bestScore = -Infinity;
  for (const card of pack) {
    const score = botScoreCard(card, botState);
    if (score > bestScore) {
      bestScore = score;
      best = card;
    }
  }
  return best;
}

function updateBotState(botState, pickedCard) {
  if (pickedCard && pickedCard.colors && pickedCard.colors.length === 1) {
    const c = pickedCard.colors[0];
    botState.colorCount[c] = (botState.colorCount[c] || 0) + 1;
  }
  return botState;
}

// ============================================================
// Event Start + Pick (real Draft engine)
// ============================================================
app.post('/api/events/:id/start', authMiddleware, async (req, res) => {
  try {
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
    if (!event) return res.status(404).json({ error: '事件不存在' });
    if (event.status !== 'waiting') return res.status(400).json({ error: '事件已经开始' });
    const settings = JSON.parse(event.settings);
    const participants = db.prepare('SELECT * FROM participants WHERE event_id = ? ORDER BY seat_number').all(req.params.id);
    if (participants.length < 2) return res.status(400).json({ error: '至少需要2名参与者' });

    const isSeriesMode = !!event.set_code;
    let setCards = null;
    let cubeCards = null;

    if (isSeriesMode) {
      // Series mode: fetch set cards for booster generation
      setCards = await fetchSetCards(event.set_code);
      const total = setCards.common.length + setCards.uncommon.length + setCards.rare.length + setCards.mythic.length;
      if (total < 30) return res.status(400).json({ error: '该系列卡牌数量不足，无法开始' });
    } else {
      // Cube mode: use existing cube logic
      const cube = event.cube_id ? db.prepare('SELECT * FROM cubes WHERE id = ?').get(event.cube_id) : null;
      if (!cube) return res.status(400).json({ error: '没有关联的Cube' });
      cubeCards = JSON.parse(cube.cards);
      if (cubeCards.length < 45) return res.status(400).json({ error: 'Cube至少需要45张牌' });
    }

    if (event.type === 'draft') {
      const totalPacksNeeded = participants.length * settings.packs_per_player;
      const allPacks = [];

      if (isSeriesMode) {
        // Series mode: generate booster packs
        for (let p = 0; p < totalPacksNeeded; p++) {
          allPacks.push(generateSetBooster(setCards));
        }
      } else {
        // Cube mode: shuffle and deal from cube
        const shuffled = shuffle(cubeCards);
        let idx = 0;
        for (let p = 0; p < totalPacksNeeded; p++) {
          const pack = [];
          for (let c = 0; c < settings.cards_per_pack; c++) {
            pack.push(shuffled[idx % shuffled.length]);
            idx++;
          }
          allPacks.push(pack);
        }
      }

      const updateStmt = db.prepare('UPDATE participants SET current_packs = ?, pool = ?, picks = ?, bot_state = ?, status = ? WHERE id = ?');
      for (let i = 0; i < participants.length; i++) {
        const playerPacks = [];
        for (let p = 0; p < settings.packs_per_player; p++) {
          playerPacks.push(allPacks[i * settings.packs_per_player + p]);
        }
        const packData = {
          current: playerPacks[0] || [],
          queue: playerPacks.slice(1),
          pending: null
        };
        const isBot = participants[i].status === 'bot';
        const newStatus = isBot ? 'bot' : 'drafting';
        const botState = isBot ? JSON.stringify({ colorCount: {} }) : '{}';
        updateStmt.run(
          JSON.stringify(packData),
          JSON.stringify([]),
          JSON.stringify([]),
          botState,
          newStatus,
          participants[i].id
        );
      }
      db.prepare('UPDATE events SET status = ?, current_round = 1 WHERE id = ?').run('in_progress', req.params.id);
    } else if (event.type === 'sealed') {
      const updateStmt = db.prepare('UPDATE participants SET pool = ?, status = ? WHERE id = ?');
      for (const participant of participants) {
        let pool = [];
        if (isSeriesMode) {
          // Series sealed: generate packs_per_player booster packs
          for (let p = 0; p < settings.packs_per_player; p++) {
            pool.push(...generateSetBooster(setCards));
          }
        } else {
          // Cube sealed: random slice from cube
          const poolSize = settings.packs_per_player * settings.cards_per_pack;
          pool = shuffle(cubeCards).slice(0, poolSize);
        }
        updateStmt.run(JSON.stringify(pool), 'building', participant.id);
      }
      db.prepare('UPDATE events SET status = ?, current_round = 1, picks_this_round = ? WHERE id = ?').run('in_progress', '[]', req.params.id);
    }

    const modeLabel = isSeriesMode ? (event.set_name || event.set_code) : 'Cube';
    res.json({ success: true, message: `${event.type === 'draft' ? '轮抓' : '现开'}已开始！(${modeLabel})` });
    wsBroadcast(`event:${req.params.id}`, 'event_updated', { eventId: parseInt(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/events/:id/pick', authMiddleware, (req, res) => {
  try {
    const { card_ids } = req.body;
    if (!card_ids || !Array.isArray(card_ids) || card_ids.length === 0) {
      return res.status(400).json({ error: '请选择至少一张卡牌' });
    }
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
    if (!event || event.status !== 'in_progress') return res.status(400).json({ error: '事件不在进行中' });
    const settings = JSON.parse(event.settings);
    const cardsPerPick = settings.cards_per_pick || 1;

    const participants = db.prepare('SELECT * FROM participants WHERE event_id = ? ORDER BY seat_number').all(req.params.id);
    const myIndex = participants.findIndex(p => p.user_id === req.user.id);
    if (myIndex === -1) return res.status(400).json({ error: '你不是参与者' });
    const N = participants.length;
    const botUserId = getBotUserId();

    // Parse all participants' pack data
    const allPacks = participants.map(p => {
      const pd = JSON.parse(p.current_packs || '{}');
      if (Array.isArray(pd)) {
        return { current: pd[0] || [], queue: pd.slice(1), pending: null };
      }
      return { current: pd.current || [], queue: pd.queue || [], pending: pd.pending || null };
    });
    const allPools = participants.map(p => JSON.parse(p.pool || '[]'));
    const allPicks = participants.map(p => JSON.parse(p.picks || '[]'));
    const allBotStates = participants.map(p => JSON.parse(p.bot_state || '{}'));

    // 允许少于 cardsPerPick —— 当包里只剩奇数张时最后一张也允许单独抓
    // 比如 15 张包、cards_per_pick=2:每轮抓2,最后一轮(剩1张)只能抓1张
    const myCurrentPackLen = allPacks[myIndex].current.length;
    const maxPickable = Math.min(cardsPerPick, Math.max(1, myCurrentPackLen));
    if (card_ids.length > maxPickable) {
      return res.status(400).json({ error: `当前包最多可选 ${maxPickable} 张卡牌` });
    }

    // Determine current pack number for direction
    // packNumber = packs_per_player - queue.length (since queue holds remaining packs after current)
    const myPackNumber = settings.packs_per_player - allPacks[myIndex].queue.length;
    const direction = myPackNumber % 2 === 1 ? 1 : -1;

    // === Round-tracking: who has picked since the last pass? ===
    // A player may only pick once per round. The round ends when every participant
    // has picked (or is a bot that auto-picked). When the round ends, we pass packs.
    let picksThisRound = JSON.parse(event.picks_this_round || '[]');
    const myParticipantId = participants[myIndex].id;
    if (picksThisRound.includes(myParticipantId)) {
      return res.status(400).json({ error: '本轮你已经选过牌了，请等待其他玩家传牌' });
    }

    // Phase 1: Human picks from their current pack
    const pickedCards = [];
    for (const cid of card_ids) {
      const idx = allPacks[myIndex].current.findIndex(c => c.id === cid);
      if (idx === -1) return res.status(400).json({ error: '卡牌不在当前卡包中' });
      pickedCards.push(allPacks[myIndex].current.splice(idx, 1)[0]);
    }
    allPools[myIndex].push(...pickedCards);
    pickedCards.forEach(c => allPicks[myIndex].push({ card: c, from_pack: myPackNumber }));
    picksThisRound.push(myParticipantId);

    // Phase 2: Bots pick from their current pack (auto-picked this round)
    const botPickThisRound = [];  // participant ids of bots that actually picked
    for (let i = 0; i < N; i++) {
      if (i === myIndex) continue;
      const isBot = participants[i].user_id === botUserId || participants[i].status === 'bot';
      if (!isBot) continue;
      const pack = allPacks[i].current;
      if (pack.length === 0) continue;
      const numToPick = Math.min(cardsPerPick, pack.length);
      for (let j = 0; j < numToPick; j++) {
        const bestCard = botMakePick(pack, allBotStates[i].colorCount ? allBotStates[i] : { colorCount: {} });
        if (!bestCard) break;
        const idx = pack.findIndex(c => c.id === bestCard.id);
        if (idx === -1) break;
        const [card] = pack.splice(idx, 1);
        allPools[i].push(card);
        allPicks[i].push({ card, from_pack: myPackNumber });
        allBotStates[i] = updateBotState(allBotStates[i], card);
      }
      botPickThisRound.push(participants[i].id);
    }
    // Mark all bots that picked this round
    for (const id of botPickThisRound) {
      if (!picksThisRound.includes(id)) picksThisRound.push(id);
    }

    // Decide whether the round ends (and packs pass) or we wait for more players.
    // Round ends only if every participant has picked since the last pass.
    // If some humans haven't picked yet, hold off on passing — they need to take
    // their turn before packs can circulate. (Bots always pick instantly, so a
    // round with 1 human + N-1 bots always completes in one API call.)
    const allHumanIds = participants.filter(p => p.user_id !== botUserId).map(p => p.id);
    const allHumansPicked = allHumanIds.every(id => picksThisRound.includes(id));
    const allBotsPicked = participants
      .filter(p => p.user_id === botUserId || p.status === 'bot')
      .every(p => picksThisRound.includes(p.id) || allPacks[participants.findIndex(x => x.id === p.id)].current.length === 0);
    const allBotsNoCurrent = participants
      .filter(p => p.user_id === botUserId || p.status === 'bot')
      .every(p => allPacks[participants.findIndex(x => x.id === p.id)].current.length === 0);

    const roundComplete = allHumansPicked && (allBotsPicked || allBotsNoCurrent);

    // Phase 3 + 4 only run when the round is complete
    if (roundComplete) {
      // Phase 3: Pass packs ONLY from participants who picked this round.
      // Players who haven't picked yet (shouldn't happen at this point, but defensive)
      // do not pass their pack — their pack stays put.
      const newIncoming = new Array(N).fill(null);
      for (let i = 0; i < N; i++) {
        if (!picksThisRound.includes(participants[i].id)) continue;
        if (allPacks[i].current.length === 0) continue;
        const targetIdx = (i + direction + N) % N;
        newIncoming[targetIdx] = allPacks[i].current;
        allPacks[i].current = [];
      }
      for (let i = 0; i < N; i++) {
        if (newIncoming[i] !== null) {
          if (allPacks[i].current.length === 0) {
            allPacks[i].current = newIncoming[i];
          } else if (!Array.isArray(allPacks[i].pending) || allPacks[i].pending.length === 0) {
            allPacks[i].pending = newIncoming[i];
          }
          // else: drop incoming
        }
      }

      // Phase 4: Promote pending first; only open queue (player's own next pack)
      // when the WHOLE cycle is done (no current or pending cards anywhere).
      const cycleDone = allPacks.every(p => p.current.length === 0 && (!Array.isArray(p.pending) || p.pending.length === 0));
      if (cycleDone) {
        for (let i = 0; i < N; i++) {
          if (allPacks[i].current.length === 0 && allPacks[i].queue.length > 0) {
            allPacks[i].current = allPacks[i].queue.shift();
          }
        }
      } else {
        for (let i = 0; i < N; i++) {
          if (allPacks[i].current.length === 0 &&
              Array.isArray(allPacks[i].pending) && allPacks[i].pending.length > 0) {
            allPacks[i].current = allPacks[i].pending;
            allPacks[i].pending = [];
          }
        }
      }
    }

    // Phase 5: Save all participants
    const updateStmt = db.prepare('UPDATE participants SET current_packs = ?, pool = ?, picks = ?, bot_state = ? WHERE id = ?');
    for (let i = 0; i < N; i++) {
      updateStmt.run(
        JSON.stringify(allPacks[i]),
        JSON.stringify(allPools[i]),
        JSON.stringify(allPicks[i]),
        JSON.stringify(allBotStates[i]),
        participants[i].id
      );
    }

    // Reset picks_this_round only if the round completed and packs passed
    if (roundComplete) {
      db.prepare('UPDATE events SET picks_this_round = ? WHERE id = ?').run('[]', req.params.id);
    } else {
      db.prepare('UPDATE events SET picks_this_round = ? WHERE id = ?').run(JSON.stringify(picksThisRound), req.params.id);
    }

    // Phase 6: Check completion
    const allDone = allPacks.every(p => p.current.length === 0 && p.queue.length === 0);
    if (allDone) {
      db.prepare('UPDATE events SET status = ? WHERE id = ?').run('completed', req.params.id);
    }

    // Compute who still needs to pick before packs pass (informational for UI)
    const waitingFor = participants
      .filter(p => !picksThisRound.includes(p.id))
      .filter(p => allPacks[participants.findIndex(x => x.id === p.id)].current.length > 0)
      .map(p => p.id);

    res.json({
      picked_cards: pickedCards,
      current_pack: allPacks[myIndex].current,
      remaining_packs: allPacks[myIndex].queue.length,
      pool_size: allPools[myIndex].length,
      draft_complete: allDone,
      round_complete: roundComplete,
      waiting_for: waitingFor,
      pending: allPacks[myIndex].pending || [],
      max_pickable: maxPickable,
      cards_per_pick: cardsPerPick
    });
    wsBroadcast(`event:${req.params.id}`, 'draft_updated', { eventId: parseInt(req.params.id) });
  } catch (err) {
    console.error('Pick error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/events/:id/pool', authMiddleware, (req, res) => {
  const participant = db.prepare('SELECT * FROM participants WHERE event_id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!participant) return res.status(404).json({ error: '你不是参与者' });
  res.json({ pool: JSON.parse(participant.pool || '[]'), picks: JSON.parse(participant.picks || '[]') });
});

// ============================================================
// Deck Routes
// ============================================================
app.get('/api/decks', authMiddleware, (req, res) => {
  const decks = db.prepare(`
    SELECT d.*, e.name as event_name
    FROM decks d LEFT JOIN events e ON d.event_id = e.id
    WHERE d.user_id = ? ORDER BY d.created_at DESC
  `).all(req.user.id);
  const result = decks.map(d => ({
    ...d, main_deck: JSON.parse(d.main_deck || '[]'), sideboard: JSON.parse(d.sideboard || '[]'),
    outside_game: JSON.parse(d.outside_game || '[]')
  }));
  res.json(result);
});

// Get current user's deck for a specific event
app.get('/api/events/:id/my-deck', authMiddleware, (req, res) => {
  const deck = db.prepare('SELECT * FROM decks WHERE event_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1').get(
    req.params.id, req.user.id
  );
  if (!deck) return res.json(null);
  deck.main_deck = JSON.parse(deck.main_deck || '[]');
  deck.sideboard = JSON.parse(deck.sideboard || '[]');
  deck.outside_game = JSON.parse(deck.outside_game || '[]');
  res.json(deck);
});

app.post('/api/decks', authMiddleware, (req, res) => {
  try {
    const { name, main_deck, sideboard, outside_game, event_id } = req.body;
    if (!name) return res.status(400).json({ error: '牌组名称不能为空' });
    const result = db.prepare('INSERT INTO decks (user_id, name, main_deck, sideboard, outside_game, event_id) VALUES (?, ?, ?, ?, ?, ?)').run(
      req.user.id, name, JSON.stringify(main_deck || []), JSON.stringify(sideboard || []), JSON.stringify(outside_game || []), event_id || null
    );
    const deck = db.prepare('SELECT * FROM decks WHERE id = ?').get(result.lastInsertRowid);
    deck.main_deck = JSON.parse(deck.main_deck);
    deck.sideboard = JSON.parse(deck.sideboard);
    deck.outside_game = JSON.parse(deck.outside_game || '[]');
    res.json(deck);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/decks/:id', authMiddleware, (req, res) => {
  const deck = db.prepare('SELECT * FROM decks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!deck) return res.status(404).json({ error: '牌组不存在' });
  deck.main_deck = JSON.parse(deck.main_deck);
  deck.sideboard = JSON.parse(deck.sideboard);
  deck.outside_game = JSON.parse(deck.outside_game || '[]');
  res.json(deck);
});

app.put('/api/decks/:id', authMiddleware, (req, res) => {
  try {
    const deck = db.prepare('SELECT * FROM decks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!deck) return res.status(404).json({ error: '牌组不存在' });
    const { name, main_deck, sideboard, outside_game } = req.body;
    db.prepare('UPDATE decks SET name = ?, main_deck = ?, sideboard = ?, outside_game = ? WHERE id = ?').run(
      name || deck.name,
      main_deck ? JSON.stringify(main_deck) : deck.main_deck,
      sideboard ? JSON.stringify(sideboard) : deck.sideboard,
      outside_game ? JSON.stringify(outside_game) : (deck.outside_game || '[]'),
      deck.id
    );
    const updated = db.prepare('SELECT * FROM decks WHERE id = ?').get(deck.id);
    updated.main_deck = JSON.parse(updated.main_deck);
    updated.sideboard = JSON.parse(updated.sideboard);
    updated.outside_game = JSON.parse(updated.outside_game || '[]');
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/decks/:id', authMiddleware, (req, res) => {
  const result = db.prepare('DELETE FROM decks WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: '牌组不存在' });
  res.json({ success: true });
});// ============================================================
// Battle Routes + MTG Game Engine
// ============================================================
app.get('/api/battles', authMiddleware, (req, res) => {
  const battles = db.prepare(`
    SELECT b.*, u1.username as player1_name, u2.username as player2_name
    FROM battles b
    LEFT JOIN users u1 ON b.player1_id = u1.id
    LEFT JOIN users u2 ON b.player2_id = u2.id
    ORDER BY b.created_at DESC
  `).all();
  res.json(battles);
});

// Get battles for a specific event
app.get('/api/events/:id/battles', authMiddleware, (req, res) => {
  const battles = db.prepare(`
    SELECT b.*, u1.username as player1_name, u2.username as player2_name
    FROM battles b
    LEFT JOIN users u1 ON b.player1_id = u1.id
    LEFT JOIN users u2 ON b.player2_id = u2.id
    WHERE b.event_id = ?
    ORDER BY b.created_at DESC
  `).all(req.params.id);
  battles.forEach(b => {
    b.player1_deck = JSON.parse(b.player1_deck || '{}');
    b.player2_deck = JSON.parse(b.player2_deck || '{}');
    b.game_state = JSON.parse(b.game_state || '{}');
  });
  res.json(battles);
});

// Auto-pair: shuffle players with decks, create round 1 battles (single elimination)
app.post('/api/events/:id/auto-pair', authMiddleware, (req, res) => {
  try {
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
    if (!event) return res.status(404).json({ error: '活动不存在' });
    if (event.user_id !== req.user.id) return res.status(403).json({ error: '只有创建者可以配对' });

    // Check no battles exist yet
    const existingBattles = db.prepare('SELECT COUNT(*) as cnt FROM battles WHERE event_id = ?').get(req.params.id);
    if (existingBattles.cnt > 0) return res.status(400).json({ error: '已有对战存在，请使用下一轮配对' });

    // Get all participants who have saved a deck
    const players = db.prepare(`
      SELECT DISTINCT d.user_id, d.id as deck_id, d.name as deck_name,
             d.main_deck, d.sideboard, d.outside_game, u.username
      FROM decks d
      JOIN users u ON d.user_id = u.id
      WHERE d.event_id = ?
      ORDER BY d.created_at DESC
    `).all(req.params.id);

    // Deduplicate: keep only the latest deck per user (already sorted DESC)
    const seen = new Set();
    const unique = [];
    for (const p of players) {
      if (!seen.has(p.user_id)) {
        seen.add(p.user_id);
        unique.push(p);
      }
    }

    if (unique.length < 2) return res.status(400).json({ error: '至少需要2个玩家有牌组才能配对' });

    // Shuffle
    const shuffled = shuffle([...unique]);
    const pairCount = Math.floor(shuffled.length / 2);
    const hasBye = shuffled.length % 2 === 1;
    const byePlayer = hasBye ? shuffled[shuffled.length - 1] : null;

    const createdBattles = [];
    for (let i = 0; i < pairCount; i++) {
      const p1 = shuffled[i * 2];
      const p2 = shuffled[i * 2 + 1];
      const d1 = { name: p1.deck_name, main_deck: JSON.parse(p1.main_deck), sideboard: JSON.parse(p1.sideboard), outside_game: JSON.parse(p1.outside_game || '[]') };
      const d2 = { name: p2.deck_name, main_deck: JSON.parse(p2.main_deck), sideboard: JSON.parse(p2.sideboard), outside_game: JSON.parse(p2.outside_game || '[]') };
      const name = `R1: ${p1.username} vs ${p2.username}`;
      const result = db.prepare(
        'INSERT INTO battles (name, player1_id, player1_deck, player2_id, player2_deck, event_id, status, round) VALUES (?,?,?,?,?,?,?,?)'
      ).run(name, p1.user_id, JSON.stringify(d1), p2.user_id, JSON.stringify(d2), req.params.id, 'waiting', 1);
      createdBattles.push({ id: result.lastInsertRowid, p1: p1.username, p2: p2.username });
    }

    const result = {
      battles: createdBattles,
      total_players: shuffled.length,
      paired: pairCount * 2,
      bye_player: byePlayer ? { id: byePlayer.user_id, name: byePlayer.username } : null
    };
    console.log(`[auto-pair] Event ${req.params.id}: ${shuffled.length} players, ${pairCount} battles, bye=${byePlayer?.username || 'none'}`);
    wsBroadcast(`event:${req.params.id}`, 'pairing_created', result);
    res.json(result);
  } catch (err) {
    console.error('[auto-pair] error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Next round pairing: pair winners from completed battles (single elimination)
app.post('/api/events/:id/next-round', authMiddleware, (req, res) => {
  try {
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
    if (!event) return res.status(404).json({ error: '活动不存在' });
    if (event.user_id !== req.user.id) return res.status(403).json({ error: '只有创建者可以配对' });

    // Find the current max round
    const maxRound = db.prepare('SELECT MAX(round) as maxRound FROM battles WHERE event_id = ?').get(req.params.id);
    const currentRound = maxRound.maxRound || 1;

    // Check all battles in current round are completed
    const pendingBattles = db.prepare(
      'SELECT COUNT(*) as cnt FROM battles WHERE event_id = ? AND round = ? AND status != ?'
    ).get(req.params.id, currentRound, 'completed');
    if (pendingBattles.cnt > 0) {
      return res.status(400).json({ error: `第${currentRound}轮还有${pendingBattles.cnt}场对战未完成` });
    }

    // Get winners from current round
    const winners = db.prepare(`
      SELECT b.winner_id, b.round,
             u.username,
             d.id as deck_id, d.name as deck_name, d.main_deck, d.sideboard, d.outside_game
      FROM battles b
      JOIN users u ON b.winner_id = u.id
      JOIN decks d ON d.user_id = b.winner_id AND d.event_id = ?
      WHERE b.event_id = ? AND b.round = ? AND b.winner_id IS NOT NULL
      ORDER BY b.id
    `).all(req.params.id, req.params.id, currentRound);

    // Deduplicate winners (keep latest deck)
    const winSeen = new Set();
    const uniqueWinners = [];
    for (const w of winners) {
      if (!winSeen.has(w.winner_id)) {
        winSeen.add(w.winner_id);
        uniqueWinners.push(w);
      }
    }

    // Check for bye player who hasn't fought yet (round > 1, they got a bye in round 1)
    const byePlayer = db.prepare(`
      SELECT p.user_id, u.username, d.id as deck_id, d.name as deck_name, d.main_deck, d.sideboard, d.outside_game
      FROM participants p
      JOIN users u ON p.user_id = u.id
      JOIN decks d ON d.user_id = p.user_id AND d.event_id = ?
      WHERE p.event_id = ?
        AND p.user_id NOT IN (SELECT player1_id FROM battles WHERE event_id = ? AND round = 1)
        AND p.user_id NOT IN (SELECT player2_id FROM battles WHERE event_id = ? AND round = 1)
    `).get(req.params.id, req.params.id, req.params.id, req.params.id);

    const nextRound = currentRound + 1;
    const allAdvancers = [...uniqueWinners];
    if (byePlayer && !winSeen.has(byePlayer.user_id)) {
      allAdvancers.push({
        winner_id: byePlayer.user_id,
        username: byePlayer.username,
        deck_id: byePlayer.deck_id,
        deck_name: byePlayer.deck_name,
        main_deck: byePlayer.main_deck,
        sideboard: byePlayer.sideboard,
        outside_game: byePlayer.outside_game || '[]'
      });
    }

    if (allAdvancers.length < 2) {
      // Only 1 or 0 advancers — tournament is over
      const champion = allAdvancers.length === 1 ? allAdvancers[0] : null;
      return res.json({
        round: nextRound,
        battles: [],
        champion: champion ? { id: champion.winner_id, name: champion.username } : null,
        message: champion ? `${champion.username} 是冠军！` : '没有足够的晋级玩家'
      });
    }

    // Shuffle advancers and pair
    const shuffled = shuffle([...allAdvancers]);
    const pairCount = Math.floor(shuffled.length / 2);
    const hasBye = shuffled.length % 2 === 1;
    const newByePlayer = hasBye ? shuffled[shuffled.length - 1] : null;

    const createdBattles = [];
    for (let i = 0; i < pairCount; i++) {
      const p1 = shuffled[i * 2];
      const p2 = shuffled[i * 2 + 1];
      const d1 = { name: p1.deck_name, main_deck: JSON.parse(p1.main_deck), sideboard: JSON.parse(p1.sideboard), outside_game: JSON.parse(p1.outside_game || '[]') };
      const d2 = { name: p2.deck_name, main_deck: JSON.parse(p2.main_deck), sideboard: JSON.parse(p2.sideboard), outside_game: JSON.parse(p2.outside_game || '[]') };
      const name = `R${nextRound}: ${p1.username} vs ${p2.username}`;
      const result = db.prepare(
        'INSERT INTO battles (name, player1_id, player1_deck, player2_id, player2_deck, event_id, status, round) VALUES (?,?,?,?,?,?,?,?)'
      ).run(name, p1.winner_id, JSON.stringify(d1), p2.winner_id, JSON.stringify(d2), req.params.id, 'waiting', nextRound);
      createdBattles.push({ id: result.lastInsertRowid, p1: p1.username, p2: p2.username });
    }

    const result = {
      round: nextRound,
      battles: createdBattles,
      total_advancers: allAdvancers.length,
      paired: pairCount * 2,
      bye_player: newByePlayer ? { id: newByePlayer.winner_id, name: newByePlayer.username } : null,
      champion: null
    };
    console.log(`[next-round] Event ${req.params.id}: Round ${nextRound}, ${allAdvancers.length} advancers, ${pairCount} battles`);
    wsBroadcast(`event:${req.params.id}`, 'pairing_created', result);
    res.json(result);
  } catch (err) {
    console.error('[next-round] error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/battles', authMiddleware, (req, res) => {
  try {
    const { deck_id, name, event_id } = req.body;
    if (!deck_id) return res.status(400).json({ error: '请选择一个牌组' });
    const deck = db.prepare('SELECT * FROM decks WHERE id = ? AND user_id = ?').get(deck_id, req.user.id);
    if (!deck) return res.status(404).json({ error: '牌组不存在' });
    const deckData = {
      name: deck.name, main_deck: JSON.parse(deck.main_deck), sideboard: JSON.parse(deck.sideboard),
      outside_game: JSON.parse(deck.outside_game || '[]')
    };
    const result = db.prepare('INSERT INTO battles (name, player1_id, player1_deck, event_id) VALUES (?, ?, ?, ?)').run(
      name || `${req.user.username}的对战`, req.user.id, JSON.stringify(deckData), event_id || null
    );
    const battle = db.prepare(`
      SELECT b.*, u1.username as player1_name FROM battles b
      LEFT JOIN users u1 ON b.player1_id = u1.id WHERE b.id = ?
    `).get(result.lastInsertRowid);
    battle.player1_deck = JSON.parse(battle.player1_deck);
    res.json(battle);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/battles/:id', authMiddleware, (req, res) => {
  const battle = db.prepare(`
    SELECT b.*, u1.username as player1_name, u2.username as player2_name
    FROM battles b
    LEFT JOIN users u1 ON b.player1_id = u1.id
    LEFT JOIN users u2 ON b.player2_id = u2.id
    WHERE b.id = ?
  `).get(req.params.id);
  if (!battle) return res.status(404).json({ error: '对战不存在' });
  battle.player1_deck = JSON.parse(battle.player1_deck || '{}');
  battle.player2_deck = JSON.parse(battle.player2_deck || '{}');
  battle.game_state = JSON.parse(battle.game_state || '{}');
  res.json(battle);
});

app.post('/api/battles/:id/join', authMiddleware, (req, res) => {
  try {
    const { deck_id } = req.body;
    const battle = db.prepare('SELECT * FROM battles WHERE id = ?').get(req.params.id);
    if (!battle) return res.status(404).json({ error: '对战不存在' });
    if (battle.status !== 'waiting') return res.status(400).json({ error: '对战已开始' });
    if (battle.player1_id === req.user.id) return res.status(400).json({ error: '不能加入自己的对战' });
    if (battle.player2_id) return res.status(400).json({ error: '对战已满' });
    const deck = db.prepare('SELECT * FROM decks WHERE id = ? AND user_id = ?').get(deck_id, req.user.id);
    if (!deck) return res.status(404).json({ error: '牌组不存在' });
    const deckData = {
      name: deck.name, main_deck: JSON.parse(deck.main_deck), sideboard: JSON.parse(deck.sideboard),
      outside_game: JSON.parse(deck.outside_game || '[]')
    };
    db.prepare('UPDATE battles SET player2_id = ?, player2_deck = ? WHERE id = ?').run(
      req.user.id, JSON.stringify(deckData), battle.id
    );
    const updated = db.prepare(`
      SELECT b.*, u1.username as player1_name, u2.username as player2_name
      FROM battles b LEFT JOIN users u1 ON b.player1_id = u1.id LEFT JOIN users u2 ON b.player2_id = u2.id
      WHERE b.id = ?
    `).get(battle.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start battle (initialize first game)
app.post('/api/battles/:id/start', authMiddleware, (req, res) => {
  try {
    const battle = db.prepare(`
      SELECT b.*, u1.username as player1_name, u2.username as player2_name
      FROM battles b LEFT JOIN users u1 ON b.player1_id = u1.id LEFT JOIN users u2 ON b.player2_id = u2.id
      WHERE b.id = ?
    `).get(req.params.id);
    if (!battle) return res.status(404).json({ error: '对战不存在' });
    if (battle.status !== 'waiting') return res.status(400).json({ error: '对战已开始' });
    if (!battle.player2_id) return res.status(400).json({ error: '等待对手加入' });
    battle.player1_deck = JSON.parse(battle.player1_deck || '{}');
    battle.player2_deck = JSON.parse(battle.player2_deck || '{}');
    const gs = initializeGameState(battle);
    db.prepare('UPDATE battles SET status = ?, game_state = ?, current_turn = 1, current_game = 1 WHERE id = ?').run(
      'in_progress', JSON.stringify(gs), battle.id
    );
    res.json({ success: true, game_state: gs });
    wsBroadcast(`battle:${battle.id}`, 'battle_updated', { battleId: battle.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get current player's deck from a battle (for between-games deck editing)
app.get('/api/battles/:id/my-deck', authMiddleware, (req, res) => {
  try {
    const battle = db.prepare('SELECT * FROM battles WHERE id = ?').get(req.params.id);
    if (!battle) return res.status(404).json({ error: '对战不存在' });
    const isP1 = String(battle.player1_id) === String(req.user.id);
    const isP2 = String(battle.player2_id) === String(req.user.id);
    if (!isP1 && !isP2) return res.status(403).json({ error: '你不是这个对战的玩家' });
    const deckData = JSON.parse(isP1 ? (battle.player1_deck || '{}') : (battle.player2_deck || '{}'));
    res.json({
      main_deck: deckData.main_deck || [],
      sideboard: deckData.sideboard || [],
      name: deckData.name || ''
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start next game in a BO3 match (optionally with updated deck)
app.post('/api/battles/:id/next-game', authMiddleware, (req, res) => {
  try {
    const battle = db.prepare(`
      SELECT b.*, u1.username as player1_name, u2.username as player2_name
      FROM battles b LEFT JOIN users u1 ON b.player1_id = u1.id LEFT JOIN users u2 ON b.player2_id = u2.id
      WHERE b.id = ?
    `).get(req.params.id);
    if (!battle) return res.status(404).json({ error: '对战不存在' });
    if (battle.status !== 'in_progress') return res.status(400).json({ error: '对战未在进行中' });
    const p1w = battle.player1_wins || 0;
    const p2w = battle.player2_wins || 0;
    if (p1w >= 2 || p2w >= 2) return res.status(400).json({ error: '比赛已结束' });

    // Update player's deck if provided (between-games deck modification)
    const { updated_deck } = req.body;
    if (updated_deck) {
      const isP1 = String(battle.player1_id) === String(req.user.id);
      const isP2 = String(battle.player2_id) === String(req.user.id);
      if (isP1 || isP2) {
        const deckObj = {
          name: updated_deck.name || '',
          main_deck: updated_deck.main_deck || [],
          sideboard: updated_deck.sideboard || [],
          outside_game: updated_deck.outside_game || []
        };
        const col = isP1 ? 'player1_deck' : 'player2_deck';
        db.prepare(`UPDATE battles SET ${col} = ? WHERE id = ?`).run(JSON.stringify(deckObj), battle.id);
        if (isP1) battle.player1_deck = JSON.stringify(deckObj);
        else battle.player2_deck = JSON.stringify(deckObj);
      }
    }

    battle.player1_deck = JSON.parse(typeof battle.player1_deck === 'string' ? battle.player1_deck : '{}');
    battle.player2_deck = JSON.parse(typeof battle.player2_deck === 'string' ? battle.player2_deck : '{}');
    const gs = initializeGameState(battle);
    const nextGame = (battle.current_game || 1) + 1;
    db.prepare('UPDATE battles SET game_state = ?, current_turn = 1, current_game = ? WHERE id = ?').run(
      JSON.stringify(gs), nextGame, battle.id
    );
    res.json({ success: true, game_state: gs, current_game: nextGame });
    wsBroadcast(`battle:${battle.id}`, 'battle_updated', { battleId: battle.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// MTG Game Engine (MTGA-style) - Helpers
// ============================================================
function cardHasKeyword(card, kw) {
  if (!card) return false;
  if (!card.keywords) return false;
  return card.keywords.includes(kw);
}

function isLand(card) {
  return card && card.type && card.type.includes('Land');
}

function isCreature(card) {
  return card && card.type && card.type.includes('Creature');
}

function isPlaneswalker(card) {
  return card && card.type && card.type.includes('Planeswalker');
}

function isPermanent(card) {
  return card && (isCreature(card) || isPlaneswalker(card) ||
    (card.type && (card.type.includes('Artifact') || card.type.includes('Enchantment'))));
}

function isInstant(card) {
  return card && card.type && card.type.includes('Instant');
}

function isSorcery(card) {
  return card && card.type && card.type.includes('Sorcery');
}

function canBlock(attacker, blocker) {
  if (!attacker || !blocker) return false;
  if (!isCreature(blocker)) return false;
  if (blocker.tapped) return false;
  if (cardHasKeyword(attacker, 'flying') && !cardHasKeyword(blocker, 'flying') && !cardHasKeyword(blocker, 'reach')) {
    return false;
  }
  return true;
}

function canAttack(creature) {
  if (!isCreature(creature)) return false;
  if (creature.tapped) return false;
  if (creature.summoning_sick && !cardHasKeyword(creature, 'haste')) return false;
  return true;
}

function parseManaCost(costStr) {
  const cost = { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  if (!costStr) return cost;
  const matches = costStr.match(/\{([^}]+)\}/g) || [];
  for (const m of matches) {
    const sym = m.slice(1, -1);
    if (/^\d+$/.test(sym)) {
      cost.generic += parseInt(sym);
    } else if (['W', 'U', 'B', 'R', 'G', 'C'].includes(sym)) {
      cost[sym] = (cost[sym] || 0) + 1;
    }
  }
  return cost;
}

function payManaCost(pool, cost) {
  const colors = ['W', 'U', 'B', 'R', 'G'];
  for (const c of colors) {
    if (cost[c] > pool[c]) return false;
  }
  let genericNeeded = cost.generic;
  for (const c of colors) {
    const used = Math.min(pool[c] - cost[c], genericNeeded);
    pool[c] -= used + cost[c];
    genericNeeded -= used;
  }
  if (genericNeeded > 0) {
    const used = Math.min(pool.C, genericNeeded);
    pool.C -= used;
    genericNeeded -= used;
  }
  if (genericNeeded > 0) {
    const total = pool.W + pool.U + pool.B + pool.R + pool.G + pool.C;
    if (total < genericNeeded) return false;
    while (genericNeeded > 0) {
      let maxColor = null, maxVal = 0;
      for (const c of [...colors, 'C']) {
        if (pool[c] > maxVal) { maxVal = pool[c]; maxColor = c; }
      }
      if (!maxColor) break;
      pool[maxColor]--;
      genericNeeded--;
    }
  }
  return genericNeeded <= 0;
}

function emptyManaPool(player) {
  player.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
}

function getManaProduced(land) {
  const name = land.name;
  if (name === 'Plains') return ['W'];
  if (name === 'Island') return ['U'];
  if (name === 'Swamp') return ['B'];
  if (name === 'Mountain') return ['R'];
  if (name === 'Forest') return ['G'];
  if (name === 'Wastes') return ['C'];
  if (/shock land|dual/i.test(land.text || '')) {
    return (land.colors || []).map(c => c);
  }
  if (land.colors && land.colors.length > 0) return land.colors.map(c => c);
  return ['C'];
}

// ============================================================
// Game Engine - Tabletop Simulator Style (no auto-resolution)
// ============================================================

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Resolve card name strings into card objects with unique instance IDs
let cardInstanceCounter = 0;
function resolveDeck(deckList) {
  return deckList.map(nameOrObj => {
    if (typeof nameOrObj === 'object' && nameOrObj.id) return nameOrObj; // already resolved
    const name = typeof nameOrObj === 'string' ? nameOrObj : (nameOrObj.name || String(nameOrObj));
    const base = lookupLocalCard(name);
    const instanceId = 'card_' + (++cardInstanceCounter) + '_' + Date.now().toString(36);
    // Merge original deck card data (may include image_back for DFC) with lookup result
    const originalData = (typeof nameOrObj === 'object' && nameOrObj.image_back) ? nameOrObj : {};
    if (base) {
      return { ...base, ...originalData, id: instanceId, instanceId, cardName: base.name };
    }
    // Fallback for cards not in cache (basic lands, etc.)
    const isBasicLand = ['Forest', 'Plains', 'Mountain', 'Swamp', 'Island',
      'Snow-Covered Forest', 'Snow-Covered Plains', 'Snow-Covered Mountain',
      'Snow-Covered Swamp', 'Snow-Covered Island'].includes(name);
    return {
      id: instanceId, instanceId,
      name, cardName: name,
      manaCost: '', cmc: 0,
      type: isBasicLand ? 'Basic Land — ' + name : 'Creature',
      colors: [], color_identity: [], rarity: 'common',
      text: '', power: null, toughness: null, loyalty: null,
      keywords: [], image: null, image_small: null, image_large: null,
      set: '', set_name: '', scryfall_id: null,
      ...originalData
    };
  });
}

function initializeGameState(battle) {
  const p1DeckList = Array.isArray(battle.player1_deck.main_deck) ? battle.player1_deck.main_deck : [];
  const p2DeckList = Array.isArray(battle.player2_deck.main_deck) ? battle.player2_deck.main_deck : [];
  const p1OutsideList = Array.isArray(battle.player1_deck.outside_game) ? battle.player1_deck.outside_game : [];
  const p2OutsideList = Array.isArray(battle.player2_deck.outside_game) ? battle.player2_deck.outside_game : [];
  const p1Deck = shuffleArray(resolveDeck(p1DeckList));
  const p2Deck = shuffleArray(resolveDeck(p2DeckList));
  const p1Outside = resolveDeck(p1OutsideList); // outside game cards are NOT shuffled, face-up
  const p2Outside = resolveDeck(p2OutsideList);
  const p1Hand = p1Deck.splice(0, 7);
  const p2Hand = p2Deck.splice(0, 7);
  const firstPlayer = Math.random() < 0.5 ? 'p1' : 'p2';
  const gs = {
    turn: 1,
    activePlayer: firstPlayer,
    players: {
      p1: {
        userId: battle.player1_id, name: battle.player1_name,
        life: 20, library: p1Deck, hand: p1Hand,
        battlefield: [], graveyard: [], exile: [], outside_game: p1Outside
      },
      p2: {
        userId: battle.player2_id, name: battle.player2_name,
        life: 20, library: p2Deck, hand: p2Hand,
        battlefield: [], graveyard: [], exile: [], outside_game: p2Outside
      }
    },
    log: [
      '对战开始！',
      (firstPlayer === 'p1' ? battle.player1_name : battle.player2_name) + ' 先手',
      '--- 第1回合: ' + (firstPlayer === 'p1' ? battle.player1_name : battle.player2_name) + ' ---'
    ],
    flipped_cards: { p1: [], p2: [] },
    winner: null,
    startedAt: Date.now()
  };
  return gs;
}

function findCardInZone(player, cardId, zone) {
  return player[zone].findIndex(c => c.id === cardId);
}

function findCardInBattlefield(player, cardId) {
  // First check main battlefield
  const idx = player.battlefield.findIndex(c => c.id === cardId);
  if (idx !== -1) return { card: player.battlefield[idx], isStacked: false };
  // Then check stacked cards
  for (const host of player.battlefield) {
    if (!Array.isArray(host.stacked_cards)) continue;
    const stackedCard = host.stacked_cards.find(c => c.id === cardId);
    if (stackedCard) return { card: stackedCard, isStacked: true };
  }
  return { card: null, isStacked: false };
}

function detachStackedCardsToBattlefield(player, card, gs) {
  if (!Array.isArray(card.stacked_cards) || card.stacked_cards.length === 0) return;
  for (const sc of card.stacked_cards) {
    player.battlefield.push(sc);
    gs.log.push(sc.name + ' 从 ' + card.name + ' 下方返回战场');
  }
  card.stacked_cards = [];
}

function processGameAction(gs, userId, action) {
  let myKey, oppKey;
  if (gs.players.p1.userId === userId) { myKey = 'p1'; oppKey = 'p2'; }
  else if (gs.players.p2.userId === userId) { myKey = 'p2'; oppKey = 'p1'; }
  else throw new Error('你不是此对战的玩家');
  const me = gs.players[myKey];
  const opp = gs.players[oppKey];

  switch (action.type) {
    case 'move_card': {
      const { card_id, from_zone, to_zone } = action;
      if (!card_id || !from_zone || !to_zone) return { error: '缺少移动参数' };
      const validZones = ['hand', 'battlefield', 'graveyard', 'exile', 'library', 'outside_game'];
      if (!validZones.includes(from_zone) || !validZones.includes(to_zone)) return { error: '无效的区域' };
      if (from_zone === to_zone) return { success: true };
      const srcArr = me[from_zone];
      if (!Array.isArray(srcArr)) return { error: '源区域无效' };
      // Search at top level first
      let idx = srcArr.findIndex(c => c.id === card_id);
      let card = null;
      let wasStacked = false;
      if (idx !== -1) {
        card = srcArr.splice(idx, 1)[0];
      } else if (from_zone === 'battlefield') {
        // Also search inside stacked_cards on the battlefield
        for (const host of me.battlefield) {
          if (!Array.isArray(host.stacked_cards)) continue;
          const si = host.stacked_cards.findIndex(c => c.id === card_id);
          if (si !== -1) {
            card = host.stacked_cards.splice(si, 1)[0];
            wasStacked = true;
            break;
          }
        }
      }
      if (!card) return { error: '源区域中没有此牌' };
      // When a card leaves the battlefield, detach any stacked cards back to the battlefield
      if (from_zone === 'battlefield') {
        detachStackedCardsToBattlefield(me, card, gs);
      }
      // Tokens cease to exist when they leave the battlefield (MTG rule)
      if (card.is_token && from_zone === 'battlefield') {
        gs.log.push(me.name + ' 的 ' + card.name + ' 离开战场，消失');
        return { success: true };
      }
      if (to_zone === 'battlefield') { card.tapped = false; card.damage_marked = 0; card.counters = {}; }
      // Library: put on top (unshift = index 0 = drawn first). Other zones: push to end.
      if (to_zone === 'library') {
        me[to_zone].unshift(card);
      } else {
        me[to_zone].push(card);
      }
      gs.log.push(me.name + ' 将 ' + card.name + ' 从' + from_zone + '移至' + to_zone);
      return { success: true };
    }
    case 'tap_card': {
      const idx = findCardInZone(me, action.card_id, 'battlefield');
      if (idx === -1) return { error: '战场上没有此牌' };
      if (me.battlefield[idx].tapped) return { error: '此牌已经横置' };
      me.battlefield[idx].tapped = true;
      gs.log.push(me.name + ' 横置 ' + me.battlefield[idx].name);
      return { success: true };
    }
    case 'untap_card': {
      const idx = findCardInZone(me, action.card_id, 'battlefield');
      if (idx === -1) return { error: '战场上没有此牌' };
      if (!me.battlefield[idx].tapped) return { error: '此牌未横置' };
      me.battlefield[idx].tapped = false;
      gs.log.push(me.name + ' 重置 ' + me.battlefield[idx].name);
      return { success: true };
    }
    case 'flip_card': {
      const idx = findCardInZone(me, action.card_id, 'battlefield');
      if (idx === -1) return { error: '战场上没有此牌' };
      if (!gs.flipped_cards) gs.flipped_cards = { p1: [], p2: [] };
      if (!Array.isArray(gs.flipped_cards[myKey])) gs.flipped_cards[myKey] = [];
      const fcArr = gs.flipped_cards[myKey];
      const fIdx = fcArr.indexOf(action.card_id);
      if (fIdx === -1) {
        fcArr.push(action.card_id);
        gs.log.push(me.name + ' 翻面 ' + me.battlefield[idx].name);
      } else {
        fcArr.splice(fIdx, 1);
        gs.log.push(me.name + ' 翻回正面 ' + me.battlefield[idx].name);
      }
      return { success: true };
    }
    case 'draw_card': {
      if (!me.library || me.library.length === 0) return { error: '牌库为空' };
      const drawn = me.library.shift();
      me.hand.push(drawn);
      gs.log.push(me.name + ' 抽了一张牌');
      return { success: true };
    }
    case 'end_turn': {
      const nextPlayer = gs.activePlayer === 'p1' ? 'p2' : 'p1';
      const next = gs.players[nextPlayer];
      gs.activePlayer = nextPlayer;
      gs.turn++;
      for (const c of next.battlefield) c.tapped = false;
      gs.log.push('--- 第' + gs.turn + '回合: ' + next.name + ' ---');
      return { success: true };
    }
    case 'mulligan': {
      // Allow mulligan at any time (unlimited uses)
      // Track mulligan count
      if (!gs.mulligan_count) gs.mulligan_count = { p1: 0, p2: 0 };
      gs.mulligan_count[myKey] = (gs.mulligan_count[myKey] || 0) + 1;
      // Shuffle hand back into library
      while (me.hand.length > 0) {
        me.library.push(me.hand.shift());
      }
      // Shuffle library
      for (let i = me.library.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [me.library[i], me.library[j]] = [me.library[j], me.library[i]];
      }
      // Draw 7 cards
      const drawCount = Math.min(7, me.library.length);
      for (let i = 0; i < drawCount; i++) {
        me.hand.push(me.library.shift());
      }
      gs.log.push(me.name + ' 进行了第' + gs.mulligan_count[myKey] + '次调度（洗牌并重抽 ' + drawCount + ' 张）');
      return { success: true };
    }
    case 'adjust_life': {
      const { amount } = action;
      if (typeof amount !== 'number') return { error: '无效的数值' };
      const target = action.target === 'opponent' ? opp : me;
      target.life += amount;
      gs.log.push(target.name + ' 生命' + (amount >= 0 ? '+' : '') + amount + ' (' + target.life + ')');
      return { success: true };
    }
    case 'play_from_deck': {
      const { card_name, deck_zone, deck_idx, to_zone } = action;
      if (!card_name || !deck_zone || deck_idx === undefined || !to_zone) return { error: '缺少参数' };
      let resolvedCard;
      if (deck_zone === 'library') {
        // Find card in library by name
        const lib = me.library || [];
        const libIdx = lib.findIndex(c => c.name === card_name);
        if (libIdx === -1) return { error: '牌库中未找到此牌: ' + card_name };
        resolvedCard = lib.splice(libIdx, 1)[0];
      } else {
        const deckData = myKey === 'p1' ? battle.player1_deck : battle.player2_deck;
        if (!deckData) return { error: '无法获取牌组' };
        const deckArr = deck_zone === 'side' ? (deckData.sideboard || []) : (deckData.main_deck || []);
        if (deck_idx < 0 || deck_idx >= deckArr.length) return { error: '无效的牌组索引' };
        const deckCard = deckArr[deck_idx];
        if (!deckCard) return { error: '牌组中无此牌' };
        resolvedCard = resolveDeck([deckCard])[0];
      }
      if (!resolvedCard) return { error: '无法解析卡牌' };
      if (to_zone === 'battlefield') { resolvedCard.tapped = false; resolvedCard.damage_marked = 0; resolvedCard.counters = {}; }
      me[to_zone] = me[to_zone] || [];
      me[to_zone].push(resolvedCard);
      gs.log.push(me.name + ' 从牌库打出 ' + resolvedCard.name + ' 至' + to_zone);
      // Also remove from revealed_cards if this card was being shown
      if (gs.revealed_cards && gs.revealed_cards[myKey]) {
        gs.revealed_cards[myKey] = gs.revealed_cards[myKey].filter(c => c.id !== resolvedCard.id);
      }
      return { success: true };
    }
    case 'stack_card': {
      const { card_id, target_card_id } = action;
      if (!card_id || !target_card_id) return { error: '缺少参数' };
      if (card_id === target_card_id) return { error: '不能堆叠到自己上面' };
      // Find source card in battlefield
      const srcIdx = me.battlefield.findIndex(c => c.id === card_id);
      if (srcIdx === -1) return { error: '战场上没有此牌' };
      // Find target card in battlefield
      const tgtIdx = me.battlefield.findIndex(c => c.id === target_card_id);
      if (tgtIdx === -1) return { error: '战场上没有目标牌' };
      const srcCard = me.battlefield.splice(srcIdx, 1)[0];
      // Adjust target index after splice
      const adjustedTgtIdx = srcIdx < tgtIdx ? tgtIdx - 1 : tgtIdx;
      // Add to target's stack
      if (!me.battlefield[adjustedTgtIdx]) return { error: '目标牌不存在' };
      if (!Array.isArray(me.battlefield[adjustedTgtIdx].stacked_cards)) {
        me.battlefield[adjustedTgtIdx].stacked_cards = [];
      }
      me.battlefield[adjustedTgtIdx].stacked_cards.push(srcCard);
      gs.log.push(me.name + ' 将 ' + srcCard.name + ' 堆叠到 ' + me.battlefield[adjustedTgtIdx].name + ' 下面');
      return { success: true };
    }
    case 'unstack_card': {
      const { card_id, target_zone } = action;
      if (!card_id) return { error: '缺少参数' };
      // Find the card that has this card in its stack
      let found = false;
      for (let i = 0; i < me.battlefield.length; i++) {
        const host = me.battlefield[i];
        if (!Array.isArray(host.stacked_cards)) continue;
        const stackIdx = host.stacked_cards.findIndex(c => c.id === card_id);
        if (stackIdx !== -1) {
          const unstackedCard = host.stacked_cards.splice(stackIdx, 1)[0];
          // If moving to non-battlefield zone, detach any nested stacked cards back to battlefield
          if (target_zone !== 'battlefield') {
            detachStackedCardsToBattlefield(me, unstackedCard, gs);
          }
          // Move to target zone
          if (target_zone === 'battlefield') {
            unstackedCard.tapped = false; unstackedCard.damage_marked = 0; unstackedCard.counters = {};
            me.battlefield.push(unstackedCard);
          } else {
            me[target_zone] = me[target_zone] || [];
            me[target_zone].push(unstackedCard);
          }
          gs.log.push(me.name + ' 将 ' + unstackedCard.name + ' 从 ' + host.name + ' 下移出至' + target_zone);
          found = true;
          break;
        }
      }
      if (!found) return { error: '未在堆叠中找到此牌' };
      return { success: true };
    }
    case 'transfer_control': {
      const { card_id, from_zone, to_zone } = action;
      const srcZone = from_zone || 'battlefield';
      const dstZone = to_zone || 'battlefield';
      if (!card_id) return { error: '缺少卡牌ID' };
      const validZones = ['hand', 'battlefield', 'graveyard', 'exile', 'library', 'outside_game'];
      if (!validZones.includes(srcZone) || !validZones.includes(dstZone)) return { error: '无效的区域' };
      const srcArr = me[srcZone];
      if (!Array.isArray(srcArr)) return { error: '源区域无效' };
      const idx = srcArr.findIndex(c => c.id === card_id);
      if (idx === -1) return { error: '源区域中没有此牌' };
      const card = srcArr.splice(idx, 1)[0];
      // Reset battlefield state when entering opponent's battlefield
      if (dstZone === 'battlefield') {
        card.tapped = false;
        card.damage_marked = 0;
        card.counters = {};
      }
      // Always detach stacked cards - they stay with original controller's battlefield
      detachStackedCardsToBattlefield(me, card, gs);
      if (dstZone === 'library') {
        opp[dstZone].unshift(card);
      } else {
        opp[dstZone].push(card);
      }
      gs.log.push(me.name + ' 将 ' + card.name + ' 的控制权转移给 ' + opp.name);
      return { success: true };
    }
    case 'concede': {
      gs.winner = oppKey;
      gs.log.push(me.name + ' 认输');
      return { success: true };
    }
    case 'return_to_library': {
      const { card_ids, position } = action; // position: 'top' or 'bottom'
      if (!Array.isArray(card_ids) || !position) return { error: '缺少参数' };
      const lib = me.library || [];
      // Collect displayed cards by their IDs
      const displayedCards = [];
      card_ids.forEach(id => {
        const idx = lib.findIndex(c => c.id === id);
        if (idx !== -1) displayedCards.push(lib.splice(idx, 1)[0]);
      });
      // Now lib has only non-displayed cards, displayedCards are in the order from card_ids
      if (position === 'top') {
        me.library = displayedCards.concat(lib);
      } else {
        me.library = lib.concat(displayedCards);
      }
      gs.log.push(me.name + ' 将 ' + displayedCards.length + ' 张牌放回牌库' + (position === 'top' ? '顶' : '底'));
      // Clear revealed_cards since the preview is closed
      if (gs.revealed_cards && gs.revealed_cards[myKey]) {
        delete gs.revealed_cards[myKey];
      }
      return { success: true };
    }
    case 'shuffle_library': {
      if (!me.library || me.library.length < 2) return { success: true };
      for (let i = me.library.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [me.library[i], me.library[j]] = [me.library[j], me.library[i]];
      }
      gs.log.push(me.name + ' 洗牌 (' + me.library.length + ' 张)');
      return { success: true };
    }
    case 'show_library_cards': {
      const { count } = action;
      if (!me.library || me.library.length === 0) return { error: '牌库为空' };
      const n = Math.min(parseInt(count) || 0, me.library.length);
      if (n < 1) return { error: '无效数量' };
      // Store revealed cards in game state using player key (p1/p2) so opponent can see them
      if (!gs.revealed_cards) gs.revealed_cards = {};
      gs.revealed_cards[myKey] = me.library.slice(0, n);
      gs.log.push(me.name + ' 展示了牌库顶 ' + n + ' 张牌');
      return { success: true, revealed: gs.revealed_cards[myKey] };
    }
    case 'hide_library_cards': {
      if (!gs.revealed_cards) gs.revealed_cards = {};
      delete gs.revealed_cards[myKey];
      gs.log.push(me.name + ' 结束了卡牌展示');
      return { success: true };
    }
    case 'add_counter': {
      const { card_id, counter_type } = action;
      if (!card_id || !counter_type) return { error: '缺少指示物参数' };
      const found = findCardInBattlefield(me, card_id);
      if (!found.card) return { error: '战场上没有此牌' };
      const card = found.card;
      if (!card.counters) card.counters = {};

      // +1/+1 and -1/-1 cancel each other
      if (counter_type === '+1/+1') {
        if ((card.counters['-1/-1'] || 0) > 0) {
          card.counters['-1/-1']--;
          if (card.counters['-1/-1'] <= 0) delete card.counters['-1/-1'];
          gs.log.push(me.name + ' 移除了 ' + card.name + ' 上的一个 -1/-1 指示物（抵消）');
        } else {
          card.counters['+1/+1'] = (card.counters['+1/+1'] || 0) + 1;
          gs.log.push(me.name + ' 在 ' + card.name + ' 上放置了一个 +1/+1 指示物');
        }
      } else if (counter_type === '-1/-1') {
        if ((card.counters['+1/+1'] || 0) > 0) {
          card.counters['+1/+1']--;
          if (card.counters['+1/+1'] <= 0) delete card.counters['+1/+1'];
          gs.log.push(me.name + ' 移除了 ' + card.name + ' 上的一个 +1/+1 指示物（抵消）');
        } else {
          card.counters['-1/-1'] = (card.counters['-1/-1'] || 0) + 1;
          gs.log.push(me.name + ' 在 ' + card.name + ' 上放置了一个 -1/-1 指示物');
        }
      } else {
        // Color counters
        card.counters[counter_type] = (card.counters[counter_type] || 0) + 1;
        gs.log.push(me.name + ' 在 ' + card.name + ' 上放置了一个 ' + counter_type + ' 指示物');
      }
      return { success: true };
    }
    case 'remove_counter': {
      const { card_id, counter_type } = action;
      if (!card_id || !counter_type) return { error: '缺少指示物参数' };
      const found = findCardInBattlefield(me, card_id);
      if (!found.card) return { error: '战场上没有此牌' };
      const card = found.card;
      if (!card.counters || !card.counters[counter_type] || card.counters[counter_type] <= 0) {
        return { error: '此牌上没有该指示物' };
      }
      card.counters[counter_type]--;
      if (card.counters[counter_type] <= 0) delete card.counters[counter_type];
      gs.log.push(me.name + ' 移除了 ' + card.name + ' 上的一个 ' + counter_type + ' 指示物');
      return { success: true };
    }
    case 'adjust_loyalty': {
      const { card_id, amount } = action;
      if (!card_id || typeof amount !== 'number') return { error: '缺少忠诚参数' };
      const found = findCardInBattlefield(me, card_id);
      if (!found.card) return { error: '战场上没有此牌' };
      const card = found.card;
      const typeFront = (card.type || '').toLowerCase();
      const typeBack = (card.type_back || '').toLowerCase();
      const isPlaneswalker = typeFront.includes('planeswalker') || typeBack.includes('planeswalker');
      if (!isPlaneswalker) return { error: '此牌不是鹏洛客' };
      // For DFCs with planeswalker on back face, use loyalty_back; otherwise use loyalty
      const useLoyaltyBack = typeBack.includes('planeswalker') && card.loyalty_back != null;
      const loyaltyField = useLoyaltyBack ? 'loyalty_back' : 'loyalty';
      if (card[loyaltyField] == null) card[loyaltyField] = 0;
      card[loyaltyField] = parseInt(card[loyaltyField]) || 0;
      card[loyaltyField] += amount;
      gs.log.push(me.name + ' ' + card.name + ' 忠诚' + (amount >= 0 ? '+' : '') + amount + ' (' + card[loyaltyField] + ')');
      if (card[loyaltyField] <= 0) {
        // Planeswalker dies - first detach any stacked cards back to the battlefield
        detachStackedCardsToBattlefield(me, card, gs);
        if (found.isStacked) {
          // Remove from host's stacked_cards
          for (const host of me.battlefield) {
            if (!Array.isArray(host.stacked_cards)) continue;
            const si = host.stacked_cards.findIndex(c => c.id === card_id);
            if (si !== -1) { host.stacked_cards.splice(si, 1); break; }
          }
        } else {
          const idx = me.battlefield.findIndex(c => c.id === card_id);
          if (idx !== -1) me.battlefield.splice(idx, 1);
        }
        card.tapped = false;
        card.damage_marked = 0;
        card.counters = {};
        if (card.is_token) {
          gs.log.push(card.name + ' 忠诚度降至0，消失');
        } else {
          me.graveyard.push(card);
          gs.log.push(card.name + ' 忠诚度降至0，进入坟场');
        }
      }
      return { success: true };
    }
    case 'create_token': {
      const { name, power, toughness, colors, is_creature, is_custom } = action;
      const tokenName = name || '衍生物';
      const isCreature = is_creature !== false; // default true

      var tokenImage = null;
      // Only assign images for preset tokens, not custom ones
      if (!is_custom) {
        const TOKEN_IMAGES = {
          '1/1': '/images/tokens/soldier-1-1.jpg',
          '2/2': '/images/tokens/zombie-2-2.jpg',
          '3/3': '/images/tokens/beast-3-3.jpg',
          '4/4': '/images/tokens/angel-4-4.jpg',
          '5/5': '/images/tokens/dragon-5-5.jpg',
          '1/1g': '/images/tokens/goblin-1-1.jpg'
        };
        const NON_CREATURE_IMAGES = {
          'treasure': '/images/tokens/treasure.jpg',
          '宝物': '/images/tokens/treasure.jpg',
          'clue': '/images/tokens/clue.jpg',
          '线索': '/images/tokens/clue.jpg',
          'food': '/images/tokens/food.jpg',
          '食物': '/images/tokens/food.jpg',
          'blood': '/images/tokens/blood.jpg',
          '血液': '/images/tokens/blood.jpg'
        };

        if (isCreature) {
          var pt = (power || 1) + '/' + (toughness || 1);
          tokenImage = TOKEN_IMAGES[pt] || TOKEN_IMAGES['1/1'];
        } else {
          var nameLower = (tokenName || '').toLowerCase();
          tokenImage = NON_CREATURE_IMAGES[nameLower] || NON_CREATURE_IMAGES['treasure'];
        }
      }

      const token = {
        id: 'token_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        name: tokenName,
        type: isCreature ? 'Token Creature' : 'Token',
        type_line: isCreature ? '衍生物 ～ 生物' : '衍生物',
        power: isCreature ? String(power || 1) : null,
        toughness: isCreature ? String(toughness || 1) : null,
        colors: colors || [],
        is_token: true,
        is_creature: isCreature,
        tapped: false,
        counters: {},
        damage_marked: 0,
        mana_cost: '',
        oracle_text: '',
        image_uris: null,
        image_small: tokenImage
      };
      me.battlefield.push(token);
      gs.log.push(me.name + ' 创建了一个 ' + tokenName + (isCreature ? ' (' + token.power + '/' + token.toughness + ')' : ''));
      return { success: true };
    }
    case 'toggle_token_type': {
      const { card_id } = action;
      if (!card_id) return { error: '缺少衍生物参数' };
      const found = findCardInBattlefield(me, card_id);
      if (!found.card) return { error: '战场上没有此牌' };
      const card = found.card;
      if (!card.is_token) return { error: '只有衍生物可以切换类型' };
      card.is_creature = !card.is_creature;
      if (card.is_creature) {
        card.type = 'Token Creature';
        card.type_line = '衍生物 ～ 生物';
        if (card.power == null) card.power = '1';
        if (card.toughness == null) card.toughness = '1';
      } else {
        card.type = 'Token';
        card.type_line = '衍生物';
        card.power = null;
        card.toughness = null;
      }
      gs.log.push(me.name + ' 将 ' + card.name + ' 切换为' + (card.is_creature ? '生物' : '非生物'));
      return { success: true };
    }
    default:
      return { error: '未知的操作类型' };
  }
}

// Main battle action endpoint (BO3 aware)
app.post('/api/battles/:id/action', authMiddleware, (req, res) => {
  try {
    const battle = db.prepare(`
      SELECT b.*, u1.username as player1_name, u2.username as player2_name
      FROM battles b LEFT JOIN users u1 ON b.player1_id = u1.id LEFT JOIN users u2 ON b.player2_id = u2.id
      WHERE b.id = ?
    `).get(req.params.id);
    if (!battle || battle.status !== 'in_progress') return res.status(400).json({ error: '对战不在进行中' });

    const gs = JSON.parse(battle.game_state);
    const action = req.body;
    const result = processGameAction(gs, req.user.id, action);

    if (result.error) return res.status(400).json(result);

    if (gs.winner) {
      // Determine format from event settings (BO1 or BO3)
      let matchFormat = 'bo3'; // default
      if (battle.event_id) {
        const evt = db.prepare('SELECT settings FROM events WHERE id = ?').get(battle.event_id);
        if (evt) {
          const evtSettings = JSON.parse(evt.settings || '{}');
          matchFormat = evtSettings.format || 'bo3';
        }
      }
      const winsNeeded = matchFormat === 'bo1' ? 1 : 2;
      const p1w = (battle.player1_wins || 0) + (gs.winner === 'p1' ? 1 : 0);
      const p2w = (battle.player2_wins || 0) + (gs.winner === 'p2' ? 1 : 0);
      if (p1w >= winsNeeded || p2w >= winsNeeded) {
        // Match over
        const matchWinnerId = p1w >= winsNeeded ? battle.player1_id : battle.player2_id;
        db.prepare('UPDATE battles SET winner_id = ?, status = ?, player1_wins = ?, player2_wins = ? WHERE id = ?').run(
          matchWinnerId, 'completed', p1w, p2w, battle.id
        );
        gs.matchOver = true;
        gs.matchWinner = gs.winner;
      } else {
        // Game over but match continues
        db.prepare('UPDATE battles SET player1_wins = ?, player2_wins = ?, game_state = ? WHERE id = ?').run(
          p1w, p2w, JSON.stringify(gs), battle.id
        );
        gs.gameOver = true;
        gs.gameWinner = gs.winner;
        gs.player1_wins = p1w;
        gs.player2_wins = p2w;
      }
    }

    db.prepare('UPDATE battles SET game_state = ?, current_turn = ? WHERE id = ?').run(
      JSON.stringify(gs), gs.turn, battle.id
    );
    res.json({ success: true, game_state: gs });
    wsBroadcast(`battle:${battle.id}`, 'battle_updated', { battleId: battle.id });
  } catch (err) {
    console.error('Battle action error:', err);
    res.status(500).json({ error: err.message });
  }
});


// ============================================================
// Stats
// ============================================================
app.get('/api/stats', authMiddleware, (req, res) => {
  const cubes = db.prepare('SELECT COUNT(*) as c FROM cubes WHERE user_id = ?').get(req.user.id).c;
  const events = db.prepare('SELECT COUNT(*) as c FROM participants WHERE user_id = ?').get(req.user.id).c;
  const decks = db.prepare('SELECT COUNT(*) as c FROM decks WHERE user_id = ?').get(req.user.id).c;
  const battles = db.prepare('SELECT COUNT(*) as c FROM battles WHERE player1_id = ? OR player2_id = ?').get(req.user.id, req.user.id).c;
  const wins = db.prepare('SELECT COUNT(*) as c FROM battles WHERE winner_id = ?').get(req.user.id).c;
  res.json({ cubes, events, decks, battles, wins });
});

// ============================================================
// Misc endpoints
// ============================================================
app.get('/api/scryfall-status', (req, res) => {
  res.json({
    ready: bulkCacheReady, loading: bulkCacheLoading,
    cachedCards: scryfallBulkCache.size, pid: process.pid
  });
});

let httpServer = null;
app.post('/api/shutdown', (req, res) => {
  if (req.headers['x-shutdown-key'] !== 'mtg-launcher-2024') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json({ shutting_down: true });
  if (httpServer) {
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000);
  } else {
    process.exit(0);
  }
});

// ============================================================
// Song Quiz (/guessSong) - Playlist-based
// ============================================================
const PLAYLISTS_DIR = path.join(__dirname, 'data', 'playlists');
fs.mkdirSync(PLAYLISTS_DIR, { recursive: true });

function loadPlaylists() {
  try {
    const files = fs.readdirSync(PLAYLISTS_DIR).filter(f => f.endsWith('.json'));
    return files.map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(PLAYLISTS_DIR, f)));
      data.id = f.replace('.json', '');
      return data;
    });
  } catch (err) {
    console.error('loadPlaylists error:', err.message);
    return [];
  }
}

function loadPlaylist(id) {
  try {
    // Sanitize id to prevent directory traversal
    const safe = id.replace(/[^a-zA-Z0-9_-]/g, '');
    const p = path.join(PLAYLISTS_DIR, safe + '.json');
    if (!fs.existsSync(p)) return null;
    const data = JSON.parse(fs.readFileSync(p));
    data.id = safe;
    return data;
  } catch { return null; }
}

function savePlaylist(data) {
  const safe = data.id.replace(/[^a-zA-Z0-9_-]/g, '');
  fs.writeFileSync(path.join(PLAYLISTS_DIR, safe + '.json'), JSON.stringify(data, null, 2));
}

// Token store: maps token -> song info (for reveal)
const songTokens = new Map();

// Serve playlist selection page
app.get('/guessSong', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'guessSong.html'));
});

// Serve quiz page for a playlist
app.get('/guessSong/play/:id', (req, res) => {
  const pl = loadPlaylist(req.params.id);
  if (!pl) return res.status(404).send('曲库不存在');
  res.sendFile(path.join(__dirname, 'public', 'guessSong-play.html'));
});

// Serve management page
app.get('/guessSong/manage', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'guessSong-manage.html'));
});

// API: List all playlists
app.get('/api/guessSong/playlists', (req, res) => {
  const playlists = loadPlaylists().map(pl => ({
    id: pl.id, name: pl.name, description: pl.description || '',
    songCount: (pl.songs || []).length, cover: pl.cover || '',
  }));
  res.json(playlists);
});

// API: Get playlist detail
app.get('/api/guessSong/playlists/:id', (req, res) => {
  const pl = loadPlaylist(req.params.id);
  if (!pl) return res.status(404).json({ error: '曲库不存在' });
  res.json({ id: pl.id, name: pl.name, description: pl.description || '', songCount: (pl.songs || []).length, songs: pl.songs || [] });
});

// API: Create playlist
app.post('/api/guessSong/playlists', (req, res) => {
  const { name, description, cover } = req.body;
  if (!name) return res.status(400).json({ error: '曲库名称不能为空' });
  const id = 'pl_' + Date.now();
  const data = { id, name, description: description || '', cover: cover || '', songs: [] };
  savePlaylist(data);
  res.json({ id, name: data.name });
});

// API: Update playlist
app.put('/api/guessSong/playlists/:id', (req, res) => {
  const pl = loadPlaylist(req.params.id);
  if (!pl) return res.status(404).json({ error: '曲库不存在' });
  const { name, description, cover } = req.body;
  if (name) pl.name = name;
  if (description !== undefined) pl.description = description;
  if (cover !== undefined) pl.cover = cover;
  savePlaylist(pl);
  res.json({ success: true });
});

// API: Delete playlist
app.delete('/api/guessSong/playlists/:id', (req, res) => {
  const safe = req.params.id.replace(/[^a-zA-Z0-9_-]/g, '');
  const p = path.join(PLAYLISTS_DIR, safe + '.json');
  if (!fs.existsSync(p)) return res.status(404).json({ error: '曲库不存在' });
  fs.unlinkSync(p);
  res.json({ success: true });
});

// API: Add songs to playlist
app.post('/api/guessSong/playlists/:id/songs', (req, res) => {
  const pl = loadPlaylist(req.params.id);
  if (!pl) return res.status(404).json({ error: '曲库不存在' });
  const { songs } = req.body;
  if (!Array.isArray(songs)) return res.status(400).json({ error: 'songs must be array' });
  const existingIds = new Set((pl.songs || []).map(s => s.id));
  let added = 0;
  for (const s of songs) {
    if (!existingIds.has(s.id)) {
      pl.songs.push({ id: s.id, name: s.name || '', anime: s.anime || '', artist: s.artist || '', year: s.year || null });
      existingIds.add(s.id);
      added++;
    }
  }
  savePlaylist(pl);
  res.json({ added, total: pl.songs.length });
});

// API: Remove song from playlist
app.delete('/api/guessSong/playlists/:id/songs/:songId', (req, res) => {
  const pl = loadPlaylist(req.params.id);
  if (!pl) return res.status(404).json({ error: '曲库不存在' });
  const songId = parseInt(req.params.songId);
  pl.songs = (pl.songs || []).filter(s => s.id !== songId);
  savePlaylist(pl);
  res.json({ success: true, total: pl.songs.length });
});

// API: Search songs on NetEase (for management UI)
app.get('/api/guessSong/search', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.json([]);
    const result = await search({ keywords: q, limit: 20 });
    const songs = (result.body && result.body.result && result.body.result.songs) || [];
    res.json(songs.map(s => ({
      id: s.id, name: s.name,
      artist: s.artists.map(a => a.name).join(' / '),
      album: s.album ? s.album.name : '',
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get random song from a playlist (returns audio URL + token, not song info)
app.get('/api/guessSong/random', async (req, res) => {
  try {
    const pl = loadPlaylist(req.query.playlist);
    if (!pl || !pl.songs || pl.songs.length === 0) return res.status(404).json({ error: '曲库为空或不存在' });
    const song = pl.songs[Math.floor(Math.random() * pl.songs.length)];
    const urlRes = await song_url({ id: song.id });
    const audioUrl = urlRes.body.data && urlRes.body.data[0] ? urlRes.body.data[0].url : null;
    if (!audioUrl) return res.status(500).json({ error: '无法获取音频链接，请重试' });
    const token = 'tk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    songTokens.set(token, song);
    // Clean old tokens (keep last 50)
    if (songTokens.size > 100) {
      const keys = Array.from(songTokens.keys());
      for (let i = 0; i < keys.length - 50; i++) songTokens.delete(keys[i]);
    }
    res.json({ audioUrl, token, duration: 30 });
  } catch (err) {
    console.error('guessSong random error:', err.message);
    res.status(500).json({ error: '获取歌曲失败: ' + err.message });
  }
});

// API: Reveal song info by token
app.get('/api/guessSong/reveal', (req, res) => {
  const song = songTokens.get(req.query.token || '');
  if (!song) return res.status(400).json({ error: '无效 token' });
  res.json({ name: song.name, anime: song.anime, artist: song.artist, year: song.year });
});

// Legacy redirect
app.get('/guessAnime', (req, res) => res.redirect('/guessSong'));

// ============================================================
// SPA Fallback
// ============================================================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// WebSocket Server
// ============================================================
function wsBroadcast(target, event, data) {
  const payload = JSON.stringify({ type: 'event', target, event, data });
  for (const client of wss.clients) {
    if (client.readyState === 1 && client.subscriptions && client.subscriptions.has(target)) {
      try { client.send(payload); } catch {}
    }
  }
}

function wsSendToUser(userId, event, data) {
  const payload = JSON.stringify({ type: 'event', event, data });
  for (const client of wss.clients) {
    if (client.readyState === 1 && client.userId === userId) {
      try { client.send(payload); } catch {}
    }
  }
}

const wss = new WebSocketServer({ noServer: true });

function startServer(port) {
  httpServer = http.createServer(app);
  httpServer.on('upgrade', (req, socket, head) => {
    const parsed = url.parse(req.url, true);
    if (parsed.pathname !== '/ws') { socket.destroy(); return; }
    let userId = null;
    try {
      const token = parsed.query.token;
      if (token) {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.id;
      }
    } catch {}
    if (!userId) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.userId = userId;
      ws.subscriptions = new Set();
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'subscribe' && msg.target) ws.subscriptions.add(msg.target);
        else if (msg.type === 'unsubscribe' && msg.target) ws.subscriptions.delete(msg.target);
        else if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      } catch {}
    });
    ws.on('close', () => {
      ws.subscriptions.clear();
    });
    ws.send(JSON.stringify({ type: 'connected', userId: ws.userId }));
  });

  httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} is already in use. Waiting 5 seconds...`);
      setTimeout(() => startServer(port), 5000);
    } else {
      console.error('Server start failed:', err.message);
      process.exit(1);
    }
  });
  httpServer.listen(port, () => {
    console.log(`MTG Limited Site running on http://localhost:${port}`);
    console.log(`WebSocket available at ws://localhost:${port}/ws`);
  });
}

seedSampleCube();
startServer(PORT);