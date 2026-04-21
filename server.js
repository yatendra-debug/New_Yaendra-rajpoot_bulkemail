import express from "express";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* 🔐 BASIC */
app.disable("x-powered-by");
app.use(express.json({ limit: "25kb" }));

/* 📁 STATIC */
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

/* ⚖️ SAFE LIMITS (KEEP LOW) */
const HOURLY_LIMIT = 27;
const PARALLEL = 2;
const DELAY = 120;

let usage = {};
setInterval(() => { usage = {}; }, 60 * 60 * 1000);

/* 🧪 HELPERS */
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (t = "", max = 2000) =>
  t.replace(/\r\n/g, "\n")
   .replace(/\n{3,}/g, "\n\n")
   .trim()
   .slice(0, max);

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 📤 SEND */
app.post("/send", async (req, res) => {
  try {
    const { senderName, gmail, apppass, to, subject, message } = req.body || {};

    if (!gmail || !apppass || !to || !message) {
      return res.json({ success: false, msg: "Missing fields" });
    }

    if (!emailRegex.test(gmail)) {
      return res.json({ success: false, msg: "Invalid Gmail" });
    }

    if (!usage[gmail]) usage[gmail] = { count: 0 };
    if (usage[gmail].count >= HOURLY_LIMIT) {
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
      auth: { user: gmail, pass: apppass }
    });

    try {
      await transporter.verify();
    } catch {
      return res.json({ success: false, msg: "Login failed" });
    }

    let sent = 0;

    for (const r of recipients) {
      if (usage[gmail].count >= HOURLY_LIMIT) break;

      try {
        await transporter.sendMail({
          from: `"${clean(senderName || "Support")}" <${gmail}>`,
          to: r,
          subject: clean(subject || "Hello"),

          // 🔥 CLEAN TEXT (NO SPAMMY FORMAT)
          text: clean(message) + "\n\n—\n

          replyTo: gmail
        });

        sent++;
        usage[gmail].count++;

        await sleep(DELAY_MS);

      } catch (err) {
        console.log("Send error:", err.message);
      }
    }

    res.json({ success: true, sent });

  } catch (err) {
    res.json({ success: false, msg: "Server error" });
  }
});

/* 🚀 START */
app.listen(process.env.PORT || 3000, () => {
  console.log("✅ Clean Mail Server Running");
});
