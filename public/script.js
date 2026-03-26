async function send() {
    const res = await fetch("/send", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({
            sender: sender.value,
            email: email.value,
            pass: pass.value,
            subject: subject.value,
            message: message.value,
            recipients: recipients.value
        })
    });

    const data = await res.json();

    if (data.success) {
        alert("Sent: " + data.sent);
    } else {
        alert(data.error);
    }
}

async function logout() {
    await fetch("/logout", { method: "POST" });
    location.href = "login.html";
}
