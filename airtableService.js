/**
 * Airtable Service
 * Handles fetching and transforming candidate data from Airtable API
 */

const AIRTABLE_API_BASE = 'https://api.airtable.com/v0';

/**
 * Field mapping from Airtable field names to our internal field names
 * Adjust these mappings to match your Airtable table's field names
 */
const FIELD_MAPPINGS = {
    // Core fields - adjust these to match your Airtable column names
    'Email': 'email',
    'Email Address': 'email',
    'First': 'firstName',
    'Last': 'lastName',
    'First Name': 'firstName',
    'Last Name': 'lastName',
    'Name': 'name', // If using a single name field
    'Project name': 'company',
    'Phone': 'phone',
    'Birthday': 'birthday',
    'Born': 'birthday',
    'Location': 'location',
    'Technical?': 'technical',
    'Previously applied?': 'previouslyApplied',
    'Stage': 'stage',
    'Accept or Reject or Waitlist': 'decision',
    
    // Stage-related fields
    'Stage 2 Link To Calendar': 'stage2Calendar',
    'Stage 3 Schedule and Date': 'stage3Schedule',
    'Stage 4 Onboarding Doc': 'stage4Onboarding',
    'Upcoming Cohort Date': 'upcomingCohortDate',
    'Waitlist Update': 'waitlistUpdate',
    
    // Cory Interview fields
    'Cory Interview: Energy': 'coryEnergy',
    'Cory Interview: Overall score?': 'coryOverallScore',
    'Cory Interview: Smart?': 'corySmart',
    'Cory Interview: Storytelling?': 'coryStorytelling',
    'Cory notes': 'coryNotes',
    
    // Application content fields
    'School or Work': 'schoolOrWork',
    'What is the project that you are currently working on or would like to pursue? Why?': 'projectDescription',
    'What problem are you solving?': 'problemSolving',
    'What expertise do you have to execute on the work that you want to do?': 'expertise',
    'Who are your competitors and what do you understand about your idea that they don\'t?': 'competitors',
    'What have you worked on in the past?': 'pastWork',
    'What\'s the nerdiest thing about you?': 'nerdy',
    'What drives you?': 'drives',
    'What non-traditional things were you doing growing up?': 'nonTraditional',
    'Tell us about a risk you\'ve taken or a challenge you\'ve faced. Tell us whether you failed or succeeded, how you behaved, and how you think this reflects your character.': 'riskOrChallenge',
    'Please list or describe any achievements and prizes.': 'achievements',
    
    // Additional fields
    'Website': 'website',
    'Video Link': 'videoLink',
    'Video': 'videoLink',
    'Pitch Video': 'pitchVideo',
    'Pitch video': 'pitchVideo',
    'Cofounder': 'cofounder',
    'Dream Cofounder': 'cofounder',
    'How did you hear about us?': 'howHeard',
    'How did you hear about Z Fellows?': 'howHeard',
    'What help do you need?': 'helpNeeded',
    'Help Needed': 'helpNeeded'
};

/**
 * Fetch records from Airtable with pagination support
 * @param {number} maxRecords - Maximum number of records to fetch (default 500)
 * @param {string} offset - Pagination offset from previous request
 */
async function fetchRecords(maxRecords = 500, offset = null) {
    const token = process.env.AIRTABLE;
    const baseId = process.env.AIRTABLE_BASE_ID;
    const tableName = process.env.AIRTABLE_TABLE_NAME || 'Applications';

    if (!token) {
        throw new Error('AIRTABLE token not configured. Please set the AIRTABLE environment variable.');
    }
    if (!baseId) {
        throw new Error('AIRTABLE_BASE_ID not configured. Please set the AIRTABLE_BASE_ID environment variable.');
    }

    const allRecords = [];
    let currentOffset = offset;
    let recordsFetched = 0;
    let nextOffset = null;

    // Fetch pages until we have maxRecords or no more data
    while (recordsFetched < maxRecords) {
        const pageSize = Math.min(100, maxRecords - recordsFetched); // Airtable max is 100 per page
        
        const url = new URL(`${AIRTABLE_API_BASE}/${baseId}/${encodeURIComponent(tableName)}`);
        url.searchParams.set('pageSize', pageSize.toString());
        
        // Sort by created time descending to get newest first
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
        
        // Store the next offset for potential "load more"
        if (data.offset && recordsFetched < maxRecords) {
            currentOffset = data.offset;
        } else {
            nextOffset = data.offset || null;
            break;
        }
        
        // If no more records, stop
        if (!data.offset) {
            break;
        }
    }

    return {
        records: allRecords,
        offset: nextOffset,
        hasMore: !!nextOffset
    };
}

/**
 * Transform an Airtable record to our internal candidate format
 */
function transformRecord(record, index) {
    const fields = record.fields || {};
    const candidate = {
        id: record.id, // Use Airtable record ID
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
            // Convert field name to camelCase for consistency
            const camelKey = key.replace(/[^a-zA-Z0-9]/g, ' ')
                .split(' ')
                .map((word, i) => i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join('');
            if (!candidate[camelKey]) {
                candidate[camelKey] = value;
            }
        }
    }

    // Handle combined name field if separate first/last names aren't provided
    if (!candidate.firstName && !candidate.lastName && candidate.name) {
        const nameParts = candidate.name.split(' ');
        candidate.firstName = nameParts[0] || '';
        candidate.lastName = nameParts.slice(1).join(' ') || '';
    }

    // Provide defaults for required display fields
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
    candidate.achievements = candidate.achievements || '';
    candidate.videoLink = candidate.videoLink || '';
    candidate.pitchVideo = candidate.pitchVideo || '';
    candidate.cofounder = candidate.cofounder || '';
    candidate.howHeard = candidate.howHeard || '';
    candidate.helpNeeded = candidate.helpNeeded || '';
    
    // Default AI score (can be overwritten by AI scoring feature)
    candidate.aiScore = candidate.aiScore || 50;

    return candidate;
}

/**
 * Main function to fetch and transform candidates
 * @param {number} limit - Maximum number of records to fetch
 * @param {string} offset - Pagination offset for "load more"
 */
async function fetchCandidates(limit = 500, offset = null) {
    console.log(`Fetching up to ${limit} candidates from Airtable...${offset ? ' (loading more)' : ''}`);
    const result = await fetchRecords(limit, offset);
    console.log(`Fetched ${result.records.length} records from Airtable`);
    
    const candidates = result.records.map((record, index) => transformRecord(record, index));
    
    return {
        candidates,
        offset: result.offset,
        hasMore: result.hasMore
    };
}

module.exports = {
    fetchCandidates,
    fetchRecords,
    transformRecord,
    FIELD_MAPPINGS
};
