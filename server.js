import express from "express";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* 🔐 SECURITY */
app.use(express.json({ limit: "30kb" }));
app.disable("x-powered-by");

/* 📁 STATIC */
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

/* ⚙️ SAFE LIMIT (UNCHANGED SPEED) */
const HOURLY_LIMIT = 28;
const PARALLEL = 1;        // 🔥 most safe
const BASE_DELAY = 800;    // natural delay

/* 📊 TRACK */
let stats = {};
setInterval(() => {
  stats = {};
}, 60 * 60 * 1000);

/* 🧹 CLEAN INPUT */
const cleanText = t =>
  (t || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 2500);

const cleanSubject = s =>
  (s || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);

const cleanName = n =>
  (n || "")
    .replace(/[<>"]/g, "")
    .trim()
    .slice(0, 50);

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* 🎯 NATURAL DELAY */
function getDelay() {
  return BASE_DELAY + Math.floor(Math.random() * 600);
}

/* 🚀 SAFE SEND (1 by 1) */
async function sendSafely(transporter, mails) {
  let sent = 0;

  for (const mail of mails) {
    try {
      await transporter.sendMail(mail);
      sent++;
    } catch (err) {
      console.log("Fail:", err.message);
    }

    /* ⏱️ human delay */
    await new Promise(r => setTimeout(r, getDelay()));
  }

  return sent;
}

/* 📩 SEND API */
app.post("/send", async (req, res) => {
  const { senderName, gmail, apppass, to, subject, message } = req.body;

  if (!gmail || !apppass || !to || !subject || !message)
    return res.json({ success: false, msg: "Missing fields ❌" });

  if (!emailRegex.test(gmail))
    return res.json({ success: false, msg: "Invalid Gmail ❌" });

  if (!stats[gmail]) stats[gmail] = { count: 0 };

  if (stats[gmail].count >= HOURLY_LIMIT)
    return res.json({ success: false, msg: "Hourly limit reached ❌" });

  /* 📬 CLEAN LIST */
  const recipients = to
    .split(/,|\n/)
    .map(r => r.trim())
    .filter(r => emailRegex.test(r));

  const remaining = HOURLY_LIMIT - stats[gmail].count;

  if (recipients.length === 0)
    return res.json({ success: false, msg: "No valid recipients ❌" });

  if (recipients.length > remaining)
    return res.json({ success: false, msg: "Limit full ❌" });

  /* 📡 TRANSPORT */
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: gmail,
      pass: apppass
    }
  });

  try {
    await transporter.verify();
  } catch {
    return res.json({ success: false, msg: "Gmail login failed ❌" });
  }

  const safeName = cleanName(senderName) || gmail;

  /* 📤 MAIL BUILD */
  const mails = recipients.map(r => ({
    from: `"${safeName}" <${gmail}>`,
    to: r,
    subject: cleanSubject(subject),
    text: cleanText(message),

    /* ✅ TRUST SIGNALS */
    replyTo: gmail,
    headers: {
      "X-Mailer": "Mozilla Thunderbird",
      "X-Priority": "3",
      "List-Unsubscribe": `<mailto:${gmail}?subject=unsubscribe>`
    }
  }));

  /* 🚀 SEND */
  const sent = await sendSafely(transporter, mails);

  stats[gmail].count += sent;

  res.json({ success: true, sent });
});

/* 🟢 START */
app.listen(process.env.PORT || 3000, () => {
  console.log("✅ Ultra Safe Mail Server Running");
});
