// Club logo utility functions

// Global clubs data loaded from API
let CLUBS_DATA = [];
let CLUBS_LOADED = false;

// API URL
const API_URL = '/api';

/**
 * Load clubs from database
 */
async function loadClubsFromDatabase() {
  // If already loaded or loading, don't load again
  if (CLUBS_LOADED || window.clubsLoading) {
    return;
  }

  const token = localStorage.getItem('token');
  if (!token) {
    console.warn('No authentication token found');
    return;
  }

  window.clubsLoading = true;

  try {
    const response = await fetch(`${API_URL}/clubs`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      CLUBS_DATA = await response.json();
      CLUBS_LOADED = true;
      console.log('Clubs loaded successfully:', CLUBS_DATA.length, 'clubs');
    } else {
      console.error('Failed to load clubs from database');
      CLUBS_LOADED = true; // Mark as loaded to prevent retry loops
    }
  } catch (error) {
    console.error('Error loading clubs:', error);
    CLUBS_LOADED = true; // Mark as loaded to prevent retry loops
  } finally {
    window.clubsLoading = false;
  }
}

/**
 * Wait for clubs to be loaded
 * @returns {Promise} - Resolves when clubs are loaded
 */
function waitForClubsLoaded() {
  return new Promise((resolve) => {
    // If already loaded, resolve immediately
    if (CLUBS_LOADED) {
      resolve();
      return;
    }

    // Check every 100ms if clubs are loaded
    const checkInterval = setInterval(() => {
      if (CLUBS_LOADED) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);

    // Timeout after 5 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      console.warn('Timeout waiting for clubs to load');
      resolve(); // Resolve anyway to not block the page
    }, 5000);
  });
}

// Load clubs when script loads (if authenticated)
if (localStorage.getItem('token')) {
  loadClubsFromDatabase();
}

/**
 * Normalize club name for matching (remove special chars, extra spaces, convert to uppercase)
 */
function normalizeClubName(clubName) {
  if (!clubName) return '';
  return clubName
    .toUpperCase()
    .replace(/[._\s-]/g, '')  // Remove all dots, underscores, spaces, hyphens
    .trim();
}

/**
 * Get logo filename and display name for a club
 * @param {string} clubName - The club name from database
 * @returns {object|null} - {logo: string, displayName: string} or null if not found
 */
function getClubInfo(clubName) {
  if (!clubName) return null;

  const normalizedClubName = normalizeClubName(clubName);

  // Search in database clubs
  if (CLUBS_DATA && CLUBS_DATA.length > 0) {
    for (const club of CLUBS_DATA) {
      const normalizedDbName = normalizeClubName(club.name);
      if (normalizedClubName === normalizedDbName) {
        return {
          logo: club.logo_filename,
          displayName: club.display_name
        };
      }
    }
  }

  // Fallback: return null if no match found
  return null;
}

/**
 * Get logo filename for a club name (backwards compatibility)
 * @param {string} clubName - The club name from database
 * @returns {string|null} - Logo filename or null if not found
 */
function getClubLogo(clubName) {
  const info = getClubInfo(clubName);
  return info ? info.logo : null;
}

/**
 * Get club logo HTML with fallback to text
 * @param {string} clubName - The club name from database
 * @param {object} options - Display options
 * @param {number} options.size - Logo size in pixels (default: 24)
 * @param {boolean} options.showText - Show club name text alongside logo (default: true)
 * @param {string} options.alignment - Text alignment: 'left', 'center', 'right' (default: 'left')
 * @returns {string} - HTML string
 */
function getClubLogoHTML(clubName, options = {}) {
  const {
    size = 24,
    showText = true,
    alignment = 'left'
  } = options;

  if (!clubName || clubName === 'N/A') {
    return '<span style="color: #999;">N/A</span>';
  }

  const clubInfo = getClubInfo(clubName);

  if (!clubInfo || !clubInfo.logo) {
    // Fallback to text only if no logo found
    return `<span>${clubName}</span>`;
  }

  const displayName = clubInfo.displayName || clubName;
  const logoPath = `images/clubs/${clubInfo.logo}`;
  const logoHTML = `<img src="${logoPath}" alt="${displayName}" title="${displayName}" style="height: ${size}px; width: ${size}px; vertical-align: middle; object-fit: contain;" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';">`;

  if (showText) {
    return `
      <div style="display: flex; align-items: center; gap: 8px; justify-content: ${alignment === 'center' ? 'center' : alignment === 'right' ? 'flex-end' : 'flex-start'};">
        ${logoHTML}
        <span style="display: none;">${displayName}</span>
        <span>${displayName}</span>
      </div>
    `;
  } else {
    return `
      <span style="display: inline-flex; align-items: center;">
        ${logoHTML}
        <span style="display: none;">${displayName}</span>
      </span>
    `;
  }
}

/**
 * Get club logo for podium display (smaller text, logo emphasized)
 * @param {string} clubName - The club name from database
 * @returns {string} - HTML string
 */
function getClubLogoForPodium(clubName) {
  if (!clubName || clubName === 'N/A') {
    return '<span style="color: #999;">N/A</span>';
  }

  const clubInfo = getClubInfo(clubName);

  if (!clubInfo || !clubInfo.logo) {
    return `<span style="font-size: 11px;">${clubName}</span>`;
  }

  const displayName = clubInfo.displayName || clubName;
  const logoPath = `images/clubs/${clubInfo.logo}`;
  return `
    <div style="display: flex; align-items: center; gap: 6px; justify-content: center; flex-wrap: wrap;">
      <img src="${logoPath}" alt="${displayName}" title="${displayName}" style="height: 20px; width: 20px; object-fit: contain;" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';">
      <span style="display: none; font-size: 11px;">${displayName}</span>
      <span style="font-size: 11px;">${displayName}</span>
    </div>
  `;
}
