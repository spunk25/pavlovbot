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

// Função auxiliar para converter valor para o tipo esperado
function convertToType(value, targetType, defaultValue, keyName) {
    if (value === undefined || value === null) return defaultValue;

    if (targetType === 'number') {
        const num = parseInt(value, 10);
        return isNaN(num) ? defaultValue : num;
    }
    if (targetType === 'boolean') {
        return String(value).toLowerCase() === 'true';
    }
    if (keyName === 'CHAT_SUMMARY_TIMES') { // Caso especial para array de strings
        if (typeof value === 'string') {
            return value.split(',').map(t => t.trim()).filter(t => t);
        }
        if (Array.isArray(value)) {
            return value.map(t => String(t).trim()).filter(t => t);
        }
        return defaultValue;
    }
    return String(value); // Default to string
}

async function loadConfig() {
    console.log("ConfigService: Iniciando carregamento de configurações...");
    let loadedConfigFromDB = {};
    try {
        const db = await DatabaseService.getDb();
        const collection = db.collection(CONFIG_COLLECTION_NAME);
        const dbConfigDocument = await collection.findOne({ _id: CONFIG_DOC_ID });

        if (dbConfigDocument) {
            console.log("ConfigService: Configuração encontrada no MongoDB.");
            const { _id, ...configDataFromDb } = dbConfigDocument; // Exclui _id
            loadedConfigFromDB = configDataFromDb;
        } else {
            console.warn(`ConfigService: Nenhuma configuração encontrada no MongoDB para ID '${CONFIG_DOC_ID}'. Usando e salvando padrões.`);
            // Salva os DEFAULTS no DB se não existir configuração
            await collection.insertOne({ _id: CONFIG_DOC_ID, ...DEFAULTS });
            console.log("ConfigService: Configurações padrão salvas no MongoDB.");
            // currentConfig já está como DEFAULTS, então não precisa mudar
            console.log("ConfigService: Configuração final carregada (padrões):", JSON.stringify(currentConfig, null, 2));
            return currentConfig;
        }
    } catch (error) {
        console.error("ConfigService: Erro ao carregar configuração do MongoDB. Usando padrões em memória.", error);
        // Em caso de erro de leitura, currentConfig permanece como DEFAULTS
        console.log("ConfigService: Configuração final carregada (padrões devido a erro):", JSON.stringify(currentConfig, null, 2));
        return currentConfig;
    }

    // Merge DEFAULTS com o que foi carregado do DB, priorizando o DB.
    // E garante a conversão de tipos para todos os campos.
    const newEffectiveConfig = {};
    for (const key in DEFAULTS) {
        if (Object.prototype.hasOwnProperty.call(DEFAULTS, key)) {
            const dbValue = loadedConfigFromDB[key];
            const defaultValue = DEFAULTS[key];
            const targetType = typeof defaultValue;

            // Se o valor do DB existir, use-o (após conversão), senão use o default.
            newEffectiveConfig[key] = convertToType(
                dbValue !== undefined ? dbValue : defaultValue,
                targetType,
                defaultValue,
                key
            );
        }
    }
    currentConfig = newEffectiveConfig;
    console.log("ConfigService: Configuração final carregada (após merge DB e defaults):", JSON.stringify(currentConfig, null, 2));
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
    
    let timeSettingsChanged = false;
    const updatedConfigSnapshot = { ...currentConfig }; // Começa com a config atual (já processada)

    for (const key in DEFAULTS) { // Itera sobre as chaves conhecidas/esperadas
        if (Object.prototype.hasOwnProperty.call(DEFAULTS, key)) {
            if (Object.prototype.hasOwnProperty.call(newConfigDataFromForm, key)) { // Se o formulário enviou esta chave
                const formValue = newConfigDataFromForm[key];
                const defaultValue = DEFAULTS[key];
                const targetType = typeof defaultValue;
                
                const processedValue = convertToType(formValue, targetType, defaultValue, key);

                if (updatedConfigSnapshot[key] !== processedValue) {
                    updatedConfigSnapshot[key] = processedValue;
                    if (['SERVER_OPEN_TIME', 'SERVER_CLOSE_TIME', 'TIMEZONE', 'CHAT_SUMMARY_TIMES', 'DAYTIME_START_HOUR', 'DAYTIME_END_HOUR'].includes(key)) {
                        timeSettingsChanged = true;
                    }
                }
            }
            // Se a chave não veio do formulário, updatedConfigSnapshot[key] mantém seu valor atual (de currentConfig)
        }
    }

    currentConfig = updatedConfigSnapshot; // Atualiza o cache interno
    console.log("ConfigService: Configuração após merge e conversão (pronta para salvar):", JSON.stringify(currentConfig, null, 2));

    try {
        const db = await DatabaseService.getDb();
        const collection = db.collection(CONFIG_COLLECTION_NAME);
        
        // O objeto a ser salvo no $set não deve incluir _id
        const { _id, ...configToSetInDb } = currentConfig; 

        const result = await collection.updateOne(
            { _id: CONFIG_DOC_ID },
            { $set: configToSetInDb }, // Salva o currentConfig completo (sem _id)
            { upsert: true }
        );
        console.log("ConfigService: Resultado da atualização no MongoDB:", JSON.stringify(result, null, 2));

        if (result.modifiedCount > 0 || result.upsertedCount > 0) {
            console.log("ConfigService: Configuração salva com sucesso no MongoDB.");
        } else if (result.matchedCount > 0 && result.modifiedCount === 0) {
            console.log("ConfigService: Configuração no MongoDB já estava atualizada (nenhuma alteração nos valores).");
        } else {
            // Isso pode acontecer se o upsert falhar em criar o documento pela primeira vez e não houver match.
            console.warn("ConfigService: Configuração não foi salva no MongoDB (nem modificada, nem inserida). Verifique o filtro e os dados. Resultado:", result);
        }
        
        if (onConfigChangeCallback) {
            onConfigChangeCallback(currentConfig, timeSettingsChanged);
        }

    } catch (error) {
        console.error("ConfigService: Erro ao salvar configuração no MongoDB:", error);
        // Não reverta currentConfig aqui, pois a intenção do usuário era atualizar.
        // O erro de salvamento deve ser tratado (ex: notificar o usuário).
    }
    return currentConfig; // Retorna a configuração atualizada (mesmo que o salvamento falhe)
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