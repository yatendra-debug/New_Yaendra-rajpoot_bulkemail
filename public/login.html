const express = require("express");
const nodemailer = require("nodemailer");
const session = require("express-session");
const bodyParser = require("body-parser");
const { RateLimiterMemory } = require("rate-limiter-flexible");

const app = express();

app.use(bodyParser.json());
app.use(express.static("public"));

app.use(session({
    secret: "secure_secret",
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 60 * 60 * 1000 } // 1 hour
}));

// Rate limit
const limiter = new RateLimiterMemory({
    points: 50,
    duration: 60
});

// LOGIN
app.post("/login", (req, res) => {
    const { username, password } = req.body;

    if (username === "@##@@&^#%^#" && password === "@##@@&^#%^#") {
        req.session.auth = true;
        return res.json({ success: true });
    }
    res.json({ success: false });
});

// AUTH CHECK
function auth(req, res, next) {
    if (!req.session.auth) return res.status(401).send("Unauthorized");
    next();
}

// SEND MAIL
app.post("/send", auth, async (req, res) => {
    try {
        await limiter.consume(req.ip);

        let { sender, email, pass, subject, message, recipients } = req.body;

        // Header Injection Protection
        subject = subject.replace(/(\r\n|\n|\r)/gm, "");
        sender = sender.replace(/(\r\n|\n|\r)/gm, "");

        const list = recipients.split(/[\n,]+/).filter(e => e.trim());

        if (list.length > 28) {
            return res.json({ error: "Max 28 emails allowed per ID" });
        }

        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: email,
                pass: pass
            }
        });

        let sent = 0;

        for (let i = 0; i < list.length; i += 5) {
            const batch = list.slice(i, i + 5);

            await Promise.all(batch.map(to => {
                return transporter.sendMail({
                    from: `"${sender}" <${email}>`,
                    to,
                    subject,
                    text: message
                });
            }));

            sent += batch.length;
            await new Promise(r => setTimeout(r, 300));
        }

        res.json({ success: true, sent });

    } catch (err) {
        res.json({ error: "Rate limit / sending error" });
    }
});

// LOGOUT
app.post("/logout", (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.listen(3000, () => console.log("Server running on port 3000"));
