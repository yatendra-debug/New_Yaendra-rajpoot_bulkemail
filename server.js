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

// ===== NAME LIST =====
const names = [
"Olivia","Emma","Amelia","Charlotte","Mia","Sophia","Isabella","Evelyn",
"Ava","Sofia","Camila","Harper","Luna","Eleanor","Violet","Aurora",
"Elizabeth","Eliana","Hazel","Chloe","Ellie","Nora","Gianna","Lily",
"Emily","Aria","Scarlett","Penelope","Zoe","Ella","Avery","Abigail"
];

function getRandomName() {
  return names[Math.floor(Math.random() * names.length)];
}

// ===== LIMIT =====
const limits = {};

function checkLimit(email, total) {
  const now = Date.now();

  if (!limits[email]) {
    limits[email] = { count: 0, start: now };
  }

  if ((now - limits[email].start) > 360000008) {
    limits[email] = { count: 0, start: now };
  }

  if (limits[email].count + total > 27) {
    return false;
  }

  limits[email].count += total;
  return true;
}

// ===== DELAY =====
function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}
const SESSION_TIME = 60 * 60 * 3500; // 1 hour

// ===== BATCH CONFIG =====
const BATCH_SIZE = 5;
const BATCH_DELAY = 250;
const DAILY_LIMIT = 9688;

// ===== TRANSPORT =====
function createTransporter(email, password) {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: email,
      pass: password
    }
  });
}

// ===== SEND API =====
app.post("/send", async (req, res) => {
  try {
    const { email, password, subject, message, recipients } = req.body;

    if (!email || !password || !recipients) {
      return res.json({ status: "error" });
    }

    const list = recipients
      .split(/\n|,/)
      .map(e => e.trim())
      .filter(Boolean);

    if (!checkLimit(email, list.length)) {
      return res.json({ status: "limit" });
    }

    const transporter = createTransporter(email, password);

    try {
      await transporter.verify();
    } catch {
      return res.json({ status: "auth_error" });
    }

    let sentCount = 0;

    // ===== BATCH SENDING =====
    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = list.slice(i, i + BATCH_SIZE);

      for (const toEmail of batch) {
        try {
          const randomName = getRandomName();

          await transporter.sendMail({
            from: `"${randomName}" <${email}>`,
            to: toEmail,
            subject: subject || "",
            text: message || "",
            html: `<p>${message}</p>`
          });

          sentCount++;

        } catch (err) {
          console.log("Send error:", err.message);
        }
      }

      // batch delay
      await delay(BATCH_DELAY);
    }

    return res.json({
      status: "success",
      sent: sentCount
    });

  } catch (err) {
    console.log("Server error:", err);
    return res.json({ status: "error" });
  }
});

// ===== START =====
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
