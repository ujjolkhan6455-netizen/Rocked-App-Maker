"use strict";

require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const FRONTEND = path.resolve(__dirname, "..");

app.disable("x-powered-by");

app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(express.json({ limit: "200kb" }));

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "অনেক অনুরোধ হয়েছে। কিছুক্ষণ পর চেষ্টা করো।"
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(FRONTEND, "index.html"));
});

app.get("/manifest.json", (req, res) => {
  res.type("application/manifest+json");
  res.sendFile(path.join(FRONTEND, "manifest.json"));
});

app.get("/sw.js", (req, res) => {
  res.setHeader("Service-Worker-Allowed", "/");
  res.type("application/javascript");
  res.sendFile(path.join(FRONTEND, "sw.js"));
});

app.get("/icon.svg", (req, res) => {
  res.type("image/svg+xml");
  res.sendFile(path.join(FRONTEND, "icon.svg"));
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Rocked App Maker",
    aiConfigured: Boolean(process.env.OPENAI_API_KEY)
  });
});

app.post("/api/ai/generate", aiLimiter, async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    if (!apiKey) {
      return res.status(503).json({
        error: "AI API Key সার্ভারে সেট করা হয়নি।"
      });
    }

    const prompt = String(req.body.prompt || "").trim();
    const currentCode = String(req.body.currentCode || "").slice(0, 30000);
    const projectName = String(req.body.projectName || "New App").slice(0, 100);

    if (!prompt) {
      return res.status(400).json({
        error: "Prompt লিখতে হবে।"
      });
    }

    if (prompt.length > 12000) {
      return res.status(400).json({
        error: "Prompt অনেক বড়। সংক্ষিপ্ত করে পাঠাও।"
      });
    }

    const systemMessage = `
You are Rocked App Maker AI, an application development assistant.

Communicate in clear Bengali unless the user requests another language.

Your responsibilities:
1. Understand application ideas.
2. Ask useful questions when requirements are missing.
3. Create structured application specifications.
4. Generate and update HTML, CSS and JavaScript.
5. Explain dependencies and permissions.
6. Never claim that a build, test or deployment succeeded unless verified.
7. Never put API keys or passwords in frontend code.
8. Treat all user-provided code as untrusted.
9. Do not silently remove existing features.
10. If code is requested, return a complete HTML document where practical.

Return valid JSON with exactly:
{
  "answer": "Bengali explanation",
  "code": "Complete updated HTML, or empty string"
}
`;

    const userMessage = `
Project: ${projectName}

Current code:
${currentCode}

User request:
${prompt}
`;

    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemMessage },
            { role: "user", content: userMessage }
          ],
          response_format: { type: "json_object" }
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("AI provider error:", result);
      return res.status(502).json({
        error: "AI পরিষেবা অনুরোধ গ্রহণ করেনি। সার্ভার লগ পরীক্ষা করো।"
      });
    }

    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(502).json({
        error: "AI থেকে উত্তর পাওয়া যায়নি।"
      });
    }

    let parsed;

    try {
      parsed = JSON.parse(content);
    } catch {
      return res.status(502).json({
        error: "AI-এর উত্তর সঠিক JSON ফরম্যাটে আসেনি।"
      });
    }

    return res.json({
      answer: String(parsed.answer || ""),
      code: String(parsed.code || "")
    });

  } catch (error) {
    console.error("AI error:", error);

    return res.status(500).json({
      error: "সার্ভারে সমস্যা হয়েছে। পরে আবার চেষ্টা করো।"
    });
  }
});

app.use("/api", (req, res) => {
  res.status(404).json({
    error: "API endpoint পাওয়া যায়নি।"
  });
});

app.use((req, res) => {
  res.status(404).send("Page not found");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("Rocked App Maker running on port " + PORT);
})dashboardMessage
