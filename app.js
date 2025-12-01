// Application state
let currentCandidateId = null;
let candidateStatuses = {};
let statusHistory = []; // Track history for undo

// Initialize the app
function init() {
    loadStatuses();
    loadHistory();
    loadZoomLevel();
    loadDarkMode();
    loadAIScores(); // Load AI scores from aiScoring.js
    renderCandidateList();
    updateStats();
    setupKeyboardShortcuts();
    setupZoomControls();
    setupDarkModeToggle();
    
    // Select first candidate by default
    if (mockCandidates.length > 0) {
        selectCandidate(mockCandidates[0].id);
    }
}

// Zoom level management
let zoomLevel = 0; // -2 to +2
const fontSizes = [10, 11, 13, 15, 17]; // px values for each zoom level

function loadZoomLevel() {
    const saved = localStorage.getItem('zfellows-zoom');
    if (saved) {
        zoomLevel = parseInt(saved);
        applyZoomLevel();
    }
}

function saveZoomLevel() {
    localStorage.setItem('zfellows-zoom', zoomLevel.toString());
}

function applyZoomLevel() {
    const fontSize = fontSizes[zoomLevel + 2]; // +2 to convert -2..2 to 0..4 index
    document.documentElement.style.setProperty('--content-font-size', `${fontSize}px`);
}

function zoomIn() {
    if (zoomLevel < 2) {
        zoomLevel++;
        applyZoomLevel();
        saveZoomLevel();
    }
}

function zoomOut() {
    if (zoomLevel > -2) {
        zoomLevel--;
        applyZoomLevel();
        saveZoomLevel();
    }
}

function setupZoomControls() {
    document.getElementById('zoom-in').addEventListener('click', zoomIn);
    document.getElementById('zoom-out').addEventListener('click', zoomOut);
}

// Dark mode management
function loadDarkMode() {
    const darkMode = localStorage.getItem('zfellows-darkmode') === 'true';
    if (darkMode) {
        document.body.classList.add('dark-mode');
        updateDarkModeButton();
    }
}

function saveDarkMode(isDark) {
    localStorage.setItem('zfellows-darkmode', isDark.toString());
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    saveDarkMode(isDark);
    updateDarkModeButton();
}

function updateDarkModeButton() {
    const btn = document.getElementById('dark-mode-toggle');
    const isDark = document.body.classList.contains('dark-mode');
    btn.textContent = isDark ? '☀️' : '🌙';
    btn.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
}

function setupDarkModeToggle() {
    document.getElementById('dark-mode-toggle').addEventListener('click', toggleDarkMode);
}

// Load statuses from localStorage
function loadStatuses() {
    const saved = localStorage.getItem('zfellows-statuses');
    if (saved) {
        candidateStatuses = JSON.parse(saved);
    } else {
        // Initialize all candidates as pending
        mockCandidates.forEach(candidate => {
            candidateStatuses[candidate.id] = 'pending';
        });
    }
}

// Save statuses to localStorage
function saveStatuses() {
    localStorage.setItem('zfellows-statuses', JSON.stringify(candidateStatuses));
}

// Load history from localStorage
function loadHistory() {
    const saved = localStorage.getItem('zfellows-history');
    if (saved) {
        statusHistory = JSON.parse(saved);
    }
}

// Save history to localStorage
function saveHistory() {
    localStorage.setItem('zfellows-history', JSON.stringify(statusHistory));
}

// Get status for a candidate
function getStatus(candidateId) {
    return candidateStatuses[candidateId] || 'pending';
}

// Set status for a candidate
function setStatus(candidateId, status, skipHistory = false) {
    const oldStatus = candidateStatuses[candidateId];
    
    // Only add to history if this is a user action (not undo)
    if (!skipHistory && oldStatus !== status) {
        statusHistory.push({
            candidateId: candidateId,
            oldStatus: oldStatus,
            newStatus: status,
            timestamp: Date.now()
        });
        saveHistory();
    }
    
    candidateStatuses[candidateId] = status;
    saveStatuses();
    renderCandidateList();
    updateStats();
    
    // Update the status badge if this is the current candidate
    if (candidateId === currentCandidateId) {
        updateStatusBadge(status);
    }
}

// Undo last status change
function undoLastMove() {
    if (statusHistory.length === 0) {
        return; // Nothing to undo
    }
    
    const lastAction = statusHistory.pop();
    saveHistory();
    
    // Restore the old status
    candidateStatuses[lastAction.candidateId] = lastAction.oldStatus;
    saveStatuses();
    
    // Navigate to the candidate that was changed
    selectCandidate(lastAction.candidateId);
    
    renderCandidateList();
    updateStats();
}

// Render the candidate list in sidebar
function renderCandidateList() {
    const listElement = document.getElementById('candidate-list');
    listElement.innerHTML = '';
    
    // Sort candidates by AI score (highest first)
    const sortedCandidates = [...mockCandidates].sort((a, b) => {
        return getAIScore(b.id) - getAIScore(a.id);
    });
    
    sortedCandidates.forEach(candidate => {
        const status = getStatus(candidate.id);
        const score = getAIScore(candidate.id); // Use getAIScore from aiScoring.js
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
                <div class="candidate-item-status ${status}">${status}</div>
            </div>
        `;
        
        listElement.appendChild(item);
    });
}

// Update statistics
function updateStats() {
    const stats = {
        pending: 0,
        interview: 0,
        done: 0
    };
    
    Object.values(candidateStatuses).forEach(status => {
        stats[status]++;
    });
    
    document.getElementById('pending-count').textContent = stats.pending;
    document.getElementById('interview-count').textContent = stats.interview;
    document.getElementById('done-count').textContent = stats.done;
}

// Select a candidate
function selectCandidate(candidateId) {
    currentCandidateId = candidateId;
    const candidate = mockCandidates.find(c => c.id === candidateId);
    
    if (!candidate) return;
    
    // Update header
    document.getElementById('candidate-name').textContent = `${candidate.firstName} ${candidate.lastName}`;
    updateStatusBadge(getStatus(candidateId));
    updateHeaderInfo(candidate);
    
    // Render details
    renderCandidateDetails(candidate);
    
    // Update active state in sidebar
    renderCandidateList();
}

// Update header info
function updateHeaderInfo(candidate) {
    const headerInfo = document.getElementById('header-info');
    headerInfo.innerHTML = `
        <div class="header-info-item">
            <span class="header-info-label">Email:</span>
            <span class="header-info-value">${candidate.email}</span>
        </div>
        <div class="header-info-item">
            <span class="header-info-label">Phone:</span>
            <span class="header-info-value">${candidate.phone}</span>
        </div>
        <div class="header-info-item">
            <span class="header-info-label">Birthday:</span>
            <span class="header-info-value">${candidate.birthday}</span>
        </div>
        <div class="header-info-item">
            <span class="header-info-label">Location:</span>
            <span class="header-info-value">${candidate.location}</span>
        </div>
        <div class="header-info-item">
            <span class="header-info-label">Technical:</span>
            <span class="header-info-value">${candidate.technical}</span>
        </div>
        <div class="header-info-item">
            <span class="header-info-label">Previously Applied:</span>
            <span class="header-info-value">${candidate.previouslyApplied}</span>
        </div>
    `;
}

// Update status badge
function updateStatusBadge(status) {
    const badge = document.getElementById('status-badge');
    badge.className = `status-badge ${status}`;
    badge.textContent = status;
}

// Render candidate details
function renderCandidateDetails(candidate) {
    const detailsElement = document.getElementById('candidate-details');
    
    detailsElement.innerHTML = `
        <div class="details-grid">
            <div class="detail-section">
                <h3>Company / Project</h3>
                <p>${candidate.company}</p>
            </div>

            <div class="detail-section">
                <h3>School or Work</h3>
                <p>${candidate.schoolOrWork}</p>
            </div>

            <div class="detail-section">
                <h3>Project Description</h3>
                <p>${candidate.projectDescription}</p>
            </div>

            <div class="detail-section">
                <h3>Problem Solving</h3>
                <p>${candidate.problemSolving}</p>
            </div>

            <div class="detail-section">
                <h3>Expertise</h3>
                <p>${candidate.expertise}</p>
            </div>

            <div class="detail-section">
                <h3>Competitors & Understanding</h3>
                <p>${candidate.competitors}</p>
            </div>

            <div class="detail-section">
                <h3>Past Work</h3>
                <p>${candidate.pastWork}</p>
            </div>

            <div class="detail-section">
                <h3>What's Nerdy About You</h3>
                <p>${candidate.nerdy}</p>
            </div>

            <div class="detail-section">
                <h3>What Drives You</h3>
                <p>${candidate.drives}</p>
            </div>

            <div class="detail-section">
                <h3>Non-Traditional Background</h3>
                <p>${candidate.nonTraditional}</p>
            </div>

            <div class="detail-section">
                <h3>Risk or Challenge</h3>
                <p>${candidate.riskOrChallenge}</p>
            </div>

            <div class="detail-section">
                <h3>Website / Links</h3>
                <p>${candidate.website.split(',').map(link => `<a href="${link.trim()}" target="_blank">${link.trim()}</a>`).join('<br>')}</p>
            </div>

            <div class="detail-section">
                <h3>Achievements</h3>
                <p>${candidate.achievements}</p>
            </div>

            ${candidate.videoLink ? `
            <div class="detail-section">
                <h3>Video Introduction</h3>
                <p><a href="${candidate.videoLink}" target="_blank">${candidate.videoLink}</a></p>
            </div>
            ` : ''}

            <div class="detail-section">
                <h3>Dream Co-founder</h3>
                <p>${candidate.cofounder}</p>
            </div>

            <div class="detail-section">
                <h3>How They Heard About Z Fellows</h3>
                <p>${candidate.howHeard}</p>
            </div>

            ${candidate.helpNeeded ? `
            <div class="detail-section">
                <h3>Help Needed</h3>
                <p>${candidate.helpNeeded}</p>
            </div>
            ` : ''}
        </div>
    `;
}

// Setup keyboard shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ignore if user is typing in an input field
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        
        const key = e.key.toLowerCase();
        
        // Z for undo - works even without a selected candidate
        if (key === 'z') {
            undoLastMove();
            return;
        }
        
        if (!currentCandidateId) return;
        
        if (key === 'i') {
            setStatus(currentCandidateId, 'interview');
            moveToNextCandidate();
        } else if (key === 'e') {
            setStatus(currentCandidateId, 'done');
            moveToNextCandidate();
        } else if (key === 'p') {
            setStatus(currentCandidateId, 'pending');
            moveToNextCandidate();
        }
    });
}

// Move to next pending candidate
function moveToNextCandidate() {
    const currentIndex = mockCandidates.findIndex(c => c.id === currentCandidateId);
    
    // Look for next pending candidate
    for (let i = currentIndex + 1; i < mockCandidates.length; i++) {
        if (getStatus(mockCandidates[i].id) === 'pending') {
            selectCandidate(mockCandidates[i].id);
            return;
        }
    }
    
    // If no pending candidates after current, look from beginning
    for (let i = 0; i < currentIndex; i++) {
        if (getStatus(mockCandidates[i].id) === 'pending') {
            selectCandidate(mockCandidates[i].id);
            return;
        }
    }
    
    // If no pending candidates at all, just move to next candidate
    if (currentIndex < mockCandidates.length - 1) {
        selectCandidate(mockCandidates[currentIndex + 1].id);
    }
}

// Initialize the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

