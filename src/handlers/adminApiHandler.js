import express from 'express';
import ConfigService from '../core/ConfigService.js';
import MessageService from '../core/MessageService.js';
import GroqApiService from '../core/GroqApiService.js'; // For test and generate
import SchedulerService from '../core/SchedulerService.js'; // For re-initializing time details

const router = express.Router();

// Get current messages and AI settings
router.get('/messages', (req, res) => {
  const messages = MessageService.getMessages();
  // Send a structure that the admin panel expects/can easily work with
  res.json({
    status: messages.status || {},
    newMember: messages.newMember || [],
    memberLeft: messages.memberLeft || [],
    randomActive: messages.randomActive || [],
    inGameRandom: messages.inGameRandom || [],
    extras: messages.extras || {},
    gameTips: messages.gameTips || [],
    aiPrompts: messages.aiPrompts || {},
    aiUsageSettings: messages.aiUsageSettings || {},
    botInfo: messages.botInfo || { name: "Bot Pavlov", defaultPmReply: [] },
    chatSummary: messages.chatSummary || { noNewMessages: [] }
  });
});

// Update messages and AI settings
router.post('/messages', express.json(), async (req, res) => {
  try {
    await MessageService.updateMessagesAndPrompts(req.body);
    res.json({ success: true, message: "Mensagens e configurações de IA atualizadas!" });
  } catch (error) {
    console.error("AdminApiHandler: Erro ao atualizar messages.json:", error);
    res.status(500).json({ success: false, message: "Erro ao atualizar mensagens." });
  }
});

// Get current bot configuration (safe subset)
router.get('/config', (req, res) => {
  const fullConfig = ConfigService.getConfig();
  // Return only editable and safe config values
  const safeConfig = {
    GROUP_BASE_NAME: fullConfig.GROUP_BASE_NAME,
    MESSAGES_DURING_SERVER_OPEN: fullConfig.MESSAGES_DURING_SERVER_OPEN,
    MESSAGES_DURING_DAYTIME: fullConfig.MESSAGES_DURING_DAYTIME,
    DAYTIME_START_HOUR: fullConfig.DAYTIME_START_HOUR,
    DAYTIME_END_HOUR: fullConfig.DAYTIME_END_HOUR,
    SERVER_OPEN_TIME: fullConfig.SERVER_OPEN_TIME,
    SERVER_CLOSE_TIME: fullConfig.SERVER_CLOSE_TIME,
    CHAT_SUMMARY_TIMES: fullConfig.CHAT_SUMMARY_TIMES,
    TARGET_GROUP_ID: fullConfig.TARGET_GROUP_ID,
    CHAT_SUMMARY_COUNT_PER_DAY: fullConfig.CHAT_SUMMARY_COUNT_PER_DAY,
    SEND_NO_SUMMARY_MESSAGE: fullConfig.SEND_NO_SUMMARY_MESSAGE,
    POLL_MENTION_EVERYONE: fullConfig.POLL_MENTION_EVERYONE,
    // Add any other config items the admin panel should see/edit
  };
  res.json(safeConfig);
});

// Update bot configuration
router.post('/config', express.json(), async (req, res) => {
  try {
    const configChanged = ConfigService.updateConfig(req.body); // updateConfig now calls onConfigChange
                                                              // which SchedulerService listens to.
    res.json({ success: true, message: "Configurações atualizadas com sucesso!" });
  } catch (error) {
    console.error("AdminApiHandler: Erro ao atualizar config.json:", error);
    res.status(500).json({ success: false, message: "Erro ao atualizar configurações." });
  }
});

// Test Groq API or generate a message based on a prompt
router.post('/generate-message', express.json(), async (req, res) => {
  const { prompt, type } = req.body; // type can be 'test' or a specific prompt key
  if (!prompt && !type) {
    return res.status(400).json({ success: false, message: "Prompt ou tipo de prompt necessário." });
  }

  try {
    let finalPrompt = prompt;
    if (type && !prompt) { // If type is given, use the stored prompt for that type
        finalPrompt = MessageService.getAIPrompt(type);
        if (!finalPrompt && type === 'system') finalPrompt = MessageService.getSystemPrompt(); // Special case for system
    }

    if (!finalPrompt) {
        return res.status(400).json({ success: false, message: `Nenhum prompt encontrado para o tipo: ${type}` });
    }

    const generatedMessage = await GroqApiService.callGroqAPI(finalPrompt);
    if (generatedMessage.startsWith("Erro:")) {
        res.json({ success: false, message: generatedMessage });
    } else {
        res.json({ success: true, message: generatedMessage });
    }
  } catch (error) {
    console.error("AdminApiHandler: Erro ao gerar mensagem com Groq:", error);
    res.status(500).json({ success: false, message: "Erro ao comunicar com a API Groq." });
  }
});

// Endpoint to test Groq API key specifically
router.post('/test-groq', express.json(), async (req, res) => {
    try {
        const testPrompt = "Olá! Isso é um teste.";
        const response = await GroqApiService.callGroqAPI(testPrompt);
        if (response && !response.startsWith("Erro:")) {
            res.json({ success: true, message: "API Groq funcionando! Resposta: " + response });
        } else {
            res.json({ success: false, message: "Falha ao testar API Groq. Resposta: " + response });
        }
    } catch (error) {
        console.error("AdminApiHandler: Erro ao testar API Groq:", error);
        res.status(500).json({ success: false, message: "Erro interno ao testar API Groq." });
    }
});


export default router; 