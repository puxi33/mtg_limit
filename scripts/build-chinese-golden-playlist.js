const { search, song_detail } = require('NeteaseCloudMusicApi');
const fs = require('fs');

// 90后/00后华语金曲 - 核心歌手 + 代表曲目标定
const ARTISTS = [
  '周杰伦', '林俊杰', '陈奕迅', '孙燕姿', '梁静茹',
  '五月天', '蔡依林', 'S.H.E', '张韶涵', '王力宏',
  '邓紫棋', '薛之谦', '李荣浩', '莫文蔚', '张惠妹',
  '许嵩', '汪苏泷', '徐良', '朴树', '许巍',
  '汪峰', '凤凰传奇', '筷子兄弟', '田馥甄', '杨宗纬',
  '张杰', '李宇春', '张靓颖', '飞儿乐团', '光良',
  '林宥嘉', '萧敬腾', '陶喆', '苏打绿', '陈绮贞',
  '方大同', '蔡健雅', '梁咏琪', '任贤齐', '张信哲',
  '毛不易', '周深', '赵雷', '华晨宇', 'TFBOYS',
  '杨丞琳', '王心凌', '张栋梁', '戴佩妮', '范玮琪',
  '胡彦斌', '张震岳', '李宗盛', '罗大佑', '伍佰',
  'Beyond', '王菲', '张学友', '刘若英', '那英'
];

// 额外补充的经典曲目搜索词 (确保这些金曲被收录)
const EXTRA_SEARCHES = [
  // 周杰伦经典
  '晴天 周杰伦', '七里香 周杰伦', '稻香 周杰伦', '简单爱 周杰伦',
  '夜曲 周杰伦', '青花瓷 周杰伦', '告白气球 周杰伦', '以父之名 周杰伦',
  '双截棍 周杰伦', '可爱女人 周杰伦', '不能说的秘密 周杰伦', '彩虹 周杰伦',
  '一路向北 周杰伦', '蒲公英的约定 周杰伦', '回到过去 周杰伦',
  '半岛铁盒 周杰伦', '园游会 周杰伦', '花海 周杰伦', '说好的幸福呢 周杰伦',
  '枫 周杰伦', '最长的电影 周杰伦', '黑色幽默 周杰伦',
  // 林俊杰经典
  '江南 林俊杰', '一千年以后 林俊杰', '她说 林俊杰', '修炼爱情 林俊杰',
  '那些你很冒险的梦 林俊杰', '小酒窝 林俊杰', '背对背拥抱 林俊杰',
  '可惜没如果 林俊杰', '不为谁而作的歌 林俊杰',
  // 陈奕迅经典
  '十年 陈奕迅', '浮夸 陈奕迅', '爱情转移 陈奕迅', '好久不见 陈奕迅',
  'K歌之王 陈奕迅', '单车 陈奕迅', '淘汰 陈奕迅', '富士山下 陈奕迅',
  '不要说话 陈奕迅', '稳稳的幸福 陈奕迅',
  // 孙燕姿经典
  '遇见 孙燕姿', '天黑黑 孙燕姿', '开始懂了 孙燕姿', '我怀念的 孙燕姿',
  '绿光 孙燕姿', '逃亡 孙燕姿', '逆光 孙燕姿',
  // 五月天经典
  '倔强 五月天', '知足 五月天', '温柔 五月天', '突然好想你 五月天',
  '志明与春娇 五月天', '拥抱 五月天', '恋爱ing 五月天', '干杯 五月天',
  // S.H.E经典
  'Super Star S.H.E', '不想长大 S.H.E', '中国话 S.H.E', '恋人未满 S.H.E',
  // 蔡依林经典
  '日不落 蔡依林', '倒带 蔡依林', '说爱你 蔡依林', '舞娘 蔡依林',
  '看我72变 蔡依林', '柠檬草的味道 蔡依林', '花蝴蝶 蔡依林',
  // 邓紫棋经典
  '泡沫 邓紫棋', '光年之外 邓紫棋', '喜欢你 邓紫棋', '来自天堂的魔鬼 邓紫棋',
  // 薛之谦经典
  '演员 薛之谦', '丑八怪 薛之谦', '认真的雪 薛之谦', '你还要我怎样 薛之谦',
  // 其他经典
  '后来 刘若英', '匆匆那年 王菲', '红豆 王菲', '我愿意 王菲',
  '吻别 张学友', '一路上有你 张学友', '她来听我的演唱会 张学友',
  '海阔天空 Beyond', '光辉岁月 Beyond', '真的爱你 Beyond',
  '挪威的森林 伍佰', '突然的自我 伍佰', 'Last Dance 伍佰',
  '童年 罗大佑', '光阴的故事 罗大佑', '恋曲1990 罗大佑',
  '山丘 李宗盛', '漂洋过海来看你 李宗盛', '凡人歌 李宗盛',
  '征服 那英', '白天不懂夜的黑 那英', '默 那英',
  '平凡之路 朴树', '生如夏花 朴树', '那些花儿 朴树',
  '蓝莲花 许巍', '曾经的你 许巍', '故乡 许巍',
  '春天里 汪峰', '存在 汪峰', '怒放的生命 汪峰',
  '最炫民族风 凤凰传奇', '月亮之上 凤凰传奇', '荷塘月色 凤凰传奇',
  '小苹果 筷子兄弟', '老男孩 筷子兄弟', '父亲 筷子兄弟',
  '小幸运 田馥甄', '寂寞寂寞就好 田馥甄',
  '一次就好 杨宗纬', '凉凉 杨宗纬',
  '这就是爱吗 张杰', '天下 张杰', '逆战 张杰',
  '隐形的翅膀 张韶涵', '欧若拉 张韶涵', '遗失的美好 张韶涵',
  'Lydia 飞儿乐团', '我们的爱 飞儿乐团', '千年之恋 飞儿乐团',
  '童话 光良', '第一次 光良', '约定 光良',
  '说谎 林宥嘉', '说谎 林宥嘉', '残酷月光 林宥嘉',
  '王妃 萧敬腾', '新不了情 萧敬腾',
  '找自己 陶喆', '爱很简单 陶喆', '普通朋友 陶喆',
  '小情歌 苏打绿', '无与伦比的美丽 苏打绿',
  '旅行的意义 陈绮贞', '鱼 陈绮贞',
  'Love Song 方大同', '三人游 方大同',
  '红色高跟鞋 蔡健雅', '空白格 蔡健雅',
  '短发 梁咏琪', '胆小鬼 梁咏琪',
  '心太软 任贤齐', '对面的女孩看过来 任贤齐', '伤心太平洋 任贤齐',
  '过火 张信哲', '爱如潮水 张信哲', '信仰 张信哲',
  '消愁 毛不易', '像我这样的人 毛不易',
  '大鱼 周深', '达拉崩吧 周深',
  '成都 赵雷', '南方姑娘 赵雷',
  '烟火里的尘埃 华晨宇', '好想爱这个世界啊 华晨宇',
  '青春修炼手册 TFBOYS', '宠爱 TFBOYS', '大梦想家 TFBOYS',
  '暧昧 杨丞琳', '雨爱 杨丞琳', '左边 杨丞琳',
  '爱你 王心凌', '第一次爱的人 王心凌', '睫毛弯弯 王心凌',
  '当你孤单你会想起谁 张栋梁', '北极星的眼泪 张栋梁',
  '怎样 戴佩妮', '街角的祝福 戴佩妮',
  '一个像夏天一个像秋天 范玮琪', '最初的梦想 范玮琪',
  '红颜 胡彦斌', '男人KTV 胡彦斌',
  '爱我别走 张震岳', '思念是一种病 张震岳', '再见 张震岳',
  '灰色头像 许嵩', '清明雨上 许嵩', '素颜 许嵩', '断桥残雪 许嵩',
  '万有引力 汪苏泷', '不分手的恋爱 汪苏泷', '小星星 汪苏泷',
  '客官不可以 徐良', '坏女孩 徐良', '红装 徐良',
  '勇气 梁静茹', '宁夏 梁静茹', '可惜不是你 梁静茹', '分手快乐 梁静茹',
  '会呼吸的痛 梁静茹', '暖暖 梁静茹',
  '天黑黑 孙燕姿', '遇见 孙燕姿', '我怀念的 孙燕姿',
  '大城小爱 王力宏', '唯一 王力宏', '你不知道的事 王力宏',
  '改变自己 王力宏', '心跳 王力宏',
];

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 过滤 Live/Remix/翻唱 版本，优先录音室版
function isStudioVersion(song) {
  const name = song.name || '';
  const album = (song.album && song.album.name) || '';
  // 排除标记
  const liveIndicators = ['(Live)', '(live)', '（Live）', '(演唱会)', 'Live Concert', '演唱会', '(Acoustic Live)', '(Music Radio', '中国好声音', '中国新歌声', '歌手', '蒙面唱将', '我是歌手'];
  for (const ind of liveIndicators) {
    if (name.includes(ind) || album.includes(ind)) return false;
  }
  return true;
}

function scoreSong(song) {
  let score = 0;
  const name = song.name || '';
  const album = (song.album && song.album.name) || '';

  // 录音室版优先
  if (isStudioVersion(song)) score += 100;

  // 专辑名与歌曲名相同 → 可能是同名主打单曲
  if (name === album) score += 10;

  // 排除 remix/cover
  if (name.includes('Remix') || name.includes('remix') || name.includes('Cover') || name.includes('cover')) score -= 50;

  // 精选集/合辑扣分 (通常是二手收录)
  if (album.includes('精选') || album.includes('全记录') || album.includes('经典') || album.includes('Best')) score -= 5;

  return score;
}

async function main() {
  const allSongs = new Map(); // id -> song
  const nameArtistKey = new Set(); // dedup key

  console.log(`=== 阶段1: 搜索 ${ARTISTS.length} 位歌手 ===`);
  for (let i = 0; i < ARTISTS.length; i++) {
    const artist = ARTISTS[i];
    try {
      const result = await search({ keywords: artist, limit: 20 });
      const songs = (result.body && result.body.result && result.body.result.songs) || [];
      let added = 0;
      for (const s of songs) {
        const artistStr = s.artists.map(a => a.name).join(' / ');
        const key = `${s.name}|${artistStr}`;
        if (!nameArtistKey.has(key) && !allSongs.has(s.id)) {
          nameArtistKey.add(key);
          allSongs.set(s.id, { ...s, _score: scoreSong(s) });
          added++;
        } else if (allSongs.has(s.id)) {
          // 更新分数
          const existing = allSongs.get(s.id);
          const newScore = scoreSong(s);
          if (newScore > existing._score) {
            allSongs.set(s.id, { ...s, _score: newScore });
          }
        }
      }
      console.log(`[${i+1}/${ARTISTS.length}] ${artist}: +${added} (累计: ${allSongs.size})`);
    } catch (err) {
      console.error(`搜索 ${artist} 失败:`, err.message);
    }
    await sleep(250);
  }

  console.log(`\n=== 阶段2: 补充搜索 ${EXTRA_SEARCHES.length} 首经典曲目 ===`);
  for (let i = 0; i < EXTRA_SEARCHES.length; i++) {
    const q = EXTRA_SEARCHES[i];
    try {
      const result = await search({ keywords: q, limit: 5 });
      const songs = (result.body && result.body.result && result.body.result.songs) || [];
      for (const s of songs.slice(0, 3)) { // 只取前3个结果
        const artistStr = s.artists.map(a => a.name).join(' / ');
        const key = `${s.name}|${artistStr}`;
        const sc = scoreSong(s);
        if (!nameArtistKey.has(key) && !allSongs.has(s.id)) {
          nameArtistKey.add(key);
          allSongs.set(s.id, { ...s, _score: sc });
        } else if (allSongs.has(s.id)) {
          const existing = allSongs.get(s.id);
          if (sc > existing._score) {
            allSongs.set(s.id, { ...s, _score: sc });
          }
        }
      }
    } catch (err) {
      // silent
    }
    if (i % 20 === 19) {
      console.log(`  补充搜索进度: ${i+1}/${EXTRA_SEARCHES.length} (累计: ${allSongs.size})`);
    }
    await sleep(200);
  }

  console.log(`\n搜索完成，共收集 ${allSongs.size} 首候选歌曲`);

  // 获取歌曲详情(年份)
  const songIds = Array.from(allSongs.keys());
  const batchSize = 50;
  const detailsMap = new Map();

  console.log(`\n=== 阶段3: 获取歌曲详情 (年份) ===`);
  for (let i = 0; i < songIds.length; i += batchSize) {
    const batch = songIds.slice(i, i + batchSize);
    try {
      const detail = await song_detail({ ids: batch.join(',') });
      const songs = (detail.body && detail.body.songs) || [];
      for (const s of songs) {
        const pubTime = s.publishTime || 0;
        const year = pubTime ? new Date(pubTime).getFullYear() : 0;
        detailsMap.set(s.id, year);
      }
    } catch (err) {
      console.error(`  详情批次失败:`, err.message);
    }
    await sleep(400);
  }

  // 组装最终数据
  const allSongsArr = [];
  for (const [id, info] of allSongs) {
    allSongsArr.push({
      id: info.id,
      name: info.name,
      anime: info.album ? info.album.name : '',
      artist: info.artists.map(a => a.name).join(' / '),
      year: detailsMap.get(id) || 0,
      _score: info._score || 0,
    });
  }

  // 按年代均衡分配: 分4个年代段, 每段按比例取
  const eras = {
    '2020s': allSongsArr.filter(s => s.year >= 2020),
    '2010s': allSongsArr.filter(s => s.year >= 2010 && s.year < 2020),
    '2000s': allSongsArr.filter(s => s.year >= 2000 && s.year < 2010),
    'pre2000': allSongsArr.filter(s => s.year > 0 && s.year < 2000),
    'unknown': allSongsArr.filter(s => s.year === 0),
  };

  for (const [era, songs] of Object.entries(eras)) {
    songs.sort((a, b) => b._score - a._score); // 按分数排序
    console.log(`  ${era}: ${songs.length} 首`);
  }

  // 按比例分配500首: 2020s 15%, 2010s 35%, 2000s 35%, pre2000 15%
  const quotas = { '2020s': 75, '2010s': 175, '2000s': 175, 'pre2000': 75 };
  const selected = [];
  const selectedIds = new Set();

  for (const [era, quota] of Object.entries(quotas)) {
    const eraSongs = eras[era] || [];
    let taken = 0;
    for (const s of eraSongs) {
      if (taken >= quota) break;
      if (!selectedIds.has(s.id)) {
        selected.push(s);
        selectedIds.add(s.id);
        taken++;
      }
    }
    console.log(`  ${era}: 选取 ${taken}/${quota}`);
  }

  // 如果某个年代不够, 从 unknown 或其他年代补充
  while (selected.length < 500) {
    const remaining = allSongsArr.filter(s => !selectedIds.has(s.id));
    remaining.sort((a, b) => b._score - a._score);
    if (remaining.length === 0) break;
    const s = remaining[0];
    selected.push(s);
    selectedIds.add(s.id);
  }

  // 清理内部字段, 按年份排序
  const finalSongs = selected
    .map(({ _score, ...rest }) => rest)
    .sort((a, b) => a.year - b.year);

  const playlist = {
    name: '华语金曲500首',
    description: '90后00后经典华语歌曲，那些年我们一起听过的歌，随机播放猜猜看！',
    cover: '',
    songs: finalSongs,
  };

  const outPath = '/Users/puxi/mtg/data/playlists/chinese_golden.json';
  fs.writeFileSync(outPath, JSON.stringify(playlist, null, 2), 'utf8');

  console.log(`\n✓ 已保存 ${finalSongs.length} 首到 ${outPath}`);
  console.log(`  有年份: ${finalSongs.filter(s => s.year > 0).length} | 无年份: ${finalSongs.filter(s => s.year === 0).length}`);

  // 年代分布
  const dist = {};
  for (const s of finalSongs) {
    const decade = s.year > 0 ? `${Math.floor(s.year/10)*10}s` : 'unknown';
    dist[decade] = (dist[decade] || 0) + 1;
  }
  console.log('  年代分布:', JSON.stringify(dist));

  // 歌手分布
  const artistCount = {};
  for (const s of finalSongs) {
    const mainArtist = s.artist.split(' / ')[0];
    artistCount[mainArtist] = (artistCount[mainArtist] || 0) + 1;
  }
  const topArtists = Object.entries(artistCount).sort((a,b) => b[1]-a[1]).slice(0, 15);
  console.log('  Top15歌手:', topArtists.map(([a,c]) => `${a}(${c})`).join(', '));
}

main().catch(console.error);
