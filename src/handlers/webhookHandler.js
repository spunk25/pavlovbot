import express from 'express';
import EvolutionApiService from '../core/EvolutionApiService.js';
import MessageService from '../core/MessageService.js';
import ChatHistoryService from '../core/ChatHistoryService.js';
import ConfigService from '../core/ConfigService.js';
import CommandHandler from './commandHandler.js';
import { getRandomElement } from '../utils/generalUtils.js';
import GroqApiService from '../core/GroqApiService.js';
import { DEFAULT_AI_PROMPTS } from '../constants/aiConstants.js';


const router = express.Router();

// Main webhook endpoint to route events
router.post('/', async (req, res, next) => {
    const receivedPayload = req.body;
    const instance = receivedPayload.instance;
    const innerPayload = receivedPayload; // Assuming the structure is flat or direct after initial common fields

    if (!innerPayload || !innerPayload.event) {
        console.warn("[Webhook Root] Evento não encontrado no payload:", JSON.stringify(receivedPayload, null, 2));
        return res.status(400).send("Payload inválido: evento ausente.");
    }
    console.log("--Webhook recebido! Payload:", JSON.stringify(req.body, null, 2));
    const event = (innerPayload.event || '').toLowerCase();
    console.log(`[Webhook Root] Evento recebido: ${event}`);
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
    if (event === 'messages.delete' || event === 'message.delete') {
      console.log(`[Webhook Root] Evento '${event}' recebido, roteando para lógica de deleção.`);
      req.url = '/messages-update';
      return next();
    }
    
    console.log(`[Webhook Root] Evento não mapeado ou não habilitado: '${event}'.`);
    // console.log("[Webhook Root] Payload completo:", JSON.stringify(receivedPayload, null, 2));
    return res.status(200).send(`Evento '${event}' recebido mas não mapeado para uma ação específica.`);
});


router.post('/messages-upsert', async (req, res) => {
  const fullReceivedPayload = req.body;
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
    await ChatHistoryService.addMessageToHistory(senderName, messageContent);
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

// Novo handler para messages.update
router.post('/messages-update', async (req, res) => {
  const fullReceivedPayload = req.body;
  const updatesOrDeletedItems = fullReceivedPayload.data; 
  const config = ConfigService.getConfig();
  const eventType = (fullReceivedPayload.event || '').toLowerCase();

  if (!updatesOrDeletedItems) {
    console.warn(`WebhookHandler: ${eventType} - 'data' ausente:`, JSON.stringify(fullReceivedPayload, null, 2));
    return res.status(200).send(`Payload inválido para ${eventType}.`);
  }

  const itemsToProcess = Array.isArray(updatesOrDeletedItems) ? updatesOrDeletedItems : [updatesOrDeletedItems];

  if (itemsToProcess.length === 0) {
    console.warn(`WebhookHandler: ${eventType} - 'data' está vazio ou não é um array processável. Payload original:`, JSON.stringify(fullReceivedPayload, null, 2));
    return res.status(200).send(`${eventType} processado, nenhum item válido em 'data'.`);
  }
  
  console.log(`WebhookHandler: Processando evento ${eventType} com ${itemsToProcess.length} item(s).`);

  for (const item of itemsToProcess) {
    const key = item.key;
    const updateContent = item.update;

    if (!key) {
      console.warn(`WebhookHandler: ${eventType} - 'key' ausente em um item:`, JSON.stringify(item, null, 2));
      continue; 
    }

    let isMessageEffectivelyDeleted = false;
    if (eventType === 'messages.delete' || eventType === 'message.delete') {
        isMessageEffectivelyDeleted = true;
        console.log(`WebhookHandler: ${eventType} - Item de deleção direta:`, JSON.stringify(item, null, 2));
    } else if (eventType === 'messages.update' && updateContent && updateContent.message === null) {
        isMessageEffectivelyDeleted = true;
        console.log(`WebhookHandler: ${eventType} - Item de atualização indicando deleção:`, JSON.stringify(item, null, 2));
    }

    if (isMessageEffectivelyDeleted && key.remoteJid === config.TARGET_GROUP_ID && !key.fromMe) {
      console.log(`WebhookHandler: Mensagem apagada (evento: ${eventType}) detectada no grupo ${key.remoteJid}. Key:`, JSON.stringify(key));

      const originalSenderJid = item.participant || key.participant; // key.remoteJid seria o grupo aqui
      let senderName = originalSenderJid ? originalSenderJid.split('@')[0] : 'Alguém'; 

      // Tenta obter o pushName do item, que pode estar associado ao 'participant'
      // O payload de 'messages.delete' pode não ter pushName no mesmo nível que 'messages.upsert'
      // Se 'item' é o 'data' do evento 'messages.delete', ele pode ter 'pushName' se a API o fornecer nesse contexto.
      // Para 'messages.upsert' com 'message: null', o 'pushName' estaria no 'data' original do upsert.
      // Esta lógica assume que 'item.pushName' pode existir.
      if (item.pushName && item.pushName.trim() !== '') {
        senderName = item.pushName;
      }
      
      const messagesConfig = MessageService.getMessages();
      const useAI = MessageService.getAIUsageSetting('messageDeleted') && config.GROQ_API_KEY;
      let replyText = "";

      if (useAI) {
        let prompt = MessageService.getAIPrompt('messageDeleted') || DEFAULT_AI_PROMPTS.messageDeleted;
        prompt = prompt.replace(/{SENDER_NAME}/gi, senderName); // Usando {SENDER_NAME} como placeholder

        console.log(`WebhookHandler: Gerando mensagem de IA para mensagem apagada por ${senderName}. Prompt: ${prompt}`);
        replyText = await GroqApiService.callGroqAPI(prompt);
        if (!replyText || replyText.startsWith("Erro:") || replyText.startsWith("Não foi possível") || replyText.length < 5) {
            console.warn("WebhookHandler: Falha ao gerar mensagem de IA para mensagem apagada, usando fallback.", replyText);
            replyText = getRandomElement(messagesConfig.messageDeleted) || `Ih, ${senderName} apagou uma mensagem! Que mistério... 🤫`;
        }
      } else {
        replyText = getRandomElement(messagesConfig.messageDeleted) || `Vish, ${senderName} apagou uma mensagem!`;
      }
      
      // Garante que o nome do remetente seja incluído se não estiver e não for IA (ou se a IA falhar em incluí-lo)
      if (!replyText.toLowerCase().includes(senderName.toLowerCase())) {
          const prefixOptions = ["Eita, ", "Vish, ", "Olha só, ", "Ops, "];
          const suffixOptions = [" apagou uma mensagem!", " fez uma mensagem sumir!", " escondeu algo que disse!", " deletou o que escreveu."];
          replyText = `${getRandomElement(prefixOptions)}${senderName}${getRandomElement(suffixOptions)}`;
      }

      if (replyText) {
        await EvolutionApiService.sendMessageToGroup(replyText, config.TARGET_GROUP_ID);
        console.log(`WebhookHandler: Enviada mensagem sobre deleção para o grupo. Conteúdo: ${replyText}`);
      }
    }
  }

  return res.status(200).send('messages.update processado.');
});


export default router; 