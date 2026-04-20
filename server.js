import express from "express";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json({ limit: "30kb" }));
app.disable("x-powered-by");

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/launcher", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "launcher.html"));
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (username === "%%%%%%" && password === "%%%%%%") {
    return res.json({ success: true });
  }

  res.json({ success: false });
});

const HOURLY_LIMIT = 27;
const PARALLEL = 2;
const DELAY = 120;

let stats = {};
setInterval(() => { stats = {}; }, 60 * 60 * 1000);

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post("/send", async (req, res) => {
  const { senderName, gmail, apppass, to, subject, message } = req.body;

  if (!gmail || !apppass || !to || !message) {
    return res.json({ success: false });
  }

  if (!emailRegex.test(gmail)) {
    return res.json({ success: false });
  }

  if (!stats[gmail]) stats[gmail] = { count: 0 };

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
    try {
      await transporter.sendMail({
        from: `"${senderName}" <${gmail}>`,
        to: r,
        subject,
        text: message
      });

      sent++;
      await new Promise(res => setTimeout(res, DELAY));

    } catch {}
  }

  res.json({ success: true, sent });
});

app.listen(process.env.PORT || 3000);
