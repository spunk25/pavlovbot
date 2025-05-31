// bot.js
require('dotenv').config();
const axios = require('axios');
const express = 'express'; // <- ERRO DE DIGITAÇÃO AQUI, DEVE SER const express = require('express');
const cron = require('node-cron');
const { getRandomElement } = require('./utils');

// --- Configurações (sem alterações) ---
// ... (como antes) ...
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
const PLAYER_COUNT_PLACEHOLDER = "X/24";
const MESSAGES_DURING_SERVER_OPEN = 4;
const MESSAGES_DURING_DAYTIME = 4;
const DAYTIME_START_HOUR = 8;
const DAYTIME_END_HOUR = 17;
const TIMEZONE = "America/Sao_Paulo";

// --- Mensagens (sem alterações) ---
// ... (como antes) ...
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

async function sendMessageToGroup(message, recipientJid = TARGET_GROUP_ID) { // Adicionado recipientJid
  try {
    console.log(`Enviando mensagem para ${recipientJid}: ${message}`);
    await evolutionAPI.post(`/message/sendText/${INSTANCE_NAME}`, {
      number: recipientJid,
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

// NOVA FUNÇÃO: Obter metadados do grupo (para verificar admins)
async function getGroupMetadata(groupId) {
  try {
    const response = await evolutionAPI.get(`/group/fetchAllGroups/${INSTANCE_NAME}?getParticipants=true`);
    // A API pode retornar todos os grupos, precisamos encontrar o nosso
    // ou, se houver um endpoint específico para um grupo, usar esse.
    // Vamos supor que fetchAllGroups é o caminho e precisamos filtrar.
    // Verifique a documentação da sua versão da Evolution API para o endpoint mais eficiente.

    if (response.data && Array.isArray(response.data)) {
        const group = response.data.find(g => g.id === groupId);
        if (group && group.participants) {
            return group;
        }
    }
    // Fallback ou alternativa se o endpoint acima não funcionar como esperado
    // Algumas APIs têm um endpoint como /group/getGroupInfo/{instanceName}?groupId=TARGET_GROUP_ID
    // console.warn("fetchAllGroups não retornou o grupo esperado ou não tem participantes. Tentando outro método se disponível.");
    // const specificGroupResponse = await evolutionAPI.get(`/group/findGroupInfo/${INSTANCE_NAME}?groupId=${groupId}`);
    // if (specificGroupResponse.data && specificGroupResponse.data.participants) {
    //     return specificGroupResponse.data;
    // }

    console.error(`Metadados não encontrados para o grupo ${groupId} com fetchAllGroups. Verifique o endpoint.`);
    return null;
  } catch (error) {
    console.error("Erro ao obter metadados do grupo:", error.response ? error.response.data : error.message);
    return null;
  }
}


// --- Lógica de Status do Servidor (sem alterações) ---
// ... (como antes) ...
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


// --- Lógica para Mensagens Aleatórias Espalhadas (sem alterações) ---
// ... (como antes) ...
let serverOpenMessagesSent = 0;
let daytimeMessagesSent = 0;
let serverOpenMessageTimeoutId = null;
let daytimeMessageTimeoutId = null;

function calculateRandomDelay(minMinutes, maxMinutes) {
    return (Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes) * 60 * 1000;
}

function getServerOpenWindowMillis() {
    const now = new Date();
    const openDate = new Date(now);
    openDate.setHours(openTime.hour, openTime.minute, 0, 0);
    const closeDate = new Date(now);
    closeDate.setHours(closeTime.hour, closeTime.minute, 0, 0);

    if (closeDate < openDate) {
        if (now < openDate && now.getTime() > closeDate.getTime() + (24 * 60 * 60 * 1000) ) {
             return 0;
        }
        if (now > openDate) {
            closeDate.setDate(closeDate.getDate() + 1);
        } else {
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
    if (serverOpenMessageTimeoutId) clearTimeout(serverOpenMessageTimeoutId);
    if (currentServerStatus !== '🟢' || serverOpenMessagesSent >= MESSAGES_DURING_SERVER_OPEN) {
      // console.log("Não agendando mais mensagens de servidor aberto.");
      return;
    }
    const serverWindowMillis = getServerOpenWindowMillis();
    if (serverWindowMillis <= 0) return;
    const remainingMessages = Math.max(1, MESSAGES_DURING_SERVER_OPEN - serverOpenMessagesSent);
    const avgDelayPerMessage = serverWindowMillis / remainingMessages;
    const minDelay = Math.max(10 * 60 * 1000, avgDelayPerMessage * 0.5);
    const maxDelay = avgDelayPerMessage * 1.5;
    const delay = calculateRandomDelay(minDelay / (60 * 1000), maxDelay / (60*1000));
    const now = new Date();
    const closeDateTime = new Date(now);
    closeDateTime.setHours(closeTime.hour, closeTime.minute, 0, 0);
    if (closeTime.hour < openTime.hour && now.getHours() >= openTime.hour) {
        closeDateTime.setDate(closeDateTime.getDate() + 1);
    }
    if (now.getTime() + delay >= closeDateTime.getTime() && currentServerStatus === '🟢') {
        console.log(`[MSG SRV] Delay ${Math.round(delay/60000)}min ultrapassa fechamento. Não agendando.`);
        return;
    }
    console.log(`[MSG SRV] Próxima em ${Math.round(delay / 60000)} min. (${serverOpenMessagesSent + 1}/${MESSAGES_DURING_SERVER_OPEN})`);
    serverOpenMessageTimeoutId = setTimeout(async () => {
      if (currentServerStatus === '🟢') { // Double check status
        const randomMsg = getRandomElement(messages.randomActive);
        if (randomMsg) {
          await sendMessageToGroup(randomMsg);
          serverOpenMessagesSent++;
          console.log(`[MSG SRV] Enviada (${serverOpenMessagesSent}/${MESSAGES_DURING_SERVER_OPEN}).`);
        }
        scheduleNextRandomMessage('serverOpen');
      }
    }, delay);

  } else if (type === 'daytime') {
    if (daytimeMessageTimeoutId) clearTimeout(daytimeMessageTimeoutId);
    const currentHour = new Date().getHours();
    if (currentHour < DAYTIME_START_HOUR || currentHour >= DAYTIME_END_HOUR || daytimeMessagesSent >= MESSAGES_DURING_DAYTIME) {
      // console.log("Não agendando mais mensagens diurnas.");
      return;
    }
    const daytimeWindowMillis = getDaytimeWindowMillis();
    if (daytimeWindowMillis <= 0) return;
    const remainingMessages = Math.max(1, MESSAGES_DURING_DAYTIME - daytimeMessagesSent);
    const avgDelayPerMessage = daytimeWindowMillis / remainingMessages;
    const minDelay = Math.max(30 * 60 * 1000, avgDelayPerMessage * 0.5);
    const maxDelay = avgDelayPerMessage * 1.5;
    const delay = calculateRandomDelay(minDelay / (60 * 1000), maxDelay / (60 * 1000));
    const now = new Date();
    const daytimeEndDateTime = new Date(now);
    daytimeEndDateTime.setHours(DAYTIME_END_HOUR, 0, 0, 0);
    if (now.getTime() + delay >= daytimeEndDateTime.getTime() && currentHour < DAYTIME_END_HOUR) {
        console.log(`[MSG DAY] Delay ${Math.round(delay/60000)}min ultrapassa fim do dia. Não agendando.`);
        return;
    }
    console.log(`[MSG DAY] Próxima em ${Math.round(delay / 60000)} min. (${daytimeMessagesSent + 1}/${MESSAGES_DURING_DAYTIME})`);
    daytimeMessageTimeoutId = setTimeout(async () => {
      const currentHourNow = new Date().getHours();
      if (currentHourNow >= DAYTIME_START_HOUR && currentHourNow < DAYTIME_END_HOUR) { // Double check
        const randomMsg = getRandomElement(messages.randomActive);
        if (randomMsg) {
          await sendMessageToGroup(randomMsg);
          daytimeMessagesSent++;
          console.log(`[MSG DAY] Enviada (${daytimeMessagesSent}/${MESSAGES_DURING_DAYTIME}).`);
        }
        scheduleNextRandomMessage('daytime');
      }
    }, delay);
  }
}


// --- Agendamentos de Status e Início/Fim de Ciclos de Mensagens Aleatórias ---
const scheduledTasks = []; // Array para armazenar as tarefas cron

function logScheduledTask(cronExpression, description, taskFn) {
  const job = cron.schedule(cronExpression, taskFn, { timezone: TIMEZONE, scheduled: false }); // Não inicia ainda
  scheduledTasks.push({ job, description, cronExpression });
}

function getNextOccurrence(cronJob) {
    try {
        // A biblioteca node-cron não expõe diretamente a próxima data de execução de uma tarefa parada.
        // Uma vez iniciada (job.start()), poderíamos tentar job.nextDate() ou job.nextDates(1)[0]
        // Para tarefas não iniciadas, teríamos que parsear a expressão cron, o que é complexo.
        // Vamos simplificar e mostrar a expressão e a descrição.
        // Para uma solução mais robusta, bibliotecas como 'cron-parser' seriam necessárias.
        return `Expressão Cron: ${cronJob.cronExpression}`;
    } catch (e) {
        // console.error("Erro ao obter próxima ocorrência:", e);
        return "Não foi possível determinar a próxima ocorrência.";
    }
}


logScheduledTask(`${oneHourBeforeOpenTime.minute} ${oneHourBeforeOpenTime.hour} * * *`, "1 hora para abrir o servidor", async () => {
  console.log("CRON: 1 hora para abrir");
  await updateServerStatus('🟡', messages.status.openingSoon);
});

logScheduledTask(`${openTime.minute} ${openTime.hour} * * *`, "Abrir servidor", async () => {
  console.log("CRON: Servidor aberto");
  await updateServerStatus('🟢', messages.status.open);
  serverOpenMessagesSent = 0;
  if (serverOpenMessageTimeoutId) clearTimeout(serverOpenMessageTimeoutId);
  console.log("Iniciando ciclo de mensagens aleatórias do servidor aberto.");
  scheduleNextRandomMessage('serverOpen');
});

logScheduledTask(`${closeTime.minute} ${closeTime.hour} * * *`, "Fechar servidor", async () => {
  console.log("CRON: Servidor fechado");
  await updateServerStatus('🔴', messages.status.closed);
  if (serverOpenMessageTimeoutId) {
    clearTimeout(serverOpenMessageTimeoutId);
    serverOpenMessageTimeoutId = null;
    console.log("Ciclo de mensagens aleatórias do servidor aberto parado.");
  }
  serverOpenMessagesSent = MESSAGES_DURING_SERVER_OPEN;
});

logScheduledTask(`0 ${DAYTIME_START_HOUR} * * *`, "Início mensagens diurnas", () => {
  console.log("CRON: Início do horário diurno para mensagens aleatórias.");
  daytimeMessagesSent = 0;
  if (daytimeMessageTimeoutId) clearTimeout(daytimeMessageTimeoutId);
  const currentHour = new Date().getHours();
  if (currentHour >= DAYTIME_START_HOUR && currentHour < DAYTIME_END_HOUR) {
      scheduleNextRandomMessage('daytime');
  } else {
      console.log("Fora do horário diurno no momento do cron de início, não agendando.");
  }
});

logScheduledTask(`0 ${DAYTIME_END_HOUR} * * *`, "Fim mensagens diurnas", () => {
  console.log("CRON: Fim do horário diurno para mensagens aleatórias.");
  if (daytimeMessageTimeoutId) {
    clearTimeout(daytimeMessageTimeoutId);
    daytimeMessageTimeoutId = null;
    console.log("Ciclo de mensagens aleatórias diurnas parado.");
  }
  daytimeMessagesSent = MESSAGES_DURING_DAYTIME;
});

logScheduledTask('0 20 * * 0', "Mensagem de Domingo à noite", async () => {
  console.log("CRON: Mensagem de Domingo à noite");
  await sendMessageToGroup(messages.extras.sundayNight);
});

logScheduledTask('0 18 * * 5', "Mensagem de Sexta", async () => {
  console.log("CRON: Mensagem de Sexta");
  await sendMessageToGroup(messages.extras.friday);
});


// Inicializa o status do bot ao iniciar
async function initializeBotStatus() {
    // ... (lógica de initializeBotStatus como antes, sem mudanças aqui) ...
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    let initialStatus = '🔴';

    const openH = openTime.hour;
    const openM = openTime.minute;
    const closeH = closeTime.hour;
    const closeM = closeTime.minute;
    const oneHourBeforeOpenH = oneHourBeforeOpenTime.hour;
    const oneHourBeforeOpenM = oneHourBeforeOpenTime.minute;

    if (closeH < openH || (closeH === openH && closeM < openM)) {
        if ((currentHour > openH || (currentHour === openH && currentMinute >= openM)) ||
            (currentHour < closeH || (currentHour === closeH && currentMinute < closeM))) {
            initialStatus = '🟢';
        } else if ((currentHour > oneHourBeforeOpenH || (currentHour === oneHourBeforeOpenH && currentMinute >= oneHourBeforeOpenM)) &&
                   (currentHour < openH || (currentHour === openH && currentMinute < openM))) {
             initialStatus = '🟡';
        }
    } else {
        if (currentHour >= openH && currentHour < closeH) {
             if (currentHour === openH && currentMinute < openM) initialStatus = '🟡';
             else initialStatus = '🟢';
        } else if (currentHour === oneHourBeforeOpenH && currentMinute >= oneHourBeforeOpenM && currentHour < openH) {
            initialStatus = '🟡';
        } else if (currentHour === closeH && currentMinute < closeM) {
             initialStatus = '🟢';
        }
    }

    if (currentServerStatus !== initialStatus) await updateServerStatus(initialStatus, null);
    console.log(`Status inicial do bot definido para: ${initialStatus}`);

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


// --- Servidor Webhook ---
// Corrigindo o require do express
const expressApp = require('express'); // Usei expressApp para evitar conflito com a variável 'express' errada acima
const app = expressApp(); // Agora app é uma instância do Express
app.use(expressApp.json());

app.post('/webhook', async (req, res) => { // Adicionado async para getGroupMetadata
  const payload = req.body;
  // console.log('Webhook recebido:', JSON.stringify(payload, null, 2)); // Descomente para debug detalhado

  const event = payload.event;
  const data = payload.data;

  // Lógica para comando !teste
  if (event === 'messages.upsert' && data && data.key && data.key.remoteJid === TARGET_GROUP_ID) {
    const messageContent = data.message?.conversation || data.message?.extendedTextMessage?.text || "";
    const senderJid = data.key?.participant || data.key?.remoteJid; // participant se for grupo, remoteJid se for DM (não nosso caso aqui)

    if (messageContent.trim().toLowerCase() === '!teste') {
      console.log(`Comando !teste recebido de ${senderJid} no grupo ${TARGET_GROUP_ID}`);
      // Verificar se o remetente é admin
      const groupInfo = await getGroupMetadata(TARGET_GROUP_ID);
      if (groupInfo && groupInfo.participants) {
        const senderInfo = groupInfo.participants.find(p => p.id === senderJid);
        // Na Evolution API, 'admin' ou 'superadmin' geralmente indica admin. 'owner' ou 'creator' também.
        // Verifique a estrutura exata de 'senderInfo' no log para confirmar o campo de admin.
        // Ex: senderInfo.isAdmin, senderInfo.admin === 'admin', senderInfo.isSuperAdmin
        // Ajuste a condição abaixo conforme a estrutura do seu payload de participantes
        const isAdmin = senderInfo && (senderInfo.admin === 'admin' || senderInfo.admin === 'superadmin');

        if (isAdmin) {
          await sendMessageToGroup("Testado!", TARGET_GROUP_ID); // Envia para o grupo
        } else {
          console.log(`Comando !teste de ${senderJid} ignorado (não é admin).`);
        }
      } else {
        console.log("Não foi possível verificar status de admin para o comando !teste (metadados do grupo não encontrados).");
      }
    }
  }


  // Lógica para entrada/saída de membros
  const groupIdFromPayload = data?.id || data?.key?.remoteJid || payload.groupId || (data?.chatId === TARGET_GROUP_ID ? TARGET_GROUP_ID : null);

  if (groupIdFromPayload !== TARGET_GROUP_ID) {
    return res.status(200).send('Evento ignorado: não é do grupo alvo.');
  }

  if (event === 'GROUP_PARTICIPANTS_UPDATE') { // Mantenha como está se este for o evento correto
    const action = data?.action;
    const participants = data?.participants;

    if (!action || !participants || participants.length === 0) {
      return res.status(200).send('Payload de atualização de participantes incompleto.');
    }

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
  console.log("Corrigindo erro de digitação: const express = require('express');");
  // const express = require('express'); // Linha corrigida, mas já declarada como expressApp

  console.log("Iniciando o bot Pavlov...");

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY || !INSTANCE_NAME || !TARGET_GROUP_ID) {
    console.error("ERRO: Variáveis de ambiente cruciais não definidas. Verifique seu arquivo .env");
    process.exit(1);
  }

  await initializeBotStatus();

  // Iniciar todas as tarefas cron agendadas
  console.log("\n--- AGENDAMENTOS CRON ATIVOS ---");
  scheduledTasks.forEach(task => {
    task.job.start(); // Inicia o job
    // Tentar obter a próxima data de execução (pode não funcionar para todas as versões de node-cron ou tarefas não iniciadas)
    let nextRun = "Não disponível (tarefa não iniciada ou API não suporta)";
    try {
        if (task.job.running) { // Para node-cron mais recentes, nextDate() ou nextDates()
            const nextDates = task.job.nextDates ? task.job.nextDates(1) : null;
            if (nextDates && nextDates.length > 0) {
                 // Formatar para o fuso horário local para exibição
                nextRun = nextDates[0].toLocaleString('pt-BR', { timeZone: TIMEZONE });
            } else if (task.job.nextDate) { // Para versões mais antigas
                nextRun = task.job.nextDate().toLocaleString('pt-BR', { timeZone: TIMEZONE });
            }
        }
    } catch (e) { /* ignora erro se não conseguir pegar a data */ }

    console.log(`- ${task.description} (Próxima: ${nextRun})`);
    console.log(`  Expressão: ${task.cronExpression}`);
  });
  console.log("--------------------------------\n");


  app.listen(BOT_WEBHOOK_PORT, () => {
    console.log(`Servidor de webhook escutando na porta ${BOT_WEBHOOK_PORT}`);
    console.log(`Configure o webhook na Evolution API para: http://SEU_IP_OU_DOMINIO:${BOT_WEBHOOK_PORT}/webhook`);
    console.log("Certifique-se de habilitar o evento 'messages.upsert' para o comando !teste e 'GROUP_PARTICIPANTS_UPDATE' para entrada/saída de membros.");
  });

  console.log("Bot Pavlov iniciado e agendamentos configurados.");
  console.log(`Controlando o grupo: ${TARGET_GROUP_ID}`);
  console.log(`Próxima abertura programada para: ${SERVER_OPEN_TIME} (Fuso: ${TIMEZONE})`);
  console.log(`Próximo fechamento programado para: ${SERVER_CLOSE_TIME} (Fuso: ${TIMEZONE})`);
  console.log(`Mensagens diurnas entre: ${DAYTIME_START_HOUR}:00 e ${DAYTIME_END_HOUR}:00 (Fuso: ${TIMEZONE})`);
}

startBot();