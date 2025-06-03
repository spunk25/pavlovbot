import DatabaseService from './DatabaseService.js'; // Import DatabaseService
import { DEFAULT_AI_PROMPTS, DEFAULT_AI_USAGE_SETTINGS } from '../constants/aiConstants.js';
import { getRandomElement } from '../utils/generalUtils.js'; // Assuming getRandomElement is here

const MESSAGES_COLLECTION_NAME = 'message_configurations';
const MESSAGES_DOC_ID = 'botMessagesConfig';

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
    _id: MESSAGES_DOC_ID,
    status: {
      closed: ["Servidor fechado por hoje! Até a próxima sessão de Pavlov VR!"],
      openingSoon: ["Servidor abrindo em breve! Preparem seus headsets!"],
      opening5min: ["Servidor abrindo em 5 minutos! Preparem-se!"],
      open: ["Servidor aberto! Bora jogar Pavlov VR!"]
    },
    newMember: ["Bem-vindo(a) ao grupo! Que seus tiros sejam certeiros."],
    memberLeft: ["Um operador nos deixou. Sentiremos sua falta nas trincheiras."],
    randomActive: ["Manter a comunicação clara é a chave para a vitória no Pavlov!"],
    inGameRandom: ["Recarregando! Cubram-me!", "Inimigo à vista!", "Plantei a bomba!"],
    extras: {
      sundayNight: ["Última chance de jogar Pavlov VR esta semana! Aproveitem!"],
      friday: ["Sextou com Pavlov VR! Quem anima?"]
    },
    gameTips: ["Mantenha-se em movimento para não virar um alvo fácil.", "Comunicação é tudo! Use o rádio."],
    messageDeleted: ["Alguém apagou uma mensagem... O que será que era? 🤔", "Ops, uma mensagem sumiu do mapa!"],
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
      const arrayKeys = ['newMember', 'memberLeft', 'randomActive', 'inGameRandom', 'gameTips', 'messageDeleted'];
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
    // Prepare data for saving: ensure _id is present for upsert
    const dataToSave = { ...messages }; // messages já deve ter a estrutura correta
    if (!dataToSave._id) { // Adiciona _id se não estiver presente (ex: vindo de um JSON externo)
        dataToSave._id = MESSAGES_DOC_ID;
    }
    
    const { _id, ...dataToSet } = dataToSave;
    
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
    if (updatedData.status.closed !== undefined) processArrayField('status.closed', updatedData.status.closed);
    if (updatedData.status.openingSoon !== undefined) processArrayField('status.openingSoon', updatedData.status.openingSoon);
    if (updatedData.status.open !== undefined) processArrayField('status.open', updatedData.status.open);
    if (updatedData.status.opening5min !== undefined) processArrayField('status.opening5min', updatedData.status.opening5min);
  }

  // Other direct array messages
  if (updatedData.newMember !== undefined) processArrayField('newMember', updatedData.newMember);
  if (updatedData.memberLeft !== undefined) processArrayField('memberLeft', updatedData.memberLeft);
  if (updatedData.randomActive !== undefined) processArrayField('randomActive', updatedData.randomActive);
  if (updatedData.inGameRandom !== undefined) processArrayField('inGameRandom', updatedData.inGameRandom);
  if (updatedData.gameTips !== undefined) processArrayField('gameTips', updatedData.gameTips);
  if (updatedData.messageDeleted !== undefined) processArrayField('messageDeleted', updatedData.messageDeleted);

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

// Nova função para substituir todas as mensagens a partir de um JSON
async function replaceAllMessagesFromJSON(jsonData) {
    try {
        const db = await DatabaseService.getDb();
        const collection = db.collection(MESSAGES_COLLECTION_NAME);

        // Garante que a estrutura base e os defaults sejam aplicados ao jsonData
        // para evitar que campos essenciais faltem.
        const defaultStructure = getDefaultMessageStructure(); // Não tem _id
        let newMessagesData = { ...defaultStructure, ...jsonData };

        // Deep merge para objetos aninhados importantes, garantindo que não sejam sobrescritos por um objeto vazio
        // ou que mantenham a estrutura default se não vierem no jsonData.
        newMessagesData.aiPrompts = { ...defaultStructure.aiPrompts, ...(jsonData.aiPrompts || {}) };
        newMessagesData.aiUsageSettings = { ...defaultStructure.aiUsageSettings, ...(jsonData.aiUsageSettings || {}) };
        newMessagesData.status = { ...defaultStructure.status, ...(jsonData.status || {}) };
        newMessagesData.extras = { ...defaultStructure.extras, ...(jsonData.extras || {}) };
        newMessagesData.chatSummary = { ...defaultStructure.chatSummary, ...(jsonData.chatSummary || {}) };
        newMessagesData.botInfo = { ...defaultStructure.botInfo, ...(jsonData.botInfo || {}) };

        // Garante que campos que devem ser arrays sejam arrays
        const arrayKeys = ['newMember', 'memberLeft', 'randomActive', 'inGameRandom', 'gameTips', 'messageDeleted'];
        arrayKeys.forEach(key => {
            if (!Array.isArray(newMessagesData[key]) && defaultStructure[key]) {
                 // Se não for array e tiver um default que é array, usa o default
                newMessagesData[key] = Array.isArray(jsonData[key]) ? jsonData[key] : defaultStructure[key];
            } else if (!Array.isArray(newMessagesData[key])) {
                newMessagesData[key] = []; // Fallback para array vazio se não houver default
            }
        });
        
        // Validação específica para sub-arrays (status, extras, etc.)
        const ensureSubArrays = (obj, defaultObj, keys) => {
            if (obj) {
                keys.forEach(key => {
                    if (!Array.isArray(obj[key])) {
                        obj[key] = (defaultObj && Array.isArray(defaultObj[key])) ? defaultObj[key] : [];
                    }
                });
            }
        };

        ensureSubArrays(newMessagesData.status, defaultStructure.status, Object.keys(defaultStructure.status || {}));
        ensureSubArrays(newMessagesData.extras, defaultStructure.extras, Object.keys(defaultStructure.extras || {}));
        if (newMessagesData.chatSummary && !Array.isArray(newMessagesData.chatSummary.noNewMessages)) {
            newMessagesData.chatSummary.noNewMessages = defaultStructure.chatSummary.noNewMessages || [];
        }
        if (newMessagesData.botInfo && !Array.isArray(newMessagesData.botInfo.defaultPmReply)) {
            newMessagesData.botInfo.defaultPmReply = defaultStructure.botInfo.defaultPmReply || [];
        }
        
        // Adiciona o _id fixo para a operação de replaceOne/upsert
        const documentToSave = { _id: MESSAGES_DOC_ID, ...newMessagesData };
        
        // Remove o _id do objeto que vai no $set, pois não se pode atualizar _id
        const { _id, ...dataToSet } = documentToSave;

        await collection.replaceOne(
            { _id: MESSAGES_DOC_ID }, // Filtro para encontrar o documento
            dataToSet,                // O novo documento (sem _id, pois _id está no filtro)
            { upsert: true }          // Cria o documento se não existir
        );

        // Atualiza o cache em memória
        messages = { ...newMessagesData }; // newMessagesData já é a estrutura completa sem o _id no nível raiz
                                        // mas o cache 'messages' pode ou não ter _id dependendo de como é usado.
                                        // Para consistência com loadMessages, vamos manter o cache sem _id no topo.
        console.log("MessageService: Todas as mensagens e prompts foram substituídos no MongoDB a partir do JSON fornecido.");
        return true;
    } catch (error) {
        console.error("MessageService: Erro ao substituir todas as mensagens a partir do JSON:", error);
        return false;
    }
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
  replaceAllMessagesFromJSON, // Exporta a nova função
  // saveMessages // Not typically public, used by updateMessagesAndPrompts
}; 