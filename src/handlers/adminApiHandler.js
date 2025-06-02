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
    try {
        const config = ConfigService.getConfig();
        res.json({ success: true, config });
    } catch (error) {
        console.error("AdminApiHandler: Erro ao obter configurações:", error);
        res.status(500).json({ success: false, message: "Erro ao buscar configurações." });
    }
});

// Update bot configuration
router.post('/config', express.json(), async (req, res) => {
    try {
        const newConfigData = req.body;
        console.log("AdminApiHandler: Recebido POST /config com dados:", JSON.stringify(newConfigData, null, 2));

        if (typeof newConfigData !== 'object' || newConfigData === null) {
            return res.status(400).json({ success: false, message: "Payload inválido: esperado um objeto JSON." });
        }

        const updatedConfig = await ConfigService.updateConfig(newConfigData);
        
        // updateConfig agora sempre retorna o currentConfig (ou lança erro)
        res.json({ success: true, message: "Configurações gerais salvas com sucesso!", config: updatedConfig });

    } catch (error) {
        console.error("AdminApiHandler: Erro ao salvar configurações gerais:", error);
        res.status(500).json({ success: false, message: `Erro interno do servidor: ${error.message}` });
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

// Novo endpoint para substituir todas as mensagens e prompts
router.post('/messages/replace-all', express.json({ limit: '5mb' }), async (req, res) => {
    try {
        const newMessagesData = req.body;

        if (typeof newMessagesData !== 'object' || newMessagesData === null) {
            return res.status(400).json({ success: false, message: "Payload inválido: esperado um objeto JSON." });
        }

        // Chamar uma nova função no MessageService para lidar com a substituição
        const success = await MessageService.replaceAllMessagesFromJSON(newMessagesData);

        if (success) {
            res.json({ success: true, message: "Todas as mensagens e prompts foram substituídos com sucesso no banco de dados." });
        } else {
            // MessageService.replaceAllMessagesFromJSON deve logar erros específicos
            res.status(500).json({ success: false, message: "Falha ao substituir mensagens. Verifique os logs do servidor." });
        }
    } catch (error) {
        console.error("AdminApiHandler: Erro ao substituir todas as mensagens:", error);
        res.status(500).json({ success: false, message: `Erro interno do servidor: ${error.message}` });
    }
});

export default router; 