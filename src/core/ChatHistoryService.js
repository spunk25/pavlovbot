import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHAT_HISTORY_FILE_PATH = path.join(__dirname, '..', '..', 'chatHistory.json');
let chatHistory = [];

async function loadChatHistory() {
  try {
    const data = await fs.promises.readFile(CHAT_HISTORY_FILE_PATH, 'utf8');
    chatHistory = JSON.parse(data);
    console.log(`ChatHistoryService: Histórico carregado (${chatHistory.length} mensagens).`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      chatHistory = [];
      console.log('ChatHistoryService: Nenhum histórico anterior. Iniciando vazio.');
    } else {
      console.error('ChatHistoryService: Erro ao carregar chatHistory:', err);
    }
  }
}

async function saveChatHistory() {
  try {
    await fs.promises.writeFile(
      CHAT_HISTORY_FILE_PATH,
      JSON.stringify(chatHistory, null, 2),
      'utf8'
    );
    // console.log(`ChatHistoryService: Histórico salvo (${chatHistory.length} mensagens).`); // Can be too verbose
  } catch (err) {
    console.error('ChatHistoryService: Erro ao salvar chatHistory:', err);
  }
}

function addMessageToHistory(sender, text) {
  chatHistory.push({
    sender,
    text,
    timestamp: new Date()
  });
  saveChatHistory();
}

function getChatHistory() {
  return [...chatHistory]; // Return a copy
}

function clearChatHistory() {
  chatHistory = [];
  saveChatHistory();
  console.log("ChatHistoryService: Histórico de chat limpo.");
}

function formatChatForSummary(historyArray = chatHistory) {
  return historyArray.map(msg => `${msg.sender}: ${msg.text}`).join('\n');
}

// Initial load
loadChatHistory();

export default {
  loadChatHistory,
  saveChatHistory,
  addMessageToHistory,
  getChatHistory,
  clearChatHistory,
  formatChatForSummary
}; 