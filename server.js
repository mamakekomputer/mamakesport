const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { getScheduleData, checkStreamStatus, APEMTIPI_BASE_URL } = require('./services/apemtipiScraper');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Simulated live viewers per match
const viewersState = new Map();

function getViewerCount(matchId) {
  if (!viewersState.has(matchId)) {
    // Generate realistic base viewer count based on ID hash
    let hash = 0;
    for (let i = 0; i < matchId.length; i++) {
      hash = (hash << 5) - hash + matchId.charCodeAt(i);
      hash |= 0;
    }
    const base = Math.abs(hash % 4000) + 850;
    viewersState.set(matchId, {
      count: base,
      tokens: new Set(),
      lastFluctuate: Date.now()
    });
  }

  const v = viewersState.get(matchId);
  // Fluctuating effect every 5 seconds
  if (Date.now() - v.lastFluctuate > 4000) {
    const delta = Math.floor(Math.random() * 21) - 10;
    v.count = Math.max(12, v.count + delta);
    v.lastFluctuate = Date.now();
  }

  return v.count + v.tokens.size;
}

// ======================== API ROUTES ======================== //

/**
 * GET /api/schedule
 * Full schedule with sport sections from apemtipi
 */
app.get('/api/schedule', async (req, res) => {
  try {
    const force = req.query.refresh === '1' || req.query.refresh === 'true';
    const data = await getScheduleData(force);
    res.json({
      success: true,
      timestamp: data.timestamp,
      totalMatches: data.totalMatches,
      sections: data.sections
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/live
 * Filter all matches that are currently live
 */
app.get('/api/live', async (req, res) => {
  try {
    const data = await getScheduleData(false);
    const liveMatches = data.allMatches.filter(m => m.is_live);
    res.json({
      success: true,
      count: liveMatches.length,
      matches: liveMatches
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/match/:id
 * Retrieve details for a single match
 */
app.get('/api/match/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await getScheduleData(false);
    const match = data.allMatches.find(m => m.id === id);

    if (!match) {
      // If not in schedule, check fallback
      const fallbackList = require('./data/fallback_matches.json');
      const fallbackMatch = fallbackList.find(m => m.id === id);
      if (fallbackMatch) {
        return res.json({ success: true, match: fallbackMatch });
      }

      // Or synthesize placeholder from apemtipi watch link
      return res.json({
        success: true,
        match: {
          id,
          title: `Pertandingan ${id}`,
          category: 'SPORTS',
          sport: 'Sport',
          poster: `https://cdn.jwplayer.com/v2/media/${id}/poster.jpg?width=1920`,
          is_live: false,
          start: new Date().toISOString()
        }
      });
    }

    res.json({ success: true, match });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/check-stream
 * Check real-time stream status & available court/server links
 */
app.get('/api/check-stream', async (req, res) => {
  try {
    const { id, court, json } = req.query;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Match id is required' });
    }

    const streamData = await checkStreamStatus(id, court || '', json || '');
    res.json(streamData);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/viewer
 * Real-time viewer count endpoint (similar to apemtipi's /api/viewer.php)
 */
app.get('/api/viewer', (req, res) => {
  const { id, action, token } = req.query;
  if (!id) {
    return res.json({ success: false, count: 0 });
  }

  const v = viewersState.get(id) || { count: 120, tokens: new Set(), lastFluctuate: Date.now() };
  if (!viewersState.has(id)) viewersState.set(id, v);

  if (action === 'join' && token) {
    v.tokens.add(token);
  } else if (action === 'leave' && token) {
    v.tokens.delete(token);
  }

  const count = getViewerCount(id);
  res.json({ success: true, id, count });
});

/**
 * Force refresh apemtipi scrape
 */
app.post('/api/refresh', async (req, res) => {
  try {
    const fresh = await getScheduleData(true);
    res.json({
      success: true,
      message: 'Berhasil sinkronisasi jadwal dari apemtipi.online!',
      totalMatches: fresh.totalMatches
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Add custom match
 */
app.post('/api/custom-match', (req, res) => {
  try {
    const { title, category, sport, poster, streamUrl, streamType, start, isLive } = req.body;
    if (!title || !streamUrl) {
      return res.status(400).json({ success: false, error: 'Title and streamUrl are required' });
    }

    const id = 'custom_' + Date.now().toString(36);
    const newMatch = {
      id,
      title,
      category: category || 'CUSTOM LIVE',
      sport: sport || 'Football',
      badge: isLive ? 'LIVE' : 'JADWAL',
      start: start || new Date().toISOString(),
      poster: poster || 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=1200&q=80',
      is_live: !!isLive,
      featured: true,
      streams: [
        {
          id: 'server1',
          title: 'Server 1 HD',
          stream: streamUrl,
          type: streamType || (streamUrl.includes('.mpd') ? 'mpd' : 'm3u8'),
          quality: '1080p'
        }
      ]
    };

    const fallbackPath = path.join(__dirname, 'data', 'fallback_matches.json');
    let fallbackList = [];
    if (fs.existsSync(fallbackPath)) {
      fallbackList = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
    }
    fallbackList.unshift(newMatch);
    fs.writeFileSync(fallbackPath, JSON.stringify(fallbackList, null, 2), 'utf8');

    // Invalidate scraper cache to reflect new match
    getScheduleData(true);

    res.json({ success: true, match: newMatch });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======================== PAGE ROUTES ======================== //

app.get('/watch', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'watch.html'));
});

app.get('/watch.php', (req, res) => {
  // Compatible with apemtipi URLs
  res.redirect(`/watch?id=${encodeURIComponent(req.query.id || '')}`);
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`🚀 MamakeSport Live Server running on port ${PORT}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`⚡ Source: Integrated with ${APEMTIPI_BASE_URL}`);
  console.log(`=================================================`);
  // Trigger initial cache warmup
  getScheduleData(false).catch(err => console.error('Warmup error:', err.message));
});
