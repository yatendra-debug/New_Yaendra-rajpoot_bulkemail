import express from "express";
import nodemailer from "nodemailer";

const app = express();
app.use(express.json({ limit: "30kb" }));
app.disable("x-powered-by");

/* ⚖️ SAFE LIMITS (Gmail friendly) */
const HOURLY_LIMIT = 27;   // safe zone
const PARALLEL = 2;       //  low risk
const DELAY_MS = 122;     // natural delay

/* 📊 HOURLY TRACK */
let stats = {};
setInterval(() => {
  stats = {};
}, 60 * 60 * 1000);

/* 🧪 HELPERS */
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (t = "", max = 2000) =>
  t.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);

const wait = () =>
  new Promise((res) =>
    setTimeout(
      res,
      Math.floor(Math.random() * (DELAY_MAX - DELAY_MIN) + DELAY_MIN)
    )
  );

/* ✉️ NATURAL TEMPLATE (text + html) */
const buildMail = (name, message) => ({
  text: `Hello,

${message}

Best regards,
${name}`,
  html: `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#222">
      <p>Hello,</p>
      <p>${message}</p>
      <p>Best regards,<br>${name}</p>
    </div>
  `
});

/* 📤 SEND API */
app.post("/send", async (req, res) => {
  const { senderName, gmail, apppass, to, subject, message } = req.body;

  /* ❌ VALIDATION */
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

  /* 📬 CLEAN RECIPIENTS */
  const recipients = to
    .split(/,|\n/)
    .map((r) => r.trim())
    .filter((r) => emailRegex.test(r));

  if (recipients.length === 0) {
    return res.json({ success: false, msg: "No valid recipients ❌" });
  }

  /* 📡 TRANSPORT */
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
    return res.json({ success: false, msg: "Gmail login failed ❌" });
  }

  const safeName = clean(senderName || "Support", 50);
  const safeSubject = clean(subject || "Hello", 100);
  const safeMessage = clean(message, 2000);

  let sent = 0;

  /* 🚀 SAFE LOOP (slow sending) */
  for (let r of recipients) {
    if (stats[gmail].count >= HOURLY_LIMIT) break;

    const { text, html } = buildMail(safeName, safeMessage);

    try {
      await transporter.sendMail({
        from: `"${safeName}" <${gmail}>`,
        to: r,
        subject: safeSubject,
        text,
        html,
        replyTo: gmail,
        headers: {
          "X-Mailer": "NodeMailer"
        }
      });

      sent++;
      stats[gmail].count++;

      await wait(); // ⏱ smart delay
    } catch (err) {
      console.log("Send fail:", err.message);
    }
  }

  return res.json({ success: true, sent });
});

/* 🟢 START */
app.listen(process.env.PORT || 3000, () => {
  console.log("✅ Clean & Safe Mail Server Running");
});
