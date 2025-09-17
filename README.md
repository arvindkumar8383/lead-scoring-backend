# 🚀 Lead Scoring Backend Assignment

This project implements a backend system for scoring leads based on rule-based logic and AI-based intent classification.  
It was built using **Node.js + Express** with file upload support (Multer) and OpenAI integration.

---

## 📌 Features
- **Offer API** – Store a single product/offer definition  
- **Leads Upload** – Upload leads from a CSV file  
- **Scoring Pipeline** – Rule-based scoring (0–50) + AI intent scoring (0–50)  
- **Results API** – Fetch scored leads in JSON format  
- **CSV Export** – Download scored leads as a CSV file  
- **Bonus** – Dockerfile, sample data, clean repo

---

## ⚙️ Setup Instructions

### 1. Clone the repo
git clone <git remote add origin https://github.com/arvindkumar8383/lead-scoring-backend.git>

cd lead-scoring-backend

2. Install dependencies
npm install

3. Configure environment
Create a .env file in the root:
PORT=3000
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxx
OPENAI_MODEL=gpt-4o-mini

4. Run server
npm run dev
Server starts at: http://localhost:3000/

🔑 API Endpoints
Health check
GET /
Response: Lead scoring backend running

Create Offer
POST /offer
Content-Type: application/json


Example Body:

{
  "name": "AI Outreach Automation",
  "value_props": ["24/7 outreach", "6x more meetings"],
  "ideal_use_cases": ["B2B SaaS mid-market"]
}


✅ Response:

{ "ok": true, "offer": { ... } }

Upload Leads (CSV)
POST /leads/upload


Form-data:

Key: file

Value: (select leads.csv file)

Sample leads.csv:

name,role,company,industry,location,linkedin_bio
Ava Patel,Head of Growth,FlowMetrics,B2B SaaS mid-market,Bengaluru,"Growth leader at FlowMetrics focusing on acquisition"
Ravi Kumar,Product Manager,ShopKart,E-commerce,Bengaluru,"Product manager with marketplace experience"


✅ Response:

{ "ok": true, "added": 2 }

Run Scoring
POST /score


✅ Response:

{ "ok": true, "results_count": 2 }

Get Results
GET /results


✅ Response:

[
  {
    "name": "Ava Patel",
    "role": "Head of Growth",
    "company": "FlowMetrics",
    "intent": "High",
    "score": 68,
    "reason": "Matches ideal use-case and role suggests decision maker",
    "raw_rule_score": 18,
    "raw_ai_points": 50
  }
]

Export Results (CSV)
GET /results/export


Downloads a CSV file of results.

🧮 Scoring Logic
Rule-based (max 50)

Role relevance → Decision maker = 20, Influencer = 10, Else = 0

Industry match → Exact ICP = 20, Partial match = 10, Else = 0

Completeness → All required fields present = 10

AI-based (max 50)

High intent = 50

Medium intent = 30

Low intent = 10

Final Score = Rule Score + AI Points (0–100)

🐳 Docker (optional)
docker build -t lead-scoring-backend .
docker run -p 3000:3000 lead-scoring-backend

🚀 Deployment

You can deploy on Railway :- https://lead-scoring-backend-production.up.railway.app/

Connect GitHub repo

Add env vars (OPENAI_API_KEY, OPENAI_MODEL)

Set start command: npm start

✅ Submission Checklist

 Multiple commits with clear messages

 README with setup + usage instructions

 API tested with Postman

 CSV upload + scoring pipeline working

 AI integration with reasoning

 Bonus: CSV export + Dockerfile

