// bot.js
require('dotenv').config();
const axios = require('axios');
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

// Configurações padrão que podem ser sobrescritas pelo config.json e depois pelo .env
let botConfig = {
  EVOLUTION_API_URL: '',
  EVOLUTION_API_KEY: '',
  INSTANCE_NAME: '',
  TARGET_GROUP_ID: '',
  BOT_WEBHOOK_PORT: 8080, // Default port
  SERVER_OPEN_TIME: '19:00',
  SERVER_CLOSE_TIME: '23:59',
  GROUP_BASE_NAME: "BRASIL PAVLOV SND 6/24",
  MESSAGES_DURING_SERVER_OPEN: 4,
  MESSAGES_DURING_DAYTIME: 4,
  DAYTIME_START_HOUR: 8,
  DAYTIME_END_HOUR: 17,
  TIMEZONE: "America/Sao_Paulo",
  GROQ_API_KEY: '',
  BOT_PUBLIC_URL: 'http://localhost:8080', // Default public URL
  CHAT_SUMMARY_TIMES: ["10:00", "16:00", "21:00"] // Default times for chat summary
};

function loadBotConfig() {
  // 1. Carregar de config.json
  if (fs.existsSync(CONFIG_FILE_PATH)) {
    try {
      const fileContent = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
      const jsonConfig = JSON.parse(fileContent);
      botConfig = { ...botConfig, ...jsonConfig };
      console.log("Configurações carregadas de config.json");
    } catch (error) {
      console.error("Erro ao carregar config.json, usando padrões e .env:", error);
    }
  } else {
    console.warn("config.json não encontrado. Usando padrões e .env. O arquivo será criado ao salvar configurações pelo painel.");
  }

  // 2. Sobrescrever com variáveis de ambiente (elas têm maior precedência)
  for (const key in botConfig) {
    if (envConfig[key] !== undefined) {
      // Tratar números e booleanos que podem vir como string do .env
      if (!isNaN(parseFloat(envConfig[key])) && isFinite(envConfig[key])) {
        botConfig[key] = parseFloat(envConfig[key]);
      } else if (envConfig[key].toLowerCase() === 'true' || envConfig[key].toLowerCase() === 'false') {
        botConfig[key] = envConfig[key].toLowerCase() === 'true';
      } else {
        botConfig[key] = envConfig[key];
      }
    }
  }
   // Garante que as horas sejam strings
   botConfig.SERVER_OPEN_TIME = String(botConfig.SERVER_OPEN_TIME);
   botConfig.SERVER_CLOSE_TIME = String(botConfig.SERVER_CLOSE_TIME);
   botConfig.DAYTIME_START_HOUR = parseInt(botConfig.DAYTIME_START_HOUR, 10);
   botConfig.DAYTIME_END_HOUR = parseInt(botConfig.DAYTIME_END_HOUR, 10);
   botConfig.MESSAGES_DURING_SERVER_OPEN = parseInt(botConfig.MESSAGES_DURING_SERVER_OPEN, 10);
   botConfig.MESSAGES_DURING_DAYTIME = parseInt(botConfig.MESSAGES_DURING_DAYTIME, 10);

   // Ensure CHAT_SUMMARY_TIMES is an array of strings
   if (botConfig.CHAT_SUMMARY_TIMES && typeof botConfig.CHAT_SUMMARY_TIMES === 'string') {
     try {
       botConfig.CHAT_SUMMARY_TIMES = JSON.parse(botConfig.CHAT_SUMMARY_TIMES);
     } catch (e) {
       console.warn("Formato inválido para CHAT_SUMMARY_TIMES em .env/config.json, usando padrão. Deve ser um array JSON de strings, ex: [\"10:00\", \"16:00\"]");
       botConfig.CHAT_SUMMARY_TIMES = ["10:00", "16:00", "21:00"];
     }
   }
   if (!Array.isArray(botConfig.CHAT_SUMMARY_TIMES)) {
       console.warn("CHAT_SUMMARY_TIMES não é um array, usando padrão.");
       botConfig.CHAT_SUMMARY_TIMES = ["10:00", "16:00", "21:00"];
   }

  console.log("Configurações finais do bot:", { ...botConfig, EVOLUTION_API_KEY: '***', GROQ_API_KEY: '***' }); // Não logar chaves
}

async function saveBotConfig() {
  try {
    // Salva apenas as chaves que estão no config.json original ou que são relevantes para ele
    // Não salva chaves de API ou URLs da Evolution API que devem vir do .env
    const configToSave = {
      GROUP_BASE_NAME: botConfig.GROUP_BASE_NAME,
      MESSAGES_DURING_SERVER_OPEN: botConfig.MESSAGES_DURING_SERVER_OPEN,
      MESSAGES_DURING_DAYTIME: botConfig.MESSAGES_DURING_DAYTIME,
      DAYTIME_START_HOUR: botConfig.DAYTIME_START_HOUR,
      DAYTIME_END_HOUR: botConfig.DAYTIME_END_HOUR,
      SERVER_OPEN_TIME: botConfig.SERVER_OPEN_TIME,
      SERVER_CLOSE_TIME: botConfig.SERVER_CLOSE_TIME,
      // O GROQ_API_KEY pode ser salvo se o usuário o inserir pelo painel,
      // mas é mais seguro mantê-lo apenas no .env.
      // Se você quiser permitir salvar pelo painel, descomente a linha abaixo.
      // GROQ_API_KEY: botConfig.GROQ_API_KEY
      CHAT_SUMMARY_TIMES: botConfig.CHAT_SUMMARY_TIMES // Salvar os horários do resumo
    };
    await fs.promises.writeFile(CONFIG_FILE_PATH, JSON.stringify(configToSave, null, 2), 'utf-8');
    console.log("Configurações salvas em config.json");
  } catch (error) {
    console.error("Erro ao salvar config.json:", error);
  }
}

loadBotConfig(); // Carrega as configurações na inicialização

// --- Mensagens ---
let messages = {}; // Será populado por loadMessages
let chatHistory = []; // Para armazenar mensagens para resumo

function loadMessages() {
  try {
    if (fs.existsSync(MESSAGES_FILE_PATH)) {
      const fileContent = fs.readFileSync(MESSAGES_FILE_PATH, 'utf-8');
      messages = JSON.parse(fileContent);
      console.log("Mensagens carregadas de messages.json");
    } else {
      console.error("ERRO: messages.json não encontrado. Usando mensagens padrão (se houver) ou bot pode não funcionar corretamente.");
      // Você pode querer ter mensagens padrão aqui ou criar o arquivo se não existir
      // Por enquanto, vamos assumir que ele deve existir.
      // Para criar um default se não existir:
      // messages = { /* estrutura padrão aqui */ };
      // saveMessages(); // e então salvar
    }
  } catch (error) {
    console.error("Erro ao carregar messages.json:", error);
    // Fallback para um objeto vazio ou estrutura padrão para evitar que o bot quebre totalmente
    messages = { status: {}, newMember: [], memberLeft: [], randomActive: [], extras: {} };
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
const evolutionAPI = axios.create({
  baseURL: botConfig.EVOLUTION_API_URL,
  headers: {
    'apikey': botConfig.EVOLUTION_API_KEY,
    'Content-Type': 'application/json'
  }
});

async function sendMessageToGroup(messageText, recipientJid = botConfig.TARGET_GROUP_ID) {
  try {
    await evolutionAPI.post(`/message/sendText/${botConfig.INSTANCE_NAME}`, {
      number: recipientJid,
      text: messageText,
    });
  } catch (error) {
    console.error(`Erro ao enviar mensagem de texto para ${recipientJid}:`, error.response ? error.response.data : error.message);
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

async function sendPoll(pollName, pollValues, recipientJid = botConfig.TARGET_GROUP_ID, selectableCount = 1, options = {}) {
  try {
    await evolutionAPI.post(`/message/sendPoll/${botConfig.INSTANCE_NAME}`, {
      number: recipientJid,
      name: pollName,
      selectableCount: selectableCount,
      values: pollValues,
      ...options
    });
    console.log(`Enquete "${pollName}" enviada para ${recipientJid}`);
  } catch (error) {
    console.error(`Erro ao enviar enquete para ${recipientJid}:`, error.response ? error.response.data : error.message);
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

  console.log(`Horários de status inicializados: Abrir ${openTimeDetails.hour}:${openTimeDetails.minute}, Fechar ${closeTimeDetails.hour}:${closeTimeDetails.minute}, Aviso ${oneHourBeforeOpenDetails.hour}:${oneHourBeforeOpenDetails.minute}`);
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
  console.log("ACIONADO: Abertura do servidor.");
  await updateServerStatus('🟢', messages.status.open);
  serverOpenMessagesSent = 0;
  if (serverOpenMessageTimeoutId) clearTimeout(serverOpenMessageTimeoutId);
  console.log("Iniciando ciclo de mensagens aleatórias do servidor aberto.");
  scheduleNextRandomMessage('serverOpen');
}

async function triggerServerClose() {
  console.log("ACIONADO: Fechamento do servidor.");
  await updateServerStatus('🔴', messages.status.closed);
  if (serverOpenMessageTimeoutId) {
    clearTimeout(serverOpenMessageTimeoutId);
    serverOpenMessageTimeoutId = null;
  }
  serverOpenMessagesSent = botConfig.MESSAGES_DURING_SERVER_OPEN;
}

async function triggerServerOpeningSoon() {
  console.log("ACIONADO: Aviso de 1h para abrir.");
  await updateServerStatus('🟡', messages.status.openingSoon);
  // Ao avisar 1h antes da abertura, também envia enquete de jogar
  await sendPoll(
    "Ei!! Você 🫵 vai jogar Pavlov hoje?",
    ["Sim, vou!", "Talvez mais tarde", "Hoje não"],
    botConfig.TARGET_GROUP_ID
  );
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
    // intervalo em minutos entre cada mensagem durante o servidor aberto
    delay = calculateRandomDelay(10, 30);
  } 
  else if (type === 'daytime') {
    if (daytimeMessagesSent >= botConfig.MESSAGES_DURING_DAYTIME) {
      console.log(`[DEBUG] [daytime] Limite de ${botConfig.MESSAGES_DURING_DAYTIME} mensagens atingido. Não agendando mais.`);
      return;
    }
    // intervalo em minutos entre cada mensagem de dia
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

    const msg = getRandomElement(messages.randomActive);
    if (msg) {
      console.log(`[DEBUG] Enviando mensagem automática: "${msg}"`);
      await sendMessageToGroup(msg);
    } else {
      console.warn(`[DEBUG] Nenhuma mensagem disponível em messages.randomActive`);
    }

    if (type === 'serverOpen') {
      serverOpenMessagesSent++;
      serverOpenMessageTimeoutId = null;
      scheduleNextRandomMessage('serverOpen');
    } else {
      daytimeMessagesSent++;
      daytimeMessageTimeoutId = null;
      scheduleNextRandomMessage('daytime');
    }
  }, delay);

  if (type === 'serverOpen') {
    serverOpenMessageTimeoutId = timeoutId;
  } else {
    daytimeMessageTimeoutId = timeoutId;
  }
}

// --- Agendamentos Cron ---
const scheduledCronTasks = [];
function logScheduledCronTask(cronExpression, description, messageOrAction, taskFn) {
  const job = cron.schedule(cronExpression, taskFn, { timezone: botConfig.TIMEZONE, scheduled: false });
  scheduledCronTasks.push({ job, description, cronExpression, messageOrAction, originalTaskFn: taskFn });
}

function setupCronJobs() {
    console.log("Configurando/Reconfigurando cron jobs...");
    scheduledCronTasks.forEach(task => {
        if (task.job && typeof task.job.stop === 'function') {
            task.job.stop();
        }
    });
    scheduledCronTasks.length = 0; // Limpa a lista de tarefas antigas

    // Recarrega os detalhes de tempo caso tenham sido alterados
    initializeTimeDetails();

    logScheduledCronTask(`${oneHourBeforeOpenDetails.minute} ${oneHourBeforeOpenDetails.hour} * * *`, "Aviso: 1h para abrir", messages.status.openingSoon, triggerServerOpeningSoon);
    logScheduledCronTask(`${openTimeDetails.minute} ${openTimeDetails.hour} * * *`, "Servidor Aberto", messages.status.open, triggerServerOpen);
    logScheduledCronTask(`${closeTimeDetails.minute} ${closeTimeDetails.hour} * * *`, "Servidor Fechado", messages.status.closed, triggerServerClose);
    logScheduledCronTask(`0 ${botConfig.DAYTIME_START_HOUR} * * *`, "Início Msgs Diurnas", "Iniciar ciclo de mensagens aleatórias diurnas", () => {
      daytimeMessagesSent = 0; if (daytimeMessageTimeoutId) clearTimeout(daytimeMessageTimeoutId); scheduleNextRandomMessage('daytime');
    });
    logScheduledCronTask(`0 ${botConfig.DAYTIME_END_HOUR} * * *`, "Fim Msgs Diurnas", "Parar ciclo de mensagens aleatórias diurnas", () => {
      if (daytimeMessageTimeoutId) clearTimeout(daytimeMessageTimeoutId); daytimeMessagesSent = botConfig.MESSAGES_DURING_DAYTIME;
    });
    logScheduledCronTask('0 20 * * 0', "Mensagem Dominical", messages.extras.sundayNight, async () => { await sendMessageToGroup(messages.extras.sundayNight); });
    logScheduledCronTask('0 18 * * 5', "Mensagem de Sexta", messages.extras.friday, async () => { await sendMessageToGroup(messages.extras.friday); });
    
    // Agendamentos para resumo do chat
    if (Array.isArray(botConfig.CHAT_SUMMARY_TIMES)) {
        botConfig.CHAT_SUMMARY_TIMES.forEach(time => {
            if (typeof time === 'string' && /^\d{1,2}:\d{2}$/.test(time)) {
                const [hour, minute] = time.split(':');
                logScheduledCronTask(`${minute} ${hour} * * *`, `Resumo do Chat (${hour}:${minute})`, "Gerar resumo do chat", triggerChatSummary);
            } else {
                console.warn(`Formato de hora inválido para CHAT_SUMMARY_TIMES: "${time}". Ignorando.`);
            }
        });
    }
    
    // Inicia os cron jobs recém configurados
    scheduledCronTasks.forEach(task => task.job.start());
    console.log("Cron jobs configurados e iniciados.");
    logCurrentCronSchedule(); // Log a nova programação
}

function logCurrentCronSchedule() {
    console.log("\n--- AGENDAMENTOS CRON ATIVOS ---");
    const nowForCronDisplay = new Date();
    if (scheduledCronTasks.length === 0) {
        console.log("Nenhum cron job agendado no momento.");
    }
    scheduledCronTasks.forEach(task => {
        let nextRunDisplay = "N/A";
        try {
            if (cronParser && task.job.running) { // Verifica se o job está rodando antes de tentar pegar nextDate
                const interval = cronParser.parseExpression(task.cronExpression, { currentDate: nowForCronDisplay, tz: botConfig.TIMEZONE });
                nextRunDisplay = interval.next().toDate().toLocaleString('pt-BR', { timeZone: botConfig.TIMEZONE });
            } else if (task.job.nextDates) { // Fallback se cronParser não estiver disponível ou job não rodando
                const nextDates = task.job.nextDates(1); 
                if (nextDates && nextDates.length > 0) {
                    nextRunDisplay = nextDates[0].toLocaleString('pt-BR', { timeZone: botConfig.TIMEZONE });
                }
            }
        } catch (e) { 
            nextRunDisplay = `(Erro ao calcular próxima execução: ${e.message.substring(0,30)}...)`; 
        }
        let msgPrev = typeof task.messageOrAction === 'string' ? task.messageOrAction : 'Ação programada';
        if (msgPrev.length > 60) msgPrev = msgPrev.substring(0, 57) + "...";
        console.log(`- Tarefa: ${task.description}\n  Próxima: ${nextRunDisplay}\n  Msg/Ação: ${msgPrev}\n  Cron: ${task.cronExpression}\n  Rodando: ${task.job.running}`);
    });
    console.log("--------------------------------\n");
}

// --- Inicialização do Bot e Status ---
async function initializeBotStatus() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    let initialStatus = '🔴';

    const openH = openTimeDetails.hour; const openM = openTimeDetails.minute;
    const closeH = closeTimeDetails.hour; const closeM = closeTimeDetails.minute;
    const oneHourBeforeOpenH = oneHourBeforeOpenDetails.hour; const oneHourBeforeOpenM = oneHourBeforeOpenDetails.minute;

    const timeNow = currentHour * 60 + currentMinute;
    const timeOneHourBefore = oneHourBeforeOpenH * 60 + oneHourBeforeOpenM;
    const timeOpen = openH * 60 + openM;
    const timeClose = closeH * 60 + closeM;

    if (timeOpen > timeClose) { // Cruza meia-noite (ex: Abre 22:00 (1320), Fecha 02:00 (120) do dia seguinte)
        if (timeNow >= timeOpen || timeNow < timeClose) {
            initialStatus = '🟢';
        }
        if (timeNow >= timeOneHourBefore && timeNow < timeOpen && timeOneHourBefore >= timeClose) { // 1h antes ainda no dia "de abertura"
             initialStatus = '🟡';
        } else if (timeNow >= timeOneHourBefore && timeOneHourBefore < timeOpen && timeOneHourBefore < timeClose) { // 1h antes no dia "de fechamento" mas antes de abrir
             initialStatus = '🟡';
        }

    } else { // Mesmo dia (ex: Abre 19:00 (1140), Fecha 23:00 (1380))
        if (timeNow >= timeOpen && timeNow < timeClose) {
            initialStatus = '🟢';
        }
        if (timeNow >= timeOneHourBefore && timeNow < timeOpen) {
            initialStatus = '🟡';
        }
    }
     // Ajuste final para garantir que se estiver 1h antes, seja amarelo, lidando com cruzamento de meia-noite
    if (oneHourBeforeOpenH === 23 && openH === 0) { // 1h antes é 23:xx, abre 00:xx
        if(currentHour === 23 && currentMinute >= oneHourBeforeOpenM) initialStatus = '🟡';
    } else if (currentHour === oneHourBeforeOpenH && currentMinute >= oneHourBeforeOpenM && currentHour < openH) { // Caso normal 1h antes
        initialStatus = '🟡';
    } else if (currentHour === openH && currentMinute < openM && currentHour === oneHourBeforeOpenH && currentMinute >= oneHourBeforeOpenM) { // Exatamente no início da janela de 1h antes
        initialStatus = '🟡';
    }

    // Se o status foi definido para amarelo, mas já passou da hora de abrir (e ainda não fechou), então deve ser verde.
    if (initialStatus === '🟡') {
        if (timeOpen > timeClose) { // Cruza meia-noite
            if (timeNow >= timeOpen || timeNow < timeClose) initialStatus = '🟢';
        } else { // Mesmo dia
            if (timeNow >= timeOpen && timeNow < timeClose) initialStatus = '🟢';
        }
    }

    // Só atualiza nome do grupo se estiver em openingSoon (🟡) ou open (🟢)
    if (initialStatus !== '🔴') {
        await updateServerStatus(initialStatus, null);
        console.log(`Status inicial do bot definido para: ${initialStatus}`);
    } else {
        // mantém apenas o status interno, sem mexer no nome
        currentServerStatus = initialStatus;
        console.log(`Status inicial 'fechado' detectado fora de horário. Nome do grupo NÃO será alterado.`);
    }

    // se já estiver aberto, inicia as mensagens automáticas
    if (initialStatus === '🟢') {
        serverOpenMessagesSent = 0;
        scheduleNextRandomMessage('serverOpen');
    }
    const currentHourNow = new Date().getHours();
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
  const newMessages = req.body;
  if (typeof newMessages === 'object' && newMessages !== null) {
    messages = newMessages;
    await saveMessages();
    res.json({ success: true, message: "Mensagens atualizadas com sucesso!" });
  } else {
    res.status(400).json({ success: false, message: "Payload inválido." });
  }
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
      "DAYTIME_START_HOUR", "DAYTIME_END_HOUR", "SERVER_OPEN_TIME", "SERVER_CLOSE_TIME"
      // "GROQ_API_KEY" // Descomente se quiser permitir alteração da chave Groq via painel
      , "CHAT_SUMMARY_TIMES" // Adicionar CHAT_SUMMARY_TIMES às chaves permitidas
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
    const groqResponse = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: "mistral-saba-24b", // Ou outro modelo de sua preferência: mixtral-8x7b-32768
      messages: [
        { role: "system", content: "Você é um assistente divertido para um bot de WhatsApp de um grupo de jogadores de Pavlov VR. Gere mensagens curtas, engraçadas e no tema do jogo. Evite ser repetitivo com as mensagens de exemplo." },
        { role: "user", content: prompt }
      ],
      temperature: 0.8,
      max_tokens: 60,
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

  switch (type) {
    case 'inGameRandom':
      exampleMessages = messages.inGameRandom || [];
      basePrompt = "Gere uma mensagem curta, impactante e divertida para um bot em um grupo de jogadores de Pavlov VR, especificamente para ser enviada DURANTE UMA PARTIDA. Pode ser sobre ações no jogo, provocações leves, ou algo que aumente a imersão. ";
      break;
    case 'randomActive':
      exampleMessages = messages.randomActive || [];
      basePrompt = "Gere uma mensagem curta, divertida e original para um bot em um grupo de jogadores de Pavlov VR. Esta é uma mensagem geral, não necessariamente durante uma partida. ";
      break;
    case 'status_closed':
      singleExample = messages.status?.closed;
      basePrompt = "Gere uma mensagem curta e informativa para o status do grupo de Pavlov VR, indicando que o servidor está FECHADO. Exemplo: Servidor fechado por hoje, pessoal. Até amanhã!";
      break;
    case 'status_openingSoon':
      singleExample = messages.status?.openingSoon;
      basePrompt = "Gere uma mensagem curta e animada para o status do grupo de Pavlov VR, indicando que o servidor abrirá EM BREVE (ex: em 1 hora). Exemplo: Preparem-se! Servidor abrindo em 1 hora!";
      break;
    case 'status_open':
      singleExample = messages.status?.open;
      basePrompt = "Gere uma mensagem curta e convidativa para o status do grupo de Pavlov VR, indicando que o servidor está ABERTO. Exemplo: Servidor online! Bora pro tiroteio!";
      break;
    case 'newMember':
      exampleMessages = messages.newMember || [];
      basePrompt = "Gere uma mensagem de boas-vindas curta, amigável e divertida para um NOVO MEMBRO que acabou de entrar no grupo de Pavlov VR. Pode incluir um toque de humor ou referência ao jogo.";
      break;
    case 'memberLeft':
      exampleMessages = messages.memberLeft || [];
      basePrompt = "Gere uma mensagem curta, neutra ou levemente humorística para quando um MEMBRO SAI do grupo de Pavlov VR. Exemplo: Fulano desertou! Menos um pra dividir o loot.";
      break;
    case 'extras_sundayNight':
      singleExample = messages.extras?.sundayNight;
      basePrompt = "Gere uma mensagem curta e temática para ser enviada em um DOMINGO À NOITE para jogadores de Pavlov VR, talvez sobre o fim de semana ou a semana que começa, com um toque de Pavlov. Exemplo: Domingo acabando... última chance pra um headshot antes da segunda!";
      break;
    case 'extras_friday':
      singleExample = messages.extras?.friday;
      basePrompt = "Gere uma mensagem curta e animada para uma SEXTA-FEIRA para jogadores de Pavlov VR, celebrando o início do fim de semana e chamando para o jogo. Exemplo: Sextou, soldados! Pavlov liberado no final de semana!";
      break;
    default:
      return res.status(400).json({ success: false, message: `Tipo de mensagem desconhecido: ${type}` });
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
        promptContext += ` Inspire-se no tom e estilo destes exemplos (mas não os repita):\n- "${samples.join('"\n- "')}"\n`;
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
        // console.log(`[ChatHistory] Added: ${senderName}: ${messageContent.substring(0,30)}... Total: ${chatHistory.length}`);
    }

    let replyTo = actualSenderJid; // Default: reply to where the command came from (PM or group if sender is the bot's JID in a group context)
    if (isGroupMessage && remoteJid === botConfig.TARGET_GROUP_ID) {
        replyTo = botConfig.TARGET_GROUP_ID; // If command is in target group, usually reply to group
        if (isAdmin) { // If admin types in group, reply can be to group or PM based on command
           // For most admin commands that give feedback, sending to actualSenderJid (PM) might be better if they typed in group.
           // However, for simplicity and current setup, admin commands typed in group will reply to group or actualSenderJid based on specific command logic below.
           // The `replyTo` variable will be adjusted by specific command logic if needed.
           // For now, if admin types in group, replyTo is the group. If they type in PM, replyTo is their JID.
           // Let's refine: if admin types in group, replyTo should be actualSenderJid for direct feedback,
           // unless the command is inherently group-wide for its reply (like !jogar? confirmation)
           // For now, let's keep replyTo as actualSenderJid for admin commands, and TARGET_GROUP_ID for public commands.
           replyTo = actualSenderJid; // Admin commands reply to admin (PM or group where they typed)
        }
    }

    const helpText = 
        "👋 Olá! Eu sou o Bot Pavlov.\n" +
        "Comandos disponíveis:\n" +
        "• !start       – Mostra esta ajuda\n" +
        "• !abrir       – (Admin) Abrir servidor\n" +
        "• !fechar      – (Admin) Fechar servidor\n" +
        "• !avisar      – (Admin) Aviso 1h antes de abrir\n" +
        "• !statusauto  – (Admin) Reativar status automático\n" +
        "• !teste       – (Admin) Testa o bot\n" +
        "• !say <msg>   – (Admin) Envia msg customizada ao grupo\n" +
        "• !anunciar <msg>– (Admin) Alias para !say\n" +
        "• !random      – Mensagem aleatória (IA)\n" +
        "• !jogar?      – Enquete rápida de jogo\n" +
        "• !audio <URL> – (Admin) Enviar áudio narrado\n" +
        '• !enquete "Título" "Op1" ... – (Admin) Enquete customizada\n' +
        "• !agendamentos / !jobs – (Admin) Ver agendamentos";

    // 4. Process commands
    let commandProcessed = false;

    if (command === '!start') {
        await sendMessageToGroup(helpText, actualSenderJid); // Send help to where !start was typed
        commandProcessed = true;
    }
    else if (isAdmin) {
        // Admin commands reply to actualSenderJid (PM or group where admin typed)
        // Group-affecting actions still target TARGET_GROUP_ID
        if (['!abrir', '!fechar', '!avisar', '!teste', '!statusauto'].includes(command)) {
            commandProcessed = true;
            if (command === '!teste') {
                await sendMessageToGroup("Testado por admin!", actualSenderJid);
            } else if (command === '!abrir') {
                await triggerServerOpen(); // Affects TARGET_GROUP_ID
                scheduledCronTasks.forEach(task => {
                    if (["Servidor Aberto", "Servidor Fechado", "Aviso: 1h para abrir"].includes(task.description)) {
                        task.job.stop();
                    }
                });
                console.log("Agendamentos automáticos de status (abrir/fechar/avisar) PAUSADOS por comando manual.");
                await sendMessageToGroup("Servidor aberto manualmente. Agendamentos de status (abrir/fechar/avisar) pausados.", actualSenderJid);
            } else if (command === '!fechar') {
                await triggerServerClose(); // Affects TARGET_GROUP_ID
                scheduledCronTasks.forEach(task => {
                    if (["Servidor Aberto", "Servidor Fechado", "Aviso: 1h para abrir"].includes(task.description)) {
                        task.job.stop();
                    }
                });
                console.log("Agendamentos automáticos de status (abrir/fechar/avisar) PAUSADOS por comando manual.");
                await sendMessageToGroup("Servidor fechado manualmente. Agendamentos de status (abrir/fechar/avisar) pausados.", actualSenderJid);
            } else if (command === '!avisar') {
                await triggerServerOpeningSoon(); // Affects TARGET_GROUP_ID
                scheduledCronTasks.forEach(task => {
                    if (["Servidor Aberto", "Servidor Fechado", "Aviso: 1h para abrir"].includes(task.description)) {
                        task.job.stop();
                    }
                });
                console.log("Agendamentos automáticos de status (abrir/fechar/avisar) PAUSADOS por comando manual.");
                await sendMessageToGroup("Aviso de abertura enviado manualmente. Agendamentos de status (abrir/fechar/avisar) pausados.", actualSenderJid);
            } else if (command === '!statusauto') {
                scheduledCronTasks.forEach(task => {
                    if (["Servidor Aberto", "Servidor Fechado", "Aviso: 1h para abrir"].includes(task.description)) {
                        task.job.start();
                    }
                });
                await sendMessageToGroup("Agendamentos automáticos de status (abrir/fechar/avisar) REATIVADOS.", actualSenderJid);
                console.log("Agendamentos automáticos de status REATIVADOS.");
            }
        }
        else if (command === '!random') { // Admin version of !random
            commandProcessed = true;
            const randomMsg = await getAIRandomMessage();
            if (randomMsg) await sendMessageToGroup(randomMsg, actualSenderJid);
        }
        else if (command === '!jogar?') { // Admin version of !jogar?
            commandProcessed = true;
            await sendPoll(
                "Ei!! Você 🫵 vai jogar Pavlov hoje?",
                ["Sim, vou!", "Talvez mais tarde", "Hoje não"],
                botConfig.TARGET_GROUP_ID // Poll always goes to the target group
            );
            // Confirm to admin where they sent it
            await sendMessageToGroup("Enquete '!jogar?' enviada para o grupo.", actualSenderJid);
        }
        else if (command === '!audio' && args.length > 0) {
            commandProcessed = true;
            const audioUrl = args[0];
            if (audioUrl.startsWith('http')) {
                await sendNarratedAudio(audioUrl, botConfig.TARGET_GROUP_ID); // Audio to target group
                await sendMessageToGroup(`Áudio enviado para o grupo: ${audioUrl}`, actualSenderJid);
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
                await sendMessageToGroup(`Enquete "${pollTitle}" enviada para o grupo.`, actualSenderJid);
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
        // Novo comando: !say ou !anunciar para enviar mensagem customizada
        else if (command === '!say' || command === '!anunciar') {
            commandProcessed = true;
            if (args.length > 0) {
                const messageToSend = messageContent.substring(command.length + 1).trim(); // Pega todo o texto após o comando
                if (messageToSend) {
                    await sendMessageToGroup(messageToSend, botConfig.TARGET_GROUP_ID);
                    await sendMessageToGroup("✅ Mensagem enviada para o grupo.", actualSenderJid);
                } else {
                    await sendMessageToGroup("⚠️ Por favor, forneça uma mensagem para enviar. Uso: !say <sua mensagem>", actualSenderJid);
                }
            } else {
                await sendMessageToGroup("⚠️ Uso: !say <sua mensagem>", actualSenderJid);
            }
        }
        // If admin sent a PM and it wasn't any of the above commands
        else if (!isGroupMessage && !commandProcessed && commandText.length > 0) {
             await sendMessageToGroup(helpText, actualSenderJid);
             commandProcessed = true; // Consider it processed by showing help
        }
    } 
    // Public commands (for non-admins or if admin command didn't match in group and it's not a PM)
    // These only work if sent in the TARGET_GROUP_ID
    else if (isGroupMessage && remoteJid === botConfig.TARGET_GROUP_ID) {
        if (command === '!random') {
            commandProcessed = true;
            const randomMsg = await getAIRandomMessage();
            if (randomMsg) await sendMessageToGroup(randomMsg, botConfig.TARGET_GROUP_ID); // Reply to group
        }
        else if (command === '!jogar?') {
            commandProcessed = true;
            await sendPoll(
                "Ei!! Você 🫵 vai jogar Pavlov hoje?",
                ["Sim, vou!", "Talvez mais tarde", "Hoje não"],
                botConfig.TARGET_GROUP_ID // Poll to group
            );
            // No separate confirmation needed here as the poll itself is the action in the group
        }
    }
    
    if (!commandProcessed && commandText.startsWith("!")) {
        // Optional: Reply if it looked like a command but wasn't recognized
        // await sendMessageToGroup(`Comando "${command}" não reconhecido. Digite !start para ajuda.`, actualSenderJid);
    }

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

// Função para obter uma mensagem aleatória GERAL, potencialmente gerada por IA
async function getAIRandomMessage() { // Para !random e mensagens diurnas
  if (!botConfig.GROQ_API_KEY) {
    console.warn("Chave da API Groq não configurada. Usando mensagem de fallback da lista randomActive.");
    if (messages.randomActive && messages.randomActive.length > 0) {
      return getRandomElement(messages.randomActive);
    }
    return "Aqui deveria ter uma piada, mas a IA está de folga e não temos exemplos para mensagens gerais!";
  }

  const exampleMessages = messages.randomActive || [];
  let promptContext = "Gere uma mensagem curta, divertida e original para um bot em um grupo de jogadores de Pavlov VR. Esta é uma mensagem geral, não necessariamente durante uma partida. ";

  if (exampleMessages.length > 0) {
    const sampleSize = Math.min(exampleMessages.length, 2);
    const samples = [];
    for (let i = 0; i < sampleSize; i++) {
      samples.push(getRandomElement(exampleMessages));
    }
    promptContext += `Inspire-se no tom e estilo destes exemplos (mas não os repita):\n- ${samples.join('"\n- "')}\n`;
  }
  promptContext += "A mensagem deve ser criativa e adequada para um ambiente de jogo online. Evite ser repetitivo.";

  const generatedMessage = await callGroqAPI(promptContext);

  if (generatedMessage && !generatedMessage.startsWith("Erro") && generatedMessage.length > 5) {
    return generatedMessage;
  } else {
    console.warn("Falha ao gerar mensagem GERAL com Groq, usando fallback da lista randomActive.");
    if (messages.randomActive && messages.randomActive.length > 0) {
      return getRandomElement(messages.randomActive);
    }
    return "A IA tentou, mas falhou na mensagem geral. Que tal um 'bora jogar!' clássico?";
  }
}

// Função para obter uma mensagem aleatória "DURANTE O JOGO", potencialmente gerada por IA
async function getAIInGameMessage() { // Para mensagens quando o servidor está aberto
  if (!botConfig.GROQ_API_KEY) {
    console.warn("Chave da API Groq não configurada. Usando mensagem de fallback da lista inGameRandom.");
    if (messages.inGameRandom && messages.inGameRandom.length > 0) {
      return getRandomElement(messages.inGameRandom);
    }
    return "O jogo está rolando, mas a IA de mensagens de jogo está offline!";
  }

  const exampleMessages = messages.inGameRandom || [];
  let promptContext = "Gere uma mensagem curta, impactante e divertida para um bot em um grupo de jogadores de Pavlov VR, especificamente para ser enviada DURANTE UMA PARTIDA. Pode ser sobre ações no jogo, provocações leves, ou algo que aumente a imersão. ";

  if (exampleMessages.length > 0) {
    const sampleSize = Math.min(exampleMessages.length, 2);
    const samples = [];
    for (let i = 0; i < sampleSize; i++) {
      samples.push(getRandomElement(exampleMessages));
    }
    promptContext += `Inspire-se no tom e estilo destes exemplos de mensagens 'durante o jogo' (mas não os repita):\n- ${samples.join('"\n- "')}\n`;
  }
  promptContext += "A mensagem deve ser criativa e adequada para o calor do momento no jogo. Evite ser repetitivo.";

  const generatedMessage = await callGroqAPI(promptContext);

  if (generatedMessage && !generatedMessage.startsWith("Erro") && generatedMessage.length > 5) {
    return generatedMessage;
  } else {
    console.warn("Falha ao gerar mensagem IN-GAME com Groq, usando fallback da lista inGameRandom.");
    if (messages.inGameRandom && messages.inGameRandom.length > 0) {
      return getRandomElement(messages.inGameRandom);
    }
    return "A IA de jogo bugou! Foquem no objetivo!";
  }
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

  const prompt = `Você é um comentarista de e-sports para o jogo Pavlov VR, conhecido por seu humor e por capturar a essência das conversas dos jogadores. Analise o seguinte bate-papo do grupo de WhatsApp e crie um resumo curto (2-4 frases), divertido e temático sobre os principais tópicos discutidos. Imagine que você está fazendo um 'resumo da zoeira do lobby' ou 'os destaques da resenha'. Não liste mensagens individuais, crie uma narrativa coesa e engraçada. Se for relevante para o resumo ou para dar um toque especial ao comentário, você pode mencionar o nome de quem disse algo marcante (por exemplo, 'Parece que o [NomeDoJogador] estava inspirado hoje!' ou 'O [NomeDoJogador] soltou a pérola do dia:'). Use os nomes com moderação e apenas se agregar valor. Seja criativo!\n\nChat dos Jogadores:\n${formatChatForSummary(currentChatToSummarize)}\n\nResumo Criativo do Comentarista:`;

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
}