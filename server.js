import express from "express";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

/* ===== SAFE LIMITS ===== */
const BATCH_SIZE = 5;
const BATCH_DELAY = 300;

const DAILY_LIMIT = 500;

/* ===== MIDDLEWARE ===== */
app.use(express.json({ limit: "30kb" }));
app.use(express.static(path.join(__dirname, "public")));
app.disable("x-powered-by");

/* ===== LOGIN ===== */
const USER = "@#@#";
const PASS = "@#@#";

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (username === USER && password === PASS) {
    return res.json({ success: true });
  }
  return res.json({ success: false });
});

/* ===== ROUTES ===== */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

app.get("/launcher", (req, res) => {
  res.sendFile(path.join(__dirname, "public/launcher.html"));
});

/* ===== HELPERS ===== */
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (t = "", max = 2000) =>
  t.replace(/\r\n/g, "\n")
   .replace(/\n{3,}/g, "\n\n")
   .trim()
   .slice(0, max);

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ===== SEND EMAIL ===== */
app.post("/send", async (req, res) => {
  try {
    const { senderName, gmail, apppass, subject, message, to } = req.body;

    if (!gmail || !apppass || !to || !message) {
      return res.json({ success: false, msg: "Missing fields" });
    }

    if (!emailRegex.test(gmail)) {
      return res.json({ success: false, msg: "Invalid Gmail" });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmail, pass: apppass }
    });

    try {
      await transporter.verify();
    } catch {
      return res.json({ success: false, msg: "Gmail login failed" });
    }

    const recipients = to
      .split(/[\n,]+/)
      .map(e => e.trim())
      .filter(e => emailRegex.test(e))
      .slice(0, HOURLY_LIMIT);

    let sent = 0;

    for (const email of recipients) {
      try {
        await transporter.sendMail({
          from: `"${clean(senderName || gmail, 60)}" <${gmail}>`,
          to: email,
          subject: clean(subject || "Hello", 120),
          text: clean(message),

          // 👇 important for trust
          replyTo: gmail,
          headers: {
            "X-Mailer": "NodeMailer"
          }
        });

        sent++;

      } catch (err) {
        console.log("Fail:", email);
      }

      await sleep(DELAY);
    }

    return res.json({ success: true, sent });

  } catch (err) {
    console.log(err.message);
    return res.json({ success: false, msg: "Server error" });
  }
});

/* ===== START ===== */
app.listen(PORT, () => {
  console.log("✅ Safe mail server running");
});
