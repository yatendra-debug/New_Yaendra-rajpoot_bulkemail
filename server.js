import express from "express";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* BASIC */
app.use(express.json({ limit: "30kb" }));
app.disable("x-powered-by");

/* STATIC */
app.use(express.static(path.join(__dirname, "public")));

/* ROUTES */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/launcher", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "launcher.html"));
});

/* LOGIN */
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (
    username === process.env.APP_USER &&
    password === process.env.APP_PASS
  ) {
    return res.json({ success: true });
  }

  res.json({ success: false });
});

/* LIMITS */
const HOURLY_LIMIT = 27;
const DELAY = 120;

let stats = {};
setInterval(() => { stats = {}; }, 60 * 60 * 1000);

/* EMAIL */
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
    return res.json({ success: false, msg: "Login failed" });
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

      await new Promise(res => setTimeout(res, DELAY));

    } catch (err) {
      console.log(err.message);
    }
  }

  res.json({ success: true, sent });
});

/* START */
app.listen(process.env.PORT || 3000, () => {
  console.log("✅ Server Running");
});
