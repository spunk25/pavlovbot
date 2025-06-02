import express from 'express';
import EvolutionApiService from '../core/EvolutionApiService.js';
import MessageService from '../core/MessageService.js';
import ChatHistoryService from '../core/ChatHistoryService.js';
import ConfigService from '../core/ConfigService.js';
import CommandHandler from './commandHandler.js';
import { getRandomElement } from '../utils/generalUtils.js';


const router = express.Router();

// Main webhook endpoint to route events
router.post('/', async (req, res, next) => {
    const receivedPayload = req.body;
    // console.log("[Webhook Root] Payload recebido:", JSON.stringify(receivedPayload, null, 2));

    const instance = receivedPayload.instance;
    const innerPayload = receivedPayload; // Assuming the structure is flat or direct after initial common fields

    if (!innerPayload || !innerPayload.event) {
        console.warn("[Webhook Root] Evento não encontrado no payload:", JSON.stringify(receivedPayload, null, 2));
        return res.status(400).send("Payload inválido: evento ausente.");
    }
    const event = (innerPayload.event || '').toLowerCase();
  
    if (event === 'messages.upsert') {
      req.url  = '/messages-upsert'; // Reroute internally
      // req.body is already set
      return next(); // Pass to the next matching route (/messages-upsert)
    }
    if (event === 'group.participants.update') {
      req.url  = '/group-participants-update';
      return next();
    }
    if (event === 'connection.update') {
      req.url = '/connection-update';
      return next();
    }
    
    console.log(`[Webhook Root] Evento não mapeado ou não habilitado: '${event}'.`);
    // console.log("[Webhook Root] Payload completo:", JSON.stringify(receivedPayload, null, 2));
    return res.status(200).send(`Evento '${event}' recebido mas não mapeado para uma ação específica.`);
});


router.post('/messages-upsert', async (req, res) => {
  const fullReceivedPayload = req.body; // This is the innerPayload from the root webhook
  const data = fullReceivedPayload.data;
  const config = ConfigService.getConfig();

  if (!data) {
    console.warn("WebhookHandler: messages.upsert - data ausente", JSON.stringify(fullReceivedPayload, null, 2));
    return res.status(400).send("Payload inválido para messages.upsert.");
  }

  if (EvolutionApiService.isFromMe(data)) {
    return res.status(200).send('Ignorado: mensagem do próprio bot.');
  }

  const remoteJid = data.key?.remoteJid;
  if (!remoteJid) {
    console.warn("WebhookHandler: messages.upsert - remoteJid ausente", JSON.stringify(data, null, 2));
    return res.status(200).send('Ignorado: remoteJid ausente.');
  }

  const isGroupMessage = remoteJid.endsWith('@g.us');
  let actualSenderJid;

  if (isGroupMessage) {
    if (remoteJid === config.TARGET_GROUP_ID) {
      actualSenderJid = data.key.participant || data.participant; // participant might be at different levels
    } else {
      return res.status(200).send('Ignorado: mensagem de grupo não alvo.');
    }
  } else { // Private message
    actualSenderJid = remoteJid;
  }

  if (!actualSenderJid) {
    console.warn("WebhookHandler: messages.upsert - actualSenderJid não pôde ser determinado:", JSON.stringify(data, null, 2));
    return res.status(200).send('Ignorado: sender não determinado.');
  }

  const messageContent = data.message?.conversation ||
                         data.message?.extendedTextMessage?.text ||
                         data.message?.buttonsResponseMessage?.selectedDisplayText || // for button responses
                         data.message?.listResponseMessage?.title || // for list responses
                         "";
  const commandText = messageContent.trim().toLowerCase();
  const commandParts = commandText.split(' ');
  const command = commandParts[0];
  const args = commandParts.slice(1);

  const isAdminInTargetGroup = await EvolutionApiService.isUserAdmin(config.TARGET_GROUP_ID, actualSenderJid);

  // Add to chat history if it's a relevant group message and not a command
  if (isGroupMessage && remoteJid === config.TARGET_GROUP_ID && messageContent && !commandText.startsWith("!")) {
    const senderName = data.pushName || actualSenderJid.split('@')[0];
    ChatHistoryService.addMessageToHistory(senderName, messageContent);
  }

  let commandProcessed = false;
  if (commandText.startsWith("!")) {
    commandProcessed = await CommandHandler.handleCommand(command, args, commandText, actualSenderJid, isGroupMessage, isAdminInTargetGroup);
  }
  
  // If no command was processed, and it's a PM, maybe send help?
  // Or just acknowledge. For now, just acknowledge.
  if (!commandProcessed && !isGroupMessage && commandText.startsWith("!")) {
      // A command was attempted in PM but not recognized by handleCommand (e.g. non-admin trying restricted)
      // handleCommand should have sent a reply.
      console.log(`WebhookHandler: Comando PM não processado '${commandText}' de ${actualSenderJid}. handleCommand deveria ter respondido.`);
  } else if (!commandProcessed && !isGroupMessage && !commandText.startsWith("!")) {
      // Non-command PM to the bot
      const messages = MessageService.getMessages();
      const defaultReply = getRandomElement(messages.botInfo?.defaultPmReply) || "Olá! Sou um bot. Para comandos (se você for admin), digite !start em uma conversa privada comigo.";
      try {
        await EvolutionApiService.sendMessageToGroup(defaultReply, actualSenderJid);
      } catch (error) {
        console.error(`WebhookHandler: Erro ao enviar resposta PM padrão para ${actualSenderJid}:`, error);
      }
  }


  return res.status(200).send('messages.upsert processado.');
});

router.post('/group-participants-update', async (req, res) => {
  const fullReceivedPayload = req.body; // This is the innerPayload
  const data = fullReceivedPayload.data;
  const config = ConfigService.getConfig();
  const messages = MessageService.getMessages();

  if (!data) {
    console.warn("WebhookHandler: group.participants.update - data ausente", JSON.stringify(fullReceivedPayload, null, 2));
    return res.status(400).send("Payload inválido para group.participants.update.");
  }

  const groupId = data.id || data.chatId; // Evolution API might use 'id' or 'chatId'

  if (groupId === config.TARGET_GROUP_ID && Array.isArray(data.participants)) {
    const action = data.action; // "add", "remove", "promote", "demote"
    // const participants = data.participants; // Array of JIDs

    if (action === 'add') {
      const useAI = MessageService.getAIUsageSetting('newMember') && config.GROQ_API_KEY;
      let welcomeMsg;
      if (useAI) {
          welcomeMsg = await GroqApiService.callGroqAPI(MessageService.getAIPrompt('newMember'));
          if (!welcomeMsg || welcomeMsg.startsWith("Erro") || welcomeMsg.length < 5) {
              welcomeMsg = getRandomElement(messages.newMember) || "Bem-vindo(a) ao grupo!";
          }
      } else {
          welcomeMsg = getRandomElement(messages.newMember) || "Bem-vindo(a) ao grupo!";
      }
      if (welcomeMsg) {
        try {
          await EvolutionApiService.sendMessageToGroup(welcomeMsg);
        } catch (error) {
          console.error(`WebhookHandler: Erro ao enviar mensagem de boas-vindas para o grupo ${config.TARGET_GROUP_ID}:`, error);
        }
      }

    } else if (action === 'remove' || action === 'leave') {
      const useAI = MessageService.getAIUsageSetting('memberLeft') && config.GROQ_API_KEY;
      let farewellMsg;
       if (useAI) {
          farewellMsg = await GroqApiService.callGroqAPI(MessageService.getAIPrompt('memberLeft'));
          if (!farewellMsg || farewellMsg.startsWith("Erro") || farewellMsg.length < 5) {
             farewellMsg = getRandomElement(messages.memberLeft) || "Um membro nos deixou.";
          }
      } else {
          farewellMsg = getRandomElement(messages.memberLeft) || "Um membro nos deixou.";
      }
      if (farewellMsg) {
        try {
          await EvolutionApiService.sendMessageToGroup(farewellMsg);
        } catch (error) {
          console.error(`WebhookHandler: Erro ao enviar mensagem de despedida para o grupo ${config.TARGET_GROUP_ID}:`, error);
        }
      }
    }
  }

  return res.status(200).send('group.participants.update processado.');
});

router.post('/connection-update', async (req, res) => {
    const fullReceivedPayload = req.body;
    console.log("WebhookHandler: Evento connection.update recebido:", JSON.stringify(fullReceivedPayload, null, 2));
    // Example: Check if state is 'open'
    if (fullReceivedPayload.data?.state === 'open') {
        console.log("WebhookHandler: Conexão com WhatsApp estabelecida (state: open).");
        // You could re-initialize bot status or check group name here if needed
    } else if (fullReceivedPayload.data?.state === 'close') {
        console.warn("WebhookHandler: Conexão com WhatsApp fechada (state: close).");
    }
    return res.status(200).send('connection.update processado.');
});


export default router; 