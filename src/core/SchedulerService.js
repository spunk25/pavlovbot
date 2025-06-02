import ConfigService from './ConfigService.js'; // To get current config
import MessageService from './MessageService.js';
import EvolutionApiService from './EvolutionApiService.js';
import GroqApiService from './GroqApiService.js';
import ChatHistoryService from './ChatHistoryService.js';
import { getRandomElement, parseTime, calculateRandomDelay } from '../utils/generalUtils.js';

let dailyTaskFlags = {
    serverOpen: false,
    serverClose: false,
    serverOpeningSoon: false,
    serverOpeningIn5Min: false,
    sundayNightMessage: false,
    fridayMessage: false
};
let chatSummaryExecutionStatus = {};
let lastCheckedDate = null;
let mainTaskIntervalId = null;

let openTimeDetails = { hour: 19, minute: 0 };
let closeTimeDetails = { hour: 23, minute: 59 };
let oneHourBeforeOpenDetails = { hour: 18, minute: 0 };
let fiveMinBeforeOpenDetails = { hour: 18, minute: 55 };

let serverOpenMessagesSent = 0;
let daytimeMessagesSent = 0;
let serverOpenMessageTimeoutId = null;
let daytimeMessageTimeoutId = null;

let chatSummaryCountToday = 0;
let lastChatSummaryDate = null; // For daily reset of chatSummaryCountToday

let currentServerStatus = '🔴'; // Bot's understanding of server status

function initializeTimeDetails() {
  const config = ConfigService.getConfig();
  openTimeDetails = parseTime(config.SERVER_OPEN_TIME);
  closeTimeDetails = parseTime(config.SERVER_CLOSE_TIME);

  let oneHourBeforeHour = openTimeDetails.hour - 1;
  let oneHourBeforeMinute = openTimeDetails.minute;
  if (oneHourBeforeHour < 0) {
    oneHourBeforeHour = 23;
  }
  oneHourBeforeOpenDetails = { hour: oneHourBeforeHour, minute: oneHourBeforeMinute };

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

  console.log(`SchedulerService: Horários de status inicializados:`);
  console.log(`  - Abrir: ${openTimeDetails.hour}:${String(openTimeDetails.minute).padStart(2, '0')}`);
  console.log(`  - Fechar: ${closeTimeDetails.hour}:${String(closeTimeDetails.minute).padStart(2, '0')}`);
  console.log(`  - Aviso 1h: ${oneHourBeforeOpenDetails.hour}:${String(oneHourBeforeOpenDetails.minute).padStart(2, '0')}`);
  console.log(`  - Aviso 5min: ${fiveMinBeforeOpenDetails.hour}:${String(fiveMinBeforeOpenDetails.minute).padStart(2, '0')}`);

  // Reset chat summary execution status based on new times
  chatSummaryExecutionStatus = {};
  if (Array.isArray(config.CHAT_SUMMARY_TIMES)) {
    config.CHAT_SUMMARY_TIMES.forEach(timeStr => {
        if (typeof timeStr === 'string' && timeStr.match(/^\d{2}:\d{2}$/)) {
            chatSummaryExecutionStatus[timeStr] = false;
        }
    });
  }
}

async function updateGroupNameAndSendStatusMessage(statusEmoji, type) {
  const config = ConfigService.getConfig();
  const messages = MessageService.getMessages();
  const newName = `${config.GROUP_BASE_NAME} ${statusEmoji}`;

  try {
    await EvolutionApiService.setGroupName(newName);
    console.log(`SchedulerService: Nome do grupo atualizado para: ${newName}`);
    currentServerStatus = statusEmoji;

    let messageText;
    let messageCategory;

    // Determine message category and initial predefined message
    switch (type) {
      case 'open':
        messageCategory = messages.status.open;
        break;
      case 'closed':
        messageCategory = messages.status.closed;
        break;
      case 'openingSoon': // 1-hour warning
        messageCategory = messages.status.openingSoon;
        break;
      case 'opening5min':
        messageCategory = messages.status.opening5min;
        break;
      default:
        console.warn(`SchedulerService: Tipo de status desconhecido para mensagem: ${type}`);
        return;
    }
    messageText = getRandomElement(messageCategory);

    // Determine AI prompt key and AI usage setting key
    // For 'opening5min', we can reuse 'status_openingSoon' AI settings if desired,
    // or you could add a specific 'status_opening5min' to aiPrompts and aiUsageSettings.
    // For simplicity, let's map 'opening5min' to 'status_openingSoon' for AI.
    const aiPromptKey = type === 'opening5min' ? 'status_openingSoon' : `status_${type}`;
    const aiUsageKey = type === 'opening5min' ? 'status_openingSoon' : `status_${type}`;

    const shouldUseAI = MessageService.getAIUsageSetting(aiUsageKey);

    if (shouldUseAI) {
      console.log(`SchedulerService: AI habilitada para ${aiUsageKey}. Tentando gerar mensagem via IA.`);
      const specificAiPrompt = MessageService.getAIPrompt(aiPromptKey);
      if (specificAiPrompt) {
        const aiGeneratedMessage = await GroqApiService.callGroqAPI(specificAiPrompt);
        if (aiGeneratedMessage && !aiGeneratedMessage.startsWith("Erro") && !aiGeneratedMessage.startsWith("Não foi possível") && aiGeneratedMessage.length > 5) {
          messageText = aiGeneratedMessage;
          console.log(`SchedulerService: Mensagem de status '${type}' gerada por IA.`);
        } else {
          console.warn(`SchedulerService: Falha ao gerar mensagem de status '${type}' via IA, usando predefinida se disponível. Resposta IA: ${aiGeneratedMessage}`);
          // Fallback to predefined if AI fails but was attempted
          if (!messageText) messageText = getRandomElement(messageCategory) || `Servidor ${type === 'open' ? 'aberto' : type === 'closed' ? 'fechado' : 'atualizando status...'}.`;
        }
      } else {
        console.warn(`SchedulerService: Prompt AI para '${aiPromptKey}' não encontrado, usando predefinida se disponível.`);
        if (!messageText) messageText = getRandomElement(messageCategory) || `Servidor ${type === 'open' ? 'aberto' : type === 'closed' ? 'fechado' : 'atualizando status...'}.`;
      }
    } else {
      console.log(`SchedulerService: AI desabilitada para ${aiUsageKey}. Usando mensagem predefinida.`);
      if (!messageText) { // Ensure there's a fallback if predefined list was empty
          messageText = `O status do servidor foi atualizado para: ${statusEmoji}`;
          if (type === 'open') messageText = "Servidor aberto! Bora jogar!";
          else if (type === 'closed') messageText = "Servidor fechado por agora.";
          else if (type === 'openingSoon') messageText = "Servidor abrindo em breve!";
          else if (type === 'opening5min') messageText = "Servidor abrindo em 5 minutos!";
      }
    }

    if (messageText) {
      await EvolutionApiService.sendMessageToGroup(messageText);
    }

  } catch (error) {
    console.error(`SchedulerService: Erro ao atualizar nome do grupo ou enviar mensagem de status ${type}:`, error);
  }
}

async function triggerServerOpen() {
  if (currentServerStatus === '🟢') {
    console.log("SchedulerService: triggerServerOpen - status já 🟢, pulando.");
    dailyTaskFlags.serverOpen = true;
    return;
  }
  console.log("SchedulerService: ACIONADO - Abertura do servidor.");
  const config = ConfigService.getConfig();
  let msg;
  const useAI = MessageService.getAIUsageSetting('status_open') && config.GROQ_API_KEY;

  if (useAI) {
    msg = await GroqApiService.callGroqAPI(MessageService.getAIPrompt('status_open'));
    if (!msg || msg.startsWith("Erro") || msg.length < 5) {
      msg = getRandomElement(MessageService.getMessages().status?.open) || "Servidor aberto! Bora jogar!";
    }
  } else {
    msg = getRandomElement(MessageService.getMessages().status?.open) || "Servidor aberto! Bora jogar!";
  }

  await updateGroupNameAndSendStatusMessage('🟢', 'open');
  dailyTaskFlags.serverOpen = true;
  dailyTaskFlags.serverOpeningSoon = true;
  dailyTaskFlags.serverOpeningIn5Min = true;

  serverOpenMessagesSent = 0;
  if (serverOpenMessageTimeoutId) clearTimeout(serverOpenMessageTimeoutId);
  console.log("SchedulerService: Iniciando ciclo de mensagens aleatórias do servidor aberto.");
  scheduleNextRandomMessage('serverOpen');
}

async function triggerServerClose() {
  if (currentServerStatus === '🔴') {
    console.log("SchedulerService: triggerServerClose - status já 🔴, pulando.");
    dailyTaskFlags.serverClose = true;
    return;
  }
  console.log("SchedulerService: ACIONADO - Fechamento do servidor.");
  const config = ConfigService.getConfig();
  let msg;
  const useAI = MessageService.getAIUsageSetting('status_closed') && config.GROQ_API_KEY;

  if (useAI) {
    msg = await GroqApiService.callGroqAPI(MessageService.getAIPrompt('status_closed'));
    if (!msg || msg.startsWith("Erro") || msg.length < 5) {
      msg = getRandomElement(MessageService.getMessages().status?.closed) || "Servidor fechado por hoje!";
    }
  } else {
    msg = getRandomElement(MessageService.getMessages().status?.closed) || "Servidor fechado por hoje!";
  }

  await updateGroupNameAndSendStatusMessage('🔴', 'closed');
  dailyTaskFlags.serverClose = true;
  dailyTaskFlags.serverOpen = true; // Mark open as "done" for this cycle

  if (serverOpenMessageTimeoutId) {
    clearTimeout(serverOpenMessageTimeoutId);
    serverOpenMessageTimeoutId = null;
  }
  serverOpenMessagesSent = config.MESSAGES_DURING_SERVER_OPEN; // Max out to stop scheduling
}

async function triggerServerOpeningSoon() {
  if (currentServerStatus === '🟡' && dailyTaskFlags.serverOpeningSoon) { // Check flag too
    console.log("SchedulerService: triggerServerOpeningSoon - status já 🟡 e flag ativa, pulando.");
    return;
  }
  console.log("SchedulerService: ACIONADO - Aviso de 1h para abrir.");
  const config = ConfigService.getConfig();
  let msg;
  const useAI = MessageService.getAIUsageSetting('status_openingSoon') && config.GROQ_API_KEY;

  if (useAI) {
    msg = await GroqApiService.callGroqAPI(MessageService.getAIPrompt('status_openingSoon'));
    if (!msg || msg.startsWith("Erro") || msg.length < 5) {
      msg = getRandomElement(MessageService.getMessages().status?.openingSoon) || "Servidor abrindo em 1 hora!";
    }
  } else {
    msg = getRandomElement(MessageService.getMessages().status?.openingSoon) || "Servidor abrindo em 1 hora!";
  }

  await updateGroupNameAndSendStatusMessage('🟡', 'openingSoon');
  dailyTaskFlags.serverOpeningSoon = true;

  await EvolutionApiService.sendPoll(
    "Ei!! Você 🫵 vai jogar Pavlov hoje?",
    ["Sim, vou!", "Talvez mais tarde", "Hoje não"],
    config.TARGET_GROUP_ID
  );
}

async function triggerServerOpeningIn5Min() {
  console.log("SchedulerService: Triggering server opening in 5 minutes warning.");
  const messages = MessageService.getMessages();
  let msg;

  // Use 'status_openingSoon' AI settings for the 5-min warning as decided
  const shouldUseAI = MessageService.getAIUsageSetting('status_openingSoon'); 
  const aiPromptKey = 'status_openingSoon';

  if (shouldUseAI) {
    console.log(`SchedulerService: AI enabled for 5-min warning (using ${aiPromptKey} settings).`);
    const specificAiPrompt = MessageService.getAIPrompt(aiPromptKey);
    if (specificAiPrompt) {
      const aiGeneratedMessage = await GroqApiService.callGroqAPI(specificAiPrompt);
      if (aiGeneratedMessage && !aiGeneratedMessage.startsWith("Erro") && !aiGeneratedMessage.startsWith("Não foi possível") && aiGeneratedMessage.length > 5) {
        msg = aiGeneratedMessage;
        console.log("SchedulerService: Mensagem de aviso de 5 minutos gerada por IA.");
      } else {
        console.warn(`SchedulerService: Falha ao gerar mensagem de aviso de 5 minutos via IA, usando predefinida. Resposta IA: ${aiGeneratedMessage}`);
        msg = getRandomElement(messages.status.opening5min) || "Servidor abrindo em 5 minutos! Preparem-se!";
      }
    } else {
      console.warn(`SchedulerService: Prompt AI para '${aiPromptKey}' (para aviso de 5 min) não encontrado, usando predefinida.`);
      msg = getRandomElement(messages.status.opening5min) || "Servidor abrindo em 5 minutos! Preparem-se!";
    }
  } else {
    console.log("SchedulerService: AI desabilitada para aviso de 5 minutos. Usando mensagem predefinida.");
    msg = getRandomElement(messages.status.opening5min) || "Servidor abrindo em 5 minutos! Preparem-se!";
  }

  if (msg) {
    await EvolutionApiService.sendMessageToGroup(msg);
  }
  dailyTaskFlags.serverOpeningIn5Min = true; // Mark as done for this cycle
  console.log("SchedulerService: Aviso de 5 minutos enviado.");
}

async function getAIRandomMessage() {
  const config = ConfigService.getConfig();
  const messagesAll = MessageService.getMessages();
  const useAI = MessageService.getAIUsageSetting('randomActive') && config.GROQ_API_KEY;

  if (useAI) {
    if (Math.random() < 0.3 && messagesAll.gameTips && messagesAll.gameTips.length > 0) {
      return getRandomElement(messagesAll.gameTips);
    }
    let promptContext = MessageService.getAIPrompt('randomActive');
    const exampleMessages = messagesAll.randomActive || [];
    if (exampleMessages.length > 0) {
      const samples = getRandomElement(exampleMessages, Math.min(exampleMessages.length, 2));
      if (samples.length > 0) promptContext += `\n\nInspire-se nestes exemplos (não os repita):\n- ${samples.join('\n- ')}`;
    }
    const generatedMessage = await GroqApiService.callGroqAPI(promptContext);
    if (generatedMessage && !generatedMessage.startsWith("Erro") && generatedMessage.length > 5) {
      return generatedMessage;
    }
  }
  if (messagesAll.randomActive && messagesAll.randomActive.length > 0) {
    return getRandomElement(messagesAll.randomActive);
  }
  if (messagesAll.gameTips && messagesAll.gameTips.length > 0) {
    return getRandomElement(messagesAll.gameTips);
  }
  return "Bora jogar um Pavlov maroto?";
}

async function getAIInGameMessage() {
  const config = ConfigService.getConfig();
  const messagesAll = MessageService.getMessages();
  const useAI = MessageService.getAIUsageSetting('inGameRandom') && config.GROQ_API_KEY;

  if (useAI) {
    if (Math.random() < 0.3 && messagesAll.gameTips && messagesAll.gameTips.length > 0) {
      return getRandomElement(messagesAll.gameTips);
    }
    let promptContext = MessageService.getAIPrompt('inGameRandom');
    const exampleMessages = messagesAll.inGameRandom || [];
     if (exampleMessages.length > 0) {
      const samples = getRandomElement(exampleMessages, Math.min(exampleMessages.length, 2));
      if (samples.length > 0) promptContext += `\n\nInspire-se nestes exemplos (não os repita):\n- ${samples.join('\n- ')}`;
    }
    const generatedMessage = await GroqApiService.callGroqAPI(promptContext);
    if (generatedMessage && !generatedMessage.startsWith("Erro") && generatedMessage.length > 5) {
      return generatedMessage;
    }
  }
  if (messagesAll.inGameRandom && messagesAll.inGameRandom.length > 0) {
    return getRandomElement(messagesAll.inGameRandom);
  }
  if (messagesAll.gameTips && messagesAll.gameTips.length > 0) {
    return getRandomElement(messagesAll.gameTips);
  }
  return "Foco no objetivo, time!";
}


async function scheduleNextRandomMessage(type) {
  const config = ConfigService.getConfig();
  let delay;

  if (type === 'serverOpen') {
    if (serverOpenMessagesSent >= config.MESSAGES_DURING_SERVER_OPEN) return;
    delay = calculateRandomDelay(10, 30); // minutes
  } else if (type === 'daytime') {
    if (daytimeMessagesSent >= config.MESSAGES_DURING_DAYTIME) return;
    delay = calculateRandomDelay(60, 120); // minutes
  } else {
    return;
  }

  const timeoutId = setTimeout(async () => {
    let msg;
    if (type === 'serverOpen') {
      msg = await getAIInGameMessage();
    } else { // 'daytime'
      msg = await getAIRandomMessage();
    }

    if (msg) {
      await EvolutionApiService.sendMessageToGroup(msg);
    }

    if (type === 'serverOpen') {
      serverOpenMessagesSent++;
      serverOpenMessageTimeoutId = null; // Clear self
      if (serverOpenMessagesSent < config.MESSAGES_DURING_SERVER_OPEN) {
        scheduleNextRandomMessage('serverOpen');
      }
    } else {
      daytimeMessagesSent++;
      daytimeMessageTimeoutId = null; // Clear self
      if (daytimeMessagesSent < config.MESSAGES_DURING_DAYTIME) {
        scheduleNextRandomMessage('daytime');
      }
    }
  }, delay);

  if (type === 'serverOpen') {
    if (serverOpenMessageTimeoutId) clearTimeout(serverOpenMessageTimeoutId); // Clear previous if any
    serverOpenMessageTimeoutId = timeoutId;
  } else {
    if (daytimeMessageTimeoutId) clearTimeout(daytimeMessageTimeoutId); // Clear previous if any
    daytimeMessageTimeoutId = timeoutId;
  }
}

async function triggerChatSummary() {
  const config = ConfigService.getConfig();
  if (!config.GROQ_API_KEY) {
    console.warn("SchedulerService: GROQ_API_KEY não configurada. Resumo do chat desabilitado.");
    ChatHistoryService.clearChatHistory();
    return;
  }

  const history = ChatHistoryService.getChatHistory();
  if (history.length === 0) {
    console.log("SchedulerService: Nenhuma mensagem no histórico para resumir.");
    const config = ConfigService.getConfig(); // Get current config
    if (config.SEND_NO_SUMMARY_MESSAGE) { // Check new config flag
        const messages = MessageService.getMessages();
        const noSummaryText = getRandomElement(messages.chatSummary?.noNewMessages) || "Tudo quieto por aqui, sem novas mensagens para resumir agora!";
        await EvolutionApiService.sendMessageToGroup(noSummaryText);
    }
    return;
  }

  const todayForSummaryCount = new Date(new Date().toLocaleString("en-US", { timeZone: config.TIMEZONE })).toISOString().slice(0, 10);
  if (lastChatSummaryDate !== todayForSummaryCount) {
    lastChatSummaryDate = todayForSummaryCount;
    chatSummaryCountToday = 0;
  }

  if (chatSummaryCountToday >= config.CHAT_SUMMARY_COUNT_PER_DAY) {
    console.log(`SchedulerService: Limite diário de resumos (${config.CHAT_SUMMARY_COUNT_PER_DAY}) atingido.`);
    return;
  }

  const chatToSummarize = [...history]; // Copy before clearing
  ChatHistoryService.clearChatHistory();

  const baseChatSummaryPrompt = MessageService.getAIPrompt('chatSummary');
  const prompt = baseChatSummaryPrompt.replace('{CHAT_PLACEHOLDER}', ChatHistoryService.formatChatForSummary(chatToSummarize));

  console.log(`SchedulerService: Tentando gerar resumo para ${chatToSummarize.length} mensagens.`);
  const summary = await GroqApiService.callGroqAPI(prompt);

  if (summary && !summary.startsWith("Erro") && !summary.startsWith("Não foi possível") && summary.length > 10) {
    await EvolutionApiService.sendMessageToGroup(summary);
    console.log("SchedulerService: Resumo do chat enviado ao grupo.");
    chatSummaryCountToday++;
    console.log(`SchedulerService: Resumos enviados hoje: ${chatSummaryCountToday}/${config.CHAT_SUMMARY_COUNT_PER_DAY}`);
  } else {
    console.warn("SchedulerService: Falha ao gerar resumo do chat ou resumo inválido:", summary);
  }
}


async function sendSpecialMessage(type) { // e.g., 'extras_sundayNight'
    const config = ConfigService.getConfig();
    const useAI = MessageService.getAIUsageSetting(type) && config.GROQ_API_KEY;
    let msg;
    const messageKeyForExtras = type.startsWith('extras_') ? type.substring('extras_'.length) : type;

    if (useAI) {
        const prompt = MessageService.getAIPrompt(type);
        if (prompt) {
            msg = await GroqApiService.callGroqAPI(prompt);
            if (!msg || msg.startsWith("Erro") || msg.length < 5) {
                msg = getRandomElement(MessageService.getMessages().extras?.[messageKeyForExtras]) || `Mensagem padrão para ${type}`;
            }
        } else {
             msg = getRandomElement(MessageService.getMessages().extras?.[messageKeyForExtras]) || `Mensagem padrão para ${type}`;
        }
    } else {
        msg = getRandomElement(MessageService.getMessages().extras?.[messageKeyForExtras]) || `Mensagem padrão para ${type}`;
    }

    if (msg) {
        await EvolutionApiService.sendMessageToGroup(msg);
        console.log(`SchedulerService: Mensagem especial '${type}' enviada.`);
    } else {
        console.warn(`SchedulerService: Nenhuma mensagem para o tipo especial '${type}'`);
    }
}


async function checkScheduledTasks() {
  const config = ConfigService.getConfig();
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: config.TIMEZONE }));
  const currentDate = now.toISOString().slice(0, 10);
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentDay = now.getDay(); // 0 for Sunday, 1 for Monday, ..., 6 for Saturday

  // Daily reset of flags and counters
  if (lastCheckedDate !== currentDate) {
    console.log(`SchedulerService: Novo dia (${currentDate}). Resetando flags e contadores diários.`);
    dailyTaskFlags = {
      serverOpen: false,
      serverClose: false,
      serverOpeningSoon: false,
      serverOpeningIn5Min: false,
      sundayNightMessage: false, // Reset daily
      fridayMessage: false       // Reset daily
    };
    chatSummaryExecutionStatus = {};
    if (Array.isArray(config.CHAT_SUMMARY_TIMES)) {
        config.CHAT_SUMMARY_TIMES.forEach(timeStr => {
            if (typeof timeStr === 'string' && timeStr.match(/^\d{2}:\d{2}$/)) {
                 chatSummaryExecutionStatus[timeStr] = false;
            }
        });
    }
    serverOpenMessagesSent = 0;
    daytimeMessagesSent = 0;
    // chatSummaryCountToday is reset when first summary of the day is attempted/logged
    if (lastChatSummaryDate !== currentDate) { // Ensure chat summary count also resets if no summaries were sent the previous day
        chatSummaryCountToday = 0;
        lastChatSummaryDate = currentDate; // Align with daily reset
    }
    lastCheckedDate = currentDate;
    console.log("SchedulerService: Flags e contadores diários resetados.");
  }

  // Server Status Change Logic (Open, Close, Warnings)
  if (currentHour === oneHourBeforeOpenDetails.hour && currentMinute === oneHourBeforeOpenDetails.minute && !dailyTaskFlags.serverOpeningSoon) {
    await triggerServerOpeningSoon();
    dailyTaskFlags.serverOpeningSoon = true;
  }
  if (currentHour === fiveMinBeforeOpenDetails.hour && currentMinute === fiveMinBeforeOpenDetails.minute && !dailyTaskFlags.serverOpeningIn5Min) {
    await triggerServerOpeningIn5Min();
    dailyTaskFlags.serverOpeningIn5Min = true;
  }
  if (currentHour === openTimeDetails.hour && currentMinute === openTimeDetails.minute && !dailyTaskFlags.serverOpen) {
    await triggerServerOpen(); // Sets dailyTaskFlags.serverOpen = true
  }
  if (currentHour === closeTimeDetails.hour && currentMinute === closeTimeDetails.minute && !dailyTaskFlags.serverClose) {
    await triggerServerClose(); // Sets dailyTaskFlags.serverClose = true
  }

  // Chat Summaries
  if (Array.isArray(config.CHAT_SUMMARY_TIMES)) {
    for (const timeStr of config.CHAT_SUMMARY_TIMES) {
      if (typeof timeStr === 'string' && timeStr.match(/^\d{2}:\d{2}$/)) {
        const summaryTime = parseTime(timeStr);
        if (currentHour === summaryTime.hour && currentMinute === summaryTime.minute && !chatSummaryExecutionStatus[timeStr]) {
          console.log(`SchedulerService: Hora de resumo do chat (${timeStr}).`);
          await triggerChatSummary();
          chatSummaryExecutionStatus[timeStr] = true;
        }
      }
    }
  }

  // Special Messages (Sunday Night, Friday)
  const SUNDAY_NIGHT_HOUR = 20; // Example: 8 PM on Sunday
  const SUNDAY_NIGHT_MINUTE = 0;
  const FRIDAY_HOUR = 17;       // Example: 5 PM on Friday
  const FRIDAY_MINUTE = 0;

  if (currentDay === 0 && currentHour === SUNDAY_NIGHT_HOUR && currentMinute === SUNDAY_NIGHT_MINUTE && !dailyTaskFlags.sundayNightMessage) {
    console.log("SchedulerService: Hora da mensagem de Domingo à noite.");
    await sendSpecialMessage('extras_sundayNight');
    dailyTaskFlags.sundayNightMessage = true;
  }

  if (currentDay === 5 && currentHour === FRIDAY_HOUR && currentMinute === FRIDAY_MINUTE && !dailyTaskFlags.fridayMessage) {
    console.log("SchedulerService: Hora da mensagem de Sexta-feira.");
    await sendSpecialMessage('extras_friday');
    dailyTaskFlags.fridayMessage = true;
  }

  // Random Daytime Messages (if not already running from server open)
  if (currentServerStatus !== '🟢') { // Only run if server isn't open (server open has its own loop)
    if (currentHour >= config.DAYTIME_START_HOUR && currentHour < config.DAYTIME_END_HOUR) {
      if (daytimeMessageTimeoutId === null && daytimeMessagesSent < config.MESSAGES_DURING_DAYTIME) {
        // console.log("SchedulerService: Dentro do horário diurno, agendando próxima mensagem diurna.");
        scheduleNextRandomMessage('daytime');
      }
    } else {
      if (daytimeMessageTimeoutId !== null) {
        // console.log("SchedulerService: Fora do horário diurno, parando mensagens diurnas.");
        clearTimeout(daytimeMessageTimeoutId);
        daytimeMessageTimeoutId = null;
      }
    }
  }
}

async function initializeBotStatus() {
    const config = ConfigService.getConfig();
    const now = new Date();
    const localTime = new Date(now.toLocaleString("en-US", { timeZone: config.TIMEZONE }));
    const timeNowMinutes = localTime.getHours() * 60 + localTime.getMinutes();

    const openTimeMinutes = openTimeDetails.hour * 60 + openTimeDetails.minute;
    const closeTimeMinutes = closeTimeDetails.hour * 60 + closeTimeDetails.minute;
    const warningTimeMinutes = oneHourBeforeOpenDetails.hour * 60 + oneHourBeforeOpenDetails.minute;
    // const fiveMinWarningTimeMinutes = fiveMinBeforeOpenDetails.hour * 60 + fiveMinBeforeOpenDetails.minute;


    // Detect current status from group name
    try {
        const groupData = await EvolutionApiService.getGroupMetadata(config.TARGET_GROUP_ID);
        if (groupData && groupData.subject) {
            if (groupData.subject.includes('🟢')) currentServerStatus = '🟢';
            else if (groupData.subject.includes('🟡')) currentServerStatus = '🟡';
            else currentServerStatus = '🔴';
            console.log(`SchedulerService: Status inicial detectado pelo nome do grupo: ${currentServerStatus}`);
        } else {
            console.log("SchedulerService: Não foi possível obter nome do grupo, status inicial assumido como 🔴.");
            currentServerStatus = '🔴'; // Default if cannot fetch
        }
    } catch (error) {
        console.error("SchedulerService: Erro ao detectar status inicial do grupo:", error);
        currentServerStatus = '🔴';
    }


    let expectedStatusLogic = '🔴';
    // Logic for expected status based on time
    if (closeTimeMinutes > openTimeMinutes) { // Opens and closes on the same day
        if (timeNowMinutes >= openTimeMinutes && timeNowMinutes < closeTimeMinutes) {
            expectedStatusLogic = '🟢';
        } else if (timeNowMinutes >= warningTimeMinutes && timeNowMinutes < openTimeMinutes) {
            expectedStatusLogic = '🟡';
        }
    } else { // Opens one day, closes the next (e.g. 22:00 to 02:00)
        if (timeNowMinutes >= openTimeMinutes || timeNowMinutes < closeTimeMinutes) {
            expectedStatusLogic = '🟢';
        } else if (timeNowMinutes >= warningTimeMinutes && timeNowMinutes < openTimeMinutes) {
             // This warning logic might need adjustment if warningTime is also on the previous day
            expectedStatusLogic = '🟡';
        }
    }
    console.log(`SchedulerService: Status esperado pela lógica de horário: ${expectedStatusLogic}`);

    // If current status from group name doesn't match expected status by time, attempt to correct it.
    // However, prioritize the trigger functions for actual changes to send messages.
    // This part is more about initializing the `currentServerStatus` variable correctly.
    // The `checkScheduledTasks` will handle the actual timed transitions.

    if (expectedStatusLogic === '🟢' && currentServerStatus !== '🟢') {
        if (!dailyTaskFlags.serverOpen) { // Only trigger if not already flagged for today
            console.log("SchedulerService: Corrigindo status para ABERTO na inicialização.");
            await triggerServerOpen(); // This will set flags and currentServerStatus
        }
    } else if (expectedStatusLogic === '🟡' && currentServerStatus !== '🟡') {
         if (!dailyTaskFlags.serverOpeningSoon) {
            console.log("SchedulerService: Corrigindo status para ABRINDO EM BREVE na inicialização.");
            await triggerServerOpeningSoon();
        }
    } else if (expectedStatusLogic === '🔴' && currentServerStatus !== '🔴') {
        if (!dailyTaskFlags.serverClose) { // Check if close was already flagged for today
            // Check if we are past close time but before a new open cycle started
            const isPastCloseTime = timeNowMinutes >= closeTimeMinutes;
            const isBeforeOpenTime = timeNowMinutes < openTimeMinutes;

            if (closeTimeMinutes > openTimeMinutes) { // Same day open/close
                if (isPastCloseTime || isBeforeOpenTime) { // If after close OR before open (but not in warning)
                     console.log("SchedulerService: Corrigindo status para FECHADO na inicialização (mesmo dia).");
                     await triggerServerClose();
                }
            } else { // Overnight open/close
                if (timeNowMinutes >= closeTimeMinutes && timeNowMinutes < warningTimeMinutes) { // Between close and next warning
                    console.log("SchedulerService: Corrigindo status para FECHADO na inicialização (pernoite).");
                    await triggerServerClose();
                }
            }
        }
    }

    // Start random message loops if applicable based on current status
    if (currentServerStatus === '🟢') {
        console.log("SchedulerService: Servidor está ABERTO na inicialização, iniciando mensagens de servidor aberto.");
        scheduleNextRandomMessage('serverOpen');
    }
    // Check for daytime messages regardless of server status, if within daytime hours
    const localHour = localTime.getHours();
    if (localHour >= config.DAYTIME_START_HOUR && localHour < config.DAYTIME_END_HOUR) {
        console.log("SchedulerService: Está em horário diurno na inicialização, iniciando mensagens diurnas.");
        scheduleNextRandomMessage('daytime');
    }
}


async function start() {
  initializeTimeDetails(); // Initial setup
  const config = ConfigService.getConfig();

  // Initialize daily flags and chat summary status for the first run
  const initialNow = new Date(new Date().toLocaleString("en-US", { timeZone: config.TIMEZONE }));
  lastCheckedDate = initialNow.toISOString().slice(0, 10);
  Object.keys(dailyTaskFlags).forEach(key => dailyTaskFlags[key] = false);
  if (Array.isArray(config.CHAT_SUMMARY_TIMES)) {
    config.CHAT_SUMMARY_TIMES.forEach(timeStr => {
        if (typeof timeStr === 'string' && timeStr.match(/^\d{2}:\d{2}$/)) {
            chatSummaryExecutionStatus[timeStr] = false;
        }
    });
  }
  lastChatSummaryDate = lastCheckedDate; // Initialize for summary count reset

  await initializeBotStatus(); // Determine current status and potentially trigger actions

  const CHECK_INTERVAL = 30 * 1000; // 30 seconds
  if (mainTaskIntervalId) {
    clearInterval(mainTaskIntervalId);
  }
  mainTaskIntervalId = setInterval(checkScheduledTasks, CHECK_INTERVAL);
  console.log(`SchedulerService: Agendador principal iniciado. Verificando tarefas a cada ${CHECK_INTERVAL / 1000} segundos.`);
}

function stop() {
  if (mainTaskIntervalId) {
    clearInterval(mainTaskIntervalId);
    mainTaskIntervalId = null;
    console.log("SchedulerService: Agendador de tarefas parado.");
  }
  if (serverOpenMessageTimeoutId) {
    clearTimeout(serverOpenMessageTimeoutId);
    serverOpenMessageTimeoutId = null;
  }
  if (daytimeMessageTimeoutId) {
    clearTimeout(daytimeMessageTimeoutId);
    daytimeMessageTimeoutId = null;
  }
}

function getStatusForAdmin() {
    const config = ConfigService.getConfig();
    const nowForStatus = new Date(new Date().toLocaleString("en-US", { timeZone: config.TIMEZONE }));
    let resp = `🗓️ *Status das Tarefas Agendadas (Hoje):* 🗓️\n`;
    resp += `Bot Server Status Atual: ${currentServerStatus}\n`;
    resp += `Data/Hora Atual (${config.TIMEZONE}): ${nowForStatus.toLocaleString('pt-BR')}\n`;
    resp += `Flags diárias resetadas em: ${lastCheckedDate || 'Ainda não definido para hoje'}\n`;
    resp += `Próxima verificação do agendador em até 30 segundos.\n\n`;

    resp += "*Status do Servidor (baseado em flags e horários):*\n";
    resp += `  - Aviso 1h (${oneHourBeforeOpenDetails.hour}:${String(oneHourBeforeOpenDetails.minute).padStart(2,'0')}): ${dailyTaskFlags.serverOpeningSoon ? '✅ Executado/Passado' : '⏳ Pendente'}\n`;
    resp += `  - Aviso 5min (${fiveMinBeforeOpenDetails.hour}:${String(fiveMinBeforeOpenDetails.minute).padStart(2,'0')}): ${dailyTaskFlags.serverOpeningIn5Min ? '✅ Executado/Passado' : '⏳ Pendente'}\n`;
    resp += `  - Abrir Servidor (${openTimeDetails.hour}:${String(openTimeDetails.minute).padStart(2,'0')}): ${dailyTaskFlags.serverOpen ? '✅ Executado/Passado' : '⏳ Pendente'}\n`;
    resp += `  - Fechar Servidor (${closeTimeDetails.hour}:${String(closeTimeDetails.minute).padStart(2,'0')}): ${dailyTaskFlags.serverClose ? '✅ Executado/Passado' : '⏳ Pendente'}\n\n`;

    resp += "*Resumos do Chat (baseado em flags e horários):*\n";
    if (config.CHAT_SUMMARY_TIMES && config.CHAT_SUMMARY_TIMES.length > 0) {
        config.CHAT_SUMMARY_TIMES.forEach(timeStr => {
            if (typeof timeStr === 'string' && timeStr.match(/^\d{2}:\d{2}$/)) {
                resp += `  - ${timeStr}: ${chatSummaryExecutionStatus[timeStr] ? '✅ Executado/Passado' : '⏳ Pendente'}\n`;
            }
        });
    } else {
        resp += "  Nenhum horário de resumo configurado.\n";
    }
    resp += "\n";

    resp += "*Mensagens Extras (baseado em flags e horários):*\n";
    const SUNDAY_NIGHT_HOUR = 20; const SUNDAY_NIGHT_MINUTE = 0;
    const FRIDAY_HOUR = 17; const FRIDAY_MINUTE = 0;
    resp += `  - Domingo (aprox. ${SUNDAY_NIGHT_HOUR}:${String(SUNDAY_NIGHT_MINUTE).padStart(2,'0')}): ${dailyTaskFlags.sundayNightMessage ? '✅ Executado/Passado' : '⏳ Pendente'}\n`;
    resp += `  - Sexta (aprox. ${FRIDAY_HOUR}:${String(FRIDAY_MINUTE).padStart(2,'0')}): ${dailyTaskFlags.fridayMessage ? '✅ Executado/Passado' : '⏳ Pendente'}\n\n`;
    
    resp += `*Contadores de Mensagens Aleatórias (Hoje):*\n`;
    resp += `  - Durante Servidor Aberto: ${serverOpenMessagesSent} / ${config.MESSAGES_DURING_SERVER_OPEN}\n`;
    resp += `  - Durante o Dia: ${daytimeMessagesSent} / ${config.MESSAGES_DURING_DAYTIME}\n`;
    resp += `  - Resumos de Chat Enviados: ${chatSummaryCountToday} / ${config.CHAT_SUMMARY_COUNT_PER_DAY} (limite por dia)\n`;
    return resp;
}


export default {
  start,
  stop,
  initializeTimeDetails,
  triggerServerOpen,
  triggerServerClose,
  triggerChatSummary,
  getAIRandomMessage,
  getStatusForAdmin,
  currentServerStatus
}; 