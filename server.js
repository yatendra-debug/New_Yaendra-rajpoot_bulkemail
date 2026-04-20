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

/* 🏠 HOME → LOGIN */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

/* 🔐 LOGIN CHECK API */
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  // 👉 SAME ID + PASS CONDITION
  if (username === "%%%%%%" && password === "%%%%%%") {
    return res.json({ success: true });
  }

  res.json({ success: false, msg: "Wrong login ❌" });
});

/* ⚖️ LIMITS */
const HOURLY_LIMIT = 27;
const DELAY = 120; // safe 
const PARALLEL = 2;

let stats = {};
setInterval(() => { stats = {}; }, 60 * 60 * 1000);

/* 🧪 HELPERS */
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (t = "", max = 2000) =>
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

  if (recipients.length === 0) {
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
  console.log("✅ Server Running");
});
