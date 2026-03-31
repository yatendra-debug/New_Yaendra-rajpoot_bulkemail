const express = require("express");
const nodemailer = require("nodemailer");
const path = require("path");

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static("public"));

const PORT = process.env.PORT || 89829;

// ===== ROOT =====
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

// ===== SENDER NAMES =====
const names = [
"Olivia","Emma","Amelia","Charlotte","Mia","Sophia","Isabella","Evelyn",
"Ava","Sofia","Camila","Harper","Luna","Eleanor","Violet","Aurora"
];

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ===== SAFE SUBJECTS =====
const subjects = [
"Hello",
"Quick update",
"Small update",
"Just checking",
"Update",
"Information",
"Note",
"Simple message"
];

function getSubject(userSub) {
  if (userSub && userSub.trim() !== "") return userSub.trim();
  return rand(subjects);
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
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function clean(list) {
  return [...new Set(list.filter(isValidEmail))];
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

  // SAFE LIMIT
  if (limits[email].count + total > 20) return false;

  limits[email].count += total;
  return true;
}

// ===== DELAY =====
const delay = (ms) => new Promise(r => setTimeout(r, ms));

// ===== SPEED (SAFE BALANCE) =====
const BATCH_SIZE = 3;      // safer than 5
const PARALLEL = 1;        // sequential = safest
const BASE_DELAY = 700;    // slower = better inbox
const LONG_PAUSE = 10;     // pause every 10 mails

// ===== TRANSPORT =====
function transporter(email, pass) {
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: email, pass }
  });
}

// ===== SEND =====
app.post("/send", async (req, res) => {
  try {
    const { email, password, subject, message, recipients } = req.body;

    if (!email || !password || !recipients) {
      return res.json({ status: "error" });
    }

    if (!isValidEmail(email)) {
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

    for (let i = 0; i < list.length; i++) {
      const to = list[i];

      try {
        const html = format(message);

        await t.sendMail({
          from: `"${rand(names)}" <${email}>`,
          to,
          subject: getSubject(subject),
          text: message,
          html: `<div style="font-family:Arial">${html}</div>`
        });

        sent++;

        // normal delay
        await delay(BASE_DELAY + Math.random() * 400);

        // long pause (important)
        if (sent % LONG_PAUSE === 0) {
          await delay(2000 + Math.random() * 2000);
        }

      } catch (e) {
        console.log("Fail:", to);
      }
    }

    res.json({ status: "success", sent });

  } catch {
    res.json({ status: "error" });
  }
});

// ===== START =====
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
