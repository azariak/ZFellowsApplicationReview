let currentCandidateId = null;
let candidateStatuses = {};
let statusHistory = [];
let redoHistory = [];
let zoomLevel = 0;
let candidates = []; // Will be populated from API
let flaggedCandidates = new Set(); // Flagged candidates
let hiddenCandidates = new Set(); // Locally rejected/hidden candidates (not synced to Airtable)
let showHiddenToggle = false; // Whether to show hidden candidates
let nextOffset = null; // For pagination
let hasMoreCandidates = false;
let isLoadingMore = false;
let sortOrder = 'oldest'; // 'newest' (reverse chronological) or 'oldest' (chronological)
let pendingTimers = {}; // { candidateId: { timerId, endTime, status } }
const fontSizes = [10, 11, 13, 15, 17];

// Airtable settings keys
const SETTINGS_KEY = 'zfellows-airtable-settings';

// Field mappings for client-side Airtable transformation (mirrors airtableService.js)
const FIELD_MAPPINGS = {
    'Email': 'email',
    'Email Address': 'email',
    'First': 'firstName',
    'Last': 'lastName',
    'First Name': 'firstName',
    'Last Name': 'lastName',
    'Name': 'name',
    'Project name': 'company',
    'Phone': 'phone',
    'Birthday': 'birthday',
    'Born': 'birthday',
    'Location': 'location',
    'Technical?': 'technical',
    'Previously applied?': 'previouslyApplied',
    'Stage': 'stage',
    'Accept or Reject or Waitlist': 'decision',
    'Stage 2 Link To Calendar': 'stage2Calendar',
    'Stage 3 Schedule and Date': 'stage3Schedule',
    'Stage 4 Onboarding Doc': 'stage4Onboarding',
    'Upcoming Cohort Date': 'upcomingCohortDate',
    'Waitlist Update': 'waitlistUpdate',
    'Cory Interview: Energy': 'coryEnergy',
    'Cory Interview: Overall score?': 'coryOverallScore',
    'Cory Interview: Smart?': 'corySmart',
    'Cory Interview: Storytelling?': 'coryStorytelling',
    'Cory notes': 'coryNotes',
    'School or Work': 'schoolOrWork',
    'In school or working?': 'schoolOrWork',
    'What is the project that you are currently working on or would like to pursue? Why?': 'projectDescription',
    'Flag': 'flag',
    'What problem are you solving?': 'problemSolving',
    'What expertise do you have to execute on the work that you want to do?': 'expertise',
    'Who are your competitors and what do you understand about your idea that they don\'t?': 'competitors',
    'What have you worked on in the past?': 'pastWork',
    'What\'s the nerdiest thing about you?': 'nerdy',
    'What drives you?': 'drives',
    'What non-traditional things were you doing growing up?': 'nonTraditional',
    'Tell us about a risk you\'ve taken or a challenge you\'ve faced. Tell us whether you failed or succeeded, how you behaved, and how you think this reflects your character.': 'riskOrChallenge',
    'Tell us about a risk you\u2019ve taken or a challenge you\u2019ve faced. Tell us whether you failed or succeeded, how you behaved, and how you think this reflects your character.': 'riskOrChallenge',
    'Tell us about a risk you\u02BCve taken or a challenge you\u02BCve faced. Tell us whether you failed or succeeded, how you behaved, and how you think this reflects your character.': 'riskOrChallenge',
    'Please list or describe any achievements and prizes.': 'achievements',
    'Website': 'website',
    'Personal and/or Project Website and/or Links about you': 'personalLinks',
    'Video Link': 'videoLink',
    'Video': 'videoLink',
    'Pitch Video': 'pitchVideo',
    'Pitch video': 'pitchVideo',
    'Cofounder': 'cofounder',
    'Dream Cofounder': 'cofounder',
    'How did you hear about us?': 'howHeard',
    'How did you hear about Z Fellows?': 'howHeard',
    'How did you hear about ZF?': 'howHeard',
    'What help do you need?': 'helpNeeded',
    'Help Needed': 'helpNeeded'
};

async function init() {
    loadZoomLevel();
    loadDarkMode();
    loadSidebarWidth();
    loadSortOrder();
    setupKeyboardShortcuts();
    setupResizeHandle();
    setupSettingsModal();
    initTimer();
    document.getElementById('zoom-in').addEventListener('click', () => changeZoom(1));
    document.getElementById('zoom-out').addEventListener('click', () => changeZoom(-1));
    document.getElementById('dark-mode-toggle').addEventListener('click', toggleDarkMode);
    document.getElementById('sort-order-toggle').addEventListener('click', toggleSortOrder);
    document.getElementById('candidate-search').addEventListener('input', handleSearch);
    
    // Update settings button indicator
    updateSettingsButtonIndicator();
    
    // Show loading state
    showLoadingState();
    
    // Load candidates from API
    try {
        await loadCandidatesFromAPI();
    } catch (error) {
        console.error('Failed to load candidates:', error);
        showErrorState(error.message);
    }
}

// ============ Settings Modal Functions ============

function getAirtableSettings() {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            return null;
        }
    }
    return null;
}

function saveAirtableSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function clearAirtableSettings() {
    localStorage.removeItem(SETTINGS_KEY);
}

function hasValidSettings() {
    const settings = getAirtableSettings();
    return settings && settings.token && settings.baseId && settings.tableName;
}

function updateSettingsButtonIndicator() {
    const btn = document.getElementById('settings-toggle');
    if (hasValidSettings()) {
        btn.classList.add('has-settings');
        btn.title = 'Airtable Settings (configured)';
    } else {
        btn.classList.remove('has-settings');
        btn.title = 'Airtable Settings';
    }
}

function setupSettingsModal() {
    const modal = document.getElementById('settings-modal');
    const toggleBtn = document.getElementById('settings-toggle');
    const closeBtn = document.getElementById('settings-close');
    const saveBtn = document.getElementById('settings-save');
    const clearBtn = document.getElementById('settings-clear');
    
    // Open modal
    toggleBtn.addEventListener('click', () => {
        openSettingsModal();
    });
    
    // Close modal
    closeBtn.addEventListener('click', closeSettingsModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeSettingsModal();
    });
    
    // Save settings
    saveBtn.addEventListener('click', saveSettings);
    
    // Clear settings
    clearBtn.addEventListener('click', () => {
        clearAirtableSettings();
        document.getElementById('setting-airtable-token').value = '';
        document.getElementById('setting-base-id').value = '';
        document.getElementById('setting-table-name').value = '';
        updateSettingsButtonIndicator();
        showSettingsStatus('Settings cleared. Will use server configuration.', 'info');
    });
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('open')) {
            closeSettingsModal();
        }
    });
}

function openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    const settings = getAirtableSettings();
    
    // Populate fields with saved values
    if (settings) {
        document.getElementById('setting-airtable-token').value = settings.token || '';
        document.getElementById('setting-base-id').value = settings.baseId || '';
        document.getElementById('setting-table-name').value = settings.tableName || '';
    }
    
    // Clear any previous status
    const status = document.getElementById('settings-status');
    status.className = 'modal-status';
    status.textContent = '';
    
    modal.classList.add('open');
}

function closeSettingsModal() {
    document.getElementById('settings-modal').classList.remove('open');
}

function showSettingsStatus(message, type) {
    const status = document.getElementById('settings-status');
    status.textContent = message;
    status.className = `modal-status ${type}`;
}

async function saveSettings() {
    const token = document.getElementById('setting-airtable-token').value.trim();
    const baseId = document.getElementById('setting-base-id').value.trim();
    const tableName = document.getElementById('setting-table-name').value.trim();
    
    if (!token || !baseId || !tableName) {
        showSettingsStatus('Please fill in all fields', 'error');
        return;
    }
    
    // Test the connection
    showSettingsStatus('Testing connection...', 'info');
    
    try {
        const testResult = await testAirtableConnection(token, baseId, tableName);
        if (testResult.success) {
            saveAirtableSettings({ token, baseId, tableName });
            updateSettingsButtonIndicator();
            showSettingsStatus(`Connected! Found ${testResult.recordCount} records.`, 'success');
            
            // Reload candidates with new settings
            setTimeout(async () => {
                closeSettingsModal();
                showLoadingState();
                candidates = [];
                nextOffset = null;
                hasMoreCandidates = false;
                currentCandidateId = null;
                await loadCandidatesFromAPI();
            }, 1000);
        } else {
            showSettingsStatus(testResult.error, 'error');
        }
    } catch (error) {
        showSettingsStatus(`Connection failed: ${error.message}`, 'error');
    }
}

async function testAirtableConnection(token, baseId, tableName) {
    try {
        const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`);
        url.searchParams.set('pageSize', '1');
        
        const response = await fetch(url.toString(), {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return { 
                success: false, 
                error: errorData.error?.message || `HTTP ${response.status}: ${response.statusText}` 
            };
        }
        
        const data = await response.json();
        return { success: true, recordCount: data.records.length + (data.offset ? '+' : '') };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ============ Mini Timer Functions ============
let timerInterval = null;
let timerRunning = false;
let timerDuration = 30;
let timerTimeLeft = 30;

function initTimer() {
    const toggleBtn = document.getElementById('timer-toggle-btn');
    const timerDisplay = document.getElementById('timer-display');
    
    // Initial display
    updateTimerUI();
    
    toggleBtn.addEventListener('click', toggleTimer);
    
    // Handle content editable changes
    timerDisplay.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            timerDisplay.blur();
        }
    });
    
    timerDisplay.addEventListener('blur', () => {
        const val = parseInt(timerDisplay.textContent.replace(/[^0-9]/g, ''));
        if (!isNaN(val) && val > 0) {
            timerDuration = val;
            if (!timerRunning) {
                timerTimeLeft = timerDuration;
                updateTimerUI();
            }
        } else {
            // Revert invalid input
            timerDisplay.textContent = timerDuration;
        }
    });
}

function toggleTimer() {
    if (timerRunning) {
        pauseTimer();
    } else {
        startTimer();
    }
}

function startTimer() {
    if (timerRunning) return;
    
    timerRunning = true;
    document.getElementById('timer-toggle-btn').textContent = '⏸'; // Pause icon
    document.getElementById('timer-toggle-btn').title = 'Pause';
    
    // If starting from 0 (completed), reset first
    if (timerTimeLeft <= 0) {
        timerTimeLeft = timerDuration;
    }
    
    const startTime = Date.now();
    const startLeft = timerTimeLeft;
    
    timerInterval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        timerTimeLeft = Math.max(0, startLeft - elapsed);
        
        updateTimerUI();
        
        if (timerTimeLeft <= 0) {
            completeTimer();
        }
    }, 50); // High frequency for smooth circle update
}

function pauseTimer() {
    timerRunning = false;
    clearInterval(timerInterval);
    document.getElementById('timer-toggle-btn').textContent = '▶';
    document.getElementById('timer-toggle-btn').title = 'Start';
}

function resetTimer() {
    pauseTimer();
    timerTimeLeft = timerDuration;
    updateTimerUI();
}

function updateTimerUI() {
    // Update text (only if not focused to avoid cursor jumping)
    const display = document.getElementById('timer-display');
    if (document.activeElement !== display) {
        display.textContent = Math.ceil(timerTimeLeft);
    }
    
    // Update circle progress
    const circle = document.getElementById('timer-progress');
    const circumference = 69.12; // 2 * PI * 11
    const progress = 1 - (timerTimeLeft / timerDuration);
    const offset = circumference * progress;
    circle.style.strokeDashoffset = offset;
}

function completeTimer() {
    pauseTimer();
    
    // Confetti!
    if (window.confetti) {
        const timer = document.getElementById('mini-timer');
        if (timer) {
            const rect = timer.getBoundingClientRect();
            const x = (rect.left + rect.width / 2) / window.innerWidth;
            const y = (rect.top - 30) / window.innerHeight;
            
            window.confetti({
                particleCount: 40,
                spread: 60,
                origin: { x, y },
                colors: ['#2196F3', '#4CAF50', '#FFC107', '#E91E63'],
                disableForReducedMotion: true,
                zIndex: 2000,
                scalar: 0.8
            });
        }
    }
    
    // Auto restart after a short delay
    setTimeout(() => {
        resetTimer();
        startTimer();
    }, 1500);
}

// ============ Client-side Airtable Fetch ============

function transformAirtableRecord(record) {
    const fields = record.fields || {};
    const candidate = {
        id: record.id,
        airtableId: record.id,
        createdTime: record.createdTime
    };

    // Map Airtable fields to our internal field names
    for (const [airtableField, internalField] of Object.entries(FIELD_MAPPINGS)) {
        if (fields[airtableField] !== undefined) {
            candidate[internalField] = fields[airtableField];
        }
    }

    // Also include any unmapped fields directly
    for (const [key, value] of Object.entries(fields)) {
        if (!Object.keys(FIELD_MAPPINGS).includes(key)) {
            // Check for risk/challenge field with flexible matching (handles different apostrophe characters)
            const keyLower = key.toLowerCase();
            if (keyLower.includes('risk') && keyLower.includes('challenge') && !candidate.riskOrChallenge) {
                candidate.riskOrChallenge = value;
                continue;
            }
            
            const camelKey = key.replace(/[^a-zA-Z0-9]/g, ' ')
                .split(' ')
                .map((word, i) => i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join('');
            if (!candidate[camelKey]) {
                candidate[camelKey] = value;
            }
        }
    }

    // Handle combined name field
    if (!candidate.firstName && !candidate.lastName && candidate.name) {
        const nameParts = candidate.name.split(' ');
        candidate.firstName = nameParts[0] || '';
        candidate.lastName = nameParts.slice(1).join(' ') || '';
    }

    // Provide defaults
    candidate.firstName = candidate.firstName || 'Unknown';
    candidate.lastName = candidate.lastName || '';
    candidate.company = candidate.company || 'No Project';
    candidate.email = candidate.email || '';
    candidate.phone = candidate.phone || '';
    candidate.location = candidate.location || '';
    candidate.technical = candidate.technical || '';
    candidate.previouslyApplied = candidate.previouslyApplied || '';
    candidate.birthday = candidate.birthday || '';
    candidate.schoolOrWork = candidate.schoolOrWork || '';
    candidate.projectDescription = candidate.projectDescription || '';
    candidate.problemSolving = candidate.problemSolving || '';
    candidate.expertise = candidate.expertise || '';
    candidate.competitors = candidate.competitors || '';
    candidate.pastWork = candidate.pastWork || '';
    candidate.nerdy = candidate.nerdy || '';
    candidate.drives = candidate.drives || '';
    candidate.nonTraditional = candidate.nonTraditional || '';
    candidate.riskOrChallenge = candidate.riskOrChallenge || '';
    candidate.website = candidate.website || '';
    candidate.personalLinks = candidate.personalLinks || '';
    candidate.achievements = candidate.achievements || '';
    candidate.videoLink = candidate.videoLink || '';
    candidate.pitchVideo = candidate.pitchVideo || '';
    candidate.cofounder = candidate.cofounder || '';
    candidate.howHeard = candidate.howHeard || '';
    candidate.helpNeeded = candidate.helpNeeded || '';
    candidate.aiScore = candidate.aiScore || 50;

    return candidate;
}

async function fetchFromAirtableDirect(offset = null) {
    const settings = getAirtableSettings();
    if (!settings) {
        throw new Error('Airtable settings not configured');
    }
    
    const { token, baseId, tableName } = settings;
    const allRecords = [];
    let currentOffset = offset;
    const maxRecords = 500;
    let recordsFetched = 0;
    let nextOffsetResult = null;

    while (recordsFetched < maxRecords) {
        const pageSize = Math.min(100, maxRecords - recordsFetched);
        
        const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`);
        url.searchParams.set('pageSize', pageSize.toString());
        url.searchParams.set('sort[0][field]', 'Created');
        url.searchParams.set('sort[0][direction]', 'desc');
        
        if (currentOffset) {
            url.searchParams.set('offset', currentOffset);
        }

        const response = await fetch(url.toString(), {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Airtable API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        allRecords.push(...data.records);
        recordsFetched += data.records.length;
        
        if (data.offset && recordsFetched < maxRecords) {
            currentOffset = data.offset;
        } else {
            nextOffsetResult = data.offset || null;
            break;
        }
        
        if (!data.offset) break;
    }

    const transformedCandidates = allRecords.map(record => transformAirtableRecord(record));
    
    return {
        success: true,
        candidates: transformedCandidates,
        offset: nextOffsetResult,
        hasMore: !!nextOffsetResult
    };
}

// ============ Loading State Functions ============

function showLoadingState() {
    const listElement = document.getElementById('candidate-list');
    const source = hasValidSettings() ? 'browser' : 'server';
    listElement.innerHTML = `<div class="loading-state">Loading candidates from Airtable (${source})...</div>`;
    document.getElementById('candidate-details').innerHTML = '<p class="empty-state">Loading candidates...</p>';
}

function showErrorState(message) {
    const listElement = document.getElementById('candidate-list');
    listElement.innerHTML = `
        <div class="error-state">
            <p>Failed to load candidates</p>
            <small>${message}</small>
            <button onclick="retryLoad()" class="retry-btn">Retry</button>
        </div>
    `;
    document.getElementById('candidate-details').innerHTML = `
        <div class="error-state">
            <h3>Configuration Required</h3>
            <p>You can configure Airtable in two ways:</p>
            <h4 style="margin-top: 16px;">Option 1: Use Settings (Browser)</h4>
            <p>Click the <strong>⚙️ Settings</strong> button in the header to enter your Airtable credentials. They'll be stored securely in your browser.</p>
            <h4 style="margin-top: 16px;">Option 2: Use Server (.env file)</h4>
            <p>Create a <code>.env</code> file with:</p>
            <ul>
                <li><code>AIRTABLE</code> - Your Airtable personal access token</li>
                <li><code>AIRTABLE_BASE_ID</code> - Your Airtable base ID</li>
                <li><code>AIRTABLE_TABLE_NAME</code> - Your table name</li>
            </ul>
            <p>Then restart the server with <code>npm start</code></p>
        </div>
    `;
}

async function retryLoad() {
    showLoadingState();
    try {
        await loadCandidatesFromAPI();
    } catch (error) {
        console.error('Failed to load candidates:', error);
        showErrorState(error.message);
    }
}

async function loadCandidatesFromAPI(offset = null) {
    let data;
    
    // Check if browser settings are configured
    if (hasValidSettings()) {
        console.log('Using browser-side Airtable connection');
        data = await fetchFromAirtableDirect(offset);
    } else {
        // Fall back to server API
        console.log('Using server-side Airtable connection');
        const url = offset ? `/api/candidates?offset=${encodeURIComponent(offset)}` : '/api/candidates';
        const response = await fetch(url);
        data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message || data.error || 'Unknown error');
        }
    }
    
    if (offset) {
        // Appending more candidates
        candidates = [...candidates, ...data.candidates];
    } else {
        // Initial load
        candidates = data.candidates;
    }
    
    nextOffset = data.offset;
    hasMoreCandidates = data.hasMore;
    
    const source = hasValidSettings() ? 'browser' : 'server';
    console.log(`Loaded ${data.candidates.length} candidates via ${source} (total: ${candidates.length}, hasMore: ${hasMoreCandidates})`);
    
    // Now initialize the rest of the app
    loadStatuses();
    loadHistory();
    loadFlags();
    loadHiddenCandidates();
    hideAirtableRejected(); // Auto-hide candidates with Rejection status from Airtable
    loadAIScores();
    renderCandidateList();
    updateStats();
    
    if (candidates.length > 0 && !currentCandidateId) {
        selectCandidate(candidates[0].id);
    } else if (candidates.length === 0) {
        document.getElementById('candidate-details').innerHTML = '<p class="empty-state">No candidates found in Airtable</p>';
    }
}

async function loadMoreCandidates() {
    if (isLoadingMore || !hasMoreCandidates || !nextOffset) return;
    
    isLoadingMore = true;
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
        loadMoreBtn.disabled = true;
        loadMoreBtn.innerHTML = '<span class="loading-spinner"></span> Loading...';
    }
    
    try {
        await loadCandidatesFromAPI(nextOffset);
        // Scroll to bottom of candidate list
        const list = document.getElementById('candidate-list');
        list.scrollTop = list.scrollHeight;
    } catch (error) {
        console.error('Failed to load more candidates:', error);
        if (loadMoreBtn) {
            loadMoreBtn.innerHTML = 'Error loading - Click to retry';
            loadMoreBtn.disabled = false;
        }
    } finally {
        isLoadingMore = false;
    }
}

function calculateAge(birthday) {
    if (!birthday) return '';
    const birthDate = new Date(birthday);
    if (isNaN(birthDate.getTime())) return '';
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}

function normalizeStage(stage) {
    if (!stage) return 'Stage 1: Review';
    // Convert old values
    if (stage === 'pending') return 'Stage 1: Review';
    if (stage === 'interview') return 'Stage 2: Interview';
    if (stage === 'done') return 'Rejection';
    // Normalize Stage 1 variations
    if (stage === 'Stage 1' || stage.toLowerCase() === 'stage 1' || stage === 'Stage 1: Application Review') return 'Stage 1: Review';
    // Normalize Stage 2 variations
    if (stage === 'Stage 2' || stage.toLowerCase() === 'stage 2') return 'Stage 2: Interview';
    return stage;
}

function loadStatuses() {
    const saved = localStorage.getItem('zfellows-statuses');
    if (saved) {
        const savedStatuses = JSON.parse(saved);
        // Merge saved statuses with Airtable stage values, normalizing all values
        candidateStatuses = candidates.reduce((acc, c) => {
            let status = normalizeStage(savedStatuses[c.id] || c.stage);
            return { ...acc, [c.id]: status };
        }, {});
        // Save the migrated statuses
        saveStatuses();
    } else {
        // Use Airtable stage values as defaults
        candidateStatuses = candidates.reduce((acc, c) => ({...acc, [c.id]: normalizeStage(c.stage)}), {});
    }
}

function saveStatuses() {
    localStorage.setItem('zfellows-statuses', JSON.stringify(candidateStatuses));
}

function loadHistory() {
    const saved = localStorage.getItem('zfellows-history');
    if (saved) statusHistory = JSON.parse(saved);
}

function saveHistory() {
    localStorage.setItem('zfellows-history', JSON.stringify(statusHistory));
}

function loadFlags() {
    flaggedCandidates.clear();
    
    // Find candidates with the flag set from Airtable
    const flagged = candidates.filter(c => c.flag);
    
    if (flagged.length > 0) {
        // Sort by createdTime descending to get the "latest" person
        flagged.sort((a, b) => {
            return new Date(b.createdTime || 0).getTime() - new Date(a.createdTime || 0).getTime();
        });
        
        // Only keep the latest one flagged locally
        const latestFlagged = flagged[0];
        flaggedCandidates.add(latestFlagged.id);
        
        console.log(`Loaded flag for ${latestFlagged.firstName} ${latestFlagged.lastName} from Airtable`);
    }
}

function loadHiddenCandidates() {
    const saved = localStorage.getItem('zfellows-hidden');
    if (saved) hiddenCandidates = new Set(JSON.parse(saved));
}

function saveHiddenCandidates() {
    localStorage.setItem('zfellows-hidden', JSON.stringify([...hiddenCandidates]));
}

// Automatically hide candidates that have Rejection status from Airtable
function hideAirtableRejected() {
    let count = 0;
    candidates.forEach(c => {
        const status = getStatus(c.id);
        if (status && status.toLowerCase().includes('reject') && !hiddenCandidates.has(c.id)) {
            hiddenCandidates.add(c.id);
            count++;
        }
    });
    if (count > 0) {
        saveHiddenCandidates();
        console.log(`✓ Auto-hid ${count} candidates with Rejection status from Airtable`);
    }
}

// Hide candidate locally (mark as rejected without syncing to Airtable)
function hideCandidate(candidateId, skipHistory = false) {
    const oldStatus = candidateStatuses[candidateId];
    const newStatus = 'Rejection';
    
    if (!skipHistory && oldStatus !== newStatus) {
        statusHistory.push({ 
            candidateId, 
            oldStatus, 
            newStatus, 
            timestamp: Date.now(),
            wasHidden: !hiddenCandidates.has(candidateId) // Track if we're hiding
        });
        saveHistory();
        redoHistory = [];
    }
    
    candidateStatuses[candidateId] = newStatus;
    hiddenCandidates.add(candidateId);
    
    saveStatuses();
    saveHiddenCandidates();
    renderCandidateList();
    updateStats();
    if (candidateId === currentCandidateId) updateStatusBadge(newStatus);
    
    // Note: NO Airtable sync for local rejections
    console.log(`✓ Hidden candidate ${candidateId} locally (not synced to Airtable)`);
}

// Unhide a candidate (for undo)
function unhideCandidate(candidateId) {
    hiddenCandidates.delete(candidateId);
    saveHiddenCandidates();
}

function toggleShowHidden() {
    showHiddenToggle = !showHiddenToggle;
    renderCandidateList();
}

async function toggleFlag(candidateId, e) {
    if (e) e.stopPropagation();
    
    const previousFlaggedId = [...flaggedCandidates][0];
    const isFlagging = !flaggedCandidates.has(candidateId);
    
    // Optimistic local update
    flaggedCandidates.clear();
    if (isFlagging) {
        flaggedCandidates.add(candidateId);
    }
    renderCandidateList();
    
    // API Updates
    try {
        console.log(`Attempting to update flag for candidate ${candidateId} to ${isFlagging} (and unflagging others)`);

        // If there was a previously flagged person and it's different from the current one, unflag them
        if (previousFlaggedId && previousFlaggedId !== candidateId) {
            if (hasValidSettings()) {
                await updateAirtableDirect(previousFlaggedId, { 'Flag': false });
            } else {
                await updateAirtableViaServer(previousFlaggedId, { 'Flag': false });
            }
            
            // Update local candidate object
            const prevCandidate = candidates.find(c => c.id === previousFlaggedId);
            if (prevCandidate) prevCandidate.flag = false;
        }
        
        // Update the target candidate
        if (hasValidSettings()) {
            await updateAirtableDirect(candidateId, { 'Flag': isFlagging });
        } else {
            await updateAirtableViaServer(candidateId, { 'Flag': isFlagging });
        }
        
        // Update local candidate object
        const candidate = candidates.find(c => c.id === candidateId);
        if (candidate) candidate.flag = isFlagging;
        
    } catch (err) {
        console.error('Failed to update flag in Airtable:', err);
        // Revert local state
        flaggedCandidates.clear();
        if (previousFlaggedId) flaggedCandidates.add(previousFlaggedId);
        renderCandidateList();
        
        // Restore local candidate objects if needed (omitted for brevity, assume reload/refresh handles strict consistency or optimistic update is good enough)
        alert(`Failed to update flag in Airtable: ${err.message}. Changes reverted locally.`);
    }
}

function jumpToLeftToReview() {
    // Sort all candidates by time (newest first) to find most recent flagged
    const sorted = [...candidates].sort((a, b) => new Date(b.createdTime || 0) - new Date(a.createdTime || 0));
    const mostRecentFlagged = sorted.find(c => flaggedCandidates.has(c.id));
    if (!mostRecentFlagged) return;
    
    // Switch to oldest-first and select the most recent flagged candidate
    sortOrder = 'oldest';
    localStorage.setItem('zfellows-sort-order', sortOrder);
    updateSortOrderButton();
    renderCandidateList();
    
    selectCandidate(mostRecentFlagged.id);
    document.querySelector('.candidate-item.active')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function getStatus(candidateId) {
    return normalizeStage(candidateStatuses[candidateId]);
}

function getStageClass(stage) {
    if (!stage) return 'stage-none';
    const stageLower = stage.toLowerCase();
    if (stageLower.includes('reject')) return 'stage-rejected';
    if (stageLower.includes('stage 4') || stageLower.includes('onboard')) return 'stage-accepted';
    if (stageLower.includes('stage 3')) return 'stage-stage3';
    if (stageLower.includes('interview') || stageLower.includes('stage 2')) return 'stage-interview';
    if (stageLower.includes('waitlist')) return 'stage-waitlist';
    if (stageLower.includes('stage 1')) return 'stage-review';
    return 'stage-default';
}

function setStatus(candidateId, status, skipHistory = false) {
    const oldStatus = candidateStatuses[candidateId];
    if (!skipHistory && oldStatus !== status) {
        statusHistory.push({ candidateId, oldStatus, newStatus: status, timestamp: Date.now() });
        saveHistory();
        // Clear redo history when a new action is performed
        redoHistory = [];
    }
    candidateStatuses[candidateId] = status;
    saveStatuses();
    
    // If status is changing away from Rejection, unhide the candidate
    if (hiddenCandidates.has(candidateId) && !status.toLowerCase().includes('reject')) {
        unhideCandidate(candidateId);
        console.log(`✓ Unhid candidate ${candidateId} (status changed from Rejection)`);
    }
    
    renderCandidateList();
    updateStats();
    if (candidateId === currentCandidateId) updateStatusBadge(status);
    
    // Cancel any existing pending timer for this candidate
    if (pendingTimers[candidateId]) {
        clearTimeout(pendingTimers[candidateId].timerId);
        clearInterval(pendingTimers[candidateId].intervalId);
        delete pendingTimers[candidateId];
    }
    
    // Delay Airtable sync by 5 seconds with timer
    const endTime = Date.now() + 5000;
    const intervalId = setInterval(() => renderCandidateList(), 1000);
    const timerId = setTimeout(() => {
        clearInterval(intervalId);
        delete pendingTimers[candidateId];
        renderCandidateList();
        updateAirtableStage(candidateId, status).catch(err => {
            console.error('Failed to sync to Airtable:', err.message);
        });
    }, 5000);
    pendingTimers[candidateId] = { timerId, intervalId, endTime, status };
}

// Map our internal status names to Airtable's Stage field values
function mapStatusToAirtableStage(status) {
    const mapping = {
        'Stage 1: Review': 'Stage 1: Application Review',
        'Stage 2: Interview': 'Stage 2: Interview',
        'Rejection': 'Rejection',
        'Stage 3: Acceptance': 'Stage 3: Acceptance',
        'Stage 4: Fellowship Onboarding': 'Stage 4: Fellowship Onboarding'
    };
    return mapping[status] || status;
}

async function updateAirtableStage(recordId, status) {
    const airtableStage = mapStatusToAirtableStage(status);
    
    if (hasValidSettings()) {
        // Browser-side update
        await updateAirtableDirect(recordId, { 'Stage': airtableStage });
    } else {
        // Server-side update
        await updateAirtableViaServer(recordId, { 'Stage': airtableStage });
    }
}

async function updateAirtableDirect(recordId, fields) {
    const settings = getAirtableSettings();
    if (!settings) {
        throw new Error('Airtable settings not configured');
    }
    
    const { token, baseId, tableName } = settings;
    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${recordId}`;
    
    const response = await fetch(url, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields })
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Airtable update failed: ${response.status} - ${errorData.error?.message || response.statusText}`);
    }
    
    console.log(`✓ Updated Airtable record ${recordId}: Stage = "${fields.Stage}"`);
    return await response.json();
}

async function updateAirtableViaServer(recordId, fields) {
    const response = await fetch('/api/candidates/update', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ recordId, fields })
    });
    
    const data = await response.json();
    
    if (!data.success) {
        throw new Error(data.error || 'Server update failed');
    }
    
    console.log(`✓ Updated Airtable record ${recordId} via server: Stage = "${fields.Stage}"`);
    return data;
}

function undoLastMove() {
    if (!statusHistory.length) return;
    const lastAction = statusHistory.pop();
    saveHistory();
    // Push to redo stack
    redoHistory.push(lastAction);
    candidateStatuses[lastAction.candidateId] = lastAction.oldStatus;
    saveStatuses();
    
    // Cancel pending Airtable sync if exists, otherwise sync the undo
    if (pendingTimers[lastAction.candidateId]) {
        clearTimeout(pendingTimers[lastAction.candidateId].timerId);
        clearInterval(pendingTimers[lastAction.candidateId].intervalId);
        delete pendingTimers[lastAction.candidateId];
    } else {
        // Timer already fired, sync the restored status to Airtable
        updateAirtableStage(lastAction.candidateId, lastAction.oldStatus).catch(err => {
            console.error('Failed to sync undo to Airtable:', err.message);
        });
    }
    
    // If this action hid the candidate, unhide it
    if (lastAction.wasHidden) {
        unhideCandidate(lastAction.candidateId);
    }
    
    selectCandidate(lastAction.candidateId);
    renderCandidateList();
    updateStats();
}

function redoLastMove() {
    if (!redoHistory.length) return;
    const lastRedo = redoHistory.pop();
    // Push back to history stack
    statusHistory.push(lastRedo);
    saveHistory();
    candidateStatuses[lastRedo.candidateId] = lastRedo.newStatus;
    saveStatuses();
    
    // If this action originally hid the candidate, re-hide it
    if (lastRedo.wasHidden) {
        hiddenCandidates.add(lastRedo.candidateId);
        saveHiddenCandidates();
    }
    
    selectCandidate(lastRedo.candidateId);
    renderCandidateList();
    updateStats();
}

function loadZoomLevel() {
    const saved = localStorage.getItem('zfellows-zoom');
    if (saved) {
        zoomLevel = parseInt(saved);
        applyZoomLevel();
    }
}

function applyZoomLevel() {
    document.documentElement.style.setProperty('--content-font-size', `${fontSizes[zoomLevel + 2]}px`);
}

function changeZoom(delta) {
    const newLevel = zoomLevel + delta;
    if (newLevel >= -2 && newLevel <= 2) {
        zoomLevel = newLevel;
        applyZoomLevel();
        localStorage.setItem('zfellows-zoom', zoomLevel.toString());
    }
}

function loadDarkMode() {
    if (localStorage.getItem('zfellows-darkmode') === 'true') {
        document.body.classList.add('dark-mode');
        updateDarkModeButton();
    }
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('zfellows-darkmode', isDark.toString());
    updateDarkModeButton();
}

function updateDarkModeButton() {
    const btn = document.getElementById('dark-mode-toggle');
    const isDark = document.body.classList.contains('dark-mode');
    btn.textContent = isDark ? '☀️' : '🌙';
    btn.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
}

function toggleSortOrder() {
    sortOrder = sortOrder === 'newest' ? 'oldest' : 'newest';
    localStorage.setItem('zfellows-sort-order', sortOrder);
    updateSortOrderButton();
    renderCandidateList();
}

function loadSortOrder() {
    const saved = localStorage.getItem('zfellows-sort-order');
    if (saved) {
        sortOrder = saved;
    }
    updateSortOrderButton();
}

function updateSortOrderButton() {
    const btn = document.getElementById('sort-order-toggle');
    if (sortOrder === 'newest') {
        btn.textContent = '↓ Newest';
        btn.title = 'Showing newest first (click for oldest first)';
    } else {
        btn.textContent = '↑ Oldest';
        btn.title = 'Showing oldest first (click for newest first)';
    }
}

function handleSearch(e) {
    const query = e.target.value.toLowerCase().trim();
    if (!query) return;
    
    // Find first matching candidate
    const match = candidates.find(c => {
        const fullName = `${c.firstName} ${c.lastName}`.toLowerCase();
        const company = (c.company || '').toLowerCase();
        const email = (c.email || '').toLowerCase();
        return fullName.includes(query) || 
               company.includes(query) || 
               email.includes(query);
    });
    
    if (match) {
        selectCandidate(match.id);
        // Scroll to the candidate in the list
        const candidateElement = document.querySelector('.candidate-item.active');
        if (candidateElement) {
            candidateElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

function renderCandidateList() {
    const listElement = document.getElementById('candidate-list');
    listElement.innerHTML = '';
    
    // Sort by createdTime based on sortOrder
    const sortedCandidates = [...candidates].sort((a, b) => {
        const timeA = new Date(a.createdTime || 0).getTime();
        const timeB = new Date(b.createdTime || 0).getTime();
        return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
    });
    
    // Separate visible and hidden candidates
    const visibleCandidates = sortedCandidates.filter(c => !hiddenCandidates.has(c.id));
    const hiddenCandidatesList = sortedCandidates.filter(c => hiddenCandidates.has(c.id));
    
    // Render visible candidates
    visibleCandidates.forEach(candidate => {
        const stage = getStatus(candidate.id);
        const stageClass = getStageClass(stage);
        const isActive = currentCandidateId === candidate.id;
        const isFlagged = flaggedCandidates.has(candidate.id);
        const pending = pendingTimers[candidate.id];
        const timerHtml = pending ? `<span class="pending-timer">${Math.ceil((pending.endTime - Date.now()) / 1000)}s</span>` : '';
        const item = document.createElement('div');
        item.className = `candidate-item ${isActive ? 'active' : ''}`;
        item.onclick = () => selectCandidate(candidate.id);
        item.innerHTML = `
            <div class="candidate-item-header">
                <div class="candidate-item-name">${candidate.firstName} ${candidate.lastName}${timerHtml}</div>
                <span class="flag-btn ${isFlagged ? 'flagged' : ''}" style="display:${isActive || isFlagged ? 'inline' : 'none'}" onclick="toggleFlag('${candidate.id}', event)">⚑</span>
            </div>
            <div class="candidate-item-footer">
                <div class="candidate-item-project">${candidate.company}</div>
                <div class="candidate-item-status ${stageClass}">${stage}</div>
            </div>
        `;
        listElement.appendChild(item);
    });
    
    // Add "Load More" button if there are more candidates
    if (hasMoreCandidates) {
        const loadMoreContainer = document.createElement('div');
        loadMoreContainer.className = 'load-more-container';
        loadMoreContainer.innerHTML = `
            <button id="load-more-btn" class="load-more-btn" onclick="loadMoreCandidates()">
                Load More Candidates
            </button>
        `;
        listElement.appendChild(loadMoreContainer);
    }
    
    // Add "Show hidden" toggle if there are hidden candidates
    if (hiddenCandidatesList.length > 0) {
        const hiddenToggle = document.createElement('div');
        hiddenToggle.className = 'hidden-toggle-container';
        hiddenToggle.innerHTML = `
            <button class="hidden-toggle-btn ${showHiddenToggle ? 'active' : ''}" onclick="toggleShowHidden()">
                ${showHiddenToggle ? '▼' : '▶'} Hidden (${hiddenCandidatesList.length})
            </button>
        `;
        listElement.appendChild(hiddenToggle);
        
        // Render hidden candidates if toggle is on
        if (showHiddenToggle) {
            const hiddenSection = document.createElement('div');
            hiddenSection.className = 'hidden-candidates-section';
            
            hiddenCandidatesList.forEach(candidate => {
                const stage = getStatus(candidate.id);
                const stageClass = getStageClass(stage);
                const isActive = currentCandidateId === candidate.id;
                const isFlagged = flaggedCandidates.has(candidate.id);
                const item = document.createElement('div');
                item.className = `candidate-item hidden-candidate ${isActive ? 'active' : ''}`;
                item.onclick = () => selectCandidate(candidate.id);
                item.innerHTML = `
                    <div class="candidate-item-header">
                        <div class="candidate-item-name">${candidate.firstName} ${candidate.lastName}</div>
                        <span class="flag-btn ${isFlagged ? 'flagged' : ''}" style="display:${isActive || isFlagged ? 'inline' : 'none'}" onclick="toggleFlag('${candidate.id}', event)">⚑</span>
                    </div>
                    <div class="candidate-item-footer">
                        <div class="candidate-item-project">${candidate.company}</div>
                        <div class="candidate-item-status ${stageClass}">${stage}</div>
                    </div>
                `;
                hiddenSection.appendChild(item);
            });
            
            listElement.appendChild(hiddenSection);
        }
    }
}

function updateStats() {
    const stats = { stage1: 0, stage2: 0, rejected: 0 };
    Object.values(candidateStatuses).forEach(status => {
        const stageLower = (status || '').toLowerCase();
        if (stageLower.includes('stage 1') || stageLower.includes('review')) {
            stats.stage1++;
        } else if (stageLower.includes('stage 2') || stageLower.includes('interview')) {
            stats.stage2++;
        } else if (stageLower.includes('reject')) {
            stats.rejected++;
        }
    });
    document.getElementById('stage1-count').textContent = stats.stage1;
    document.getElementById('stage2-count').textContent = stats.stage2;
    document.getElementById('rejected-count').textContent = stats.rejected;
}

function selectCandidate(candidateId) {
    currentCandidateId = candidateId;
    const candidate = candidates.find(c => c.id === candidateId);
    if (!candidate) return;
    
    const age = calculateAge(candidate.birthday);
    const ageString = age ? ` (${age})` : '';
    document.getElementById('candidate-name').textContent = `${candidate.firstName} ${candidate.lastName}${ageString}`;
    
    updateStatusBadge(getStatus(candidateId));
    renderCandidateDetails(candidate);
    renderCandidateList();
}

function updateStatusBadge(stage) {
    const badge = document.getElementById('status-badge');
    const stageClass = getStageClass(stage);
    badge.className = `status-badge ${stageClass}`;
    badge.textContent = stage;
}

function renderCandidateDetails(c) {
    // Build Cory interview scores if any exist
    const coryScores = [];
    if (c.coryOverallScore) coryScores.push(`Overall: ${c.coryOverallScore}`);
    if (c.coryEnergy) coryScores.push(`Energy: ${c.coryEnergy}`);
    if (c.corySmart) coryScores.push(`Smart: ${c.corySmart}`);
    if (c.coryStorytelling) coryScores.push(`Storytelling: ${c.coryStorytelling}`);
    
    // Helper to format links with expand button - uses regex to find all URLs
    const formatLinks = (text) => {
        if (!text) return '';
        // Regex to match URLs - handles http(s)://, www., and bare domains
        // Matches: https://example.com, http://x.com, www.site.com, example.com, app.io/path
        const urlRegex = /(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9][-a-zA-Z0-9]*(?:\.[a-zA-Z]{2,})+(?:\/[^\s,<>)]*)?/gi;
        // Sites that block iframes
        const noExpandSites = ['linkedin', 'github', 'youtube', 'youtu.be', 'twitter', 'x.com', 'facebook', 'instagram', 'tiktok', 'medium', 'substack', 'notion.so', 'figma', 'dribbble', 'behance', 'pinterest', 'reddit', 'discord', 'slack', 'dropbox', 'google.com', 'docs.google', 'drive.google'];
        // Replace all URLs with clickable links + expand button (if allowed)
        const formatted = text.replace(urlRegex, (url, offset, string) => {
            // Don't linkify email addresses (domains preceded by @)
            if (offset > 0 && string[offset - 1] === '@') {
                return url;
            }

            // Don't linkify if match is part of an email address (e.g. "gmail.com" in "bob@gmail.com")
            // Check if there's an '@' symbol in the word preceding the match
            // Look backward from offset until we hit a space or start of string
            let i = offset - 1;
            while (i >= 0 && !/\s/.test(string[i])) {
                if (string[i] === '@') {
                    return url;
                }
                i--;
            }

            // Don't linkify if followed immediately by @ (local part of email)
            if (offset + url.length < string.length && string[offset + url.length] === '@') {
                return url;
            }

            // Ensure URL has protocol for href
            const href = url.match(/^https?:\/\//i) ? url : `https://${url}`;
            const urlLower = url.toLowerCase();
            const skipExpand = noExpandSites.some(site => urlLower.includes(site));
            if (skipExpand) {
                return `<a href="${href}" target="_blank">${url}</a>`;
            }
            const escapedUrl = href.replace(/'/g, "\\'");
            return `<a href="${href}" target="_blank">${url}</a><button class="expand-btn" data-url="${escapedUrl}" onclick="openIframePreview('${escapedUrl}')" onmouseenter="showMiniPreview(this)" onmouseleave="hideMiniPreview()">Expand</button>`;
        });
        // Convert newlines to <br> for display
        return formatted.replace(/\n/g, '<br>');
    };
    
    const sections = [
        ['Personal / Project Links', formatLinks(c.personalLinks)],
        ['Company / Project', c.company],
        ['Decision', c.decision],
        ...(coryScores.length ? [['Cory Interview Scores', coryScores.join(' | ')]] : []),
        ['School or Work', c.schoolOrWork],
        ['Project Description', c.projectDescription],
        ['Problem Solving', c.problemSolving],
        ['Expertise', c.expertise],
        ['Competitors & Understanding', c.competitors],
        ['Past Work', c.pastWork],
        ["What's Nerdy About You", c.nerdy],
        ['What Drives You', c.drives],
        ['Non-Traditional Background', c.nonTraditional],
        ['Risk or Challenge', c.riskOrChallenge],
        ['Website / Links', formatLinks(c.website)],
        ['Achievements', c.achievements],
        ['Video Introduction', c.videoLink ? `<a href="${c.videoLink}" target="_blank">${c.videoLink}</a>` : ''],
        ['Pitch Video', c.pitchVideo ? getYouTubeEmbedHtml(c.pitchVideo) : ''],
        ['Dream Co-founder', c.cofounder],
        ['How They Heard About Z Fellows', c.howHeard],
        ['Help Needed', c.helpNeeded],
        // Stage-related fields
        ['Stage 2 Calendar Link', c.stage2Calendar ? `<a href="${c.stage2Calendar}" target="_blank">${c.stage2Calendar}</a>` : ''],
        ['Stage 3 Schedule and Date', c.stage3Schedule],
        ['Stage 4 Onboarding Doc', c.stage4Onboarding],
        ['Upcoming Cohort Date', c.upcomingCohortDate],
        ['Waitlist Update', c.waitlistUpdate],
        // Contact info at bottom
        ['Email', c.email],
        ['Phone', c.phone],
    ];

    // Identify fields already displayed to avoid duplication
    const displayedFields = new Set([
        'id', 'airtableId', 'createdTime', 'aiScore', 'name', // Internal/System
        'firstName', 'lastName', // Header title
        'location', 'technical', 'previouslyApplied', // Header info
        'coryNotes', // Feedback section
        // Fields in sections array above:
        'personalLinks', 'company', 'decision', 
        'coryOverallScore', 'coryEnergy', 'corySmart', 'coryStorytelling',
        'schoolOrWork', 'projectDescription', 'problemSolving', 'expertise',
        'competitors', 'pastWork', 'nerdy', 'drives', 'nonTraditional',
        'riskOrChallenge', 'website', 'achievements', 'videoLink', 'pitchVideo',
        'cofounder', 'howHeard', 'helpNeeded',
        'stage2Calendar', 'stage3Schedule', 'stage4Onboarding', 
        'upcomingCohortDate', 'waitlistUpdate',
        'email', 'phone', 'stage'
    ]);

    // Find and add any remaining fields
    const extraFields = Object.keys(c)
        .filter(key => !displayedFields.has(key) && c[key] && typeof c[key] !== 'object');

    extraFields.forEach(key => {
        // Convert camelCase to Title Case
        const label = key
            .replace(/([A-Z])/g, ' $1') // Add space before capitals
            .replace(/^./, str => str.toUpperCase()); // Capitalize first letter
            
        // Add to sections
        sections.push([label, formatLinks(String(c[key]))]);
    });
    
    // Filter out empty sections
    const filteredSections = sections.filter(([title, content]) => content && String(content).trim());
    
    document.getElementById('candidate-details').innerHTML = `
        <div class="header-info">
            <div class="header-info-item"><span class="header-info-label">Location:</span><span class="header-info-value">${c.location}</span></div>
            <div class="header-info-item"><span class="header-info-label">Technical:</span><span class="header-info-value">${c.technical}</span></div>
            <div class="header-info-item"><span class="header-info-label">Previously Applied:</span><span class="header-info-value">${c.previouslyApplied}</span></div>
            <div class="header-info-item"><span class="header-info-label">School/Work:</span><span class="header-info-value">${c.schoolOrWork}</span></div>
            <div class="header-info-item"><span class="header-info-label">How heard about ZF:</span><span class="header-info-value">${c.howHeard}</span></div>
        </div>
        <div class="feedback-section">
            <label for="cory-notes-input">Feedback</label>
            <textarea id="cory-notes-input" placeholder="Add notes...">${c.coryNotes || ''}</textarea>
            <span class="save-status" id="save-status"></span>
        </div>
        <div class="details-grid">
            ${filteredSections.map(([title, content]) => `
                <div class="detail-section">
                    <h3>${title}</h3>
                    <p>${content}</p>
                </div>
            `).join('')}
        </div>
    `;
    
    // Setup auto-save for notes
    const notesInput = document.getElementById('cory-notes-input');
    let saveTimeout;
    notesInput.addEventListener('input', () => {
        clearTimeout(saveTimeout);
        document.getElementById('save-status').textContent = '';
        saveTimeout = setTimeout(() => saveCoryNotes(c.id, notesInput.value), 800);
    });
}

async function saveCoryNotes(candidateId, notes) {
    const statusEl = document.getElementById('save-status');
    statusEl.textContent = 'Saving...';
    statusEl.className = 'save-status';
    
    try {
        if (hasValidSettings()) {
            await updateAirtableDirect(candidateId, { 'Cory notes': notes });
        } else {
            await updateAirtableViaServer(candidateId, { 'Cory notes': notes });
        }
        // Update local candidate data
        const candidate = candidates.find(c => c.id === candidateId);
        if (candidate) candidate.coryNotes = notes;
        
        statusEl.textContent = 'Saved';
        statusEl.className = 'save-status saved';
        setTimeout(() => { statusEl.textContent = ''; }, 2000);
    } catch (err) {
        console.error('Failed to save notes:', err);
        statusEl.textContent = 'Failed to save';
        statusEl.className = 'save-status error';
    }
}

async function checkAndMoveFlag() {
    if (flaggedCandidates.size === 0) return;
    const flaggedId = [...flaggedCandidates][0];
    
    // Sort all candidates (ignoring hidden status for index calculation unless shown)
    const sorted = [...candidates].sort((a, b) => {
        const timeA = new Date(a.createdTime || 0).getTime();
        const timeB = new Date(b.createdTime || 0).getTime();
        return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
    });
    
    const flaggedIndex = sorted.findIndex(c => c.id === flaggedId);
    if (flaggedIndex === -1) return;
    
    // Find the next candidate that would be visited (the next visible one)
    let nextVisibleId = null;
    
    for (let i = flaggedIndex + 1; i < sorted.length; i++) {
        const c = sorted[i];
        if (showHiddenToggle || !hiddenCandidates.has(c.id)) {
            nextVisibleId = c.id;
            break;
        }
    }
    
    if (nextVisibleId && nextVisibleId === currentCandidateId) {
        // Move flag to current candidate (which is nextVisibleId)
        await toggleFlag(currentCandidateId);
    }
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        const key = e.key.toLowerCase();
        // Shift+Z for redo
        if (key === 'z' && e.shiftKey && !e.ctrlKey) {
            e.preventDefault();
            return redoLastMove();
        }
        // Z for undo
        if (key === 'z' && !e.ctrlKey && !e.shiftKey) return undoLastMove();
        // J for next app, K for previous app
        if (key === 'j') return navigateToAdjacentCandidate(1);
        if (key === 'k') return navigateToAdjacentCandidate(-1);
        // F to focus feedback field
        if (key === 'f') {
            e.preventDefault();
            const notesInput = document.getElementById('cory-notes-input');
            if (notesInput) notesInput.focus();
            return;
        }
        // O to toggle all link previews
        if (key === 'o') {
            if (document.querySelector('.mini-preview')) return hideMiniPreview(true);
            document.querySelectorAll('.expand-btn').forEach(btn => showMiniPreview(btn, true));
            return;
        }
        // Escape closes mini previews
        if (e.key === 'Escape') return hideMiniPreview(true);
        if (!currentCandidateId) return;
        // Stage shortcuts: I = Interview, E = Rejection (local only), P = Stage 1: Review
        if (key === 'e') {
            // E = Local rejection (hide candidate, don't sync to Airtable)
            hideCandidate(currentCandidateId);
            moveToNextCandidate();
            checkAndMoveFlag(); // Move flag after hiding/moving so it lands on the next VISIBLE candidate
            return;
        }
        const actions = { 
            i: 'Stage 2: Interview', 
            p: 'Stage 1: Review' 
        };
        if (actions[key]) {
            setStatus(currentCandidateId, actions[key]);
            moveToNextCandidate();
            checkAndMoveFlag();
        }
    });
}

function navigateToAdjacentCandidate(direction) {
    // Get the sorted candidates list (same order as displayed in sidebar)
    let sortedCandidates = [...candidates].sort((a, b) => {
        const timeA = new Date(a.createdTime || 0).getTime();
        const timeB = new Date(b.createdTime || 0).getTime();
        return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
    });
    
    // Filter out hidden candidates unless showHiddenToggle is on
    if (!showHiddenToggle) {
        sortedCandidates = sortedCandidates.filter(c => !hiddenCandidates.has(c.id));
    }
    
    if (sortedCandidates.length === 0) return;
    
    // Find current index in sorted list
    const currentIndex = sortedCandidates.findIndex(c => c.id === currentCandidateId);
    
    // Calculate new index with wrapping
    let newIndex;
    if (currentIndex === -1) {
        // No candidate selected, select first or last based on direction
        newIndex = direction > 0 ? 0 : sortedCandidates.length - 1;
    } else {
        newIndex = currentIndex + direction;
        // Wrap around
        if (newIndex < 0) newIndex = sortedCandidates.length - 1;
        if (newIndex >= sortedCandidates.length) newIndex = 0;
    }
    
    selectCandidate(sortedCandidates[newIndex].id);
    
    // Scroll the selected candidate into view
    const candidateElement = document.querySelector('.candidate-item.active');
    if (candidateElement) {
        candidateElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function moveToNextCandidate() {
    // Sort candidates to match visual order
    const sortedCandidates = [...candidates].sort((a, b) => {
        const timeA = new Date(a.createdTime || 0).getTime();
        const timeB = new Date(b.createdTime || 0).getTime();
        return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
    });

    const currentIndex = sortedCandidates.findIndex(c => c.id === currentCandidateId);
    if (currentIndex === -1) return;

    // Helper to check if candidate is valid next target
    const isStage1AndVisible = (c) => {
        if (hiddenCandidates.has(c.id)) return false;
        const status = getStatus(c.id).toLowerCase();
        return status.includes('stage 1') || status.includes('review');
    };

    // Helper to select and scroll
    const selectAndScroll = (id) => {
        selectCandidate(id);
        const el = document.querySelector('.candidate-item.active');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    // 1. Look for next Stage 1 candidate (downwards)
    for (let i = currentIndex + 1; i < sortedCandidates.length; i++) {
        if (isStage1AndVisible(sortedCandidates[i])) {
            return selectAndScroll(sortedCandidates[i].id);
        }
    }

    // 2. Wrap around: Look for Stage 1 candidate from top (upwards)
    for (let i = 0; i < currentIndex; i++) {
        if (isStage1AndVisible(sortedCandidates[i])) {
            return selectAndScroll(sortedCandidates[i].id);
        }
    }

    // 3. If no Stage 1 candidates found, just go to next visible candidate (downwards)
    for (let i = currentIndex + 1; i < sortedCandidates.length; i++) {
        if (!hiddenCandidates.has(sortedCandidates[i].id)) {
            return selectAndScroll(sortedCandidates[i].id);
        }
    }
}

function loadSidebarWidth() {
    const saved = localStorage.getItem('zfellows-sidebar-width');
    if (saved) {
        const width = parseInt(saved);
        document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
    }
}

function setupResizeHandle() {
    const resizeHandle = document.getElementById('resize-handle');
    const resetBtn = document.getElementById('resize-reset-btn');
    const sidebar = document.getElementById('sidebar');
    const container = document.querySelector('.container');
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    // Reset button click handler
    resetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        document.documentElement.style.setProperty('--sidebar-width', '320px');
        localStorage.setItem('zfellows-sidebar-width', '320');
    });

    resizeHandle.addEventListener('mousedown', (e) => {
        // Don't start resizing if clicking the reset button
        if (e.target === resetBtn) return;
        
        isResizing = true;
        startX = e.clientX;
        startWidth = sidebar.offsetWidth;
        resizeHandle.classList.add('resizing');
        container.classList.add('resizing');
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        
        const delta = e.clientX - startX;
        const newWidth = startWidth + delta;
        
        // Apply min/max constraints
        const minWidth = 200;
        const maxWidth = 600;
        const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
        
        document.documentElement.style.setProperty('--sidebar-width', `${constrainedWidth}px`);
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizeHandle.classList.remove('resizing');
            container.classList.remove('resizing');
            
            // Save the new width
            const currentWidth = sidebar.offsetWidth;
            localStorage.setItem('zfellows-sidebar-width', currentWidth.toString());
        }
    });
}

// YouTube embed helper
function getYouTubeEmbedHtml(url) {
    if (!url) return '';
    // Match various YouTube URL formats
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            const videoId = match[1];
            const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
            // Using youtube-nocookie.com and removing specific referrer policies often fixes local/black screen issues
            return `
                <div class="video-embed-container">
                    <iframe width="100%" height="315" src="https://www.youtube-nocookie.com/embed/${videoId}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="border-radius:8px;margin-top:8px;"></iframe>
                    <div style="margin-top: 8px; font-size: 0.9em;">
                        <a href="${cleanUrl}" target="_blank" rel="noopener noreferrer">${cleanUrl}</a>
                    </div>
                </div>`;
        }
    }
    // Not a YouTube link, return regular link
    return `<a href="${url}" target="_blank">${url}</a>`;
}

// Iframe preview functions
function openIframePreview(url) {
    // Remove existing preview if any
    closeIframePreview();
    
    const overlay = document.createElement('div');
    overlay.id = 'iframe-preview-overlay';
    overlay.className = 'iframe-preview-overlay';
    overlay.onclick = (e) => {
        if (e.target === overlay) closeIframePreview();
    };
    
    overlay.innerHTML = `
        <div class="iframe-preview-container">
            <div class="iframe-preview-header">
                <span class="iframe-preview-url">${url}</span>
                <div class="iframe-preview-actions">
                    <a href="${url}" target="_blank" class="iframe-open-btn">Open in New Tab</a>
                    <button class="iframe-close-btn" onclick="closeIframePreview()">✕</button>
                </div>
            </div>
            <iframe src="${url}" class="iframe-preview-frame"></iframe>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Close on Escape key
    document.addEventListener('keydown', handleIframeEscape);
}

function closeIframePreview() {
    const overlay = document.getElementById('iframe-preview-overlay');
    if (overlay) {
        overlay.remove();
        document.removeEventListener('keydown', handleIframeEscape);
    }
}

function handleIframeEscape(e) {
    if (e.key === 'Escape') {
        closeIframePreview();
    }
}

// Mini preview on hover
let miniPreviewTimeout;
let nextPreviewLeft = 0;
function showMiniPreview(btn, multi) {
    clearTimeout(miniPreviewTimeout);
    if (!multi) { hideMiniPreview(true); nextPreviewLeft = 0; }
    const url = btn.dataset.url;
    const rect = btn.getBoundingClientRect();
    const preview = document.createElement('div');
    preview.className = 'mini-preview';
    preview.innerHTML = `<iframe src="${url}"></iframe>`;
    // Avoid overlap: use max of button position or next available slot
    const left = Math.max(rect.left, nextPreviewLeft);
    preview.style.cssText = `position:fixed;top:${rect.bottom+5}px;left:${left}px;width:400px;height:300px;z-index:9999;background:#fff;border:1px solid #ccc;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.3);overflow:hidden;`;
    preview.querySelector('iframe').style.cssText = 'width:100%;height:100%;border:none;';
    preview.onmouseenter = () => clearTimeout(miniPreviewTimeout);
    preview.onmouseleave = () => { if (!multi) hideMiniPreview(); };
    document.body.appendChild(preview);
    nextPreviewLeft = left + 410; // 400px width + 10px gap
}

function hideMiniPreview(immediate) {
    clearTimeout(miniPreviewTimeout);
    nextPreviewLeft = 0;
    const remove = () => document.querySelectorAll('.mini-preview').forEach(el => el.remove());
    if (immediate) return remove();
    miniPreviewTimeout = setTimeout(remove, 100);
}

// Expose candidates globally for aiScoring.js
function getCandidates() {
    return candidates;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
