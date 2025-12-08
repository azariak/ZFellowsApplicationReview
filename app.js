let currentCandidateId = null;
let candidateStatuses = {};
let statusHistory = [];
let redoHistory = [];
let zoomLevel = 0;
let candidates = []; // Will be populated from API
let nextOffset = null; // For pagination
let hasMoreCandidates = false;
let isLoadingMore = false;
const fontSizes = [10, 11, 13, 15, 17];

async function init() {
    loadZoomLevel();
    loadDarkMode();
    loadSidebarWidth();
    setupKeyboardShortcuts();
    setupResizeHandle();
    document.getElementById('zoom-in').addEventListener('click', () => changeZoom(1));
    document.getElementById('zoom-out').addEventListener('click', () => changeZoom(-1));
    document.getElementById('dark-mode-toggle').addEventListener('click', toggleDarkMode);
    
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

function showLoadingState() {
    const listElement = document.getElementById('candidate-list');
    listElement.innerHTML = '<div class="loading-state">Loading candidates from Airtable...</div>';
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
            <p>Please ensure your <code>.env</code> file contains:</p>
            <ul>
                <li><code>AIRTABLE</code> - Your Airtable personal access token</li>
                <li><code>AIRTABLE_BASE_ID</code> - Your Airtable base ID</li>
                <li><code>AIRTABLE_TABLE_NAME</code> - Your table name (e.g., "Applications")</li>
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
    const url = offset ? `/api/candidates?offset=${encodeURIComponent(offset)}` : '/api/candidates';
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.success) {
        throw new Error(data.message || data.error || 'Unknown error');
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
    
    console.log(`Loaded ${data.candidates.length} candidates from Airtable (total: ${candidates.length}, hasMore: ${hasMoreCandidates})`);
    
    // Now initialize the rest of the app
    loadStatuses();
    loadHistory();
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

function normalizeStage(stage) {
    if (!stage) return 'Stage 1: Review';
    // Convert old values
    if (stage === 'pending') return 'Stage 1: Review';
    if (stage === 'interview') return 'Stage 2: Interview';
    if (stage === 'done') return 'Rejection';
    // Normalize Stage 1 variations
    if (stage === 'Stage 1' || stage.toLowerCase() === 'stage 1') return 'Stage 1: Review';
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
    renderCandidateList();
    updateStats();
    if (candidateId === currentCandidateId) updateStatusBadge(status);
}

function undoLastMove() {
    if (!statusHistory.length) return;
    const lastAction = statusHistory.pop();
    saveHistory();
    // Push to redo stack
    redoHistory.push(lastAction);
    candidateStatuses[lastAction.candidateId] = lastAction.oldStatus;
    saveStatuses();
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

function renderCandidateList() {
    const listElement = document.getElementById('candidate-list');
    listElement.innerHTML = '';
    
    [...candidates].sort((a, b) => getAIScore(b.id) - getAIScore(a.id)).forEach(candidate => {
        const stage = getStatus(candidate.id);
        const stageClass = getStageClass(stage);
        const score = getAIScore(candidate.id);
        const item = document.createElement('div');
        item.className = `candidate-item ${currentCandidateId === candidate.id ? 'active' : ''}`;
        item.onclick = () => selectCandidate(candidate.id);
        item.innerHTML = `
            <div class="candidate-item-header">
                <div class="candidate-item-name">${candidate.firstName} ${candidate.lastName}</div>
                <div class="ai-score-badge">${score}</div>
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
    document.getElementById('candidate-name').textContent = `${candidate.firstName} ${candidate.lastName}`;
    updateStatusBadge(getStatus(candidateId));
    updateHeaderInfo(candidate);
    renderCandidateDetails(candidate);
    renderCandidateList();
}

function updateHeaderInfo(candidate) {
    document.getElementById('header-info').innerHTML = `
        <div class="header-info-item"><span class="header-info-label">Email:</span><span class="header-info-value">${candidate.email}</span></div>
        <div class="header-info-item"><span class="header-info-label">Phone:</span><span class="header-info-value">${candidate.phone}</span></div>
        <div class="header-info-item"><span class="header-info-label">Birthday:</span><span class="header-info-value">${candidate.birthday}</span></div>
        <div class="header-info-item"><span class="header-info-label">Location:</span><span class="header-info-value">${candidate.location}</span></div>
        <div class="header-info-item"><span class="header-info-label">Technical:</span><span class="header-info-value">${candidate.technical}</span></div>
        <div class="header-info-item"><span class="header-info-label">Previously Applied:</span><span class="header-info-value">${candidate.previouslyApplied}</span></div>
    `;
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
    
    // Helper to format links
    const formatLinks = (text) => {
        if (!text) return '';
        return text.split(',').map(link => {
            const trimmed = link.trim();
            if (trimmed.startsWith('http')) {
                return `<a href="${trimmed}" target="_blank">${trimmed}</a>`;
            }
            return trimmed;
        }).join('<br>');
    };
    
    const sections = [
        ['Company / Project', c.company],
        ['Decision', c.decision],
        ...(coryScores.length ? [['Cory Interview Scores', coryScores.join(' | ')]] : []),
        ['Cory Notes', c.coryNotes],
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
        ['Pitch Video', c.pitchVideo ? `<a href="${c.pitchVideo}" target="_blank">${c.pitchVideo}</a>` : ''],
        ['Dream Co-founder', c.cofounder],
        ['How They Heard About Z Fellows', c.howHeard],
        ['Help Needed', c.helpNeeded],
        // Stage-related fields
        ['Stage 2 Calendar Link', c.stage2Calendar ? `<a href="${c.stage2Calendar}" target="_blank">${c.stage2Calendar}</a>` : ''],
        ['Stage 3 Schedule and Date', c.stage3Schedule],
        ['Stage 4 Onboarding Doc', c.stage4Onboarding],
        ['Upcoming Cohort Date', c.upcomingCohortDate],
        ['Waitlist Update', c.waitlistUpdate],
    ];
    
    // Filter out empty sections
    const filteredSections = sections.filter(([title, content]) => content && String(content).trim());
    
    document.getElementById('candidate-details').innerHTML = `
        <div class="details-grid">
            ${filteredSections.map(([title, content]) => `
                <div class="detail-section">
                    <h3>${title}</h3>
                    <p>${content}</p>
                </div>
            `).join('')}
        </div>
    `;
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
        if (!currentCandidateId) return;
        // Stage shortcuts: I = Interview, E = Rejection, P = Stage 1: Review
        const actions = { 
            i: 'Stage 2: Interview', 
            e: 'Rejection', 
            p: 'Stage 1: Review' 
        };
        if (actions[key]) {
            setStatus(currentCandidateId, actions[key]);
            moveToNextCandidate();
        }
    });
}

function moveToNextCandidate() {
    const currentIndex = candidates.findIndex(c => c.id === currentCandidateId);
    // Find next candidate in Stage 1: Review
    const isStage1 = (id) => {
        const status = getStatus(id).toLowerCase();
        return status.includes('stage 1') || status.includes('review');
    };
    for (let i = currentIndex + 1; i < candidates.length; i++) {
        if (isStage1(candidates[i].id)) return selectCandidate(candidates[i].id);
    }
    for (let i = 0; i < currentIndex; i++) {
        if (isStage1(candidates[i].id)) return selectCandidate(candidates[i].id);
    }
    if (currentIndex < candidates.length - 1) selectCandidate(candidates[currentIndex + 1].id);
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

// Expose candidates globally for aiScoring.js
function getCandidates() {
    return candidates;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
