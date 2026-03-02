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

// API endpoint to fetch single-select options for a field (e.g. Interviewer)
app.get('/api/field-options/:fieldName', async (req, res) => {
    const token = process.env.AIRTABLE;
    const baseId = process.env.AIRTABLE_BASE_ID;
    const tableName = process.env.AIRTABLE_TABLE_NAME || 'Applications';
    const fieldName = req.params.fieldName;

    if (!token || !baseId) {
        return res.status(500).json({ success: false, error: 'Airtable not configured' });
    }

    try {
        const response = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            return res.json({ success: false, error: 'Meta API unavailable' });
        }
        const data = await response.json();
        const table = data.tables.find(t => t.name === tableName || t.id === tableName);
        if (!table) return res.json({ success: false, error: 'Table not found' });

        const field = table.fields.find(f => f.name.toLowerCase() === fieldName.toLowerCase());
        if (!field || !field.options || !field.options.choices) {
            return res.json({ success: true, options: [] });
        }
        res.json({ success: true, options: field.options.choices.map(c => c.name) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
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
