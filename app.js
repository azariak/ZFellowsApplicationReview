let currentCandidateId = null;
let candidateStatuses = {};
let statusHistory = [];
let redoHistory = [];
let zoomLevel = 0;
const fontSizes = [10, 11, 13, 15, 17];

function init() {
    loadStatuses();
    loadHistory();
    loadZoomLevel();
    loadDarkMode();
    loadAIScores();
    loadSidebarWidth();
    renderCandidateList();
    updateStats();
    setupKeyboardShortcuts();
    setupResizeHandle();
    document.getElementById('zoom-in').addEventListener('click', () => changeZoom(1));
    document.getElementById('zoom-out').addEventListener('click', () => changeZoom(-1));
    document.getElementById('dark-mode-toggle').addEventListener('click', toggleDarkMode);
    if (mockCandidates.length > 0) selectCandidate(mockCandidates[0].id);
}

function loadStatuses() {
    const saved = localStorage.getItem('zfellows-statuses');
    candidateStatuses = saved ? JSON.parse(saved) : mockCandidates.reduce((acc, c) => ({...acc, [c.id]: 'pending'}), {});
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
    return candidateStatuses[candidateId] || 'pending';
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
    [...mockCandidates].sort((a, b) => getAIScore(b.id) - getAIScore(a.id)).forEach(candidate => {
        const status = getStatus(candidate.id);
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
                <div class="candidate-item-status ${status}">${status}</div>
            </div>
        `;
        listElement.appendChild(item);
    });
}

function updateStats() {
    const stats = { pending: 0, interview: 0, done: 0 };
    Object.values(candidateStatuses).forEach(status => stats[status]++);
    document.getElementById('pending-count').textContent = stats.pending;
    document.getElementById('interview-count').textContent = stats.interview;
    document.getElementById('done-count').textContent = stats.done;
}

function selectCandidate(candidateId) {
    currentCandidateId = candidateId;
    const candidate = mockCandidates.find(c => c.id === candidateId);
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

function updateStatusBadge(status) {
    const badge = document.getElementById('status-badge');
    badge.className = `status-badge ${status}`;
    badge.textContent = status;
}

function renderCandidateDetails(c) {
    const sections = [
        ['Company / Project', c.company],
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
        ['Website / Links', c.website.split(',').map(link => `<a href="${link.trim()}" target="_blank">${link.trim()}</a>`).join('<br>')],
        ['Achievements', c.achievements],
        ...(c.videoLink ? [['Video Introduction', `<a href="${c.videoLink}" target="_blank">${c.videoLink}</a>`]] : []),
        ['Dream Co-founder', c.cofounder],
        ['How They Heard About Z Fellows', c.howHeard],
        ...(c.helpNeeded ? [['Help Needed', c.helpNeeded]] : [])
    ];
    
    document.getElementById('candidate-details').innerHTML = `
        <div class="details-grid">
            ${sections.map(([title, content]) => `
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
        const actions = { i: 'interview', e: 'done', p: 'pending' };
        if (actions[key]) {
            setStatus(currentCandidateId, actions[key]);
            moveToNextCandidate();
        }
    });
}

function moveToNextCandidate() {
    const currentIndex = mockCandidates.findIndex(c => c.id === currentCandidateId);
    for (let i = currentIndex + 1; i < mockCandidates.length; i++) {
        if (getStatus(mockCandidates[i].id) === 'pending') return selectCandidate(mockCandidates[i].id);
    }
    for (let i = 0; i < currentIndex; i++) {
        if (getStatus(mockCandidates[i].id) === 'pending') return selectCandidate(mockCandidates[i].id);
    }
    if (currentIndex < mockCandidates.length - 1) selectCandidate(mockCandidates[currentIndex + 1].id);
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
