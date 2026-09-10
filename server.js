require("dotenv").config();
const express = require("express");
const cors=require("cors");
const app=express();
const path= require("path");
app.use(cors());
app.use(express.json());
// healtcheck
app.get("/health-check",(req,res)=>{
    res.status(200).json({message:"still operational"})
})
app.get('/',(req,res)=>{
res.sendFile(path.join(__dirname,"public/index.html"));
})
function escapeOverpass(str) {
  return String(str).replace(/[\\"]/g, "\\$&");
}
function buildAddress(tags, cityFallback) {
  const parts = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  return parts || tags["addr:city"] || cityFallback || null;
}
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
async function createOutreach(name, businessType,address, website) {
  if (!name || !businessType || website) return null;
    const prompt = `You are writing a short cold-outreach message for a web developer reaching out to a local business in Cameroon.

Business name: ${name}
Business type: ${businessType}
Address: ${address || "not available"}

Write a message following this exact structure and tone:

1. Opening line: greet the business by name, state plainly that they have no website findable online.
2. Second line: state one concrete consequence — a customer or competitor benefiting from their absence online. Be specific to the business type, not generic.
3. Closing line: offer to build a free homepage preview first, no cost, so they can see it before deciding. End with a plain yes/no question asking if they want that.

Rules:
- 5 to 7 lines total, no more.
- No exclamation marks anywhere.
- No pricing mentioned.
- Plain, direct Cameroonian English — not polished consultant language, not AI-sounding phrasing ("unlock your potential", "in today's digital age", "elevate your presence", etc. are forbidden).
- Do not use bullet points or headers — write it as a normal message someone would send on WhatsApp.
- Output only the message text, nothing else — no preamble, no explanation, no quotation marks around it.`;; // same as before
     const maxRetries = 3;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-20b",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_tokens: 500,
        }),
      });

      if (response.status === 429) {
        const errBody = await response.json().catch(() => null);
        const msg = errBody?.error?.message || "";
        const match = msg.match(/try again in ([\d.]+)s/i);
        const waitMs = match ? Math.ceil(parseFloat(match[1]) * 1000) + 250 : 2000 * (attempt + 1);
        console.log(`Rate limited on "${name}" — waiting ${waitMs}ms (attempt ${attempt + 1})`);
        await sleep(waitMs);
        continue;
      }

      if (!response.ok) {
        const text = await response.text();
        console.log("Groq error:", response.status, text);
        return null;
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || null;
    } catch (e) {
      console.log("error while creating outreach:", e.message);
      return null;
    }
  }

  console.log(`Gave up on "${name}" after ${maxRetries} retries — still rate limited`);
  return null;
}
async function mapLeadsConcurrently(leads,limit,fn){
  const results= new Array(leads.length)
  let i=0
  async function worker(){
    while (i<leads.length){
      const idx=i++
      results[idx]= await fn(leads[idx])
      
    }
    }
    await Promise.all(Array.from({length:limit},worker))
  return results
  }
app.post("/scan", async (req, res) => {
  const { city, key, value } = req.body;
  if (!city || !key || !value) {
    return res.status(400).json({ error: "missing fields: city, key, value" });
  }
const safeCity = escapeOverpass(city);
const safeKey = escapeOverpass(key);
const safeValue = escapeOverpass(value);

const query = `[out:json];
area["name"="${safeCity}"]->.searchArea;
(node["${safeKey}"="${safeValue}"](area.searchArea);
 way["${safeKey}"="${safeValue}"](area.searchArea););
out center;`;

  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
    "User-Agent": "Localyze/1.0 (lead-gen tool; contact: chiemeriamarvelous10@gmail.com)",
    "Accept": "*/*",
    "Content-Type": "text/plain",
  },
      body: query,
    });
    if (!response.ok) {
      const text = await response.text();
      console.log(text);
      return res.status(502).json({ error: "overpass query failed", detail: text });
    }
    const data = await response.json();
    const leads = data.elements;
    const validLeads = leads.filter(l => l.tags?.name);
    const outreaches = await mapLeadsConcurrently(validLeads, 1, l =>
  createOutreach(l.tags.name, value, buildAddress(l.tags, city), l.tags.website)
);    
    res.json({ leads, outreaches });
  } catch (e) {
    console.log("error:", e.message);
    res.status(500).json({ error: e.message });
  }
});
app.listen(3000,()=>{console.log("running on http://localhost:3000")})