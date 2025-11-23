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

// Умное определение URL для Railway
const getWebAppUrl = () => {
  if (process.env.WEB_APP_URL) {
    return process.env.WEB_APP_URL;
  }
  
  if (process.env.NODE_ENV === 'production') {
    const projectName = process.env.RAILWAY_PROJECT_NAME || 'your-todo-bot';
    const railwayUrl = `https://${projectName}.up.railway.app`;
    return railwayUrl;
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

// Схема задачи с привязкой к пользователю
const taskSchema = new mongoose.Schema({
  task: String,
  completed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  userId: { type: Number, required: true },
  username: String,
  chatId: Number,
});

const Task = mongoose.model("Task", taskSchema);

// Схема для сессий пользователей
const userSessionSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  username: String,
  firstName: String,
  lastActive: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

const UserSession = mongoose.model("UserSession", userSessionSchema);

// Инициализация бота
const bot = new Telegraf(BOT_TOKEN);

// Команда /start - отправляет персонализированную ссылку
bot.start((ctx) => {
  const userId = ctx.from.id;
  const personalUrl = `${WEB_APP_URL}?userId=${userId}`;
  
  const message =
    `📝 Добро пожаловать в ваш персональный Todo List, ${ctx.from.first_name}!\n\n` +
    `Нажмите на кнопку ниже чтобы открыть ваш список задач:`;

  ctx.reply(message, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "📋 Открыть Мой Todo List",
            web_app: { url: personalUrl },
          },
        ],
      ],
    },
  });
});

// Обработка обычных сообщений
bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();
  const userId = ctx.from.id;

  if (text.startsWith("/")) return;

  try {
    const task = new Task({
      task: text,
      userId: userId,
      username: ctx.from.username || ctx.from.first_name,
      chatId: ctx.chat.id,
    });

    await task.save();

    const personalUrl = `${WEB_APP_URL}?userId=${userId}`;
    
    ctx.reply(
      `✅ Задача "${text}" добавлена в ваш список!\n\nОткройте приложение чтобы увидеть все ваши задачи:`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "📋 Открыть Мой Todo List",
                web_app: { url: personalUrl },
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

// Команда /mysite - персонализированная ссылка
bot.command("mysite", (ctx) => {
  const userId = ctx.from.id;
  const personalUrl = `${WEB_APP_URL}?userId=${userId}`;
  
  ctx.reply("Откройте ваш персональный Todo List:", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "📋 Открыть Мой Todo List",
            web_app: { url: personalUrl },
          },
        ],
      ],
    },
  });
});

// Команда /mytasks - показывает задачи прямо в Telegram
bot.command("mytasks", async (ctx) => {
  try {
    const userId = ctx.from.id;
    const tasks = await Task.find({ userId })
      .sort({ createdAt: -1 })
      .limit(10);
    
    if (tasks.length === 0) {
      return ctx.reply("📭 Ваш список задач пуст");
    }

    let message = '📋 Ваши задачи:\n\n';
    tasks.forEach((task, index) => {
      const status = task.completed ? '✅' : '⏳';
      message += `${index + 1}. ${status} ${task.task}\n`;
    });

    message += `\nВсего задач: ${tasks.length}`;
    
    const personalUrl = `${WEB_APP_URL}?userId=${userId}`;
    
    ctx.reply(message, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "📋 Открыть полный список",
              web_app: { url: personalUrl },
            },
          ],
        ],
      },
    });
  } catch (error) {
    console.error(error);
    ctx.reply("❌ Ошибка при получении задач");
  }
});

// Команда /stats - статистика пользователя
bot.command("stats", async (ctx) => {
  try {
    const userId = ctx.from.id;
    const totalTasks = await Task.countDocuments({ userId });
    const completedTasks = await Task.countDocuments({ userId, completed: true });
    const pendingTasks = totalTasks - completedTasks;

    const message =
      `📊 Ваша статистика:\n\n` +
      `📝 Всего задач: ${totalTasks}\n` +
      `✅ Выполнено: ${completedTasks}\n` +
      `⏳ В процессе: ${pendingTasks}`;

    ctx.reply(message);
  } catch (error) {
    console.error(error);
    ctx.reply("❌ Ошибка при получении статистики");
  }
});

// Обработка ошибок бота
bot.catch((err, ctx) => {
  console.error(`❌ Ошибка бота для ${ctx.updateType}:`, err);
});

// Middleware для определения пользователя
const getUserFromRequest = async (req) => {
  const userId = req.query.userId || req.headers['user-id'];
  
  if (userId) {
    return parseInt(userId);
  }
  
  const telegramInitData = req.headers['telegram-init-data'];
  if (telegramInitData) {
    try {
      const urlParams = new URLSearchParams(telegramInitData);
      const userStr = urlParams.get('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        return user.id;
      }
    } catch (error) {
      console.error('Error parsing Telegram init data:', error);
    }
  }
  
  return null;
};

// API endpoints с проверкой пользователя
app.get("/api/tasks", async (req, res) => {
  try {
    const userId = await getUserFromRequest(req);
    
    if (!userId) {
      return res.status(401).json({ error: "User not identified" });
    }

    const tasks = await Task.find({ userId }).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Ошибка при получении задач" });
  }
});

app.post("/api/tasks", async (req, res) => {
  try {
    const userId = await getUserFromRequest(req);
    
    if (!userId) {
      return res.status(401).json({ error: "User not identified" });
    }

    const { task } = req.body;
    const newTask = new Task({
      task,
      userId: userId,
      username: req.body.username || "user",
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
    const userId = await getUserFromRequest(req);
    
    if (!userId) {
      return res.status(401).json({ error: "User not identified" });
    }

    const { completed } = req.body;
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, userId },
      { completed },
      { new: true }
    );
    
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }
    
    res.json(task);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Ошибка при обновлении задачи" });
  }
});

app.delete("/api/tasks/:id", async (req, res) => {
  try {
    const userId = await getUserFromRequest(req);
    
    if (!userId) {
      return res.status(401).json({ error: "User not identified" });
    }

    const task = await Task.findOneAndDelete({ _id: req.params.id, userId });
    
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }
    
    res.json({ message: "Задача удалена" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Ошибка при удалении задачи" });
  }
});

// Новый endpoint для получения информации о пользователе
app.get("/api/user", async (req, res) => {
  try {
    const userId = await getUserFromRequest(req);
    
    if (!userId) {
      return res.status(401).json({ error: "User not identified" });
    }

    await UserSession.findOneAndUpdate(
      { userId },
      { lastActive: new Date() },
      { upsert: true, new: true }
    );

    res.json({ userId, authenticated: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Ошибка при получении данных пользователя" });
  }
});

// Статистика пользователя
app.get("/api/user/stats", async (req, res) => {
  try {
    const userId = await getUserFromRequest(req);
    
    if (!userId) {
      return res.status(401).json({ error: "User not identified" });
    }

    const totalTasks = await Task.countDocuments({ userId });
    const completedTasks = await Task.countDocuments({ userId, completed: true });
    const pendingTasks = totalTasks - completedTasks;

    res.json({
      totalTasks,
      completedTasks,
      pendingTasks
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Ошибка при получении статистики" });
  }
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
app.get(/^(?!\/api).*/, (req, res) => {
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