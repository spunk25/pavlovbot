import 'dotenv/config'; // Ensure .env is loaded first
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// Core Services
import ConfigService from './core/ConfigService.js';
import MessageService from './core/MessageService.js';
import ChatHistoryService from './core/ChatHistoryService.js'; // Loaded on import
import EvolutionApiService from './core/EvolutionApiService.js';
import GroqApiService from './core/GroqApiService.js';
import SchedulerService from './core/SchedulerService.js';
import DatabaseService from './core/DatabaseService.js'; // New Import

// Handlers
import webhookHandler from './handlers/webhookHandler.js';
import adminApiHandler from './handlers/adminApiHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Função auxiliar para verificar configurações críticas
function checkCriticalConfigs(config) {
  const missingConfigs = [];

  // Configurações que são absolutamente necessárias para o funcionamento do bot
  const REQUIRED_CONFIGS = [
    { key: 'EVOLUTION_API_URL', description: 'URL da API Evolution (ex: https://evo.audiozap.app)' },
    { key: 'EVOLUTION_API_KEY', description: 'Chave de API da Evolution' },
    { key: 'INSTANCE_NAME', description: 'Nome da instância na Evolution API' },
    { key: 'TARGET_GROUP_ID', description: 'ID do grupo alvo do WhatsApp (ex: 553499999999-1615888888@g.us)' },
    { key: 'BOT_WEBHOOK_PORT', description: 'Porta para o webhook do bot (ex: 8080)' }
  ];

  // Configurações desejáveis, mas não críticas (serão gerados avisos, não erros)
  const RECOMMENDED_CONFIGS = [
    { key: 'SERVER_OPEN_TIME', description: 'Hora de abertura do servidor (ex: 19:00)' },
    { key: 'SERVER_CLOSE_TIME', description: 'Hora de fechamento do servidor (ex: 23:59)' },
    { key: 'MONGODB_URI', description: 'URI de conexão ao MongoDB' },
    { key: 'BOT_PUBLIC_URL', description: 'URL pública do bot para webhooks' }
  ];

  for (const { key, description } of REQUIRED_CONFIGS) {
    if (!config[key]) {
      missingConfigs.push({ key, description, isCritical: true });
    }
  }

  for (const { key, description } of RECOMMENDED_CONFIGS) {
    if (!config[key]) {
      missingConfigs.push({ key, description, isCritical: false });
    }
  }

  return missingConfigs;
}

async function startBot() {
  console.log("Iniciando o bot Pavlov (refatorado)...");

  // Connect to Database first
  try {
    await DatabaseService.connect();
  } catch (dbError) {
    console.error("Falha crítica ao conectar ao banco de dados. Encerrando.", dbError);
    console.error("Certifique-se de que a variável de ambiente MONGODB_URI está configurada corretamente.");
    console.error("Exemplo: MONGODB_URI='mongodb://localhost:27017/pavlovBot'");
    process.exit(1);
  }

  // Load configurations (ConfigService.loadConfig now fetches from DB)
  await ConfigService.loadConfig();
  let currentConfig = ConfigService.getConfig();

  // Validate critical configurations
  const missingConfigs = checkCriticalConfigs(currentConfig);
  
  if (missingConfigs.length > 0) {
    const criticalMissing = missingConfigs.filter(conf => conf.isCritical);
    const recommendedMissing = missingConfigs.filter(conf => !conf.isCritical);
    
    if (criticalMissing.length > 0) {
      console.error("\n=== ERRO CRÍTICO: CONFIGURAÇÃO INCOMPLETA ===");
      console.error("As seguintes configurações cruciais não foram definidas:");
      criticalMissing.forEach(({ key, description }) => {
        console.error(`- ${key}: ${description}`);
      });
      console.error("\nConfigurações podem ser definidas:");
      console.error("1. No arquivo .env na raiz do projeto");
      console.error("2. No painel de administração após a primeira inicialização");
      console.error("3. Nas variáveis de ambiente do sistema");
      console.error("\nO bot não pode iniciar sem essas configurações. Encerrando.");
      process.exit(1);
    }
    
    if (recommendedMissing.length > 0) {
      console.warn("\n⚠️ AVISO: CONFIGURAÇÕES RECOMENDADAS AUSENTES ⚠️");
      console.warn("As seguintes configurações recomendadas não foram encontradas:");
      recommendedMissing.forEach(({ key, description }) => {
        console.warn(`- ${key}: ${description}`);
      });
      console.warn("\nO bot irá iniciar, mas algumas funcionalidades podem não operar corretamente.");
    }
  }

  // Load messages (MessageService.loadMessages now fetches from DB or initializes)
  await MessageService.loadMessages();

  // Initialize services with dependencies
  // MessageService is loaded on import
  EvolutionApiService.initialize(currentConfig); // Pass the live config object
  GroqApiService.initialize(currentConfig, MessageService); // Pass live config and MessageService
  
  // Setup listener for config changes to re-initialize services if needed
  ConfigService.setOnConfigChange((newConfig, timeSettingsChanged) => {
    console.log("app.js: Configuração alterada, reavaliando serviços...");
    currentConfig = newConfig; // Update local reference if needed, though services should get it directly or be re-initialized
    EvolutionApiService.updateApiClient(newConfig); // Update API client with new URL/Key
    // GroqApiService might need re-init if its config (e.g. key) changes, but key is usually from .env
    // SchedulerService needs to re-initialize its time details if they changed
    if (timeSettingsChanged) {
        console.log("app.js: Configurações de tempo alteradas, reinicializando detalhes de tempo do SchedulerService.");
        SchedulerService.initializeTimeDetails();
    }
  });


  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Serve static files for admin panel
  const publicPath = path.join(__dirname, '..', 'public');
  app.use(express.static(publicPath));
  app.use('/admin', express.static(path.join(publicPath, 'admin.html'))); // Serve admin.html at /admin


  // Register Handlers
  app.use('/webhook', webhookHandler);
  app.use('/admin/api', adminApiHandler);

  // Start the scheduler
  SchedulerService.start(); // This also calls initializeBotStatus internally

  // Start Express server
  app.listen(currentConfig.BOT_WEBHOOK_PORT, () => {
    console.log(`Servidor de webhook escutando na porta ${currentConfig.BOT_WEBHOOK_PORT}`);
    const publicUrl = currentConfig.BOT_PUBLIC_URL || `http://SEU_IP_OU_DOMINIO:${currentConfig.BOT_WEBHOOK_PORT}`;
    console.log(`Configure o webhook na Evolution API para: ${publicUrl}/webhook`);
    console.log(`Painel de Administração disponível em: ${publicUrl}/admin ou ${publicUrl}/admin.html`);
    console.log("Eventos Webhook configurados: 'messages.upsert', 'group.participants.update', 'connection.update'.");
    console.log("Bot Pavlov (refatorado) iniciado e pronto.");
    console.log(`Grupo Alvo: ${currentConfig.TARGET_GROUP_ID}`);
    console.log(`Servidor abre: ${currentConfig.SERVER_OPEN_TIME}, Fecha: ${currentConfig.SERVER_CLOSE_TIME} (Fuso: ${currentConfig.TIMEZONE})`);
  });
}

startBot().catch(error => {
  console.error("Falha catastrófica ao iniciar o bot:", error);
  DatabaseService.close().finally(() => process.exit(1)); // Ensure DB connection is closed on error
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('SIGINT recebido. Desligando o bot...');
  SchedulerService.stop(); // Removido await pois stop não é async
  await DatabaseService.close();
  console.log('Bot desligado.');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM recebido. Desligando o bot...');
  SchedulerService.stop(); // Removido await pois stop não é async
  await DatabaseService.close();
  console.log('Bot desligado.');
  process.exit(0);
}); 