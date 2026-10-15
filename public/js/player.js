// MamakeSport Video Player & Stream Engine
let shakaPlayerInstance = null;
let hlsInstance = null;
let currentMatchData = null;
let currentCourts = [];
let activeCourtId = '';
let viewerHeartbeatTimer = null;
let countdownTimer = null;
let isPreviewMode = false;
let currentJsonType = '';

document.addEventListener('DOMContentLoaded', () => {
  initPlayerPage();
});

async function initPlayerPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const matchId = urlParams.get('id');
  currentJsonType = urlParams.get('json') || '';

  if (!matchId) {
    showError('ID Pertandingan tidak ditemukan di URL.');
    return;
  }

  // Set match title placeholder
  const matchTitleEl = document.getElementById('matchTitle');
  if (matchTitleEl) matchTitleEl.textContent = 'Menghubungkan ke server siaran...';

  // Fetch match details & initial stream status
  await fetchMatchInfo(matchId);
  await refreshCourtsAndStream(matchId, true);

  // Setup periodic refresh for court / stream status (every 8s)
  setInterval(() => {
    refreshCourtsAndStream(matchId, false);
  }, 8000);

  // Setup viewer count heartbeat
  setupViewerTracker(matchId);

  // Setup player UI buttons
  setupPlayerControls();

  // Setup Live Chat
  setupLiveChat();
}

/**
 * Fetch basic match metadata
 */
async function fetchMatchInfo(matchId) {
  try {
    const res = await fetch(`/api/match/${encodeURIComponent(matchId)}`);
    const data = await res.json();
    if (data.success && data.match) {
      currentMatchData = data.match;
      renderMatchDetails(data.match);
    }
  } catch (err) {
    console.warn('Could not fetch match info:', err);
  }
}

/**
 * Render match metadata in header and info box
 */
function renderMatchDetails(match) {
  const titleEl = document.getElementById('matchTitle');
  const catBadge = document.getElementById('matchCategoryBadge');
  const sportBadge = document.getElementById('matchSportBadge');
  const startTimeEl = document.getElementById('matchStartTime');
  const posterImg = document.getElementById('playerPosterFallback');

  if (titleEl) titleEl.textContent = match.title;
  if (catBadge) catBadge.textContent = match.category || 'LIVE SPORTS';
  if (sportBadge) sportBadge.textContent = match.sport || 'Sports';
  if (startTimeEl) startTimeEl.textContent = formatScheduleTime(match.start);
  if (posterImg && match.poster) posterImg.src = match.poster;

  document.title = `${match.title} - MamakeSport Live`;
}

/**
 * Check stream status and refresh court server buttons
 */
async function refreshCourtsAndStream(matchId, isFirstLoad = false) {
  try {
    const jsonParam = currentJsonType ? `&json=${encodeURIComponent(currentJsonType)}` : '';
    const res = await fetch(`/api/check-stream?id=${encodeURIComponent(matchId)}&court=${encodeURIComponent(activeCourtId)}${jsonParam}&_=${Date.now()}`);
    const data = await res.json();

    if (!data || !data.success) return;

    if (data.title && !currentMatchData?.title) {
      const titleEl = document.getElementById('matchTitle');
      if (titleEl) titleEl.textContent = data.title;
    }

    currentCourts = Array.isArray(data.courts) ? data.courts : [];

    // If data.src has direct stream (e.g. from livesports or demo)
    if (data.src && !currentCourts.some(c => c.stream === data.src)) {
      currentCourts.unshift({
        id: 'main_feed',
        title: 'Server Utama HD',
        stream: data.src,
        type: data.type || 'm3u8'
      });
    }

    renderCourtSwitcher(currentCourts, matchId);

    // If first load, determine which stream to play
    if (isFirstLoad) {
      const targetCourt = currentCourts.find(c => c.id === activeCourtId) || currentCourts.find(c => Boolean(c.stream)) || currentCourts[0];
      const activeStream = targetCourt?.stream || data.src || '';

      if (activeStream) {
        // Stream is active right now!
        hideCountdown();
        playStreamSource({
          url: activeStream,
          type: targetCourt?.type || data.type || '',
          poster: data.poster || currentMatchData?.poster,
          keyId: targetCourt?.keyId || data.keyId,
          key: targetCourt?.key || data.key
        });
      } else {
        // Stream not yet active from apemtipi
        const startTime = targetCourt?.start || currentMatchData?.start;
        startCountdown(startTime, data.backupMessage);
      }
    } else {
      // Background poll: if match just started on apemtipi, auto-play it!
      const currentCourt = currentCourts.find(c => c.id === activeCourtId) || currentCourts.find(c => Boolean(c.stream));
      if (currentCourt?.stream && !shakaPlayerInstance && !hlsInstance && !document.getElementById('streamFrame')?.src) {
        hideCountdown();
        playStreamSource({
          url: currentCourt.stream,
          type: currentCourt.type,
          poster: data.poster || currentMatchData?.poster,
          keyId: currentCourt.keyId,
          key: currentCourt.key
        });
      }
    }

  } catch (err) {
    console.warn('Error refreshing courts:', err);
  }
}

/**
 * Render Court / Multi-server Switcher buttons
 */
function renderCourtSwitcher(courts, matchId) {
  const container = document.getElementById('courtSwitcher');
  if (!container) return;

  if (!courts || courts.length === 0) {
    container.innerHTML = `
      <div class="flex items-center justify-between w-full flex-wrap gap-2">
        <span class="text-xs text-zinc-500">
          <i class="fa-solid fa-server mr-1"></i> Menghubungkan ke server streaming apemtipi...
        </span>
        <button onclick="play247LiveStream()" class="court-btn border-emerald-500/50 text-emerald-400 bg-emerald-500/10">
          <i class="fa-solid fa-satellite-dish text-red-500 animate-pulse"></i>
          <span>Putar Saluran Olahraga Live 24/7</span>
        </button>
      </div>
    `;
    return;
  }

  if (!activeCourtId && courts.length > 0) {
    activeCourtId = courts[0].id;
  }

  container.innerHTML = `
    <div class="flex items-center gap-2 flex-wrap">
      <span class="text-xs text-zinc-400 font-bold mr-1 flex items-center gap-1">
        <i class="fa-solid fa-server text-[#d9ff00]"></i> SERVER:
      </span>
      ${courts.map((court, idx) => {
        const isActive = court.id === activeCourtId;
        const isLive = Boolean(court.stream);
        return `
          <button onclick="switchCourt('${escapeJs(court.id)}')" 
            class="court-btn ${isActive ? 'active' : ''}">
            <i class="fa-solid ${isLive ? 'fa-play text-xs text-red-500' : 'fa-tv text-xs'}"></i>
            <span>${escapeHtml(court.title || `Server ${idx + 1}`)}</span>
            ${isLive ? '<span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>' : ''}
          </button>
        `;
      }).join('')}

      <button onclick="play247LiveStream()" class="court-btn bg-emerald-500/15 border-emerald-500/50 text-emerald-300 hover:text-white" title="Putar siaran olahraga aktif 24/7 tanpa menunggu jam tayang">
        <i class="fa-solid fa-satellite-dish text-red-400 animate-pulse"></i>
        <span>Siaran Live 24/7</span>
      </button>
    </div>
  `;
}

/**
 * Switch server/court
 */
function switchCourt(courtId) {
  activeCourtId = courtId;
  const court = currentCourts.find(c => c.id === courtId);

  document.querySelectorAll('.court-btn').forEach(btn => btn.classList.remove('active'));

  if (court && court.stream) {
    hideCountdown();
    playStreamSource({
      url: court.stream,
      type: court.type,
      poster: court.poster || currentMatchData?.poster,
      keyId: court.keyId,
      key: court.key
    });
  } else {
    // If court doesn't have an active stream yet
    startCountdown(court?.start || currentMatchData?.start);
  }
}

/**
 * Play a stream source (HLS m3u8, DASH mpd with ClearKey DRM, or Iframe embed)
 */
async function playStreamSource({ url, type, poster, keyId, key }) {
  destroyPlayer();

  const video = document.getElementById('shakaVideo');
  const frame = document.getElementById('streamFrame');
  const container = document.getElementById('shakaContainer');

  if (!video || !frame || !container) return;

  const resolvedType = detectStreamType(url, type);

  console.log(`[Player] Loading stream: ${url} (Type: ${resolvedType})`);

  // Show player, hide poster fallback
  document.getElementById('playerPosterContainer')?.classList.add('hidden');

  if (resolvedType === 'iframe') {
    video.style.display = 'none';
    frame.style.display = 'block';
    frame.src = url;
    return;
  }

  // For video streams (m3u8, mpd)
  frame.style.display = 'none';
  frame.src = '';
  video.style.display = 'block';
  
  // Set muted initially to satisfy browser autoplay policy
  video.muted = true;

  // 1. Try Shaka Player first if DASH or DRM is required
  if (window.shaka && shaka.Player.isBrowserSupported()) {
    try {
      shakaPlayerInstance = new shaka.Player(video);

      // Setup ClearKey DRM if keys provided
      if (keyId && key) {
        console.log('[Player] Configuring ClearKey DRM');
        shakaPlayerInstance.configure({
          drm: {
            clearKeys: {
              [String(keyId).trim()]: String(key).trim()
            }
          }
        });
      }

      shakaPlayerInstance.configure({
        streaming: {
          bufferingGoal: 10,
          rebufferingGoal: 2,
          lowLatencyMode: true
        }
      });

      await shakaPlayerInstance.load(url);
      console.log('[Player] Shaka player successfully loaded.');
      
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          showUnmuteButton();
        });
      }
      return;
    } catch (shakaErr) {
      console.warn('[Player] Shaka failed, trying Hls.js fallback:', shakaErr);
      destroyPlayer();
    }
  }

  // 2. Fallback to Hls.js for m3u8 streams
  if (resolvedType === 'm3u8' && window.Hls && Hls.isSupported()) {
    hlsInstance = new Hls({
      enableWorker: true,
      lowLatencyMode: true
    });
    hlsInstance.loadSource(url);
    hlsInstance.attachMedia(video);
    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => showUnmuteButton());
    });
    return;
  }

  // 3. Fallback to native HTML5 video
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url;
    video.play().catch(() => showUnmuteButton());
  } else {
    showError('Browser Anda tidak mendukung pemutar video ini.');
  }
}

/**
 * Show Unmute / Click-to-Play button overlay
 */
function showUnmuteButton() {
  const container = document.getElementById('shakaContainer');
  let btn = document.getElementById('unmuteOverlayBtn');
  if (!btn && container) {
    btn = document.createElement('button');
    btn.id = 'unmuteOverlayBtn';
    btn.className = 'absolute top-4 right-4 z-30 bg-black/80 hover:bg-black text-[#d9ff00] border border-[#d9ff00] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 backdrop-blur-md shadow-xl transition-all';
    btn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i> <span>Klik untuk Bersuara</span>';
    btn.onclick = () => {
      const v = document.getElementById('shakaVideo');
      if (v) {
        v.muted = false;
        v.play();
        btn.remove();
      }
    };
    container.appendChild(btn);
  }
}

/**
 * Destroy current player instances
 */
function destroyPlayer() {
  if (shakaPlayerInstance) {
    shakaPlayerInstance.destroy().catch(() => {});
    shakaPlayerInstance = null;
  }
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
  const video = document.getElementById('shakaVideo');
  if (video) {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
  document.getElementById('unmuteOverlayBtn')?.remove();
}

/**
 * Detect stream type
 */
function detectStreamType(url, type) {
  let t = String(type || '').toLowerCase().trim();
  if (t === 'hls') t = 'm3u8';
  if (t === 'dash') t = 'mpd';
  if (['m3u8', 'mpd', 'iframe'].includes(t)) return t;

  const cleanUrl = String(url || '').split('?')[0].toLowerCase();
  if (cleanUrl.endsWith('.m3u8')) return 'm3u8';
  if (cleanUrl.endsWith('.mpd')) return 'mpd';
  return 'iframe';
}

/**
 * Play permanent 24/7 Live Sports Channel (Red Bull TV / Live Feed)
 */
function play247LiveStream() {
  isPreviewMode = true;
  hideCountdown();
  playStreamSource({
    url: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8',
    type: 'm3u8',
    poster: currentMatchData?.poster
  });

  const banner = document.getElementById('demoStreamAlert');
  if (banner) {
    banner.classList.remove('hidden');
    banner.querySelector('span').textContent = 'Siaran Langsung Aktif (Saluran 24/7): Pertandingan apemtipi belum kick-off. Anda kini sedang menyaksikan siaran olahraga langsung Red Bull TV HD.';
  }
}

/**
 * Countdown timer logic
 */
function startCountdown(isoStartTime, customMessage) {
  const modal = document.getElementById('countdownOverlay');
  const posterContainer = document.getElementById('playerPosterContainer');
  if (!modal) return;

  if (countdownTimer) clearInterval(countdownTimer);

  const targetDate = isoStartTime ? new Date(isoStartTime).getTime() : Date.now() + 3600000;

  // Custom notice
  const noticeEl = document.getElementById('countdownNotice');
  if (noticeEl) {
    noticeEl.textContent = customMessage || 'Siaran resmi pertandingan ini akan online otomatis di apemtipi 15-30 menit menjelang kick-off. Anda bisa memutar siaran live olahraga 24/7 sekarang juga!';
  }

  function update() {
    const now = Date.now();
    const diff = targetDate - now;

    if (diff <= 0) {
      clearInterval(countdownTimer);
      modal.classList.add('hidden');
      const urlParams = new URLSearchParams(window.location.search);
      refreshCourtsAndStream(urlParams.get('id'), true);
      return;
    }

    const totalSecs = Math.floor(diff / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;

    const hEl = document.getElementById('countHours');
    const mEl = document.getElementById('countMinutes');
    const sEl = document.getElementById('countSeconds');

    if (hEl) hEl.textContent = String(hours).padStart(2, '0');
    if (mEl) mEl.textContent = String(mins).padStart(2, '0');
    if (sEl) sEl.textContent = String(secs).padStart(2, '0');
  }

  modal.classList.remove('hidden');
  if (posterContainer) posterContainer.classList.remove('hidden');
  update();
  countdownTimer = setInterval(update, 1000);
}

function hideCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  const modal = document.getElementById('countdownOverlay');
  if (modal) modal.classList.add('hidden');
}

/**
 * Viewer count heartbeat
 */
function setupViewerTracker(matchId) {
  let token = sessionStorage.getItem('mamake_viewer_token');
  if (!token) {
    token = 'usr_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    sessionStorage.setItem('mamake_viewer_token', token);
  }

  const updateViewerDisplay = async (action = 'count') => {
    try {
      const res = await fetch(`/api/viewer?id=${encodeURIComponent(matchId)}&action=${action}&token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (data && typeof data.count !== 'undefined') {
        const el = document.getElementById('viewerCountNumber');
        if (el) el.textContent = Number(data.count).toLocaleString('id-ID');
      }
    } catch (e) {}
  };

  updateViewerDisplay('join');
  viewerHeartbeatTimer = setInterval(() => updateViewerDisplay('heartbeat'), 10000);

  window.addEventListener('pagehide', () => {
    navigator.sendBeacon(`/api/viewer?id=${encodeURIComponent(matchId)}&action=leave&token=${encodeURIComponent(token)}`);
  });
}

/**
 * Player controls (Fullscreen, PiP, Ambient glow)
 */
function setupPlayerControls() {
  const container = document.getElementById('playerWrapper');
  const video = document.getElementById('shakaVideo');

  const btnFullscreen = document.getElementById('btnFullscreen');
  if (btnFullscreen && container) {
    btnFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        container.requestFullscreen?.() || container.webkitRequestFullscreen?.();
      } else {
        document.exitFullscreen?.() || document.webkitExitFullscreen?.();
      }
    });
  }

  const btnPip = document.getElementById('btnPip');
  if (btnPip && video) {
    btnPip.addEventListener('click', async () => {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else if (document.pictureInPictureEnabled) {
          await video.requestPictureInPicture();
        }
      } catch (err) {
        console.warn('PiP error:', err);
      }
    });
  }

  const btnAmbient = document.getElementById('btnAmbient');
  if (btnAmbient) {
    btnAmbient.addEventListener('click', () => {
      container?.classList.toggle('ambient-glow-active');
      btnAmbient.classList.toggle('text-[#d9ff00]');
    });
  }
}

/**
 * Live Chat Simulation
 */
function setupLiveChat() {
  const chatMessages = document.getElementById('chatMessages');
  const chatInput = document.getElementById('chatInput');
  const chatForm = document.getElementById('chatForm');

  if (!chatForm || !chatMessages) return;

  const initialBotMessages = [
    { user: 'Budi_Garuda', text: 'Semoga servernya lancar dan stabil malam ini! 🔥', time: '13:20' },
    { user: 'Rian_Smash', text: 'Kualitas gambarnya jernih banget full HD mantap', time: '13:21' },
    { user: 'Siti_Sport', text: 'Yuk dukung atlet kita juara hari ini! 🏆', time: '13:22' },
    { user: 'Dodi_Voli', text: 'Pertandingan seru banget ga sabar kick-off!', time: '13:23' }
  ];

  initialBotMessages.forEach(msg => appendChatMessage(msg.user, msg.text, msg.time));

  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;

    appendChatMessage('Anda (Pengguna)', text, new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }), true);
    chatInput.value = '';

    setTimeout(() => {
      const botReplies = [
        'Mantap gan, no lag!',
        'Setuju banget bro!',
        'Gooll / Point mantap!',
        'Server 1 lancar jaya'
      ];
      const randomReply = botReplies[Math.floor(Math.random() * botReplies.length)];
      appendChatMessage('Suporter_ID', randomReply, new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
    }, 2500);
  });
}

function appendChatMessage(user, text, time, isSelf = false) {
  const container = document.getElementById('chatMessages');
  if (!container) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `flex flex-col text-xs mb-2.5 ${isSelf ? 'items-end' : 'items-start'}`;
  msgDiv.innerHTML = `
    <div class="flex items-center gap-1.5 mb-0.5">
      <span class="font-bold ${isSelf ? 'text-[#d9ff00]' : 'text-zinc-300'}">${escapeHtml(user)}</span>
      <span class="text-[10px] text-zinc-500">${time}</span>
    </div>
    <div class="px-3 py-1.5 rounded-lg max-w-[85%] break-words ${isSelf ? 'bg-[#d9ff00]/15 text-white border border-[#d9ff00]/30' : 'bg-zinc-800/80 text-zinc-200 border border-zinc-700'}">
      ${escapeHtml(text)}
    </div>
  `;

  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

function showError(msg) {
  const title = document.getElementById('matchTitle');
  if (title) title.textContent = msg;
}

function formatScheduleTime(isoString) {
  if (!isoString) return 'JADWAL';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' WIB';
  } catch (e) {
    return isoString;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function escapeJs(str) {
  if (!str) return '';
  return String(str).replace(/'/g, "\\'");
}
