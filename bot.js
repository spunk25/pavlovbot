// bot.js
require('dotenv').config();
const axios = require('axios');
const express = require('express');
const cron = require('node-cron');
const { getRandomElement } = require('./utils'); // Se você criou o utils.js

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

const GROUP_BASE_NAME = "BRASIL PAVLOV SND"; // Base do nome do grupo
// O "[6/24]" é um exemplo de contagem de jogadores. O bot não tem como saber isso automaticamente do Pavlov.
// Você pode deixar estático, remover, ou pensar em uma forma de atualizar manualmente/externamente se necessário.
// Por simplicidade, vamos usar um placeholder ou um valor fixo para o bot.
const PLAYER_COUNT_PLACEHOLDER = "X/24";

// --- Mensagens ---
const messages = {
  status: {
    closed: "🚧 Servidor fechado. Vai viver a vida real (ou tenta).",
    openingSoon: "⏳ Servidor abre em 1 hora! Aqueles que forem entrar, aqueçam as mãos (e preparem as desculpas).",
    open: "🟢 Servidor aberto! Que comecem os tiros, os gritos e os rage quits.",
  },
  newMember: [
    "🔥 Mais um corno chegou! Alguém dá o manual (mentira, a gente joga ele no mapa e vê no que dá).",
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

async function sendMessageToGroup(message) {
  try {
    console.log(`Enviando mensagem para ${TARGET_GROUP_ID}: ${message}`);
    await evolutionAPI.post(`/message/sendText/${INSTANCE_NAME}`, {
      number: TARGET_GROUP_ID,
      options: {
        delay: 1200,
        presence: "composing",
      },
      textMessage: {
        text: message,
      },
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
let currentServerStatus = '🔴'; // Estado inicial (fechado)

function getStatusTimeParts(timeStr) { // "HH:MM"
  const [hour, minute] = timeStr.split(':').map(Number);
  return { hour, minute };
}

const openTime = getStatusTimeParts(SERVER_OPEN_TIME);
const closeTime = getStatusTimeParts(SERVER_CLOSE_TIME);

// Calcula o horário "1 hora antes de abrir"
const oneHourBeforeOpenTime = { ...openTime };
oneHourBeforeOpenTime.hour -= 1;
if (oneHourBeforeOpenTime.hour < 0) { // Caso abra 00:xx
  oneHourBeforeOpenTime.hour = 23;
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

// Agendamentos de status
// (Ajuste os horários no .env)

// 🟡 Quando faltar 1h pra abrir
cron.schedule(`${oneHourBeforeOpenTime.minute} ${oneHourBeforeOpenTime.hour} * * *`, async () => {
  console.log("ACIONADO: 1 hora para abrir");
  await updateServerStatus('🟡', messages.status.openingSoon);
}, {
  timezone: "America/Sao_Paulo" // Ajuste para o seu fuso horário
});

// 🟢 Quando abrir
cron.schedule(`${openTime.minute} ${openTime.hour} * * *`, async () => {
  console.log("ACIONADO: Servidor aberto");
  await updateServerStatus('🟢', messages.status.open);
}, {
  timezone: "America/Sao_Paulo"
});

// 🔴 Quando fechar
cron.schedule(`${closeTime.minute} ${closeTime.hour} * * *`, async () => {
  console.log("ACIONADO: Servidor fechado");
  await updateServerStatus('🔴', messages.status.closed);
}, {
  timezone: "America/Sao_Paulo"
});

// Inicializa o status do bot ao iniciar (para garantir que o nome esteja correto)
// Poderia ser mais inteligente, verificando a hora atual, mas para simplificar:
async function initializeBotStatus() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Lógica simples para definir o status inicial. Pode ser melhorada.
    // Considera que o bot pode ser iniciado a qualquer momento.
    if ((currentHour > closeTime.hour || (currentHour === closeTime.hour && currentMinute >= closeTime.minute)) ||
        (currentHour < oneHourBeforeOpenTime.hour || (currentHour === oneHourBeforeOpenTime.hour && currentMinute < oneHourBeforeOpenTime.minute))) {
        if (currentServerStatus !== '🔴') await updateServerStatus('🔴', null); // Não envia msg ao iniciar
    } else if (currentHour < openTime.hour || (currentHour === openTime.hour && currentMinute < openTime.minute)) {
        if (currentServerStatus !== '🟡') await updateServerStatus('🟡', null);
    } else {
        if (currentServerStatus !== '🟢') await updateServerStatus('🟢', null);
    }
    console.log("Status inicial do bot definido.");
}


// --- Agendamentos Extras ---

// Domingo à noite (ex: 20:00)
cron.schedule('0 20 * * 0', async () => { // 0 = Domingo
  console.log("ACIONADO: Mensagem de Domingo à noite");
  await sendMessageToGroup(messages.extras.sundayNight);
}, {
  timezone: "America/Sao_Paulo"
});

// Toda Sexta (ex: 18:00)
cron.schedule('0 18 * * 5', async () => { // 5 = Sexta
  console.log("ACIONADO: Mensagem de Sexta");
  await sendMessageToGroup(messages.extras.friday);
}, {
  timezone: "America/Sao_Paulo"
});

// Mensagens aleatórias a cada 4 horas
cron.schedule('0 */4 * * *', async () => { // A cada 4 horas (0, 4, 8, 12, 16, 20)
  // A condição "se o grupo estiver movimentado" é complexa de implementar sem
  // armazenar o timestamp da última mensagem. Por simplicidade, enviaremos
  // a cada 4 horas. Pode ser um TODO para melhoria.
  console.log("ACIONADO: Mensagem aleatória");
  const randomMsg = getRandomElement(messages.randomActive);
  if (randomMsg) {
    await sendMessageToGroup(randomMsg);
  }
}, {
  timezone: "America/Sao_Paulo"
});


// --- Servidor Webhook ---
const app = express();
app.use(express.json()); // Para parsear o corpo JSON das requisições

app.post('/webhook', (req, res) => {
  const payload = req.body;
  console.log('Webhook recebido:', JSON.stringify(payload, null, 2));

  // Verifique se o evento é para o grupo alvo
  if (payload.data?.id !== TARGET_GROUP_ID && payload.groupId !== TARGET_GROUP_ID) {
    // console.log("Evento ignorado: não é do grupo alvo.");
    return res.status(200).send('Evento ignorado: não é do grupo alvo.');
  }

  const event = payload.event; // Ex: "group_participants.add"

  if (event === 'group_participants.add') {
    // payload.data.participants contém quem entrou
    // payload.data.author contém quem adicionou (se aplicável)
    // Não precisamos saber quem adicionou para a mensagem de boas-vindas.
    console.log("Novo membro detectado.");
    const welcomeMsg = getRandomElement(messages.newMember);
    if (welcomeMsg) {
      sendMessageToGroup(welcomeMsg);
    }
  } else if (event === 'group_participants.leave' || event === 'group_participants.remove') {
    // payload.data.participants contém quem saiu/foi removido
    console.log("Membro saiu/foi removido.");
    const farewellMsg = getRandomElement(messages.memberLeft);
    if (farewellMsg) {
      sendMessageToGroup(farewellMsg);
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

  await initializeBotStatus(); // Define o nome do grupo corretamente ao iniciar

  app.listen(BOT_WEBHOOK_PORT, () => {
    console.log(`Servidor de webhook escutando na porta ${BOT_WEBHOOK_PORT}`);
    console.log(`Configure o webhook na Evolution API para: http://SEU_IP_OU_DOMINIO:${BOT_WEBHOOK_PORT}/webhook`);
  });

  console.log("Bot Pavlov iniciado e agendamentos configurados.");
  console.log(`Controlando o grupo: ${TARGET_GROUP_ID}`);
  console.log(`Próxima abertura programada para: ${SERVER_OPEN_TIME}`);
  console.log(`Próximo fechamento programado para: ${SERVER_CLOSE_TIME}`);
}

startBot();