import DatabaseService from './DatabaseService.js'; // Alterado de fs e path

const CHAT_HISTORY_COLLECTION_NAME = 'chat_history_log';

// Esta função agora apenas registra o estado inicial ou pode ser usada para carregar um cache limitado.
// A fonte principal de verdade será o banco de dados para getChatHistory.
async function loadChatHistory() {
  try {
    const db = await DatabaseService.getDb();
    const collection = db.collection(CHAT_HISTORY_COLLECTION_NAME);
    const count = await collection.countDocuments();
    console.log(`ChatHistoryService: Histórico de chat no DB contém ${count} mensagens.`);
  } catch (err) {
    console.error('ChatHistoryService: Erro ao verificar histórico de chat no DB:', err);
  }
}

async function addMessageToHistory(sender, text) {
  const message = {
    sender,
    text,
    timestamp: new Date()
  };
  try {
    const db = await DatabaseService.getDb();
    const collection = db.collection(CHAT_HISTORY_COLLECTION_NAME);
    await collection.insertOne(message);
    // console.log("ChatHistoryService: Mensagem adicionada ao histórico do DB."); // Pode ser muito verboso
  } catch (error) {
    console.error("ChatHistoryService: Erro ao adicionar mensagem ao histórico do DB:", error);
  }
}

async function getChatHistory() {
  try {
    const db = await DatabaseService.getDb();
    const collection = db.collection(CHAT_HISTORY_COLLECTION_NAME);
    // Ordena por timestamp para manter a ordem cronológica
    const history = await collection.find({}).sort({ timestamp: 1 }).toArray();
    return history;
  } catch (error) {
    console.error("ChatHistoryService: Erro ao buscar histórico do DB:", error);
    return [];
  }
}

async function clearChatHistory() {
  try {
    const db = await DatabaseService.getDb();
    const collection = db.collection(CHAT_HISTORY_COLLECTION_NAME);
    await collection.deleteMany({});
    console.log("ChatHistoryService: Histórico de chat limpo no DB.");
  } catch (error) {
    console.error("ChatHistoryService: Erro ao limpar histórico do DB:", error);
  }
}

function formatChatForSummary(historyArray) { // historyArray será fornecido por quem chama
  return historyArray.map(msg => `${msg.sender}: ${msg.text}`).join('\n');
}

// Initial load
loadChatHistory();

export default {
  loadChatHistory,
  // saveChatHistory, // Removido, pois cada mensagem é salva individualmente
  addMessageToHistory,
  getChatHistory,
  clearChatHistory,
  formatChatForSummary
}; 