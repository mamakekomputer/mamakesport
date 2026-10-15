// Main application logic for MamakeSport
let allSectionsData = [];
let allMatchesFlattened = [];
let activeFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
  initApp();
  setupEventListeners();
});

async function initApp() {
  await loadSchedules();
}

function setupEventListeners() {
  // Search inputs (Desktop & Mobile)
  const searchInput = document.getElementById('searchInput');
  const searchInputMobile = document.getElementById('searchInputMobile');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => handleSearch(e.target.value));
  }
  if (searchInputMobile) {
    searchInputMobile.addEventListener('input', (e) => handleSearch(e.target.value));
  }

  // Close search overlay on click outside
  document.addEventListener('click', (e) => {
    const overlay = document.getElementById('searchOverlay');
    const searchBox = document.getElementById('searchBox');
    if (overlay && !overlay.contains(e.target) && !searchBox.contains(e.target)) {
      overlay.classList.add('hidden');
    }
  });

  // Scroll to Top button
  const upFloat = document.getElementById('upFloat');
  if (upFloat) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 300) {
        upFloat.classList.add('show');
      } else {
        upFloat.classList.remove('show');
      }
    });

    upFloat.addEventListener('click', (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Sync / Refresh Button
  const refreshBtn = document.getElementById('btnSyncData');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', handleSyncData);
  }
}

/**
 * Fetch schedule from /api/schedule
 */
async function loadSchedules(forceRefresh = false) {
  const container = document.getElementById('sectionsContainer');
  const loader = document.getElementById('mainLoader');

  try {
    if (loader && !container.children.length) loader.classList.remove('hidden');

    const url = forceRefresh ? '/api/schedule?refresh=1' : '/api/schedule';
    const res = await fetch(url);
    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || 'Gagal memuat jadwal');
    }

    allSectionsData = data.sections || [];
    allMatchesFlattened = [];
    allSectionsData.forEach(s => {
      if (Array.isArray(s.matches)) {
        allMatchesFlattened.push(...s.matches);
      }
    });

    // Update match count badge
    const totalMatchCountEl = document.getElementById('totalMatchCount');
    if (totalMatchCountEl) {
      totalMatchCountEl.textContent = `${data.totalMatches} Pertandingan`;
    }

    // Update sync time
    const syncTimeEl = document.getElementById('lastSyncTime');
    if (syncTimeEl) {
      const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      syncTimeEl.textContent = `Tersinkron pukul ${time} WIB`;
    }

    renderHeroCarousel();
    renderFilterPills();
    renderSections();

  } catch (err) {
    console.error('Error loading schedules:', err);
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    if (loader) loader.classList.add('hidden');
  }
}

/**
 * Handle manual synchronization with Apemtipi
 */
async function handleSyncData() {
  const btn = document.getElementById('btnSyncData');
  const icon = btn.querySelector('i');

  try {
    if (icon) icon.classList.add('fa-spin');
    btn.disabled = true;
    showToast('Sedang menyinkronkan data dengan apemtipi.online...', 'info');

    const res = await fetch('/api/refresh', { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      showToast(`Sukses! ${data.totalMatches} pertandingan berhasil diperbarui dari apemtipi.online`, 'success');
      await loadSchedules();
    } else {
      throw new Error(data.error || 'Gagal refresh');
    }
  } catch (err) {
    showToast(`Gagal sinkron: ${err.message}`, 'error');
  } finally {
    if (icon) icon.classList.remove('fa-spin');
    btn.disabled = false;
  }
}

/**
 * Render Hero Featured Carousel
 */
function renderHeroCarousel() {
  const heroContainer = document.getElementById('heroContainer');
  if (!heroContainer) return;

  const liveMatches = allMatchesFlattened.filter(m => m.is_live);
  const featured = liveMatches.length > 0 ? liveMatches.slice(0, 5) : allMatchesFlattened.slice(0, 5);

  if (featured.length === 0) {
    heroContainer.innerHTML = `
      <div class="relative w-full aspect-[21/9] min-h-[260px] bg-zinc-900 rounded-2xl overflow-hidden flex items-center justify-center">
        <p class="text-zinc-500">Tidak ada pertandingan pilihan</p>
      </div>
    `;
    return;
  }

  const current = featured[0];
  heroContainer.innerHTML = `
    <div class="relative w-full aspect-[21/9] min-h-[300px] md:min-h-[380px] rounded-2xl overflow-hidden glass-card group border border-zinc-800 shadow-2xl">
      <img src="${current.poster}" alt="${escapeHtml(current.title)}" class="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-700 ease-out">
      <div class="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent"></div>
      <div class="absolute inset-0 bg-gradient-to-r from-black/90 via-black/40 to-transparent"></div>

      <div class="absolute bottom-6 left-6 md:bottom-10 md:left-10 max-w-2xl z-10">
        <div class="flex items-center gap-3 mb-3">
          ${current.is_live 
            ? `<span class="flex items-center gap-2 bg-red-600 text-white text-xs font-black uppercase px-3 py-1 rounded-full shadow-lg shadow-red-600/50">
                 <span class="w-2 h-2 rounded-full bg-white animate-ping"></span> LIVE SEKARANG
               </span>`
            : `<span class="bg-[#d9ff00] text-black text-xs font-black uppercase px-3 py-1 rounded-full">
                 ${formatScheduleTime(current.start)}
               </span>`
          }
          <span class="text-xs font-bold text-zinc-300 bg-white/10 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10">
            ${escapeHtml(current.category || current.sport)}
          </span>
        </div>

        <h1 class="text-xl sm:text-2xl md:text-4xl font-extrabold text-white tracking-tight leading-snug drop-shadow-md mb-4">
          ${escapeHtml(current.title)}
        </h1>

        <div class="flex items-center gap-4">
          <a href="/watch?id=${encodeURIComponent(current.id)}" class="btn-neon inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm md:text-base font-bold shadow-lg">
            <i class="fa-solid fa-play"></i> Tonton Live Sekarang
          </a>
          <span class="text-xs text-zinc-400 hidden sm:inline-block">
            <i class="fa-solid fa-bolt text-[#d9ff00] mr-1"></i> Multi-server Ultra HD • Bebas Iklan Pop-up
          </span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render Filter Pills
 */
function renderFilterPills() {
  const container = document.getElementById('filterPills');
  if (!container) return;

  const filters = [
    { id: 'all', label: 'Semua Pertandingan', icon: 'fa-globe' },
    { id: 'live', label: 'Live Sekarang', icon: 'fa-circle-play', count: allMatchesFlattened.filter(m => m.is_live).length },
    { id: 'Football', label: 'Sepak Bola', icon: 'fa-futbol' },
    { id: 'Motorsports', label: 'MotoGP & F1', icon: 'fa-flag-checkered' },
    { id: 'Volleyball', label: 'Bola Voli', icon: 'fa-volleyball' },
    { id: 'Badminton', label: 'Badminton', icon: 'fa-feather' },
    { id: 'Basketball', label: 'Basket', icon: 'fa-basketball' },
    { id: 'Fight Sports', label: 'UFC & Boxing', icon: 'fa-hand-fist' },
    { id: 'Tennis', label: 'Tenis', icon: 'fa-baseball' }
  ];

  container.innerHTML = filters.map(f => `
    <button onclick="setFilter('${f.id}')" 
      class="filter-pill flex items-center gap-2 px-4 py-2 rounded-xl text-xs md:text-sm font-bold border transition-all whitespace-nowrap ${activeFilter === f.id ? 'bg-[#d9ff00] text-black border-[#d9ff00] shadow-lg shadow-[#d9ff00]/20' : 'bg-zinc-900/80 text-zinc-400 border-zinc-800 hover:border-zinc-600 hover:text-white'}">
      <i class="fa-solid ${f.icon} ${activeFilter === f.id ? 'text-black' : (f.id === 'live' ? 'text-red-500' : 'text-[#d9ff00]')}"></i>
      <span>${f.label}</span>
      ${f.count !== undefined ? `<span class="px-1.5 py-0.5 rounded-full text-[10px] ${activeFilter === f.id ? 'bg-black text-[#d9ff00]' : 'bg-red-500/20 text-red-400 border border-red-500/30'}">${f.count}</span>` : ''}
    </button>
  `).join('');
}

function setFilter(filterId) {
  activeFilter = filterId;
  renderFilterPills();
  renderSections();
}

/**
 * Render all section sliders with cards
 */
function renderSections() {
  const container = document.getElementById('sectionsContainer');
  if (!container) return;

  container.innerHTML = '';

  allSectionsData.forEach(section => {
    let matches = section.matches || [];

    // Apply Filter
    if (activeFilter === 'live') {
      matches = matches.filter(m => m.is_live);
    } else if (activeFilter !== 'all') {
      matches = matches.filter(m => m.sport === activeFilter || section.category.toLowerCase().includes(activeFilter.toLowerCase()));
    }

    if (matches.length === 0) return;

    const sectionEl = document.createElement('section');
    sectionEl.className = 'event-section mb-10';
    sectionEl.id = `sec-${section.id}`;

    const isLiveSection = section.id === 'matchevent' || section.category.includes('LIVE');

    sectionEl.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <h2 class="flex items-center gap-2 text-lg sm:text-xl md:text-2xl font-extrabold text-white">
          ${section.icon 
            ? `<img src="${section.icon}" class="w-6 h-6 object-contain" alt="icon">` 
            : `<i class="fa-solid ${isLiveSection ? 'fa-tower-broadcast text-red-500' : 'fa-trophy text-[#d9ff00]'}"></i>`
          }
          <span class="${isLiveSection ? 'text-red-500' : ''}">${escapeHtml(section.category)}</span>
          <span class="text-xs font-semibold text-zinc-400 bg-zinc-800/80 px-2 py-0.5 rounded-md ml-1 border border-zinc-700">
            ${matches.length}
          </span>
        </h2>
        <span class="text-xs text-zinc-400 hidden sm:inline-flex items-center gap-1">
          Geser untuk melihat lainnya <i class="fa-solid fa-chevron-right text-[10px] text-[#d9ff00]"></i>
        </span>
      </div>

      <div class="slider-wrapper">
        <button class="slider-arrow left" onclick="scrollSlider('slider-${section.id}', -1)" aria-label="Previous">
          <i class="fa-solid fa-chevron-left"></i>
        </button>

        <div id="slider-${section.id}" class="channel-slider flex gap-4 overflow-x-auto pb-4 snap-x hide-scrollbar">
          ${matches.map(m => renderMatchCard(m)).join('')}
        </div>

        <button class="slider-arrow right" onclick="scrollSlider('slider-${section.id}', 1)" aria-label="Next">
          <i class="fa-solid fa-chevron-right"></i>
        </button>
      </div>
    `;

    container.appendChild(sectionEl);
  });

  if (container.children.length === 0) {
    container.innerHTML = `
      <div class="text-center py-16 bg-zinc-900/50 rounded-2xl border border-zinc-800">
        <i class="fa-solid fa-calendar-xmark text-4xl text-zinc-600 mb-3"></i>
        <h3 class="text-lg font-bold text-zinc-300">Tidak ada pertandingan ditemukan</h3>
        <p class="text-sm text-zinc-500 mt-1">Coba pilih kategori olahraga lainnya atau klik Sinkron Jadwal.</p>
        <button onclick="setFilter('all')" class="mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-xs font-bold text-white transition-colors">
          Reset Filter
        </button>
      </div>
    `;
  }
}

/**
 * Render single match card HTML
 */
function renderMatchCard(match) {
  const isLive = match.is_live;
  const timeDisplay = formatScheduleTime(match.start);

  return `
    <a href="/watch?id=${encodeURIComponent(match.id)}" class="channel-card group">
      <div class="poster-container ${isLive ? 'poster-live' : ''}">
        ${isLive ? `
          <div class="live-badge">
            <span class="live-dot"></span> LIVE
          </div>
        ` : ''}
        <img src="${match.poster}" class="poster" alt="${escapeHtml(match.title)}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=600&q=80'">
      </div>

      <div class="schedule-badge ${isLive ? 'is-live' : ''}">
        <i class="fa-regular fa-clock text-[10px]"></i>
        <span>${isLive ? 'SEDANG TAYANG' : timeDisplay}</span>
      </div>

      <div class="schedule-title" title="${escapeHtml(match.title)}">
        ${escapeHtml(match.title)}
      </div>
    </a>
  `;
}

/**
 * Horizontal slider scroll handler
 */
function scrollSlider(sliderId, direction) {
  const slider = document.getElementById(sliderId);
  if (!slider) return;
  const scrollAmount = (slider.clientWidth * 0.75) * direction;
  slider.scrollBy({ left: scrollAmount, behavior: 'smooth' });
}

/**
 * Live search handler
 */
function handleSearch(query) {
  const trimmed = query.trim().toLowerCase();
  const overlay = document.getElementById('searchOverlay');
  const resultsContainer = document.getElementById('searchResults');

  if (!trimmed) {
    if (overlay) overlay.classList.add('hidden');
    return;
  }

  const matches = allMatchesFlattened.filter(m => 
    m.title.toLowerCase().includes(trimmed) || 
    (m.category && m.category.toLowerCase().includes(trimmed)) ||
    (m.sport && m.sport.toLowerCase().includes(trimmed))
  );

  if (overlay && resultsContainer) {
    overlay.classList.remove('hidden');

    if (matches.length === 0) {
      resultsContainer.innerHTML = `
        <div class="p-6 text-center text-zinc-500 text-sm">
          <i class="fa-solid fa-magnifying-glass text-xl mb-2 text-zinc-600 block"></i>
          Tidak ada hasil untuk "<strong>${escapeHtml(query)}</strong>"
        </div>
      `;
      return;
    }

    resultsContainer.innerHTML = matches.slice(0, 8).map(m => `
      <a href="/watch?id=${encodeURIComponent(m.id)}" class="flex items-center gap-3 p-3 hover:bg-zinc-800/80 transition-colors border-b border-zinc-800 last:border-b-0">
        <img src="${m.poster}" class="w-16 h-10 object-cover rounded-md flex-shrink-0" alt="poster">
        <div class="overflow-hidden flex-1">
          <p class="text-xs font-bold text-white truncate">${escapeHtml(m.title)}</p>
          <div class="flex items-center gap-2 mt-1">
            <span class="text-[10px] font-bold ${m.is_live ? 'text-red-400' : 'text-[#d9ff00]'}">
              ${m.is_live ? '● LIVE' : formatScheduleTime(m.start)}
            </span>
            <span class="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
              ${escapeHtml(m.sport || m.category)}
            </span>
          </div>
        </div>
        <i class="fa-solid fa-chevron-right text-xs text-zinc-600"></i>
      </a>
    `).join('');
  }
}

/**
 * Format ISO datetime string to readable Indonesian time
 */
function formatScheduleTime(isoString) {
  if (!isoString) return 'JADWAL';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;

    const now = new Date();
    const diffMs = date.getTime() - now.getTime();

    // If within 15 minutes past start, might be live
    if (diffMs < 0 && diffMs > -7200000) {
      return 'LIVE';
    }

    const isToday = date.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = date.toDateString() === tomorrow.toDateString();

    const timeStr = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';

    if (isToday) return `Hari ini ${timeStr}`;
    if (isTomorrow) return `Besok ${timeStr}`;

    const dateStr = date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    return `${dateStr} • ${timeStr}`;
  } catch (e) {
    return isoString;
  }
}

/**
 * Toast notifications
 */
function showToast(message, type = 'info') {
  let toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toastContainer';
    toastContainer.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 z-[10000] flex flex-col gap-2 pointer-events-none';
    document.body.appendChild(toastContainer);
  }

  const colors = {
    info: 'bg-zinc-800 text-white border-zinc-700',
    success: 'bg-[#122812] text-green-300 border-green-700',
    error: 'bg-[#2b1111] text-red-300 border-red-700'
  };

  const toast = document.createElement('div');
  toast.className = `px-5 py-3 rounded-xl border text-sm font-semibold shadow-2xl backdrop-blur-md flex items-center gap-3 transition-all duration-300 transform translate-y-4 opacity-0 pointer-events-auto ${colors[type] || colors.info}`;
  toast.innerHTML = `
    <i class="fa-solid ${type === 'success' ? 'fa-circle-check text-green-400' : (type === 'error' ? 'fa-triangle-exclamation text-red-400' : 'fa-circle-info text-blue-400')}"></i>
    <span>${escapeHtml(message)}</span>
  `;

  toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-4', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('translate-y-4', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
