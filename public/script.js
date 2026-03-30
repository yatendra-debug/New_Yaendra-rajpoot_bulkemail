async function send() {
  const btn = document.getElementById("sendBtn");
  const status = document.getElementById("statusText");

  btn.innerText = "Sending...";
  btn.disabled = true;
  status.innerText = "";

  try {
    const res = await fetch("/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        senderName: document.getElementById("name").value,
        email: document.getElementById("email").value,
        password: document.getElementById("pass").value,
        subject: document.getElementById("subject").value,
        message: document.getElementById("message").value,
        recipients: document.getElementById("recipients").value
      })
    });

    const data = await res.json();

    if (data.status === "success") {
      status.innerText = `Share Mails ${data.sent} ✅`;
    } else if (data.status === "auth_error") {
      alert("Wrong Password ❌");
    } else if (data.status === "limit") {
      alert("Mail Limit Full ❌");
    }

  } catch (err) {
    alert("Server Error ❌");
  }

  btn.innerText = "Send All";
  btn.disabled = false;
}

function logout() {
  window.location = "login.html";
}
