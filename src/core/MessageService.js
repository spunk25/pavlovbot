import DatabaseService from './DatabaseService.js'; // Import DatabaseService
import { DEFAULT_AI_PROMPTS, DEFAULT_AI_USAGE_SETTINGS } from '../constants/aiConstants.js';
import { getRandomElement } from '../utils/generalUtils.js'; // Assuming getRandomElement is here

const MESSAGES_COLLECTION_NAME = 'message_configurations';
const MESSAGES_DOC_ID = 'botMessageSettings';

let messages = {}; // In-memory cache

const defaultGameTips = [
  "Dica: Comunique-se com sua equipe para coordenar táticas!",
  "Dica: Aprenda os pontos de 'spawn' dos inimigos nos mapas.",
  "Dica: Use granadas de fumaça para bloquear a visão e avançar.",
  "Dica: Recarregar atrás de cobertura pode salvar sua vida.",
  "Dica: Conheça os 'callouts' dos mapas para informar posições."
];

// Helper to create a full default message structure
function getDefaultMessageStructure() {
  return {
    _id: MESSAGES_DOC_ID, // Ensure _id is part of the structure for upsert
    status: { open: ["Servidor Aberto! Bora jogar!"], closed: ["Servidor Fechado. Até a próxima!"], openingSoon: ["Servidor abrindo em breve!"], opening5min: ["Servidor abrindo em 5 minutos!"] },
    newMember: ["Bem-vindo(a) ao grupo!"],
    memberLeft: ["Um membro nos deixou."],
    randomActive: ["Mensagem aleatória para quando o servidor está ativo!"],
    inGameRandom: ["Mensagem aleatória para durante o jogo!"],
    extras: { sundayNight: ["Domingo à noite, hora de Pavlov?"], friday: ["Sextou! Pavlov liberado!"] },
    gameTips: [...defaultGameTips],
    aiPrompts: { ...DEFAULT_AI_PROMPTS },
    aiUsageSettings: { ...DEFAULT_AI_USAGE_SETTINGS },
    chatSummary: {
        noNewMessages: ["Tudo quieto por aqui, sem novas mensagens para resumir agora!"]
    },
    botInfo: {
        name: "Bot Pavlov",
        defaultPmReply: ["Olá! Sou um bot. Para comandos (se você for admin), digite !start em uma conversa privada comigo."]
    }
  };
}

async function loadMessages() {
  try {
    const db = await DatabaseService.getDb();
    const collection = db.collection(MESSAGES_COLLECTION_NAME);
    let dbMessages = await collection.findOne({ _id: MESSAGES_DOC_ID });

    if (!dbMessages) {
      console.warn(`MessageService: Nenhuma configuração de mensagens encontrada no DB para ID '${MESSAGES_DOC_ID}'. Inicializando com padrões.`);
      messages = getDefaultMessageStructure();
      // Remove _id before assigning to in-memory cache if you don't want it there,
      // but it's fine to keep it if messages object is what's saved back.
      // For simplicity, we'll keep it as the save function will handle the _id for upsert.
      await collection.insertOne({ ...messages }); // Save the defaults to DB
      console.log("MessageService: Configurações de mensagens padrão salvas no MongoDB.");
    } else {
      // Merge DB data with defaults to ensure all keys exist
      const defaultStructure = getDefaultMessageStructure();
      messages = { ...defaultStructure, ...dbMessages };

      // Deep merge for nested objects like aiPrompts and aiUsageSettings
      messages.aiPrompts = { ...defaultStructure.aiPrompts, ...(dbMessages.aiPrompts || {}) };
      messages.aiUsageSettings = { ...defaultStructure.aiUsageSettings, ...(dbMessages.aiUsageSettings || {}) };
      messages.status = { ...defaultStructure.status, ...(dbMessages.status || {}) };
      messages.extras = { ...defaultStructure.extras, ...(dbMessages.extras || {}) };
      messages.chatSummary = { ...defaultStructure.chatSummary, ...(dbMessages.chatSummary || {}) };
      messages.botInfo = { ...defaultStructure.botInfo, ...(dbMessages.botInfo || {}) };
      
      // Ensure arrays are arrays
      const arrayKeys = ['newMember', 'memberLeft', 'randomActive', 'inGameRandom', 'gameTips'];
      arrayKeys.forEach(key => {
        if (!Array.isArray(messages[key])) {
          messages[key] = defaultStructure[key];
        }
      });
      if (messages.status) {
        Object.keys(messages.status).forEach(key => {
          if (!Array.isArray(messages.status[key])) messages.status[key] = defaultStructure.status[key] || [];
        });
      }
       if (messages.extras) {
        Object.keys(messages.extras).forEach(key => {
          if (!Array.isArray(messages.extras[key])) messages.extras[key] = defaultStructure.extras[key] || [];
        });
      }
      if (messages.chatSummary && !Array.isArray(messages.chatSummary.noNewMessages)) {
        messages.chatSummary.noNewMessages = defaultStructure.chatSummary.noNewMessages || [];
      }
      if (messages.botInfo && !Array.isArray(messages.botInfo.defaultPmReply)) {
        messages.botInfo.defaultPmReply = defaultStructure.botInfo.defaultPmReply || [];
      }

      console.log("MessageService: Mensagens carregadas do MongoDB.");
    }
  } catch (error) {
    console.error("MessageService: Erro ao carregar mensagens do MongoDB. Usando padrões em memória.", error);
    // Fallback to in-memory defaults if DB load fails catastrophically after initial setup
    messages = getDefaultMessageStructure();
  }
}

async function saveMessages() {
  try {
    const db = await DatabaseService.getDb();
    const collection = db.collection(MESSAGES_COLLECTION_NAME);
    // Prepare data for saving: ensure _id is present for upsert, remove it from the $set if it's immutable
    const { _id, ...dataToSet } = messages; 
    
    await collection.updateOne(
      { _id: MESSAGES_DOC_ID },
      { $set: dataToSet },
      { upsert: true }
    );
    console.log("MessageService: Mensagens salvas no MongoDB.");
  } catch (error) {
    console.error("MessageService: Erro ao salvar mensagens no MongoDB:", error);
  }
}

function getMessages() {
  // Ensure messages is populated, e.g. if loadMessages hasn't run or failed.
  // This is a basic check; robust applications might handle this more gracefully.
  if (Object.keys(messages).length === 0 && MESSAGES_DOC_ID) { // Check if it's not the initial empty object
      console.warn("MessageService: getMessages chamado antes de loadMessages ou com cache vazio. Tentando carregar...");
      // Synchronous call here is not ideal. loadMessages should be called at startup.
      // For now, returning potentially empty or default structure.
      // Consider making getMessages async or ensuring loadMessages completes first.
      return getDefaultMessageStructure(); // Return a default structure to avoid errors
  }
  return { ...messages };
}

function getAIPrompt(type) {
  return messages.aiPrompts ? messages.aiPrompts[type] || '' : '';
}

function getAIUsageSetting(type) {
  return messages.aiUsageSettings ? messages.aiUsageSettings[type] || false : false;
}

function getSystemPrompt() {
    return messages.aiPrompts ? messages.aiPrompts.systemPrompt || DEFAULT_AI_PROMPTS.systemPrompt : DEFAULT_AI_PROMPTS.systemPrompt;
}


async function updateMessagesAndPrompts(updatedData) {
  let changed = false;
  const currentMessages = messages; // Work on the cached version

  // Helper to process array fields (like status messages, newMember, etc.)
  const processArrayField = (fieldPath, updatedValue) => {
    let parent = currentMessages;
    const pathParts = fieldPath.split('.');
    const key = pathParts.pop();

    for (const part of pathParts) {
      if (!parent[part]) parent[part] = {};
      parent = parent[part];
    }
    
    const newValue = Array.isArray(updatedValue) ? updatedValue : (typeof updatedValue === 'string' ? updatedValue.split('\n').map(s => s.trim()).filter(Boolean) : []);
    if (JSON.stringify(parent[key] || []) !== JSON.stringify(newValue)) {
      parent[key] = newValue;
      changed = true;
    }
  };

  // Status messages
  if (updatedData.status) {
    if (updatedData.status.open !== undefined) processArrayField('status.open', updatedData.status.open);
    if (updatedData.status.closed !== undefined) processArrayField('status.closed', updatedData.status.closed);
    if (updatedData.status.openingSoon !== undefined) processArrayField('status.openingSoon', updatedData.status.openingSoon);
    if (updatedData.status.opening5min !== undefined) processArrayField('status.opening5min', updatedData.status.opening5min);
  }

  // Other direct array messages
  if (updatedData.newMember !== undefined) processArrayField('newMember', updatedData.newMember);
  if (updatedData.memberLeft !== undefined) processArrayField('memberLeft', updatedData.memberLeft);
  if (updatedData.randomActive !== undefined) processArrayField('randomActive', updatedData.randomActive);
  if (updatedData.inGameRandom !== undefined) processArrayField('inGameRandom', updatedData.inGameRandom);
  if (updatedData.gameTips !== undefined) processArrayField('gameTips', updatedData.gameTips);

  // Extras
  if (updatedData.extras) {
    if (updatedData.extras.sundayNight !== undefined) processArrayField('extras.sundayNight', updatedData.extras.sundayNight);
    if (updatedData.extras.friday !== undefined) processArrayField('extras.friday', updatedData.extras.friday);
  }
  
  // Bot Info
  if (updatedData.botInfo) {
      if (updatedData.botInfo.name !== undefined) {
          if(!currentMessages.botInfo) currentMessages.botInfo = {};
          if(currentMessages.botInfo.name !== updatedData.botInfo.name) {
              currentMessages.botInfo.name = updatedData.botInfo.name;
              changed = true;
          }
      }
      if (updatedData.botInfo.defaultPmReply !== undefined) {
          processArrayField('botInfo.defaultPmReply', updatedData.botInfo.defaultPmReply);
      }
  }

  // Chat Summary noNewMessages
  if (updatedData.chatSummary && updatedData.chatSummary.noNewMessages !== undefined) {
      processArrayField('chatSummary.noNewMessages', updatedData.chatSummary.noNewMessages);
  }

  // Update AI Prompts
  if (updatedData.aiPrompts) {
    if (!currentMessages.aiPrompts) currentMessages.aiPrompts = { ...DEFAULT_AI_PROMPTS };
    for (const key in updatedData.aiPrompts) {
      if (Object.prototype.hasOwnProperty.call(updatedData.aiPrompts, key) && DEFAULT_AI_PROMPTS[key] !== undefined) {
        if (currentMessages.aiPrompts[key] !== updatedData.aiPrompts[key]) {
          currentMessages.aiPrompts[key] = updatedData.aiPrompts[key] || DEFAULT_AI_PROMPTS[key];
          changed = true;
        }
      }
    }
    if (!currentMessages.aiPrompts.systemPrompt || currentMessages.aiPrompts.systemPrompt.trim() === '') {
      currentMessages.aiPrompts.systemPrompt = DEFAULT_AI_PROMPTS.systemPrompt;
      changed = true;
    }
  }

  // Update AI Usage Settings
  if (updatedData.aiUsageSettings) {
    if (!currentMessages.aiUsageSettings) currentMessages.aiUsageSettings = { ...DEFAULT_AI_USAGE_SETTINGS };
    for (const key in updatedData.aiUsageSettings) {
      if (Object.prototype.hasOwnProperty.call(updatedData.aiUsageSettings, key) && DEFAULT_AI_USAGE_SETTINGS[key] !== undefined) {
        const newValue = typeof updatedData.aiUsageSettings[key] === 'boolean' ? updatedData.aiUsageSettings[key] : DEFAULT_AI_USAGE_SETTINGS[key];
        if (currentMessages.aiUsageSettings[key] !== newValue) {
          currentMessages.aiUsageSettings[key] = newValue;
          changed = true;
        }
      }
    }
  }

  if (changed) {
    await saveMessages(); // Save the entire 'messages' object to DB
    console.log("MessageService: Configurações de mensagens atualizadas e salvas no MongoDB.");
  }
  return changed;
}

// Initial load should be called from app.js after DB connection
// For now, we export it.
export default {
  loadMessages, // Needs to be called at startup
  getMessages,
  getAIPrompt,
  getAIUsageSetting,
  getSystemPrompt,
  updateMessagesAndPrompts,
  // saveMessages // Not typically public, used by updateMessagesAndPrompts
}; 