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

async function startBot() {
  console.log("Iniciando o bot Pavlov (refatorado)...");

  // Connect to Database first
  try {
    await DatabaseService.connect();
  } catch (dbError) {
    console.error("Falha crítica ao conectar ao banco de dados. Encerrando.", dbError);
    process.exit(1);
  }

  // Load configurations (ConfigService.loadConfig now fetches from DB)
  await ConfigService.loadConfig();
  let currentConfig = ConfigService.getConfig();

  // Validate critical configurations
  if (!currentConfig.EVOLUTION_API_URL || !currentConfig.EVOLUTION_API_KEY ||
      !currentConfig.INSTANCE_NAME || !currentConfig.TARGET_GROUP_ID ||
      !currentConfig.SERVER_OPEN_TIME || !currentConfig.SERVER_CLOSE_TIME ||
      !currentConfig.BOT_WEBHOOK_PORT) {
    console.error("ERRO CRÍTICO: Variáveis de ambiente/configuração cruciais não definidas. Verifique .env e config.json.");
    process.exit(1);
  }

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
  await SchedulerService.stop(); // Assuming you add a stop method to clear intervals
  await DatabaseService.close();
  console.log('Bot desligado.');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM recebido. Desligando o bot...');
  await SchedulerService.stop();
  await DatabaseService.close();
  console.log('Bot desligado.');
  process.exit(0);
}); 