// bot.js
require('dotenv').config();
const axios = require('axios');
const express = require('express');
const cron = require('node-cron');
const { getRandomElement } = require('./utils');

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

const GROUP_BASE_NAME = "BRASIL PAVLOV SND";
const PLAYER_COUNT_PLACEHOLDER = "X/24"; // Mantenha como está ou ajuste

// Novas constantes para mensagens aleatórias
const MESSAGES_DURING_SERVER_OPEN = 4;
const MESSAGES_DURING_DAYTIME = 4;
const DAYTIME_START_HOUR = 8; // 08:00
const DAYTIME_END_HOUR = 17; // 17:00

// --- Mensagens (sem alterações aqui) ---
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

// --- Funções da API Evolution (sem alterações aqui) ---
const evolutionAPI = axios.create({
  baseURL: EVOLUTION_API_URL,
  headers: {
    'apikey': EVOLUTION_API_KEY,
    'Content-Type': 'application/json'
  }
});

async function sendMessageToGroup(message) {
  try {
    console.log(`Enviando mensagem para ${TARGET_GROUP_ID}: ${message}`);
    await evolutionAPI.post(`/message/sendText/${INSTANCE_NAME}`, {
      number: TARGET_GROUP_ID,
      options: { delay: 1200, presence: "composing" },
      textMessage: { text: message },
    });
    console.log("Mensagem enviada com sucesso.");
  } catch (error) {
    console.error("Erro ao enviar mensagem:", error.response ? error.response.data : error.message);
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

// --- Lógica de Status do Servidor ---
let currentServerStatus = '🔴';
function getStatusTimeParts(timeStr) {
  const [hour, minute] = timeStr.split(':').map(Number);
  return { hour, minute };
}
const openTime = getStatusTimeParts(SERVER_OPEN_TIME);
const closeTime = getStatusTimeParts(SERVER_CLOSE_TIME);
const oneHourBeforeOpenTime = { ...openTime };
oneHourBeforeOpenTime.hour -= 1;
if (oneHourBeforeOpenTime.hour < 0) oneHourBeforeOpenTime.hour = 23;

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
const TIMEZONE = "America/Sao_Paulo"; // Centralize o fuso horário

function calculateRandomDelay(minMinutes, maxMinutes) {
    return (Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes) * 60 * 1000; // em milissegundos
}

function getServerOpenWindowMillis() {
    const now = new Date();
    const openDate = new Date(now);
    openDate.setHours(openTime.hour, openTime.minute, 0, 0);
    const closeDate = new Date(now);
    closeDate.setHours(closeTime.hour, closeTime.minute, 0, 0);

    if (closeDate < openDate) { // Se fechar no dia seguinte (ex: abre 22:00 fecha 02:00)
        if (now < openDate && now > closeDate ) { // Estamos entre o fechamento e a proxima abertura (fechado)
             return 0;
        }
        if (now > openDate) { // abriu hoje, fecha amanha
            closeDate.setDate(closeDate.getDate() + 1);
        } else { // abriu ontem, fecha hoje
            openDate.setDate(openDate.getDate() -1);
        }
    }
    const totalWindow = closeDate.getTime() - openDate.getTime();
    return totalWindow > 0 ? totalWindow : 0;
}

function getDaytimeWindowMillis() {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setHours(DAYTIME_START_HOUR, 0, 0, 0);
    const endDate = new Date(now);
    endDate.setHours(DAYTIME_END_HOUR, 0, 0, 0);

    const totalWindow = endDate.getTime() - startDate.getTime();
    return totalWindow > 0 ? totalWindow : 0;
}


async function scheduleNextRandomMessage(type) {
  if (type === 'serverOpen') {
    if (serverOpenMessageTimeoutId) clearTimeout(serverOpenMessageTimeoutId); // Limpa timeout anterior
    if (currentServerStatus !== '🟢' || serverOpenMessagesSent >= MESSAGES_DURING_SERVER_OPEN) {
      console.log("Não agendando mais mensagens de servidor aberto (limite atingido ou servidor fechado).");
      return;
    }

    const serverWindowMillis = getServerOpenWindowMillis();
    if (serverWindowMillis <= 0) {
        console.log("Janela do servidor inválida para agendar mensagem.");
        return;
    }
    // Calcula um delay médio e adiciona alguma variação
    // Garante que não seja muito curto se faltarem poucas mensagens
    const remainingMessages = MESSAGES_DURING_SERVER_OPEN - serverOpenMessagesSent;
    const avgDelayPerMessage = serverWindowMillis / remainingMessages;
    const minDelay = Math.max(10 * 60 * 1000, avgDelayPerMessage * 0.5); // Pelo menos 10 min, ou 50% do delay medio
    const maxDelay = avgDelayPerMessage * 1.5; // Ate 150% do delay medio
    const delay = calculateRandomDelay(minDelay / (60 * 1000), maxDelay / (60*1000));


    // Verifica se o delay não ultrapassa o horário de fechamento
    const now = new Date();
    const closeDateTime = new Date(now);
    closeDateTime.setHours(closeTime.hour, closeTime.minute, 0, 0);
    // Se fechar no dia seguinte e agora for antes da meia noite
    if (closeTime.hour < openTime.hour && now.getHours() >= openTime.hour) {
        closeDateTime.setDate(closeDateTime.getDate() + 1);
    }


    if (now.getTime() + delay >= closeDateTime.getTime()) {
        console.log("Delay calculado ultrapassa o horário de fechamento do servidor. Não agendando.");
        return;
    }

    console.log(`Agendando próxima mensagem de servidor aberto em ${Math.round(delay / 60000)} minutos.`);
    serverOpenMessageTimeoutId = setTimeout(async () => {
      const randomMsg = getRandomElement(messages.randomActive);
      if (randomMsg) {
        await sendMessageToGroup(randomMsg);
        serverOpenMessagesSent++;
        console.log(`Mensagem de servidor aberto enviada (${serverOpenMessagesSent}/${MESSAGES_DURING_SERVER_OPEN}).`);
      }
      scheduleNextRandomMessage('serverOpen'); // Reagenda
    }, delay);

  } else if (type === 'daytime') {
    if (daytimeMessageTimeoutId) clearTimeout(daytimeMessageTimeoutId);
    const currentHour = new Date().getHours();
    if (currentHour < DAYTIME_START_HOUR || currentHour >= DAYTIME_END_HOUR || daytimeMessagesSent >= MESSAGES_DURING_DAYTIME) {
      console.log("Não agendando mais mensagens diurnas (limite atingido ou fora do horário).");
      return;
    }

    const daytimeWindowMillis = getDaytimeWindowMillis();
    if (daytimeWindowMillis <= 0) {
        console.log("Janela diurna inválida para agendar mensagem.");
        return;
    }
    const remainingMessages = MESSAGES_DURING_DAYTIME - daytimeMessagesSent;
    const avgDelayPerMessage = daytimeWindowMillis / remainingMessages;
    const minDelay = Math.max(30 * 60 * 1000, avgDelayPerMessage * 0.5); // Pelo menos 30 min
    const maxDelay = avgDelayPerMessage * 1.5;
    const delay = calculateRandomDelay(minDelay / (60 * 1000), maxDelay / (60 * 1000));

    const now = new Date();
    const daytimeEndDateTime = new Date(now);
    daytimeEndDateTime.setHours(DAYTIME_END_HOUR, 0, 0, 0);

    if (now.getTime() + delay >= daytimeEndDateTime.getTime()) {
        console.log("Delay calculado ultrapassa o horário de fim diurno. Não agendando.");
        return;
    }

    console.log(`Agendando próxima mensagem diurna em ${Math.round(delay / 60000)} minutos.`);
    daytimeMessageTimeoutId = setTimeout(async () => {
      const randomMsg = getRandomElement(messages.randomActive);
      if (randomMsg) {
        await sendMessageToGroup(randomMsg);
        daytimeMessagesSent++;
        console.log(`Mensagem diurna enviada (${daytimeMessagesSent}/${MESSAGES_DURING_DAYTIME}).`);
      }
      scheduleNextRandomMessage('daytime'); // Reagenda
    }, delay);
  }
}

// --- Agendamentos de Status e Início/Fim de Ciclos de Mensagens Aleatórias ---

// 🟡 Quando faltar 1h pra abrir
cron.schedule(`${oneHourBeforeOpenTime.minute} ${oneHourBeforeOpenTime.hour} * * *`, async () => {
  console.log("CRON: 1 hora para abrir");
  await updateServerStatus('🟡', messages.status.openingSoon);
}, { timezone: TIMEZONE });

// 🟢 Quando abrir
cron.schedule(`${openTime.minute} ${openTime.hour} * * *`, async () => {
  console.log("CRON: Servidor aberto");
  await updateServerStatus('🟢', messages.status.open);
  serverOpenMessagesSent = 0; // Reseta contador
  if (serverOpenMessageTimeoutId) clearTimeout(serverOpenMessageTimeoutId); // Limpa qualquer timeout pendente
  console.log("Iniciando ciclo de mensagens aleatórias do servidor aberto.");
  scheduleNextRandomMessage('serverOpen'); // Inicia o ciclo de mensagens para servidor aberto
}, { timezone: TIMEZONE });

// 🔴 Quando fechar
cron.schedule(`${closeTime.minute} ${closeTime.hour} * * *`, async () => {
  console.log("CRON: Servidor fechado");
  await updateServerStatus('🔴', messages.status.closed);
  if (serverOpenMessageTimeoutId) {
    clearTimeout(serverOpenMessageTimeoutId);
    serverOpenMessageTimeoutId = null;
    console.log("Ciclo de mensagens aleatórias do servidor aberto parado.");
  }
  serverOpenMessagesSent = MESSAGES_DURING_SERVER_OPEN; // Marca como se todas tivessem sido enviadas para não tentar mais
}, { timezone: TIMEZONE });

// Início do ciclo de mensagens diurnas (08:00)
cron.schedule(`0 ${DAYTIME_START_HOUR} * * *`, () => {
  console.log("CRON: Início do horário diurno para mensagens aleatórias.");
  daytimeMessagesSent = 0; // Reseta contador
  if (daytimeMessageTimeoutId) clearTimeout(daytimeMessageTimeoutId); // Limpa qualquer timeout pendente
  const currentHour = new Date().getHours();
  if (currentHour >= DAYTIME_START_HOUR && currentHour < DAYTIME_END_HOUR) { // Verifica se já não passou do horário
      scheduleNextRandomMessage('daytime');
  } else {
      console.log("Fora do horário diurno no momento do cron de início, não agendando.");
  }
}, { timezone: TIMEZONE });

// Fim do ciclo de mensagens diurnas (17:00)
cron.schedule(`0 ${DAYTIME_END_HOUR} * * *`, () => {
  console.log("CRON: Fim do horário diurno para mensagens aleatórias.");
  if (daytimeMessageTimeoutId) {
    clearTimeout(daytimeMessageTimeoutId);
    daytimeMessageTimeoutId = null;
    console.log("Ciclo de mensagens aleatórias diurnas parado.");
  }
  daytimeMessagesSent = MESSAGES_DURING_DAYTIME; // Marca como se todas tivessem sido enviadas
}, { timezone: TIMEZONE });


// --- Agendamentos Extras (sem alterações aqui) ---
cron.schedule('0 20 * * 0', async () => {
  console.log("CRON: Mensagem de Domingo à noite");
  await sendMessageToGroup(messages.extras.sundayNight);
}, { timezone: TIMEZONE });

cron.schedule('0 18 * * 5', async () => {
  console.log("CRON: Mensagem de Sexta");
  await sendMessageToGroup(messages.extras.friday);
}, { timezone: TIMEZONE });


// Inicializa o status do bot ao iniciar
async function initializeBotStatus() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    let initialStatus = '🔴'; // Padrão fechado

    const openH = openTime.hour;
    const openM = openTime.minute;
    const closeH = closeTime.hour;
    const closeM = closeTime.minute;
    const oneHourBeforeOpenH = oneHourBeforeOpenTime.hour;
    const oneHourBeforeOpenM = oneHourBeforeOpenTime.minute;

    // Lógica para lidar com horários que cruzam a meia-noite (ex: abre 22:00 fecha 02:00)
    if (closeH < openH || (closeH === openH && closeM < openM)) { // Servidor fecha no dia seguinte
        if ((currentHour > openH || (currentHour === openH && currentMinute >= openM)) || // Depois de abrir hoje
            (currentHour < closeH || (currentHour === closeH && currentMinute < closeM))) { // Antes de fechar "amanhã" (hoje, se já passou da meia-noite)
            initialStatus = '🟢';
        } else if ((currentHour > oneHourBeforeOpenH || (currentHour === oneHourBeforeOpenH && currentMinute >= oneHourBeforeOpenM)) &&
                   (currentHour < openH || (currentHour === openH && currentMinute < openM))) {
             initialStatus = '🟡'; // Se estiver 1h antes e antes de abrir
        } else {
            initialStatus = '🔴';
        }
    } else { // Servidor abre e fecha no mesmo dia
        if (currentHour >= openH && currentHour < closeH) {
             if (currentHour === openH && currentMinute < openM) initialStatus = '🟡'; // Ainda não abriu, mas perto
             else initialStatus = '🟢';
        } else if (currentHour === oneHourBeforeOpenH && currentMinute >= oneHourBeforeOpenM && currentHour < openH) {
            initialStatus = '🟡';
        } else if (currentHour === closeH && currentMinute < closeM) { // Ainda aberto mas perto de fechar
             initialStatus = '🟢';
        }
         else {
            initialStatus = '🔴';
        }
    }

    if (currentServerStatus !== initialStatus) await updateServerStatus(initialStatus, null);
    console.log(`Status inicial do bot definido para: ${initialStatus}`);

    // Inicia ciclos de mensagens se estiver dentro das janelas ao iniciar o bot
    if (initialStatus === '🟢') {
        serverOpenMessagesSent = 0;
        console.log("Bot iniciado com servidor aberto, iniciando ciclo de mensagens.");
        scheduleNextRandomMessage('serverOpen');
    }
    const currentHourNow = new Date().getHours();
    if (currentHourNow >= DAYTIME_START_HOUR && currentHourNow < DAYTIME_END_HOUR) {
        daytimeMessagesSent = 0;
        console.log("Bot iniciado durante horário diurno, iniciando ciclo de mensagens.");
        scheduleNextRandomMessage('daytime');
    }
}


// --- Servidor Webhook (sem alterações aqui, mas usando a versão corrigida da sua resposta anterior) ---
const app = express();
app.use(express.json());

app.post('/webhook', (req, res) => {
  const payload = req.body;
  // Removido o log extenso para não poluir muito, mas pode ser reativado para debug:
  // console.log('Webhook recebido:', JSON.stringify(payload, null, 2));

  const groupIdFromPayload = payload.data?.id || payload.data?.key?.remoteJid || payload.groupId || (payload.data?.chatId === TARGET_GROUP_ID ? TARGET_GROUP_ID : null);

  if (groupIdFromPayload !== TARGET_GROUP_ID) {
    return res.status(200).send('Evento ignorado: não é do grupo alvo.');
  }

  const event = payload.event;

  if (event === 'GROUP_PARTICIPANTS_UPDATE') {
    const action = payload.data?.action;
    const participants = payload.data?.participants;

    if (!action || !participants || participants.length === 0) {
      // console.log("GROUP_PARTICIPANTS_UPDATE recebido, mas sem ação ou participantes claros.");
      return res.status(200).send('Payload de atualização de participantes incompleto.');
    }

    // console.log(`Ação no grupo: ${action}, Participantes: ${participants.join(', ')}`);

    if (action === 'add') {
      console.log("Novo membro detectado pela ação 'add'.");
      const welcomeMsg = getRandomElement(messages.newMember);
      if (welcomeMsg) sendMessageToGroup(welcomeMsg);
    } else if (action === 'remove' || action === 'leave') {
      console.log(`Membro saiu/foi removido pela ação '${action}'.`);
      const farewellMsg = getRandomElement(messages.memberLeft);
      if (farewellMsg) sendMessageToGroup(farewellMsg);
    }
  }
  res.status(200).send('Webhook processado');
});

// --- Iniciar o Bot ---
async function startBot() {
  console.log("Iniciando o bot Pavlov...");

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !INSTANCE_NAME || !TARGET_GROUP_ID) {
    console.error("ERRO: Variáveis de ambiente cruciais não definidas. Verifique seu arquivo .env");
    process.exit(1);
  }

  await initializeBotStatus(); // Define o nome do grupo e inicia ciclos de msg se aplicável

  app.listen(BOT_WEBHOOK_PORT, () => {
    console.log(`Servidor de webhook escutando na porta ${BOT_WEBHOOK_PORT}`);
    console.log(`Configure o webhook na Evolution API para: http://SEU_IP_OU_DOMINIO:${BOT_WEBHOOK_PORT}/webhook`);
  });

  console.log("Bot Pavlov iniciado e agendamentos configurados.");
  console.log(`Controlando o grupo: ${TARGET_GROUP_ID}`);
  console.log(`Próxima abertura programada para: ${SERVER_OPEN_TIME} (Fuso: ${TIMEZONE})`);
  console.log(`Próximo fechamento programado para: ${SERVER_CLOSE_TIME} (Fuso: ${TIMEZONE})`);
  console.log(`Mensagens diurnas entre: ${DAYTIME_START_HOUR}:00 e ${DAYTIME_END_HOUR}:00 (Fuso: ${TIMEZONE})`);
}

startBot();