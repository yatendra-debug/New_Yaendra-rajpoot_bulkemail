import express from "express";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* 🔐 SECURITY */
app.use(express.json({ limit: "40kb" }));
app.disable("x-powered-by");

/* 📁 STATIC */
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

/* ⚙️ SAME SAFE SPEED */
const HOURLY_LIMIT = 27;
const PARALLEL = 2;
const DELAY_MS = 200;

let stats = {};
setInterval(() => { stats = {}; }, 60 * 60 * 1000);

/* 🧹 CLEAN */
const cleanText = t =>
  (t || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 2500);

const cleanSubject = s =>
  (s || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);

const cleanName = n =>
  (n || "")
    .replace(/[<>"]/g, "")
    .trim()
    .slice(0, 50);

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* 🔥 TEMPLATE POOL */
const templates = [
`Hi,

I came across your website and it looks really well designed.

I just noticed it’s not appearing much in search results. If you’d like, I can share a few details that might help improve its visibility.

Let me know.`,

`Hello,

Your website looks great and feels well put together.

I was checking it online and couldn’t find it easily in search results. I have a few suggestions that might help — happy to share if you're interested.`,

`Hey,

I recently visited your site — it looks clean and professional.

I noticed it’s not showing up much on search engines. I can send over some quick insights if you’d like.`,

`Hi there,

Your website design is really nice.

While searching, I didn’t see it coming up in results. I’ve got a couple of ideas that could help — let me know if you want me to share them.`,

`Hello,

I checked your website and it looks solid.

It seems a bit hard to find through search engines right now. If you're open to it, I can share a few helpful suggestions.`
];

/* 🔥 SUBJECT POOL */
const subjects = [
  "Quick question about your website",
  "Small observation about your site",
  "Regarding your website visibility",
  "A quick note",
  "Suggestion for your website"
];

/* 🎯 RANDOM PICK */
function getRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* 🚀 SAFE SENDING */
async function sendSafely(transporter, mails) {
  let sent = 0;

  for (let i = 0; i < mails.length; i += PARALLEL) {
    const batch = mails.slice(i, i + PARALLEL);

    const results = await Promise.allSettled(
      batch.map(m => transporter.sendMail(m))
    );

    results.forEach(r => {
      if (r.status === "fulfilled") sent++;
      else console.log("Fail:", r.reason?.message);
    });

    const delay = DELAY_MS + Math.floor(Math.random() * 120);
    await new Promise(r => setTimeout(r, delay));
  }

  return sent;
}

/* 📩 SEND */
app.post("/send", async (req, res) => {
  const { senderName, gmail, apppass, to } = req.body;

  if (!gmail || !apppass || !to)
    return res.json({ success: false, msg: "Missing fields ❌" });

  if (!emailRegex.test(gmail))
    return res.json({ success: false, msg: "Invalid Gmail ❌" });

  if (!stats[gmail]) stats[gmail] = { count: 0 };

  if (stats[gmail].count >= HOURLY_LIMIT)
    return res.json({ success: false, msg: "Hourly limit reached ❌" });

  const recipients = to
    .split(/,|\n/)
    .map(r => r.trim())
    .filter(r => emailRegex.test(r));

  const remaining = HOURLY_LIMIT - stats[gmail].count;

  if (recipients.length === 0)
    return res.json({ success: false, msg: "No valid recipients ❌" });

  if (recipients.length > remaining)
    return res.json({ success: false, msg: "Limit full ❌" });

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmail, pass: apppass }
  });

  try {
    await transporter.verify();
  } catch {
    return res.json({ success: false, msg: "Gmail login failed ❌" });
  }

  const safeName = cleanName(senderName) || gmail;

  /* 📤 MAIL BUILD WITH ROTATION */
  const mails = recipients.map(r => ({
    from: `"${safeName}" <${gmail}>`,
    to: r,
    subject: cleanSubject(getRandom(subjects)),
    text: cleanText(getRandom(templates))
  }));

  const sent = await sendSafely(transporter, mails);
  stats[gmail].count += sent;

  res.json({ success: true, sent });
});

app.listen(process.env.PORT || 3000, () => {
  console.log("✅ Safe Mail Server Running");
});
