import axios from 'axios';

let evolutionAPIClient;
let currentConfig;

function initialize(config) {
  currentConfig = config;
  evolutionAPIClient = axios.create({
    baseURL: currentConfig.EVOLUTION_API_URL,
    headers: {
      'apikey': currentConfig.EVOLUTION_API_KEY,
      'Content-Type': 'application/json'
    }
  });
  console.log("EvolutionApiService: Cliente API Evolution inicializado/atualizado.");
}

function updateApiClient(newConfig) {
    if (newConfig.EVOLUTION_API_URL && newConfig.EVOLUTION_API_KEY) {
        currentConfig.EVOLUTION_API_URL = newConfig.EVOLUTION_API_URL;
        currentConfig.EVOLUTION_API_KEY = newConfig.EVOLUTION_API_KEY;
        // It's important that currentConfig is the shared config object from ConfigService
        // or this won't reflect globally if only a local copy is updated.
        // Assuming ConfigService's onConfigChange callback handles re-initialization.
         evolutionAPIClient = axios.create({
            baseURL: currentConfig.EVOLUTION_API_URL,
            headers: {
            'apikey': currentConfig.EVOLUTION_API_KEY,
            'Content-Type': 'application/json'
            }
        });
        console.log("EvolutionApiService: Cliente API Evolution reconfigurado.");
    }
}


async function sendMessageToGroup(message, recipientJid, options = {}) {
  if (!currentConfig || !currentConfig.EVOLUTION_API_URL || !currentConfig.EVOLUTION_API_KEY || !currentConfig.INSTANCE_NAME) {
    console.warn("EvolutionApiService: API não configurada para enviar mensagens.");
    return;
  }
  const targetJid = recipientJid || currentConfig.TARGET_GROUP_ID;
  try {
    await evolutionAPIClient.post(`/message/sendText/${currentConfig.INSTANCE_NAME}`, {
      number: targetJid,
      text: message,
      ...options
    });
    // console.log(`EvolutionApiService: Mensagem enviada para ${targetJid}`);
  } catch (error) {
    console.error(`EvolutionApiService: Erro ao enviar mensagem para ${targetJid}:`, error.response ? error.response.data : error.message);
  }
}

async function sendNarratedAudio(audioUrlOrBase64, recipientJid, options = {}) {
  if (!currentConfig || !currentConfig.EVOLUTION_API_URL || !currentConfig.EVOLUTION_API_KEY || !currentConfig.INSTANCE_NAME) {
    console.warn("EvolutionApiService: API não configurada para enviar áudio.");
    return;
  }
  const targetJid = recipientJid || currentConfig.TARGET_GROUP_ID;
  try {
    await evolutionAPIClient.post(`/message/sendWhatsAppAudio/${currentConfig.INSTANCE_NAME}`, {
      number: targetJid,
      audio: audioUrlOrBase64,
      ...options
    });
    console.log(`EvolutionApiService: Áudio narrado enviado para ${targetJid}`);
  } catch (error) {
    console.error(`EvolutionApiService: Erro ao enviar áudio narrado para ${targetJid}:`, error.response ? error.response.data : error.message);
  }
}

async function sendPoll(title, values, recipientJid, selectableCount = 1) {
  if (!currentConfig || !currentConfig.EVOLUTION_API_URL || !currentConfig.EVOLUTION_API_KEY || !currentConfig.INSTANCE_NAME) {
    console.warn("EvolutionApiService: API não configurada para enviar enquete.");
    return;
  }
  const targetJid = recipientJid || currentConfig.TARGET_GROUP_ID;
  try {
    const payload = {
      number: targetJid,
      name: title,
      values: values,
      selectableCount: selectableCount,
      delay: 1200,
      linkPreview: true,
    };

    if (currentConfig.POLL_MENTION_EVERYONE) {
      payload.mentionsEveryOne = true;
      console.log("EvolutionApiService: Enviando enquete com mentionsEveryOne=true.");
    } else if (targetJid.endsWith('@g.us')) {
      const participants = await getGroupParticipants(targetJid);
      if (participants && participants.length > 0) {
        payload.mentioned = participants;
        console.log(`EvolutionApiService: Enviando enquete mencionando ${participants.length} participantes.`);
      }
    }

    const response = await evolutionAPIClient.post(
      `/message/sendPoll/${currentConfig.INSTANCE_NAME}`,
      payload
    );
    console.log(`EvolutionApiService: Enquete "${title}" enviada com sucesso para ${targetJid}:`, response.status);
  } catch (error) {
    console.error(`EvolutionApiService: Erro ao enviar enquete para ${targetJid}:`,
      error.response ? JSON.stringify(error.response.data, null, 2) : error.message
    );
  }
}

async function setGroupName(newSubject, groupId) {
  if (!currentConfig || !currentConfig.EVOLUTION_API_URL || !currentConfig.EVOLUTION_API_KEY || !currentConfig.INSTANCE_NAME) {
    console.warn("EvolutionApiService: API não configurada para alterar nome do grupo.");
    return;
  }
  const targetGroupId = groupId || currentConfig.TARGET_GROUP_ID;
  try {
    await evolutionAPIClient.post(`/group/updateGroupSubject/${currentConfig.INSTANCE_NAME}`,
      { subject: newSubject },
      { params: { groupJid: targetGroupId } }
    );
    console.log(`EvolutionApiService: Nome do grupo ${targetGroupId} alterado para: ${newSubject}`);
  } catch (error) {
    console.error(`EvolutionApiService: Erro ao alterar nome do grupo ${targetGroupId}:`, error.response ? error.response.data : error.message);
  }
}

async function getGroupMetadata(groupId) {
  if (!currentConfig || !currentConfig.EVOLUTION_API_URL || !currentConfig.EVOLUTION_API_KEY || !currentConfig.INSTANCE_NAME) {
    console.warn("EvolutionApiService: API não configurada para buscar metadados.");
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
  } catch (error) {
    console.error(`EvolutionApiService: Erro ao obter metadados do grupo ${targetGroupId}:`, error.response ? error.response.data : error.message);
    return null;
  }
}

async function getGroupParticipants(groupId) {
  if (!currentConfig || !currentConfig.EVOLUTION_API_URL || !currentConfig.EVOLUTION_API_KEY || !currentConfig.INSTANCE_NAME) {
    console.warn("EvolutionApiService: API não configurada para buscar participantes.");
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
    console.error(`EvolutionApiService: Erro ao buscar participantes do grupo ${targetGroupId}:`, error.message);
    return [];
  }
}

async function isUserAdmin(groupId, userId) {
  if (!currentConfig || !currentConfig.EVOLUTION_API_URL || !currentConfig.EVOLUTION_API_KEY || !currentConfig.INSTANCE_NAME) {
    console.warn("EvolutionApiService: API não configurada para verificar admin.");
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
    console.error(`EvolutionApiService: Erro ao verificar admin ${userId} no grupo ${targetGroupId}:`, error);
    return false;
  }
}

function isFromMe(messageData) {
    // messageData is the `data` object from `messages.upsert`
    // e.g. data.key.fromMe
    return messageData && messageData.key && messageData.key.fromMe;
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
  isFromMe
}; 