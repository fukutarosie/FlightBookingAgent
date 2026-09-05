// Setup helper: reads TELEGRAM_BOT_TOKEN from .env and finds the chat id of
// whoever last messaged the bot. Message the bot once before running this.
// Never prints the token itself.
import "dotenv/config";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.log("TELEGRAM_BOT_TOKEN is not set in .env");
  process.exit(1);
}

const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
const data = await res.json();

if (!data.ok) {
  console.log("Telegram API error:", data.description || JSON.stringify(data));
  process.exit(1);
}

const messages = (data.result || [])
  .map((u) => u.message)
  .filter(Boolean)
  .map((m) => ({ chat_id: m.chat.id, from: m.chat.first_name || m.chat.username, text: m.text }));

if (messages.length === 0) {
  console.log("No messages found yet — make sure you messaged the bot after creating it.");
} else {
  console.log("Found message(s):");
  console.log(JSON.stringify(messages, null, 2));
}
