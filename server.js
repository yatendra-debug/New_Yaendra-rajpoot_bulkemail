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
  res.json({ success: false });
});

/* ⚖️ SETTINGS */
const HOURLY_LIMIT = 27;
const PARALLEL = 2;
const DELAY = 150; // 

let stats = {};
setInterval(() => { stats = {}; }, 60 * 60 * 1000);

/* 🧪 HELPERS */
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (t = "", max = 3000) =>
  t.replace(/\r\n/g, "\n")
   .replace(/\n{3,}/g, "\n\n")
   .trim()
   .slice(0, max);

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 🔤 OPTIONAL SANITIZER (simple tone softening, not bypass) */
const WORD_MAP = {
  "urgent": "quick",
  "free": "no-cost",
  "guarantee": "help",
  "offer": "info",
  "price": "details",
  "click here": "see more",
  "limited": "few",
};

function sanitize(text) {
  let out = text;
  for (const [bad, good] of Object.entries(WORD_MAP)) {
    const re = new RegExp(`\\b${bad}\\b`, "gi");
    out = out.replace(re, good);
  }
  return out;
}

/* 📤 PARALLEL SEND */
async function sendBatch(transporter, batch) {
  const results = await Promise.allSettled(
    batch.map(m => transporter.sendMail(m))
  );

  let ok = 0;
  results.forEach(r => {
    if (r.status === "fulfilled") ok++;
    else console.log("Fail:", r.reason?.message);
  });

  return ok;
}

/* 📤 SEND API */
app.post("/send", async (req, res) => {
  try {
    const { senderName, gmail, apppass, to, subject, message, safeMode } = req.body;

    if (!gmail || !apppass || !to || !message) {
      return res.json({ success: false, msg: "Missing fields" });
    }

    if (!emailRegex.test(gmail)) {
      return res.json({ success: false, msg: "Invalid Gmail" });
    }

    if (!stats[gmail]) stats[gmail] = 0;

    if (stats[gmail] >= HOURLY_LIMIT) {
      return res.json({ success: false, msg: "Limit reached" });
    }

    const recipients = to
      .split(/,|\n/)
      .map(r => r.trim())
      .filter(r => emailRegex.test(r));

    if (!recipients.length) {
      return res.json({ success: false, msg: "No valid emails" });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: gmail,
        pass: apppass
      }
    });

    try {
      await transporter.verify();
    } catch (err) {
      console.log("Verify error:", err.message);
      return res.json({ success: false, msg: "Gmail login failed" });
    }

    const safeName = clean(senderName || gmail, 60);

    /* 🔥 APPLY SANITIZER ONLY IF safeMode = true */
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
      if (stats[gmail] >= HOURLY_LIMIT) break;

      const batch = mails.slice(i, i + PARALLEL);

      const ok = await sendBatch(transporter, batch);

      sent += ok;
      stats[gmail] += ok;

      await sleep(DELAY);
    }

    return res.json({ success: true, sent });

  } catch (err) {
    console.log("SERVER ERROR:", err.message);
    return res.json({ success: false, msg: "Server error" });
  }
});

/* 🚀 START */
app.listen(process.env.PORT || 3000, () => {
  console.log("✅ Mail server running");
});
