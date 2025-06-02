import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_AI_PROMPTS, DEFAULT_AI_USAGE_SETTINGS } from '../constants/aiConstants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MESSAGES_FILE_PATH = path.join(__dirname, '..', '..', 'messages.json');

let messages = {};

const defaultGameTips = [
  "Dica: Comunique-se com sua equipe para coordenar táticas!",
  "Dica: Aprenda os pontos de 'spawn' dos inimigos nos mapas.",
  "Dica: Use granadas de fumaça para bloquear a visão e avançar.",
  "Dica: Recarregar atrás de cobertura pode salvar sua vida.",
  "Dica: Conheça os 'callouts' dos mapas para informar posições."
];

function loadMessages() {
  try {
    if (fs.existsSync(MESSAGES_FILE_PATH)) {
      const fileContent = fs.readFileSync(MESSAGES_FILE_PATH, 'utf-8');
      messages = JSON.parse(fileContent);

      if (!messages.gameTips) {
        messages.gameTips = [...defaultGameTips];
      }
      console.log("Mensagens carregadas de messages.json");

      if (!messages.aiPrompts) {
        console.log("Bloco 'aiPrompts' não encontrado em messages.json, usando padrões.");
        messages.aiPrompts = { ...DEFAULT_AI_PROMPTS };
      } else {
        if (messages.aiPrompts.systemPrompt === undefined || messages.aiPrompts.systemPrompt.trim() === '') {
          console.warn(`Prompt de IA 'systemPrompt' não encontrado ou vazio em messages.json, usando padrão.`);
          messages.aiPrompts.systemPrompt = DEFAULT_AI_PROMPTS.systemPrompt;
        }
        for (const key in DEFAULT_AI_PROMPTS) {
          if (messages.aiPrompts[key] === undefined) {
            console.warn(`Prompt de IA para '${key}' não encontrado em messages.json, usando padrão.`);
            messages.aiPrompts[key] = DEFAULT_AI_PROMPTS[key];
          }
        }
      }

      if (!messages.aiUsageSettings) {
        console.log("Bloco 'aiUsageSettings' não encontrado em messages.json, usando padrões.");
        messages.aiUsageSettings = { ...DEFAULT_AI_USAGE_SETTINGS };
      } else {
        for (const key in DEFAULT_AI_USAGE_SETTINGS) {
          if (messages.aiUsageSettings[key] === undefined) {
            console.warn(`Configuração de uso da IA para '${key}' não encontrada, usando padrão (${DEFAULT_AI_USAGE_SETTINGS[key]}).`);
            messages.aiUsageSettings[key] = DEFAULT_AI_USAGE_SETTINGS[key];
          }
        }
      }
    } else {
      console.error("ERRO: messages.json não encontrado. Usando mensagens e prompts padrão.");
      messages = {
        status: { open: [], closed: [], openingSoon: [], opening5min: [] },
        newMember: [],
        memberLeft: [],
        randomActive: [],
        inGameRandom: [],
        extras: { sundayNight: [], friday: [] },
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
      saveMessages(); // Create the file with defaults
    }
  } catch (error) {
    console.error("Erro ao carregar messages.json:", error);
    messages = {
      status: { open: [], closed: [], openingSoon: [], opening5min: [] },
      newMember: [],
      memberLeft: [],
      randomActive: [],
      inGameRandom: [],
      extras: { sundayNight: [], friday: [] },
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
}

async function saveMessages() {
  try {
    await fs.promises.writeFile(MESSAGES_FILE_PATH, JSON.stringify(messages, null, 2), 'utf-8');
    console.log("Mensagens salvas em messages.json");
  } catch (error) {
    console.error("Erro ao salvar messages.json:", error);
  }
}

function getMessages() {
  return { ...messages };
}

function getAIPrompt(promptKey) {
    return messages.aiPrompts?.[promptKey] || DEFAULT_AI_PROMPTS[promptKey];
}

function getAIUsageSetting(settingKey) {
    if (messages.aiUsageSettings && messages.aiUsageSettings[settingKey] !== undefined) {
        return messages.aiUsageSettings[settingKey];
    }
    return DEFAULT_AI_USAGE_SETTINGS[settingKey];
}

function getSystemPrompt() {
    return messages.aiPrompts?.systemPrompt || DEFAULT_AI_PROMPTS.systemPrompt;
}


async function updateMessagesAndPrompts(updatedData) {
  let changed = false;

  // Helper to update array-based messages
  const updateArrayMessages = (category, key, newValues) => {
    if (newValues !== undefined) {
      const currentValues = messages[category]?.[key] || [];
      const newArray = Array.isArray(newValues) ? newValues : [newValues].filter(Boolean);
      if (JSON.stringify(currentValues) !== JSON.stringify(newArray)) {
        if (!messages[category]) messages[category] = {};
        messages[category][key] = newArray;
        changed = true;
      }
    }
  };

  // Update status messages
  if (updatedData.status) {
    if (!messages.status) messages.status = {};
    for (const key of ['closed', 'openingSoon', 'open', 'opening5min']) {
       if (updatedData.status[key] !== undefined) {
        const newStatusMessages = Array.isArray(updatedData.status[key]) ? updatedData.status[key] : [updatedData.status[key]].filter(Boolean);
        if (JSON.stringify(messages.status[key] || []) !== JSON.stringify(newStatusMessages)) {
          messages.status[key] = newStatusMessages;
          changed = true;
        }
      }
    }
  }

  // Update newMember, memberLeft, randomActive, inGameRandom, gameTips
  for (const key of ['newMember', 'memberLeft', 'randomActive', 'inGameRandom', 'gameTips']) {
    if (updatedData[key] !== undefined) {
      const newArrayMessages = Array.isArray(updatedData[key]) ? updatedData[key] : [updatedData[key]].filter(Boolean);
      if (JSON.stringify(messages[key] || []) !== JSON.stringify(newArrayMessages)) {
        messages[key] = newArrayMessages;
        changed = true;
      }
    }
  }
  // Update extras
  if (updatedData.extras) {
    if (!messages.extras) messages.extras = {};
    for (const key of ['sundayNight', 'friday']) {
      if (updatedData.extras[key] !== undefined) {
        const newExtraMessages = Array.isArray(updatedData.extras[key]) ? updatedData.extras[key] : [updatedData.extras[key]].filter(Boolean);
        if (JSON.stringify(messages.extras[key] || []) !== JSON.stringify(newExtraMessages)) {
          messages.extras[key] = newExtraMessages;
          changed = true;
        }
      }
    }
  }

  // Update AI Prompts
  if (updatedData.aiPrompts) {
    if (!messages.aiPrompts) messages.aiPrompts = { ...DEFAULT_AI_PROMPTS };
    for (const key in updatedData.aiPrompts) {
      if (Object.prototype.hasOwnProperty.call(updatedData.aiPrompts, key) && DEFAULT_AI_PROMPTS[key] !== undefined) { // Only update known prompt keys
        if (messages.aiPrompts[key] !== updatedData.aiPrompts[key]) {
          messages.aiPrompts[key] = updatedData.aiPrompts[key] || DEFAULT_AI_PROMPTS[key]; // Fallback to default if empty
          changed = true;
        }
      }
    }
    if (!messages.aiPrompts.systemPrompt || messages.aiPrompts.systemPrompt.trim() === '') {
      messages.aiPrompts.systemPrompt = DEFAULT_AI_PROMPTS.systemPrompt;
      changed = true;
    }
  }

  // Update AI Usage Settings
  if (updatedData.aiUsageSettings) {
    if (!messages.aiUsageSettings) messages.aiUsageSettings = { ...DEFAULT_AI_USAGE_SETTINGS };
    for (const key in updatedData.aiUsageSettings) {
      if (Object.prototype.hasOwnProperty.call(updatedData.aiUsageSettings, key) && DEFAULT_AI_USAGE_SETTINGS[key] !== undefined) {
        const newValue = typeof updatedData.aiUsageSettings[key] === 'boolean' ? updatedData.aiUsageSettings[key] : DEFAULT_AI_USAGE_SETTINGS[key];
        if (messages.aiUsageSettings[key] !== newValue) {
          messages.aiUsageSettings[key] = newValue;
          changed = true;
        }
      }
    }
  }
  
  if (updatedData.botInfo && updatedData.botInfo.name) {
      if(!messages.botInfo) messages.botInfo = {};
      if(messages.botInfo.name !== updatedData.botInfo.name) {
          messages.botInfo.name = updatedData.botInfo.name;
          changed = true;
      }
  }

  if (updatedData.botInfo && updatedData.botInfo.defaultPmReply) {
    if (!messages.botInfo) messages.botInfo = {};
    const newDefaultPmReply = Array.isArray(updatedData.botInfo.defaultPmReply) ? updatedData.botInfo.defaultPmReply : [updatedData.botInfo.defaultPmReply].filter(Boolean);
    if (JSON.stringify(messages.botInfo.defaultPmReply || []) !== JSON.stringify(newDefaultPmReply)) {
        messages.botInfo.defaultPmReply = newDefaultPmReply;
        changed = true;
    }
  }

  if (updatedData.chatSummary && updatedData.chatSummary.noNewMessages) {
    if (!messages.chatSummary) messages.chatSummary = {};
    const newNoNewMessages = Array.isArray(updatedData.chatSummary.noNewMessages) ? updatedData.chatSummary.noNewMessages : [updatedData.chatSummary.noNewMessages].filter(Boolean);
    if (JSON.stringify(messages.chatSummary.noNewMessages || []) !== JSON.stringify(newNoNewMessages)) {
        messages.chatSummary.noNewMessages = newNoNewMessages;
        changed = true;
    }
  }

  if (changed) {
    await saveMessages();
    console.log("MessageService: messages.json atualizado.");
  }
  return changed;
}

// Initial load
loadMessages();

export default {
  loadMessages,
  saveMessages,
  getMessages,
  getAIPrompt,
  getAIUsageSetting,
  getSystemPrompt,
  updateMessagesAndPrompts
}; 