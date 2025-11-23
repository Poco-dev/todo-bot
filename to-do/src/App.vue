<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Todo List Bot</title>
    <script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body>
    <div id="app"></div>

    <script>
        const { createApp } = Vue;

        createApp({
            data() {
                return {
                    tasks: [],
                    newTask: '',
                    apiStatus: 'Загрузка...',
                    apiUrl: '/api' // Относительный путь, т.к. на том же домене
                }
            },
            async mounted() {
                await this.checkStatus();
                await this.fetchTasks();
                // Авто-обновление каждые 5 секунд
                setInterval(this.fetchTasks, 5000);
            },
            computed: {
                totalTasks() {
                    return this.tasks.length;
                },
                completedTasks() {
                    return this.tasks.filter(task => task.completed).length;
                },
                pendingTasks() {
                    return this.tasks.filter(task => !task.completed).length;
                }
            },
            methods: {
                async checkStatus() {
                    try {
                        const response = await fetch(`${this.apiUrl}/status`);
                        const data = await response.json();
                        this.apiStatus = data.mongodb === 'connected' ? '✅ Подключено' : '❌ Ошибка';
                    } catch (error) {
                        this.apiStatus = '❌ Ошибка подключения';
                    }
                },
                
                async fetchTasks() {
                    try {
                        const response = await fetch(`${this.apiUrl}/tasks`);
                        this.tasks = await response.json();
                    } catch (error) {
                        console.error('Error fetching tasks:', error);
                    }
                },
                
                async addTask() {
                    if (!this.newTask.trim()) return;
                    
                    try {
                        const response = await fetch(`${this.apiUrl}/tasks`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ task: this.newTask.trim() }),
                        });
                        
                        if (response.ok) {
                            this.newTask = '';
                            await this.fetchTasks();
                        }
                    } catch (error) {
                        console.error('Error adding task:', error);
                    }
                },
                
                async deleteTask(task) {
                    try {
                        const response = await fetch(`${this.apiUrl}/tasks/${task._id}`, {
                            method: 'DELETE',
                        });
                        
                        if (response.ok) {
                            await this.fetchTasks();
                        }
                    } catch (error) {
                        console.error('Error deleting task:', error);
                    }
                },
                
                async toggleTask(task) {
                    try {
                        const response = await fetch(`${this.apiUrl}/tasks/${task._id}`, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ completed: !task.completed }),
                        });
                        
                        if (response.ok) {
                            await this.fetchTasks();
                        }
                    } catch (error) {
                        console.error('Error updating task:', error);
                    }
                },
                
                formatDate(dateString) {
                    return new Date(dateString).toLocaleDateString('ru-RU', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                }
            },
            template: `
                <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
                    <!-- Хедер -->
                    <div class="max-w-2xl mx-auto mb-8 text-center">
                        <div class="inline-flex items-center space-x-3 bg-white/80 backdrop-blur-sm rounded-2xl px-6 py-4 shadow-lg border border-white/20">
                            <div class="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                                <i class="fas fa-tasks text-white text-xl"></i>
                            </div>
                            <div class="text-left">
                                <h1 class="text-2xl font-bold text-gray-800">Todo List Bot</h1>
                                <p class="text-gray-600 text-sm">Задачи синхронизируются с Telegram</p>
                            </div>
                        </div>
                    </div>

                    <!-- Статистика -->
                    <div class="max-w-2xl mx-auto mb-6 grid grid-cols-3 gap-4">
                        <div class="bg-white/90 backdrop-blur-sm rounded-xl p-4 text-center shadow-lg border border-white/20">
                            <div class="text-2xl font-bold text-blue-600">{{ totalTasks }}</div>
                            <div class="text-gray-600 text-sm">Всего</div>
                        </div>
                        <div class="bg-white/90 backdrop-blur-sm rounded-xl p-4 text-center shadow-lg border border-white/20">
                            <div class="text-2xl font-bold text-green-600">{{ completedTasks }}</div>
                            <div class="text-gray-600 text-sm">Выполнено</div>
                        </div>
                        <div class="bg-white/90 backdrop-blur-sm rounded-xl p-4 text-center shadow-lg border border-white/20">
                            <div class="text-2xl font-bold text-orange-600">{{ pendingTasks }}</div>
                            <div class="text-gray-600 text-sm">В процессе</div>
                        </div>
                    </div>

                    <!-- Список задач -->
                    <div class="max-w-2xl mx-auto space-y-3">
                        <!-- Задачи -->
                        <div 
                            v-for="task in tasks" 
                            :key="task._id"
                            class="group bg-white/90 backdrop-blur-sm rounded-xl p-4 shadow-lg hover:shadow-xl transition-all duration-300 border border-white/20 hover:border-blue-200"
                            :class="task.completed ? 'opacity-75' : ''"
                        >
                            <div class="flex items-center justify-between">
                                <div class="flex items-center space-x-4 flex-1">
                                    <button 
                                        @click="toggleTask(task)"
                                        class="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 hover:scale-110"
                                        :class="task.completed 
                                            ? 'bg-green-500 border-green-500 text-white' 
                                            : 'border-gray-300 hover:border-green-400 text-transparent'"
                                    >
                                        <i class="fas fa-check text-xs"></i>
                                    </button>
                                    
                                    <div class="flex-1 min-w-0">
                                        <p 
                                            class="text-gray-800 font-medium truncate"
                                            :class="task.completed ? 'line-through text-gray-500' : ''"
                                        >
                                            {{ task.task }}
                                        </p>
                                        <div class="flex items-center space-x-2 mt-1">
                                            <span class="text-xs text-gray-500">
                                                {{ formatDate(task.createdAt) }}
                                            </span>
                                            <span 
                                                v-if="task.username"
                                                class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full"
                                            >
                                                @{{ task.username }}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                
                                <button 
                                    @click="deleteTask(task)"
                                    class="w-8 h-8 flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all duration-300 opacity-0 group-hover:opacity-100"
                                >
                                    <i class="fas fa-trash text-sm"></i>
                                </button>
                            </div>
                        </div>

                        <!-- Пустое состояние -->
                        <div 
                            v-if="tasks.length === 0"
                            class="bg-white/90 backdrop-blur-sm rounded-xl p-12 text-center shadow-lg border-2 border-dashed border-gray-300"
                        >
                            <i class="fas fa-inbox text-4xl text-gray-400 mb-4"></i>
                            <p class="text-gray-500 text-lg mb-2">Список задач пуст</p>
                            <p class="text-gray-400 text-sm">
                                Добавьте задачи через Telegram бота или форму ниже
                            </p>
                        </div>

                        <!-- Форма добавления -->
                        <div class="bg-white/90 backdrop-blur-sm rounded-xl p-6 shadow-lg border border-white/20">
                            <div class="flex space-x-3">
                                <input 
                                    v-model="newTask"
                                    @keyup.enter="addTask"
                                    placeholder="Добавить новую задачу..."
                                    class="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-300"
                                >
                                <button 
                                    @click="addTask"
                                    :disabled="!newTask.trim()"
                                    class="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center space-x-2"
                                >
                                    <i class="fas fa-plus"></i>
                                    <span>Добавить</span>
                                </button>
                            </div>
                        </div>

                        <!-- Статус -->
                        <div class="text-center">
                            <p class="text-gray-500 text-sm">
                                Статус: {{ apiStatus }} 
                                <button @click="fetchTasks" class="text-blue-500 hover:text-blue-700 ml-2">
                                    <i class="fas fa-refresh"></i>
                                </button>
                            </p>
                        </div>
                    </div>
                </div>
            `
        }).mount('#app');
    </script>
</body>
</html>