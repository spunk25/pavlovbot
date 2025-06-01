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
  BOT_PUBLIC_URL: 'http://localhost:8080' // Default public URL
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

// Utilitário para converter "HH:MM" em objeto Date do dia atual no fuso horário
function getStatusTimeDetails(timeStr) {
  // timeStr: "19:00"
  const [hour, minute] = timeStr.split(':').map(Number);
  const now = new Date();
  now.setHours(hour, minute, 0, 0);
  return now;
}

let openTimeDetails, closeTimeDetails, oneHourBeforeOpenTimeDetails;

function initializeTimeDetails() {
    openTimeDetails = getStatusTimeDetails(botConfig.SERVER_OPEN_TIME);
    closeTimeDetails = getStatusTimeDetails(botConfig.SERVER_CLOSE_TIME);
    oneHourBeforeOpenTimeDetails = { ...openTimeDetails };
    oneHourBeforeOpenTimeDetails.hour -= 1;
    if (oneHourBeforeOpenTimeDetails.hour < 0) oneHourBeforeOpenTimeDetails.hour = 23;
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

    logScheduledCronTask(`${oneHourBeforeOpenTimeDetails.minute} ${oneHourBeforeOpenTimeDetails.hour} * * *`, "Aviso: 1h para abrir", messages.status.openingSoon, triggerServerOpeningSoon);
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
    const oneHourBeforeOpenH = oneHourBeforeOpenTimeDetails.hour; const oneHourBeforeOpenM = oneHourBeforeOpenTimeDetails.minute;

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
    ];

    for (const key of allowedKeys) {
      if (newConfig[key] !== undefined) {
        // Verifica se alguma configuração de tempo foi alterada
        if (["DAYTIME_START_HOUR", "DAYTIME_END_HOUR", "SERVER_OPEN_TIME", "SERVER_CLOSE_TIME"].includes(key) &&
            botConfig[key] !== newConfig[key]) {
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
      model: "llama3-8b-8192", // Ou outro modelo de sua preferência: mixtral-8x7b-32768
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
  const existingMessages = messages.randomActive || [];
  const examples = existingMessages.length > 0 ? 
    `Aqui estão alguns exemplos de mensagens existentes para você ter uma ideia do tom (tente não repetir):\n- "${getRandomElement(existingMessages)}"\n- "${getRandomElement(existingMessages)}"` 
    : "Gere uma mensagem curta e divertida sobre o jogo Pavlov VR.";

  const prompt = `Gere uma nova mensagem aleatória para o bot. ${examples} A mensagem deve ser original e criativa.`;

  const generatedMessage = await callGroqAPI(prompt);
  res.json({ success: !!generatedMessage && !generatedMessage.startsWith("Erro"), message: generatedMessage });
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
    // console.log('[DEBUG /webhook/messages-upsert] req._body AT START:', req._body);
    // console.log('[DEBUG /webhook/messages-upsert] req.webhook_data AT START:', JSON.stringify(req.webhook_data, null, 2));

    const fullReceivedPayload = req.body;           // { event, instance, data, … }
    const data                 = fullReceivedPayload.data;

    if (!data) {
      console.warn("messages.upsert: data ausente", JSON.stringify(fullReceivedPayload, null, 2));
      return res.status(400).send("Payload inválido para messages.upsert.");
    }
  
    // Se não houver data (already checked), ou não for a partir do grupo alvo, ou for mensagem do bot, ignora
    if (
      data.key.remoteJid !== botConfig.TARGET_GROUP_ID || // Check properties on the 'data' object
      isFromMe(data)
    ) {
      return res.status(200).send('Ignorado: sem processamento.');
    }
  
    // Extrai conteúdo e remetente
    const messageContent =
      data.message?.conversation ||
      data.message?.extendedTextMessage?.text ||
      "";
    const senderJid = data.key.participant || data.key.remoteJid;
    const commandText = messageContent.trim().toLowerCase();
    const command = commandText.split(' ')[0];
    const args = commandText.split(' ').slice(1);
  
    // Comandos que só admins podem usar
    if (['!abrir', '!fechar', '!avisar', '!teste', '!statusauto'].includes(command)) {
      const isAdmin = await isUserAdmin(botConfig.TARGET_GROUP_ID, senderJid);
      if (isAdmin) {
        if (command === '!teste') {
          await sendMessageToGroup("Testado por admin!", botConfig.TARGET_GROUP_ID);
        } else if (command === '!abrir') {
          await triggerServerOpen();
          // Pausar agendamentos automáticos de status
          scheduledCronTasks.forEach(task => {
            if (
              ["Servidor Aberto", "Servidor Fechado", "Aviso: 1h para abrir"].includes(
                task.description
              )
            ) {
              task.job.stop();
            }
          });
          console.log("Agendamentos automáticos de status PAUSADOS por comando manual.");
        } else if (command === '!fechar') {
          await triggerServerClose();
          scheduledCronTasks.forEach(task => {
            if (
              ["Servidor Aberto", "Servidor Fechado", "Aviso: 1h para abrir"].includes(
                task.description
              )
            ) {
              task.job.stop();
            }
          });
          console.log("Agendamentos automáticos de status PAUSADOS por comando manual.");
        } else if (command === '!avisar') {
          await triggerServerOpeningSoon();
          scheduledCronTasks.forEach(task => {
            if (
              ["Servidor Aberto", "Servidor Fechado", "Aviso: 1h para abrir"].includes(
                task.description
              )
            ) {
              task.job.stop();
            }
          });
          console.log("Agendamentos automáticos de status PAUSADOS por comando manual.");
        } else if (command === '!statusauto') {
          scheduledCronTasks.forEach(task => {
            if (
              ["Servidor Aberto", "Servidor Fechado", "Aviso: 1h para abrir"].includes(
                task.description
              )
            ) {
              task.job.start();
            }
          });
          await sendMessageToGroup("Agendamentos automáticos de status REATIVADOS.", botConfig.TARGET_GROUP_ID);
          console.log("Agendamentos automáticos de status REATIVADOS.");
        }   
     
      }
    }
    // Comando para enviar mensagem aleatória
    else if (command === '!random') {
      const randomMsg = getRandomElement(messages.randomActive);
      if (randomMsg) await sendMessageToGroup(randomMsg);
    }
    // Comando para criar enquete fixa
    else if (command === '!jogar?') {
      await sendPoll(
        "Ei!! Você 🫵 vai jogar Pavlov hoje?",
        ["Sim, vou!", "Talvez mais tarde", "Hoje não"],
        botConfig.TARGET_GROUP_ID
      );
    }
    // Comando para enviar áudio narrado
    else if (command === '!audio' && args.length > 0) {
      const audioUrl = args[0];
      if (audioUrl.startsWith('http')) {
        await sendNarratedAudio(audioUrl, botConfig.TARGET_GROUP_ID);
      } else {
        await sendMessageToGroup("Uso: !audio <URL_DO_AUDIO>", senderJid);
      }
    }
    // Comando para enquete customizada
    else if (command === '!enquete' && args.length >= 2) {
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
        if (!pollTitle) pollTitle = currentArg;
        else pollOptions.push(currentArg);
      }
      if (pollTitle && pollOptions.length > 0) {
        await sendPoll(pollTitle, pollOptions, botConfig.TARGET_GROUP_ID, pollOptions.length);
      } else {
        await sendMessageToGroup('Uso: !enquete "Título" "Opção1" "Opção2" ...', senderJid);
      }
    }
    // Novo comando: lista todos os cron‐jobs e suas próximas execuções
    else if (command === '!agendamentos' || command === '!jobs') {
      let resp = '⏱️ *Agendamentos Ativos:* ⏱️\n';
      const now = new Date();
      scheduledCronTasks.forEach(task => {
        let nextRun = 'N/A';
        try {
          if (cronParser) {
            const interval = cronParser.parseExpression(task.cronExpression, { currentDate: now, tz: botConfig.TIMEZONE });
            nextRun = interval.next().toDate().toLocaleString('pt-BR', { timeZone: botConfig.TIMEZONE });
          } else if (task.job.nextDates) {
            const nd = task.job.nextDates(1);
            if (nd && nd.length) nextRun = nd[0].toLocaleString('pt-BR', { timeZone: botConfig.TIMEZONE });
          }
        } catch (e) {
          nextRun = `Erro ao calcular`;
        }
        resp += `• ${task.description}: ${nextRun}\n`;
      });
      await sendMessageToGroup(resp, senderJid);
    }
    // Novo: Comando !start (pode ser usado por qualquer um)
    // else if (command === '!start') {
    //   const helpText = 
    //     "👋 Olá! Eu sou o Bot Pavlov.\n" +
    //     "Comandos disponíveis:\n" +
    //     "• !abrir       – Abrir servidor\n" +
    //     "• !fechar      – Fechar servidor\n" +
    //     "• !avisar      – Aviso 1h antes de abrir\n" +
    //     "• !statusauto  – Reativar status automático\n" +
    //     "• !random      – Mensagem aleatória\n" +
    //     "• !jogar?      – Enquete rápida\n" +
    //     "• !audio <URL> – Enviar áudio narrado\n" +
    //     '• !enquete "Título" "Op1" "Op2" … – Enquete customizada\n';
    //   await sendMessageToGroup(helpText, senderJid);
    // }
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