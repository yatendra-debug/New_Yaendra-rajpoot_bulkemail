import express from "express";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "25kb" }));
app.use(express.static(path.join(__dirname, "public")));

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

/* ⚖️ SAFE LIMIT */
const HOURLY_LIMIT = 27;  
const PARALLEL = 2;
const DELAY = 120;

let usage = {};
setInterval(() => { usage = {}; }, 60 * 60 * 1000);

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
    const { senderName, gmail, apppass, to, subject, message } = req.body;

    if (!gmail || !apppass || !to || !message) {
      return res.json({ success: false, msg: "Missing fields" });
    }

    if (!emailRegex.test(gmail)) {
      return res.json({ success: false, msg: "Invalid email" });
    }

    if (!usage[gmail]) usage[gmail] = 0;
    if (usage[gmail] >= LIMIT) {
      return res.json({ success: false, msg: "Limit reached" });
    }

    const list = to
      .split(/,|\n/)
      .map(e => e.trim())
      .filter(e => emailRegex.test(e));

    if (!list.length) {
      return res.json({ success: false, msg: "No valid emails" });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmail, pass: apppass }
    });

    await transporter.verify();

    let sent = 0;

    for (const r of list) {
      if (usage[gmail] >= LIMIT) break;

      try {
        await transporter.sendMail({
          from: `"${clean(senderName || "Hello")}" <${gmail}>`,
          to: r,
          subject: clean(subject || "Quick question"),

          // 🔥 PURE CLEAN MESSAGE (NO TRICKS)
          text: clean(message),

          replyTo: gmail
        });

        sent++;
        usage[gmail]++;
        await sleep(DELAY);

      } catch (e) {
        console.log("Fail:", e.message);
      }
    }

    res.json({ success: true, sent });

  } catch {
    res.json({ success: false, msg: "Server error" });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("✅ Clean Mail Server Running");
});
