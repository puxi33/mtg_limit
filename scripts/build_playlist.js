#!/usr/bin/env node
// Process raw anime songs into a curated playlist
const fs = require('fs');
const path = require('path');

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'anime_songs_raw.json')));

// Filter out covers, remixes, instrumental versions
function isOriginal(song) {
  const n = song.name.toLowerCase();
  const bad = ['cover', 'piano', 'remix', 'instrumental', 'karaoke', 'カラオケ',
    'ピアノ', '伴奏', 'off vocal', 'inst.', '(inst', '（inst',
    'teaser', 'preview', '翻唱', '翻奏', '改编', '吉他版', '钢琴版'];
  return !bad.some(b => n.includes(b));
}

// Group by anime
const byAnime = {};
for (const s of raw) {
  if (!isOriginal(s)) continue;
  if (!byAnime[s.anime]) byAnime[s.anime] = [];
  byAnime[s.anime].push(s);
}

// Deduplicate by song name (within each anime)
for (const anime in byAnime) {
  const seen = new Set();
  byAnime[anime] = byAnime[anime].filter(s => {
    const key = s.name.replace(/\s+/g, '').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Select songs: up to 8 per anime, prioritizing shorter names (more likely original)
const selected = [];
for (const anime in byAnime) {
  const songs = byAnime[anime];
  // Sort: shorter names first (more likely to be the actual song title)
  songs.sort((a, b) => a.name.length - b.name.length);
  const take = Math.min(songs.length, 8);
  for (let i = 0; i < take; i++) {
    selected.push(songs[i]);
  }
}

// Shuffle
for (let i = selected.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [selected[i], selected[j]] = [selected[j], selected[i]];
}

console.log(`Selected ${selected.length} songs from ${Object.keys(byAnime).length} anime series`);

// Build playlist
const playlist = {
  name: '动漫歌曲500首',
  description: '涵盖经典与热门动漫的OP、ED、插曲，随机播放猜猜看！',
  cover: '',
  songs: selected.map(s => ({
    id: s.id,
    name: s.name,
    anime: s.anime,
    artist: s.artist,
    year: s.year,
  }))
};

// Save
const outDir = path.join(__dirname, '..', 'data', 'playlists');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'anime.json'), JSON.stringify(playlist, null, 2));
console.log(`Playlist saved to ${path.join(outDir, 'anime.json')}`);
