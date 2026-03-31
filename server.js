const express = require("express");
const nodemailer = require("nodemailer");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

// ===== ROOT =====
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/login.html"));
});

// ===== LIMIT SYSTEM =====
const limits = {};

function checkLimit(email, total) {
  const now = Date.now();

  if (!limits[email]) {
    limits[email] = { count: 0, start: now };
  }

  const elapsed = (now - limits[email].start) / 1000;

  if (elapsed > 3600) {
    limits[email] = { count: 0, start: now };
  }

  if (limits[email].count + total > 25) return false;

  limits[email].count += total;
  return true;
}

// ===== DELAY =====
function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function humanDelay() {
  return 250 + Math.floor(Math.random() * 200); // 250–450ms
}

// ===== TRANSPORT =====
function createTransport(email, pass) {
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: email, pass },
    pool: true,
    maxConnections: 1,
    maxMessages: 30
  });
}

// ===== SEND =====
app.post("/send", async (req, res) => {
  try {
    const { senderName, email, password, subject, message, recipients } = req.body;

    if (!email || !password || !recipients) {
      return res.json({ status: "error" });
    }

    const list = recipients.split(/\n|,/).map(e => e.trim()).filter(Boolean);

    if (!checkLimit(email, list.length)) {
      return res.json({ status: "limit" });
    }

    const transporter = createTransport(email, password);

    try {
      await transporter.verify();
    } catch {
      return res.json({ status: "auth_error" });
    }

    const from = senderName ? `"${senderName}" <${email}>` : email;

    let sent = 0;

    for (const to of list) {
      try {
        await transporter.sendMail({
          from,
          to,
          replyTo: email,
          subject,
          text: message,
          html: `<p>${message}</p>`,
          headers: {
            "X-Mailer": "Mailer",
            "List-Unsubscribe": `<mailto:${email}>`
          }
        });

        sent++;
        await delay(humanDelay());

      } catch (e) {
        console.log("Error:", e.message);
      }
    }

    res.json({ status: "success", sent });

  } catch {
    res.json({ status: "error" });
  }
});

// ===== START =====
app.listen(PORT, () => console.log("Server running"));
