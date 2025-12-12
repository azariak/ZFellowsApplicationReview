# Z Fellows Application Review Dashboard

A streamlined dashboard for Cory Levy to review Z Fellows applications with Airtable integration.


## TODO
- Youtube embed
- AI Score
- Ensure all fields appear (include: other names, fields only filled in some applications)
- Host on CloudFlare with login instead of settings popup?
- Shortcut to expand link with better regex, preview link on hover
- No previews for all sites blocking iframes, fix previews being cutoff when o clicked
- Fix search bug + search for hidden candidates
- Write tests

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the project root with the following variables:

```env
# Your Airtable personal access token
# Get it from: https://airtable.com/create/tokens
AIRTABLE=pat_xxxxxxxxxxxxxxxxxxxxx

# Your Airtable Base ID
# Found in the URL when viewing your base: https://airtable.com/BASE_ID/...
AIRTABLE_BASE_ID=appXXXXXXXXXXXXXX

# The name of your table containing applications
AIRTABLE_TABLE_NAME=Applications

# Optional: Server port (default: 3000)
PORT=3000
```

### 3. Required Airtable Token Scopes

When creating your personal access token at https://airtable.com/create/tokens, ensure it has:
- **Scopes**: `data.records:read` and `data.records:write` (write needed for status updates)
- **Access**: Your applications base

### 4. Run the Application

```bash
npm start
```

The dashboard will be available at http://localhost:3000

## Airtable Field Mapping

The application automatically maps the following Airtable fields to the dashboard:

| Airtable Field | Dashboard Field |
|----------------|-----------------|
| Email | Email |
| First Name | First Name |
| Last Name | Last Name |
| Name | Full Name (split into first/last) |
| Project name | Company/Project |
| Phone | Phone |
| Birthday | Birthday |
| Location | Location |
| Technical? | Technical |
| Previously applied? | Previously Applied |
| Stage | Stage |
| What is the project... | Project Description |
| What problem are you solving? | Problem Solving |
| What expertise do you have... | Expertise |
| Who are your competitors... | Competitors |
| What have you worked on... | Past Work |
| What's the nerdiest thing... | Nerdy |
| What drives you? | What Drives You |
| What non-traditional things... | Non-Traditional Background |
| Tell us about a risk... | Risk or Challenge |
| Please list or describe... | Achievements |
| Website | Website/Links |
| Video Link | Video |
| Dream Cofounder | Cofounder |
| How did you hear... | How Heard |
| Help Needed | Help Needed |

### Customizing Field Mappings

If your Airtable uses different field names, edit `airtableService.js` and update the `FIELD_MAPPINGS` object.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `P` | Stage 1: Review |
| `I` | Mark for Interview |
| `E` | Mark as Done |
| `Z` | Undo last action |
| `Shift+Z` | Redo |

## Features

- **Live Airtable Data**: Fetches applications directly from your Airtable base
- **AI Scoring**: Optional OpenAI-powered scoring (run `runAIScoring()` in console)
- **Keyboard-Driven**: Quick status changes with hotkeys
- **Dark Mode**: Toggle with the moon/sun button
- **Resizable Sidebar**: Drag the sidebar edge to resize
- **Zoom Controls**: Adjust text size with A+/A- buttons
- **Undo/Redo**: Full history for status changes

## Troubleshooting

### "Failed to fetch candidates"
- Verify your `AIRTABLE` token is correct
- Check that the token has `data.records:read` scope
- Ensure `AIRTABLE_BASE_ID` matches your base
- Confirm `AIRTABLE_TABLE_NAME` matches your table name exactly

### "No candidates found"
- Your Airtable table might be empty
- Check that your token has access to the specified base

### Fields showing as empty
- Your Airtable field names might differ from the expected mappings
- Edit `FIELD_MAPPINGS` in `airtableService.js` to match your column names
