import EvolutionApiService from '../core/EvolutionApiService.js';
import GroqApiService from '../core/GroqApiService.js';
import SchedulerService from '../core/SchedulerService.js';
import ConfigService from '../core/ConfigService.js';
import MessageService from '../core/MessageService.js';
import ChatHistoryService from '../core/ChatHistoryService.js'; // For !resumo

async function handleCommand(command, args, fullMessage, senderJid, isGroupMessage, isAdminInTargetGroup) {
  const config = ConfigService.getConfig();
  const messages = MessageService.getMessages();
  let commandProcessed = false;

  const helpText =
    `👋 Olá! Eu sou o ${messages.botInfo?.name || "Bot Pavlov"}.\n` +
    "Comandos disponíveis (apenas para admins do grupo alvo, via MENSAGEM PRIVADA para o bot):\n\n" +
    "• !start       – Mostra esta ajuda.\n" +
    "• !jogar?      – Envia enquete 'Vai jogar hoje?' para o grupo alvo.\n" +
    "• !random      – Envia mensagem aleatória (IA/Dica) para o grupo alvo.\n" +
    "• !abrir       – Força status 'Servidor Aberto 🟢' para o grupo alvo.\n" +
    "• !fechar      – Força status 'Servidor Fechado 🔴' para o grupo alvo.\n" +
    "• !falar <msg> – Envia <msg> para o grupo alvo.\n" +
    "• !audio <URL> – Envia áudio da <URL> para o grupo alvo.\n" +
    '• !enquete "Título" "Opção 1" ... – Envia enquete customizada para o grupo alvo.\n' +
    "• !resumo      – Gera e envia resumo do chat atual para o grupo alvo.\n" +
    "• !statusjobs  – Mostra o status das tarefas agendadas (para admin em PV).\n" +
    "• !teste       – Envia uma mensagem de teste para você (admin em PV).";


  if (!isGroupMessage) { // Command is from a Private Message
    if (isAdminInTargetGroup) {
      switch (command) {
        case '!start':
          await EvolutionApiService.sendMessageToGroup(helpText, senderJid);
          commandProcessed = true;
          break;
        case '!teste':
          await EvolutionApiService.sendMessageToGroup("Testado por admin! Esta mensagem é para você.", senderJid);
          commandProcessed = true;
          break;
        case '!abrir':
          await SchedulerService.triggerServerOpen();
          await EvolutionApiService.sendMessageToGroup("Servidor aberto manualmente via comando. Status do agendador pode levar um ciclo para refletir.", senderJid);
          commandProcessed = true;
          break;
        case '!fechar':
          await SchedulerService.triggerServerClose();
          await EvolutionApiService.sendMessageToGroup("Servidor fechado manualmente via comando. Status do agendador pode levar um ciclo para refletir.", senderJid);
          commandProcessed = true;
          break;
        case '!random':
          const randomMsg = await SchedulerService.getAIRandomMessage();
          if (randomMsg) await EvolutionApiService.sendMessageToGroup(randomMsg, config.TARGET_GROUP_ID);
          await EvolutionApiService.sendMessageToGroup("Mensagem aleatória enviada para o grupo.", senderJid);
          commandProcessed = true;
          break;
        case '!jogar?':
          await EvolutionApiService.sendPoll(
            "Ei!! Você 🫵 vai jogar Pavlov hoje?",
            ["Sim, vou!", "Talvez mais tarde", "Hoje não"],
            config.TARGET_GROUP_ID
          );
          await EvolutionApiService.sendMessageToGroup("Enquete '!jogar?' enviada para o grupo.", senderJid);
          commandProcessed = true;
          break;
        case '!audio':
          if (args.length > 0 && args[0].startsWith('http')) {
            await EvolutionApiService.sendNarratedAudio(args[0], config.TARGET_GROUP_ID);
            await EvolutionApiService.sendMessageToGroup(`Áudio enviado para o grupo: ${args[0]}`, senderJid);
          } else {
            await EvolutionApiService.sendMessageToGroup("Uso: !audio <URL_DO_AUDIO>", senderJid);
          }
          commandProcessed = true;
          break;
        case '!enquete':
          const fullArgsString = args.join(" ");
          const normalizedArgs = fullArgsString.replace(/[“”]/g, '"');
          const pollArgs = normalizedArgs.match(/"([^"]+)"/g);
          
          if (pollArgs && pollArgs.length >= 2) {
            const pollTitle = pollArgs[0].slice(1, -1);
            const pollOptions = pollArgs.slice(1).map(opt => opt.slice(1, -1));

            if (pollTitle && pollOptions.length > 0) {
              await EvolutionApiService.sendPoll(pollTitle, pollOptions, config.TARGET_GROUP_ID);
              await EvolutionApiService.sendMessageToGroup(`Enquete "${pollTitle}" enviada para o grupo.`, senderJid);
            } else {
              await EvolutionApiService.sendMessageToGroup('Uso: !enquete "Título" "Opção1" "Opção2" ... (Certifique-se de usar aspas para títulos/opções com espaços)', senderJid);
            }
          } else {
            await EvolutionApiService.sendMessageToGroup('Uso: !enquete "Título" "Opção1" "Opção2" ... (Certifique-se de usar aspas para títulos/opções com espaços)', senderJid);
          }
          commandProcessed = true;
          break;
        case '!statusjobs':
          const statusReport = SchedulerService.getStatusForAdmin();
          await EvolutionApiService.sendMessageToGroup(statusReport, senderJid);
          commandProcessed = true;
          break;
        case '!falar':
        case '!anunciar':
          const messageToSend = args.join(" ");
          if (messageToSend) {
            await EvolutionApiService.sendMessageToGroup(messageToSend, config.TARGET_GROUP_ID);
            await EvolutionApiService.sendMessageToGroup("✅ Mensagem enviada para o grupo.", senderJid);
          } else {
            await EvolutionApiService.sendMessageToGroup("⚠️ Uso: !falar <sua mensagem>", senderJid);
          }
          commandProcessed = true;
          break;
        case '!resumo':
        case '!summarynow':
          const currentChatHistory = await ChatHistoryService.getChatHistory();
          if (currentChatHistory.length > 0) {
            await EvolutionApiService.sendMessageToGroup("⏳ Gerando resumo do chat sob demanda...", senderJid);
            await SchedulerService.triggerChatSummary(); // This sends to TARGET_GROUP_ID
            await EvolutionApiService.sendMessageToGroup("✅ Resumo do chat solicitado. Verifique o grupo.", senderJid);
          } else {
            await EvolutionApiService.sendMessageToGroup("ℹ️ Não há mensagens no histórico para resumir no momento.", senderJid);
          }
          commandProcessed = true;
          break;
        default:
          await EvolutionApiService.sendMessageToGroup(`Comando "${command}" não reconhecido. Digite !start para a lista.`, senderJid);
          commandProcessed = true;
          break;
      }
    } else { // Non-admin sent a command in PM
      // Não responder nada para não-administradores que tentam usar comandos em PM
      console.log(`CommandHandler: Comando '${command}' ignorado de usuário não-admin ${senderJid} em PM.`);
      commandProcessed = true;
    }
  } else { // Command is from a Group Message (and it's the TARGET_GROUP_ID)
    if (isAdminInTargetGroup) {
      // Admin tried to use a command in the group
      await EvolutionApiService.sendMessageToGroup("Por favor, envie comandos para mim em uma mensagem privada (PV).", senderJid); // Inform admin in their PM
      commandProcessed = true;
    } else {
      // Non-admin tried to use a command in the group - silently ignore
      console.log(`CommandHandler: Comando '${fullMessage}' de usuário não-admin ${senderJid} no grupo ${config.TARGET_GROUP_ID} ignorado.`);
      commandProcessed = true; // Mark as processed to prevent further action
    }
  }
  return commandProcessed;
}

export default {
  handleCommand
}; 