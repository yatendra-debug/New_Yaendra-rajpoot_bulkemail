const express = require("express");
const nodemailer = require("nodemailer");
const path = require("path");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

const PORT = process.env.PORT || 89829;

// ===== ROOT =====
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

// ===== SUBJECT =====
function getSubject(sub) {
  if (sub && sub.trim() !== "") return sub.trim();
  return "Hello";
}

// ===== FORMAT =====
function format(msg) {
  return msg
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/\n/g,"<br>");
}

// ===== VALID =====
function isValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function clean(list) {
  return [...new Set(list.filter(isValid))];
}

// ===== LIMIT =====
const limits = {};

function checkLimit(email, total) {
  const now = Date.now();

  if (!limits[email]) {
    limits[email] = { count: 0, start: now };
  }

  if ((now - limits[email].start) > 3600000) {
    limits[email] = { count: 0, start: now };
  }

  if (limits[email].count + total > 27) return false;

  limits[email].count += total;
  return true;
}

// ===== DELAY =====
const delay = ms => new Promise(r => setTimeout(r, ms));

// ===== SPEED =====
const BATCH_SIZE = 3;
const PARALLEL = 2;
const BASE_DELAY = 250;
const LONG_PAUSE = 10;

// ===== TRANSPORT =====
function transporter(email, pass) {
  return nodemailer.createTransport({
    service: "gmail",
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    auth: { user: email, pass }
  });
}

// ===== SEND =====
app.post("/send", async (req, res) => {
  try {
    const { senderName, email, password, subject, message, recipients } = req.body;

    if (!email || !password || !recipients) {
      return res.json({ status: "error" });
    }

    if (!isValid(email)) {
      return res.json({ status: "error" });
    }

    let list = clean(recipients.split(/\n|,/).map(e => e.trim()));

    if (!checkLimit(email, list.length)) {
      return res.json({ status: "limit" });
    }

    const t = transporter(email, password);

    try {
      await t.verify();
    } catch {
      return res.json({ status: "auth_error" });
    }

    let sent = 0;

    // ===== STRICT SENDER NAME =====
    let fromField;
    if (senderName && senderName.trim() !== "") {
      fromField = `"${senderName.trim()}" <${email}>`;
    } else {
      fromField = email;
    }

    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = list.slice(i, i + BATCH_SIZE);

      for (let j = 0; j < batch.length; j += PARALLEL) {
        const group = batch.slice(j, j + PARALLEL);

        await Promise.all(
          group.map(async (to) => {
            try {
              await t.sendMail({
                from: fromField, // ✅ EXACT sender name
                to,
                subject: getSubject(subject),
                text: message,
                html: `<div style="font-family:Arial">${format(message)}</div>`
              });

              sent++;
            } catch {}
          })
        );
      }

      await delay(BASE_DELAY);

      if (sent % LONG_PAUSE === 0) {
        await delay(1200 + Math.random() * 800);
      }
    }

    res.json({ status: "success", sent });

  } catch {
    res.json({ status: "error" });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
