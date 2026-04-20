import express from "express";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json({ limit: "40kb" }));
app.disable("x-powered-by");

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

/* ⚖️ SAFE LIMITS */
const HOURLY_LIMIT = 27;
const DELAY_MS = 120; // 1 sec gap (safe)

let stats = {};
setInterval(() => {
  stats = {};
}, 60 * 60 * 1000);

/* 🧹 CLEAN */
const clean = t => (t || "").trim().slice(0, 2000);
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ✉️ SAFE TEMPLATE (IMPORTANT) */
const buildTemplate = (name, message) => {
  return {
    text: `Hello,

${message}

Best regards,
${name}`,
    html: `
      <div style="font-family:Arial;line-height:1.6">
        <p>Hello,</p>
        <p>${message}</p>
        <p>Best regards,<br>${name}</p>
      </div>
    `
  };
};

/* 🚀 SEND */
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

  const safeName = clean(senderName) || "Support";

  let sent = 0;

  for (let r of recipients) {
    if (stats[gmail].count >= HOURLY_LIMIT) break;

    const { text, html } = buildTemplate(safeName, clean(message));

    try {
      await transporter.sendMail({
        from: `"${safeName}" <${gmail}>`,
        to: r,
        subject: clean(subject) || "Hello",
        text,
        html,
        replyTo: gmail
      });

      sent++;
      stats[gmail].count++;

      // ⏱ delay
      await new Promise(res => setTimeout(res, DELAY_MS));

    } catch (err) {
      console.log("Fail:", err.message);
    }
  }

  return res.json({ success: true, sent });
});

app.listen(process.env.PORT || 3000, () => {
  console.log("✅ Safe Mail Server Running");
});
