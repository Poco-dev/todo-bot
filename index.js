// server.js
const express = require('express');
const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Подключение к MongoDB
mongoose.connect('mongodb://localhost:27017/todo_bot')
  .then(() => console.log('✅ MongoDB подключена'))
  .catch(err => console.error('❌ Ошибка подключения MongoDB:', err));

// Схема задачи
const taskSchema = new mongoose.Schema({
  task: String,
  completed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  userId: Number,
  username: String,
});

const Task = mongoose.model('Task', taskSchema);

// Инициализация бота
const bot = new Telegraf('8029207798:AAFYhuSooNi49tHZ06B8HnUYjigdRCxLprw');

// Команда /start - просто отправляет ссылку на сайт
bot.start((ctx) => {
  const webAppUrl = 'http://localhost:3000'; // Замените на ваш URL
  const message = `📝 Добро пожаловать в Todo List Bot!\n\n` +
    `Нажмите на кнопку ниже чтобы открыть ваш список задач:`;
  
  ctx.reply(message, {
    reply_markup: {
      inline_keyboard: [
        [{
          text: '📋 Открыть Todo List',
          web_app: { url: webAppUrl }
        }]
      ]
    }
  });
});

// Обработка обычных сообщений - добавляем как задачу и показываем ссылку
bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();
  
  // Игнорируем команды
  if (text.startsWith('/')) return;
  
  const webAppUrl = 'http://localhost:3000';
  
  try {
    // Добавляем задачу в базу
    const task = new Task({
      task: text,
      userId: ctx.from.id,
      username: ctx.from.username || ctx.from.first_name,
    });

    await task.save();
    
    // Отправляем сообщение с кнопкой
    ctx.reply(`✅ Задача "${text}" добавлена!\n\nОткройте приложение чтобы увидеть все задачи:`, {
      reply_markup: {
        inline_keyboard: [
          [{
            text: '📋 Открыть Todo List',
            web_app: { url: webAppUrl }
          }]
        ]
      }
    });
    
  } catch (error) {
    console.error(error);
    ctx.reply('❌ Ошибка при добавлении задачи');
  }
});


// API endpoint для получения всех задач
app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await Task.find().sort({ createdAt: -1 });
    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Ошибка при получении задач' });
  }
});

// API endpoint для добавления задачи
app.post('/api/tasks', async (req, res) => {
  try {
    const { task, userId, username } = req.body;
    const newTask = new Task({ 
      task, 
      userId: userId || 0, 
      username: username || 'web-user' 
    });
    await newTask.save();
    res.json(newTask);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Ошибка при добавлении задачи' });
  }
});

// API endpoint для обновления задачи
app.put('/api/tasks/:id', async (req, res) => {
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
    res.status(500).json({ error: 'Ошибка при обновлении задачи' });
  }
});

// API endpoint для удаления задачи
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    await Task.findByIdAndDelete(req.params.id);
    res.json({ message: 'Задача удалена' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Ошибка при удалении задачи' });
  }
});

// Статус API
app.get('/api/status', (req, res) => {
  res.json({ 
    status: 'OK', 
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Раздаем статические файлы для Vue приложения
app.use(express.static('public'));

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/to-do/index.html');
});

// Запуск сервера и бота
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📊 API доступно по http://localhost:${PORT}/api/tasks`);
  console.log(`🌐 Сайт доступен по http://localhost:${PORT}`);
});

// Запуск бота
bot.launch().then(() => {
  console.log('🤖 Бот запущен');
}).catch(error => {
  console.error('❌ Ошибка запуска бота:', error);
});

// Элегантное завершение работы
process.once('SIGINT', () => {
  console.log('🛑 Остановка бота...');
  bot.stop('SIGINT');
  process.exit(0);
});

process.once('SIGTERM', () => {
  console.log('🛑 Остановка бота...');
  bot.stop('SIGTERM');
  process.exit(0);
});