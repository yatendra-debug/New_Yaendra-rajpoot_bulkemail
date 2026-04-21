import express from "express";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* BASIC */
app.disable("x-powered-by");
app.use(express.json({ limit: "50kb" }));
app.use(express.static(path.join(__dirname, "public")));

/* ROUTES */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/launcher", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "launcher.html"));
});

/* LOGIN */
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (
    username === process.env.APP_USER &&
    password === process.env.APP_PASS
  ) {
    return res.json({ success: true });
  }

  return res.json({ success: false });
});

/* LIMIT */
const HOURLY_LIMIT = 27;
const PARALLEL = 2;
const DELAY = 120;

let stats = {};
setInterval(() => { stats = {}; }, 60 * 60 * 1000);

/* HELPERS */
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clean = (t = "") =>
  t.replace(/\r\n/g, "\n")
   .replace(/\n{3,}/g, "\n\n")
   .trim()
   .slice(0, 3000);

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* SEND */
app.post("/send", async (req, res) => {
  try {
    const { senderName, gmail, apppass, to, subject, message } = req.body;

    if (!gmail || !apppass || !to || !message) {
      return res.json({ success: false, msg: "Missing fields" });
    }

    if (!emailRegex.test(gmail)) {
      return res.json({ success: false, msg: "Invalid Gmail" });
    }

    if (!stats[gmail]) stats[gmail] = 0;

    if (stats[gmail] >= HOURLY_LIMIT) {
      return res.json({ success: false, msg: "Limit reached" });
    }

    const recipients = to
      .split(/,|\n/)
      .map(r => r.trim())
      .filter(r => emailRegex.test(r));

    if (!recipients.length) {
      return res.json({ success: false, msg: "No valid emails" });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: gmail,
        pass: apppass
      }
    });

    await transporter.verify();

    let sent = 0;

    for (let i = 0; i < recipients.length; i += PARALLEL) {
      const batch = recipients.slice(i, i + PARALLEL);

      await Promise.all(
        batch.map(async (r) => {
          try {
            await transporter.sendMail({
              from: `"${clean(senderName || gmail)}" <${gmail}>`,
              to: r,
              subject: clean(subject || "Hello"),
              text: clean(message),
              replyTo: gmail
            });

            sent++;
            stats[gmail]++;

          } catch (err) {
            console.log("Fail:", err.message);
          }
        })
      );

      await sleep(DELAY);
    }

    res.json({ success: true, sent });

  } catch (err) {
    console.log(err.message);
    res.json({ success: false, msg: "Server error" });
  }
});

/* START */
app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});
