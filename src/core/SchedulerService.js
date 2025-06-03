import ConfigService from './ConfigService.js'; // To get current config
import MessageService from './MessageService.js';
import EvolutionApiService from './EvolutionApiService.js';
import GroqApiService from './GroqApiService.js';
import ChatHistoryService from './ChatHistoryService.js';
import TaskStatusDbService from './TaskStatusDbService.js'; // Import the new service
import { getRandomElement, parseTime, calculateRandomDelay } from '../utils/generalUtils.js';

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

  // Sync chat summary tasks in DB with current config for today
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: config.TIMEZONE })).toISOString().slice(0, 10);
  TaskStatusDbService.syncChatSummaryTasksForDate(today);
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
  const config = ConfigService.getConfig();
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: config.TIMEZONE })).toISOString().slice(0, 10);

  if (currentServerStatus === '🟢' && TaskStatusDbService.isTaskExecuted('serverOpen', today)) {
    console.log("SchedulerService: triggerServerOpen - status já 🟢 e tarefa marcada como executada, pulando.");
    return;
  }
  console.log("SchedulerService: ACIONADO - Abertura do servidor.");
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
  TaskStatusDbService.setTaskExecuted('serverOpen', today);
  TaskStatusDbService.setTaskExecuted('serverOpeningSoon', today); // Mark previous warnings as "covered" by open
  TaskStatusDbService.setTaskExecuted('serverOpeningIn5Min', today); // Mark previous warnings as "covered" by open

  serverOpenMessagesSent = 0;
  if (serverOpenMessageTimeoutId) clearTimeout(serverOpenMessageTimeoutId);
  console.log("SchedulerService: Iniciando ciclo de mensagens aleatórias do servidor aberto.");
  scheduleNextRandomMessage('serverOpen');
}

async function triggerServerClose() {
  const config = ConfigService.getConfig();
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: config.TIMEZONE })).toISOString().slice(0, 10);

  if (currentServerStatus === '🔴' && TaskStatusDbService.isTaskExecuted('serverClose', today)) {
    console.log("SchedulerService: triggerServerClose - status já 🔴 e tarefa marcada como executada, pulando.");
    return;
  }
  console.log("SchedulerService: ACIONADO - Fechamento do servidor.");
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
  TaskStatusDbService.setTaskExecuted('serverClose', today);

  if (serverOpenMessageTimeoutId) {
    clearTimeout(serverOpenMessageTimeoutId);
    serverOpenMessageTimeoutId = null;
  }
  serverOpenMessagesSent = config.MESSAGES_DURING_SERVER_OPEN; // Max out to stop scheduling
}

async function triggerServerOpeningSoon() {
  const config = ConfigService.getConfig();
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: config.TIMEZONE })).toISOString().slice(0, 10);

  if (TaskStatusDbService.isTaskExecuted('serverOpeningSoon', today) && currentServerStatus === '🟡') {
    console.log("SchedulerService: triggerServerOpeningSoon - tarefa já executada hoje e status 🟡, pulando.");
    return;
  }
  if (TaskStatusDbService.isTaskExecuted('serverOpen', today)) {
    console.log("SchedulerService: triggerServerOpeningSoon - servidor já abriu hoje, pulando aviso.");
    TaskStatusDbService.setTaskExecuted('serverOpeningSoon', today); // Mark as done if open already happened
    return;
  }

  console.log("SchedulerService: ACIONADO - Aviso de 1h para abrir.");
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
  TaskStatusDbService.setTaskExecuted('serverOpeningSoon', today);

  await EvolutionApiService.sendPoll(
    "Ei!! Você 🫵 vai jogar Pavlov hoje?",
    ["Sim, vou!", "Talvez mais tarde", "Hoje não"],
    config.TARGET_GROUP_ID
  );
}

async function triggerServerOpeningIn5Min() {
  const config = ConfigService.getConfig();
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: config.TIMEZONE })).toISOString().slice(0, 10);

  if (TaskStatusDbService.isTaskExecuted('serverOpeningIn5Min', today)) {
    console.log("SchedulerService: triggerServerOpeningIn5Min - tarefa já executada hoje, pulando.");
    return;
  }
  if (TaskStatusDbService.isTaskExecuted('serverOpen', today)) {
    console.log("SchedulerService: triggerServerOpeningIn5Min - servidor já abriu hoje, pulando aviso de 5 min.");
    TaskStatusDbService.setTaskExecuted('serverOpeningIn5Min', today); // Mark as done
    return;
  }

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
  TaskStatusDbService.setTaskExecuted('serverOpeningIn5Min', today);
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
  if (!config.CHAT_SUMMARY_ENABLED) {
    console.log("SchedulerService: Resumo do chat desabilitado nas configurações. Limpando histórico se existir.");
    await ChatHistoryService.clearChatHistory();
    return;
  }
  if (!config.GROQ_API_KEY) {
    console.warn("SchedulerService: GROQ_API_KEY não configurada. Resumo do chat desabilitado.");
    await ChatHistoryService.clearChatHistory();
    return;
  }

  let historyForSummary = await ChatHistoryService.getChatHistory();
  let usedApiFallback = false;

  if (historyForSummary.length === 0) {
    console.log("SchedulerService: Histórico do DB vazio. Tentando buscar últimas 20 mensagens da API Evolution.");
    const apiMessages = await EvolutionApiService.getLatestGroupMessages(config.TARGET_GROUP_ID, 20);
    if (apiMessages && apiMessages.length > 0) {
      console.log(`SchedulerService: Obtidas ${apiMessages.length} mensagens da API para o resumo.`);
      historyForSummary = apiMessages; // Usa as mensagens da API
      usedApiFallback = true;
    } else {
      console.log("SchedulerService: Nenhuma mensagem obtida da API Evolution ou API retornou vazio.");
    }
  }

  if (historyForSummary.length === 0) {
    console.log("SchedulerService: Nenhuma mensagem no histórico do DB nem da API para resumir.");
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

  const chatToSummarize = [...historyForSummary]; // Copia as mensagens a serem resumidas

  if (!usedApiFallback) {
    // Limpa o histórico do DB APENAS se não estivermos usando o fallback da API
    await ChatHistoryService.clearChatHistory();
    console.log("SchedulerService: Histórico do DB limpo após cópia para resumo.");
  } else {
    console.log("SchedulerService: Resumo gerado com fallback da API, histórico do DB não foi limpo.");
  }

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
    const today = new Date(new Date().toLocaleString("en-US", { timeZone: config.TIMEZONE })).toISOString().slice(0, 10);
    const taskName = type.replace('extras_', ''); // e.g., 'sundayNight' or 'friday'

    // Check if this specific special message was already sent today
    if (TaskStatusDbService.isTaskExecuted(taskName, today)) {
        console.log(`SchedulerService: Mensagem especial '${type}' já enviada hoje.`);
        return;
    }

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
        TaskStatusDbService.setTaskExecuted(taskName, today); // Mark as executed
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

  const lastDbDate = TaskStatusDbService.getLastSchedulerDate();

  // Daily reset of flags in DB and local counters
  if (lastDbDate !== currentDate) {
    console.log(`SchedulerService: Novo dia (${currentDate}). Resetando flags no DB e contadores diários.`);
    TaskStatusDbService.initializeTasksForDate(currentDate, true); // Initialize for new day and save
    TaskStatusDbService.setLastSchedulerDate(currentDate);

    serverOpenMessagesSent = 0;
    daytimeMessagesSent = 0;
    // chatSummaryCountToday is reset when first summary of the day is attempted/logged
    // or here if the date changes.
    if (lastChatSummaryDate !== currentDate) {
        chatSummaryCountToday = 0;
        lastChatSummaryDate = currentDate;
    }
    console.log("SchedulerService: Flags no DB e contadores diários resetados para o novo dia.");
  }

  // Server Status Change Logic (Open, Close, Warnings)
  // Check against DB if task was executed for `currentDate`
  if (currentHour === oneHourBeforeOpenDetails.hour && currentMinute === oneHourBeforeOpenDetails.minute && !TaskStatusDbService.isTaskExecuted('serverOpeningSoon', currentDate)) {
    if (!TaskStatusDbService.isTaskExecuted('serverOpen', currentDate)) { // Don't send if already open
        await triggerServerOpeningSoon(); // This will set the flag in DB
    } else {
        TaskStatusDbService.setTaskExecuted('serverOpeningSoon', currentDate); // Mark as done if server is already open
    }
  }
  if (currentHour === fiveMinBeforeOpenDetails.hour && currentMinute === fiveMinBeforeOpenDetails.minute && !TaskStatusDbService.isTaskExecuted('serverOpeningIn5Min', currentDate)) {
    if (!TaskStatusDbService.isTaskExecuted('serverOpen', currentDate)) { // Don't send if already open
        await triggerServerOpeningIn5Min(); // This will set the flag in DB
    } else {
        TaskStatusDbService.setTaskExecuted('serverOpeningIn5Min', currentDate); // Mark as done
    }
  }
  if (currentHour === openTimeDetails.hour && currentMinute === openTimeDetails.minute && !TaskStatusDbService.isTaskExecuted('serverOpen', currentDate)) {
    await triggerServerOpen(); // Sets flag in DB
  }
  if (currentHour === closeTimeDetails.hour && currentMinute === closeTimeDetails.minute && !TaskStatusDbService.isTaskExecuted('serverClose', currentDate)) {
    await triggerServerClose(); // Sets flag in DB
  }

  // Chat Summaries
  if (Array.isArray(config.CHAT_SUMMARY_TIMES)) {
    for (const timeStr of config.CHAT_SUMMARY_TIMES) {
      if (typeof timeStr === 'string' && timeStr.match(/^\d{2}:\d{2}$/)) {
        const summaryTime = parseTime(timeStr);
        const taskKey = `chatSummary_${timeStr.replace(":", "")}`;
        if (currentHour === summaryTime.hour && currentMinute === summaryTime.minute && !TaskStatusDbService.isTaskExecuted(taskKey, currentDate)) {
          console.log(`SchedulerService: Hora de resumo do chat (${timeStr}).`);
          await triggerChatSummary(); // Actual sending logic
          TaskStatusDbService.setTaskExecuted(taskKey, currentDate); // Mark as done for this specific time slot
        }
      }
    }
  }

  // Special Messages (Sunday Night, Friday)
  const SUNDAY_NIGHT_MESSAGE_TIME_DETAILS = config.SUNDAY_NIGHT_MESSAGE_TIME ? parseTime(config.SUNDAY_NIGHT_MESSAGE_TIME) : { hour: 20, minute: 0 };
  const FRIDAY_MESSAGE_TIME_DETAILS = config.FRIDAY_MESSAGE_TIME ? parseTime(config.FRIDAY_MESSAGE_TIME) : { hour: 17, minute: 0 };

  if (currentDay === 0 && currentHour === SUNDAY_NIGHT_MESSAGE_TIME_DETAILS.hour && currentMinute === SUNDAY_NIGHT_MESSAGE_TIME_DETAILS.minute && !TaskStatusDbService.isTaskExecuted('sundayNightMessage', currentDate)) {
    console.log("SchedulerService: Hora da mensagem de Domingo à noite.");
    await sendSpecialMessage('extras_sundayNightMessage'); // Will set flag in DB
  }

  if (currentDay === 5 && currentHour === FRIDAY_MESSAGE_TIME_DETAILS.hour && currentMinute === FRIDAY_MESSAGE_TIME_DETAILS.minute && !TaskStatusDbService.isTaskExecuted('fridayMessage', currentDate)) {
    console.log("SchedulerService: Hora da mensagem de Sexta-feira.");
    await sendSpecialMessage('extras_fridayMessage'); // Will set flag in DB
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
    
    const currentDate = localTime.toISOString().slice(0, 10);
    const timeNowMinutes = localTime.getHours() * 60 + localTime.getMinutes();
    const currentHour = localTime.getHours();
    const currentMinute = localTime.getMinutes();
    const currentDay = localTime.getDay(); 

    const openTimeMinutes = openTimeDetails.hour * 60 + openTimeDetails.minute;
    const closeTimeMinutes = closeTimeDetails.hour * 60 + closeTimeDetails.minute;
    const warningTimeMinutes = oneHourBeforeOpenDetails.hour * 60 + oneHourBeforeOpenDetails.minute;
    const fiveMinWarningTimeMinutes = fiveMinBeforeOpenDetails.hour * 60 + fiveMinBeforeOpenDetails.minute;

    // Task keys
    const serverOpenTaskKey = 'serverOpen';
    const serverCloseTaskKey = 'serverClose';
    const serverOpeningSoonTaskKey = 'serverOpeningSoon';
    const serverOpeningIn5MinTaskKey = 'serverOpeningIn5Min';

    TaskStatusDbService.getTasksForDate(currentDate); 
    TaskStatusDbService.syncChatSummaryTasksForDate(currentDate);

    let actualGroupStatus = '🔴'; // Default
    try {
        const groupData = await EvolutionApiService.getGroupMetadata(config.TARGET_GROUP_ID);
        if (groupData && groupData.subject) {
            if (groupData.subject.includes('🟢')) actualGroupStatus = '🟢';
            else if (groupData.subject.includes('🟡')) actualGroupStatus = '🟡';
            // else actualGroupStatus remains '🔴'
            console.log(`SchedulerService: Actual group status detected from name: ${actualGroupStatus}`);
            currentServerStatus = actualGroupStatus; // Sync in-memory status with actual detected status
        } else {
            console.log("SchedulerService: Não foi possível obter nome do grupo, status inicial assumido como 🔴.");
            currentServerStatus = '🔴'; 
        }
    } catch (error) {
        console.error("SchedulerService: Erro ao detectar status inicial do grupo:", error);
        currentServerStatus = '🔴'; 
    }

    let expectedStatusLogic = '🔴';
    if (closeTimeMinutes > openTimeMinutes) { 
        if (timeNowMinutes >= openTimeMinutes && timeNowMinutes < closeTimeMinutes) {
            expectedStatusLogic = '🟢';
        } else if (timeNowMinutes >= warningTimeMinutes && timeNowMinutes < openTimeMinutes) {
            expectedStatusLogic = '🟡';
        }
    } else { 
        if (timeNowMinutes >= openTimeMinutes || timeNowMinutes < closeTimeMinutes) {
            expectedStatusLogic = '🟢';
        } else if (timeNowMinutes >= warningTimeMinutes && timeNowMinutes < openTimeMinutes) {
            expectedStatusLogic = '🟡';
        }
    }
    console.log(`SchedulerService: Status esperado pela lógica de horário: ${expectedStatusLogic}`);

    // --- Catch-up Logic ---

    // Server Opening Soon (1h warning)
    if (
        timeNowMinutes >= warningTimeMinutes &&
        timeNowMinutes < openTimeMinutes && 
        !TaskStatusDbService.isTaskExecuted(serverOpenTaskKey, currentDate) && 
        !TaskStatusDbService.isTaskExecuted(serverOpeningSoonTaskKey, currentDate)
    ) {
        console.log(`SchedulerService (Catch-up): Time for '${serverOpeningSoonTaskKey}' has passed, DB task not executed.`);
        if (actualGroupStatus !== '🟡') { 
            console.log(`SchedulerService (Catch-up): Actual group status is '${actualGroupStatus}', not '🟡'. Triggering full '${serverOpeningSoonTaskKey}'.`);
            await triggerServerOpeningSoon(); // This will set DB and currentServerStatus via updateGroupNameAndSendStatusMessage
        } else {
            console.log(`SchedulerService (Catch-up): Actual group status is already '🟡'. Marking '${serverOpeningSoonTaskKey}' as executed in DB.`);
            TaskStatusDbService.setTaskExecuted(serverOpeningSoonTaskKey, currentDate);
            currentServerStatus = '🟡'; // Ensure in-memory status is synced
            // If there are other actions for openingSoon besides group name (e.g. poll), consider if they should run.
            // For now, if group is already yellow, we assume the state is "caught up".
            // The poll is inside triggerServerOpeningSoon, so it won't run here.
        }
    }

    // Server Opening in 5 Min
    if (
        timeNowMinutes >= fiveMinWarningTimeMinutes &&
        timeNowMinutes < openTimeMinutes && 
        !TaskStatusDbService.isTaskExecuted(serverOpenTaskKey, currentDate) &&
        !TaskStatusDbService.isTaskExecuted(serverOpeningIn5MinTaskKey, currentDate)
    ) {
        console.log(`SchedulerService (Catch-up): Time for '${serverOpeningIn5MinTaskKey}' has passed, DB task not executed. Triggering.`);
        // triggerServerOpeningIn5Min primarily sends a message and doesn't change group status itself.
        // Its internal checks will prevent re-sending if DB task is already marked.
        await triggerServerOpeningIn5Min();
    }

    // Server Open Catch-up
    if (expectedStatusLogic === '🟢') {
        if (!TaskStatusDbService.isTaskExecuted(serverOpenTaskKey, currentDate)) {
            console.log(`SchedulerService (Catch-up): Server should be OPEN (expected='🟢'), DB task '${serverOpenTaskKey}' not executed.`);
            if (actualGroupStatus !== '🟢') {
                console.log(`SchedulerService (Catch-up): Actual group status is '${actualGroupStatus}', not '🟢'. Triggering full '${serverOpenTaskKey}'.`);
                await triggerServerOpen();
            } else {
                console.log(`SchedulerService (Catch-up): Actual group status is already '🟢'. Marking relevant tasks in DB.`);
                TaskStatusDbService.setTaskExecuted(serverOpenTaskKey, currentDate);
                TaskStatusDbService.setTaskExecuted(serverOpeningSoonTaskKey, currentDate); 
                TaskStatusDbService.setTaskExecuted(serverOpeningIn5MinTaskKey, currentDate); 
                currentServerStatus = '🟢';
            }
        } else if (TaskStatusDbService.isTaskExecuted(serverOpenTaskKey, currentDate) && actualGroupStatus !== '🟢' && !TaskStatusDbService.isTaskExecuted(serverCloseTaskKey, currentDate)) {
             console.log(`SchedulerService (Catch-up): DB task '${serverOpenTaskKey}' executed, but actual group status is '${actualGroupStatus}' (not '🟢') and not closed. Re-triggering '${serverOpenTaskKey}' to correct visual state.`);
             await triggerServerOpen(); // This will resend message and set group name
        }
    }

    // Server Close Catch-up
    if (expectedStatusLogic === '🔴') {
        if (TaskStatusDbService.isTaskExecuted(serverOpenTaskKey, currentDate) && !TaskStatusDbService.isTaskExecuted(serverCloseTaskKey, currentDate)) {
            console.log(`SchedulerService (Catch-up): Server should be CLOSED (expected='🔴', was open), DB task '${serverCloseTaskKey}' not executed.`);
            if (actualGroupStatus !== '🔴') {
                console.log(`SchedulerService (Catch-up): Actual group status is '${actualGroupStatus}', not '🔴'. Triggering full '${serverCloseTaskKey}'.`);
                await triggerServerClose();
            } else {
                console.log(`SchedulerService (Catch-up): Actual group status is already '🔴'. Marking '${serverCloseTaskKey}' in DB.`);
                TaskStatusDbService.setTaskExecuted(serverCloseTaskKey, currentDate);
                currentServerStatus = '🔴';
            }
        } else if (!TaskStatusDbService.isTaskExecuted(serverOpenTaskKey, currentDate) && !TaskStatusDbService.isTaskExecuted(serverCloseTaskKey, currentDate)) {
            if (actualGroupStatus !== '🔴') {
                console.log(`SchedulerService (Catch-up): Server should be CLOSED (expected='🔴', never opened today), actual group status '${actualGroupStatus}' is not '🔴'. Correcting group name only.`);
                const groupBaseName = config.GROUP_BASE_NAME || "Pavlov VR Server";
                const newName = `${groupBaseName} 🔴`;
                try {
                    await EvolutionApiService.setGroupName(newName);
                    currentServerStatus = '🔴'; 
                    console.log(`SchedulerService: Group name corrected to FECHADO via catch-up: ${newName}`);
                } catch (error) {
                    console.error(`SchedulerService: Error correcting group name to FECHADO via catch-up:`, error);
                }
            }
        } else if (TaskStatusDbService.isTaskExecuted(serverCloseTaskKey, currentDate) && actualGroupStatus !== '🔴') {
             console.log(`SchedulerService (Catch-up): DB task '${serverCloseTaskKey}' executed, but actual group status is '${actualGroupStatus}' (not '🔴'). Re-triggering '${serverCloseTaskKey}' to correct visual state.`);
             await triggerServerClose();
        }
    }

    // Chat Summaries Catch-up
    // if (Array.isArray(config.CHAT_SUMMARY_TIMES)) {
    //     for (const timeStr of config.CHAT_SUMMARY_TIMES) {
    //         if (typeof timeStr === 'string' && timeStr.match(/^\d{2}:\d{2}$/)) {
    //             const summaryTime = parseTime(timeStr);
    //             const summaryTimeInMinutes = summaryTime.hour * 60 + summaryTime.minute;
    //             const taskKey = `chatSummary_${timeStr.replace(":", "")}`;
    //             if (timeNowMinutes >= summaryTimeInMinutes && !TaskStatusDbService.isTaskExecuted(taskKey, currentDate)) {
    //                 console.log(`SchedulerService (Catch-up): Horário de resumo (${timeStr}) passou, tarefa não executada. Acionando.`);
    //                 await triggerChatSummary(); // This function handles its own logic (like history check)
    //                 TaskStatusDbService.setTaskExecuted(taskKey, currentDate); // Mark as attempted/done
    //             }
    //         }
    //     }
    // }

    // Special Messages Catch-up
    const SUNDAY_NIGHT_MESSAGE_TIME_DETAILS = config.SUNDAY_NIGHT_MESSAGE_TIME ? parseTime(config.SUNDAY_NIGHT_MESSAGE_TIME) : { hour: 20, minute: 0 };
    const FRIDAY_MESSAGE_TIME_DETAILS = config.FRIDAY_MESSAGE_TIME ? parseTime(config.FRIDAY_MESSAGE_TIME) : { hour: 17, minute: 0 };

    if (currentDay === 0 && timeNowMinutes >= (SUNDAY_NIGHT_MESSAGE_TIME_DETAILS.hour * 60 + SUNDAY_NIGHT_MESSAGE_TIME_DETAILS.minute) && !TaskStatusDbService.isTaskExecuted('sundayNightMessage', currentDate)) {
        console.log("SchedulerService (Catch-up): Horário da mensagem de Domingo à noite passou, tarefa não executada. Acionando.");
        await sendSpecialMessage('extras_sundayNightMessage');
    }
    if (currentDay === 5 && timeNowMinutes >= (FRIDAY_MESSAGE_TIME_DETAILS.hour * 60 + FRIDAY_MESSAGE_TIME_DETAILS.minute) && !TaskStatusDbService.isTaskExecuted('fridayMessage', currentDate)) {
        console.log("SchedulerService (Catch-up): Horário da mensagem de Sexta-feira passou, tarefa não executada. Acionando.");
        await sendSpecialMessage('extras_fridayMessage');
    }

    // Start random message loops if applicable based on final currentServerStatus
    if (currentServerStatus === '🟢') {
        console.log("SchedulerService (Init): Server is 🟢, ensuring 'serverOpen' message loop is active.");
        scheduleNextRandomMessage('serverOpen');
    } else { // Server is not 🟢 (could be 🔴 or 🟡)
        if (serverOpenMessageTimeoutId) {
            clearTimeout(serverOpenMessageTimeoutId);
            serverOpenMessageTimeoutId = null;
            console.log("SchedulerService (Init): Server not 🟢, stopped 'serverOpen' message loop.");
        }
        if (currentHour >= config.DAYTIME_START_HOUR && currentHour < config.DAYTIME_END_HOUR) {
            if (daytimeMessageTimeoutId === null && daytimeMessagesSent < config.MESSAGES_DURING_DAYTIME) {
                 console.log("SchedulerService (Init): Server not 🟢, but in daytime. Ensuring 'daytime' message loop is active.");
                 scheduleNextRandomMessage('daytime');
            }
        } else {
            if (daytimeMessageTimeoutId !== null) {
                clearTimeout(daytimeMessageTimeoutId);
                daytimeMessageTimeoutId = null;
                console.log("SchedulerService (Init): Server not 🟢 and outside daytime, stopped 'daytime' message loop.");
            }
        }
    }
    console.log(`SchedulerService: Initialization complete. Final in-memory server status: ${currentServerStatus}`);
}


async function start() {
  initializeTimeDetails(); // Initial setup of times
  const config = ConfigService.getConfig();

  // Ensure DB is loaded and today's tasks are known
  const nowForStartup = new Date(new Date().toLocaleString("en-US", { timeZone: config.TIMEZONE }));
  const currentDateForStartup = nowForStartup.toISOString().slice(0, 10);

  // Initialize tasks for today if it's a new day according to DB's lastSchedulerDate
  const lastDbDate = TaskStatusDbService.getLastSchedulerDate();
  if (lastDbDate !== currentDateForStartup) {
    console.log(`SchedulerService (Startup): Novo dia (${currentDateForStartup}) detectado em relação ao DB. Inicializando tarefas.`);
    TaskStatusDbService.initializeTasksForDate(currentDateForStartup, true);
    TaskStatusDbService.setLastSchedulerDate(currentDateForStartup);
    // Reset daily counters that are managed in memory here
    serverOpenMessagesSent = 0;
    daytimeMessagesSent = 0;
    chatSummaryCountToday = 0;
    lastChatSummaryDate = currentDateForStartup;
  } else {
    // If it's the same day, ensure chat summary tasks are synced with current config
    TaskStatusDbService.syncChatSummaryTasksForDate(currentDateForStartup);
  }

  await initializeBotStatus(); // Determine current status, potentially trigger actions, and run catch-up

  const CHECK_INTERVAL = 10 * 1000; // 10 seconds
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
    const todayForStatus = nowForStatus.toISOString().slice(0, 10);
    const dailyStatuses = TaskStatusDbService.getTasksForDate(todayForStatus); // Gets current day's statuses

    let resp = `🗓️ *Status das Tarefas Agendadas (Hoje - ${todayForStatus}):* 🗓️\n`;
    resp += `Bot Server Status Atual (memória): ${currentServerStatus}\n`;
    resp += `Data/Hora Atual (${config.TIMEZONE}): ${nowForStatus.toLocaleString('pt-BR')}\n`;
    resp += `DB - Último dia de reset do agendador: ${TaskStatusDbService.getLastSchedulerDate() || 'Não definido'}\n`;
    resp += `Próxima verificação do agendador em até 10 segundos.\n\n`;

    resp += "*Status do Servidor (baseado em DB e horários):*\n";
    resp += `  - Aviso 1h (${oneHourBeforeOpenDetails.hour}:${String(oneHourBeforeOpenDetails.minute).padStart(2,'0')}): ${dailyStatuses.serverOpeningSoon ? '✅ Executado' : '⏳ Pendente'}\n`;
    resp += `  - Aviso 5min (${fiveMinBeforeOpenDetails.hour}:${String(fiveMinBeforeOpenDetails.minute).padStart(2,'0')}): ${dailyStatuses.serverOpeningIn5Min ? '✅ Executado' : '⏳ Pendente'}\n`;
    resp += `  - Abrir Servidor (${openTimeDetails.hour}:${String(openTimeDetails.minute).padStart(2,'0')}): ${dailyStatuses.serverOpen ? '✅ Executado' : '⏳ Pendente'}\n`;
    resp += `  - Fechar Servidor (${closeTimeDetails.hour}:${String(closeTimeDetails.minute).padStart(2,'0')}): ${dailyStatuses.serverClose ? '✅ Executado' : '⏳ Pendente'}\n\n`;

    resp += "*Resumos do Chat (baseado em DB e horários):*\n";
    if (config.CHAT_SUMMARY_TIMES && config.CHAT_SUMMARY_TIMES.length > 0) {
        config.CHAT_SUMMARY_TIMES.forEach(timeStr => {
            if (typeof timeStr === 'string' && timeStr.match(/^\d{2}:\d{2}$/)) {
                const taskKey = `chatSummary_${timeStr.replace(":", "")}`;
                resp += `  - ${timeStr}: ${dailyStatuses[taskKey] ? '✅ Executado' : '⏳ Pendente'}\n`;
            }
        });
    } else {
        resp += "  Nenhum horário de resumo configurado.\n";
    }
    resp += "\n";

    resp += "*Mensagens Extras (baseado em DB e horários):*\n";
    const SUNDAY_NIGHT_MESSAGE_TIME_DETAILS = config.SUNDAY_NIGHT_MESSAGE_TIME ? parseTime(config.SUNDAY_NIGHT_MESSAGE_TIME) : { hour: 20, minute: 0 };
    const FRIDAY_MESSAGE_TIME_DETAILS = config.FRIDAY_MESSAGE_TIME ? parseTime(config.FRIDAY_MESSAGE_TIME) : { hour: 17, minute: 0 };
    resp += `  - Domingo (aprox. ${SUNDAY_NIGHT_MESSAGE_TIME_DETAILS.hour}:${String(SUNDAY_NIGHT_MESSAGE_TIME_DETAILS.minute).padStart(2,'0')}): ${dailyStatuses.sundayNightMessage ? '✅ Executado' : '⏳ Pendente'}\n`;
    resp += `  - Sexta (aprox. ${FRIDAY_MESSAGE_TIME_DETAILS.hour}:${String(FRIDAY_MESSAGE_TIME_DETAILS.minute).padStart(2,'0')}): ${dailyStatuses.fridayMessage ? '✅ Executado' : '⏳ Pendente'}\n\n`;
    
    resp += `*Contadores de Mensagens Aleatórias (Hoje - em memória):*\n`;
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