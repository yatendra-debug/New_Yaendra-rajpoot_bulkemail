import express from "express";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* 🔐 BASIC SECURITY */
app.use(express.json({ limit: "30kb" }));
app.disable("x-powered-by");

/* 📁 STATIC FILES */
app.use(express.static(path.join(__dirname, "public")));

/* 🏠 HOME ROUTE (IMPORTANT FIX) */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "launcher.html"));
});

/* ⚖️ SAFE LIMITS */
const HOURLY_LIMIT = 15;
const DELAY = 12000; // 12 sec

let stats = {};
setInterval(() => {
  stats = {};
}, 60 * 60 * 1000);

/* 🧪 HELPERS */
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (t = "", max = 2000) =>
  t.replace(/\r\n/g, "\n")
   .replace(/\n{3,}/g, "\n\n")
   .trim()
   .slice(0, max);

/* 📤 SEND API */
app.post("/send", async (req, res) => {
  const { senderName, gmail, apppass, to, subject, message } = req.body;

  if (!gmail || !apppass || !to || !message) {
    return res.json({ success: false, msg: "Missing fields ❌" });
  }

  if (!emailRegex.test(gmail)) {
    return res.json({ success: false, msg: "Invalid Gmail ❌" });
  }

  if (!stats[gmail]) stats[gmail] = { count: 0 };

  if (stats[gmail].count >= HOURLY_LIMIT) {
    return res.json({ success: false, msg: "Hourly limit reached ❌" });
  }

  const recipients = to
    .split(/,|\n/)
    .map(r => r.trim())
    .filter(r => emailRegex.test(r));

  if (recipients.length === 0) {
    return res.json({ success: false, msg: "No valid recipients ❌" });
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
    return res.json({ success: false, msg: "Login failed ❌" });
  }

  const safeName = clean(senderName || "Support", 50);
  const safeSubject = clean(subject || "Hello", 100);
  const safeMessage = clean(message, 2000);

  let sent = 0;

  for (let r of recipients) {
    if (stats[gmail].count >= HOURLY_LIMIT) break;

    try {
      await transporter.sendMail({
        from: `"${safeName}" <${gmail}>`,
        to: r,
        subject: safeSubject,
        text: safeMessage,
        replyTo: gmail
      });

      sent++;
      stats[gmail].count++;

      await new Promise(res => setTimeout(res, DELAY)); // ⏱ delay

    } catch (err) {
      console.log("Send fail:", err.message);
    }
  }

  return res.json({ success: true, sent });
});

/* 🟢 START SERVER */
app.listen(process.env.PORT || 3000, () => {
  console.log("✅ Server Running Successfully");
});
