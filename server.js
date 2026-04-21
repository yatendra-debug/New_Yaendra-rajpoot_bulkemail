import express from "express";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

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

  if (
    username === process.env.APP_USER &&
    password === process.env.APP_PASS
  ) {
    return res.json({ success: true });
  }

  return res.json({ success: false });
});

/* ⚖️ SETTINGS (ENV BASED) */
const HOURLY_LIMIT = Number(process.env.HOURLY_LIMIT || 25);
const PARALLEL = Number(process.env.PARALLEL || 2);
const BASE_DELAY = Number(process.env.BASE_DELAY || 1200);
const JITTER = Number(process.env.JITTER || 800);

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
const delay = () => BASE_DELAY + Math.floor(Math.random() * JITTER);

/* 📤 SEND */
app.post("/send", async (req, res) => {
  try {
    const { senderName, gmail, apppass, to, subject, message } = req.body;

    if (!gmail || !apppass || !to || !message) {
      return res.json({ success: false, msg: "Missing fields" });
    }

    if (!emailRegex.test(gmail)) {
      return res.json({ success: false, msg: "Invalid Gmail" });
    }

    if (!usage[gmail]) usage[gmail] = 0;

    if (usage[gmail] >= HOURLY_LIMIT) {
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

    let sent = 0;

    for (let i = 0; i < recipients.length; i += PARALLEL) {
      if (usage[gmail] >= HOURLY_LIMIT) break;

      const batch = recipients.slice(i, i + PARALLEL);

      await Promise.all(
        batch.map(async (r) => {
          try {
            await transporter.sendMail({
              from: `"${clean(senderName || gmail)}" <${gmail}>`,
              to: r,
              subject: clean(subject || "Hello"),
              text: clean(message),
              replyTo: gmail
            });

            sent++;
            usage[gmail]++;

          } catch (err) {
            console.log("Send fail:", err.message);
          }
        })
      );

      await sleep(delay());
    }

    return res.json({ success: true, sent });

  } catch (err) {
    console.log("SERVER ERROR:", err.message);
    return res.json({ success: false, msg: "Server error" });
  }
});

/* 🚀 START */
app.listen(process.env.PORT || 3000, () => {
  console.log("✅ Server running");
});
