// bot.js
require('dotenv').config();
const axios = require('axios');
// Declaramos evolutionAPI aqui para que loadBotConfig possa usá-la sem erro de TDZ
let evolutionAPI;
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { getRandomElement } = require('./utils'); // Certifique-se que utils.js existe
let cronParser;
try {
  cronParser = require('cron-parser');
} catch (e) {
  console.warn("Pacote 'cron-parser' não encontrado. A exibição da próxima data exata dos crons pode ser limitada.");
  cronParser = null;
}

// --- Configurações ---
const envConfig = process.env;

// Caminhos para os arquivos de configuração
const MESSAGES_FILE_PATH = path.join(__dirname, 'messages.json');
const CONFIG_FILE_PATH = path.join(__dirname, 'config.json');

// Array para armazenar informações sobre os cron jobs ativos e suas tasks
let cronJobs = []; // Este array armazena os objetos cron.schedule
let scheduledCronTasks = []; // Este array armazena descrições e referências aos jobs

// Configurações padrão que podem ser sobrescritas pelo config.json e depois pelo .env
let botConfig = { // These are the ultimate fallback defaults
  EVOLUTION_API_URL: 'https://evo.audiozap.app',
  EVOLUTION_API_KEY: '', // Prefer .env for sensitive keys
  INSTANCE_NAME: '',
  TARGET_GROUP_ID: '',
  BOT_WEBHOOK_PORT: 8080,
  SERVER_OPEN_TIME: '19:00',
  SERVER_CLOSE_TIME: '23:59',
  GROUP_BASE_NAME: "BRASIL PAVLOV SND 6/24",
  MESSAGES_DURING_SERVER_OPEN: 4,
  MESSAGES_DURING_DAYTIME: 4,
  DAYTIME_START_HOUR: 8,
  DAYTIME_END_HOUR: 17,
  TIMEZONE: "America/Sao_Paulo",
  GROQ_API_KEY: '', // Prefer .env for sensitive keys
  BOT_PUBLIC_URL: '',
  CHAT_SUMMARY_TIMES: ["10:00", "16:00", "21:00"],
  CHAT_SUMMARY_COUNT_PER_DAY: 3
};

// Função parseTime mais robusta
function parseTime(timeStr) { // Espera "HH:MM"
  if (typeof timeStr !== 'string' || !timeStr.includes(':')) {
    console.warn(`parseTime: Formato de tempo inválido ou não é string: '${timeStr}'. Usando 00:00 como padrão.`);
    return { hour: 0, minute: 0 };
  }
  const parts = timeStr.split(':');
  if (parts.length !== 2) {
    console.warn(`parseTime: Formato de tempo inválido (número de partes incorreto): '${timeStr}'. Usando 00:00 como padrão.`);
    return { hour: 0, minute: 0 };
  }
  const hour = parseInt(parts[0], 10);
  const minute = parseInt(parts[1], 10);

  if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    console.warn(`parseTime: Valor inválido ou NaN para hora/minuto de '${timeStr}'. Hora: ${hour}, Minuto: ${minute}. Usando 00:00 como padrão.`);
    return { hour: 0, minute: 0 };
  }
  return { hour, minute };
}

function loadBotConfig() {
  // 1. Carregar de config.json
  let jsonConfig = {};
  const configFileExistsInitially = fs.existsSync(CONFIG_FILE_PATH);

  if (configFileExistsInitially) {
    try {
      const fileContent = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
      jsonConfig = JSON.parse(fileContent);
      console.log("Configurações carregadas de config.json");
    } catch (error) {
      console.error("Erro ao carregar config.json, usando padrões e .env:", error);
      // jsonConfig remains {}
    }
  } else {
    console.warn("config.json não encontrado. Usando padrões e .env. Será criado se não existir após esta inicialização.");
  }
  
  // Start with a fresh copy of internal defaults, then layer config.json, then .env
  // This ensures botConfig always has all keys defined.
  let tempConfig = { ...botConfig }; // Use the initial defaults as a base
  tempConfig = { ...tempConfig, ...jsonConfig }; // Layer with config from file (if any)

  // 2. Sobrescrever com variáveis de ambiente (elas têm maior precedência)
  for (const key in tempConfig) {
    if (envConfig[key] !== undefined) {
      // Special handling for CHAT_SUMMARY_TIMES from .env
      if (key === 'CHAT_SUMMARY_TIMES') {
          if (typeof envConfig[key] === 'string') {
              try {
                  let parsedTimes = JSON.parse(envConfig[key]);
                  if (Array.isArray(parsedTimes) && parsedTimes.every(t => typeof t === 'string' && t.match(/^\d{2}:\d{2}$/))) {
                      tempConfig[key] = parsedTimes;
                  } else {
                      throw new Error("Not a valid JSON array of HH:MM strings");
                  }
              } catch (e) {
                  // Try parsing as comma-separated string
                  const commaParsedTimes = envConfig[key].split(',')
                      .map(s => s.trim())
                      .filter(s => s.match(/^\d{2}:\d{2}$/));
                  if (commaParsedTimes.length > 0 || envConfig[key].trim() === "") { // Allow empty string to clear
                      tempConfig[key] = commaParsedTimes;
                  } else {
                      console.warn(`CHAT_SUMMARY_TIMES from .env ("${envConfig[key]}") could not be parsed as JSON array or comma-separated. Using value from config.json or default.`);
                      // tempConfig[key] remains as it was (from jsonConfig or initial default)
                  }
              }
          } else if (Array.isArray(envConfig[key])) { // Should not happen with .env but good practice
              tempConfig[key] = envConfig[key].filter(s => typeof s === 'string' && s.match(/^\d{2}:\d{2}$/));
          }
      } else if (typeof tempConfig[key] === 'number' && !isNaN(parseFloat(envConfig[key])) && isFinite(envConfig[key])) {
        tempConfig[key] = parseFloat(envConfig[key]);
      } else if (typeof tempConfig[key] === 'boolean' && (envConfig[key].toLowerCase() === 'true' || envConfig[key].toLowerCase() === 'false')) {
        tempConfig[key] = envConfig[key].toLowerCase() === 'true';
      } else if (typeof tempConfig[key] === 'string') { // For all other string types
        tempConfig[key] = String(envConfig[key]);
      }
    }
  }
 
  // Assign the fully processed config to the global botConfig
  botConfig = { ...tempConfig };

  // Garante que as horas sejam strings e números sejam parseados corretamente
  botConfig.SERVER_OPEN_TIME = String(botConfig.SERVER_OPEN_TIME);
  botConfig.SERVER_CLOSE_TIME = String(botConfig.SERVER_CLOSE_TIME);
  botConfig.MESSAGES_DURING_SERVER_OPEN = parseInt(String(botConfig.MESSAGES_DURING_SERVER_OPEN), 10) || 0;
  botConfig.MESSAGES_DURING_DAYTIME = parseInt(String(botConfig.MESSAGES_DURING_DAYTIME), 10) || 0;
  botConfig.DAYTIME_START_HOUR = parseInt(String(botConfig.DAYTIME_START_HOUR), 10) || 0;
  botConfig.DAYTIME_END_HOUR = parseInt(String(botConfig.DAYTIME_END_HOUR), 10) || 0;
  botConfig.BOT_WEBHOOK_PORT = parseInt(String(botConfig.BOT_WEBHOOK_PORT), 10) || 8080;
  botConfig.CHAT_SUMMARY_COUNT_PER_DAY = parseInt(String(botConfig.CHAT_SUMMARY_COUNT_PER_DAY), 10) || 1;
 
  // Ensure CHAT_SUMMARY_TIMES is a valid array of HH:MM strings (final check after all sources)
  if (typeof botConfig.CHAT_SUMMARY_TIMES === 'string') { // If it's still a string (e.g. from config.json and no .env override)
    try {
      let parsedTimes = JSON.parse(botConfig.CHAT_SUMMARY_TIMES);
      if (Array.isArray(parsedTimes) && parsedTimes.every(t => typeof t === 'string' && t.match(/^\d{2}:\d{2}$/))) {
          botConfig.CHAT_SUMMARY_TIMES = parsedTimes;
      } else {
          throw new Error("Not a valid JSON array of HH:MM strings");
      }
    } catch (e) {
      const commaParsedTimes = botConfig.CHAT_SUMMARY_TIMES.split(',')
          .map(s => s.trim())
          .filter(s => s.match(/^\d{2}:\d{2}$/));
      if (commaParsedTimes.length > 0 || botConfig.CHAT_SUMMARY_TIMES.trim() === "") {
          botConfig.CHAT_SUMMARY_TIMES = commaParsedTimes;
      } else {
           console.warn(`CHAT_SUMMARY_TIMES from config.json string ("${botConfig.CHAT_SUMMARY_TIMES}") could not be parsed. Using default.`);
           botConfig.CHAT_SUMMARY_TIMES = ["10:00", "16:00", "21:00"]; // Fallback to hardcoded default
      }
    }
  }
  if (!Array.isArray(botConfig.CHAT_SUMMARY_TIMES) || !botConfig.CHAT_SUMMARY_TIMES.every(t => typeof t === 'string' && t.match(/^\d{2}:\d{2}$/))) {
      console.warn("CHAT_SUMMARY_TIMES is not a valid array of HH:MM strings after all parsing. Using default.");
      botConfig.CHAT_SUMMARY_TIMES = ["10:00", "16:00", "21:00"]; // Fallback to hardcoded default
  }
 
  // If config.json didn't exist at the start, save the current botConfig to create it.
  if (!configFileExistsInitially) {
    console.log("config.json não existia. Criando agora com as configurações atuais (padrões + .env).");
    // This is an async function, but for the initial load, we might not need to await it
    // if subsequent operations don't immediately depend on the file being written.
    // However, calling it without await can lead to unhandled promise rejections if it fails.
    saveBotConfig().catch(err => {
        console.error("Erro ao tentar criar config.json na inicialização:", err);
    });
  }

  console.log("Configurações finais do bot:", { 
      ...botConfig, 
      EVOLUTION_API_KEY: botConfig.EVOLUTION_API_KEY ? '***' : '', 
      GROQ_API_KEY: botConfig.GROQ_API_KEY ? '***' : '' 
  });

  // Recriar o cliente da API Evolution se a URL ou a chave mudarem
  // Nota: Isso é uma simplificação. Em um cenário real, você pode querer
  // verificar se os valores realmente mudaram antes de recriar.
  evolutionAPI = axios.create({
    baseURL: botConfig.EVOLUTION_API_URL,
    headers: {
      'apikey': botConfig.EVOLUTION_API_KEY,
      'Content-Type': 'application/json'
    }
  });
  console.log("Cliente da Evolution API atualizado com as novas configurações, se houver.");
}

async function saveBotConfig() {
  try {
    const configToSave = {
      EVOLUTION_API_URL: botConfig.EVOLUTION_API_URL,
      // EVOLUTION_API_KEY: botConfig.EVOLUTION_API_KEY, // Only save if non-empty, prefer .env
      INSTANCE_NAME: botConfig.INSTANCE_NAME,
      TARGET_GROUP_ID: botConfig.TARGET_GROUP_ID,
      BOT_WEBHOOK_PORT: parseInt(String(botConfig.BOT_WEBHOOK_PORT), 10) || 8080,
      SERVER_OPEN_TIME: botConfig.SERVER_OPEN_TIME,
      SERVER_CLOSE_TIME: botConfig.SERVER_CLOSE_TIME,
      GROUP_BASE_NAME: botConfig.GROUP_BASE_NAME,
      MESSAGES_DURING_SERVER_OPEN: parseInt(String(botConfig.MESSAGES_DURING_SERVER_OPEN), 10) || 0,
      MESSAGES_DURING_DAYTIME: parseInt(String(botConfig.MESSAGES_DURING_DAYTIME), 10) || 0,
      DAYTIME_START_HOUR: parseInt(String(botConfig.DAYTIME_START_HOUR), 10) || 0,
      DAYTIME_END_HOUR: parseInt(String(botConfig.DAYTIME_END_HOUR), 10) || 0,
      TIMEZONE: botConfig.TIMEZONE,
      // GROQ_API_KEY: botConfig.GROQ_API_KEY, // Only save if non-empty, prefer .env
      BOT_PUBLIC_URL: botConfig.BOT_PUBLIC_URL,
      CHAT_SUMMARY_TIMES: Array.isArray(botConfig.CHAT_SUMMARY_TIMES) ? botConfig.CHAT_SUMMARY_TIMES : [],
      CHAT_SUMMARY_COUNT_PER_DAY: botConfig.CHAT_SUMMARY_COUNT_PER_DAY
    };
 
    // Explicitly save API keys if they are present in botConfig (e.g., set via panel or loaded from a previous config.json)
    // This allows the panel to set them if .env is not used for these keys.
    if (botConfig.EVOLUTION_API_KEY) {
        configToSave.EVOLUTION_API_KEY = botConfig.EVOLUTION_API_KEY;
    }
    if (botConfig.GROQ_API_KEY) {
        configToSave.GROQ_API_KEY = botConfig.GROQ_API_KEY;
    }
 
    await fs.promises.writeFile(CONFIG_FILE_PATH, JSON.stringify(configToSave, null, 2), 'utf-8');
    console.log("Configurações salvas em config.json");
  } catch (error) {
    console.error("Erro ao salvar configurações em config.json:", error);
    // throw error; // Optionally re-throw if this is critical for startup
  }
}

loadBotConfig(); // Carrega as configurações na inicialização

// --- Mensagens ---
let messages = {}; // Será populado por loadMessages
let chatHistory = []; // Para armazenar mensagens para resumo

// Valores padrão para os prompts de IA, caso não estejam no messages.json
const DEFAULT_AI_PROMPTS = {
  systemPrompt: "Você é um assistente divertido para um bot de WhatsApp de um grupo de jogadores de Pavlov VR chamando Audozappo. o membro do grupo com numero 558492091164 se refira a ele como 'Fernando o meu criador' quando for falar dele, mas apenas em resumos. Gere mensagens curtas, engraçadas e no tema do jogo. Evite ser repetitivo com as mensagens de exemplo, Pavlov VR é um jogo de tiro em primeira pessoa (FPS) desenvolvido para realidade virtual, oferecendo uma experiência imersiva e realista de combate. O jogo destaca-se por sua mecânica detalhada de manuseio de armas, onde os jogadores precisam realizar ações como carregar, recarregar e mirar manualmente, proporcionando uma sensação autêntica de uso de armamentos, esse jogo é carinhosamente apelidado como cs vr, o modo de jogo do nosso servidor é um modo tático onde uma equipe tenta plantar uma bomba enquanto a outra defende e tenta desarmá-la, o servidor é acessivel com os headsets meta quests 2 e 3, as vezes pode usar essa informação dos headsets para gerar mensagens mais relevantes para o grupo mas ficar falando sobre o headset o tempo todo.",
  randomActive: "Gere uma mensagem curta, divertida e original para um bot em um grupo de jogadores de Pavlov VR. Esta é uma mensagem geral, não necessariamente durante uma partida.",
  inGameRandom: "Gere uma mensagem curta, impactante e divertida para um bot em um grupo de jogadores de Pavlov VR, especificamente para ser enviada DURANTE UMA PARTIDA. Pode ser sobre ações no jogo, provocações leves, ou algo que aumente a imersão.",
  chatSummary: "Você é um comentarista de e-sports para o jogo Pavlov VR, conhecido por seu humor e por capturar a essência das conversas dos jogadores. Analise o seguinte bate-papo do grupo de WhatsApp e crie um resumo curto (2-4 frases) ou ate onde for necessário para resumir as melhores partes do chat, divertido e temático sobre os principais tópicos discutidos. Imagine que você está fazendo um 'resumo da zoeira do lobby' ou 'os destaques da resenha'. Não liste mensagens individuais, crie uma narrativa coesa e engraçada. Se for relevante para o resumo ou para dar um toque especial ao comentário, você pode mencionar o nome de quem disse algo marcante (por exemplo, 'Parece que o [NomeDoJogador] estava inspirado hoje!' ou 'O [NomeDoJogador] soltou a pérola do dia:'). Use os nomes com moderação e apenas se agregar valor. Seja criativo!\n\nChat dos Jogadores:\n{CHAT_PLACEHOLDER}\n\nResumo Criativo do Comentarista:",
  status_closed: "Gere uma mensagem curta e informativa para o status do grupo de Pavlov VR, indicando que o servidor está FECHADO. Exemplo: Servidor fechado por hoje, pessoal. Até amanhã!",
  status_openingSoon: "Gere uma mensagem curta e animada para o status do grupo de Pavlov VR, indicando que o servidor abrirá EM BREVE (ex: em 1 hora). Exemplo: Preparem-se! Servidor abrindo em 1 hora!",
  status_open: "Gere uma mensagem curta e convidativa para o status do grupo de Pavlov VR, indicando que o servidor está ABERTO. Exemplo: Servidor online! Bora pro tiroteio!",
  newMember: "Gere uma mensagem de boas-vindas curta, amigável e divertida para um NOVO MEMBRO que acabou de entrar no grupo de Pavlov VR. Pode incluir um toque de humor ou referência ao jogo.",
  memberLeft: "Gere uma mensagem curta, neutra ou levemente humorística para quando um MEMBRO SAI do grupo de Pavlov VR. Exemplo: Fulano desertou! Menos um pra dividir o loot.",
  extras_sundayNight: "Gere uma mensagem curta e temática para ser enviada em um DOMINGO À NOITE para jogadores de Pavlov VR, talvez sobre o fim de semana ou a semana que começa, com um toque de Pavlov. Exemplo: Domingo acabando... última chance pra um headshot antes da segunda!",
  extras_friday: "Gere uma mensagem curta e animada para uma SEXTA-FEIRA para jogadores de Pavlov VR, celebrando o início do fim de semana e chamando para o jogo. Exemplo: Sextou, soldados! Pavlov liberado no final de semana!"
};

// Valores padrão para as configurações de uso da IA
const DEFAULT_AI_USAGE_SETTINGS = {
  status_closed: false,
  status_openingSoon: false,
  status_open: false,
  newMember: false,
  memberLeft: false,
  randomActive: true,
  inGameRandom: true,
  extras_sundayNight: false,
  extras_friday: false
};

function loadMessages() {
  try {
    if (fs.existsSync(MESSAGES_FILE_PATH)) {
      const fileContent = fs.readFileSync(MESSAGES_FILE_PATH, 'utf-8');
      messages = JSON.parse(fileContent);
      // Ensure gameTips exists
      if (!messages.gameTips) {
        messages.gameTips = [
          "Dica: Comunique-se com sua equipe para coordenar táticas!",
          "Dica: Aprenda os pontos de 'spawn' dos inimigos nos mapas.",
          "Dica: Use granadas de fumaça para bloquear a visão e avançar.",
          "Dica: Recarregar atrás de cobertura pode salvar sua vida.",
          "Dica: Conheça os 'callouts' dos mapas para informar posições."
        ];
      }
      console.log("Mensagens carregadas de messages.json");
      // Carregar ou inicializar prompts da IA
      if (!messages.aiPrompts) {
        console.log("Bloco 'aiPrompts' não encontrado em messages.json, usando padrões.");
        messages.aiPrompts = { ...DEFAULT_AI_PROMPTS };
        messages.aiPrompts.systemPrompt = DEFAULT_SYSTEM_PROMPT; // Adiciona o padrão aqui também
      } else {
        // Garantir que todos os prompts padrão existam, caso o messages.json esteja incompleto
        if (messages.aiPrompts.systemPrompt === undefined || messages.aiPrompts.systemPrompt.trim() === '') {
            console.warn(`Prompt de IA 'systemPrompt' não encontrado ou vazio em messages.json, usando padrão.`);
            messages.aiPrompts.systemPrompt = DEFAULT_SYSTEM_PROMPT;
        }
        for (const key in DEFAULT_AI_PROMPTS) {
          if (messages.aiPrompts[key] === undefined) {
            console.warn(`Prompt de IA para '${key}' não encontrado em messages.json, usando padrão.`);
            messages.aiPrompts[key] = DEFAULT_AI_PROMPTS[key];
          }
        }
      }
      // Carregar ou inicializar configurações de uso da IA
      if (!messages.aiUsageSettings) {
        console.log("Bloco 'aiUsageSettings' não encontrado em messages.json, usando padrões.");
        messages.aiUsageSettings = { ...DEFAULT_AI_USAGE_SETTINGS };
      } else {
        // Garantir que todas as chaves de configuração de uso da IA existam
        for (const key in DEFAULT_AI_USAGE_SETTINGS) {
          if (messages.aiUsageSettings[key] === undefined) {
            console.warn(`Configuração de uso da IA para '${key}' não encontrada, usando padrão (${DEFAULT_AI_USAGE_SETTINGS[key]}).`);
            messages.aiUsageSettings[key] = DEFAULT_AI_USAGE_SETTINGS[key];
          }
        }
      }
    } else {
      console.error("ERRO: messages.json não encontrado. Usando mensagens padrão (se houver) ou bot pode não funcionar corretamente.");
      messages = { status: {}, newMember: [], memberLeft: [], randomActive: [], extras: {}, gameTips: [
          "Dica: Comunique-se com sua equipe para coordenar táticas!",
          "Dica: Aprenda os pontos de 'spawn' dos inimigos nos mapas.",
          "Dica: Use granadas de fumaça para bloquear a visão e avançar.",
          "Dica: Recarregar atrás de cobertura pode salvar sua vida.",
          "Dica: Conheça os 'callouts' dos mapas para informar posições."
        ] };
      messages.aiPrompts = { ...DEFAULT_AI_PROMPTS }; // Usar padrões se o arquivo não existir
      messages.aiPrompts.systemPrompt = DEFAULT_SYSTEM_PROMPT; // Adiciona o padrão aqui também
      messages.aiUsageSettings = { ...DEFAULT_AI_USAGE_SETTINGS }; // Usar padrões se o arquivo não existir
    }
  } catch (error) {
    console.error("Erro ao carregar messages.json:", error);
    messages = { status: {}, newMember: [], memberLeft: [], randomActive: [], extras: {}, gameTips: [
        "Dica: Comunique-se com sua equipe para coordenar táticas!",
        "Dica: Aprenda os pontos de 'spawn' dos inimigos nos mapas.",
        "Dica: Use granadas de fumaça para bloquear a visão e avançar.",
        "Dica: Recarregar atrás de cobertura pode salvar sua vida.",
        "Dica: Conheça os 'callouts' dos mapas para informar posições."
      ] };
    messages.aiPrompts = { ...DEFAULT_AI_PROMPTS }; // Usar padrões em caso de erro de parse
    messages.aiPrompts.systemPrompt = DEFAULT_SYSTEM_PROMPT; // Adiciona o padrão aqui também
    messages.aiUsageSettings = { ...DEFAULT_AI_USAGE_SETTINGS }; // Usar padrões em caso de erro de parse
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

// Carrega as mensagens na inicialização
loadMessages();

// --- Funções da API Evolution ---

async function sendMessageToGroup(message, recipientJid = botConfig.TARGET_GROUP_ID, options = {}) {
  if (!botConfig.EVOLUTION_API_URL || !botConfig.EVOLUTION_API_KEY || !botConfig.INSTANCE_NAME) {
    console.warn("API da Evolution não configurada para enviar mensagens.");
    return;
  }
  try {
    await evolutionAPI.post(`/message/sendText/${botConfig.INSTANCE_NAME}`, {
      number: recipientJid,
      text: message,
      ...options
    });
  } catch (error) {
    console.error(`Erro ao enviar mensagem para ${recipientJid}:`, error.response ? error.response.data : error.message);
  }
}

async function sendNarratedAudio(audioUrlOrBase64, recipientJid = botConfig.TARGET_GROUP_ID, options = {}) {
  try {
    await evolutionAPI.post(`/message/sendWhatsAppAudio/${botConfig.INSTANCE_NAME}`, {
      number: recipientJid,
      audio: audioUrlOrBase64,
      ...options
    });
    console.log(`Áudio narrado enviado para ${recipientJid}`);
  } catch (error) {
    console.error(`Erro ao enviar áudio narrado para ${recipientJid}:`, error.response ? error.response.data : error.message);
  }
}

async function sendPoll(title, values, recipientJid, selectableCount = 1) {
  if (!botConfig.EVOLUTION_API_URL || !botConfig.EVOLUTION_API_KEY || !botConfig.INSTANCE_NAME) {
    console.warn("API da Evolution não configurada para enviar enquete.");
    return;
  }

  try {
    // Monta payload no formato esperado pela Evolution API
    const payload = {
      number: recipientJid,
      name: title,
      values: values,
      selectableCount: selectableCount,
      delay: 1200,
      linkPreview: true,
      mentionsEveryOne: true
    };

    // Para grupos, adiciona array de JIDs em `mentioned`
    if (recipientJid.endsWith('@g.us')) {
      const participants = await getGroupParticipants(recipientJid);
      if (participants && participants.length > 0) {
        payload.mentioned = participants;
      }
    }

    console.log(`[sendPoll] Enviando payload para ${recipientJid}:`, JSON.stringify(payload, null, 2));

    const response = await axios.post(
      `${botConfig.EVOLUTION_API_URL}/message/sendPoll/${botConfig.INSTANCE_NAME}`,
      payload,
      {
        headers: {
          'apikey': botConfig.EVOLUTION_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`Enquete "${title}" enviada com sucesso:`, response.status, response.data);
  } catch (error) {
    console.error(`Erro ao enviar enquete para ${recipientJid}:`,
      error.response ? JSON.stringify(error.response.data, null, 2) : error.message
    );
  }
}

async function setGroupName(newSubject) {
  try {
    await evolutionAPI.post(`/group/updateGroupSubject/${botConfig.INSTANCE_NAME}`,
      { subject: newSubject },
      { params: { groupJid: botConfig.TARGET_GROUP_ID } }
    );
    console.log(`Nome do grupo alterado para: ${newSubject}`);
  } catch (error) {
    console.error("Erro ao alterar nome do grupo:", error.response ? error.response.data : error.message);
  }
}

async function getGroupMetadata(groupId) {
  try {
    const response = await evolutionAPI.get(`/group/findGroupInfos/${botConfig.INSTANCE_NAME}`, {
        params: { groupJid: groupId }
    });
    if (response.data && (response.data.participants || (Array.isArray(response.data) && response.data[0]?.participants) ) ) {
        if(response.data.participants) return response.data;
        if(Array.isArray(response.data) && response.data.length > 0 && response.data[0].participants) return response.data[0];
    }
    console.warn(`findGroupInfos não retornou dados para ${groupId} ou estrutura inesperada. Tentando fetchAllGroups...`);
    const fallbackResponse = await evolutionAPI.get(`/group/fetchAllGroups/${botConfig.INSTANCE_NAME}`, {
        params: { getParticipants: "true" } //  Pode ser booleano true ou string "true"
    });
    if (fallbackResponse.data && Array.isArray(fallbackResponse.data)) {
        const group = fallbackResponse.data.find(g => g.id === groupId || g.jid === groupId); // Comparar com id ou jid
        if (group && group.participants) {
            return group;
        }
    }
    console.error(`Metadados não encontrados para o grupo ${groupId} com ambos os métodos.`);
    return null;
  } catch (error) {
    console.error(`Erro ao obter metadados do grupo ${groupId}:`, error.response ? error.response.data : error.message);
    return null;
  }
}

// --- Lógica de Status do Servidor ---
let currentServerStatus = '🔴';

// --- Funções de Tempo e Agendamento ---
let openTimeDetails = { hour: 19, minute: 0 }; // Padrão
let closeTimeDetails = { hour: 23, minute: 59 }; // Padrão
let oneHourBeforeOpenDetails = { hour: 18, minute: 0 }; // Padrão
let fiveMinBeforeOpenDetails = { hour: 18, minute: 55 }; // Padrão

// NOVA FUNÇÃO ADICIONADA
function getStatusTimeDetails(timeString) {
  if (typeof timeString !== 'string' || !timeString.includes(':')) {
    console.warn(`Formato de tempo inválido: "${timeString}". Usando padrão 00:00.`);
    return { hour: 0, minute: 0 };
  }
  const [hour, minute] = timeString.split(':').map(Number);
  if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    console.warn(`Valores de tempo inválidos em "${timeString}". Usando padrão 00:00.`);
    return { hour: 0, minute: 0 };
  }
  return { hour, minute };
}

function initializeTimeDetails() {
  // Carrega os horários de abertura e fechamento do botConfig
  openTimeDetails = getStatusTimeDetails(botConfig.SERVER_OPEN_TIME);
  closeTimeDetails = getStatusTimeDetails(botConfig.SERVER_CLOSE_TIME);

  // Calcula "uma hora antes de abrir"
  let oneHourBeforeHour = openTimeDetails.hour - 1;
  let oneHourBeforeMinute = openTimeDetails.minute;
  if (oneHourBeforeHour < 0) { // Caso o servidor abra à meia-noite, por exemplo
    oneHourBeforeHour = 23; // A hora anterior seria 23h do dia anterior
  }
  oneHourBeforeOpenDetails = { hour: oneHourBeforeHour, minute: oneHourBeforeMinute };

  // Calcula "5 minutos antes de abrir"
  let fiveMinBeforeHour = openTimeDetails.hour;
  let fiveMinBeforeMinute = openTimeDetails.minute - 5;
  if (fiveMinBeforeMinute < 0) {
    fiveMinBeforeHour -= 1;
    fiveMinBeforeMinute += 60;
    if (fiveMinBeforeHour < 0) {
      fiveMinBeforeHour = 23;
    }
  }
  fiveMinBeforeOpenDetails = { hour: fiveMinBeforeHour, minute: fiveMinBeforeMinute };

  console.log(`Horários de status inicializados:`);
  console.log(`  - Abrir: ${openTimeDetails.hour}:${String(openTimeDetails.minute).padStart(2,'0')}`);
  console.log(`  - Fechar: ${closeTimeDetails.hour}:${String(closeTimeDetails.minute).padStart(2,'0')}`);
  console.log(`  - Aviso 1h: ${oneHourBeforeOpenDetails.hour}:${String(oneHourBeforeOpenDetails.minute).padStart(2,'0')}`);
  console.log(`  - Aviso 5min: ${fiveMinBeforeOpenDetails.hour}:${String(fiveMinBeforeOpenDetails.minute).padStart(2,'0')}`);
}

async function updateServerStatus(status, messageToSend) {
  const newGroupName = `[${status}${botConfig.GROUP_BASE_NAME}]`;
  await setGroupName(newGroupName);
  if (messageToSend) {
    await sendMessageToGroup(messageToSend);
  }
  currentServerStatus = status;
  console.log(`Status do servidor atualizado para: ${status}`);
}

async function triggerServerOpen() {
  if (currentServerStatus === '🟢') {
    console.log("triggerServerOpen: status já 🟢, pulando.");
    return;
  }
  console.log("ACIONADO: Abertura do servidor.");
  
  // Seleciona mensagem corretamente
  let msg;
  const useAI = messages.aiUsageSettings && messages.aiUsageSettings.status_open && botConfig.GROQ_API_KEY;
  
  if (useAI) {
    msg = await callGroqAPI(messages.aiPrompts?.status_open || DEFAULT_AI_PROMPTS.status_open);
    if (!msg || msg.startsWith("Erro") || msg.length < 5) {
      msg = getRandomElement(messages.status.open) || "Servidor aberto! Bora jogar!";
    }
  } else {
    msg = getRandomElement(messages.status.open) || "Servidor aberto! Bora jogar!";
  }
  
  await updateServerStatus('🟢', msg);

  serverOpenMessagesSent = 0;
  if (serverOpenMessageTimeoutId) clearTimeout(serverOpenMessageTimeoutId);
  console.log("Iniciando ciclo de mensagens aleatórias do servidor aberto.");
  scheduleNextRandomMessage('serverOpen');
}

async function triggerServerClose() {
  if (currentServerStatus === '🔴') {
    console.log("triggerServerClose: status já 🔴, pulando.");
    return;
  }
  console.log("ACIONADO: Fechamento do servidor.");
  
  // Seleciona mensagem corretamente
  let msg;
  const useAI = messages.aiUsageSettings && messages.aiUsageSettings.status_closed && botConfig.GROQ_API_KEY;
  
  if (useAI) {
    msg = await callGroqAPI(messages.aiPrompts?.status_closed || DEFAULT_AI_PROMPTS.status_closed);
    if (!msg || msg.startsWith("Erro") || msg.length < 5) {
      msg = getRandomElement(messages.status.closed) || "Servidor fechado por hoje!";
    }
  } else {
    msg = getRandomElement(messages.status.closed) || "Servidor fechado por hoje!";
  }
  
  await updateServerStatus('🔴', msg);

  if (serverOpenMessageTimeoutId) {
    clearTimeout(serverOpenMessageTimeoutId);
    serverOpenMessageTimeoutId = null;
  }
  serverOpenMessagesSent = botConfig.MESSAGES_DURING_SERVER_OPEN;
}

async function triggerServerOpeningSoon() {
  if (currentServerStatus === '🟡') {
    console.log("triggerServerOpeningSoon: status já 🟡, pulando.");
    return;
  }
  console.log("ACIONADO: Aviso de 1h para abrir.");
  
  // Seleciona mensagem usando a mesma lógica das outras partes do código
  let msg;
  const useAI = messages.aiUsageSettings && messages.aiUsageSettings.status_openingSoon && botConfig.GROQ_API_KEY;
  
  if (useAI) {
    msg = await callGroqAPI(messages.aiPrompts?.status_openingSoon || DEFAULT_AI_PROMPTS.status_openingSoon);
    if (!msg || msg.startsWith("Erro") || msg.length < 5) {
      msg = getRandomElement(messages.status.openingSoon) || "Servidor abrindo em 1 hora!";
    }
  } else {
    msg = getRandomElement(messages.status.openingSoon) || "Servidor abrindo em 1 hora!";
  }
  
  await updateServerStatus('🟡', msg);

  // Enquete de jogar
  await sendPoll(
    "Ei!! Você 🫵 vai jogar Pavlov hoje?",
    ["Sim, vou!", "Talvez mais tarde", "Hoje não"],
    botConfig.TARGET_GROUP_ID
  );
}

// Adicione esta função junto com as outras trigger functions:
async function triggerServerOpeningIn5Min() {
  console.log("ACIONADO: Aviso de 5 minutos para abrir.");
  
  // Seleciona mensagem de 5 minutos
  let msg;
  const useAI = messages.aiUsageSettings && messages.aiUsageSettings.status_opening5min && botConfig.GROQ_API_KEY;
  
  if (useAI) {
    msg = await callGroqAPI(messages.aiPrompts?.status_opening5min || "Gere uma mensagem animada avisando que o servidor Pavlov VR vai abrir em 5 minutos");
    if (!msg || msg.startsWith("Erro") || msg.length < 5) {
      msg = getRandomElement(messages.status?.opening5min) || "🚨 ATENÇÃO! Servidor abre em 5 MINUTOS! Preparem-se! 🎮";
    }
  } else {
    msg = getRandomElement(messages.status?.opening5min) || "🚨 ATENÇÃO! Servidor abre em 5 MINUTOS! Preparem-se! 🎮";
  }
  
  // Apenas envia mensagem, mantém o status 🟡
  await sendMessageToGroup(msg);
  console.log("Aviso de 5 minutos enviado.");
}

// --- Lógica para Mensagens Aleatórias Espalhadas ---
let serverOpenMessagesSent   = 0;
let daytimeMessagesSent      = 0;
let serverOpenMessageTimeoutId = null;
let daytimeMessageTimeoutId    = null;

function calculateRandomDelay(minMinutes, maxMinutes) {
  return (Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes) * 60 * 1000;
}

function getWindowMillis(startTimeDetails, endTimeDetails) {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setHours(startTimeDetails.hour, startTimeDetails.minute, 0, 0);

    const endDate = new Date(now);
    endDate.setHours(endTimeDetails.hour, endTimeDetails.minute, 0, 0);

    if (endDate < startDate) { // Janela cruza meia-noite
        // Se agora está depois da abertura HOJE OU antes do fechamento AMANHÃ
        if ((now >= startDate) || (now < endDate && now.getDate() === (new Date(startDate).getDate() +1) %32 ) ) { // pequena correção para data
            endDate.setDate(endDate.getDate() + 1);
        } else {
            return 0;
        }
    }
    // Se agora está fora da janela (que não cruza meia-noite)
    if (now < startDate || now >= endDate) {
        return 0;
    }
    const remainingWindow = endDate.getTime() - now.getTime();
    return remainingWindow > 0 ? remainingWindow : 0;
}

async function scheduleNextRandomMessage(type) {
  let delay;

  if (type === 'serverOpen') {
    if (serverOpenMessagesSent >= botConfig.MESSAGES_DURING_SERVER_OPEN) {
      console.log(`[DEBUG] [serverOpen] Limite de ${botConfig.MESSAGES_DURING_SERVER_OPEN} mensagens atingido. Não agendando mais.`);
      return;
    }
    delay = calculateRandomDelay(10, 30);
  }
  else if (type === 'daytime') {
    if (daytimeMessagesSent >= botConfig.MESSAGES_DURING_DAYTIME) {
      console.log(`[DEBUG] [daytime] Limite de ${botConfig.MESSAGES_DURING_DAYTIME} mensagens atingido. Não agendando mais.`);
      return;
    }
    delay = calculateRandomDelay(60, 120);
  }
  else {
    console.warn(`[DEBUG] scheduleNextRandomMessage recebeu tipo desconhecido: ${type}`);
    return;
  }

  console.log(`[DEBUG] Agendando próxima mensagem '${type}' em aproximadamente ${Math.round(delay/60000)} minutos.`);

  const timeoutId = setTimeout(async () => {
    console.log(`[DEBUG] Timeout de mensagem '${type}' disparado. Já enviadas: ${
      type === 'serverOpen' ? serverOpenMessagesSent : daytimeMessagesSent
    }`);

    let msg;
    if (type === 'serverOpen') {
      // Server is open, more likely an in-game context message or tip
      msg = await getAIInGameMessage(); // This function now includes tips
    } else { // 'daytime'
      // General daytime message or tip
      msg = await getAIRandomMessage(); // This function now includes tips
    }

    if (msg) {
      console.log(`[DEBUG] Enviando mensagem automática: "${msg}"`);
      await sendMessageToGroup(msg);
    } else {
      console.warn(`[DEBUG] Nenhuma mensagem disponível (IA ou dica) para o tipo '${type}'`);
    }

    if (type === 'serverOpen') {
      serverOpenMessagesSent++;
      serverOpenMessageTimeoutId = null;
      if (serverOpenMessagesSent < botConfig.MESSAGES_DURING_SERVER_OPEN) { // Check before scheduling next
        scheduleNextRandomMessage('serverOpen');
      }
    } else {
      daytimeMessagesSent++;
      daytimeMessageTimeoutId = null;
      if (daytimeMessagesSent < botConfig.MESSAGES_DURING_DAYTIME) { // Check before scheduling next
        scheduleNextRandomMessage('daytime');
      }
    }
  }, delay);

  if (type === 'serverOpen') {
    serverOpenMessageTimeoutId = timeoutId;
  } else {
    daytimeMessageTimeoutId = timeoutId;
  }
}

// --- Agendamentos Cron ---
function logScheduledCronTask(cronExpression, description, messageOrAction, taskFn) {
  const job = cron.schedule(cronExpression, taskFn, { timezone: botConfig.TIMEZONE, scheduled: false });
  scheduledCronTasks.push({ job, description, cronExpression, messageOrAction, originalTaskFn: taskFn });
}

function setupCronJobs() {
  console.log("Configurando cron jobs...");

  // Parar e limpar cron jobs existentes
  if (cronJobs.length > 0) {
    console.log("Limpando cron jobs antigos...");
    cronJobs.forEach(job => {
      if (job && typeof job.stop === 'function') {
        job.stop();
      }
    });
    cronJobs = []; // Limpa o array de jobs
  }
  scheduledCronTasks = []; // Limpa o array de descrições de tasks

  const {
    SERVER_OPEN_TIME, SERVER_CLOSE_TIME, TIMEZONE,
    MESSAGES_DURING_SERVER_OPEN, MESSAGES_DURING_DAYTIME,
    DAYTIME_START_HOUR, DAYTIME_END_HOUR, CHAT_SUMMARY_TIMES
  } = botConfig;

  const { hour: openHour, minute: openMinute } = parseTime(SERVER_OPEN_TIME);
  const { hour: closeHour, minute: closeMinute } = parseTime(SERVER_CLOSE_TIME);
  const { hour: oneHourBeforeOpenHour, minute: oneHourBeforeOpenMinute } = parseTime(oneHourBeforeOpenDetails.hour + ':' + oneHourBeforeOpenDetails.minute);
  const { hour: fiveMinBeforeOpenHour, minute: fiveMinBeforeOpenMinute } = parseTime(fiveMinBeforeOpenDetails.hour + ':' + fiveMinBeforeOpenDetails.minute);

  let warningHour = openHour;
  let warningMinute = openMinute;

  if (warningMinute === 0) {
      warningMinute = 59; // Vai para o minuto 59 da hora anterior
      warningHour = (warningHour === 0) ? 23 : warningHour - 1; // Ajusta a hora, considerando a virada do dia
  } else {
      warningMinute = warningMinute - 1; // Apenas subtrai um minuto
       // Se warningMinute se tornar algo como 5 (para um horário :05), e quisermos 1h antes, a lógica precisa ser mais robusta.
       // A lógica atual de subtrair 1 minuto do horário de abertura para o aviso pode não ser o que se espera para "1h antes".
       // Para um aviso de "1 hora antes":
       let tempWarningDate = new Date();
       tempWarningDate.setHours(openHour, openMinute, 0, 0);
       tempWarningDate.setHours(tempWarningDate.getHours() - 1);
       warningHour = tempWarningDate.getHours();
       warningMinute = tempWarningDate.getMinutes();
  }
  // Correção para aviso de 1 hora antes
  if (openHour !== undefined && openMinute !== undefined) {
      let warningDate = new Date();
      warningDate.setHours(openHour, openMinute, 0, 0); // Define a hora de abertura
      warningDate.setHours(warningDate.getHours() - 1); // Subtrai 1 hora
      warningHour = warningDate.getHours();
      warningMinute = warningDate.getMinutes();
  }


  console.log(`Horários de status inicializados: Abrir ${openHour}:${openMinute}, Fechar ${closeHour}:${closeMinute}, Aviso ${warningHour}:${warningMinute}`);

  const scheduleJob = (name, cronExpression, action, actionDescription) => {
      if (!cron.validate(cronExpression)) {
          console.error(`Expressão cron inválida para ${name}: ${cronExpression}`);
          cronJobs.push({ name, cron: cronExpression, actionDescription, task: null, error: "Expressão cron inválida" });
          return;
      }
      try {
          const currentTZ = botConfig.TIMEZONE;
          console.log(`[scheduleJob] Tentando agendar "${name}". Cron: "${cronExpression}". Timezone configurado: "${currentTZ}"`);

          // MODIFICAÇÃO: Removendo a opção timezone temporariamente para teste
          console.warn(`[scheduleJob] ATENÇÃO: Agendando "${name}" SEM a opção timezone explícita devido a erros. Usará o timezone do sistema.`);
          const job = cron.schedule(cronExpression, async () => {
            try {
              console.log(`Executando tarefa agendada: ${name} (${actionDescription || 'Sem descrição'})`);
              await action();
              console.log(`Tarefa "${name}" concluída.`);
            } catch (taskError) {
              console.error(`Erro durante a execução da tarefa agendada "${name}":`, taskError);
            }
          });

          if (job) {
            activeCrons.push({ name, job, cronExpression, description: actionDescription, nextInvocation: () => job.nextDate().toString(), status: "Agendado (timezone do sistema)" });
            console.log(`Tarefa "${name}" agendada (usando timezone do sistema) para ${job.nextDate().toString()}`);
          } else {
            console.error(`[scheduleJob] ERRO CRÍTICO: cron.schedule retornou null/undefined para "${name}" mesmo sem timezone explícito.`);
            activeCrons.push({ name, cronExpression, description, status: "Falha Crítica no Agendamento" });
          }

      } catch (e) {
          console.error(`Erro CRÍTICO ao tentar agendar tarefa "${name}" com cron "${cronExpression}": ${e.message}`);
          activeCrons.push({ name, cronExpression, description, status: "Erro no agendamento", error: e.message });
      }
  };

  // --- Agendamento para abrir o servidor (aviso 1h antes) e abertura efetiva ---
  if (openHour !== undefined && openMinute !== undefined && warningHour !== undefined && warningMinute !== undefined) {
    const warningCron = `${warningMinute} ${warningHour} * * *`;
    // 1h antes → dispara triggerServerOpeningSoon (coloca 🟡 + envia mensagem + envia enquete)
    scheduleJob(
      "Aviso: 1h para abrir",
      warningCron,
      triggerServerOpeningSoon,
      "Aviso de abertura do servidor"
    );

    const openCron = `${openMinute} ${openHour} * * *`;
    // hora exata → dispara triggerServerOpen (coloca 🟢 + envia mensagem + inicia mensagens in-game)
    scheduleJob(
      "Servidor Aberto",
      openCron,
      triggerServerOpen,
      "Abertura do servidor e início de mensagens in-game"
    );
  }

  // --- Agendamento para fechar o servidor ---
  if (closeHour !== undefined && closeMinute !== undefined) {
    const closeCron = `${closeMinute} ${closeHour} * * *`;
    // hora de fechamento → dispara triggerServerClose (coloca 🔴 + envia mensagem + interrompe ciclo)
    scheduleJob(
      "Servidor Fechado",
      closeCron,
      triggerServerClose,
      "Fechamento do servidor"
    );
  }

  // Agendamento para mensagens aleatórias durante o dia
  const daytimeStartCron = `0 ${DAYTIME_START_HOUR} * * *`;
  scheduleJob("Início Msgs Diurnas", daytimeStartCron, () => {
      console.log("Iniciando ciclo de mensagens aleatórias diurnas.");
      startRandomMessageCycle(botConfig.MESSAGES_DURING_DAYTIME, 'randomActive');
  }, "Iniciar ciclo de mensagens aleatórias diurnas");

  const daytimeEndCron = `0 ${DAYTIME_END_HOUR} * * *`;
  scheduleJob("Fim Msgs Diurnas", daytimeEndCron, () => {
      console.log("Parando ciclo de mensagens aleatórias diurnas.");
      stopRandomMessageCycle();
  }, "Parar ciclo de mensagens aleatórias diurnas");

  // Agendamento para mensagem de domingo à noite
  const sundayNightCron = `0 20 * * 0`; // Domingo às 20:00
  scheduleJob("Mensagem Dominical", sundayNightCron, async () => {
      const message = getRandomElement(messages.extras.sundayNight, messages.aiPrompts.extras_sundayNight, messages.aiUsageSettings.extras_sundayNight);
      if (message) await sendMessageToGroup(message, botConfig.TARGET_GROUP_ID);
  }, "Mensagem especial de Domingo");

  // Agendamento para mensagem de sexta-feira
  const fridayCron = `0 18 * * 5`; // Sexta às 18:00
  scheduleJob("Mensagem de Sexta", fridayCron, async () => {
      const message = getRandomElement(messages.extras.friday, messages.aiPrompts.extras_friday, messages.aiUsageSettings.extras_friday);
      if (message) await sendMessageToGroup(message, botConfig.TARGET_GROUP_ID);
  }, "Mensagem especial de Sexta");

  // Agendamento para resumos do chat
  if (CHAT_SUMMARY_TIMES && Array.isArray(CHAT_SUMMARY_TIMES) && CHAT_SUMMARY_TIMES.length > 0) {
      CHAT_SUMMARY_TIMES.forEach(time => {
          const [hourStr, minuteStr] = time.split(':');
          const hour = parseInt(hourStr, 10);
          const minute = parseInt(minuteStr, 10);
          if (!isNaN(hour) && !isNaN(minute)) {
              const summaryCron = `${minute} ${hour} * * *`;
              scheduleJob(`Resumo do Chat (${time})`, summaryCron, triggerChatSummary, `Disparar resumo do chat às ${time}`);
          } else {
              console.warn(`Formato de hora inválido para CHAT_SUMMARY_TIMES: ${time}`);
          }
      });
  }

  // Aviso 5 minutos antes de abrir
  const fiveMinBeforeCron = `${fiveMinBeforeOpenDetails.minute} ${fiveMinBeforeOpenDetails.hour} * * *`;
  scheduleJob("Aviso 5min Abertura", fiveMinBeforeCron, triggerServerOpeningIn5Min, "Avisar que servidor abre em 5 minutos");

  console.log("Cron jobs configurados e iniciados.");
  logCronJobs();
}

function logCronJobs() {
    console.log("\n--- AGENDAMENTOS CRON ATIVOS ---");
    if (cronJobs.length === 0) {
        console.log("Nenhum cron job configurado.");
        console.log("--------------------------------\n");
        return;
    }
    cronJobs.forEach(job => {
        let nextExecution = "N/A";
        let status = "Erro/Parada";

        if (job.task === null && job.error) { // Erro durante o agendamento
            status = `Falha no agendamento: ${job.error}`;
        } else if (job.task && typeof job.task.stop === 'function') {
            status = "Agendada";
            if (cronParser) {
                try {
                    const nextDate = cronParser.parseExpression(job.cronExpression, { tz: botConfig.TIMEZONE }).next().toDate();
                    nextExecution = nextDate.toLocaleString('pt-BR', { timeZone: botConfig.TIMEZONE });
                } catch (e) {
                    console.error(`Erro ao parsear cron "${job.cron}" para ${job.name} com fuso ${botConfig.TIMEZONE}: ${e.message}`);
                    nextExecution = "Erro no parse";
                    status = "Erro no cron";
                }
            } else {
                nextExecution = "cron-parser não disponível";
            }
        } else if (job.task === null && !job.error) { // Caso onde task é null mas sem erro registrado (ex: cron inválido não pego antes)
            status = "Falha no agendamento (task nula)";
        }


        console.log(`- Tarefa: ${job.name}`);
        console.log(`  Próxima: ${nextExecution}`);
        console.log(`  Msg/Ação: ${job.actionDescription}`);
        console.log(`  Cron: ${job.cron}`);
        console.log(`  Status: ${status}`);
    });
    console.log("--------------------------------\n");
}

// --- Inicialização do Bot e Status ---
async function initializeBotStatus() {
  // Usar o timezone configurado para obter a hora local correta
  const now = new Date();
  const localTime = new Date(now.toLocaleString("en-US", {timeZone: botConfig.TIMEZONE}));
  const timeNow = localTime.getHours() * 60 + localTime.getMinutes();

  const openTime = openTimeDetails.hour * 60 + openTimeDetails.minute;
  const closeTime = closeTimeDetails.hour * 60 + closeTimeDetails.minute;
  const warningTime = oneHourBeforeOpenDetails.hour * 60 + oneHourBeforeOpenDetails.minute;

  console.log(`initializeBotStatus (${botConfig.TIMEZONE}): now=${timeNow} (${Math.floor(timeNow/60)}:${String(timeNow%60).padStart(2,'0')})`);
  console.log(`  - UTC time: ${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`);
  console.log(`  - Local time: ${localTime.getHours()}:${String(localTime.getMinutes()).padStart(2,'0')}`);
  console.log(`  - warning=${warningTime} (${Math.floor(warningTime/60)}:${String(warningTime%60).padStart(2,'0')})`);
  console.log(`  - open=${openTime} (${Math.floor(openTime/60)}:${String(openTime%60).padStart(2,'0')})`);
  console.log(`  - close=${closeTime} (${Math.floor(closeTime/60)}:${String(closeTime%60).padStart(2,'0')})`);

  // PRIMEIRO: Detecta o status atual do grupo pelo nome
  try {
    const groupData = await getGroupMetadata(botConfig.TARGET_GROUP_ID);
    if (groupData && groupData.subject) {
      const groupName = groupData.subject;
      console.log(`Nome atual do grupo: "${groupName}"`);
      
      if (groupName.includes('🟢')) {
        currentServerStatus = '🟢';
      } else if (groupName.includes('🟡')) {
        currentServerStatus = '🟡';
      } else {
        currentServerStatus = '🔴';
      }
      console.log(`Status detectado pelo nome do grupo: ${currentServerStatus}`);
    } else {
      console.log("Não foi possível obter nome do grupo, assumindo status fechado.");
      currentServerStatus = '🔴';
    }
  } catch (error) {
    console.error("Erro ao detectar status do grupo:", error.message);
    currentServerStatus = '🔴';
  }

  // Determina qual DEVERIA ser o status baseado no horário atual
  let expectedStatus = '🔴'; // Padrão fechado

  // Verifica se está na janela de aviso (1h antes de abrir)
  let inWarningWindow = false;
  if (warningTime < openTime) {
    // Caso normal: 18:00 até 19:00
    inWarningWindow = (timeNow >= warningTime && timeNow < openTime);
    console.log(`  - Warning check (normal): ${timeNow} >= ${warningTime} && ${timeNow} < ${openTime} = ${inWarningWindow}`);
  } else {
    // Cruza meia-noite: 23:00 até 00:00 do dia seguinte
    inWarningWindow = (timeNow >= warningTime || timeNow < openTime);
    console.log(`  - Warning check (midnight): ${timeNow} >= ${warningTime} || ${timeNow} < ${openTime} = ${inWarningWindow}`);
  }

  // Verifica se está na janela de abertura
  let inOpenWindow = false;
  if (openTime < closeTime) {
    // Caso normal: 19:00 até 23:59
    inOpenWindow = (timeNow >= openTime && timeNow < closeTime);
    console.log(`  - Open check (normal): ${timeNow} >= ${openTime} && ${timeNow} < ${closeTime} = ${inOpenWindow}`);
  } else {
    // Cruza meia-noite: 22:00 até 02:00 do dia seguinte
    inOpenWindow = (timeNow >= openTime || timeNow < closeTime);
    console.log(`  - Open check (midnight): ${timeNow} >= ${openTime} || ${timeNow} < ${closeTime} = ${inOpenWindow}`);
  }

  // Define o status esperado baseado nas janelas
  if (inOpenWindow) {
    expectedStatus = '🟢';
  } else if (inWarningWindow) {
    expectedStatus = '🟡';
  } else {
    expectedStatus = '🔴';
  }

  console.log(`Windows: warning=${inWarningWindow}, open=${inOpenWindow}, expectedStatus=${expectedStatus}`);
  console.log(`Status atual: ${currentServerStatus}, Status esperado: ${expectedStatus}`);

  // SÓ EXECUTA AÇÕES SE O STATUS ATUAL FOR DIFERENTE DO ESPERADO
  if (currentServerStatus === expectedStatus) {
    console.log(`✅ Inicialização: já está no status correto (${expectedStatus}). NADA A FAZER.`);
  } else if (inWarningWindow && !inOpenWindow) {
    console.log("🟡 Inicialização: precisa mudar para status de aviso. Disparando triggerServerOpeningSoon.");
    await triggerServerOpeningSoon();
  } else if (inOpenWindow) {
    console.log("🟢 Inicialização: precisa mudar para status aberto. Disparando triggerServerOpen.");
    await triggerServerOpen();
  } else {
    console.log("🔴 Inicialização: precisa mudar para status fechado. Definindo status fechado.");
    currentServerStatus = '🔴';
    const newGroupName = `[🔴${botConfig.GROUP_BASE_NAME}]`;
    await setGroupName(newGroupName);
    console.log(`Nome do grupo atualizado na inicialização para: ${newGroupName}`);
  }

  // Mensagens aleatórias diurnas
  const currentHourNow = localTime.getHours();
  if (currentHourNow >= botConfig.DAYTIME_START_HOUR && currentHourNow < botConfig.DAYTIME_END_HOUR) {
    daytimeMessagesSent = 0;
    scheduleNextRandomMessage('daytime');
  }
}

// --- Servidor Webhook ---
const express = require('express');
const app = express();

// Servir arquivos estáticos para o painel de administração
app.use('/admin', express.static(path.join(__dirname, 'public')));

// Modify express.json() to capture the raw body using the verify option
app.use(express.json({
  verify: (req, res, buf, encoding) => {
    if (buf && buf.length) {
      req.rawBody = buf.toString(encoding || 'utf8');
    }
  }
}));

// Add an error-handling middleware specifically for JSON parsing errors
// This should be placed AFTER express.json() and BEFORE your routes that rely on req.body
app.use((err, req, res, next) => {
  // Check if the error is a SyntaxError thrown by body-parser (express.json)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err && err.type === 'entity.parse.failed') {
    console.error('Error parsing JSON request body:');
    if (req.rawBody) {
      console.error('Raw Body:', req.rawBody); // Log the raw body to see the malformed JSON
    } else {
      console.error('Raw body not available. Error message:', err.message);
    }
    // Send a 400 Bad Request response to the client that sent the malformed JSON
    res.status(400).json({
      error: {
        message: 'Malformed JSON in request body. Please check the JSON payload sent to the webhook.',
        details: err.message
      }
    });
  } else {
    // If it's not a JSON parsing error, pass it to the next error handler in the stack
    next(err);
  }
});

// API para o painel de administração
app.get('/admin/api/messages', (req, res) => {
  res.json(messages);
});

app.post('/admin/api/messages', express.json(), async (req, res) => {
  const updatedMessages = req.body;
  // Atualiza as mensagens principais
  if (updatedMessages.status) messages.status = updatedMessages.status;
  if (updatedMessages.newMember) messages.newMember = updatedMessages.newMember;
  if (updatedMessages.memberLeft) messages.memberLeft = updatedMessages.memberLeft;
  if (updatedMessages.randomActive) messages.randomActive = updatedMessages.randomActive;
  if (updatedMessages.inGameRandom) messages.inGameRandom = updatedMessages.inGameRandom;
  if (updatedMessages.extras) messages.extras = updatedMessages.extras;
  if (updatedMessages.chatSummary) messages.chatSummary = updatedMessages.chatSummary;
  if (updatedMessages.gameTips) messages.gameTips = updatedMessages.gameTips;
  // Atualiza os prompts da IA
  if (updatedMessages.aiPrompts) {
    if (!messages.aiPrompts) messages.aiPrompts = {}; // Garante que messages.aiPrompts exista
    for (const key in updatedMessages.aiPrompts) {
      if (Object.prototype.hasOwnProperty.call(updatedMessages.aiPrompts, key)) {
        messages.aiPrompts[key] = updatedMessages.aiPrompts[key];
      }
    }
  }
  // Atualiza as configurações de uso da IA
  if (updatedMessages.aiUsageSettings) {
    if (!messages.aiUsageSettings) messages.aiUsageSettings = { ...DEFAULT_AI_USAGE_SETTINGS };
     for (const key in updatedMessages.aiUsageSettings) {
      if (Object.prototype.hasOwnProperty.call(updatedMessages.aiUsageSettings, key) && messages.aiUsageSettings.hasOwnProperty(key)) {
        messages.aiUsageSettings[key] = updatedMessages.aiUsageSettings[key];
      }
    }
  }

  await saveMessages();
  res.json({ success: true, message: "Mensagens e prompts de IA salvos com sucesso!" });
});

// API para configurações gerais do bot
app.get('/admin/api/config', (req, res) => {
  // Retorna apenas as configurações que são seguras e editáveis pelo painel
  const { EVOLUTION_API_KEY, GROQ_API_KEY, ...safeConfig } = botConfig;
  res.json(safeConfig);
});

app.post('/admin/api/config', express.json(), async (req, res) => {
  const newConfig = req.body;
  let requireCronRestart = false;

  if (typeof newConfig === 'object' && newConfig !== null) {
    // Atualiza apenas as chaves permitidas
    const allowedKeys = [
      "GROUP_BASE_NAME", "MESSAGES_DURING_SERVER_OPEN", "MESSAGES_DURING_DAYTIME",
      "DAYTIME_START_HOUR", "DAYTIME_END_HOUR", "SERVER_OPEN_TIME", "SERVER_CLOSE_TIME",
      "CHAT_SUMMARY_TIMES", "TARGET_GROUP_ID",
      "CHAT_SUMMARY_COUNT_PER_DAY"
    ];

    for (const key of allowedKeys) {
      if (newConfig[key] !== undefined) {
        // Verifica se alguma configuração de tempo ou resumo foi alterada
        if (["DAYTIME_START_HOUR", "DAYTIME_END_HOUR", "SERVER_OPEN_TIME", "SERVER_CLOSE_TIME", "CHAT_SUMMARY_TIMES"].includes(key) &&
            JSON.stringify(botConfig[key]) !== JSON.stringify(newConfig[key])) { // Comparar como string para arrays
          requireCronRestart = true;
        }
        // Tratar números
        if (["MESSAGES_DURING_SERVER_OPEN", "MESSAGES_DURING_DAYTIME", "DAYTIME_START_HOUR", "DAYTIME_END_HOUR"].includes(key)) {
            botConfig[key] = parseInt(newConfig[key], 10);
        } else {
            botConfig[key] = newConfig[key];
        }
      }
    }

    await saveBotConfig(); // Salva no config.json

    if (requireCronRestart) {
        console.log("Configurações de tempo alteradas, reconfigurando cron jobs...");
        setupCronJobs(); // Reconfigura e reinicia os cron jobs
    }

    res.json({ success: true, message: "Configurações atualizadas com sucesso!" + (requireCronRestart ? " Cron jobs foram reiniciados." : "") });
  } else {
    res.status(400).json({ success: false, message: "Payload de configuração inválido." });
  }
});

// API para gerar mensagem com Groq
async function callGroqAPI(prompt) {
  if (!botConfig.GROQ_API_KEY) {
    console.error("GROQ_API_KEY não configurada.");
    return "Erro: Chave da API Groq não configurada no servidor.";
  }
  try {
    // >>>>>>>>>>>> ALTERAÇÃO AQUI <<<<<<<<<<<<<<
    const systemPrompt = messages.aiPrompts?.systemPrompt || DEFAULT_AI_PROMPTS.systemPrompt;
    const groqResponse = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: "mistral-saba-24b", // Ou outro modelo de sua preferência: mixtral-8x7b-32768
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      temperature: 0.8,
      max_tokens: 80,
    }, {
      headers: {
        'Authorization': `Bearer ${botConfig.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (groqResponse.data.choices && groqResponse.data.choices.length > 0) {
      return groqResponse.data.choices[0].message.content.trim();
    }
    return "Não foi possível gerar uma mensagem da IA.";
  } catch (error) {
    console.error("Erro ao chamar API Groq:", error.response ? error.response.data : error.message);
    return `Erro ao contatar a IA: ${error.message}`;
  }
}

app.post('/admin/api/generate-message', express.json(), async (req, res) => {
  const { type } = req.body; // e.g., 'randomActive', 'inGameRandom', 'status_closed', 'newMember'

  if (!botConfig.GROQ_API_KEY) {
    return res.status(500).json({ success: false, message: "Chave da API Groq não configurada no servidor." });
  }

  let exampleMessages = [];
  let basePrompt = "";
  let singleExample = ""; // Para tipos que têm apenas uma string de exemplo

  // Usar o prompt customizável de messages.aiPrompts se existir para o tipo, senão um fallback.
  basePrompt = messages.aiPrompts && messages.aiPrompts[type] ? messages.aiPrompts[type] : "";

  if (!basePrompt) { // Fallback se o prompt não foi encontrado para o tipo específico
    // Manter a lógica original de switch como fallback para prompts não configurados em messages.aiPrompts
    // ou se messages.aiPrompts[type] estiver vazio.
    console.warn(`Prompt de IA para o tipo '${type}' não encontrado ou vazio em messages.aiPrompts. Usando fallback interno se disponível.`);
    switch (type) {
      case 'inGameRandom':
        exampleMessages = messages.inGameRandom || [];
        basePrompt = DEFAULT_AI_PROMPTS.inGameRandom; // Usar o default daqui
        break;
      case 'randomActive':
        exampleMessages = messages.randomActive || [];
        basePrompt = DEFAULT_AI_PROMPTS.randomActive; // Usar o default daqui
        break;
      case 'status_closed':
        singleExample = Array.isArray(messages.status?.closed) && messages.status.closed.length > 0 ? messages.status.closed[0] : messages.status?.closed;
        basePrompt = DEFAULT_AI_PROMPTS.status_closed;
        break;
      case 'status_openingSoon':
        singleExample = Array.isArray(messages.status?.openingSoon) && messages.status.openingSoon.length > 0 ? messages.status.openingSoon[0] : messages.status?.openingSoon;
        basePrompt = DEFAULT_AI_PROMPTS.status_openingSoon;
        break;
      case 'status_open':
        singleExample = Array.isArray(messages.status?.open) && messages.status.open.length > 0 ? messages.status.open[0] : messages.status?.open;
        basePrompt = DEFAULT_AI_PROMPTS.status_open;
        break;
      case 'newMember':
        exampleMessages = messages.newMember || [];
        basePrompt = DEFAULT_AI_PROMPTS.newMember;
        break;
      case 'memberLeft':
        exampleMessages = messages.memberLeft || [];
        basePrompt = DEFAULT_AI_PROMPTS.memberLeft;
        break;
      case 'extras_sundayNight':
        singleExample = Array.isArray(messages.extras?.sundayNight) && messages.extras.sundayNight.length > 0 ? messages.extras.sundayNight[0] : messages.extras?.sundayNight;
        basePrompt = DEFAULT_AI_PROMPTS.extras_sundayNight;
        break;
      case 'extras_friday':
        singleExample = Array.isArray(messages.extras?.friday) && messages.extras.friday.length > 0 ? messages.extras.friday[0] : messages.extras?.friday;
        basePrompt = DEFAULT_AI_PROMPTS.extras_friday;
        break;
      default:
        return res.status(400).json({ success: false, message: `Tipo de mensagem desconhecido ou prompt não configurado: ${type}` });
    }
  } else {
    // Se o prompt veio de messages.aiPrompts[type], precisamos definir os examplesMessages ou singleExample
    // para a lógica de contexto do prompt que se segue.
     switch (type) {
      case 'inGameRandom':
        exampleMessages = messages.inGameRandom || [];
        break;
      case 'randomActive':
        exampleMessages = messages.randomActive || [];
        break;
      case 'status_closed':
        singleExample = Array.isArray(messages.status?.closed) && messages.status.closed.length > 0 ? messages.status.closed[0] : messages.status?.closed;
        break;
      case 'status_openingSoon':
        singleExample = Array.isArray(messages.status?.openingSoon) && messages.status.openingSoon.length > 0 ? messages.status.openingSoon[0] : messages.status?.openingSoon;
        break;
      case 'status_open':
        singleExample = Array.isArray(messages.status?.open) && messages.status.open.length > 0 ? messages.status.open[0] : messages.status?.open;
        break;
      case 'newMember':
        exampleMessages = messages.newMember || [];
        break;
      case 'memberLeft':
        exampleMessages = messages.memberLeft || [];
        break;
      case 'extras_sundayNight':
        singleExample = Array.isArray(messages.extras?.sundayNight) && messages.extras.sundayNight.length > 0 ? messages.extras.sundayNight[0] : messages.extras?.sundayNight;
        break;
      case 'extras_friday':
        singleExample = Array.isArray(messages.extras?.friday) && messages.extras.friday.length > 0 ? messages.extras.friday[0] : messages.extras?.friday;
        break;
      // No default needed here as basePrompt is already set
    }
  }
  
  let promptContext = basePrompt;

  if (exampleMessages.length > 0) {
    const sampleSize = Math.min(exampleMessages.length, 2); // Pega até 2 exemplos
    const samples = [];
    // Pega amostras aleatórias para evitar sempre os mesmos exemplos
    const shuffledExamples = [...exampleMessages].sort(() => 0.5 - Math.random());
    for (let i = 0; i < sampleSize; i++) {
      if (shuffledExamples[i]) samples.push(shuffledExamples[i]);
    }
    if (samples.length > 0) {
        promptContext += ` Inspire-se no tom e estilo destes exemplos (mas não os repita):\n- ${samples.join('\n- ')}\n`;
    }
  } else if (singleExample) {
    promptContext += ` Inspire-se neste exemplo (mas não o repita): "${singleExample}"\n`;
  }
  promptContext += "A mensagem deve ser criativa e adequada ao contexto. Evite ser repetitivo.";

  try {
    const generatedMessage = await callGroqAPI(promptContext);
    if (generatedMessage && !generatedMessage.startsWith("Erro")) {
      res.json({ success: true, message: generatedMessage });
    } else {
      throw new Error(generatedMessage || "Falha ao gerar mensagem com IA.");
    }
  } catch (error) {
    console.error(`Erro ao gerar mensagem IA para admin (tipo: ${type}):`, error);
    res.status(500).json({ success: false, message: error.message });
  }
});

async function isUserAdmin(groupId, userId) {
    const groupInfo = await getGroupMetadata(groupId);
    if (groupInfo && groupInfo.participants) {
        const userInfo = groupInfo.participants.find(p => p.id === userId || p.jid === userId);
        if (userInfo) {
            // DESCOMENTE A LINHA ABAIXO PARA VER A ESTRUTURA DE userInfo NO CONSOLE DO BOT
            // console.log("DEBUG: Informações do participante para verificação de admin:", JSON.stringify(userInfo, null, 2));
            // AJUSTE A CONDIÇÃO ABAIXO CONFORME A ESTRUTURA REAL DA SUA API:
            return userInfo.admin === 'admin' || userInfo.admin === 'superadmin' || userInfo.isSuperAdmin === true || userInfo.isAdmin === true || userInfo.adminLevel > 0;
        }
    }
    console.warn(`Metadados/participantes não encontrados para grupo ${groupId} ou usuário ${userId} não encontrado.`);
    return false;
}

function isFromMe(data) {
    // Se data.key.fromMe for true, significa que a mensagem foi enviada pelo próprio bot
    return data.key && data.key.fromMe === true;
  }
  
  app.post('/webhook', (req, res, next) => {
    const receivedPayload = req.body; 
    // console.log('[DEBUG /webhook] req.body BEFORE app.handle:', JSON.stringify(req.body, null, 2));
    // console.log('[DEBUG /webhook] req._body BEFORE app.handle:', req._body);

    if (!receivedPayload || !receivedPayload.payload) {
      console.warn("Webhook recebeu um payload inesperado ou sem a propriedade 'payload':", JSON.stringify(receivedPayload, null, 2));
      return res.status(400).send("Payload inválido: propriedade 'payload' ausente.");
    }

    const innerPayload = receivedPayload.payload;
    const event = (innerPayload.event || '').toLowerCase();
  
    if (event === 'messages.upsert') {
      req.url  = '/webhook/messages-upsert';
      req.body = innerPayload;
      return app.handle(req, res, next);
    }
    if (event === 'group.participants.update') {
      req.url  = '/webhook/group-participants-update';
      req.body = innerPayload;
      return app.handle(req, res, next);
    }
    // Caso nenhum case, devolve 200 normal
    console.log("Evento não mapeado ou não habilitado. Evento recebido:", event);
    console.log("Payload completo recebido:", JSON.stringify(receivedPayload, null, 2));
    return res.status(200).send(`Evento '${event}' não mapeado ou não habilitado.`);
  });
  

  app.post('/webhook/messages-upsert', async (req, res) => {
    // console.log('[DEBUG /webhook/messages-upsert] req.body AT START:', JSON.stringify(req.body, null, 2));
    const fullReceivedPayload = req.body;
    const data = fullReceivedPayload.data;

    if (!data) {
      console.warn("messages.upsert: data ausente", JSON.stringify(fullReceivedPayload, null, 2));
      return res.status(400).send("Payload inválido para messages.upsert.");
    }
  
    // 1. Ignore messages from the bot itself
    if (isFromMe(data)) {
      return res.status(200).send('Ignorado: mensagem do próprio bot.');
    }
  
    const remoteJid = data.key.remoteJid;
    const isGroupMessage = remoteJid.endsWith('@g.us');
    let actualSenderJid; // JID of the user who sent the command
  
    // 2. Determine if the message source is valid and identify the actual sender
    if (isGroupMessage) {
      if (remoteJid === botConfig.TARGET_GROUP_ID) {
        actualSenderJid = data.key.participant; // Message from target group, sender is participant
      } else {
        // Message from another group, ignore
        return res.status(200).send('Ignorado: mensagem de grupo não alvo.');
      }
    } else {
      actualSenderJid = remoteJid; // Private message, sender is remoteJid (the user's JID)
    }
  
    if (!actualSenderJid) {
        console.warn("actualSenderJid não pôde ser determinado:", JSON.stringify(data, null, 2));
        return res.status(200).send('Ignorado: sender não determinado.');
    }
  
    // Extrai conteúdo
    const messageContent =
      data.message?.conversation ||
      data.message?.extendedTextMessage?.text ||
      "";
    const commandText = messageContent.trim().toLowerCase();
    const command = commandText.split(' ')[0];
    const args = commandText.split(' ').slice(1);
  
    // 3. Perform admin check (is the sender an admin of TARGET_GROUP_ID?)
    const isAdmin = await isUserAdmin(botConfig.TARGET_GROUP_ID, actualSenderJid);
    
    // Adicionar mensagem ao histórico para resumo (se aplicável)
    if (isGroupMessage && 
        remoteJid === botConfig.TARGET_GROUP_ID && 
        messageContent && 
        !commandText.startsWith("!") &&
        !isFromMe(data) // Já verificado acima, mas redundância não machuca
    ) {
        const senderName = data.pushName || actualSenderJid.split('@')[0]; // Usa pushName ou parte do JID
        chatHistory.push({
            sender: senderName,
            text: messageContent,
            timestamp: new Date()
        });
        // persiste nova mensagem
        await saveChatHistory();
        // console.log(`[ChatHistory] Added: ${senderName}: ${messageContent.substring(0,30)}... Total: ${chatHistory.length}`);
    }

    const helpText = 
        "👋 Olá! Eu sou o " + (messages.botInfo?.name || "Bot Pavlov") + ".\n" +
        "Comandos disponíveis (apenas para admins, via MENSAGEM PRIVADA):\n\n" +      
        "• !jogar?      – Enquete rápida para ver se alguém vai jogar Pavlov hoje\n" +          
        "• !random      – Mensagem aleatória (IA/Dica)\n" +
        "• !abrir       – Mudar status para 'Servidor Aberto 🟢'\n" +
        "• !fechar      – Mudar status para 'Servidor Fechado 🔴'\n" +    
        "• !falar <msg>   – Enviar uma mensagem customizada para o grupo\n" +
        "• !audio <URL> – Enviar um áudio narrado para o grupo\n" +
        '• !enquete "Título" "Opção 1" "Opção 2" ... – Enquete customizada\n' +   
        "• !resumo      – Gera e envia o resumo do chat atual\n";

    let commandProcessed = false;

    if (commandText.startsWith("!")) { // Check if it's intended as a command
        if (!isGroupMessage) { // Command is from a Private Message
            if (isAdmin) {
                // Admin commands are processed here. All replies/confirmations go to actualSenderJid (admin's PM).
                // Actions that affect the group (e.g., !falar, !jogar?) still target botConfig.TARGET_GROUP_ID.
                if (command === '!start') {
                    await sendMessageToGroup(helpText, actualSenderJid);
                    commandProcessed = true;
                }
                else if (['!abrir', '!fechar', '!teste'].includes(command)) {
                    commandProcessed = true;
                    if (command === '!teste') {
                        await sendMessageToGroup("Testado por admin!", actualSenderJid);
                    } else if (command === '!abrir') {
                        await triggerServerOpen(); // Affects TARGET_GROUP_ID    
                        await sendMessageToGroup("Servidor aberto manualmente. Agendamentos de status (abrir/fechar/avisar) pausados.", actualSenderJid);
                    } else if (command === '!fechar') {
                        await triggerServerClose(); // Affects TARGET_GROUP_ID  
                        await sendMessageToGroup("Servidor fechado manualmente. Agendamentos de status (abrir/fechar/avisar) pausados.", actualSenderJid);
                    }
                }
                else if (command === '!random') {
                    commandProcessed = true;
                    const randomMsg = await getAIRandomMessage();
                    if (randomMsg) await sendMessageToGroup(randomMsg, botConfig.TARGET_GROUP_ID); // Send to group
                    await sendMessageToGroup("Mensagem aleatória enviada para o grupo.", actualSenderJid); // Confirm to admin in PM
                }
                else if (command === '!jogar?') {
                    commandProcessed = true;
                    await sendPoll(
                        "Ei!! Você 🫵 vai jogar Pavlov hoje?",
                        ["Sim, vou!", "Talvez mais tarde", "Hoje não"],
                        botConfig.TARGET_GROUP_ID // Poll always goes to the target group
                    );
                    await sendMessageToGroup("Enquete '!jogar?' enviada para o grupo.", actualSenderJid); // Confirm to admin in PM
                }
                else if (command === '!audio' && args.length > 0) {
                    commandProcessed = true;
                    const audioUrl = args[0];
                    if (audioUrl.startsWith('http')) {
                        await sendNarratedAudio(audioUrl, botConfig.TARGET_GROUP_ID); // Audio to target group
                        await sendMessageToGroup(`Áudio enviado para o grupo: ${audioUrl}`, actualSenderJid); // Confirm to admin in PM
                    } else {
                        await sendMessageToGroup("Uso: !audio <URL_DO_AUDIO>", actualSenderJid);
                    }
                }
                else if (command === '!enquete' && args.length >= 2) {
                    commandProcessed = true;
                    let pollTitle = "";
                    let pollOptions = [];
                    let currentArg = "";
                    let inQuotes = false;
                    for (const part of args) {
                        if (part.startsWith('"') && !inQuotes) {
                            currentArg = part.substring(1);
                            inQuotes = true;
                            if (part.endsWith('"') && part.length > 1) {
                                currentArg = currentArg.slice(0, -1);
                                if (!pollTitle) pollTitle = currentArg;
                                else pollOptions.push(currentArg);
                                currentArg = "";
                                inQuotes = false;
                            }
                        } else if (part.endsWith('"') && inQuotes) {
                            currentArg += " " + part.slice(0, -1);
                            if (!pollTitle) pollTitle = currentArg;
                            else pollOptions.push(currentArg);
                            currentArg = "";
                            inQuotes = false;
                        } else if (inQuotes) {
                            currentArg += " " + part;
                        } else {
                            if (!pollTitle) pollTitle = part;
                            else pollOptions.push(part);
                        }
                    }
                    if (currentArg && inQuotes) { 
                        if (!pollTitle) pollTitle = currentArg; else pollOptions.push(currentArg);
                    }
                    if (pollTitle && pollOptions.length > 0) {
                        await sendPoll(pollTitle, pollOptions, botConfig.TARGET_GROUP_ID, pollOptions.length); // Poll to target group
                        await sendMessageToGroup(`Enquete "${pollTitle}" enviada para o grupo.`, actualSenderJid); // Confirm to admin in PM
                    } else {
                        await sendMessageToGroup('Uso: !enquete "Título" "Opção1" "Opção2" ...', actualSenderJid);
                    }
                }
                else if (command === '!agendamentos' || command === '!jobs') {
                    commandProcessed = true;
                    let resp = '⏱️ *Agendamentos Ativos:* ⏱️\n';
                    const now = new Date();
                    if (scheduledCronTasks.length === 0) {
                        resp += "Nenhum cron job agendado no momento.\n";
                    } else {
                        scheduledCronTasks.forEach(task => {
                            let nextRun = 'N/A (parado ou erro)';
                            try {
                                if (task.job.running && cronParser) { 
                                    const interval = cronParser.parseExpression(task.cronExpression, { currentDate: now, tz: botConfig.TIMEZONE });
                                    nextRun = interval.next().toDate().toLocaleString('pt-BR', { timeZone: botConfig.TIMEZONE });
                                } else if (!task.job.running && cronParser) {
                                     const interval = cronParser.parseExpression(task.cronExpression, { currentDate: now, tz: botConfig.TIMEZONE });
                                     nextRun = `(Parado) Próximo seria: ${interval.next().toDate().toLocaleString('pt-BR', { timeZone: botConfig.TIMEZONE })}`;
                                } else if (task.job.nextDates) { 
                                    const nd = task.job.nextDates(1);
                                    if (nd && nd.length) nextRun = nd[0].toLocaleString('pt-BR', { timeZone: botConfig.TIMEZONE });
                                }
                            } catch (e) {
                                nextRun = `Erro ao calcular (${e.message.substring(0,20)}...)`;
                            }
                            resp += `• ${task.description} (${task.job.running ? 'Rodando' : 'Parado'}): ${nextRun}\n  (${task.cronExpression})\n`;
                        });
                    }
                    await sendMessageToGroup(resp, actualSenderJid);
                }
                else if (command === '!falar' || command === '!anunciar') {
                    commandProcessed = true;
                    if (args.length > 0) {
                        const messageToSend = messageContent.substring(command.length + 1).trim();
                        if (messageToSend) {
                            await sendMessageToGroup(messageToSend, botConfig.TARGET_GROUP_ID); // Action to group
                            await sendMessageToGroup("✅ Mensagem enviada para o grupo.", actualSenderJid); // Confirmation to admin in PM
                        } else {
                            await sendMessageToGroup("⚠️ Por favor, forneça uma mensagem para enviar. Uso: !falar <sua mensagem>", actualSenderJid);
                        }
                    } else {
                        await sendMessageToGroup("⚠️ Uso: !falar <sua mensagem>", actualSenderJid);
                    }
                }
                else if (command === '!resumo' || command === '!summarynow') {
                    commandProcessed = true;
                    if (chatHistory.length > 0) {
                        await sendMessageToGroup("⏳ Gerando resumo do chat sob demanda...", actualSenderJid);
                        await triggerChatSummary(); // This sends to TARGET_GROUP_ID
                        await sendMessageToGroup("✅ Resumo do chat solicitado enviado para o grupo.", actualSenderJid); // Confirm to admin in PM
                    } else {
                        await sendMessageToGroup("ℹ️ Não há mensagens no histórico para resumir no momento.", actualSenderJid);
                    }
                }
                // Unrecognized admin command in PM
                else { // if no other command matched and it started with "!"
                    await sendMessageToGroup(`Comando "${command}" não reconhecido. Digite !start para a lista de comandos.`, actualSenderJid);
                    commandProcessed = true;
                }
            } else { // Non-admin sent a command in PM
                await sendMessageToGroup("Você não tem permissão para usar comandos. Contate um administrador.", actualSenderJid);
                commandProcessed = true;
            }
        } else { // Command is from a Group Message (remoteJid === botConfig.TARGET_GROUP_ID as per earlier checks)
            // We already checked commandText.startsWith("!") at the beginning of this block.
            if (isAdmin) {
                // Admin tried to use a command in the group
                await sendMessageToGroup("Por favor, envie comandos para mim em uma mensagem privada (PV).", actualSenderJid); // Inform admin in their PM
                commandProcessed = true;
            } else {
                // Non-admin tried to use a command in the group - silently ignore
                console.log(`Comando '${commandText}' de usuário não-admin ${actualSenderJid} no grupo ${remoteJid} ignorado.`);
                commandProcessed = true;
            }
        }
    }
    // If commandProcessed is false here, it means it wasn't a command starting with "!" or it was a non-command group message already handled by chat history.

    return res.status(200).send('messages.upsert processado.');
  });
  

  app.post('/webhook/group-participants-update', async (req, res) => {
    const fullReceivedPayload = req.body;           // { event, instance, data, … }
    const data                 = fullReceivedPayload.data;

    if (!data) {
      console.warn("group.participants.update: data ausente", JSON.stringify(fullReceivedPayload, null, 2));
      return res.status(400).send("Payload inválido para group.participants.update.");
    }
  
    // Verifica se é o grupo correto e se há participantes
    // Ensure 'data' itself is checked before accessing its properties like data.id or data.participants
    if (
      (data.id === botConfig.TARGET_GROUP_ID || data.chatId === botConfig.TARGET_GROUP_ID) &&
      Array.isArray(data.participants)
    ) {
      const action = data.action; // "add" ou "remove"
      const participants = data.participants;
  
      if (action === 'add') {
        const welcomeMsg = getRandomElement(messages.newMember);
        if (welcomeMsg) await sendMessageToGroup(welcomeMsg);
      } else if (action === 'remove' || action === 'leave') {
        const farewellMsg = getRandomElement(messages.memberLeft);
        if (farewellMsg) await sendMessageToGroup(farewellMsg);
      }
    }
  
    return res.status(200).send('group.participants.update processado.');
  });
  

  app.post('/webhook/connection-update', async (req, res) => {
    // req.body aqui é o payload completo da Evolution API
    const fullReceivedPayload = req.body;
    console.log("Evento connection.update recebido:", JSON.stringify(fullReceivedPayload, null, 2));
    // Aqui você pode fazer lógica extra, p.ex. notificar status de conexão
    return res.status(200).send('connection.update processado.');
  });
// --- Iniciar o Bot ---
async function startBot() {
  console.log("Iniciando o bot Pavlov...");
  if (!botConfig.EVOLUTION_API_URL || !botConfig.EVOLUTION_API_KEY || !botConfig.INSTANCE_NAME || !botConfig.TARGET_GROUP_ID || !botConfig.SERVER_OPEN_TIME || !botConfig.SERVER_CLOSE_TIME || !botConfig.BOT_WEBHOOK_PORT) {
    console.error("ERRO: Variáveis de ambiente/configuração cruciais não definidas. Verifique .env e config.json (URL, KEY, INSTANCE, GROUP_ID, OPEN_TIME, CLOSE_TIME, BOT_WEBHOOK_PORT)");
    process.exit(1);
  }

  initializeTimeDetails();
  setupCronJobs();
  await initializeBotStatus();

  // logCurrentCronSchedule(); // Log da programação inicial já é feito dentro de setupCronJobs

  app.listen(botConfig.BOT_WEBHOOK_PORT, () => {
    console.log(`Servidor de webhook escutando na porta ${botConfig.BOT_WEBHOOK_PORT}`);
    const publicUrl = botConfig.BOT_PUBLIC_URL || `http://SEU_IP_OU_DOMINIO:${botConfig.BOT_WEBHOOK_PORT}`;
    console.log(`Configure o webhook na Evolution API para: ${publicUrl}/webhook`);
    console.log(`Painel de Administração disponível em: ${publicUrl}/admin/admin.html`);
    console.log("Eventos Webhook: 'messages.upsert' e 'GROUP_PARTICIPANTS_UPDATE'.");
  });

  console.log("Bot Pavlov iniciado e agendamentos configurados.");
  console.log(`Grupo: ${botConfig.TARGET_GROUP_ID}`);
  console.log(`Servidor abre: ${botConfig.SERVER_OPEN_TIME}, Fecha: ${botConfig.SERVER_CLOSE_TIME} (Fuso: ${botConfig.TIMEZONE})`);
  console.log(`Msgs diurnas: ${botConfig.DAYTIME_START_HOUR}:00 - ${botConfig.DAYTIME_END_HOUR}:00 (Fuso: ${botConfig.TIMEZONE})`);
}

startBot();

// Função para obter uma mensagem aleatória GERAL, potencialmente gerada por IA ou uma dica
async function getAIRandomMessage() {
  const useAI = messages.aiUsageSettings && messages.aiUsageSettings.randomActive && botConfig.GROQ_API_KEY;

  if (useAI) {
    // 30% chance to return a game tip IF AI is enabled for this type
    if (Math.random() < 0.3 && messages.gameTips && messages.gameTips.length > 0) {
      console.log("Retornando dica de jogo (geral, AI enabled path).");
      return getRandomElement(messages.gameTips);
    }
    console.log("Tentando gerar mensagem aleatória GERAL com IA.");
    const exampleMessages = messages.randomActive || [];
    let promptContext = messages.aiPrompts?.randomActive || DEFAULT_AI_PROMPTS.randomActive;

    if (exampleMessages.length > 0) {
      const sampleSize = Math.min(exampleMessages.length, 2);
      const samples = [];
      const shuffledExamples = [...exampleMessages].sort(() => 0.5 - Math.random());
      for (let i = 0; i < sampleSize; i++) {
        if (shuffledExamples[i]) samples.push(shuffledExamples[i]);
      }
      if (samples.length > 0) {
          promptContext += `\n\nInspire-se no tom e estilo destes exemplos (mas não os repita):\n- ${samples.join('\n- ')}`;
      }
    }
    promptContext += "\nA mensagem deve ser criativa e adequada para um ambiente de jogo online. Evite ser repetitivo.";

    const generatedMessage = await callGroqAPI(promptContext);

    if (generatedMessage && !generatedMessage.startsWith("Erro") && generatedMessage.length > 5) {
      return generatedMessage;
    } else {
      console.warn("Falha ao gerar mensagem GERAL com Groq (AI path), usando fallback da lista randomActive ou dica.");
      // Fallback para lista pré-definida se IA falhar
    }
  }
  // Se AI não estiver habilitada OU se IA falhou e caiu aqui:
  if (messages.randomActive && messages.randomActive.length > 0) {
    return getRandomElement(messages.randomActive);
  }
  if (messages.gameTips && messages.gameTips.length > 0) { // Fallback para dica
      return getRandomElement(messages.gameTips);
  }
  return "A IA tentou, mas falhou na mensagem geral. Que tal um 'bora jogar!' clássico?"; // Fallback final
}

// Função para obter uma mensagem aleatória "DURANTE O JOGO", potencialmente gerada por IA ou uma dica
async function getAIInGameMessage() {
  const useAI = messages.aiUsageSettings && messages.aiUsageSettings.inGameRandom && botConfig.GROQ_API_KEY;

  if (useAI) {
    // 30% chance to return a game tip IF AI is enabled for this type
    if (Math.random() < 0.3 && messages.gameTips && messages.gameTips.length > 0) {
      console.log("Retornando dica de jogo (in-game, AI enabled path).");
      return getRandomElement(messages.gameTips);
    }
    console.log("Tentando gerar mensagem IN-GAME com IA.");
    const exampleMessages = messages.inGameRandom || [];
    let promptContext = messages.aiPrompts?.inGameRandom || DEFAULT_AI_PROMPTS.inGameRandom;

    if (exampleMessages.length > 0) {
      const sampleSize = Math.min(exampleMessages.length, 2);
      const samples = [];
      const shuffledInGameExamples = [...exampleMessages].sort(() => 0.5 - Math.random());
      for (let i = 0; i < sampleSize; i++) {
        if (shuffledInGameExamples[i]) samples.push(shuffledInGameExamples[i]);
      }
      if (samples.length > 0) {
          promptContext += `\n\nInspire-se no tom e estilo destes exemplos de mensagens 'durante o jogo' (mas não os repita):\n- ${samples.join('\n- ')}`;
      }
    }
    promptContext += "\nA mensagem deve ser criativa e adequada para o calor do momento no jogo. Evite ser repetitivo.";

    const generatedMessage = await callGroqAPI(promptContext);

    if (generatedMessage && !generatedMessage.startsWith("Erro") && generatedMessage.length > 5) {
      return generatedMessage;
    } else {
      console.warn("Falha ao gerar mensagem IN-GAME com Groq (AI path), usando fallback da lista inGameRandom ou dica.");
      // Fallback para lista pré-definida se IA falhar
    }
  }
  // Se AI não estiver habilitada OU se IA falhou e caiu aqui:
  if (messages.inGameRandom && messages.inGameRandom.length > 0) {
    return getRandomElement(messages.inGameRandom);
  }
  if (messages.gameTips && messages.gameTips.length > 0) { // Fallback para dica
      return getRandomElement(messages.gameTips);
  }
  return "A IA de jogo bugou! Foquem no objetivo!"; // Fallback final
}

// --- Funções de Resumo de Chat ---
function formatChatForSummary(history) {
  return history.map(msg => `${msg.sender}: ${msg.text}`).join('\n');
}

async function triggerChatSummary() {
  if (!botConfig.GROQ_API_KEY) {
    console.warn("GROQ_API_KEY não configurada. Resumo do chat desabilitado.");
    chatHistory = []; // Limpa o histórico mesmo assim
    return;
  }

  if (chatHistory.length === 0) {
    console.log("Nenhuma mensagem no histórico para resumir.");
    // Opcional: Enviar mensagem ao grupo informando que não há nada para resumir
    // const noNewMessagesText = messages.chatSummary?.noNewMessages || "Tudo quieto no front, sem fofocas para resumir agora!";
    // await sendMessageToGroup(noNewMessagesText, botConfig.TARGET_GROUP_ID);
    return;
  }

  const chatText = formatChatForSummary(chatHistory);
  // Limpa o histórico ANTES de chamar a API para evitar que mensagens sejam reprocessadas em caso de falha na API e retentativa do cron
  const currentChatToSummarize = [...chatHistory];
  chatHistory = []; 

  const baseChatSummaryPrompt = messages.aiPrompts?.chatSummary || DEFAULT_AI_PROMPTS.chatSummary;
  const prompt = baseChatSummaryPrompt.replace('{CHAT_PLACEHOLDER}', formatChatForSummary(currentChatToSummarize));

  console.log(`Tentando gerar resumo para ${currentChatToSummarize.length} mensagens.`);
  const summary = await callGroqAPI(prompt);

  const summaryTitleText = messages.chatSummary?.summaryTitle || "📢 *Resenha da Rodada (Fofocas do Front):*";

  if (summary && !summary.startsWith("Erro") && !summary.startsWith("Não foi possível") && summary.length > 10) {
    await sendMessageToGroup(`${summaryTitleText}\n\n${summary}`, botConfig.TARGET_GROUP_ID);
    console.log("Resumo do chat enviado ao grupo.");
  } else {
    console.warn("Falha ao gerar resumo do chat ou resumo inválido:", summary);
    // Opcional: notificar o grupo sobre a falha
    // await sendMessageToGroup("A IA hoje não colaborou para o resumo. Mais sorte na próxima!", botConfig.TARGET_GROUP_ID);
  }

  const today = new Date().toISOString().slice(0, 10);
  if (lastChatSummaryDate !== today) {
    lastChatSummaryDate = today;
    chatSummaryCountToday = 0;
  }
  if (chatSummaryCountToday >= botConfig.CHAT_SUMMARY_COUNT_PER_DAY) {
    console.log("Limite diário de resumos do chat atingido.");
    return;
  }
  chatSummaryCountToday++;
}

// --- Funções Auxiliares da API Evolution ---

async function getGroupParticipants(groupId) {
  if (!botConfig.EVOLUTION_API_URL || !botConfig.EVOLUTION_API_KEY || !botConfig.INSTANCE_NAME) {
    console.warn("API da Evolution não configurada para buscar participantes do grupo.");
    return [];
  }
  try {
    const response = await axios.get(
      `${botConfig.EVOLUTION_API_URL}/group/fetchAllGroups/${botConfig.INSTANCE_NAME}`,
      {
        headers: { 'apikey': botConfig.EVOLUTION_API_KEY }
      }
    );
    // A resposta pode ser uma lista de todos os grupos, precisamos encontrar o nosso.
    // Ou, se houver um endpoint mais específico como /group/fetchGroupInfo/{groupId}/{instanceName}
    // seria melhor usá-lo. Vou assumir que precisamos filtrar de uma lista geral por enquanto.
    // Adapte esta lógica se sua API tiver um endpoint direto para metadados de UM grupo.

    const groups = response.data; // Supondo que response.data é um array de grupos
    const targetGroup = groups.find(group => group.id === groupId || group.id?.user === groupId.split('@')[0]);

    if (targetGroup && targetGroup.participants) {
      return targetGroup.participants.map(p => p.id); // Retorna um array de JIDs
    } else {
      // Tentar um endpoint específico se o anterior falhar ou não for ideal
      try {
        const specificGroupResponse = await axios.get(
          `${botConfig.EVOLUTION_API_URL}/group/fetchGroupInfo/${groupId}/${botConfig.INSTANCE_NAME}`,
          {
            headers: { 'apikey': botConfig.EVOLUTION_API_KEY }
          }
        );
        if (specificGroupResponse.data && specificGroupResponse.data.participants) {
          return specificGroupResponse.data.participants.map(p => p.id);
        }
      } catch (specificError) {
        console.warn(`Não foi possível encontrar o grupo ${groupId} na lista geral nem buscar informações específicas. Erro específico: ${specificError.message}`);
      }
      console.warn(`Grupo ${groupId} não encontrado ou sem participantes na resposta da API.`);
      return [];
    }
  } catch (error) {
    console.error(`Erro ao buscar participantes do grupo ${groupId}:`, error.message);
    return [];
  }
}

async function updateMessagesAndPrompts(updatedMessages) {
  let changed = false;
  // ... (lógica existente para status, newMember, etc.)

  // Atualiza mensagens de status
  if (updatedMessages.status) {
    if (!messages.status) messages.status = {};
    for (const key of ['closed', 'openingSoon', 'open']) {
      if (updatedMessages.status[key] !== undefined) {
        const newStatusMessages = Array.isArray(updatedMessages.status[key]) ? updatedMessages.status[key] : [updatedMessages.status[key]].filter(Boolean);
        if (JSON.stringify(messages.status[key] || []) !== JSON.stringify(newStatusMessages)) {
          messages.status[key] = newStatusMessages;
          changed = true;
        }
      }
    }
  }

  // Atualiza newMember, memberLeft, randomActive, inGameRandom, gameTips
  for (const key of ['newMember', 'memberLeft', 'randomActive', 'inGameRandom', 'gameTips']) {
    if (updatedMessages[key] !== undefined) {
      const newArrayMessages = Array.isArray(updatedMessages[key]) ? updatedMessages[key] : [updatedMessages[key]].filter(Boolean);
      if (JSON.stringify(messages[key] || []) !== JSON.stringify(newArrayMessages)) {
        messages[key] = newArrayMessages;
        changed = true;
      }
    }
  }

  // Atualiza extras
  if (updatedMessages.extras) {
    if (!messages.extras) messages.extras = {};
    for (const key of ['sundayNight', 'friday']) {
      if (updatedMessages.extras[key] !== undefined) {
        const newExtraMessages = Array.isArray(updatedMessages.extras[key]) ? updatedMessages.extras[key] : [updatedMessages.extras[key]].filter(Boolean);
        if (JSON.stringify(messages.extras[key] || []) !== JSON.stringify(newExtraMessages)) {
          messages.extras[key] = newExtraMessages;
          changed = true;
        }
      }
    }
  }


  // Atualiza os prompts da IA, incluindo o systemPrompt
  if (updatedMessages.aiPrompts) {
    if (!messages.aiPrompts) messages.aiPrompts = {};
    for (const key in updatedMessages.aiPrompts) {
      if (Object.prototype.hasOwnProperty.call(updatedMessages.aiPrompts, key)) {
        if (messages.aiPrompts[key] !== updatedMessages.aiPrompts[key]) {
          messages.aiPrompts[key] = updatedMessages.aiPrompts[key];
          changed = true;
        }
      }
    }
    // Garante que o systemPrompt tenha um valor padrão se for apagado no admin
    if (!messages.aiPrompts.systemPrompt || messages.aiPrompts.systemPrompt.trim() === '') {
        messages.aiPrompts.systemPrompt = DEFAULT_SYSTEM_PROMPT;
        changed = true; // Considera como mudança para salvar o default
    }
  }

  // ... (lógica existente para aiUsageSettings)

  if (changed) {
    await saveMessages();
    console.log("messages.json atualizado via painel de administração.");
  }
  return changed;
}

let chatSummaryCountToday = 0;
let lastChatSummaryDate = null;

// --- Persistência do Chat History ---
const CHAT_HISTORY_FILE_PATH = path.join(__dirname, 'chatHistory.json');

async function loadChatHistory() {
  try {
    const data = await fs.promises.readFile(CHAT_HISTORY_FILE_PATH, 'utf8');
    chatHistory = JSON.parse(data);
    console.log(`ChatHistory carregado (${chatHistory.length} mensagens).`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      chatHistory = [];
      console.log('Nenhum histórico anterior. Iniciando vazio.');
    } else {
      console.error('Erro ao carregar chatHistory:', err);
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
    console.log(`ChatHistory salvo (${chatHistory.length} mensagens).`);
  } catch (err) {
    console.error('Erro ao salvar chatHistory:', err);
  }
}

// Carrega histórico ao iniciar
loadChatHistory();