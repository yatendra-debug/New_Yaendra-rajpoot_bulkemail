import express from "express";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* 🔐 BASIC */
app.disable("x-powered-by");
app.use(express.json({ limit: "50kb" }));
app.use(express.static(path.join(__dirname, "public")));

/* 🏠 ROUTES */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});
app.get("/launcher", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "launcher.html"));
});

/* 🔐 LOGIN */
app.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username === "%%%%%%" && password === "%%%%%%") {
    return res.json({ success: true });
  }
  return res.json({ success: false });
});

/* ⚖️ SETTINGS (low-risk defaults) */
const HOURLY_LIMIT = 27  // 20–30 safe range
const PARALLEL = 2;        // 2 at a time
const BASE_DELAY = 120;   // 
const JITTER = 400;        // +0–800ms random gap
const MAX_RETRIES = 2;     // retry temp failures

let usage = {};
setInterval(() => { usage = {}; }, 60 * 60 * 1000);

/* 🧪 HELPERS */
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (t = "", max = 3000) =>
  t.replace(/\r\n/g, "\n")
   .replace(/\n{3,}/g, "\n\n")
   .trim()
   .slice(0, max);

const sleep = ms => new Promise(r => setTimeout(r, ms));

const randDelay = () => BASE_DELAY + Math.floor(Math.random() * JITTER);

function uniqueValid(list) {
  const set = new Set();
  return list
    .map(e => e.trim().toLowerCase())
    .filter(e => emailRegex.test(e) && !set.has(e) && set.add(e));
}

/* 🔤 OPTIONAL SOFT TONE (not bypass) */
const WORD_MAP = {
  "urgent": "quick",
  "free": "no-cost",
  "guarantee": "help",
  "offer": "limited",
};
function sanitize(text) {
  let out = text;
  for (const [bad, good] of Object.entries(WORD_MAP)) {
    const re = new RegExp(`\\b${bad}\\b`, "gi");
    out = out.replace(re, good);
  }
  return out;
}

/* 📤 SEND WITH RETRY */
async function sendWithRetry(transporter, mail) {
  for (let i = 0; i <= MAX_RETRIES; i++) {
    try {
      await transporter.sendMail(mail);
      return true;
    } catch (err) {
      const msg = err?.message || "";
      // retry only for transient issues
      const transient =
        msg.includes("ECONNECTION") ||
        msg.includes("ETIMEDOUT") ||
        msg.includes("EAI_AGAIN") ||
        msg.includes("Rate limit") ||
        msg.includes("Try again");

      console.log(`Send fail (try ${i+1}):`, msg);

      if (!transient || i === MAX_RETRIES) return false;
      await sleep(1500 + i * 1000); // backoff
    }
  }
}

/* 📦 PARALLEL BATCH */
async function sendBatch(transporter, batch) {
  const results = await Promise.all(
    batch.map(m => sendWithRetry(transporter, m))
  );
  return results.filter(Boolean).length;
}

/* 📤 SEND API */
app.post("/send", async (req, res) => {
  try {
    const {
      senderName, gmail, apppass, to,
      subject, message, safeMode = false
    } = req.body || {};

    if (!gmail || !apppass || !to || !message) {
      return res.json({ success: false, msg: "Missing fields" });
    }
    if (!emailRegex.test(gmail)) {
      return res.json({ success: false, msg: "Invalid Gmail" });
    }

    if (!usage[gmail]) usage[gmail] = 0;
    if (usage[gmail] >= HOURLY_LIMIT) {
      return res.json({ success: false, msg: "Hourly limit reached" });
    }

    const recipients = uniqueValid(
      to.split(/,|\n/)
    );

    if (!recipients.length) {
      return res.json({ success: false, msg: "No valid recipients" });
    }

    /* 📡 TRANSPORT */
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmail, pass: apppass }
    });

    try {
      await transporter.verify();
    } catch (e) {
      console.log("Verify error:", e.message);
      return res.json({ success: false, msg: "Gmail login failed" });
    }

    const safeName = clean(senderName || gmail, 60);
    const finalMessage = safeMode ? sanitize(message) : message;

    const mails = recipients.map(r => ({
      from: `"${safeName}" <${gmail}>`,
      to: r,
      subject: clean(subject || "Hello", 120),
      text: clean(finalMessage),
      replyTo: gmail
    }));

    let sent = 0;

    for (let i = 0; i < mails.length; i += PARALLEL) {
      if (usage[gmail] >= HOURLY_LIMIT) break;

      const batch = mails.slice(i, i + PARALLEL);
      const ok = await sendBatch(transporter, batch);

      sent += ok;
      usage[gmail] += ok;

      await sleep(randDelay()); // natural gap
    }

    return res.json({ success: true, sent });

  } catch (err) {
    console.log("SERVER ERROR:", err.message);
    return res.json({ success: false, msg: "Server error" });
  }
});

/* 🚀 START */
app.listen(process.env.PORT || 3000, () => {
  console.log("✅ Low-risk mail server running");
});
