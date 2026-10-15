const fs = require('fs');
const path = require('path');

const APEMTIPI_BASE_URL = 'https://apemtipi.online';
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes cache

let cachedData = null;
let lastFetchTime = 0;
let isFetching = false;

// Fallback / Initial seed matches
function getFallbackMatches() {
  try {
    const fallbackPath = path.join(__dirname, '..', 'data', 'fallback_matches.json');
    if (fs.existsSync(fallbackPath)) {
      return JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
    }
  } catch (err) {
    console.error('Error reading fallback matches:', err.message);
  }
  return [];
}

/**
 * Fetch HTML from apemtipi.online
 */
async function fetchHtml(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': 'https://google.com'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP error: ${res.status}`);
    }

    return await res.text();
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Parse apemtipi homepage sections
 */
function parseHomepage(html) {
  const sections = [];
  const allMatches = [];

  const sectionRegex = /<section\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g;
  let secMatch;

  while ((secMatch = sectionRegex.exec(html)) !== null) {
    const secId = secMatch[1];
    const secContent = secMatch[2];

    const h2Match = secContent.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
    let catTitle = secId;
    let iconUrl = '';

    if (h2Match) {
      const h2Inner = h2Match[1];
      const iconMatch = h2Inner.match(/src="([^"]+)"/);
      if (iconMatch) {
        iconUrl = iconMatch[1].startsWith('http') ? iconMatch[1] : `${APEMTIPI_BASE_URL}${iconMatch[1]}`;
      }
      catTitle = h2Inner.replace(/<[^>]+>/g, '').trim();
    }

    const cardRegex = /<a\s+href="\/watch\.php\?id=([a-zA-Z0-9_-]+)"[^>]*class="channel-card"[^>]*>([\s\S]*?)<\/a>/g;
    let cardMatch;
    const matches = [];

    while ((cardMatch = cardRegex.exec(secContent)) !== null) {
      const matchId = cardMatch[1];
      const cardBody = cardMatch[2];

      const titleMatch = cardBody.match(/class="schedule-title"[^>]*>\s*([\s\S]*?)\s*<\/div>/);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : 'Pertandingan Olahraga';

      const posterMatch = cardBody.match(/src="([^"]+)"/);
      let poster = posterMatch ? posterMatch[1].trim() : `https://cdn.jwplayer.com/v2/media/${matchId}/poster.jpg?width=1920`;
      if (poster.startsWith('/')) {
        poster = `${APEMTIPI_BASE_URL}${poster}`;
      }

      const badgeMatch = cardBody.match(/data-badge="([^"]*)"/);
      const badge = badgeMatch ? badgeMatch[1].trim() : '';

      const startMatch = cardBody.match(/data-start="([^"]*)"/);
      const start = startMatch ? startMatch[1].trim() : '';

      const isLive = secId === 'matchevent' || cardBody.includes('live-badge') || cardBody.includes('poster-live');

      let sport = mapCategoryToSport(catTitle);

      const matchObj = {
        id: matchId,
        title,
        category: catTitle,
        sport,
        poster,
        badge,
        start,
        is_live: isLive,
        source: 'apemtipi',
        watch_url: `/watch?id=${matchId}`
      };

      matches.push(matchObj);
      allMatches.push(matchObj);
    }

    sections.push({
      id: secId,
      category: catTitle,
      icon: iconUrl,
      count: matches.length,
      matches
    });
  }

  return { sections, allMatches };
}

/**
 * Parse apemtipi livesports.php (contains real-time streaming matches)
 */
function parseLiveSportsPage(html) {
  const matches = [];
  const cardRegex = /<a\s+href="\/watch\.php\?json=livesports&id=([0-9]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;

  while ((m = cardRegex.exec(html)) !== null) {
    const id = m[1];
    const body = m[2];

    const titleM = body.match(/class="schedule-title"[^>]*>\s*([\s\S]*?)\s*<\/div>/);
    const title = titleM ? titleM[1].replace(/<[^>]+>/g, '').trim() : 'Live Sports Match';

    const posterM = body.match(/src="([^"]+)"/);
    const poster = posterM ? posterM[1].trim() : '';

    const catM = body.match(/class="category-badge"[^>]*>\s*([\s\S]*?)\s*<\/span>/);
    const cat = catM ? catM[1].replace(/<[^>]+>/g, '').trim() : 'Live Sports';

    const startM = body.match(/data-start="([^"]*)"/);
    const start = startM ? startM[1].trim() : '';

    const isLive = body.includes('live-badge') || body.includes('blink');

    matches.push({
      id: `ls_${id}`,
      originalId: id,
      jsonType: 'livesports',
      title,
      category: `LIVE SPORTS: ${cat.toUpperCase()}`,
      sport: mapCategoryToSport(cat),
      poster,
      badge: isLive ? 'LIVE' : 'JADWAL',
      start,
      is_live: isLive,
      source: 'apemtipi_livesports',
      watch_url: `/watch?id=ls_${id}&json=livesports`
    });
  }

  return matches;
}

function mapCategoryToSport(catTitle) {
  const c = String(catTitle).toLowerCase();
  if (c.includes('volley') || c.includes('voli') || c.includes('cev') || c.includes('sultanlar') || c.includes('v-league')) return 'Volleyball';
  if (c.includes('motor') || c.includes('motogp') || c.includes('f1')) return 'Motorsports';
  if (c.includes('badminton') || c.includes('bwf')) return 'Badminton';
  if (c.includes('foot') || c.includes('sepak') || c.includes('soccer')) return 'Football';
  if (c.includes('basket')) return 'Basketball';
  if (c.includes('fight') || c.includes('ufc') || c.includes('box')) return 'Fight Sports';
  if (c.includes('tennis')) return 'Tennis';
  if (c.includes('baseball')) return 'Baseball';
  return 'Sports';
}

/**
 * Get all schedule data combined
 */
async function getScheduleData(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedData && (now - lastFetchTime < CACHE_TTL_MS)) {
    return cachedData;
  }

  if (isFetching && cachedData) {
    return cachedData;
  }

  isFetching = true;
  try {
    console.log('[Scraper] Fetching homepage and livesports from apemtipi.online...');
    
    // Fetch homepage and livesports concurrently
    const [homeHtml, liveSportsHtml] = await Promise.allSettled([
      fetchHtml(`${APEMTIPI_BASE_URL}/`),
      fetchHtml(`${APEMTIPI_BASE_URL}/livesports.php`)
    ]);

    let sections = [];
    let allMatches = [];

    if (homeHtml.status === 'fulfilled') {
      const parsedHome = parseHomepage(homeHtml.value);
      sections = parsedHome.sections;
      allMatches = parsedHome.allMatches;
    }

    let liveSportsMatches = [];
    if (liveSportsHtml.status === 'fulfilled') {
      liveSportsMatches = parseLiveSportsPage(liveSportsHtml.value);
      if (liveSportsMatches.length > 0) {
        sections.unshift({
          id: 'livesports',
          category: 'LIVE SPORTS HARIAN',
          icon: `${APEMTIPI_BASE_URL}/assets/category/iconlive.png`,
          count: liveSportsMatches.length,
          matches: liveSportsMatches
        });
        allMatches.unshift(...liveSportsMatches);
      }
    }

    // Always include 24/7 Live TV Channels and permanent live feeds at the very top
    const fallbackList = getFallbackMatches();
    const live247Section = {
      id: 'live247',
      category: '🔴 SALURAN OLAHRAGA LIVE 24/7',
      icon: `${APEMTIPI_BASE_URL}/assets/category/iconlive.png`,
      count: fallbackList.length,
      matches: fallbackList
    };
    sections.unshift(live247Section);
    allMatches.unshift(...fallbackList);

    cachedData = {
      timestamp: new Date().toISOString(),
      totalMatches: allMatches.length,
      sections,
      allMatches
    };

    lastFetchTime = Date.now();
    console.log(`[Scraper] Successfully cached ${allMatches.length} matches across ${sections.length} sections!`);
    return cachedData;

  } catch (err) {
    console.warn(`[Scraper] Error: ${err.message}. Using fallback matches.`);
    if (cachedData) return cachedData;

    const fallbackList = getFallbackMatches();
    cachedData = {
      timestamp: new Date().toISOString(),
      totalMatches: fallbackList.length,
      sections: [{
        id: 'live247',
        category: '🔴 SALURAN OLAHRAGA LIVE 24/7',
        icon: `${APEMTIPI_BASE_URL}/assets/category/iconlive.png`,
        count: fallbackList.length,
        matches: fallbackList
      }],
      allMatches: fallbackList
    };
    return cachedData;
  } finally {
    isFetching = false;
  }
}

/**
 * Check stream status and court options from apemtipi.online
 */
async function checkStreamStatus(matchId, court = '', jsonType = '') {
  // 1. Check if it's one of our built-in 24/7 live channels
  const fallbackList = getFallbackMatches();
  const demoMatch = fallbackList.find(m => m.id === matchId);
  if (demoMatch) {
    return {
      success: true,
      id: matchId,
      title: demoMatch.title,
      event: true,
      is_live: true,
      courts: demoMatch.streams.map(s => ({
        id: s.id,
        title: s.title,
        stream: s.stream,
        type: s.type,
        poster: demoMatch.poster,
        start: demoMatch.start,
        quality: s.quality || 'HD',
        keyId: '',
        key: ''
      })),
      src: demoMatch.streams[0]?.stream || '',
      type: demoMatch.streams[0]?.type || 'm3u8',
      poster: demoMatch.poster,
      keyId: '',
      key: ''
    };
  }

  // 2. Check if it's from livesports.php (prefixed with ls_)
  let actualId = matchId;
  let isLiveSports = jsonType === 'livesports' || matchId.startsWith('ls_');
  if (matchId.startsWith('ls_')) {
    actualId = matchId.replace('ls_', '');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    let checkUrl = isLiveSports
      ? `${APEMTIPI_BASE_URL}/watch.php?check_stream=1&json=livesports&id=${encodeURIComponent(actualId)}&_=${Date.now()}`
      : `${APEMTIPI_BASE_URL}/watch.php?check_stream=1&id=${encodeURIComponent(actualId)}&court=${encodeURIComponent(court)}&_=${Date.now()}`;

    const res = await fetch(checkUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Referer': `${APEMTIPI_BASE_URL}/watch.php?id=${encodeURIComponent(actualId)}`,
        'Accept': 'application/json, text/plain, */*'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      
      // If apemtipi stream is empty (because match hasn't started yet),
      // we add backup live stream court options so user can still watch live sports preview!
      if (!data.src && (!data.courts || !data.courts.some(c => c.stream))) {
        data.backupStream = "https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8";
        data.backupMessage = "Pertandingan resmi belum dimulai di server apemtipi. Siaran akan otomatis online menjelang kick-off. Anda bisa memutar siaran olahraga live cadangan di bawah ini.";
      }
      return data;
    }
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn(`[Scraper] check_stream failed for ${matchId}:`, err.message);
  }

  // Fallback response with live sports preview option
  return {
    success: true,
    id: matchId,
    event: true,
    courts: [
      { id: "LINK 1", title: "LINK 1 (Server Apemtipi)", stream: "", type: "", poster: `https://cdn.jwplayer.com/v2/media/${actualId}/poster.jpg?width=1920` },
      { id: "BACKUP 1", title: "Server Live Sports 24/7", stream: "https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8", type: "m3u8", poster: `https://cdn.jwplayer.com/v2/media/${actualId}/poster.jpg?width=1920` }
    ],
    src: "",
    type: "",
    backupStream: "https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8",
    backupMessage: "Pertandingan resmi belum kick-off di server apemtipi.",
    poster: `https://cdn.jwplayer.com/v2/media/${actualId}/poster.jpg?width=1920`
  };
}

module.exports = {
  getScheduleData,
  checkStreamStatus,
  APEMTIPI_BASE_URL
};
