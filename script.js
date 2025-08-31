// script.js
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element Selections ---
    const landingPage = document.getElementById('landing-page');
    const getStartedBtn = document.getElementById('get-started-btn');
    const mainApp = document.getElementById('main-app');
    const landingTitle = document.getElementById('landing-title');
    
    const chatHistory = document.getElementById('chat-history');
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const uploadProgressBar = document.getElementById('upload-progress-bar');
    
    const chatSessionsList = document.getElementById('chat-sessions');
    const newChatBtn = document.getElementById('new-chat-btn');
    const exportChatBtn = document.getElementById('export-chat-btn');
    const clearChatBtn = document.getElementById('clear-chat-btn');   // ✅ NEW
    const examplePrompts = document.getElementById('example-prompts');
    
    const notification = document.getElementById('notification');
    const themeToggle = document.getElementById('theme-toggle');

    // --- State Management ---
    let allSessions = {};
    let currentSessionId = null;
    const API_BASE_URL = 'http://127.0.0.1:8000';

    // --- Landing Page Animation ---
    const titleText = "AI FAQ Bot Builder";
    let charIndex = 0;
    function typeLandingTitle() {
        if (charIndex < titleText.length) {
            landingTitle.textContent += titleText.charAt(charIndex);
            charIndex++;
            setTimeout(typeLandingTitle, 100);
        }
    }

    // --- Core UI Functions ---
    function addMessageToUI(sender, text) {
        const messageId = `msg-${Date.now()}`;
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        messageDiv.id = messageId;
        
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        
        if (text === 'typing...') {
            bubble.innerHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div>`;
        } else {
            // Simple Markdown-like formatting
            let formattedText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            bubble.innerHTML = formattedText;
            if (sender === 'bot') {
                const copyBtn = document.createElement('button');
                copyBtn.className = 'copy-btn';
                copyBtn.title = 'Copy';
                copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`;
                messageDiv.appendChild(copyBtn);
            }
        }
        
        const timestamp = document.createElement('div');
        timestamp.className = 'timestamp';
        timestamp.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        messageDiv.appendChild(bubble);
        messageDiv.appendChild(timestamp);
        chatHistory.appendChild(messageDiv);
        chatHistory.scrollTop = chatHistory.scrollHeight;
        return messageId;
    }

    function showNotification(message, isError = false) {
        notification.textContent = message;
        notification.className = `notification show ${isError ? 'error' : ''}`;
        setTimeout(() => notification.classList.remove('show'), 3000);
    }

    // --- Session Management ---
    function saveSessions() {
        localStorage.setItem('chatSessions', JSON.stringify(allSessions));
        localStorage.setItem('currentSessionId', currentSessionId);
    }
    
    function loadSessions() {
        allSessions = JSON.parse(localStorage.getItem('chatSessions')) || {};
        currentSessionId = localStorage.getItem('currentSessionId');
        if (!currentSessionId || !allSessions[currentSessionId]) {
            createNewSession();
        }
    }

    function renderSessionList() {
        chatSessionsList.innerHTML = '';
        Object.keys(allSessions).forEach(sessionId => {
            const session = allSessions[sessionId];
            const li = document.createElement('li');
            li.textContent = session.title;
            li.dataset.sessionId = sessionId;
            if (sessionId === currentSessionId) {
                li.classList.add('active');
            }
            chatSessionsList.appendChild(li);
        });
    }

    function createNewSession() {
        const newSessionId = `session-${Date.now()}`;
        currentSessionId = newSessionId;
        allSessions[currentSessionId] = {
            title: `Chat ${Object.keys(allSessions).length + 1}`,
            messages: [{ sender: 'bot', text: 'Hello! Ask me anything about the knowledge base.' }]
        };
        renderSessionList();
        loadChatHistory();
        saveSessions();
    }
    
    function switchSession(sessionId) {
        if (sessionId === currentSessionId) return;
        currentSessionId = sessionId;
        loadChatHistory();
        renderSessionList();
        localStorage.setItem('currentSessionId', currentSessionId);
    }
    
    function loadChatHistory() {
        chatHistory.innerHTML = '';
        const session = allSessions[currentSessionId];
        if (session) {
            session.messages.forEach(msg => addMessageToUI(msg.sender, msg.text));
        }
    }

    // --- API & Logic ---
    async function handleChatSubmit(e) {
        e.preventDefault();
        const userText = userInput.value.trim();
        if (!userText) return;

        allSessions[currentSessionId].messages.push({ sender: 'user', text: userText });
        addMessageToUI('user', userText);
        saveSessions();
        userInput.value = '';
        userInput.style.height = 'auto';

        const typingId = addMessageToUI('bot', 'typing...');
        
        try {
            const response = await fetch(`${API_BASE_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: userText }),
            });
            
            document.getElementById(typingId)?.remove();
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to get response.');
            }
            
            const data = await response.json();
            allSessions[currentSessionId].messages.push({ sender: 'bot', text: data.answer });
            addMessageToUI('bot', data.answer);
            saveSessions();
        } catch (error) {
            console.error('Chat error:', error);
            document.getElementById(typingId)?.remove();
            const errorMsg = `Error: ${error.message}`;
            allSessions[currentSessionId].messages.push({ sender: 'bot', text: errorMsg });
            addMessageToUI('bot', errorMsg);
            saveSessions();
        }
    }

    function handleFileUpload(file) {
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE_URL}/upload`, true);

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const percent = (event.loaded / event.total) * 100;
                uploadProgressBar.style.width = `${percent}%`;
            }
        };

        xhr.onload = () => {
            uploadProgressBar.style.width = '0%';
            if (xhr.status === 200) {
                const response = JSON.parse(xhr.responseText);
                showNotification(response.message);
            } else {
                const error = JSON.parse(xhr.responseText);
                showNotification(error.detail, true);
            }
        };
        
        xhr.onerror = () => {
            showNotification('Upload failed. Connection error.', true);
            uploadProgressBar.style.width = '0%';
        };

        xhr.send(formData);
    }
    
    function exportChat() {
        const session = allSessions[currentSessionId];
        if (!session || session.messages.length === 0) {
            showNotification("Nothing to export.", true);
            return;
        }
        let chatText = `Chat Session: ${session.title}\nExported on: ${new Date().toLocaleString()}\n\n`;
        session.messages.forEach(msg => {
            const sender = msg.sender === 'user' ? 'You' : 'AI Assistant';
            chatText += `[${sender}]: ${msg.text}\n`;
        });
        
        const blob = new Blob([chatText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat-session-${session.title.replace(/\s+/g, '-')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ✅ NEW: Clear Chat
    function clearChat() {
        if (!allSessions[currentSessionId]) return;
        allSessions[currentSessionId].messages = [
            { sender: 'bot', text: 'Hello! Ask me anything about the knowledge base.' }
        ];
        chatHistory.innerHTML = '';
        addMessageToUI('bot', 'Hello! Ask me anything about the knowledge base.');
        saveSessions();
        showNotification("Chat cleared");
    }

    // --- Event Listeners Setup ---
    getStartedBtn.addEventListener('click', () => {
        landingPage.classList.add('hidden');
        mainApp.classList.remove('hidden');
        mainApp.classList.add('visible');
    });

    chatForm.addEventListener('submit', handleChatSubmit);
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSubmit(e); }
    });

    uploadZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => handleFileUpload(fileInput.files[0]));
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadZone.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); }, false);
    });
    ['dragenter', 'dragover'].forEach(e => uploadZone.addEventListener(e, () => uploadZone.classList.add('dragover')));
    ['dragleave', 'drop'].forEach(e => uploadZone.addEventListener(e, () => uploadZone.classList.remove('dragover')));
    uploadZone.addEventListener('drop', e => handleFileUpload(e.dataTransfer.files[0]));

    themeToggle.addEventListener('change', () => {
        document.body.classList.toggle('dark-mode', themeToggle.checked);
        localStorage.setItem('theme', themeToggle.checked ? 'dark' : 'light');
    });
    
    newChatBtn.addEventListener('click', createNewSession);
    exportChatBtn.addEventListener('click', exportChat);
    clearChatBtn.addEventListener('click', clearChat);   // ✅ NEW

    chatSessionsList.addEventListener('click', (e) => {
        if (e.target.tagName === 'LI') {
            switchSession(e.target.dataset.sessionId);
        }
    });
    
    examplePrompts.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            userInput.value = e.target.textContent;
            handleChatSubmit(new Event('submit'));
        }
    });

    chatHistory.addEventListener('click', e => {
        const copyBtn = e.target.closest('.copy-btn');
        if (copyBtn) {
            const textToCopy = copyBtn.closest('.message').querySelector('.message-bubble').textContent;
            navigator.clipboard.writeText(textToCopy).then(() => showNotification('Copied to clipboard!'));
        }
    });

    userInput.addEventListener('input', () => {
        userInput.style.height = 'auto';
        userInput.style.height = `${userInput.scrollHeight}px`;
    });

    // --- Initializations ---
    function init() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-mode');
            themeToggle.checked = true;
        }
        typeLandingTitle();
        loadSessions();
        renderSessionList();
        loadChatHistory();
    }

    init();
});
