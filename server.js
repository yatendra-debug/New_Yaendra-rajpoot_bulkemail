import express from "express";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* 🔐 BASIC */
app.use(express.json({ limit: "30kb" }));
app.disable("x-powered-by");

/* 📁 STATIC */
app.use(express.static(path.join(__dirname, "public")));

/* 🏠 LOGIN PAGE */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

/* 🔥 LAUNCHER ROUTE FIX (MAIN ISSUE FIX) */
app.get("/launcher", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "launcher.html"));
});

/* 🔐 LOGIN API */
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (username === "%%%%%%" && password === "%%%%%%") {
    return res.json({ success: true });
  }

  res.json({ success: false });
});

/* ⚖️ LIMITS */
const HOURLY_LIMIT = 27;
const PARALLEL = 2;
const DELAY_MS = 122;

let stats = {};
setInterval(() => { stats = {}; }, 60 * 60 * 1000);

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (t = "", max = 8000) =>
  t.replace(/\r\n/g, "\n")
   .replace(/\n{3,}/g, "\n\n")
   .trim()
   .slice(0, max);

/* 📤 SEND MAIL */
app.post("/send", async (req, res) => {
  const { senderName, gmail, apppass, to, subject, message } = req.body;

  if (!gmail || !apppass || !to || !message) {
    return res.json({ success: false, msg: "Missing fields" });
  }

  if (!emailRegex.test(gmail)) {
    return res.json({ success: false, msg: "Invalid Gmail" });
  }

  if (!stats[gmail]) stats[gmail] = { count: 0 };
  if (stats[gmail].count >= HOURLY_LIMIT) {
    return res.json({ success: false, msg: "Limit reached" });
  }

  const recipients = to
    .split(/,|\n/)
    .map(r => r.trim())
    .filter(r => emailRegex.test(r));

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmail, pass: apppass }
  });

  try {
    await transporter.verify();
  } catch {
    return res.json({ success: false, msg: "Login failed" });
  }

  let sent = 0;

  for (let r of recipients) {
    if (stats[gmail].count >= HOURLY_LIMIT) break;

    try {
      await transporter.sendMail({
        from: `"${clean(senderName || "Support")}" <${gmail}>`,
        to: r,
        subject: clean(subject || "Hello"),
        text: clean(message),
        replyTo: gmail
      });

      sent++;
      stats[gmail].count++;

      await new Promise(res => setTimeout(res, DELAY));

    } catch (err) {
      console.log("Fail:", err.message);
    }
  }

  res.json({ success: true, sent });
});

/* 🚀 START */
app.listen(process.env.PORT || 3000, () => {
  console.log("✅ Server Running PERFECT");
});
