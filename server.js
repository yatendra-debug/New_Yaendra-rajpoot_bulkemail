import express from "express";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ===== LIMIT SETTINGS (SAFE) =====
const HOURLY_LIMIT = 27;
const DELAY = 120;

// ===== MIDDLEWARE =====
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ===== LOGIN (FIXED) =====
const USER = "@#@#";
const PASS = "@#@#";

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (username === USER && password === PASS) {
    return res.json({ success: true });
  }

  res.json({ success: false, msg: "Wrong login ❌" });
});

// ===== IMPORTANT ROUTES FIX =====

// default page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

// 🔥 FIX: launcher route
app.get("/launcher", (req, res) => {
  res.sendFile(path.join(__dirname, "public/launcher.html"));
});

// ===== EMAIL SEND =====
app.post("/send", async (req, res) => {
  try {
    const { senderName, gmail, apppass, subject, message, to } = req.body;

    if (!gmail || !apppass || !to) {
      return res.json({ success: false, msg: "Missing fields ❌" });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: gmail,
        pass: apppass
      }
    });

    let recipients = to
      .split(/[\n,]+/)
      .map(e => e.trim())
      .filter(Boolean);

    recipients = recipients.slice(0, HOURLY_LIMIT);

    let sent = 0;

    for (let email of recipients) {
      try {
        await transporter.sendMail({
          from: `"${senderName || gmail}" <${gmail}>`,
          to: email,
          subject: subject || "Hello",
          text: message || "Hi"
        });

        sent++;
      } catch (err) {
        console.log("Fail:", email);
      }

      await new Promise(r => setTimeout(r, DELAY));
    }

    res.json({ success: true, sent });

  } catch (err) {
    console.log(err);
    res.json({ success: false, msg: "Server error ❌" });
  }
});

// ===== START =====
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
