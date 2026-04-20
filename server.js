import express from "express";
import nodemailer from "nodemailer";
import path from "path";
import session from "express-session";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* 🔐 SECURITY */
app.use(express.json({ limit: "30kb" }));
app.disable("x-powered-by");

/* 🔑 SESSION (IMPORTANT FIX) */
app.use(session({
  secret: "supersecretkey",
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

/* 📁 STATIC */
app.use(express.static(path.join(__dirname, "public")));

/* 🏠 HOME → LOGIN */
app.get("/", (req, res) => {
  if (req.session.loggedIn) {
    return res.sendFile(path.join(__dirname, "public", "launcher.html"));
  }
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

/* 🔐 LOGIN API */
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  // simple check (change if needed)
  if (username === "admin" && password === "1234") {
    req.session.loggedIn = true;
    return res.json({ success: true });
  }

  res.json({ success: false });
});

/* 🔓 LOGOUT */
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

/* ⚖️ LIMITS */
const HOURLY_LIMIT = 15;
const DELAY = 12000;

let stats = {};
setInterval(() => { stats = {}; }, 60 * 60 * 1000);

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (t = "", max = 2000) =>
  t.replace(/\r\n/g, "\n")
   .replace(/\n{3,}/g, "\n\n")
   .trim()
   .slice(0, max);

/* 📤 SEND (PROTECTED ROUTE) */
app.post("/send", async (req, res) => {

  if (!req.session.loggedIn) {
    return res.status(401).json({ msg: "Login required ❌" });
  }

  const { senderName, gmail, apppass, to, subject, message } = req.body;

  if (!gmail || !apppass || !to || !message) {
    return res.json({ success: false });
  }

  if (!emailRegex.test(gmail)) {
    return res.json({ success: false });
  }

  if (!stats[gmail]) stats[gmail] = { count: 0 };
  if (stats[gmail].count >= HOURLY_LIMIT) {
    return res.json({ success: false });
  }

  const recipients = to.split(/,|\n/).map(r => r.trim()).filter(r => emailRegex.test(r));

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmail, pass: apppass }
  });

  try {
    await transporter.verify();
  } catch {
    return res.json({ success: false });
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
    } catch {}
  }

  res.json({ success: true, sent });
});

/* 🚀 START */
app.listen(process.env.PORT || 3000, () => {
  console.log("✅ Login + Mail Server Running");
});
