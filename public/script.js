async function send() {
  const btn = document.getElementById("sendBtn");

  btn.innerText = "Sending...";
  btn.disabled = true;

  try {
    const res = await fetch("/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        senderName: name.value,
        email: email.value,
        password: pass.value,
        subject: subject.value,
        message: message.value,
        recipients: recipients.value
      })
    });

    const data = await res.json();

    if (data.status === "success") {
      alert(`Sent ${data.sent} ✅`);
    } else if (data.status === "auth_error") {
      alert("Wrong Password ❌");
    } else if (data.status === "limit") {
      alert("Limit Reached ❌");
    } else {
      alert("Error ❌");
    }

  } catch {
    alert("Server Error ❌");
  }

  btn.innerText = "Send All";
  btn.disabled = false;
}

function logout() {
  window.location = "login.html";
}
