async function send() {
  const btn = document.getElementById("sendBtn");

  btn.innerText = "Sending...";
  btn.disabled = true;

  const data = {
    email: document.getElementById("email").value,
    password: document.getElementById("pass").value,
    subject: document.getElementById("subject").value,
    message: document.getElementById("message").value,
    recipients: document.getElementById("recipients").value
  };

  const res = await fetch("/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  const json = await res.json();

  if (json.status === "success") {
    alert("Mail Send Successful ✅");
  } else if (json.status === "auth_error") {
    alert("Wrong Password ❌");
  } else if (json.status === "limit") {
    alert("Mail Limit Full ❌");
  }

  btn.innerText = "Send All";
  btn.disabled = false;
}

function logout() {
  window.location = "login.html";
}
