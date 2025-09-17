// Minimal Lead Scoring Backend (Express)
// Run: npm install && cp .env.example .env && (edit .env) && npm start

const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

let OFFER = null;
let LEADS = [];      // array of lead objects
let RESULTS = [];    // array of scored lead objects

// ------------------- Utility: rule scoring -------------------
function roleScore(roleStr = '') {
  const s = roleStr.toLowerCase();
  const decisionKeywords = ['ceo','founder','co-founder','cto','cpo','chief','head of','vp','vice president','director','owner','partner','president'];
  const influencerKeywords = ['manager','lead','principal','senior','associate','evangelist','specialist','coordinator','marketing'];
  for (const k of decisionKeywords) if (s.includes(k)) return 20;
  for (const k of influencerKeywords) if (s.includes(k)) return 10;
  return 0;
}

function industryScore(leadIndustry = '', offer = {}) {
  if (!offer || !offer.ideal_use_cases || !leadIndustry) return 0;
  const li = leadIndustry.toLowerCase();
  for (const icp of offer.ideal_use_cases) {
    const ic = icp.toLowerCase();
    if (li === ic) return 20;                  // exact
    if (li.includes(ic) || ic.includes(li)) return 10; // adjacent/contains
    // also check token overlap
    const intersection = ic.split(/\W+/).filter(tok => tok && li.includes(tok));
    if (intersection.length > 0) return 10;
  }
  return 0;
}

function completenessScore(lead) {
  const required = ['name','role','company','industry','location','linkedin_bio'];
  for (const f of required) {
    if (!lead[f] || String(lead[f]).trim() === '') return 0;
  }
  return 10;
}

function computeRuleScore(lead, offer) {
  const r1 = roleScore(lead.role);
  const r2 = industryScore(lead.industry, offer);
  const r3 = completenessScore(lead);
  return r1 + r2 + r3; // max 50
}

// ------------------- Utility: AI call -------------------
async function aiClassifyIntent(lead, offer) {
  // Build a compact prompt
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { intent: 'Medium', reason: 'No OPENAI_API_KEY provided; defaulting to Medium.' };
  }

  const systemInstr = `You are an assistant that classifies a prospect's buying intent (High/Medium/Low) for a given product offer. Respond EXACTLY in this format:
Intent: <High|Medium|Low>
Reason: <One or two short sentences explaining why.>`;

  const userContent = `Offer: ${JSON.stringify(offer)}
Lead: ${JSON.stringify(lead)}

Classify the lead's buying intent and explain in 1-2 sentences.`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemInstr },
          { role: 'user', content: userContent }
        ],
        max_tokens: 200,
        temperature: 0.2
      })
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error('OpenAI error:', res.status, txt);
      return { intent: 'Medium', reason: `AI call failed (${res.status}).` };
    }

    const j = await res.json();
    const reply = j.choices?.[0]?.message?.content || '';
    // parse
    const intentMatch = reply.match(/Intent:\s*(High|Medium|Low)/i);
    const reasonMatch = reply.match(/Reason:\s*([\s\S]+)/i);
    const intent = intentMatch ? intentMatch[1].charAt(0).toUpperCase() + intentMatch[1].slice(1).toLowerCase() : 'Medium';
    const reason = reasonMatch ? reasonMatch[1].trim().split(/\n/)[0].trim() : reply.trim().slice(0,200);
    return { intent, reason };
  } catch (err) {
    console.error('AI call exception:', err);
    return { intent: 'Medium', reason: 'AI call exception, defaulting to Medium.' };
  }
}

function aiPointsForIntent(intent) {
  if (intent === 'High') return 50;
  if (intent === 'Medium') return 30;
  return 10;
}

// ------------------- Routes -------------------

// POST /offer
app.post('/offer', (req, res) => {
  const body = req.body;
  if (!body || !body.name) return res.status(400).json({ error: 'Offer must include at least "name".' });
  // Expect shape: { name, value_props: [...], ideal_use_cases: [...] }
  OFFER = {
    name: body.name,
    value_props: body.value_props || [],
    ideal_use_cases: body.ideal_use_cases || []
  };
  return res.json({ ok: true, offer: OFFER });
});

// POST /leads/upload  (multipart/form-data, field name = file)
app.post('/leads/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'CSV file is required (field name: file)' });
  const leadsAdded = [];
  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (row) => {
      // expected columns: name,role,company,industry,location,linkedin_bio
      const lead = {
        name: row.name || '',
        role: row.role || '',
        company: row.company || '',
        industry: row.industry || '',
        location: row.location || '',
        linkedin_bio: row.linkedin_bio || ''
      };
      LEADS.push(lead);
      leadsAdded.push(lead);
    })
    .on('end', () => {
      // remove temp file
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.json({ ok: true, added: leadsAdded.length });
    })
    .on('error', (err) => {
      console.error(err);
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(500).json({ error: 'Failed to process CSV' });
    });
});

// POST /score  -> runs scoring on uploaded leads (uses OFFER)
app.post('/score', async (req, res) => {
  if (!OFFER) return res.status(400).json({ error: 'No offer set. POST /offer first.' });
  if (!LEADS || LEADS.length === 0) return res.status(400).json({ error: 'No leads uploaded. POST /leads/upload first.' });

  RESULTS = []; // reset
  for (const lead of LEADS) {
    const rule = computeRuleScore(lead, OFFER); // 0-50
    const ai = await aiClassifyIntent(lead, OFFER); // {intent, reason}
    const aiPoints = aiPointsForIntent(ai.intent); // 50/30/10
    const score = rule + aiPoints;
    const obj = {
      name: lead.name,
      role: lead.role,
      company: lead.company,
      intent: ai.intent,
      score,
      reason: ai.reason,
      raw_rule_score: rule,
      raw_ai_points: aiPoints
    };
    RESULTS.push(obj);
  }

  return res.json({ ok: true, results_count: RESULTS.length });
});

// GET /results
app.get('/results', (req, res) => {
  return res.json(RESULTS);
});

// GET /results/export  (CSV)
app.get('/results/export', (req, res) => {
  if (!RESULTS || RESULTS.length === 0) return res.status(400).json({ error: 'No results to export.' });
  const header = ['name','role','company','intent','score','reason'];
  const rows = RESULTS.map(r => header.map(h => `"${String(r[h]||'').replace(/"/g,'""')}"`).join(','));
  const csv = [header.join(','), ...rows].join('\n');
  res.setHeader('Content-Disposition', 'attachment; filename=results.csv');
  res.setHeader('Content-Type', 'text/csv');
  res.send(csv);
});

// health
app.get('/', (req, res) => res.send('Lead scoring backend running'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server started on ${port}`));
