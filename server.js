import express from "express";
import nodemailer from "nodemailer";

const app = express();
app.use(express.json({ limit: "30kb" }));
app.disable("x-powered-by");

/* ⚖️ SAFE LIMITS */
const HOURLY_LIMIT = 27;   // safe zone
const PARALLEL = 2;       //  low risk
const DELAY_MS = 122;     // natural delay

let stats = {};
setInterval(() => { stats = {}; }, 60 * 60 * 1000);

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const wait = () =>
  new Promise(r =>
    setTimeout(r, Math.floor(Math.random() * (DELAY_MAX - DELAY_MIN) + DELAY_MIN))
  );

/* ✉️ NATURAL TEMPLATE */
const buildMail = (name, msg) => ({
  text: `Hello,

${msg}

Best regards,
${name}`,
  html: `
  <div style="font-family:Arial;line-height:1.6">
    <p>Hello,</p>
    <p>${msg}</p>
    <p>Best regards,<br>${name}</p>
  </div>`
});

app.post("/send", async (req, res) => {
  const { senderName, gmail, apppass, to, subject, message } = req.body;

  if (!gmail || !apppass || !to || !message) {
    return res.json({ success: false, msg: "Missing fields" });
  }

  if (!emailRegex.test(gmail)) {
    return res.json({ success: false, msg: "Invalid Gmail" });
  }

  if (!stats[gmail]) stats[gmail] = { count: 0 };
  if (stats[gmail].count >= HOURLY_LIMIT) {
    return res.json({ success: false, msg: "Limit reached" });
  }

  const recipients = to
    .split(/,|\n/)
    .map(r => r.trim())
    .filter(r => emailRegex.test(r));

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmail, pass: apppass }
  });

  try {
    await transporter.verify();
  } catch {
    return res.json({ success: false, msg: "Login failed" });
  }

  const name = senderName || "Support";
  let sent = 0;

  for (let r of recipients) {
    if (stats[gmail].count >= HOURLY_LIMIT) break;

    const { text, html } = buildMail(name, message);

    try {
      await transporter.sendMail({
        from: `"${name}" <${gmail}>`,
        to: r,
        subject: subject || "Hello",
        text,
        html,
        replyTo: gmail,
        headers: {
          "X-Mailer": "NodeMailer",
        }
      });

      sent++;
      stats[gmail].count++;

      await wait(); // ⏱ smart delay

    } catch (err) {
      console.log("Fail:", err.message);
    }
  }

  res.json({ success: true, sent });
});

app.listen(process.env.PORT || 3000, () => {
  console.log("✅ Safe Mail Server Running");
});
