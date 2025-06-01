// bot.js
require('dotenv').config();
const axios = require('axios');
const cron = require('node-cron');
const { getRandomElement } = require('./utils'); // Assumindo que utils.js existe conforme antes
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
  SERVER_OPEN_TIME, // Ex: "19:00"
  SERVER_CLOSE_TIME, // Ex: "23:00" ou "02:00" para o dia seguinte
} = process.env;

const GROUP_BASE_NAME = "BRASIL PAVLOV SND";
const PLAYER_COUNT_PLACEHOLDER = "X/24"; // Mantenha como está ou ajuste
const MESSAGES_DURING_SERVER_OPEN = 4;
const MESSAGES_DURING_DAYTIME = 4;
const DAYTIME_START_HOUR = 8; // 08:00
const DAYTIME_END_HOUR = 17; // 17:00
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

async function sendMessageToGroup(message, recipientJid = TARGET_GROUP_ID) {
  try {
    // console.log(`Enviando mensagem para ${recipientJid}: ${message}`); // Descomente para debug de envio
    await evolutionAPI.post(`/message/sendText/${INSTANCE_NAME}`, {
      number: recipientJid,
      options: { delay: 1200, presence: "composing" },
      textMessage: { text: message },
    });
    // console.log("Mensagem enviada com sucesso."); // Descomente para debug de envio
  } catch (error) {
    console.error(`Erro ao enviar mensagem para ${recipientJid}:`, error.response ? error.response.data : error.message);
  }
}

async function setGroupName(name) {
  try {
    console.log(`Alterando nome do grupo ${TARGET_GROUP_ID} para: ${name}`);
    await evolutionAPI.put(`/group/updateSubject/${INSTANCE_NAME}`, {
      subject: name,
      groupId: TARGET_GROUP_ID,
    });
    console.log("Nome do grupo alterado com sucesso.");
  } catch (error) {
    console.error("Erro ao alterar nome do grupo:", error.response ? error.response.data : error.message);
  }
}

async function getGroupMetadata(groupId) {
  try {
    // Tente este endpoint primeiro, costuma ser mais direto para um grupo específico
    const response = await evolutionAPI.get(`/group/findGroupInfo/${INSTANCE_NAME}`, {
        params: { groupId: groupId }
    });
    if (response.data && response.data.participants) {
        return response.data;
    }
    // Fallback para fetchAllGroups se o acima falhar ou não existir na sua versão da API
    console.warn(`findGroupInfo não retornou dados para ${groupId}. Tentando fetchAllGroups...`);
    const fallbackResponse = await evolutionAPI.get(`/group/fetchAllGroups/${INSTANCE_NAME}?getParticipants=true`);
    if (fallbackResponse.data && Array.isArray(fallbackResponse.data)) {
        const group = fallbackResponse.data.find(g => g.id === groupId);
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
let currentServerStatus = '🔴'; // Estado inicial (fechado)

function getStatusTimeParts(timeStr) { // "HH:MM"
  const [hour, minute] = timeStr.split(':').map(Number);
  return { hour, minute };
}

const openTimeDetails = getStatusTimeParts(SERVER_OPEN_TIME);
const closeTimeDetails = getStatusTimeParts(SERVER_CLOSE_TIME);

const oneHourBeforeOpenTimeDetails = { ...openTimeDetails };
oneHourBeforeOpenTimeDetails.hour -= 1;
if (oneHourBeforeOpenTimeDetails.hour < 0) { // Caso abra 00:xx e 1h antes seja 23:xx do dia anterior
  oneHourBeforeOpenTimeDetails.hour = 23;
}

async function updateServerStatus(status, messageToSend) {
  const newGroupName = `[${status}${GROUP_BASE_NAME} ${PLAYER_COUNT_PLACEHOLDER}]`;
  await setGroupName(newGroupName);
  if (messageToSend) {
    await sendMessageToGroup(messageToSend);
  }
  currentServerStatus = status;
  console.log(`Status do servidor atualizado para: ${status}`);
}

// --- Lógica para Mensagens Aleatórias Espalhadas ---
let serverOpenMessagesSent = 0;
let daytimeMessagesSent = 0;
let serverOpenMessageTimeoutId = null;
let daytimeMessageTimeoutId = null;

function calculateRandomDelay(minMinutes, maxMinutes) {
    return (Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes) * 60 * 1000; // em milissegundos
}

function getWindowMillis(startTimeDetails, endTimeDetails) {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setHours(startTimeDetails.hour, startTimeDetails.minute, 0, 0);

    const endDate = new Date(now);
    endDate.setHours(endTimeDetails.hour, endTimeDetails.minute, 0, 0);

    // Se a janela cruza a meia-noite (ex: abre 22:00, fecha 02:00)
    if (endDate < startDate) {
        // Se a hora atual está DEPOIS da abertura E ANTES da meia-noite
        // OU se a hora atual está DEPOIS da meia-noite E ANTES do fechamento
        if ((now >= startDate) || (now < endDate)) {
            endDate.setDate(endDate.getDate() + 1); // Janela termina no dia seguinte
        } else {
            // Fora da janela que cruza a meia-noite (ex: são 15:00, janela é 22:00-02:00)
            return 0;
        }
    }
    // Se a hora atual está fora da janela (que não cruza a meia-noite)
    if (now < startDate || now >= endDate) {
        return 0;
    }

    // Calcula o tempo restante na janela a partir de AGORA
    const remainingWindow = endDate.getTime() - now.getTime();
    return remainingWindow > 0 ? remainingWindow : 0;
}


async function scheduleNextRandomMessage(type) {
  let messagesSent, totalMessages, timeoutId, windowDetails, logPrefix, statusCheck;

  if (type === 'serverOpen') {
    messagesSent = serverOpenMessagesSent;
    totalMessages = MESSAGES_DURING_SERVER_OPEN;
    timeoutId = serverOpenMessageTimeoutId;
    windowDetails = { start: openTimeDetails, end: closeTimeDetails };
    logPrefix = "[MSG SRV]";
    statusCheck = () => currentServerStatus === '🟢';
  } else if (type === 'daytime') {
    messagesSent = daytimeMessagesSent;
    totalMessages = MESSAGES_DURING_DAYTIME;
    timeoutId = daytimeMessageTimeoutId;
    windowDetails = { start: { hour: DAYTIME_START_HOUR, minute: 0 }, end: { hour: DAYTIME_END_HOUR, minute: 0 } };
    logPrefix = "[MSG DAY]";
    statusCheck = () => {
        const currentHour = new Date().getHours();
        return currentHour >= DAYTIME_START_HOUR && currentHour < DAYTIME_END_HOUR;
    };
  } else {
    return;
  }

  if (timeoutId) clearTimeout(timeoutId);

  if (!statusCheck() || messagesSent >= totalMessages) {
    // console.log(`${logPrefix} Não agendando mais (status: ${statusCheck()}, msgs: ${messagesSent}/${totalMessages})`);
    return;
  }

  const remainingWindowMillis = getWindowMillis(windowDetails.start, windowDetails.end);

  if (remainingWindowMillis <= 0) {
    // console.log(`${logPrefix} Janela fechada ou inválida para agendar.`);
    return;
  }

  const remainingMessages = Math.max(1, totalMessages - messagesSent);
  const avgDelayPerMessage = remainingWindowMillis / remainingMessages;
  // Define min/max delay para evitar envios muito rápidos ou muito espaçados no final
  const minDelay = Math.max( (type === 'serverOpen' ? 5 : 15) * 60 * 1000, avgDelayPerMessage * 0.3); // min 5min (server), 15min (day)
  const maxDelay = Math.min(remainingWindowMillis, avgDelayPerMessage * 1.7); // Não exceder o tempo restante
  let delay = calculateRandomDelay(minDelay / (60 * 1000), maxDelay / (60 * 1000));
  delay = Math.min(delay, remainingWindowMillis - (1 * 60 * 1000)); // Garante que haja tempo para enviar
  delay = Math.max(delay, 1 * 60 * 1000); // Mínimo de 1 minuto de delay

  if (delay <= 0) {
    // console.log(`${logPrefix} Delay calculado inválido ou muito curto.`);
    return;
  }

  const nextSendTime = new Date(Date.now() + delay);
  console.log(`${logPrefix} Próxima em ${Math.round(delay / 60000)} min (${nextSendTime.toLocaleTimeString('pt-BR', {timeZone: TIMEZONE})}). (${messagesSent + 1}/${totalMessages})`);

  const newTimeoutId = setTimeout(async () => {
    if (statusCheck()) { // Re-verifica o status antes de enviar
      const randomMsg = getRandomElement(messages.randomActive);
      if (randomMsg) {
        await sendMessageToGroup(randomMsg);
        if (type === 'serverOpen') serverOpenMessagesSent++; else daytimeMessagesSent++;
        console.log(`${logPrefix} Enviada (${type === 'serverOpen' ? serverOpenMessagesSent : daytimeMessagesSent}/${totalMessages}): ${randomMsg.substring(0,30)}...`);
      }
      scheduleNextRandomMessage(type); // Reagenda
    }
  }, delay);

  if (type === 'serverOpen') serverOpenMessageTimeoutId = newTimeoutId;
  else daytimeMessageTimeoutId = newTimeoutId;
}

// --- Agendamentos Cron ---
const scheduledCronTasks = [];

function logScheduledCronTask(cronExpression, description, messageOrAction, taskFn) {
  const job = cron.schedule(cronExpression, taskFn, { timezone: TIMEZONE, scheduled: false });
  scheduledCronTasks.push({ job, description, cronExpression, messageOrAction });
}

logScheduledCronTask(`${oneHourBeforeOpenTimeDetails.minute} ${oneHourBeforeOpenTimeDetails.hour} * * *`, "Aviso: 1h para abrir", messages.status.openingSoon, async () => {
  console.log("CRON: 1 hora para abrir servidor.");
  await updateServerStatus('🟡', messages.status.openingSoon);
});

logScheduledCronTask(`${openTimeDetails.minute} ${openTimeDetails.hour} * * *`, "Servidor Aberto", messages.status.open, async () => {
  console.log("CRON: Servidor aberto.");
  await updateServerStatus('🟢', messages.status.open);
  serverOpenMessagesSent = 0;
  if (serverOpenMessageTimeoutId) clearTimeout(serverOpenMessageTimeoutId);
  console.log("Iniciando ciclo de mensagens aleatórias do servidor aberto.");
  scheduleNextRandomMessage('serverOpen');
});

logScheduledCronTask(`${closeTimeDetails.minute} ${closeTimeDetails.hour} * * *`, "Servidor Fechado", messages.status.closed, async () => {
  console.log("CRON: Servidor fechado.");
  await updateServerStatus('🔴', messages.status.closed);
  if (serverOpenMessageTimeoutId) {
    clearTimeout(serverOpenMessageTimeoutId);
    serverOpenMessageTimeoutId = null;
  }
  serverOpenMessagesSent = MESSAGES_DURING_SERVER_OPEN; // Marca como concluído
});

logScheduledCronTask(`0 ${DAYTIME_START_HOUR} * * *`, "Início Msgs Diurnas", "Iniciar ciclo de mensagens aleatórias diurnas", () => {
  console.log("CRON: Início do horário diurno para mensagens aleatórias.");
  daytimeMessagesSent = 0;
  if (daytimeMessageTimeoutId) clearTimeout(daytimeMessageTimeoutId);
  scheduleNextRandomMessage('daytime');
});

logScheduledCronTask(`0 ${DAYTIME_END_HOUR} * * *`, "Fim Msgs Diurnas", "Parar ciclo de mensagens aleatórias diurnas", () => {
  console.log("CRON: Fim do horário diurno para mensagens aleatórias.");
  if (daytimeMessageTimeoutId) {
    clearTimeout(daytimeMessageTimeoutId);
    daytimeMessageTimeoutId = null;
  }
  daytimeMessagesSent = MESSAGES_DURING_DAYTIME; // Marca como concluído
});

logScheduledCronTask('0 20 * * 0', "Mensagem Dominical", messages.extras.sundayNight, async () => {
  await sendMessageToGroup(messages.extras.sundayNight);
});

logScheduledCronTask('0 18 * * 5', "Mensagem de Sexta", messages.extras.friday, async () => {
  await sendMessageToGroup(messages.extras.friday);
});


// --- Inicialização do Bot e Status ---
async function initializeBotStatus() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    let initialStatus = '🔴'; // Padrão fechado

    const openH = openTimeDetails.hour;
    const openM = openTimeDetails.minute;
    const closeH = closeTimeDetails.hour;
    const closeM = closeTimeDetails.minute;
    const oneHourBeforeOpenH = oneHourBeforeOpenTimeDetails.hour;
    const oneHourBeforeOpenM = oneHourBeforeOpenTimeDetails.minute;

    // Verifica se está no período "1h antes de abrir"
    if (currentHour === oneHourBeforeOpenH && currentMinute >= oneHourBeforeOpenM) {
        initialStatus = '🟡';
    } else if ( (openH < closeH) || (openH === closeH && openM < closeM) ) { // Abre e fecha no mesmo dia
        if (currentHour > openH || (currentHour === openH && currentMinute >= openM)) {
            if (currentHour < closeH || (currentHour === closeH && currentMinute < closeM)) {
                initialStatus = '🟢';
            }
        }
        // Se 1h antes for em um dia e abertura no outro (ex: 1h antes 23:xx, abre 00:xx)
        if (oneHourBeforeOpenH > openH && currentHour === oneHourBeforeOpenH && currentMinute >= oneHourBeforeOpenM){
             initialStatus = '🟡';
        } else if (oneHourBeforeOpenH > openH && currentHour > oneHourBeforeOpenH){ // Caso já passou da 1h antes e ainda não abriu
             initialStatus = '🟡';
        }


    } else { // Abre num dia e fecha no outro (ex: abre 22:00, fecha 02:00)
        if ( (currentHour > openH || (currentHour === openH && currentMinute >= openM)) || // Depois da abertura hoje
             (currentHour < closeH || (currentHour === closeH && currentMinute < closeM)) ) { // Ou antes do fechamento "amanhã"
            initialStatus = '🟢';
        }
        // Se 1h antes for antes da meia noite e a abertura depois
        if (oneHourBeforeOpenH < 24 && openH === 0 && currentHour === oneHourBeforeOpenH && currentMinute >= oneHourBeforeOpenM){
            initialStatus = '🟡';
        }
    }


    // Ajuste final para garantir que se estiver 1h antes, seja amarelo
    // Esta condição verifica se a hora atual está entre "1h antes de abrir" e "abrir"
    const timeNow = currentHour * 60 + currentMinute;
    const timeOneHourBefore = oneHourBeforeOpenH * 60 + oneHourBeforeOpenM;
    const timeOpen = openH * 60 + openM;

    if (timeOneHourBefore <= timeOpen) { // Normal (1h antes e abrir no mesmo dia ou 1h antes < abrir)
        if (timeNow >= timeOneHourBefore && timeNow < timeOpen) {
            initialStatus = '🟡';
        }
    } else { // 1h antes é no dia anterior (ex: 1h antes 23:00, abrir 00:00)
        if (timeNow >= timeOneHourBefore || timeNow < timeOpen) { // Se for depois de 1h antes OU antes de abrir (já no dia seguinte)
            initialStatus = '🟡';
        }
    }
    // Se acabou de passar do horário de abertura, e o status ainda está amarelo, força verde.
    if(initialStatus === '🟡' && (currentHour > openH || (currentHour === openH && currentMinute >= openM)) ){
        // Mas precisa verificar se não passou do fechamento também, no caso de fechar no mesmo dia
        if(openH <= closeH){ // mesmo dia
            if(currentHour < closeH || (currentHour === closeH && currentMinute < closeM) ){
                 initialStatus = '🟢';
            }
        } else { // fecha no dia seguinte
             initialStatus = '🟢';
        }
    }


    await updateServerStatus(initialStatus, null); // Não envia msg ao iniciar
    console.log(`Status inicial do bot definido para: ${initialStatus}`);

    // Inicia ciclos de mensagens se estiver dentro das janelas ao iniciar o bot
    if (initialStatus === '🟢') {
        serverOpenMessagesSent = 0;
        console.log("Bot iniciado com servidor aberto, iniciando ciclo de mensagens do servidor.");
        scheduleNextRandomMessage('serverOpen');
    }
    const currentHourNow = new Date().getHours();
    if (currentHourNow >= DAYTIME_START_HOUR && currentHourNow < DAYTIME_END_HOUR) {
        daytimeMessagesSent = 0;
        console.log("Bot iniciado durante horário diurno, iniciando ciclo de mensagens diurnas.");
        scheduleNextRandomMessage('daytime');
    }
}

// --- Servidor Webhook ---
const express = require('express'); // Necessário para o app Express
const app = express();
app.use(express.json()); // Para parsear o corpo JSON das requisições

app.post('/webhook', async (req, res) => {
  const payload = req.body;
  // console.log('Webhook recebido:', JSON.stringify(payload, null, 2)); // Para debug intenso

  const event = payload.event;
  const data = payload.data;

  // Tratamento do comando !teste
  if (event === 'messages.upsert' && data && data.key && data.key.remoteJid === TARGET_GROUP_ID) {
    const messageContent = data.message?.conversation || data.message?.extendedTextMessage?.text || "";
    const senderJid = data.key?.participant || data.key?.remoteJid; // participant se msg de grupo

    if (messageContent.trim().toLowerCase() === '!teste') {
      console.log(`Comando !teste recebido de ${senderJid} no grupo ${TARGET_GROUP_ID}`);
      const groupInfo = await getGroupMetadata(TARGET_GROUP_ID);
      if (groupInfo && groupInfo.participants) {
        const senderInfo = groupInfo.participants.find(p => p.id === senderJid);
        // A condição de admin pode variar: senderInfo.admin === 'admin', senderInfo.isAdmin === true, etc.
        // Verifique a estrutura do seu payload de participante.
        const isAdmin = senderInfo && (senderInfo.admin === 'admin' || senderInfo.admin === 'superadmin' || senderInfo.isSuperAdmin === true || senderInfo.isAdmin === true);

        if (isAdmin) {
          await sendMessageToGroup("Testado!", TARGET_GROUP_ID);
        } else {
          console.log(`Comando !teste de ${senderJid} ignorado (não é admin).`);
        }
      } else {
        console.log("Não foi possível verificar status de admin para o comando !teste (metadados do grupo não obtidos).");
      }
      return res.status(200).send('Comando !teste processado.'); // Finaliza aqui para o comando
    }
  }

  // Tratamento de entrada/saída de membros (usando GROUP_PARTICIPANTS_UPDATE)
  // O ID do grupo pode vir em diferentes lugares dependendo do evento.
  const groupIdFromPayload = data?.id || data?.chat?.id || data?.chatId || payload.groupId || (data?.key?.remoteJid === TARGET_GROUP_ID ? TARGET_GROUP_ID : null);

  // Filtra para eventos que não são do grupo alvo, exceto messages.upsert que já foi tratado
  if (event !== 'messages.upsert' && groupIdFromPayload !== TARGET_GROUP_ID) {
    // console.log(`Evento ${event} ignorado: não é do grupo alvo ou já tratado.`);
    return res.status(200).send('Evento ignorado: não é do grupo alvo ou já tratado.');
  }

  if (event === 'GROUP_PARTICIPANTS_UPDATE') { // Ou o nome do evento correto da sua API
    // 'data' aqui deve ser o payload específico do GROUP_PARTICIPANTS_UPDATE
    const action = data?.action; // Ex: "add", "remove", "leave"
    const participants = data?.participants; // Array de JIDs

    if (!action || !participants || participants.length === 0) {
      console.log("GROUP_PARTICIPANTS_UPDATE recebido, mas sem ação ou participantes claros.", data);
      return res.status(200).send('Payload de atualização de participantes incompleto.');
    }

    console.log(`Ação no grupo (${TARGET_GROUP_ID}): ${action}, Participantes: ${participants.join(', ')}`);

    if (action === 'add') {
      console.log("Novo membro detectado pela ação 'add'.");
      const welcomeMsg = getRandomElement(messages.newMember);
      if (welcomeMsg) await sendMessageToGroup(welcomeMsg);
    } else if (action === 'remove' || action === 'leave') {
      console.log(`Membro saiu/foi removido pela ação '${action}'.`);
      const farewellMsg = getRandomElement(messages.memberLeft);
      if (farewellMsg) await sendMessageToGroup(farewellMsg);
    }
  }

  res.status(200).send('Webhook processado');
});


// --- Iniciar o Bot ---
async function startBot() {
  console.log("Iniciando o bot Pavlov...");

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !INSTANCE_NAME || !TARGET_GROUP_ID || !SERVER_OPEN_TIME || !SERVER_CLOSE_TIME) {
    console.error("ERRO: Variáveis de ambiente cruciais não definidas. Verifique seu arquivo .env (URL, KEY, INSTANCE, GROUP_ID, OPEN_TIME, CLOSE_TIME)");
    process.exit(1);
  }

  await initializeBotStatus();

  console.log("\n--- AGENDAMENTOS CRON ATIVOS ---");
  const nowForCronDisplay = new Date();
  scheduledCronTasks.forEach(task => {
    task.job.start(); // Inicia o job do cron
    let nextRunDisplay = "Próxima execução não disponível";
    try {
      if (cronParser) {
        const interval = cronParser.parseExpression(task.cronExpression, { currentDate: nowForCronDisplay, tz: TIMEZONE });
        nextRunDisplay = interval.next().toDate().toLocaleString('pt-BR', { timeZone: TIMEZONE });
      } else if (task.job.nextDates) { // Fallback para node-cron
        const nextDates = task.job.nextDates(1);
        if (nextDates && nextDates.length > 0) {
          nextRunDisplay = nextDates[0].toLocaleString('pt-BR', { timeZone: TIMEZONE });
        }
      }
    } catch (e) {
      nextRunDisplay = `(Erro ao calcular: ${e.message.substring(0,30)}...)`;
    }

    let messagePreview = typeof task.messageOrAction === 'string' ? task.messageOrAction : 'Ação complexa programada';
    if (messagePreview.length > 70) {
        messagePreview = messagePreview.substring(0, 67) + "...";
    }

    console.log(`- Tarefa: ${task.description}`);
    console.log(`  Próxima: ${nextRunDisplay}`);
    console.log(`  Mensagem/Ação: ${messagePreview}`);
    console.log(`  Expressão Cron: ${task.cronExpression}\n`);
  });
  console.log("--------------------------------\n");

  app.listen(BOT_WEBHOOK_PORT, () => {
    console.log(`Servidor de webhook escutando na porta ${BOT_WEBHOOK_PORT}`);
    console.log(`Configure o webhook na Evolution API para: http://SEU_IP_OU_DOMINIO:${BOT_WEBHOOK_PORT}/webhook`);
    console.log("Eventos Webhook necessários: 'messages.upsert' (para comandos) e 'GROUP_PARTICIPANTS_UPDATE' (ou similar para membros).");
  });

  console.log("Bot Pavlov iniciado e agendamentos configurados.");
  console.log(`Controlando o grupo: ${TARGET_GROUP_ID}`);
  console.log(`Servidor abre: ${SERVER_OPEN_TIME}, Fecha: ${SERVER_CLOSE_TIME} (Fuso: ${TIMEZONE})`);
  console.log(`Msgs diurnas: ${DAYTIME_START_HOUR}:00 - ${DAYTIME_END_HOUR}:00 (Fuso: ${TIMEZONE})`);
}

// Arquivo utils.js (Crie este arquivo no mesmo diretório)
/*
// utils.js
function getRandomElement(arr) {
  if (!arr || arr.length === 0) {
    return null;
  }
  return arr[Math.floor(Math.random() * arr.length)];
}

module.exports = {
  getRandomElement,
};
*/

startBot();