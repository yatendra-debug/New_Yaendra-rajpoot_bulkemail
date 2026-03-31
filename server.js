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

// ===== DATA =====
const names = ["Olivia","Emma","Amelia","Charlotte","Mia","Sophia"];
const subjects = ["Hello","Quick update","Info","Checking in"];
const greetings = ["Hi","Hello","Hey"];

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

function getName() {
  return rand(names);
}

function getSubject(userSub) {
  return userSub && userSub.trim() !== "" ? userSub : rand(subjects);
}

function buildMsg(msg) {
  return `${rand(greetings)},\n\n${msg}`;
}

function format(msg) {
  return msg.replace(/\n/g, "<br>");
}

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

// ===== SPEED CONFIG =====
const BATCH_SIZE = 6;          // 👈 slightly faster
const PARALLEL = 2;           // 👈 safe parallel
const BASE_DELAY = 150;       // 👈 faster
const LONG_PAUSE_EVERY = 15;  // 👈 safety break

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
              const text = buildMsg(message);
              const html = format(text);

              await t.sendMail({
                from: `"${getName()}" <${email}>`,
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

      // small delay
      await delay(BASE_DELAY);

      // long safety pause
      if (sent % LONG_PAUSE_EVERY === 0) {
        await delay(1500 + Math.random() * 1000);
      }
    }

    res.json({ status: "success", sent });

  } catch (e) {
    res.json({ status: "error" });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
