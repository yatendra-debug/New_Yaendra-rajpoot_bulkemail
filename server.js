import express from "express";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

/* ===== SAFE LIMIT SETTINGS ===== */
const HOURLY_LIMIT = 25;     // safe range
const DELAY = 1500;         // 1.5 sec delay (important)

/* ===== MIDDLEWARE ===== */
app.use(express.json({ limit: "50kb" }));
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

  res.json({ success: false, msg: "Wrong login ❌" });
});

/* ===== ROUTES ===== */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

app.get("/launcher", (req, res) => {
  res.sendFile(path.join(__dirname, "public/launcher.html"));
});

/* ===== EMAIL VALIDATION ===== */
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ===== SEND EMAIL ===== */
app.post("/send", async (req, res) => {
  try {
    const { senderName, gmail, apppass, subject, message, to } = req.body;

    if (!gmail || !apppass || !to || !message) {
      return res.json({ success: false, msg: "Missing fields ❌" });
    }

    if (!emailRegex.test(gmail)) {
      return res.json({ success: false, msg: "Invalid Gmail ❌" });
    }

    /* ===== TRANSPORTER ===== */
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

    /* ===== RECIPIENTS CLEAN ===== */
    let recipients = to
      .split(/[\n,]+/)
      .map(e => e.trim())
      .filter(e => emailRegex.test(e));

    if (recipients.length === 0) {
      return res.json({ success: false, msg: "No valid emails ❌" });
    }

    recipients = recipients.slice(0, HOURLY_LIMIT);

    let sent = 0;

    /* ===== SAFE LOOP ===== */
    for (let email of recipients) {
      try {
        await transporter.sendMail({
          from: `"${senderName || gmail}" <${gmail}>`,
          to: email,
          subject: (subject || "Hello").slice(0, 100),
          text: (message || "Hi").slice(0, 3000),
          replyTo: gmail,
          headers: {
            "X-Mailer": "NodeMailer",
            "X-Priority": "3"
          }
        });

        sent++;

      } catch (err) {
        console.log("Fail:", email);
      }

      await new Promise(r => setTimeout(r, DELAY));
    }

    return res.json({ success: true, sent });

  } catch (err) {
    console.log(err);
    return res.json({ success: false, msg: "Server error ❌" });
  }
});

/* ===== START ===== */
app.listen(PORT, () => {
  console.log("✅ Server running on port", PORT);
});
