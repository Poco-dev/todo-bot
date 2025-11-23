const express = require("express");
const { Telegraf } = require("telegraf");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Переменные окружения
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL || `http://localhost:${PORT}`;

console.log('🚀 Starting application...');
console.log('PORT:', PORT);
console.log('MONGODB_URI:', MONGODB_URI ? '✅' : '❌');
console.log('BOT_TOKEN:', BOT_TOKEN ? '✅' : '❌');
console.log('WEB_APP_URL:', WEB_APP_URL);

// Проверка переменных
if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN not set!");
  process.exit(1);
}

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI not set!");
  process.exit(1);
}

// Подключение к MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });

// Простая схема задачи
const taskSchema = new mongoose.Schema({
  task: String,
  completed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  userId: Number,
  username: String,
});

const Task = mongoose.model("Task", taskSchema);

// Бот
const bot = new Telegraf(BOT_TOKEN);

// Команда /start
bot.start((ctx) => {
  const userId = ctx.from.id;
  const personalUrl = `${WEB_APP_URL}?userId=${userId}`;
  
  ctx.reply(`📝 Welcome to your Todo List, ${ctx.from.first_name}!`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📋 Open My Todo List", web_app: { url: personalUrl } }]
      ]
    }
  });
});

// Обработка сообщений
bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();
  if (text.startsWith("/")) return;

  try {
    const task = new Task({
      task: text,
      userId: ctx.from.id,
      username: ctx.from.first_name,
    });
    await task.save();

    const personalUrl = `${WEB_APP_URL}?userId=${ctx.from.id}`;
    ctx.reply(`✅ Task added!`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📋 Open My List", web_app: { url: personalUrl } }]
        ]
      }
    });
  } catch (error) {
    console.error(error);
    ctx.reply("❌ Error adding task");
  }
});

// API endpoints
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
    const { task, userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId required" });

    const newTask = new Task({ task, userId });
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

// Health check
app.get("/api/status", (req, res) => {
  res.json({ 
    status: "OK", 
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" 
  });
});

// Статические файлы
app.use(express.static(path.join(__dirname, "to-do")));

// Все остальные запросы
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "to-do", "index.html"));
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

// Запуск бота
bot.launch().then(() => {
  console.log("✅ Bot started");
}).catch(error => {
  console.error("❌ Bot error:", error);
});

// Graceful shutdown
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));