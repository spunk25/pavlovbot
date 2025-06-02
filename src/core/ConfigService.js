import { parseTime } from '../utils/generalUtils.js';
import DatabaseService from './DatabaseService.js'; // New import
import dotenv from 'dotenv';

dotenv.config();

const envConfig = process.env;
const CONFIG_COLLECTION_NAME = 'configurations';
const CONFIG_DOC_ID = 'mainBotConfig';

// Valores padrão, usados se não encontrados no DB ou para garantir que todas as chaves existam.
// Prioriza variáveis de ambiente, depois valores codificados.
const DEFAULTS = {
    EVOLUTION_API_URL: process.env.EVOLUTION_API_URL || '',
    INSTANCE_NAME: process.env.INSTANCE_NAME || '',
    EVOLUTION_API_KEY: process.env.EVOLUTION_API_KEY || '',
    GROQ_API_KEY: process.env.GROQ_API_KEY || '',
    TARGET_GROUP_ID: process.env.TARGET_GROUP_ID || '',
    GROUP_BASE_NAME: process.env.GROUP_BASE_NAME || 'Pavlov VR Server',
    SERVER_OPEN_TIME: process.env.SERVER_OPEN_TIME || '19:00',
    SERVER_CLOSE_TIME: process.env.SERVER_CLOSE_TIME || '23:59',
    TIMEZONE: process.env.TIMEZONE || 'America/Sao_Paulo',
    MESSAGES_DURING_SERVER_OPEN: parseInt(process.env.MESSAGES_DURING_SERVER_OPEN, 10) || 3,
    MESSAGES_DURING_DAYTIME: parseInt(process.env.MESSAGES_DURING_DAYTIME, 10) || 2,
    DAYTIME_START_HOUR: parseInt(process.env.DAYTIME_START_HOUR, 10) || 9,
    DAYTIME_END_HOUR: parseInt(process.env.DAYTIME_END_HOUR, 10) || 18,
    CHAT_SUMMARY_TIMES: (process.env.CHAT_SUMMARY_TIMES || '12:00,22:00').split(',').map(t => t.trim()).filter(t => t),
    BOT_WEBHOOK_PORT: parseInt(process.env.BOT_WEBHOOK_PORT, 10) || 3000,
    BOT_PUBLIC_URL: process.env.BOT_PUBLIC_URL || '',
    POLL_MENTION_EVERYONE: process.env.POLL_MENTION_EVERYONE === 'true', // Booleano
    CHAT_SUMMARY_ENABLED: process.env.CHAT_SUMMARY_ENABLED === 'true',   // Booleano
    CHAT_SUMMARY_COUNT_PER_DAY: parseInt(process.env.CHAT_SUMMARY_COUNT_PER_DAY, 10) || 2,
};

let currentConfig = { ...DEFAULTS }; // Inicializa com padrões
let onConfigChangeCallback = null;

async function loadConfig() {
    console.log("ConfigService: Iniciando carregamento de configurações...");
    try {
        const db = await DatabaseService.getDb();
        const collection = db.collection(CONFIG_COLLECTION_NAME);
        const dbConfig = await collection.findOne({ _id: CONFIG_DOC_ID });

        if (dbConfig) {
            console.log("ConfigService: Configuração encontrada no MongoDB.");
            // Remove _id de dbConfig antes de fazer o merge para não sobrescrever DEFAULTS._id se existir
            const { _id, ...configFromDb } = dbConfig;
            currentConfig = { ...DEFAULTS, ...configFromDb };

            // Garantir tipos corretos após carregar do DB
            Object.keys(DEFAULTS).forEach(key => {
                if (currentConfig[key] === undefined) { // Se uma nova chave default foi adicionada e não está no DB
                    currentConfig[key] = DEFAULTS[key];
                } else if (typeof DEFAULTS[key] === 'number') {
                    currentConfig[key] = parseInt(currentConfig[key], 10);
                    if (isNaN(currentConfig[key])) currentConfig[key] = DEFAULTS[key];
                } else if (typeof DEFAULTS[key] === 'boolean') {
                    currentConfig[key] = String(currentConfig[key]).toLowerCase() === 'true';
                } else if (key === 'CHAT_SUMMARY_TIMES') {
                    if (typeof currentConfig[key] === 'string') {
                        currentConfig[key] = currentConfig[key].split(',').map(t => t.trim()).filter(t => t);
                    } else if (!Array.isArray(currentConfig[key])) {
                        currentConfig[key] = DEFAULTS[key]; // Fallback para o array padrão
                    }
                }
            });
        } else {
            console.warn(`ConfigService: Nenhuma configuração encontrada no MongoDB para ID '${CONFIG_DOC_ID}'. Usando e salvando padrões.`);
            currentConfig = { ...DEFAULTS };
            await collection.insertOne({ _id: CONFIG_DOC_ID, ...currentConfig });
            console.log("ConfigService: Configurações padrão salvas no MongoDB.");
        }
        console.log("ConfigService: Configuração final carregada:", JSON.stringify(currentConfig, null, 2));
    } catch (error) {
        console.error("ConfigService: Erro ao carregar configuração do MongoDB. Usando padrões em memória.", error);
        currentConfig = { ...DEFAULTS }; // Fallback para padrões em caso de erro grave
    }
    return currentConfig;
}

function logCurrentConfig() {
  console.log("Configurações finais do bot:", {
    ...currentConfig,
    EVOLUTION_API_KEY: currentConfig.EVOLUTION_API_KEY ? '***' : '',
    GROQ_API_KEY: currentConfig.GROQ_API_KEY ? '***' : '',
    TIMEZONE: currentConfig.TIMEZONE,
    BOT_PUBLIC_URL: currentConfig.BOT_PUBLIC_URL,
    CHAT_SUMMARY_TIMES: Array.isArray(currentConfig.CHAT_SUMMARY_TIMES) ? currentConfig.CHAT_SUMMARY_TIMES : [],
    CHAT_SUMMARY_COUNT_PER_DAY: currentConfig.CHAT_SUMMARY_COUNT_PER_DAY,
    SEND_NO_SUMMARY_MESSAGE: currentConfig.SEND_NO_SUMMARY_MESSAGE,
    POLL_MENTION_EVERYONE: currentConfig.POLL_MENTION_EVERYONE
  });
}

async function saveConfig() {
  try {
    const db = await DatabaseService.getDb();
    const collection = db.collection(CONFIG_COLLECTION_NAME);

    // Prepare the config to save, excluding _id for the update operation's $set
    const { _id, ...configToSaveToDb } = currentConfig; 

    // Only save non-env overridden values to DB, or values that are part of the base schema
    // This is tricky. For now, let's save the current state of currentConfig that isn't directly from .env
    // OR, more simply, save all fields that are part of our defined `DEFAULTS` structure.
    // This ensures that if an .env var is removed, the DB value persists.
    
    const dbPayload = {};
    const defaultConfigKeys = Object.keys({ // Use the structure of initial defaults
        EVOLUTION_API_URL: '', INSTANCE_NAME: '', TARGET_GROUP_ID: '', BOT_WEBHOOK_PORT: 0,
        SERVER_OPEN_TIME: '', SERVER_CLOSE_TIME: '', GROUP_BASE_NAME: '',
        MESSAGES_DURING_SERVER_OPEN: 0, MESSAGES_DURING_DAYTIME: 0,
        DAYTIME_START_HOUR: 0, DAYTIME_END_HOUR: 0, TIMEZONE: '', BOT_PUBLIC_URL: '',
        CHAT_SUMMARY_TIMES: [], CHAT_SUMMARY_COUNT_PER_DAY: 0,
        SEND_NO_SUMMARY_MESSAGE: false, POLL_MENTION_EVERYONE: true,
        // Include API keys if you decide to store them in DB (conditionally)
        EVOLUTION_API_KEY: '', GROQ_API_KEY: ''
    });

    for (const key of defaultConfigKeys) {
        if (currentConfig[key] !== undefined) {
            // Do not save API keys to DB if they are coming from .env
            if ((key === 'EVOLUTION_API_KEY' || key === 'GROQ_API_KEY') && envConfig[key]) {
                continue; // Skip saving to DB if .env provides it
            }
            dbPayload[key] = currentConfig[key];
        }
    }

    await collection.updateOne(
      { _id: CONFIG_DOC_ID },
      { $set: dbPayload },
      { upsert: true } // Create if it doesn't exist
    );
    console.log("ConfigService: Configurations saved to MongoDB.");
  } catch (error) {
    console.error("ConfigService: Error saving configurations to MongoDB:", error);
  }
}

function getConfig() {
  return { ...currentConfig };
}

async function updateConfig(newConfigDataFromForm) {
    console.log("ConfigService: Recebido para atualização (dados do formulário):", JSON.stringify(newConfigDataFromForm, null, 2));
    
    const oldConfigSnapshot = { ...currentConfig };
    let timeSettingsChanged = false;
    
    // Crie uma cópia para modificação, começando com os padrões para garantir que todas as chaves existam
    let processedConfig = { ...DEFAULTS }; 

    // Mescle com a configuração atual em memória (que pode ter vindo do DB)
    processedConfig = { ...processedConfig, ...currentConfig };

    // Agora, mescle com os novos dados do formulário, aplicando conversões de tipo
    for (const key in newConfigDataFromForm) {
        if (Object.prototype.hasOwnProperty.call(newConfigDataFromForm, key)) {
            let formValue = newConfigDataFromForm[key];
            let defaultValueType = typeof DEFAULTS[key];
            let targetValue = formValue; // Valor que será atribuído

            if (DEFAULTS[key] !== undefined) { // Processa apenas chaves conhecidas (presentes em DEFAULTS)
                if (defaultValueType === 'number') {
                    targetValue = parseInt(formValue, 10);
                    if (isNaN(targetValue)) targetValue = DEFAULTS[key]; // Fallback se NaN
                } else if (defaultValueType === 'boolean') {
                    targetValue = String(formValue).toLowerCase() === 'true' || formValue === true;
                } else if (key === 'CHAT_SUMMARY_TIMES') {
                    if (typeof formValue === 'string') {
                        targetValue = formValue.split(',').map(t => t.trim()).filter(t => t);
                    } else if (!Array.isArray(formValue)) { // Se não for string nem array, usa o default
                        targetValue = DEFAULTS[key];
                    }
                }
                // Strings e outros tipos são atribuídos diretamente
                
                if (processedConfig[key] !== targetValue) {
                    processedConfig[key] = targetValue;
                    if (['SERVER_OPEN_TIME', 'SERVER_CLOSE_TIME', 'TIMEZONE', 'CHAT_SUMMARY_TIMES', 'DAYTIME_START_HOUR', 'DAYTIME_END_HOUR'].includes(key)) {
                        timeSettingsChanged = true;
                    }
                }
            }
        }
    }
    
    // Garante que todas as chaves de DEFAULTS estejam presentes, caso alguma tenha sido omitida no formulário
    // e não estivesse no currentConfig (improvável com a lógica acima, mas seguro).
    for (const key in DEFAULTS) {
        if (processedConfig[key] === undefined) {
            processedConfig[key] = DEFAULTS[key];
        }
    }

    currentConfig = processedConfig; // Atualiza o cache interno
    console.log("ConfigService: Configuração após merge e conversão (pronta para salvar):", JSON.stringify(currentConfig, null, 2));

    try {
        const db = await DatabaseService.getDb();
        const collection = db.collection(CONFIG_COLLECTION_NAME);
        
        // O objeto a ser salvo no $set não deve incluir _id
        const { _id, ...configToSetInDb } = currentConfig; 

        const result = await collection.updateOne(
            { _id: CONFIG_DOC_ID },
            { $set: configToSetInDb },
            { upsert: true }
        );
        console.log("ConfigService: Resultado da atualização no MongoDB:", JSON.stringify(result, null, 2));

        if (result.modifiedCount > 0 || result.upsertedCount > 0) {
            console.log("ConfigService: Configuração salva com sucesso no MongoDB.");
        } else if (result.matchedCount > 0 && result.modifiedCount === 0) {
            console.log("ConfigService: Configuração no MongoDB já estava atualizada (nenhuma alteração nos valores).");
        } else {
            console.warn("ConfigService: Configuração não foi salva no MongoDB (nem modificada, nem inserida). Verifique o filtro e os dados.");
        }
        
        if (onConfigChangeCallback) {
            // Notifica mesmo se não houve alteração no DB, pois a intenção de salvar existiu
            // e o estado em memória (currentConfig) foi atualizado.
            onConfigChangeCallback(currentConfig, timeSettingsChanged);
        }

    } catch (error) {
        console.error("ConfigService: Erro ao salvar configuração no MongoDB:", error);
        // Considerar reverter currentConfig para oldConfigSnapshot em caso de falha crítica no salvamento.
        // currentConfig = oldConfigSnapshot; // Exemplo de rollback em memória
    }
    return currentConfig;
}

function setOnConfigChange(callback) {
    onConfigChangeCallback = callback;
}

export default {
  loadConfig,
  saveConfig,
  getConfig,
  updateConfig,
  parseTime, // Exporting for convenience if needed elsewhere, though primarily internal
  setOnConfigChange
}; 