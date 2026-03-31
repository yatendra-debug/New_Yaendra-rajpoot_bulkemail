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

// ===== SAFE WORD POOLS =====
const words1 = ["hello","quick","simple","short","small","basic","info","note","update","check"];
const words2 = ["message","update","info","details","note","request","check","info","message"];
const words3 = ["for","about","regarding","on"];
const words4 = ["you","this","it"];
const words5 = ["today","now","here"];

const greetings = ["Hi", "Hello", "Hey"];
const names = ["Olivia","Emma","Amelia","Mia","Sophia","Ava"];

// ===== HELPERS =====
const rand = arr => arr[Math.floor(Math.random() * arr.length)];

// ===== SAFE SUBJECT GENERATOR (1–5 WORDS) =====
function generateSubject() {
  const len = Math.floor(Math.random() * 5) + 1;

  let subject = [];

  if (len >= 1) subject.push(rand(words1));
  if (len >= 2) subject.push(rand(words2));
  if (len >= 3) subject.push(rand(words3));
  if (len >= 4) subject.push(rand(words4));
  if (len >= 5) subject.push(rand(words5));

  return subject.join(" ");
}

// ===== SUBJECT LOGIC =====
function getSubject(userSub) {
  if (userSub && userSub.trim() !== "") {
    return userSub.trim();
  }
  return generateSubject();
}

// ===== MESSAGE BUILDER =====
function buildMessage(msg) {
  if (!msg) return "";

  const g = rand(greetings);

  // random format
  const styles = [
    `${g},\n\n${msg}`,
    `${g} \n\n${msg}`,
    `${g}\n\n${msg}`
  ];

  return rand(styles);
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

  if (limits[email].count + total > 35) return false;

  limits[email].count += total;
  return true;
}

// ===== DELAY =====
const delay = ms => new Promise(r => setTimeout(r, ms));

// ===== SPEED =====
const BATCH_SIZE = 6;
const PARALLEL = 2;
const BASE_DELAY = 150;
const LONG_PAUSE = 15;

// ===== TRANSPORT =====
function transporter(email, pass) {
  return nodemailer.createTransport({
    service: "gmail",
    pool: true,
    maxConnections: 4,
    maxMessages: 100,
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

    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = list.slice(i, i + BATCH_SIZE);

      for (let j = 0; j < batch.length; j += PARALLEL) {
        const group = batch.slice(j, j + PARALLEL);

        await Promise.all(
          group.map(async (to) => {
            try {
              const text = buildMessage(message);
              const html = format(text);

              await t.sendMail({
                from: `"${rand(names)}" <${email}>`,
                to,
                subject: getSubject(subject),
                text,
                html: `<div style="font-family:Arial">${html}</div>`
              });

              sent++;
            } catch {}
          })
        );
      }

      await delay(BASE_DELAY);

      if (sent % LONG_PAUSE === 0) {
        await delay(1500 + Math.random() * 1000);
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
