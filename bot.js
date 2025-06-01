// bot.js
require('dotenv').config();
const axios = require('axios');
const cron = require('node-cron');
const fs = require('fs');
const { getRandomElement } = require('./utils'); // Certifique-se que utils.js existe
let cronParser;
try {
  cronParser = require('cron-parser');
} catch (e) {
  console.warn("Pacote 'cron-parser' não encontrado. A exibição da próxima data exata dos crons pode ser limitada.");
  cronParser = null;
}

// --- Configurações ---
const {
  EVOLUTION_API_URL,
  EVOLUTION_API_KEY,
  INSTANCE_NAME,
  TARGET_GROUP_ID,
  BOT_WEBHOOK_PORT,
  SERVER_OPEN_TIME,
  SERVER_CLOSE_TIME,
} = process.env;

const GROUP_BASE_NAME = "BRASIL PAVLOV SND 6/24";
const MESSAGES_DURING_SERVER_OPEN = 4;
const MESSAGES_DURING_DAYTIME = 4;
const DAYTIME_START_HOUR = 8;
const DAYTIME_END_HOUR = 17;
const TIMEZONE = "America/Sao_Paulo"; // Ajuste para seu fuso horário

// --- Mensagens ---
const messages = {
  status: {
    closed: "🚧 Servidor fechado. Vai viver a vida real (ou tenta).",
    openingSoon: "⏳ Servidor abre em 1 hora! Aqueles que forem entrar, aqueçam as mãos (e preparem as desculpas).",
    open: "🟢 Servidor aberto! Que comecem os tiros, os gritos e os rage quits.",
  },
  newMember: [
    "🔥 Mais um forno chegou! Alguém dá o manual (mentira, a gente joga ele no mapa e vê no que dá).",
    "🎒 Novato na área! Não alimente, não ensine… apenas observe.",
    "🐣 Mais um soldado saiu do lobby do além e chegou ao grupo. Boa sorte, guerreiro.",
  ],
  memberLeft: [
    "💔 Mais um corno desistiu.",
    "👋 Adeus, guerreiro… que seus tiros sejam melhores em outros servidores.",
    "🪦 Um a menos pra culpar quando der ruim.",
  ],
  randomActive: [
    "🧠 Lembrem-se: errar é humano… culpar o lag é Pavloviano.",
    "🎧 Já recarregou sua arma hoje? Se não, recarregue sua vida.",
    "🔫 Se você morreu 5 vezes seguidas, relaxa. O Perna também.",
    "👑 Lembrem-se: no mundo de Pavlov, Akemi é lei. Obedeça ou exploda.",
    "🎮 O servidor não perdoa. Mas a granada da Akemi persegue.",
  ],
  extras: {
    sundayNight: "☠️ Chega de paz, começa a guerra. Domingo é dia de Pavlov. Tiro, tática e treta.",
    friday: "🍻 Sextou no servidor! Hoje vale até errar e culpar o amigo.",
  }
};

// --- Funções da API Evolution ---
const evolutionAPI = axios.create({
  baseURL: EVOLUTION_API_URL,
  headers: {
    'apikey': EVOLUTION_API_KEY,
    'Content-Type': 'application/json'
  }
});

async function sendMessageToGroup(messageText, recipientJid = TARGET_GROUP_ID) {
  try {
    await evolutionAPI.post(`/message/sendText/${INSTANCE_NAME}`, {
      number: recipientJid,
      text: messageText,
    });
  } catch (error) {
    console.error(`Erro ao enviar mensagem de texto para ${recipientJid}:`, error.response ? error.response.data : error.message);
  }
}

async function sendNarratedAudio(audioUrlOrBase64, recipientJid = TARGET_GROUP_ID, options = {}) {
  try {
    await evolutionAPI.post(`/message/sendWhatsAppAudio/${INSTANCE_NAME}`, {
      number: recipientJid,
      audio: audioUrlOrBase64,
      ...options
    });
    console.log(`Áudio narrado enviado para ${recipientJid}`);
  } catch (error) {
    console.error(`Erro ao enviar áudio narrado para ${recipientJid}:`, error.response ? error.response.data : error.message);
  }
}

async function sendPoll(pollName, pollValues, recipientJid = TARGET_GROUP_ID, selectableCount = 1, options = {}) {
  try {
    await evolutionAPI.post(`/message/sendPoll/${INSTANCE_NAME}`, {
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
    await evolutionAPI.post(`/group/updateGroupSubject/${INSTANCE_NAME}`,
      { subject: newSubject },
      { params: { groupJid: TARGET_GROUP_ID } }
    );
    console.log(`Nome do grupo alterado para: ${newSubject}`);
  } catch (error) {
    console.error("Erro ao alterar nome do grupo:", error.response ? error.response.data : error.message);
  }
}

async function getGroupMetadata(groupId) {
  try {
    const response = await evolutionAPI.get(`/group/findGroupInfos/${INSTANCE_NAME}`, {
        params: { groupJid: groupId }
    });
    if (response.data && (response.data.participants || (Array.isArray(response.data) && response.data[0]?.participants) ) ) {
        if(response.data.participants) return response.data;
        if(Array.isArray(response.data) && response.data.length > 0 && response.data[0].participants) return response.data[0];
    }
    console.warn(`findGroupInfos não retornou dados para ${groupId} ou estrutura inesperada. Tentando fetchAllGroups...`);
    const fallbackResponse = await evolutionAPI.get(`/group/fetchAllGroups/${INSTANCE_NAME}`, {
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
function getStatusTimeParts(timeStr) {
    if (!timeStr || !timeStr.includes(':')) {
        console.error(`Formato de hora inválido no .env: "${timeStr}". Usando 00:00 como padrão.`);
        return { hour: 0, minute: 0};
    }
    const parts = timeStr.split(':');
    const hour = parseInt(parts[0]);
    const minute = parseInt(parts[1]);
    if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        console.error(`Valores de hora/minuto inválidos em "${timeStr}". Usando 00:00 como padrão.`);
        return { hour: 0, minute: 0 };
    }
    return { hour, minute };
}

let openTimeDetails, closeTimeDetails, oneHourBeforeOpenTimeDetails;

function initializeTimeDetails() {
    openTimeDetails = getStatusTimeParts(SERVER_OPEN_TIME);
    closeTimeDetails = getStatusTimeParts(SERVER_CLOSE_TIME);
    oneHourBeforeOpenTimeDetails = { ...openTimeDetails };
    oneHourBeforeOpenTimeDetails.hour -= 1;
    if (oneHourBeforeOpenTimeDetails.hour < 0) oneHourBeforeOpenTimeDetails.hour = 23;
}

async function updateServerStatus(status, messageToSend) {
  const newGroupName = `[${status}${GROUP_BASE_NAME}]`;
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
  serverOpenMessagesSent = MESSAGES_DURING_SERVER_OPEN;
}

async function triggerServerOpeningSoon() {
  console.log("ACIONADO: Aviso de 1h para abrir.");
  await updateServerStatus('🟡', messages.status.openingSoon);
}

// --- Lógica para Mensagens Aleatórias Espalhadas ---
let serverOpenMessagesSent = 0;
let daytimeMessagesSent = 0;
let serverOpenMessageTimeoutId = null;
let daytimeMessageTimeoutId = null;

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
  let messagesSent, totalMessages, timeoutIdToClear, windowDetails, logPrefix, statusCheckFn;

  if (type === 'serverOpen') {
    messagesSent = serverOpenMessagesSent; totalMessages = MESSAGES_DURING_SERVER_OPEN; timeoutIdToClear = serverOpenMessageTimeoutId;
    windowDetails = { start: openTimeDetails, end: closeTimeDetails }; logPrefix = "[MSG SRV]";
    statusCheckFn = () => currentServerStatus === '🟢';
  } else if (type === 'daytime') {
    messagesSent = daytimeMessagesSent; totalMessages = MESSAGES_DURING_DAYTIME; timeoutIdToClear = daytimeMessageTimeoutId;
    windowDetails = { start: { hour: DAYTIME_START_HOUR, minute: 0 }, end: { hour: DAYTIME_END_HOUR, minute: 0 } }; logPrefix = "[MSG DAY]";
    statusCheckFn = () => { const h = new Date().getHours(); return h >= DAYTIME_START_HOUR && h < DAYTIME_END_HOUR; };
  } else return;

  if (timeoutIdToClear) clearTimeout(timeoutIdToClear);
  if (!statusCheckFn() || messagesSent >= totalMessages) return;

  const remainingWindowMillis = getWindowMillis(windowDetails.start, windowDetails.end);
  if (remainingWindowMillis <= 0) return;

  const remainingMessages = Math.max(1, totalMessages - messagesSent);
  const avgDelayPerMessage = remainingWindowMillis / remainingMessages;
  const minDelayFactor = 0.3; const maxDelayFactor = 1.7;
  const minAbsDelay = (type === 'serverOpen' ? 5 : 15) * 60 * 1000;

  const minDelay = Math.max(minAbsDelay, avgDelayPerMessage * minDelayFactor);
  // Max delay não deve ser maior que o tempo restante na janela, menos uma pequena margem
  const maxDelay = Math.min(remainingWindowMillis - (1 * 60 * 1000), avgDelayPerMessage * maxDelayFactor);
  let delay = calculateRandomDelay(minDelay / (60 * 1000), maxDelay / (60 * 1000));
  delay = Math.max(delay, 1 * 60 * 1000); // Mínimo 1 minuto de delay absoluto

  if (delay <= 0 || delay > remainingWindowMillis) return;

  const nextSendTime = new Date(Date.now() + delay);
  // console.log(`${logPrefix} Próxima em ${Math.round(delay / 60000)} min (${nextSendTime.toLocaleTimeString('pt-BR', {timeZone: TIMEZONE})}). (${messagesSent + 1}/${totalMessages})`);

  const newTimeoutId = setTimeout(async () => {
    if (statusCheckFn()) {
      const randomMsg = getRandomElement(messages.randomActive);
      if (randomMsg) {
        await sendMessageToGroup(randomMsg);
        if (type === 'serverOpen') serverOpenMessagesSent++; else daytimeMessagesSent++;
        console.log(`${logPrefix} Enviada (${type === 'serverOpen' ? serverOpenMessagesSent : daytimeMessagesSent}/${totalMessages}): ${randomMsg.substring(0,30)}...`);
      }
      scheduleNextRandomMessage(type);
    }
  }, delay);

  if (type === 'serverOpen') serverOpenMessageTimeoutId = newTimeoutId;
  else daytimeMessageTimeoutId = newTimeoutId;
}

// --- Agendamentos Cron ---
const scheduledCronTasks = [];
function logScheduledCronTask(cronExpression, description, messageOrAction, taskFn) {
  const job = cron.schedule(cronExpression, taskFn, { timezone: TIMEZONE, scheduled: false });
  scheduledCronTasks.push({ job, description, cronExpression, messageOrAction, originalTaskFn: taskFn });
}

function setupCronJobs() {
    scheduledCronTasks.forEach(task => task.job.stop());
    scheduledCronTasks.length = 0;

    logScheduledCronTask(`${oneHourBeforeOpenTimeDetails.minute} ${oneHourBeforeOpenTimeDetails.hour} * * *`, "Aviso: 1h para abrir", messages.status.openingSoon, triggerServerOpeningSoon);
    logScheduledCronTask(`${openTimeDetails.minute} ${openTimeDetails.hour} * * *`, "Servidor Aberto", messages.status.open, triggerServerOpen);
    logScheduledCronTask(`${closeTimeDetails.minute} ${closeTimeDetails.hour} * * *`, "Servidor Fechado", messages.status.closed, triggerServerClose);
    logScheduledCronTask(`0 ${DAYTIME_START_HOUR} * * *`, "Início Msgs Diurnas", "Iniciar ciclo de mensagens aleatórias diurnas", () => {
      daytimeMessagesSent = 0; if (daytimeMessageTimeoutId) clearTimeout(daytimeMessageTimeoutId); scheduleNextRandomMessage('daytime');
    });
    logScheduledCronTask(`0 ${DAYTIME_END_HOUR} * * *`, "Fim Msgs Diurnas", "Parar ciclo de mensagens aleatórias diurnas", () => {
      if (daytimeMessageTimeoutId) clearTimeout(daytimeMessageTimeoutId); daytimeMessagesSent = MESSAGES_DURING_DAYTIME;
    });
    logScheduledCronTask('0 20 * * 0', "Mensagem Dominical", messages.extras.sundayNight, async () => { await sendMessageToGroup(messages.extras.sundayNight); });
    logScheduledCronTask('0 18 * * 5', "Mensagem de Sexta", messages.extras.friday, async () => { await sendMessageToGroup(messages.extras.friday); });
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


    await updateServerStatus(initialStatus, null);
    console.log(`Status inicial do bot definido para: ${initialStatus}`);

    if (initialStatus === '🟢') {
        serverOpenMessagesSent = 0;
        scheduleNextRandomMessage('serverOpen');
    }
    const currentHourNow = new Date().getHours();
    if (currentHourNow >= DAYTIME_START_HOUR && currentHourNow < DAYTIME_END_HOUR) {
        daytimeMessagesSent = 0;
        scheduleNextRandomMessage('daytime');
    }
}

// --- Servidor Webhook ---
const express = require('express');
const app = express();
app.use(express.json());



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
  
  // --- Função para checar se um usuário é administrador (mantida igual ao original) ---
  async function isUserAdmin(groupId, userId) {
    const groupInfo = await getGroupMetadata(groupId);
    if (groupInfo && groupInfo.participants) {
      const userInfo = groupInfo.participants.find(
        p => p.id === userId || p.jid === userId
      );
      if (userInfo) {
        return (
          userInfo.admin === 'admin' ||
          userInfo.admin === 'superadmin' ||
          userInfo.isSuperAdmin === true ||
          userInfo.isAdmin === true ||
          userInfo.adminLevel > 0
        );
      }
    }
    console.warn(
      `Metadados/participantes não encontrados para grupo ${groupId} ou usuário ${userId} não encontrado.`
    );
    return false;
  }

  app.post('/webhook', (req, res, next) => {
    const payload = req.body;
    const event = (payload.event || '').toLowerCase();
  
    // Mapeia event → rota interna
    if (event === 'messages.upsert') {
      // Chama internamente /webhook/messages-upsert
      return app._router.handle(req, res, next, '/webhook/messages-upsert');
    }
    if (event === 'group.participants.update') {
      return app._router.handle(req, res, next, '/webhook/group-participants-update');
    }
    // Caso nenhum case, devolve 200 normal
    return res.status(200).send('Evento não mapeado ou não habilitado.');
  });
  

  app.post('/webhook/messages-upsert', async (req, res) => {
    const payload = req.body;
    const data = payload.data;
  
    // Salva o payload em payloads.json (auditoria/debug)
    try {
      const timestamp = new Date().toISOString();
      fs.appendFileSync(
        'payloads.json',
        JSON.stringify({ timestamp, payload }, null, 2) + ',\n'
      );
      console.log("Payload messages.upsert salvo em payloads.json");
    } catch (error) {
      console.error("Erro ao salvar payload messages.upsert:", error);
    }
  
    // Se não houver data, ou não for a partir do grupo alvo, ou for mensagem do bot, ignora
    if (
      !data ||
      data.key.remoteJid !== TARGET_GROUP_ID ||
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
      const isAdmin = await isUserAdmin(TARGET_GROUP_ID, senderJid);
      if (isAdmin) {
        if (command === '!teste') {
          await sendMessageToGroup("Testado por admin!", TARGET_GROUP_ID);
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
          await sendMessageToGroup("Agendamentos automáticos de status REATIVADOS.", TARGET_GROUP_ID);
          console.log("Agendamentos automáticos de status REATIVADOS.");
        }
      } else {
        await sendMessageToGroup(
          "Desculpe, apenas administradores podem usar este comando.",
          senderJid
        );
      }
    }
    // Comando para enviar mensagem aleatória
    else if (command === '!random') {
      const randomMsg = getRandomElement(messages.randomActive);
      if (randomMsg) await sendMessageToGroup(randomMsg);
    }
    // Comando para criar enquete fixa
    else if (command === '!jogar?') {
      const pollTitle = "Quem vai jogar Pavlov hoje?";
      const pollOptions = ["Eu! 👍", "Talvez mais tarde 🤔", "Hoje não 👎"];
      await sendPoll(pollTitle, pollOptions, TARGET_GROUP_ID, pollOptions.length);
    }
    // Comando para enviar áudio narrado
    else if (command === '!audio' && args.length > 0) {
      const audioUrl = args[0];
      if (audioUrl.startsWith('http')) {
        await sendNarratedAudio(audioUrl, TARGET_GROUP_ID);
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
        await sendPoll(pollTitle, pollOptions, TARGET_GROUP_ID, pollOptions.length);
      } else {
        await sendMessageToGroup('Uso: !enquete "Título" "Opção1" "Opção2" ...', senderJid);
      }
    }
  
    return res.status(200).send('messages.upsert processado.');
  });
  

  app.post('/webhook/group-participants-update', async (req, res) => {
    const payload = req.body;
    const data = payload.data;
  
    // Salva o payload em payloads.json (auditoria/debug)
    try {
      const timestamp = new Date().toISOString();
      fs.appendFileSync(
        'payloads.json',
        JSON.stringify({ timestamp, payload }, null, 2) + ',\n'
      );
      console.log("Payload group.participants.update salvo em payloads.json");
    } catch (error) {
      console.error("Erro ao salvar payload group.participants.update:", error);
    }
  
    // Verifica se é o grupo correto e se há participantes
    if (
      data &&
      (data.id === TARGET_GROUP_ID || data.chatId === TARGET_GROUP_ID) &&
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
    const payload = req.body;
    console.log("Evento connection.update recebido:", JSON.stringify(payload, null, 2));
    // Aqui você pode fazer lógica extra, p.ex. notificar status de conexão
    return res.status(200).send('connection.update processado.');
  });
// --- Iniciar o Bot ---
async function startBot() {
  console.log("Iniciando o bot Pavlov...");
  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !INSTANCE_NAME || !TARGET_GROUP_ID || !SERVER_OPEN_TIME || !SERVER_CLOSE_TIME || !BOT_WEBHOOK_PORT) {
    console.error("ERRO: Variáveis de ambiente cruciais não definidas. Verifique .env (URL, KEY, INSTANCE, GROUP_ID, OPEN_TIME, CLOSE_TIME, BOT_WEBHOOK_PORT)");
    process.exit(1);
  }

  initializeTimeDetails();
  setupCronJobs();
  await initializeBotStatus();

  console.log("\n--- AGENDAMENTOS CRON ATIVOS ---");
  const nowForCronDisplay = new Date();
  scheduledCronTasks.forEach(task => {
    task.job.start();
    let nextRunDisplay = "N/A";
    try {
      if (cronParser) {
        const interval = cronParser.parseExpression(task.cronExpression, { currentDate: nowForCronDisplay, tz: TIMEZONE });
        nextRunDisplay = interval.next().toDate().toLocaleString('pt-BR', { timeZone: TIMEZONE });
      } else if (task.job.nextDates) {
        const nextDates = task.job.nextDates(1); if (nextDates && nextDates.length > 0) nextRunDisplay = nextDates[0].toLocaleString('pt-BR', { timeZone: TIMEZONE });
      }
    } catch (e) { nextRunDisplay = `(Erro: ${e.message.substring(0,20)}...)`; }
    let msgPrev = typeof task.messageOrAction === 'string' ? task.messageOrAction : 'Ação programada';
    if (msgPrev.length > 60) msgPrev = msgPrev.substring(0, 57) + "...";
    console.log(`- Tarefa: ${task.description}\n  Próxima: ${nextRunDisplay}\n  Msg/Ação: ${msgPrev}\n  Cron: ${task.cronExpression}\n`);
  });
  console.log("--------------------------------\n");

  app.listen(BOT_WEBHOOK_PORT, () => {
    console.log(`Servidor de webhook escutando na porta ${BOT_WEBHOOK_PORT}`);
    console.log(`Configure o webhook na Evolution API para: http://SEU_IP_OU_DOMINIO:${BOT_WEBHOOK_PORT}/webhook`);
    console.log("Eventos Webhook: 'messages.upsert' e 'GROUP_PARTICIPANTS_UPDATE'.");
  });

  console.log("Bot Pavlov iniciado e agendamentos configurados.");
  console.log(`Grupo: ${TARGET_GROUP_ID}`);
  console.log(`Servidor abre: ${SERVER_OPEN_TIME}, Fecha: ${SERVER_CLOSE_TIME} (Fuso: ${TIMEZONE})`);
  console.log(`Msgs diurnas: ${DAYTIME_START_HOUR}:00 - ${DAYTIME_END_HOUR}:00 (Fuso: ${TIMEZONE})`);
}

startBot();