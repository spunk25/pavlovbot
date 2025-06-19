import DatabaseService from './DatabaseService.js'; // Alterado de fs e path

const CHAT_HISTORY_COLLECTION_NAME = 'chat_history_log';

// Flag para controlar o estado de inicialização
let isInitialized = false;
let initializationPromise = null;

/**
 * Inicializa o serviço de histórico de chat.
 * Aguarda pela conexão ao banco de dados e verifica o histórico existente.
 * @returns {Promise<void>} Promise que resolve quando o serviço estiver inicializado
 */
async function initialize() {
  if (isInitialized) {
    return Promise.resolve();
  }
  
  if (initializationPromise) {
    return initializationPromise;
  }
  
  initializationPromise = (async () => {
    try {
      // Garantir que o banco de dados está conectado
      const db = await DatabaseService.getDb();
      const collection = db.collection(CHAT_HISTORY_COLLECTION_NAME);
      
      // Criar índice para melhorar o desempenho das consultas por timestamp
      await collection.createIndex({ timestamp: 1 });
      
      const count = await collection.countDocuments();
      console.log(`ChatHistoryService: Inicializado. Histórico de chat no DB contém ${count} mensagens.`);
      
      isInitialized = true;
    } catch (err) {
      console.error('ChatHistoryService: Erro durante inicialização:', err);
      // Resetar para permitir nova tentativa
      initializationPromise = null;
      throw err;
    }
  })();
  
  return initializationPromise;
}

// Esta função agora apenas registra o estado inicial ou pode ser usada para carregar um cache limitado.
// A fonte principal de verdade será o banco de dados para getChatHistory.
async function loadChatHistory() {
  return initialize();
}

/**
 * Adiciona uma mensagem ao histórico de chat.
 * @param {string} sender - Nome/ID do remetente
 * @param {string} text - Conteúdo da mensagem
 * @returns {Promise<boolean>} - Se a operação foi bem-sucedida
 */
async function addMessageToHistory(sender, text) {
  try {
    // Garantir que o serviço está inicializado
    await initialize();
    
    const message = {
      sender,
      text,
      timestamp: new Date()
    };
    
    const db = await DatabaseService.getDb();
    const collection = db.collection(CHAT_HISTORY_COLLECTION_NAME);
    await collection.insertOne(message);
    
    return true;
  } catch (error) {
    console.error("ChatHistoryService: Erro ao adicionar mensagem ao histórico do DB:", error);
    return false;
  }
}

/**
 * Obtém o histórico de chat do banco de dados.
 * @param {number} limit - Número máximo de mensagens a retornar (opcional)
 * @returns {Promise<Array>} Array de objetos de mensagem
 */
async function getChatHistory(limit = 0) {
  try {
    // Garantir que o serviço está inicializado
    await initialize();
    
    const db = await DatabaseService.getDb();
    const collection = db.collection(CHAT_HISTORY_COLLECTION_NAME);
    
    // Criar a consulta base
    let query = collection.find({}).sort({ timestamp: 1 });
    
    // Aplicar limite se especificado
    if (limit > 0) {
      query = query.limit(limit);
    }
    
    const history = await query.toArray();
    return history;
  } catch (error) {
    console.error("ChatHistoryService: Erro ao buscar histórico do DB:", error);
    return [];
  }
}

/**
 * Limpa todo o histórico de chat do banco de dados.
 * @returns {Promise<boolean>} Se a operação foi bem-sucedida
 */
async function clearChatHistory() {
  try {
    // Garantir que o serviço está inicializado
    await initialize();
    
    const db = await DatabaseService.getDb();
    const collection = db.collection(CHAT_HISTORY_COLLECTION_NAME);
    const result = await collection.deleteMany({});
    
    console.log(`ChatHistoryService: Histórico de chat limpo. ${result.deletedCount} mensagens removidas.`);
    return true;
  } catch (error) {
    console.error("ChatHistoryService: Erro ao limpar histórico do DB:", error);
    return false;
  }
}

/**
 * Formata o histórico de chat para geração de resumo.
 * @param {Array} historyArray - Array de objetos de mensagem
 * @returns {string} Texto formatado para o resumo
 */
function formatChatForSummary(historyArray) {
  if (!Array.isArray(historyArray) || historyArray.length === 0) {
    return '';
  }
  
  return historyArray.map(msg => {
    if (!msg || !msg.sender || !msg.text) {
      return '';
    }
    return `${msg.sender}: ${msg.text}`;
  }).filter(Boolean).join('\n');
}

// Iniciar a inicialização assíncrona
initialize().catch(err => {
  console.error('ChatHistoryService: Falha na inicialização automática:', err);
});

export default {
  initialize,
  loadChatHistory,
  addMessageToHistory,
  getChatHistory,
  clearChatHistory,
  formatChatForSummary,
  // Método para verificar se o serviço está pronto
  isReady: () => isInitialized
}; 