const express = require("express");
const { Telegraf } = require("telegraf");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL || `http://localhost:${PORT}`;

console.log('🎯 Startup Configuration:');
console.log('📍 Environment:', process.env.NODE_ENV || 'development');
console.log('🔗 MongoDB:', MONGODB_URI ? '✅ Configured' : '❌ Missing');
console.log('🤖 Bot Token:', BOT_TOKEN ? '✅ Configured' : '❌ Missing');
console.log('🌐 Web URL:', WEB_APP_URL);
if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN not set!");
  process.exit(1);
}

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI not set!");
  process.exit(1);
}
mongoose.connect(MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected successfully"))
  .catch(err => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });
const taskSchema = new mongoose.Schema({
  task: String,
  completed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  userId: { type: Number, required: true },
  username: String,
  chatId: Number,
});

const Task = mongoose.model("Task", taskSchema);
const userSessionSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  username: String,
  firstName: String,
  lastActive: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

const UserSession = mongoose.model("UserSession", userSessionSchema);

// Бот
const bot = new Telegraf(BOT_TOKEN);
bot.start((ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username || ctx.from.first_name;
  const personalUrl = `${WEB_APP_URL}?userId=${userId}&username=${encodeURIComponent(username)}&r=${Date.now()}`;

  ctx.reply(`📝 Добро пожаловать, ${username}!`, {
    reply_markup: {
      inline_keyboard: [
        [{
          text: "📋 Открыть Мой Todo List",
          web_app: {
            url: personalUrl
          }
        }]
      ]
    }
  });
});

bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith("/")) return;

  try {
    const task = new Task({
      task: text,
      userId: ctx.from.id,
      username: ctx.from.username || ctx.from.first_name,
    });
    await task.save();

    const username = ctx.from.username || ctx.from.first_name;
    const personalUrl = `${WEB_APP_URL}?userId=${ctx.from.id}&username=${encodeURIComponent(username)}&tgWebAppPlatform=tdesktop&tgWebAppVersion=7.0&tgWebAppThemeParams=%7B%7D`;

    ctx.reply(`✅ Задача добавлена, ${username}!`, {
      reply_markup: {
        inline_keyboard: [
          [{
            text: "📋 Открыть Мой Todo List",
            web_app: {
              url: personalUrl
            }
          }]
        ]
      }
    });
  } catch (error) {
    console.error(error);
    ctx.reply("❌ Ошибка при добавлении задачи");
  }
});

bot.command("mytasks", async (ctx) => {
  try {
    const userId = ctx.from.id;
    console.log(`📋 Processing /mytasks for user ${userId}`);

    const tasks = await Task.find({ userId }).sort({ createdAt: -1 }).limit(10);

    if (tasks.length === 0) {
      return ctx.reply("📭 Ваш список задач пуст\n\nДобавьте задачу просто написав ее в чат!");
    }

    let message = '📋 Ваши последние задачи:\n\n';
    tasks.forEach((task, index) => {
      const status = task.completed ? '✅' : '⏳';
      const date = new Date(task.createdAt).toLocaleDateString('ru-RU');
      message += `${index + 1}. ${status} ${task.task}\n   📅 ${date}\n\n`;
    });

    const completedCount = await Task.countDocuments({ userId, completed: true });
    const totalCount = await Task.countDocuments({ userId });

    message += `📊 Статистика: ${completedCount}/${totalCount} выполнено`;

    const personalUrl = `${WEB_APP_URL}?userId=${userId}&username=${ctx.from.username || ctx.from.first_name}`;

    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📋 Открыть полный список", web_app: { url: personalUrl } }],
          [{ text: "➕ Добавить задачу", web_app: { url: personalUrl } }]
        ]
      }
    });

  } catch (error) {
    console.error("Error in /mytasks:", error);
    ctx.reply("❌ Ошибка при получении задач");
  }
});

bot.command("help", (ctx) => {
  const helpMessage = `🤖 Доступные команды:\n\n` +
    `/start - Начать работу с ботом\n` +
    `/mytasks - Показать мои задачи\n` +
    `/stats - Моя статистика\n` +
    `/help - Показать это сообщение\n\n` +
    `💡 Также вы можете просто написать задачу в чат, чтобы добавить ее!`;

  ctx.reply(helpMessage);
});

bot.catch((err, ctx) => {
  console.error(`❌ Ошибка бота для ${ctx.updateType}:`, err);
});

app.get("/api/tasks", async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: "userId required" });

    const tasks = await Task.find({ userId }).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/tasks", async (req, res) => {
  try {
    const { task, userId, username } = req.body;
    if (!userId) return res.status(400).json({ error: "userId required" });

    const newTask = new Task({
      task,
      userId,
      username: username || "user"
    });
    await newTask.save();
    res.json(newTask);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/tasks/:id", async (req, res) => {
  try {
    const { completed } = req.body;
    const task = await Task.findByIdAndUpdate(
      req.params.id,
      { completed },
      { new: true }
    );
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/tasks/:id", async (req, res) => {
  try {
    await Task.findByIdAndDelete(req.params.id);
    res.json({ message: "Task deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/user/stats", async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: "userId required" });

    const totalTasks = await Task.countDocuments({ userId });
    const completedTasks = await Task.countDocuments({ userId, completed: true });
    const pendingTasks = totalTasks - completedTasks;

    res.json({ totalTasks, completedTasks, pendingTasks });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/status", (req, res) => {
  res.json({
    status: "OK",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    timestamp: new Date().toISOString()
  });
});

app.use("/", (req, res, next) => {
  if (req.path.endsWith('.html') || req.path === '/') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

app.use(express.static(path.join(__dirname, "to-do"), {
  etag: false,
  lastModified: false,
  cacheControl: false
}));

app.get("/", (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, "to-do", "index.html"));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(50));
  console.log('🚀 APPLICATION STARTED SUCCESSFULLY');
  console.log('='.repeat(50));
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌐 Web URL: ${WEB_APP_URL}`);
  console.log(`📊 API: ${WEB_APP_URL}/api/status`);
  console.log('='.repeat(50));
});

bot.launch().then(() => {
  console.log("🤖 Bot started successfully");
}).catch(error => {
  console.error("❌ Bot error:", error);
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));