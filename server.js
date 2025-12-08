require('dotenv').config();
const express = require('express');
const path = require('path');
const { fetchCandidates, updateRecord } = require('./airtableService');

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON bodies
app.use(express.json());

// Serve static files from the current directory
app.use(express.static(__dirname));

// API endpoint to fetch candidates from Airtable
app.get('/api/candidates', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 500;
        const offset = req.query.offset || null;
        
        const result = await fetchCandidates(limit, offset);
        res.json({ 
            success: true, 
            candidates: result.candidates,
            offset: result.offset,
            hasMore: result.hasMore
        });
    } catch (error) {
        console.error('Error fetching candidates:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            message: 'Failed to fetch candidates from Airtable. Check your API token and configuration.'
        });
    }
});

// API endpoint to update a candidate in Airtable
app.post('/api/candidates/update', async (req, res) => {
    try {
        const { recordId, fields } = req.body;
        
        if (!recordId || !fields) {
            return res.status(400).json({
                success: false,
                error: 'Missing recordId or fields in request body'
            });
        }
        
        const result = await updateRecord(recordId, fields);
        res.json({ 
            success: true, 
            record: result
        });
    } catch (error) {
        console.error('Error updating candidate:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            message: 'Failed to update candidate in Airtable.'
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    const hasToken = !!process.env.AIRTABLE;
    const hasBaseId = !!process.env.AIRTABLE_BASE_ID;
    const hasTableName = !!process.env.AIRTABLE_TABLE_NAME;
    
    res.json({ 
        status: 'ok',
        config: {
            hasToken,
            hasBaseId,
            hasTableName,
            ready: hasToken && hasBaseId && hasTableName
        }
    });
});

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n🚀 Z Fellows Application Review running at http://localhost:${PORT}\n`);
    
    // Check configuration
    if (!process.env.AIRTABLE) {
        console.warn('⚠️  Warning: AIRTABLE token not found in environment variables');
    }
    if (!process.env.AIRTABLE_BASE_ID) {
        console.warn('⚠️  Warning: AIRTABLE_BASE_ID not found in environment variables');
    }
    if (!process.env.AIRTABLE_TABLE_NAME) {
        console.warn('⚠️  Warning: AIRTABLE_TABLE_NAME not found in environment variables');
    }
});
