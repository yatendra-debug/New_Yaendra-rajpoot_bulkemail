import express from "express";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* 🔐 SECURITY */
app.use(express.json({ limit: "40kb" }));
app.disable("x-powered-by");

/* 📁 STATIC */
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

/* ⚙️ CONFIG FROM ENV */
const HOURLY_LIMIT = Number(process.env.HOURLY_LIMIT) || 27;
const PARALLEL = Number(process.env.PARALLEL) || 2;
const BASE_DELAY = Number(process.env.BASE_DELAY) || 200;

let stats = {};
setInterval(() => {
  stats = {};
}, 60 * 60 * 1000);

/* 🧹 CLEAN TEXT */
function cleanText(text) {
  return (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 2500);
}

function cleanSubject(text) {
  return (text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
}

function cleanName(text) {
  return (text || "")
    .replace(/[<>"]/g, "")
    .trim()
    .slice(0, 50);
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* 🎯 HUMAN DELAY */
function getDelay() {
  return BASE_DELAY + Math.floor(Math.random() * 150);
}

/* 🚀 SAFE SENDING */
async function sendSafely(transporter, mails) {
  let sent = 0;

  for (let i = 0; i < mails.length; i += PARALLEL) {
    const batch = mails.slice(i, i + PARALLEL);

    const results = await Promise.allSettled(
      batch.map(m => transporter.sendMail(m))
    );

    results.forEach(r => {
      if (r.status === "fulfilled") sent++;
      else console.log("Fail:", r.reason?.message);
    });

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

  /* 📬 CLEAN RECIPIENTS */
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

  const safeName =
    cleanName(senderName) || process.env.DEFAULT_FROM_NAME || gmail;

  /* 📤 MAIL BUILD */
  const mails = recipients.map(r => ({
    from: `"${safeName}" <${gmail}>`,
    to: r,
    subject: cleanSubject(subject),
    text: cleanText(message)
  }));

  const sent = await sendSafely(transporter, mails);

  stats[gmail].count += sent;

  return res.json({ success: true, sent });
});

/* 🟢 START */
app.listen(process.env.PORT || 3000, () => {
  console.log("✅ Safe Mail Server Running");
});
