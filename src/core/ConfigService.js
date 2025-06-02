import { parseTime } from '../utils/generalUtils.js';
import DatabaseService from './DatabaseService.js'; // New import

const envConfig = process.env;
const CONFIG_COLLECTION_NAME = 'configurations';
const CONFIG_DOC_ID = 'botConfig';

let botConfig = {
  EVOLUTION_API_URL: 'https://evo.audiozap.app',
  EVOLUTION_API_KEY: '',
  INSTANCE_NAME: '',
  TARGET_GROUP_ID: '',
  BOT_WEBHOOK_PORT: 8080,
  SERVER_OPEN_TIME: '19:00',
  SERVER_CLOSE_TIME: '23:59',
  GROUP_BASE_NAME: "BRASIL PAVLOV SND 6/24",
  MESSAGES_DURING_SERVER_OPEN: 4,
  MESSAGES_DURING_DAYTIME: 4,
  DAYTIME_START_HOUR: 8,
  DAYTIME_END_HOUR: 17,
  TIMEZONE: "America/Sao_Paulo",
  GROQ_API_KEY: '',
  BOT_PUBLIC_URL: '',
  CHAT_SUMMARY_TIMES: ["10:00", "16:00", "21:00"],
  CHAT_SUMMARY_COUNT_PER_DAY: 3,
  SEND_NO_SUMMARY_MESSAGE: false,
  POLL_MENTION_EVERYONE: true
};

let onConfigChangeCallback = () => {};

async function loadConfig() {
  const db = await DatabaseService.getDb();
  const collection = db.collection(CONFIG_COLLECTION_NAME);
  let dbConfig = await collection.findOne({ _id: CONFIG_DOC_ID });

  const initialDefaultConfig = { // Define the base structure and defaults
    EVOLUTION_API_URL: 'https://evo.audiozap.app',
    EVOLUTION_API_KEY: '',
    INSTANCE_NAME: '',
    TARGET_GROUP_ID: '',
    BOT_WEBHOOK_PORT: 8080,
    SERVER_OPEN_TIME: '19:00',
    SERVER_CLOSE_TIME: '23:59',
    GROUP_BASE_NAME: "BRASIL PAVLOV SND 6/24",
    MESSAGES_DURING_SERVER_OPEN: 4,
    MESSAGES_DURING_DAYTIME: 4,
    DAYTIME_START_HOUR: 8,
    DAYTIME_END_HOUR: 17,
    TIMEZONE: "America/Sao_Paulo",
    GROQ_API_KEY: '',
    BOT_PUBLIC_URL: '',
    CHAT_SUMMARY_TIMES: ["10:00", "16:00", "21:00"],
    CHAT_SUMMARY_COUNT_PER_DAY: 3,
    SEND_NO_SUMMARY_MESSAGE: false,
    POLL_MENTION_EVERYONE: true
  };

  if (!dbConfig) {
    console.warn(`ConfigService: No configuration found in DB for ID '${CONFIG_DOC_ID}'. Initializing with defaults and .env overrides.`);
    dbConfig = { ...initialDefaultConfig, _id: CONFIG_DOC_ID };
    // Apply .env overrides to this initial structure before saving
    for (const key in dbConfig) {
      if (envConfig[key] !== undefined) {
        // Special handling for CHAT_SUMMARY_TIMES from .env
        if (key === 'CHAT_SUMMARY_TIMES') {
          if (typeof envConfig[key] === 'string') {
            try {
              let parsedTimes = JSON.parse(envConfig[key]);
              if (Array.isArray(parsedTimes) && parsedTimes.every(t => typeof t === 'string' && t.match(/^\d{2}:\d{2}$/))) {
                dbConfig[key] = parsedTimes;
              } else { throw new Error("Not a valid JSON array of HH:MM strings"); }
            } catch (e) {
              const commaParsedTimes = envConfig[key].split(',').map(s => s.trim()).filter(s => s.match(/^\d{2}:\d{2}$/));
              if (commaParsedTimes.length > 0 || envConfig[key].trim() === "") { dbConfig[key] = commaParsedTimes; }
              else { console.warn(`CHAT_SUMMARY_TIMES from .env ("${envConfig[key]}") could not be parsed for initial config.`);}
            }
          } else if (Array.isArray(envConfig[key])) {
            dbConfig[key] = envConfig[key].filter(s => typeof s === 'string' && s.match(/^\d{2}:\d{2}$/));
          }
        } else if (typeof dbConfig[key] === 'boolean') {
          dbConfig[key] = (envConfig[key] === 'true' || envConfig[key] === '1');
        } else if (typeof dbConfig[key] === 'number') {
          dbConfig[key] = parseInt(envConfig[key], 10);
        } else {
          dbConfig[key] = envConfig[key];
        }
      }
    }
    await collection.insertOne(dbConfig); // Save the initial config to DB
    console.log("ConfigService: Initial configuration document created in MongoDB.");
  }

  // Merge DB config with .env overrides (env takes precedence for keys it defines)
  let tempConfig = { ...initialDefaultConfig, ...dbConfig }; // Start with defaults, layer DB, then .env

  for (const key in tempConfig) {
    if (envConfig[key] !== undefined) {
      if (key === 'CHAT_SUMMARY_TIMES') {
        // Same parsing logic as above for .env
        if (typeof envConfig[key] === 'string') {
            try {
              let parsedTimes = JSON.parse(envConfig[key]);
              if (Array.isArray(parsedTimes) && parsedTimes.every(t => typeof t === 'string' && t.match(/^\d{2}:\d{2}$/))) {
                tempConfig[key] = parsedTimes;
              } else { throw new Error("Not a valid JSON array of HH:MM strings"); }
            } catch (e) {
              const commaParsedTimes = envConfig[key].split(',').map(s => s.trim()).filter(s => s.match(/^\d{2}:\d{2}$/));
              if (commaParsedTimes.length > 0 || envConfig[key].trim() === "") { tempConfig[key] = commaParsedTimes; }
              else { console.warn(`CHAT_SUMMARY_TIMES from .env ("${envConfig[key]}") could not be parsed. Using value from DB or default.`); }
            }
          } else if (Array.isArray(envConfig[key])) {
            tempConfig[key] = envConfig[key].filter(s => typeof s === 'string' && s.match(/^\d{2}:\d{2}$/));
          }
      } else if (typeof tempConfig[key] === 'boolean') {
        tempConfig[key] = (envConfig[key] === 'true' || envConfig[key] === '1');
      } else if (typeof tempConfig[key] === 'number' && !isNaN(parseInt(envConfig[key],10))) {
        tempConfig[key] = parseInt(envConfig[key], 10);
      } else {
        tempConfig[key] = envConfig[key];
      }
    }
  }
  
  // Assign to the global botConfig object
  botConfig = { ...tempConfig };

  // Ensure types after all merges
  botConfig.BOT_WEBHOOK_PORT = parseInt(String(botConfig.BOT_WEBHOOK_PORT), 10) || 8080;
  botConfig.MESSAGES_DURING_SERVER_OPEN = parseInt(String(botConfig.MESSAGES_DURING_SERVER_OPEN), 10) || 0;
  botConfig.MESSAGES_DURING_DAYTIME = parseInt(String(botConfig.MESSAGES_DURING_DAYTIME), 10) || 0;
  botConfig.DAYTIME_START_HOUR = parseInt(String(botConfig.DAYTIME_START_HOUR), 10) || 0;
  botConfig.DAYTIME_END_HOUR = parseInt(String(botConfig.DAYTIME_END_HOUR), 10) || 0;
  botConfig.CHAT_SUMMARY_COUNT_PER_DAY = parseInt(String(botConfig.CHAT_SUMMARY_COUNT_PER_DAY), 10) || 1;
  botConfig.TIMEZONE = String(botConfig.TIMEZONE || "America/Sao_Paulo");
  botConfig.CHAT_SUMMARY_TIMES = Array.isArray(botConfig.CHAT_SUMMARY_TIMES) ? botConfig.CHAT_SUMMARY_TIMES.filter(t => typeof t === 'string' && t.match(/^\d{2}:\d{2}$/)) : [];
  botConfig.SEND_NO_SUMMARY_MESSAGE = typeof botConfig.SEND_NO_SUMMARY_MESSAGE === 'boolean' ? botConfig.SEND_NO_SUMMARY_MESSAGE : false;
  botConfig.POLL_MENTION_EVERYONE = typeof botConfig.POLL_MENTION_EVERYONE === 'boolean' ? botConfig.POLL_MENTION_EVERYONE : true;

  console.log("ConfigService: Configurations loaded and merged from DB and .env.");
  logCurrentConfig();
  onConfigChangeCallback(botConfig, false); // Initial load, assume no specific time settings changed that require immediate re-init beyond normal startup
}

function logCurrentConfig() {
  console.log("Configurações finais do bot:", {
    ...botConfig,
    EVOLUTION_API_KEY: botConfig.EVOLUTION_API_KEY ? '***' : '',
    GROQ_API_KEY: botConfig.GROQ_API_KEY ? '***' : '',
    TIMEZONE: botConfig.TIMEZONE,
    BOT_PUBLIC_URL: botConfig.BOT_PUBLIC_URL,
    CHAT_SUMMARY_TIMES: Array.isArray(botConfig.CHAT_SUMMARY_TIMES) ? botConfig.CHAT_SUMMARY_TIMES : [],
    CHAT_SUMMARY_COUNT_PER_DAY: botConfig.CHAT_SUMMARY_COUNT_PER_DAY,
    SEND_NO_SUMMARY_MESSAGE: botConfig.SEND_NO_SUMMARY_MESSAGE,
    POLL_MENTION_EVERYONE: botConfig.POLL_MENTION_EVERYONE
  });
}

async function saveConfig() {
  try {
    const db = await DatabaseService.getDb();
    const collection = db.collection(CONFIG_COLLECTION_NAME);

    // Prepare the config to save, excluding _id for the update operation's $set
    const { _id, ...configToSaveToDb } = botConfig; 

    // Only save non-env overridden values to DB, or values that are part of the base schema
    // This is tricky. For now, let's save the current state of botConfig that isn't directly from .env
    // OR, more simply, save all fields that are part of our defined `initialDefaultConfig` structure.
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
        if (botConfig[key] !== undefined) {
            // Do not save API keys to DB if they are coming from .env
            if ((key === 'EVOLUTION_API_KEY' || key === 'GROQ_API_KEY') && envConfig[key]) {
                continue; // Skip saving to DB if .env provides it
            }
            dbPayload[key] = botConfig[key];
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
  return { ...botConfig };
}

async function updateConfig(newConfigPartial) {
    let changed = false;
    let timeSettingsChanged = false;
    const allowedKeys = [
      "GROUP_BASE_NAME", "MESSAGES_DURING_SERVER_OPEN", "MESSAGES_DURING_DAYTIME",
      "DAYTIME_START_HOUR", "DAYTIME_END_HOUR", "SERVER_OPEN_TIME", "SERVER_CLOSE_TIME",
      "CHAT_SUMMARY_TIMES", "TARGET_GROUP_ID", "CHAT_SUMMARY_COUNT_PER_DAY",
      "SEND_NO_SUMMARY_MESSAGE", "POLL_MENTION_EVERYONE"
      // Add other keys that can be updated via admin panel if necessary
    ];

    for (const key of allowedKeys) {
        if (newConfigPartial[key] !== undefined) {
            if (JSON.stringify(botConfig[key]) !== JSON.stringify(newConfigPartial[key])) {
                changed = true;
                if (["DAYTIME_START_HOUR", "DAYTIME_END_HOUR", "SERVER_OPEN_TIME", "SERVER_CLOSE_TIME", "CHAT_SUMMARY_TIMES"].includes(key)) {
                    timeSettingsChanged = true;
                }
                if (["MESSAGES_DURING_SERVER_OPEN", "MESSAGES_DURING_DAYTIME", "DAYTIME_START_HOUR", "DAYTIME_END_HOUR", "CHAT_SUMMARY_COUNT_PER_DAY"].includes(key)) {
                    botConfig[key] = parseInt(newConfigPartial[key], 10);
                } else if (key === "CHAT_SUMMARY_TIMES") {
                    botConfig[key] = Array.isArray(newConfigPartial[key]) ? newConfigPartial[key].filter(t => typeof t === 'string' && t.match(/^\d{2}:\d{2}$/)) : [];
                } else if (key === "SEND_NO_SUMMARY_MESSAGE" || key === "POLL_MENTION_EVERYONE") {
                    botConfig[key] = typeof newConfigPartial[key] === 'boolean' ? newConfigPartial[key] : (newConfigPartial[key] === 'true');
                }
                else {
                    botConfig[key] = newConfigPartial[key];
                }
            }
        }
    }

    if (changed) {
        await saveConfig();
        console.log("ConfigService: Configuração atualizada e salva no MongoDB.");
        onConfigChangeCallback(botConfig, timeSettingsChanged);
    }
    return changed;
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