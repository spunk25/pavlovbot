import axios from 'axios';

let evolutionAPIClient;
let currentConfig;

function initialize(config) {
  currentConfig = config;
  createApiClient();
  console.log("EvolutionApiService: Cliente API Evolution inicializado/atualizado.");
}

// Função separada para criar o cliente da API com tratamento de erros
function createApiClient() {
  try {
    if (!currentConfig?.EVOLUTION_API_URL || !currentConfig?.EVOLUTION_API_KEY) {
      console.error("EvolutionApiService: URL da API ou chave API ausente. O cliente não pode ser inicializado corretamente.");
      return;
    }
    
    evolutionAPIClient = axios.create({
      baseURL: currentConfig.EVOLUTION_API_URL,
      headers: {
        'apikey': currentConfig.EVOLUTION_API_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 30000, // 30 segundos de timeout
    });
    
    // Adicionar interceptor para tratamento de erros global
    evolutionAPIClient.interceptors.response.use(
      response => response,
      error => {
        const errorInfo = {
          url: error.config?.url || 'unknown URL',
          method: error.config?.method || 'unknown method',
          status: error.response?.status || 'no status',
          data: error.response?.data || {},
          message: error.message || 'Unknown error'
        };
        
        // Log de erro mais detalhado
        console.error(`EvolutionApiService: Erro na requisição API ${errorInfo.method.toUpperCase()} para ${errorInfo.url}:`, 
          `Status: ${errorInfo.status}, Mensagem: ${errorInfo.message}`,
          errorInfo.data
        );
        
        return Promise.reject(error);
      }
    );
  } catch (error) {
    console.error("EvolutionApiService: Erro crítico ao criar cliente API", error);
  }
}

function updateApiClient(newConfig) {
  if (newConfig.EVOLUTION_API_URL && newConfig.EVOLUTION_API_KEY) {
    currentConfig.EVOLUTION_API_URL = newConfig.EVOLUTION_API_URL;
    currentConfig.EVOLUTION_API_KEY = newConfig.EVOLUTION_API_KEY;
    createApiClient(); // Usar a função refatorada
    console.log("EvolutionApiService: Cliente API Evolution reconfigurado.");
  }
}

// Função de utilidade para validar configurações antes de qualquer chamada de API
function validateApiConfig() {
  if (!evolutionAPIClient) {
    console.error("EvolutionApiService: Cliente API não inicializado.");
    return false;
  }
  
  if (!currentConfig || !currentConfig.EVOLUTION_API_URL || !currentConfig.EVOLUTION_API_KEY || !currentConfig.INSTANCE_NAME) {
    console.error("EvolutionApiService: Configuração da API incompleta.");
    return false;
  }
  
  return true;
}

async function sendMessageToGroup(message, recipientJid, options = {}) {
  if (!validateApiConfig()) {
    console.log("[DEBUG] sendMessageToGroup: falha na validação da API");
    return { success: false, error: "API não configurada para enviar mensagens" };
  }
  
  const targetJid = recipientJid || currentConfig.TARGET_GROUP_ID;
  console.log(`[DEBUG] sendMessageToGroup: tentando enviar para ${targetJid}`);
  console.log(`[DEBUG] sendMessageToGroup: mensagem = "${message?.substring(0, 50)}${message?.length > 50 ? '...' : ''}"`);
  
  if (!targetJid) {
    console.error(`[DEBUG] sendMessageToGroup: targetJid está indefinido ou vazio`);
    return { success: false, error: "ID do destinatário está indefinido ou vazio" };
  }
  
  try {
    console.log(`[DEBUG] sendMessageToGroup: chamando API no endpoint /message/sendText/${currentConfig.INSTANCE_NAME}`);
    
    const response = await evolutionAPIClient.post(`/message/sendText/${currentConfig.INSTANCE_NAME}`, {
      number: targetJid,
      text: message,
      ...options
    });
    
    console.log(`[DEBUG] sendMessageToGroup: resposta recebida, status=${response.status}`);
    console.log(`[DEBUG] sendMessageToGroup: dados da resposta:`, JSON.stringify(response.data, null, 2));
    
    return { success: true, data: response.data };
  } catch (error) {
    console.error(`EvolutionApiService: Erro ao enviar mensagem para ${targetJid}:`);
    
    if (error.response) {
      console.error(`[DEBUG] sendMessageToGroup: erro na resposta, status=${error.response.status}`);
      console.error(`[DEBUG] sendMessageToGroup: dados do erro:`, JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error(`[DEBUG] sendMessageToGroup: erro na requisição, sem resposta recebida`);
      console.error(`[DEBUG] sendMessageToGroup: requisição:`, error.request);
    } else {
      console.error(`[DEBUG] sendMessageToGroup: erro na configuração:`, error.message);
    }
    
    return { 
      success: false, 
      error: error.message, 
      details: error.response?.data,
      status: error.response?.status
    };
  }
}

async function sendNarratedAudio(audioUrlOrBase64, recipientJid, options = {}) {
  if (!validateApiConfig()) {
    return { success: false, error: "API não configurada para enviar áudio" };
  }
  
  const targetJid = recipientJid || currentConfig.TARGET_GROUP_ID;
  
  try {
    const response = await evolutionAPIClient.post(`/message/sendWhatsAppAudio/${currentConfig.INSTANCE_NAME}`, {
      number: targetJid,
      audio: audioUrlOrBase64,
      ...options
    });
    
    console.log(`EvolutionApiService: Áudio narrado enviado para ${targetJid}`);
    return { success: true, data: response.data };
  } catch (error) {
    console.error(`EvolutionApiService: Erro ao enviar áudio narrado para ${targetJid}:`, 
      error.response ? `Status: ${error.response.status}, Dados: ${JSON.stringify(error.response.data)}` : error.message);
    return { success: false, error: error.message, details: error.response?.data };
  }
}

async function sendPoll(title, values, recipientJid, selectableCount = 1) {
  if (!validateApiConfig()) {
    return { success: false, error: "API não configurada para enviar enquete" };
  }
  
  const targetJid = recipientJid || currentConfig.TARGET_GROUP_ID;
  
  try {
    const payload = {
      number: targetJid,
      name: title,
      values: values.map(v => ({ optionName: v })),
      selectableCount: selectableCount,
      delay: 1200,
      linkPreview: true,
    };

    if (currentConfig.POLL_MENTION_EVERYONE) {
      payload.mentionsEveryOne = true;
      console.log("EvolutionApiService: Enviando enquete com mentionsEveryOne=true.");
      
      try {
        const participants = await getGroupParticipants(targetJid);
        if (participants && participants.length > 0) {        
          payload.mentioned = participants.map(p => p.replace('@s.whatsapp.net', ''));
          console.log(`EvolutionApiService: Enviando enquete mencionando ${participants.length} participantes.`);
        }
      } catch (participantsError) {
        console.warn("EvolutionApiService: Erro ao buscar participantes para menção na enquete:", participantsError);
        // Continua enviando a enquete mesmo sem as menções
      }
    }

    const response = await evolutionAPIClient.post(
      `/message/sendPoll/${currentConfig.INSTANCE_NAME}`,
      payload
    );
    
    console.log(`EvolutionApiService: Enquete "${title}" enviada com sucesso para ${targetJid}:`, response.status);
    return { success: true, data: response.data };
  } catch (error) {
    console.error(`EvolutionApiService: Erro ao enviar enquete para ${targetJid}:`,
      error.response ? `Status: ${error.response.status}, Dados: ${JSON.stringify(error.response.data)}` : error.message
    );
    return { success: false, error: error.message, details: error.response?.data };
  }
}

async function setGroupName(newSubject, groupId) {
  if (!validateApiConfig()) {
    return { success: false, error: "API não configurada para alterar nome do grupo" };
  }
  
  const targetGroupId = groupId || currentConfig.TARGET_GROUP_ID;
  
  try {
    const response = await evolutionAPIClient.post(`/group/updateGroupSubject/${currentConfig.INSTANCE_NAME}`,
      { subject: newSubject },
      { params: { groupJid: targetGroupId } }
    );
    
    console.log(`EvolutionApiService: Nome do grupo ${targetGroupId} alterado para: ${newSubject}`);
    return { success: true, data: response.data };
  } catch (error) {
    console.error(`EvolutionApiService: Erro ao alterar nome do grupo ${targetGroupId}:`, 
      error.response ? `Status: ${error.response.status}, Dados: ${JSON.stringify(error.response.data)}` : error.message);
    return { success: false, error: error.message, details: error.response?.data };
  }
}

async function getGroupMetadata(groupId) {
  if (!validateApiConfig()) {
    return null;
  }
  
  const targetGroupId = groupId || currentConfig.TARGET_GROUP_ID;
  
  try {
    const response = await evolutionAPIClient.get(`/group/findGroupInfos/${currentConfig.INSTANCE_NAME}`, {
      params: { groupJid: targetGroupId }
    });
    
    if (response.data && (response.data.participants || (Array.isArray(response.data) && response.data[0]?.participants))) {
      if (response.data.participants) return response.data;
      if (Array.isArray(response.data) && response.data.length > 0 && response.data[0].participants) return response.data[0];
    }
    
    console.warn(`EvolutionApiService: findGroupInfos não retornou dados para ${targetGroupId}. Tentando fetchAllGroups...`);
    
    // Fallback para fetchAllGroups se findGroupInfos não retornou dados esperados
    try {
      const fallbackResponse = await evolutionAPIClient.get(`/group/fetchAllGroups/${currentConfig.INSTANCE_NAME}`, {
        params: { getParticipants: "true" }
      });
      
      if (fallbackResponse.data && Array.isArray(fallbackResponse.data)) {
        const group = fallbackResponse.data.find(g => g.id === targetGroupId || g.jid === targetGroupId);
        if (group && group.participants) {
          return group;
        }
      }
      
      console.error(`EvolutionApiService: Metadados não encontrados para o grupo ${targetGroupId} com ambos os métodos.`);
      return null;
    } catch (fallbackError) {
      console.error(`EvolutionApiService: Erro no método fallback para buscar metadados do grupo ${targetGroupId}:`, 
        fallbackError.response ? `Status: ${fallbackError.response.status}` : fallbackError.message);
      return null;
    }
  } catch (error) {
    console.error(`EvolutionApiService: Erro ao obter metadados do grupo ${targetGroupId}:`, 
      error.response ? `Status: ${error.response.status}` : error.message);
    return null;
  }
}

async function getGroupParticipants(groupId) {
  if (!validateApiConfig()) {
    return [];
  }
  
  const targetGroupId = groupId || currentConfig.TARGET_GROUP_ID;
  
  try {
    // First attempt: findGroupInfos (often more direct if groupJid is known)
    const groupInfo = await getGroupMetadata(targetGroupId); // Uses the refined getGroupMetadata
    if (groupInfo && groupInfo.participants) {
      return groupInfo.participants.map(p => p.id); // Returns array of JIDs
    }
    
    // Fallback or if getGroupMetadata itself uses fetchAllGroups, this might be redundant
    // but kept for robustness if getGroupMetadata changes.
    console.warn(`EvolutionApiService: Não foi possível obter participantes via getGroupMetadata para ${targetGroupId}. Tentando fetchAllGroups diretamente.`);
    
    const response = await evolutionAPIClient.get(`/group/fetchAllGroups/${currentConfig.INSTANCE_NAME}`);
    const groups = response.data;
    const targetGroup = groups.find(group => group.id === targetGroupId || group.id?.user === targetGroupId.split('@')[0]);

    if (targetGroup && targetGroup.participants) {
      return targetGroup.participants.map(p => p.id);
    }
    
    console.warn(`EvolutionApiService: Grupo ${targetGroupId} não encontrado ou sem participantes na resposta da API fetchAllGroups.`);
    return [];
  } catch (error) {
    console.error(`EvolutionApiService: Erro ao buscar participantes do grupo ${targetGroupId}:`, 
      error.response ? `Status: ${error.response.status}` : error.message);
    return [];
  }
}

async function isUserAdmin(groupId, userId) {
  if (!validateApiConfig()) {
    return false;
  }
  
  const targetGroupId = groupId || currentConfig.TARGET_GROUP_ID;
  
  try {
    const metadata = await getGroupMetadata(targetGroupId);
    if (metadata && metadata.participants) {
      const participant = metadata.participants.find(p => p.id === userId);
      return participant && (participant.admin === 'admin' || participant.admin === 'superadmin');
    }
    return false;
  } catch (error) {
    console.error(`EvolutionApiService: Erro ao verificar admin ${userId} no grupo ${targetGroupId}:`, 
      error.response ? `Status: ${error.response.status}` : error.message);
    return false;
  }
}

function isFromMe(messageData) {
  // messageData is the `data` object from `messages.upsert`
  // e.g. data.key.fromMe
  return messageData && messageData.key && messageData.key.fromMe;
}

/**
 * Busca as últimas N mensagens de um grupo usando o payload oficial.
 * A API pode retornar um lote de mensagens; filtramos as últimas N no lado do cliente.
 * @param {string} groupId O JID do grupo.
 * @param {number} count O número de mensagens a buscar (as mais recentes).
 * @returns {Promise<Array<{sender: string, text: string, timestamp: Date}>>} Um array de mensagens formatadas.
 */
async function getLatestGroupMessages(groupId, count = 20) {
  if (!validateApiConfig()) {
    return [];
  }
  
  const targetJid = groupId || currentConfig.TARGET_GROUP_ID;
  
  try {
    const requestBody = {
      where: {
        key: {
          remoteJid: targetJid
        }
      }
    };

    const response = await evolutionAPIClient.post(`/chat/findMessages/${currentConfig.INSTANCE_NAME}`, requestBody);

    // A API parece retornar um array diretamente no response.data, baseado no exemplo de fetch.
    if (response.data && Array.isArray(response.data)) {
      const allFetchedMessages = response.data
        .filter(msg => { // Filtrar mensagens que não são do bot e têm conteúdo de texto
          if (msg.key?.fromMe) return false; // Ignorar mensagens do próprio bot
          return msg.message?.conversation || msg.message?.extendedTextMessage?.text;
        })
        .map(msg => {
          const messageContent = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
          const senderJid = msg.key.participant || msg.participant; // Participante do grupo
          const senderName = msg.pushName || (senderJid ? senderJid.split('@')[0] : 'Unknown');
          
          // Timestamp, convertendo para objeto Date e formatando
          const timestamp = new Date(msg.messageTimestamp * 1000);

          return {
            sender: senderName,
            senderJid: senderJid,
            text: messageContent,
            timestamp: timestamp
          };
        });

      // Ordenar por timestamp (mais recentes primeiro) e pegar apenas o número solicitado
      return allFetchedMessages.sort((a, b) => b.timestamp - a.timestamp).slice(0, count);
    }

    console.warn(`EvolutionApiService: findMessages não retornou array para grupo ${targetJid}.`);
    return [];
  } catch (error) {
    console.error(`EvolutionApiService: Erro ao buscar mensagens do grupo ${targetJid}:`,
      error.response ? `Status: ${error.response.status}` : error.message);
    return [];
  }
}

/**
 * Obtém o nome real de um contato a partir do seu JID (número de telefone)
 * @param {string} jid - O JID do contato (ex: '5511999999999@s.whatsapp.net')
 * @returns {Promise<string>} - O nome do contato ou o número formatado se não encontrado
 */
async function getContactName(jid) {
  if (!validateApiConfig() || !jid) {
    return jid ? jid.split('@')[0] : "alguém";
  }
  
  try {
    console.log(`[DEBUG] getContactName: Tentando obter nome para JID: ${jid}`);
    const response = await evolutionAPIClient.get(`/contact/getContact/${currentConfig.INSTANCE_NAME}`, {
      params: { number: jid.split('@')[0] } // Enviar apenas a parte do número
    });
    
    console.log(`[DEBUG] getContactName: Resposta da API /contact/getContact:`, JSON.stringify(response.data, null, 2));

    if (response.data && response.data.pushName) {
      console.log(`[DEBUG] getContactName: pushName '${response.data.pushName}' encontrado via /contact/getContact.`);
      return response.data.pushName;
    }
    
    console.log(`[DEBUG] getContactName: pushName não encontrado via /contact/getContact. Tentando fallback via findMessages.`);
    // Se não conseguir pelo método direto, tenta através da API de mensagens
    // Muitas vezes o pushName é enviado nos eventos de mensagens
    try {
      const messageResponse = await evolutionAPIClient.post(`/chat/findMessages/${currentConfig.INSTANCE_NAME}`, {
        where: {
          key: {
            participant: jid
          }
        },
        limit: 1,
        // Ordenar por timestamp para obter a mensagem mais recente
        sort: {
          messageTimestamp: -1
        }
      });
      
      console.log(`[DEBUG] getContactName: Resposta da API /chat/findMessages:`, JSON.stringify(messageResponse.data, null, 2));

      if (messageResponse.data && Array.isArray(messageResponse.data) && messageResponse.data.length > 0) {
        const message = messageResponse.data[0];
        if (message.pushName) {
          console.log(`[DEBUG] getContactName: pushName '${message.pushName}' encontrado via /chat/findMessages.`);
          return message.pushName;
        }
      }
    } catch (msgError) {
      console.log(`EvolutionApiService: Não foi possível obter o nome do contato ${jid} via mensagens:`, msgError.message);
    }
    
    // Se não conseguir de nenhuma forma, retorna o número formatado
    const finalName = jid.split('@')[0];
    console.log(`[DEBUG] getContactName: Nenhum pushName encontrado. Retornando JID: ${finalName}`);
    return finalName;
  } catch (error) {
    console.log(`EvolutionApiService: Erro ao obter nome do contato ${jid}. Erro: ${error.message}`);
    const finalName = jid.split('@')[0];
    console.log(`[DEBUG] getContactName: Exceção ao obter contato. Retornando JID: ${finalName}`);
    return finalName;
  }
}

export default {
  initialize,
  updateApiClient,
  sendMessageToGroup,
  sendNarratedAudio,
  sendPoll,
  setGroupName,
  getGroupMetadata,
  getGroupParticipants,
  isUserAdmin,
  isFromMe,
  getLatestGroupMessages,
  getContactName
}; 