import express from "express";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ================= LOGIN FIX ================= */

/* fallback credentials (IMPORTANT FIX) */
const USER = process.env.APP_USER || "@#@#";
const PASS = process.env.APP_PASS || "@#@#";

/* HOME */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

/* LAUNCHER */
app.get("/launcher", (req, res) => {
  res.sendFile(path.join(__dirname, "public/launcher.html"));
});

/* LOGIN API */
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  console.log("LOGIN TRY:", username, password);

  if (username === USER && password === PASS) {
    return res.json({ success: true });
  }

  return res.json({ success: false });
});

/* ================= MAIL ================= */

const HOURLY_LIMIT = 27;
const DELAY = 120;

let stats = {};
setInterval(() => { stats = {}; }, 60 * 60 * 1000);

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post("/send", async (req, res) => {
  const { senderName, gmail, apppass, to, subject, message } = req.body;

  if (!gmail || !apppass || !to || !message) {
    return res.json({ success: false, msg: "Missing fields" });
  }

  if (!emailRegex.test(gmail)) {
    return res.json({ success: false, msg: "Invalid Gmail" });
  }

  if (!stats[gmail]) stats[gmail] = { count: 0 };

  const recipients = to
    .split(/,|\n/)
    .map(r => r.trim())
    .filter(r => emailRegex.test(r));

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
    return res.json({ success: false, msg: "Gmail login failed" });
  }

  let sent = 0;

  for (let r of recipients) {
    if (stats[gmail].count >= HOURLY_LIMIT) break;

    try {
      await transporter.sendMail({
        from: `"${senderName || "Support"}" <${gmail}>`,
        to: r,
        subject: subject || "Hello",
        text: message
      });

      sent++;
      stats[gmail].count++;

      await new Promise(r => setTimeout(r, DELAY));

    } catch (err) {
      console.log("Mail error:", err.message);
    }
  }

  res.json({ success: true, sent });
});

/* START */
app.listen(process.env.PORT || 3000, () => {
  console.log("✅ SERVER RUNNING");
  console.log("LOGIN:", USER, PASS);
});
