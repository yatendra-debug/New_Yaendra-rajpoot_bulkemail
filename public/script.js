function logout() {
  fetch('/logout', { method: 'POST' })
    .then(() => window.location.href = '/');
}

document.getElementById('sendBtn')?.addEventListener('click', async () => {

  const senderName = document.getElementById('senderName').value;
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('pass').value.trim();
  const subject = document.getElementById('subject').value;
  const message = document.getElementById('message').value;
  const recipients = document.getElementById('recipients').value.trim();
  const status = document.getElementById('statusMessage');

  if (!email || !password || !recipients) {
    status.innerText = '❌ Email, password and recipients required';
    alert('❌ Email, password and recipients required');
    return;
  }

  const btn = document.getElementById('sendBtn');
  btn.disabled = true;
  btn.innerText = '⏳ Sending...';

  try {
    const res = await fetch('/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderName,
        email,
        password,
        subject,
        message,
        recipients
      })
    });

    const data = await res.json();

    // 🔥 FINAL FIX (IMPORTANT)
    if (data.success) {
      const count = data.sent ?? 0;

      status.innerText = `✅ Sent: ${count}`;
      alert(`✅ Sent: ${count} emails`);

    } else {
      status.innerText = data.msg || data.message || '❌ Sending failed';
      alert(status.innerText);
    }

  } catch (err) {
    status.innerText = '❌ Server error';
    alert('❌ Server error');
  }

  btn.disabled = false;
  btn.innerText = 'Send All';

});
