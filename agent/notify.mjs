// Best-effort human notification for decisions that need attention. Never
// throws and never blocks the booking flow — a failed or unconfigured
// notification should not stop a legitimate booking or a policy refusal
// from completing.
export async function notifyTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { sent: false, reason: "Telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID unset)" };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
    if (!res.ok) return { sent: false, reason: `Telegram API returned ${res.status}: ${await res.text()}` };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: String(err.message || err) };
  }
}
