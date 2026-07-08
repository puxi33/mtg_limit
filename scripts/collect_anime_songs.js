#!/usr/bin/env node
const { search } = require('NeteaseCloudMusicApi');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Comprehensive anime title list (50+ series)
const animeList = [
  { name: '进击的巨人', year: 2013 },
  { name: '鬼灭之刃', year: 2019 },
  { name: '咒术回战', year: 2020 },
  { name: '火影忍者', year: 2002 },
  { name: '海贼王', year: 1999 },
  { name: '死神', year: 2004 },
  { name: '东京喰种', year: 2014 },
  { name: '刀剑神域', year: 2012 },
  { name: 'Re:从零开始的异世界生活', year: 2016 },
  { name: '命运石之门', year: 2011 },
  { name: '钢之炼金术师', year: 2003 },
  { name: 'Code Geass', year: 2006 },
  { name: '凉宫春日的忧郁', year: 2006 },
  { name: '某科学的超电磁炮', year: 2009 },
  { name: '魔法少女小圆', year: 2011 },
  { name: 'Fate Zero', year: 2011 },
  { name: 'Fate stay night', year: 2006 },
  { name: '新世纪福音战士', year: 1995 },
  { name: '灌篮高手', year: 1993 },
  { name: '龙珠', year: 1986 },
  { name: '银魂', year: 2006 },
  { name: '全职猎人', year: 2011 },
  { name: '你的名字', year: 2016 },
  { name: '千与千寻', year: 2001 },
  { name: '龙猫', year: 1988 },
  { name: '天气之子', year: 2019 },
  { name: '铃芽之旅', year: 2022 },
  { name: '未闻花名', year: 2011 },
  { name: '四月是你的谎言', year: 2014 },
  { name: '冰菓', year: 2012 },
  { name: '夏目友人帐', year: 2008 },
  { name: '紫罗兰永恒花园', year: 2018 },
  { name: 'Clannad', year: 2007 },
  { name: 'Angel Beats', year: 2010 },
  { name: '轻音少女', year: 2009 },
  { name: '吹响吧上低音号', year: 2015 },
  { name: '孤独摇滚', year: 2022 },
  { name: '链锯人', year: 2022 },
  { name: '间谍过家家', year: 2022 },
  { name: '辉夜大小姐', year: 2019 },
  { name: '青春猪头少年', year: 2018 },
  { name: '约定的梦幻岛', year: 2019 },
  { name: '工作细胞', year: 2018 },
  { name: '一拳超人', year: 2015 },
  { name: '我的英雄学院', year: 2016 },
  { name: '排球少年', year: 2014 },
  { name: '黑子的篮球', year: 2012 },
  { name: 'Free 游泳', year: 2013 },
  { name: '冰上的尤里', year: 2016 },
  { name: '死亡笔记', year: 2006 },
  { name: '犬夜叉', year: 2000 },
  { name: '数码宝贝', year: 1999 },
  { name: '名侦探柯南', year: 1996 },
  { name: '妖精的尾巴', year: 2009 },
  { name: '七大罪', year: 2014 },
  { name: '无职转生', year: 2021 },
  { name: '关于我转生变成史莱姆', year: 2018 },
  { name: 'overlord', year: 2015 },
  { name: '为美好的世界献上祝福', year: 2016 },
  { name: '约会大作战', year: 2013 },
  { name: '出包王女', year: 2008 },
  { name: '伪恋', year: 2014 },
  { name: '路人女主的养成方法', year: 2015 },
  { name: '俺物语', year: 2015 },
  { name: '声之形', year: 2016 },
  { name: '哈尔的移动城堡', year: 2004 },
  { name: '天空之城', year: 1986 },
  { name: '幽灵公主', year: 1997 },
  { name: '红猪', year: 1992 },
  { name: '崖上的波妞', year: 2008 },
];

// Search suffixes to try
const suffixes = [' OP', ' ED', ' 主题曲', ''];

const LIMIT_PER_SEARCH = 5;
const DELAY_MS = 3000;

async function main() {
  const allSongs = new Map();
  let searchCount = 0;
  let consecutiveErrors = 0;

  for (const anime of animeList) {
    for (const suffix of suffixes) {
      const keywords = anime.name + suffix;
      try {
        const res = await search({ keywords, limit: LIMIT_PER_SEARCH });
        searchCount++;
        consecutiveErrors = 0;

        const songs = (res.body && res.body.result && res.body.result.songs) || [];
        for (const s of songs) {
          if (!allSongs.has(s.id)) {
            allSongs.set(s.id, {
              id: s.id,
              name: s.name,
              anime: anime.name,
              artist: s.artists.map(a => a.name).join(' / '),
              year: anime.year,
            });
          }
        }

        if (searchCount % 20 === 0) {
          console.log(`[${searchCount}] searches done, ${allSongs.size} unique songs`);
        }

        await sleep(DELAY_MS);
      } catch (err) {
        consecutiveErrors++;
        if (consecutiveErrors > 5) {
          console.error(`Too many errors (${consecutiveErrors}), stopping.`);
          break;
        }
        console.error(`Error searching "${keywords}":`, err.message);
        await sleep(5000);
      }
    }
  }

  const songs = Array.from(allSongs.values());
  const fs = require('fs');
  const path = require('path');
  const rawPath = path.join(__dirname, 'data', 'anime_songs_raw.json');
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
  fs.writeFileSync(rawPath, JSON.stringify(songs, null, 2));

  console.log(`\nDone! ${searchCount} searches, ${songs.length} unique songs collected.`);
  console.log(`Saved to ${rawPath}`);
}

main().catch(console.error);
