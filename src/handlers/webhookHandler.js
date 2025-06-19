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
    
    const event = (innerPayload.event || '').toLowerCase();
    console.log(`[Webhook Root] Evento recebido: ${event}`);

    // Debug: Log more details for delete events
    if (event.includes('delete')) {
        console.log(`[DEBUG] Detalhes do evento de deleção:`, JSON.stringify(receivedPayload, null, 2));
    }

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
    // Tratamento unificado para eventos de exclusão de mensagens
    if (event === 'messages.delete' || event === 'message.delete' || event === 'messages.update' || event === 'message.update') {
      console.log(`[Webhook Root] Evento de possível exclusão de mensagem '${event}' recebido, roteando para lógica de deleção.`);
      req.url = '/messages-delete';
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
      
      // Verificar se o usuário é admin antes de responder a mensagens privadas
      const isAdmin = await EvolutionApiService.isUserAdmin(config.TARGET_GROUP_ID, actualSenderJid);
      
      if (isAdmin) {
        // Responder apenas se o usuário for administrador
        const defaultReply = getRandomElement(messages.botInfo?.defaultPmReply) || "Olá! Sou um bot. Para comandos (se você for admin), digite !start em uma conversa privada comigo.";
        try {
          await EvolutionApiService.sendMessageToGroup(defaultReply, actualSenderJid);
        } catch (error) {
          console.error(`WebhookHandler: Erro ao enviar resposta PM padrão para ${actualSenderJid}:`, error);
        }
      } else {
        console.log(`WebhookHandler: Ignorando mensagem privada de usuário não-admin: ${actualSenderJid}`);
        // Não responde a usuários que não são administradores
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

// Rota unificada para tratamento de mensagens apagadas
router.post('/messages-delete', async (req, res) => {
  const fullReceivedPayload = req.body;
  const updatesOrDeletedItems = fullReceivedPayload.data; 
  const config = ConfigService.getConfig();
  const eventType = (fullReceivedPayload.event || '').toLowerCase();
  console.log(`[DEBUG] Início do processamento de evento de deleção (${eventType}).`);
  console.log(`WebhookHandler: Evento de possível deleção de mensagem (${eventType}) recebido:`, JSON.stringify(fullReceivedPayload, null, 2));

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

    console.log(`[DEBUG] Processando item com key:`, JSON.stringify(key, null, 2));

    let isMessageEffectivelyDeleted = false;
    if (eventType.includes('delete')) {
        isMessageEffectivelyDeleted = true;
        console.log(`WebhookHandler: ${eventType} - Item de deleção direta:`, JSON.stringify(item, null, 2));
    } else if (eventType.includes('update') && updateContent && updateContent.message === null) {
        isMessageEffectivelyDeleted = true;
        console.log(`WebhookHandler: ${eventType} - Item de atualização indicando deleção:`, JSON.stringify(item, null, 2));
    }

    console.log(`[DEBUG] isMessageEffectivelyDeleted: ${isMessageEffectivelyDeleted}`);
    console.log(`[DEBUG] key.remoteJid: ${key.remoteJid}`);
    console.log(`[DEBUG] config.TARGET_GROUP_ID: ${config.TARGET_GROUP_ID}`);
    console.log(`[DEBUG] key.fromMe: ${key.fromMe}`);

    if (isMessageEffectivelyDeleted && key.remoteJid === config.TARGET_GROUP_ID && !key.fromMe) {
      console.log(`WebhookHandler: Mensagem apagada (evento: ${eventType}) detectada no grupo ${key.remoteJid}. Key:`, JSON.stringify(key));

      // Obter o autor original da mensagem a partir do key.participant (para grupos)
      const participant = key.participant || null;
      const senderName = participant ? participant.split('@')[0] : "alguém";
      const messages = MessageService.getMessages();
      
      // Verificar se devemos responder à deleção com uma mensagem padrão ou gerada por IA
      const useAI = MessageService.getAIUsageSetting('messageDeleted') && config.GROQ_API_KEY;
      let deletionMessage;
      
      if (useAI) {
        try {
          // Substituir [NomeDoRemetente] pelo nome do remetente real no prompt
          const customPrompt = MessageService.getAIPrompt('messageDeleted')?.replace('[NomeDoRemetente]', senderName);
          console.log(`[DEBUG] Prompt para IA: ${customPrompt}`);
          deletionMessage = await GroqApiService.callGroqAPI(customPrompt);
          console.log(`[DEBUG] Resposta da IA: ${deletionMessage}`);
          
          if (!deletionMessage || deletionMessage.startsWith('Erro') || deletionMessage.length < 5) {
            deletionMessage = getRandomElement(messages.messageDeleted) || `${senderName} apagou uma mensagem... 🤔`;
            console.log(`[DEBUG] Usando mensagem padrão: ${deletionMessage}`);
          }
        } catch (error) {
          console.error('WebhookHandler: Erro ao gerar resposta de AI para mensagem apagada:', error);
          deletionMessage = getRandomElement(messages.messageDeleted) || `${senderName} apagou uma mensagem... 🤔`;
          console.log(`[DEBUG] Erro na IA, usando mensagem padrão: ${deletionMessage}`);
        }
      } else {
        deletionMessage = getRandomElement(messages.messageDeleted) || `${senderName} apagou uma mensagem... 🤔`;
        // Substituir [NomeDoRemetente] pelo nome do remetente real na mensagem padrão, se existir
        deletionMessage = deletionMessage.replace('[NomeDoRemetente]', senderName);
        console.log(`[DEBUG] Não usando IA, mensagem: ${deletionMessage}`);
      }
      
      // Garantir que o nome do remetente está incluído na mensagem
      if (!deletionMessage.toLowerCase().includes(senderName.toLowerCase())) {
        const prefixOptions = ["Eita, ", "Vish, ", "Olha só, ", "Ops, "];
        const suffixOptions = [" apagou uma mensagem!", " fez uma mensagem sumir!", " escondeu algo que disse!", " deletou o que escreveu."];
        deletionMessage = `${getRandomElement(prefixOptions)}${senderName}${getRandomElement(suffixOptions)}`;
        console.log(`[DEBUG] Recriando mensagem para incluir o nome: ${deletionMessage}`);
      }
      
      // Enviar resposta para a mensagem apagada
      if (deletionMessage) {
        try {
          console.log(`[DEBUG] Tentando enviar mensagem: ${deletionMessage}`);
          const result = await EvolutionApiService.sendMessageToGroup(deletionMessage, config.TARGET_GROUP_ID);
          console.log(`[DEBUG] Resultado do envio:`, JSON.stringify(result, null, 2));
          
          if (result && result.success) {
            console.log(`WebhookHandler: Mensagem de resposta enviada com sucesso para mensagem apagada: ${deletionMessage}`);
          } else {
            console.error('WebhookHandler: Falha ao enviar mensagem de resposta para mensagem apagada:', result?.error || 'Erro desconhecido');
          }
        } catch (error) {
          console.error('WebhookHandler: Erro ao enviar resposta para mensagem apagada:', error);
        }
      }
    } else {
      console.log(`[DEBUG] Ignorando item pois não é uma mensagem apagada no grupo alvo ou é do próprio bot`);
    }
  }

  console.log(`[DEBUG] Processamento do evento ${eventType} concluído.`);
  return res.status(200).send(`Evento ${eventType} processado com sucesso.`);
});


export default router; 