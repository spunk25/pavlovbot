import { MongoClient } from 'mongodb';

let client;
let db;

// Adicionando fallback para MONGODB_URI
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'pavlovBotDb'; // Default DB name if not in .env

async function connect() {
  if (!MONGODB_URI) {
    console.error("DatabaseService: MONGODB_URI não está definida ou o valor é inválido nas variáveis de ambiente.");
    throw new Error("MONGODB_URI não configurada corretamente.");
  }
  if (db) {
    console.warn("DatabaseService: Tentativa de conectar quando já conectado.");
    return db;
  }
  try {
    client = new MongoClient(MONGODB_URI, {
      // useNewUrlParser: true, // No longer needed in recent versions
      // useUnifiedTopology: true, // No longer needed in recent versions
    });
    await client.connect();
    db = client.db(DB_NAME);
    console.log(`DatabaseService: Conectado com sucesso ao MongoDB (DB: ${DB_NAME}).`);

    // Listar coleções existentes no banco de dados
    const collections = await db.listCollections().toArray();
    if (collections.length > 0) {
      console.log("DatabaseService: Coleções existentes no banco de dados:");
      collections.forEach(collection => {
        console.log(`  - ${collection.name}`);
      });
    } else {
      console.log("DatabaseService: Nenhuma coleção encontrada neste banco de dados ainda.");
    }

    return db;
  } catch (error) {
    console.error("DatabaseService: Erro ao conectar ao MongoDB:", error);
    throw error; // Re-throw para ser tratado pelo chamador (app.js)
  }
}

async function getDb() {
  if (!db) {
    console.warn("DatabaseService: Banco de dados não conectado. Tentando conectar...");
    // Poderia tentar reconectar aqui ou lançar um erro mais direto
    // Por simplicidade, vamos assumir que connect() foi chamado na inicialização.
    // Se a conexão cair, o ideal seria ter uma lógica de reconexão mais robusta.
    // throw new Error("DatabaseService: Conexão com o banco de dados não estabelecida. Chame connect() primeiro.");
    // Ou, para resiliência básica, tentar conectar:
    try {
        return await connect();
    } catch (e) {
        console.error("DatabaseService: Falha ao tentar reconectar em getDb().");
        throw new Error("DatabaseService: Conexão com o banco de dados não estabelecida e falha ao reconectar.");
    }
  }
  return db;
}

async function close() {
  if (client) {
    try {
      await client.close();
      console.log("DatabaseService: Conexão com MongoDB fechada.");
      client = null;
      db = null;
    } catch (error) {
      console.error("DatabaseService: Erro ao fechar a conexão com MongoDB:", error);
    }
  }
}

export default {
  connect,
  getDb,
  close
}; 