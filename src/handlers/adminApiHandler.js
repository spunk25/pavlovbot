import express from 'express';
import ConfigService from '../core/ConfigService.js';
import MessageService from '../core/MessageService.js';
import GroqApiService from '../core/GroqApiService.js'; // For test and generate
import SchedulerService from '../core/SchedulerService.js'; // For re-initializing time details
import ChatHistoryService from '../core/ChatHistoryService.js'; // Novo import
import EvolutionApiService from '../core/EvolutionApiService.js'; // Added for Evolution API
import { DEFAULT_AI_PROMPTS } from '../constants/aiConstants.js';
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
    randomJokes: messages.randomJokes || [],
    aiPrompts: messages.aiPrompts || {},
    messageDeleted: messages.messageDeleted || [],
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
  console.log(`[DEBUG] /generate-message recebido com tipo: ${type}, prompt fornecido: ${prompt ? 'sim' : 'não'}`);
  
  if (!prompt && !type) {
    console.error("[DEBUG] Erro: Nem prompt nem tipo fornecidos");
    return res.status(400).json({ success: false, message: "Prompt ou tipo de prompt necessário." });
  }

  try {
    let finalPrompt = prompt;
    
    if (type && !prompt) { // If type is given, use the stored prompt for that type
        // Tratamento especial para randomJoke
        if (type === 'randomJoke') {
            finalPrompt = MessageService.getAIPrompt('randomJoke');
            console.log(`[DEBUG] Tipo randomJoke detectado, usando prompt específico: ${finalPrompt ? finalPrompt.substring(0, 50) + '...' : 'não encontrado'}`);
        } else if (type === 'gameTip') {
            finalPrompt = MessageService.getAIPrompt('gameTip');
            console.log(`[DEBUG] Tipo gameTip detectado, usando prompt específico: ${finalPrompt ? finalPrompt.substring(0, 50) + '...' : 'não encontrado'}`);
            // Se não houver prompt específico para dicas, usar um padrão
            if (!finalPrompt) {
                finalPrompt = "Gere uma dica útil e curta para jogadores de Pavlov VR, relacionada a táticas, controles ou mecânicas do jogo.";
                console.log(`[DEBUG] Usando prompt padrão para gameTip`);
            }
        } else {
            finalPrompt = MessageService.getAIPrompt(type);
            console.log(`[DEBUG] Tipo ${type} detectado, prompt encontrado: ${finalPrompt ? 'sim' : 'não'}`);
        }
        
        if (!finalPrompt && type === 'system') {
            finalPrompt = MessageService.getSystemPrompt(); // Special case for system
            console.log(`[DEBUG] Usando system prompt para tipo 'system'`);
        }
    }

    if (!finalPrompt) {
        console.error(`[DEBUG] Nenhum prompt encontrado para o tipo: ${type}`);
        return res.status(400).json({ success: false, message: `Nenhum prompt encontrado para o tipo: ${type}` });
    }

    console.log(`[DEBUG] Chamando GroqAPI com prompt: ${finalPrompt.substring(0, 100)}...`);
    const generatedMessage = await GroqApiService.callGroqAPI(finalPrompt);
    console.log(`[DEBUG] Resposta da GroqAPI: ${generatedMessage.substring(0, 100)}...`);
    
    if (generatedMessage.startsWith("Erro:")) {
        console.error(`[DEBUG] Erro retornado da GroqAPI: ${generatedMessage}`);
        res.json({ success: false, message: generatedMessage });
    } else {
        console.log(`[DEBUG] Mensagem gerada com sucesso para tipo ${type}`);
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

// Endpoints para Gerenciamento de Histórico de Chat
router.get('/chat-history-db', async (req, res) => {
    try {
        const history = await ChatHistoryService.getChatHistory();
        res.json({ success: true, history });
    } catch (error) {
        console.error("AdminApiHandler: Erro ao buscar histórico de chat do DB:", error);
        res.status(500).json({ success: false, message: "Erro ao buscar histórico de chat do banco de dados." });
    }
});

router.post('/simulate-chat-summary-db', async (req, res) => {
    try {
        let historyForSummary = await ChatHistoryService.getChatHistory();
        let sourceMessage = "histórico do banco de dados";

        const config = ConfigService.getConfig(); // Mova para cima para usar antes

        if (!historyForSummary || historyForSummary.length === 0) {
            console.log("AdminApiHandler (Simulate): Histórico do DB vazio. Tentando fallback da API Evolution.");
            const apiMessages = await EvolutionApiService.getLatestGroupMessages(config.TARGET_GROUP_ID, 20);
            if (apiMessages && apiMessages.length > 0) {
                historyForSummary = apiMessages;
                sourceMessage = `API da Evolution (${apiMessages.length} mensagens recentes)`;
            } else {
                return res.json({ success: true, summary: `Nenhuma mensagem no histórico do banco de dados e nenhuma mensagem recente obtida da API para resumir.` });
            }
        }

        if (!config.GROQ_API_KEY) {
            return res.status(400).json({ success: false, message: "Chave da API Groq não configurada. Não é possível gerar resumo." });
        }

        const chatToSummarizeFormatted = ChatHistoryService.formatChatForSummary(historyForSummary);
        const baseChatSummaryPrompt = MessageService.getAIPrompt('chatSummary');
        
        if (!baseChatSummaryPrompt) {
             return res.status(400).json({ success: false, message: "Prompt base para resumo de chat não encontrado nas configurações de mensagens." });
        }

        const prompt = baseChatSummaryPrompt.replace('{CHAT_PLACEHOLDER}', chatToSummarizeFormatted);

        console.log(`AdminApiHandler: Tentando gerar resumo simulado para ${historyForSummary.length} mensagens de ${sourceMessage}.`);
        const summary = await GroqApiService.callGroqAPI(prompt);

        if (summary && !summary.startsWith("Erro") && !summary.startsWith("Não foi possível")) {
            res.json({ success: true, summary });
        } else {
            console.warn("AdminApiHandler: Falha ao gerar resumo simulado ou resumo inválido:", summary);
            res.json({ success: false, message: `Falha ao gerar resumo pela IA: ${summary}` });
        }
    } catch (error) {
        console.error("AdminApiHandler: Erro ao simular resumo do chat:", error);
        res.status(500).json({ success: false, message: `Erro interno ao simular resumo: ${error.message}` });
    }
});

router.post('/clear-chat-history-db', async (req, res) => {
    try {
        await ChatHistoryService.clearChatHistory();
        res.json({ success: true, message: "Histórico de chat do banco de dados limpo com sucesso." });
    } catch (error) {
        console.error("AdminApiHandler: Erro ao limpar histórico de chat do DB:", error);
        res.status(500).json({ success: false, message: "Erro ao limpar histórico de chat do banco de dados." });
    }
});

export default router; 