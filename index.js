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

// АВТОМАТИЧЕСКОЕ ОПРЕДЕЛЕНИЕ URL
const getWebAppUrl = () => {
  if (process.env.WEB_APP_URL && process.env.WEB_APP_URL !== 'https://your-app.railway.app') {
    return process.env.WEB_APP_URL;
  }
  if (process.env.RAILWAY_STATIC_URL) {
    return `https://${process.env.RAILWAY_STATIC_URL}`;
  }
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  return `http://localhost:${PORT}`;
};

const WEB_APP_URL = getWebAppUrl();

console.log('🎯 Startup Configuration:');
console.log('📍 Environment:', process.env.NODE_ENV || 'development');
console.log('🔗 MongoDB:', MONGODB_URI ? '✅ Configured' : '❌ Missing');
console.log('🤖 Bot Token:', BOT_TOKEN ? '✅ Configured' : '❌ Missing');
console.log('🌐 Web URL:', WEB_APP_URL);
console.log('🚀 Port:', PORT);

// Проверка обязательных переменных
if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN не установлен!");
  process.exit(1);
}

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI не установлен!");
  process.exit(1);
}

// Подключение к MongoDB с таймаутом
console.log('🔗 Connecting to MongoDB...');
mongoose
  .connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  })
  .then(() => {
    console.log("✅ MongoDB подключена успешно");
    console.log("📊 Database:", mongoose.connection.name);
    console.log("🎯 Host:", mongoose.connection.host);
  })
  .catch((err) => {
    console.error("❌ Ошибка подключения MongoDB:", err.message);
    console.log("📝 MONGODB_URI:", MONGODB_URI);
    process.exit(1);
  });

// Схема задачи
const taskSchema = new mongoose.Schema({
  task: String,
  completed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  userId: Number,
  username: String,
});

const Task = mongoose.model("Task", taskSchema);

// Инициализация бота
const bot = new Telegraf(BOT_TOKEN);

// Команда /start
bot.start((ctx) => {
  const message =
    `📝 Добро пожаловать в Todo List Bot!\n\n` +
    `Нажмите на кнопку ниже чтобы открыть ваш список задач:`;

  ctx.reply(message, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "📋 Открыть Todo List",
            web_app: { url: WEB_APP_URL },
          },
        ],
      ],
    },
  });
});

// Обработка обычных сообщений
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

    ctx.reply(
      `✅ Задача "${text}" добавлена!\n\nОткройте приложение чтобы увидеть все задачи:`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "📋 Открыть Todo List",
                web_app: { url: WEB_APP_URL },
              },
            ],
          ],
        },
      }
    );
  } catch (error) {
    console.error(error);
    ctx.reply("❌ Ошибка при добавлении задачи");
  }
});

// Команда /site
bot.command("site", (ctx) => {
  ctx.reply("Откройте ваш Todo List:", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "📋 Открыть приложение",
            web_app: { url: WEB_APP_URL },
          },
        ],
      ],
    },
  });
});

// Обработка ошибок бота
bot.catch((err, ctx) => {
  console.error(`❌ Ошибка бота для ${ctx.updateType}:`, err);
});

// API endpoints
app.get("/api/tasks", async (req, res) => {
  try {
    const tasks = await Task.find().sort({ createdAt: -1 });
    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Ошибка при получении задач" });
  }
});

app.post("/api/tasks", async (req, res) => {
  try {
    const { task, userId, username } = req.body;
    const newTask = new Task({
      task,
      userId: userId || 0,
      username: username || "web-user",
    });
    await newTask.save();
    res.json(newTask);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Ошибка при добавлении задачи" });
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
    console.error(error);
    res.status(500).json({ error: "Ошибка при обновлении задачи" });
  }
});

app.delete("/api/tasks/:id", async (req, res) => {
  try {
    await Task.findByIdAndDelete(req.params.id);
    res.json({ message: "Задача удалена" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Ошибка при удалении задачи" });
  }
});

app.get("/api/status", (req, res) => {
  res.json({
    status: "OK",
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    environment: process.env.NODE_ENV || "development",
    webAppUrl: WEB_APP_URL,
    timestamp: new Date().toISOString(),
  });
});

// Health check для Railway
app.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.status(dbStatus === 'connected' ? 200 : 503).json({
    status: dbStatus === 'connected' ? 'healthy' : 'unhealthy',
    database: dbStatus,
    timestamp: new Date().toISOString()
  });
});

// Тестовый маршрут
app.get("/test", (req, res) => {
  res.json({ 
    message: "Server is working!", 
    timestamp: new Date(),
    webAppUrl: WEB_APP_URL
  });
});

// РАЗДАЕМ СТАТИЧЕСКИЕ ФАЙЛЫ ИЗ ПАПКИ to-do
app.use(express.static(path.join(__dirname, "to-do")));

// Все остальные GET запросы отправляем на index.html
app.get("/*", (req, res) => {
  res.sendFile(path.join(__dirname, "to-do", "index.html"));
});

// Запуск сервера
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(50));
  console.log('🚀 APPLICATION STARTED SUCCESSFULLY');
  console.log('='.repeat(50));
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌐 Web URL: ${WEB_APP_URL}`);
  console.log(`📊 API: ${WEB_APP_URL}/api/status`);
  console.log(`🧪 Test: ${WEB_APP_URL}/test`);
  console.log(`❤️ Health: ${WEB_APP_URL}/health`);
  console.log('='.repeat(50));
});

// Запуск бота
bot.launch().then(() => {
  console.log("🤖 Бот запущен успешно");
}).catch((error) => {
  console.error("❌ Критическая ошибка бота:", error);
  console.log("🌐 Сайт продолжает работать без бота");
});

// Graceful shutdown
process.once("SIGINT", () => {
  console.log('🛑 Остановка приложения...');
  bot.stop();
  process.exit(0);
});

process.once("SIGTERM", () => {
  console.log('🛑 Остановка приложения...');
  bot.stop();
  process.exit(0);
});